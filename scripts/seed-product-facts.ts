/**
 * Spray S2b Unit 2 — seed-product-facts. REPLAY by default (KD-8): re-derive the database from the
 * committed, human-reviewed `src/lib/pesticide/data/product-facts.json` (+ `separation-rules.json`).
 * The JSON is the reviewed truth; this script only ever verifies and re-applies it — that is what
 * makes the monthly re-review cadence (Unit 9) a DETECTOR, never an unreviewed auto-update.
 *
 *   npm run seed:product-facts                  # REPLAY: seed the DB from the committed artifact
 *   npm run seed:product-facts -- --dry-run     # parse + validate + report only, writes nothing
 *   npm run seed:product-facts -- --propose     # regenerate product-facts.json PHI/REI PROPOSALS
 *                                                # from CDPR's prod_site.dat (downloads the files)
 *   npm run seed:product-facts -- --propose --dir <path>   # use already-downloaded .dat files
 *
 * --propose NEVER touches the database and NEVER overwrites an existing artifact row (reviewed or
 * not) — it only ADDS a proposal for an (epaRegNumber, REGULATORY) pair the artifact doesn't already
 * have. A human then reviews the diff and signs the rows they accept (rule §3.1: the label is the
 * law and we are not it — DPR's product database is DPR's TRANSCRIPTION of a label, not the label).
 */
import { readFileSync, writeFileSync, createReadStream, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { fetchBulkFile } from "@/lib/pesticide/bulk-fetch";
import { parseProductLine, parseProdSiteLine, CDPR_GRAPE_SITE_CODES } from "@/lib/pesticide/cdpr-parse";
import { parseRegistrationNumber } from "@/lib/pesticide/reg-number";
import { rollUpGrapeSiteIntervals, type GrapeSiteInterval } from "@/lib/pesticide/product-facts-derive";
import { validateArtifact, type ProductFactsArtifactRow } from "@/lib/pesticide/product-facts-artifact";
import { TRUSTED_DOMAIN_SET } from "@/lib/knowledge/config";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "pesticide", "data");
const ARTIFACT_PATH = join(DATA_DIR, "product-facts.json");
const SEPARATION_PATH = join(DATA_DIR, "separation-rules.json");
const CDPR_BASE = "https://files.cdpr.ca.gov/pub/outgoing/product";
const REVIEW_INTERVAL_DAYS = 90;
const PARSE_FAILURE_TOLERANCE = 50;

function loadArtifact(): ProductFactsArtifactRow[] {
  return JSON.parse(readFileSync(ARTIFACT_PATH, "utf8")) as ProductFactsArtifactRow[];
}

function loadSeparationRules(): unknown[] {
  return JSON.parse(readFileSync(SEPARATION_PATH, "utf8")) as unknown[];
}

async function eachLine(path: string, fn: (line: string) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(path, "latin1"), crlfDelay: Infinity });
  for await (const line of rl) fn(line.replace(/\r$/, ""));
}

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── --propose: regenerate PHI/REI proposals from CDPR's prod_site.dat ──────────────────────────

