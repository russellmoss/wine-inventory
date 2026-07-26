/**
 * Spray S2 Unit 6 — CA DPR state-registration ingest (the one jurisdiction S2 can answer).
 *
 *   npm run ingest:cdpr                    # download the three .dat files, ingest, publish
 *   npm run ingest:cdpr -- --dry-run       # parse + count only, write nothing
 *   npm run ingest:cdpr -- --dir <path>    # use already-downloaded product.dat/prod_site.dat/site.dat
 *
 * Semantics (K12/K14/C8):
 *  - A product's CA liveness is product.dat PRODSTAT_IND — prod_site's site status alone LIES for
 *    dead products (see cdpr-parse.ts, the plan-086 trap).
 *  - Aggregation is per EPA number: several CDPR prodnos can map to one EPA number (Fusilade has
 *    three); the EPA number is REGISTERED if ANY active prodno carries an active grape site row.
 *  - Every ACTIVE product in OUR table gets an explicit CA row: REGISTERED (one row per grape site
 *    code) or NOT_REGISTERED (absent from CDPR / no active grape site) — "absent" and "unresolvable"
 *    are different values, never merged (K12): rows we could not parse land in UNKNOWN for the EPA
 *    numbers they might have covered… which we cannot know, so parse failures are COUNTED and the
 *    run FAILS (publishes nothing) above a small tolerance rather than guessing.
 *  - CDPR rows lacking an EPA number (adjuvants, 25(b): LABEL_SEQ ≥ 50000) are counted + reported,
 *    not ingested — S2b owns them (G4 schema room already exists).
 *  - State rows are a per-product PROJECTION: replace semantics on the (productId, state, siteCode)
 *    unique; the audit spine is the product table + revision summary.
 */