async function propose(dirArg: string | null): Promise<void> {
  let dir: string;
  let sourceAsOf: Date;
  if (dirArg) {
    dir = dirArg;
    sourceAsOf = statSync(join(dir, "product.dat")).mtime;
  } else {
    dir = tmpdir();
    sourceAsOf = new Date();
    for (const f of ["product.dat", "prod_site.dat"]) {
      const res = await fetchBulkFile(`${CDPR_BASE}/${f}`, { destPath: join(dir, f) });
      if (!res.ok) throw new Error(`CDPR fetch failed for ${f}: ${res.reason}`);
      if (f === "product.dat" && res.lastModified) sourceAsOf = res.lastModified;
    }
  }

  // 1. product.dat -> prodno -> canonical EPA number (ACTIVE products only; S2's status-column trap).
  let parseFailures = 0;
  const byProdno = new Map<number, { canonical: string; isActive: boolean }>();
  await eachLine(join(dir, "product.dat"), (line) => {
    if (line.trim().length === 0) return;
    const p = parseProductLine(line);
    if (!p.ok || p.registration.kind !== "epa") return;
    const reg = parseRegistrationNumber(p.registration.regNumberRaw);
    if (!reg.ok || reg.format !== "EPA_FEDERAL") {
      parseFailures++;
      return;
    }
    byProdno.set(p.prodno, { canonical: reg.canonical, isActive: p.isActive });
  });

  // 2. prod_site.dat -> per-EPA-number grape site intervals (ACTIVE product + ACTIVE grape site only).
  const intervalsByEpa = new Map<string, GrapeSiteInterval[]>();
  await eachLine(join(dir, "prod_site.dat"), (line) => {
    if (line.trim().length === 0) return;
    const s = parseProdSiteLine(line);
    if (!s.ok) {
      parseFailures++;
      return;
    }
    if (!s.siteActive || !CDPR_GRAPE_SITE_CODES.has(s.siteCode)) return;
    const prod = byProdno.get(s.prodno);
    if (!prod || !prod.isActive) return;
    const list = intervalsByEpa.get(prod.canonical) ?? [];
    list.push({ siteCode: s.siteCode, phiDays: s.phiDays, reiHours: s.reiHours });
    intervalsByEpa.set(prod.canonical, list);
  });

  if (parseFailures > PARSE_FAILURE_TOLERANCE) {
    throw new Error(`CDPR parse failures (${parseFailures}) exceed tolerance — dump changed shape; refusing to propose`);
  }

  // 3. Merge proposals into the artifact — ADD ONLY. An existing (epaRegNumber, REGULATORY) row,
  // reviewed or not, is never touched: a human may already be mid-review of it.
  const artifact = loadArtifact();
  const existing = new Set(artifact.filter((r) => r.factGroup === "REGULATORY").map((r) => r.epaRegNumber));
  const asOfStr = sourceAsOf.toISOString().slice(0, 10);
  const reviewDueAt = addDays(sourceAsOf, REVIEW_INTERVAL_DAYS);
  let proposed = 0;
  let conflicts = 0;

  for (const [epaRegNumber, rows] of intervalsByEpa) {
    if (existing.has(epaRegNumber)) continue;
    const rolled = rollUpGrapeSiteIntervals(rows);
    if (rolled.phiDays == null && rolled.reiHours == null) continue; // nothing recorded — not worth a row
    const notes: string[] = [];
    if (rolled.phiConflict || rolled.reiConflict) {
      notes.push(
        `CDPR grape site rows disagree (${rolled.phiConflict ? "PHI" : ""}${rolled.phiConflict && rolled.reiConflict ? "+" : ""}${rolled.reiConflict ? "REI" : ""}) — most-restrictive-recorded value taken; VERIFY against the actual label before signing.`,
      );
    }
    // A bare 0 must be explainable as reviewed, not a silent default (rule §3.6) — this note is
    // what makes a GENUINE recorded zero (probe: 739 such rows, unit-keyed, not a blank) distinct
    // from an unexplained one; the artifact-discipline test enforces the note exists either way.
    if (rolled.phiDays === 0) notes.push("CDPR recorded a 0-day PHI (unit-keyed, not a blank) — apply-up-to-harvest; VERIFY against the label.");
    artifact.push({
      epaRegNumber,
      factGroup: "REGULATORY",
      labelVersionKey: asOfStr,
      sourceUrl: `${CDPR_BASE}/prod_site.dat`,
      sourceTitle: "CA DPR product-site pre-harvest and re-entry intervals",
      sourceAsOf: asOfStr,
      reviewedBy: null,
      reviewedAt: null,
      reviewDueAt,
      reviewNote: notes.length ? notes.join(" ") : null,
      worstCasePhiDays: rolled.phiDays,
      worstCaseReiHours: rolled.reiHours,
    });
    proposed++;
    if (rolled.phiConflict || rolled.reiConflict) conflicts++;
  }

  artifact.sort((a, b) => (a.epaRegNumber === b.epaRegNumber ? a.factGroup.localeCompare(b.factGroup) : a.epaRegNumber.localeCompare(b.epaRegNumber)));
  const violations = validateArtifact(artifact, TRUSTED_DOMAIN_SET);
  if (violations.length > 0) {
    throw new Error(`--propose produced an invalid artifact, refusing to write:\n${violations.join("\n")}`);
  }
  writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`::PRODUCT_FACTS_PROPOSE:: proposed=${proposed} conflicts=${conflicts} parseFailures=${parseFailures} totalArtifactRows=${artifact.length}`);
  console.log(`Review the diff on ${ARTIFACT_PATH} before committing — every new row has reviewedBy: null.`);
}

// ── default: REPLAY the committed artifact into the database ──────────────────────────────────

async function replay(dryRun: boolean): Promise<void> {
  const artifact = loadArtifact();
  const violations = validateArtifact(artifact, TRUSTED_DOMAIN_SET);
  if (violations.length > 0) {
    console.error("product-facts.json failed discipline validation — refusing to seed:");
    for (const v of violations) console.error(`  ✗ ${v}`);
    process.exitCode = 1;
    return;
  }
  const separationRules = loadSeparationRules();

  console.log(`::PRODUCT_FACTS_SEED:: artifactRows=${artifact.length} separationRules=${separationRules.length}`);
  if (dryRun) {
    console.log("(--dry-run: writing nothing)");
    return;
  }

  const artifactSha256 = createHash("sha256").update(readFileSync(ARTIFACT_PATH)).digest("hex");
  let written = 0;
  let superseded = 0;
  let skippedCurrent = 0;

  await runAsSystem(async (db) => {
    const revision = await db.pesticideDataRevision.create({ data: { status: "RUNNING" } });
    try {
      for (const row of artifact) {
        const active = await db.pesticideProductFacts.findFirst({
          where: { epaRegNumber: row.epaRegNumber, factGroup: row.factGroup, supersededAt: null },
        });
        if (active && active.labelVersionKey === row.labelVersionKey) {
          skippedCurrent++;
          continue;
        }
        if (active) {
          await db.pesticideProductFacts.update({ where: { id: active.id }, data: { supersededAt: new Date() } });
          superseded++;
        }
        await db.pesticideProductFacts.create({
          data: {
            epaRegNumber: row.epaRegNumber,
            factGroup: row.factGroup,
            labelVersionKey: row.labelVersionKey,
            worstCasePhiDays: row.worstCasePhiDays ?? null,
            worstCaseReiHours: row.worstCaseReiHours ?? null,
            minRepeatIntervalDays: row.minRepeatIntervalDays ?? null,
            maxApplicationsPerSeason: row.maxApplicationsPerSeason ?? null,
            maxAiPerSeasonAmount: row.maxAiPerSeasonAmount ?? null,
            maxAiPerSeasonUnit: row.maxAiPerSeasonUnit ?? null,
            requiresBulletinCheck: row.requiresBulletinCheck ?? null,
            adjuvantRequirement: row.adjuvantRequirement ?? null,
            rainfastHours: row.rainfastHours ?? null,
            mobilityClass: row.mobilityClass ?? null,
            agronomicClass: row.agronomicClass ?? [],
            sourceUrl: row.sourceUrl,
            sourceTitle: row.sourceTitle,
            sourceAsOf: new Date(row.sourceAsOf),
            reviewedBy: row.reviewedBy,
            reviewedAt: row.reviewedAt ? new Date(row.reviewedAt) : null,
            reviewDueAt: new Date(row.reviewDueAt),
            reviewNote: row.reviewNote ?? null,
            revisionId: revision.id,
          },
        });
        written++;
      }

      await db.pesticideDataRevision.update({
        where: { id: revision.id },
        data: {
          status: "PUBLISHED",
          completedAt: new Date(),
          summary: { written, superseded, skippedCurrent, artifactSha256, separationRulesCount: separationRules.length },
        },
      });
    } catch (e) {
      await db.pesticideDataRevision.update({ where: { id: revision.id }, data: { status: "FAILED", completedAt: new Date() } });
      throw e;
    }
  });

  console.log(`::PRODUCT_FACTS_SEED_DONE:: written=${written} superseded=${superseded} skippedCurrent=${skippedCurrent} sha256=${artifactSha256.slice(0, 12)}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const doPropose = process.argv.includes("--propose");
  const dirArg = process.argv.indexOf("--dir");
  const dir = dirArg > -1 ? process.argv[dirArg + 1] : null;

  if (doPropose) {
    await propose(dir);
    return;
  }
  await replay(dryRun);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => disconnectSystem());