import { createInterface } from "node:readline";
import { createReadStream, statSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { fetchBulkFile } from "@/lib/pesticide/bulk-fetch";
import {
  parseProductLine,
  parseProdSiteLine,
  CDPR_GRAPE_SITE_CODES,
} from "@/lib/pesticide/cdpr-parse";
import { parseRegistrationNumber } from "@/lib/pesticide/reg-number";

const CDPR_BASE = "https://files.cdpr.ca.gov/pub/outgoing/product";
const PARSE_FAILURE_TOLERANCE = 50; // above this the dump changed shape — fail, do not publish

const counters = {
  productLines: 0,
  prodSiteLines: 0,
  cdprActiveProducts: 0,
  cdprCaOnlyDeferred: 0,
  parseFailures: 0,
  epaNumbersWithActiveGrape: 0,
  dbProductsMatched: 0,
  dbProductsNotInCdpr: 0,
  stateRowsWritten: 0,
  stateRowsRemoved: 0,
  unmatchedCdprEpaNumbers: 0,
};

async function eachLine(path: string, fn: (line: string) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(path, "latin1"), crlfDelay: Infinity });
  for await (const line of rl) fn(line.replace(/\r$/, ""));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dirArg = process.argv.indexOf("--dir");
  let hardFailure = false;

  await runAsSystem(async (db) => {
    // 1. Acquire the three files.
    let dir: string;
    let cdprAsOf: Date | null = null;
    const downloaded: string[] = [];
    if (dirArg > -1) {
      dir = process.argv[dirArg + 1];
      if (!dir) throw new Error("--dir requires a path");
      // Locally-cached .dat files still carry a real source date — their mtime (see ingest-appril).
      cdprAsOf = statSync(join(dir, "product.dat")).mtime;
    } else {
      dir = tmpdir();
      for (const f of ["product.dat", "prod_site.dat", "site.dat"]) {
        const dest = join(dir, f);
        const res = await fetchBulkFile(`${CDPR_BASE}/${f}`, { destPath: dest });
        if (!res.ok) throw new Error(`CDPR fetch failed for ${f}: ${res.reason}`);
        downloaded.push(dest);
        if (f === "product.dat") cdprAsOf = res.lastModified;
      }
    }

    const revision = dryRun ? null : await db.pesticideDataRevision.create({ data: { status: "RUNNING", cdprAsOf } });

    try {
      // 2. product.dat → prodno → { epa canonical | ca-only, isActive }.
      const byProdno = new Map<number, { canonical: string | null; isActive: boolean }>();
      await eachLine(join(dir, "product.dat"), (line) => {
        if (line.trim().length === 0) return;
        counters.productLines++;
        const p = parseProductLine(line);
        if (!p.ok) {
          counters.parseFailures++;
          if (counters.parseFailures <= 5) console.log(`  ! ${p.error}`);
          return;
        }
        if (p.registration.kind === "ca-state-only") {
          counters.cdprCaOnlyDeferred++;
          byProdno.set(p.prodno, { canonical: null, isActive: p.isActive });
          return;
        }
        const reg = parseRegistrationNumber(p.registration.regNumberRaw);
        if (!reg.ok || reg.format !== "EPA_FEDERAL") {
          counters.parseFailures++;
          if (counters.parseFailures <= 5) console.log(`  ! unparseable EPA number from CDPR: ${p.registration.regNumberRaw}`);
          return;
        }
        if (p.isActive) counters.cdprActiveProducts++;
        byProdno.set(p.prodno, { canonical: reg.canonical, isActive: p.isActive });
      });

      // 3. prod_site.dat → per-EPA aggregation of ACTIVE products' ACTIVE grape sites.
      const grapeSitesByEpa = new Map<string, Set<number>>();
      await eachLine(join(dir, "prod_site.dat"), (line) => {
        if (line.trim().length === 0) return;
        counters.prodSiteLines++;
        const s = parseProdSiteLine(line);
        if (!s.ok) {
          counters.parseFailures++;
          return;
        }
        if (!s.siteActive || !CDPR_GRAPE_SITE_CODES.has(s.siteCode)) return;
        const prod = byProdno.get(s.prodno);
        // Site status alone LIES — only an ACTIVE product's active site row counts (the trap).
        if (!prod || !prod.isActive || prod.canonical == null) return;
        let set = grapeSitesByEpa.get(prod.canonical);
        if (!set) grapeSitesByEpa.set(prod.canonical, (set = new Set()));
        set.add(s.siteCode);
      });
      counters.epaNumbersWithActiveGrape = grapeSitesByEpa.size;

      if (counters.parseFailures > PARSE_FAILURE_TOLERANCE) {
        throw new Error(`CDPR parse failures (${counters.parseFailures}) exceed tolerance — dump changed shape; refusing to publish`);
      }

      // 4. Project onto OUR products: every ACTIVE APPRIL product gets an explicit CA row set.
      const ourProducts = await db.pesticideProduct.findMany({
        where: { epaRegNumber: { not: null }, sourceStatus: "ACTIVE" },
        select: { id: true, epaRegNumber: true, stateRegistrations: { where: { state: "CA" } } },
      });

      for (const p of ourProducts) {
        const grapeSites = grapeSitesByEpa.get(p.epaRegNumber!);
        if (grapeSites) {
          counters.dbProductsMatched++;
          grapeSitesByEpa.delete(p.epaRegNumber!);
        } else {
          counters.dbProductsNotInCdpr++;
        }
        if (dryRun) continue;

        const desired = new Map<string, "REGISTERED" | "NOT_REGISTERED">();
        if (grapeSites && grapeSites.size > 0) {
          for (const code of grapeSites) desired.set(String(code), "REGISTERED");
        } else {
          desired.set("", "NOT_REGISTERED"); // absent from CDPR, or present with no active grape site
        }

        try {
          for (const row of p.stateRegistrations) {
            if (!desired.has(row.siteCode)) {
              await db.pesticideStateRegistration.delete({ where: { id: row.id } });
              counters.stateRowsRemoved++;
            }
          }
          for (const [siteCode, status] of desired) {
            const have = p.stateRegistrations.find((r) => r.siteCode === siteCode);
            if (!have) {
              await db.pesticideStateRegistration.create({
                data: { productId: p.id, state: "CA", status, siteCode, lastSeenRevisionId: revision!.id },
              });
              counters.stateRowsWritten++;
            } else if (have.status !== status) {
              await db.pesticideStateRegistration.update({
                where: { id: have.id },
                data: { status, lastSeenRevisionId: revision!.id },
              });
              counters.stateRowsWritten++;
            }
          }
        } catch (e) {
          hardFailure = true;
          console.log(`  ! state rows for ${p.epaRegNumber}: ${e instanceof Error ? e.message.replace(/\s+/g, " ").slice(0, 160) : e}`);
        }
      }
      // EPA numbers CDPR registers on grapes that WE don't carry (inactive federally, or non-grape
      // in APPRIL) — a coverage fact worth reporting, never guessed into the table.
      counters.unmatchedCdprEpaNumbers = grapeSitesByEpa.size;
    } catch (e) {
      hardFailure = true;
      console.log(`  ! ${e instanceof Error ? e.message.replace(/\s+/g, " ").slice(0, 200) : e}`);
    } finally {
      for (const f of downloaded) await unlink(f).catch(() => undefined);
    }

    if (!dryRun && revision) {
      await db.pesticideDataRevision.update({
        where: { id: revision.id },
        data: { status: hardFailure ? "FAILED" : "PUBLISHED", completedAt: new Date(), summary: counters },
      });
    }
  });

  console.log(`::PESTICIDE_CDPR_SUMMARY::${JSON.stringify({ ...counters, dryRun, failed: hardFailure })}`);
  await disconnectSystem();
  if (hardFailure) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  console.log(`::PESTICIDE_CDPR_SUMMARY::${JSON.stringify({ ...counters, fatal: String(e instanceof Error ? e.message : e).slice(0, 200) })}`);
  await disconnectSystem().catch(() => {});
  process.exitCode = 1;
});
