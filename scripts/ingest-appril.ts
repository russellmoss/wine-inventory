/**
 * Spray S2 Unit 4 — idempotent APPRIL ingest with mark-and-sweep (K14, council C2/C8).
 *
 *   npm run ingest:appril                       # download the live dump, ingest, sweep, publish
 *   npm run ingest:appril -- --dry-run          # parse + count only, write nothing
 *   npm run ingest:appril -- --file <path>      # use an already-downloaded .xlsx (no network)
 *   npm run ingest:appril -- --jsonl <path>     # rows from JSONL (fixtures / verify harness)
 *   PESTICIDE_MAX_ROWS=500 ...                  # bounded smoke (caps ingested grape products)
 *
 * Scope: rows with ≥1 grape CROP site (isGrapeCropSite — Grape-Ivy/Grapefruit/Oregongrape rejected)
 * AND STATUS_GROUP === "Active". A product that leaves that set (cancellation OR removal from the
 * dump) is never seen by the run and the sweep flips it to WITHDRAWN_FROM_SOURCE — retained, never
 * deleted (audit trail); it stops answering "registered". Reads resolve against PUBLISHED revisions
 * only: a run with hard failures ends FAILED and publishes nothing (C8). A row whose reg number
 * fails to parse is counted and reported, never guessed at (K6).
 */
import { unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { fetchBulkFile } from "@/lib/pesticide/bulk-fetch";
import { parseApprilRow, type ApprilRecord, type ApprilSite } from "@/lib/pesticide/appril-parse";
import { parseRegistrationNumber } from "@/lib/pesticide/reg-number";
import { streamSheetRows } from "./pesticide-xlsx-stream";

const APPRIL_URL = "https://www3.epa.gov/pesticides/appril/apprildatadump_public.xlsx";

const counters = {
  rowsScanned: 0,
  grapeRowsSeen: 0,
  activeGrapeRows: 0,
  productsCreated: 0,
  productsUpdated: 0,
  productsUnchanged: 0,
  productsWithdrawn: 0,
  productsReactivated: 0,
  malformedRegNum: 0,
  unsupportedRegFormat: 0,
  aisErrors: 0,
  aisCreated: 0,
  sitesCreated: 0,
  sitesRemoved: 0,
  ingredientLinksCreated: 0,
  ingredientLinksRemoved: 0,
  recordErrors: 0,
  rowsSkippedNoName: 0,
  capped: 0,
};

function normalizeAiName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

type Db = PrismaClient;

interface ProductCache {
  id: string;
  productName: string;
  companyName: string | null;
  registrationStatus: string | null;
  labelDate: Date | null;
  labelNames: string[];
  pestCategoryRaw: string | null;
  sourceStatus: string;
  sites: Map<string, { id: string; isGrape: boolean; siteModifier: string }>;
  ingredients: Map<string, { percent: string | null }>; // key: activeIngredientId
}

async function ingestOne(
  db: Db,
  canonical: string,
  record: ApprilRecord,
  grapeSites: ApprilSite[],
  revisionId: string,
  products: Map<string, ProductCache>,
  aiByPcCode: Map<string, string>,
): Promise<void> {
  // Dedupe within the row: a SITES cell can repeat a site string and an AIS cell can repeat an AI
  // (measured — 7 dump rows), and a nested create would trip the composite uniques.
  grapeSites = [...new Map(grapeSites.map((s) => [s.siteNameRaw, s])).values()];
  const seenAiIds = new Set<string>();

  // Ensure AI rows first (name VERBATIM — normalization never rewrites identity, K5/G5).
  const ingredientIds: { aiId: string; percent: number | null }[] = [];
  for (const ai of record.ais) {
    let aiId = aiByPcCode.get(ai.pcCode);
    if (!aiId) {
      const created = await db.pesticideActiveIngredient.create({
        data: {
          pcCode: ai.pcCode,
          casNumber: ai.casNumber,
          name: ai.name,
          normalizedName: normalizeAiName(ai.name),
          lastSeenRevisionId: revisionId,
        },
      });
      aiId = created.id;
      aiByPcCode.set(ai.pcCode, aiId);
      counters.aisCreated++;
    }
    if (!seenAiIds.has(aiId)) {
      seenAiIds.add(aiId);
      ingredientIds.push({ aiId, percent: ai.percent });
    }
  }

  const existing = products.get(canonical);
  const desired = {
    productName: record.productName,
    companyName: record.companyName,
    registrationStatus: record.statusRaw,
    labelDate: record.labelDate,
    labelNames: record.labelNames,
    pestCategoryRaw: record.pestCategoryRaw,
  };

  let productId: string;
  if (!existing) {
    const created = await db.pesticideProduct.create({
      data: {
        epaRegNumber: canonical,
        ...desired,
        sourceStatus: "ACTIVE",
        lastSeenRevisionId: revisionId,
        siteRegistrations: {
          create: grapeSites.map((s) => ({
            siteNameRaw: s.siteNameRaw,
            isGrape: true,
            siteModifier: s.siteModifier,
            lastSeenRevisionId: revisionId,
          })),
        },
        ingredients: {
          create: ingredientIds.map((i) => ({ activeIngredientId: i.aiId, percent: i.percent })),
        },
      },
    });
    productId = created.id;
    // Register in the cache — the dump can carry the same canonical number on more than one row
    // (leading-zero variants collapse; measured 7 duplicates 2026-07-26); the later row must take
    // the idempotent update path, not a second create against the partial unique.
    products.set(canonical, {
      id: productId,
      ...desired,
      sourceStatus: "ACTIVE",
      sites: new Map(grapeSites.map((s) => [s.siteNameRaw, { id: "", isGrape: true, siteModifier: s.siteModifier }])),
      ingredients: new Map(ingredientIds.map((i) => [i.aiId, { percent: i.percent?.toString() ?? null }])),
    });
    counters.productsCreated++;
    counters.sitesCreated += grapeSites.length;
    counters.ingredientLinksCreated += ingredientIds.length;
    return;
  }

  productId = existing.id;
  const changed =
    existing.productName !== desired.productName ||
    existing.companyName !== desired.companyName ||
    existing.registrationStatus !== desired.registrationStatus ||
    (existing.labelDate?.getTime() ?? null) !== (desired.labelDate?.getTime() ?? null) ||
    JSON.stringify(existing.labelNames) !== JSON.stringify(desired.labelNames) ||
    existing.pestCategoryRaw !== desired.pestCategoryRaw ||
    existing.sourceStatus !== "ACTIVE";

  if (changed) {
    if (existing.sourceStatus !== "ACTIVE") counters.productsReactivated++;
    await db.pesticideProduct.update({
      where: { id: productId },
      data: { ...desired, sourceStatus: "ACTIVE", lastSeenRevisionId: revisionId },
    });
    counters.productsUpdated++;
  } else {
    counters.productsUnchanged++;
  }

  // Sites: per-product replace of the GRAPE projection. A site dropped from the label is deleted —
  // a lingering stale "registered on grapes" row is a fail-open, and the audit trail is the
  // product row + revision summary, not child projections.
  const desiredSites = new Map(grapeSites.map((s) => [s.siteNameRaw, s]));
  for (const siteName of existing.sites.keys()) {
    if (!desiredSites.has(siteName)) {
      await db.pesticideSiteRegistration.delete({
        where: { productId_siteNameRaw: { productId, siteNameRaw: siteName } },
      });
      existing.sites.delete(siteName);
      counters.sitesRemoved++;
    }
  }
  for (const [siteName, s] of desiredSites) {
    const have = existing.sites.get(siteName);
    if (!have) {
      await db.pesticideSiteRegistration.create({
        data: {
          productId,
          siteNameRaw: s.siteNameRaw,
          isGrape: true,
          siteModifier: s.siteModifier,
          lastSeenRevisionId: revisionId,
        },
      });
      existing.sites.set(siteName, { id: "", isGrape: true, siteModifier: s.siteModifier });
      counters.sitesCreated++;
    } else if (have.siteModifier !== s.siteModifier) {
      await db.pesticideSiteRegistration.update({
        where: { productId_siteNameRaw: { productId, siteNameRaw: siteName } },
        data: { siteModifier: s.siteModifier, lastSeenRevisionId: revisionId },
      });
      have.siteModifier = s.siteModifier;
    }
  }

  // Ingredient links: same replace semantics.
  const desiredIngredients = new Map(ingredientIds.map((i) => [i.aiId, i]));
  for (const aiId of existing.ingredients.keys()) {
    if (!desiredIngredients.has(aiId)) {
      await db.pesticideProductIngredient.delete({
        where: { productId_activeIngredientId: { productId, activeIngredientId: aiId } },
      });
      counters.ingredientLinksRemoved++;
    }
  }
  for (const [aiId, ing] of desiredIngredients) {
    if (!existing.ingredients.has(aiId)) {
      await db.pesticideProductIngredient.create({
        data: { productId, activeIngredientId: aiId, percent: ing.percent },
      });
      counters.ingredientLinksCreated++;
    }
  }
}

async function* jsonlRows(path: string): AsyncGenerator<Record<string, string>> {
  const rl = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (t.length > 0) yield JSON.parse(t) as Record<string, string>;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const fileArg = process.argv.indexOf("--file");
  const jsonlArg = process.argv.indexOf("--jsonl");
  const maxRows = Number(process.env.PESTICIDE_MAX_ROWS) || Infinity;

  let hardFailure = false;

  await runAsSystem(async (db) => {
    // 1. Acquire the dump.
    let xlsxPath: string | null = null;
    let jsonlPath: string | null = null;
    let apprilAsOf: Date | null = null;
    let downloadedTmp: string | null = null;

    if (jsonlArg > -1) {
      jsonlPath = process.argv[jsonlArg + 1];
      if (!jsonlPath) throw new Error("--jsonl requires a path");
    } else if (fileArg > -1) {
      xlsxPath = process.argv[fileArg + 1];
      if (!xlsxPath) throw new Error("--file requires a path");
    } else {
      downloadedTmp = join(tmpdir(), `appril-${Date.now()}.xlsx`);
      const fetched = await fetchBulkFile(APPRIL_URL, { destPath: downloadedTmp });
      if (!fetched.ok) {
        // 404 is a coverage signal — the source moved. Never retried here; surfaces in the summary.
        throw new Error(`APPRIL fetch failed: ${fetched.reason} (status ${"status" in fetched ? fetched.status : "?"})`);
      }
      xlsxPath = fetched.path;
      apprilAsOf = fetched.lastModified;
      console.log(`downloaded ${fetched.bytes} bytes, Last-Modified ${apprilAsOf?.toISOString() ?? "unknown"}`);
    }

    // 2. Open a RUNNING revision (real runs only).
    const revision = dryRun
      ? null
      : await db.pesticideDataRevision.create({ data: { status: "RUNNING", apprilAsOf } });

    // 3. Preload current state (partial-unique keys are not Prisma uniques — diff in memory, K6
    //    exact-match on the canonical string only).
    const products = new Map<string, ProductCache>();
    if (!dryRun) {
      const rows = await db.pesticideProduct.findMany({
        where: { epaRegNumber: { not: null } },
        include: { siteRegistrations: true, ingredients: true },
      });
      for (const p of rows) {
        products.set(p.epaRegNumber!, {
          id: p.id,
          productName: p.productName,
          companyName: p.companyName,
          registrationStatus: p.registrationStatus,
          labelDate: p.labelDate,
          labelNames: p.labelNames,
          pestCategoryRaw: p.pestCategoryRaw,
          sourceStatus: p.sourceStatus,
          sites: new Map(p.siteRegistrations.map((s) => [s.siteNameRaw, { id: s.id, isGrape: s.isGrape, siteModifier: s.siteModifier }])),
          ingredients: new Map(p.ingredients.map((i) => [i.activeIngredientId, { percent: i.percent?.toString() ?? null }])),
        });
      }
    }
    const aiByPcCode = new Map<string, string>();
    if (!dryRun) {
      for (const ai of await db.pesticideActiveIngredient.findMany({ where: { pcCode: { not: null } } })) {
        aiByPcCode.set(ai.pcCode!, ai.id);
      }
    }

    const seenCanonical = new Set<string>();

    const handleRow = async (row: Record<string, string>) => {
      counters.rowsScanned++;
      if (!/grape/i.test(row.SITES ?? "")) return;
      const parsed = parseApprilRow(row);
      if (!parsed.ok) {
        // A nameless row is a measured property of the dump (thousands of Inactive rows carry no
        // PRODUCT_NAME and no ABNS) — counted + logged only when Active, never a run-failing error.
        if (parsed.error.startsWith("missing PRODUCT_NAME")) {
          counters.rowsSkippedNoName++;
          if ((row.STATUS_GROUP ?? "") === "Active") console.log(`  ! skipped nameless ACTIVE row: ${parsed.error.slice(0, 120)}`);
          return;
        }
        counters.recordErrors++;
        console.log(`  ! row ${counters.rowsScanned}: ${parsed.error.slice(0, 120)}`);
        return;
      }
      const grapeSites = parsed.record.sites.filter((s) => s.isGrape);
      if (grapeSites.length === 0) return;
      counters.grapeRowsSeen++;
      if (parsed.record.statusGroup !== "Active") return;
      counters.activeGrapeRows++;
      if (counters.activeGrapeRows > maxRows) {
        counters.capped++;
        return;
      }
      const reg = parseRegistrationNumber(parsed.record.regNumRaw);
      if (!reg.ok) {
        counters.malformedRegNum++;
        console.log(`  ! malformed reg number: ${parsed.record.regNumRaw.slice(0, 40)} (${parsed.record.productName.slice(0, 60)})`);
        return;
      }
      if (reg.format !== "EPA_FEDERAL") {
        counters.unsupportedRegFormat++;
        return;
      }
      counters.aisErrors += parsed.record.aisErrors.length;
      for (const e of parsed.record.aisErrors) console.log(`  ! ${reg.canonical}: ${e.slice(0, 120)}`);
      seenCanonical.add(reg.canonical);
      if (dryRun) return;
      try {
        await ingestOne(db, reg.canonical, parsed.record, grapeSites, revision!.id, products, aiByPcCode);
      } catch (e) {
        counters.recordErrors++;
        hardFailure = true; // a DB write failure is a hard failure — the run must not publish (C8)
        console.log(`  ! ingest ${reg.canonical}: ${e instanceof Error ? e.message.replace(/\s+/g, " ").slice(0, 200) : e}`);
      }
    };

    try {
      if (jsonlPath) {
        for await (const row of jsonlRows(jsonlPath)) await handleRow(row);
      } else {
        await streamSheetRows(xlsxPath!, handleRow);
      }
    } catch (e) {
      hardFailure = true;
      console.log(`  ! stream failed: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
    } finally {
      if (downloadedTmp) await unlink(downloadedTmp).catch(() => undefined);
    }

    // 4. Sweep + publish — only a clean, uncapped, real run may do either (K14/C8).
    if (!dryRun && revision) {
      if (!hardFailure && counters.capped === 0) {
        const stampProducts = await db.pesticideProduct.updateMany({
          where: { epaRegNumber: { in: [...seenCanonical] } },
          data: { lastSeenRevisionId: revision.id },
        });
        void stampProducts;
        const swept = await db.pesticideProduct.updateMany({
          where: {
            epaRegNumber: { notIn: [...seenCanonical], not: null },
            sourceStatus: "ACTIVE",
          },
          data: { sourceStatus: "WITHDRAWN_FROM_SOURCE" },
        });
        counters.productsWithdrawn = swept.count;
        await db.pesticideDataRevision.update({
          where: { id: revision.id },
          data: { status: "PUBLISHED", completedAt: new Date(), summary: counters },
        });
      } else {
        await db.pesticideDataRevision.update({
          where: { id: revision.id },
          data: { status: "FAILED", completedAt: new Date(), summary: counters },
        });
      }
    }
  });

  console.log(`::PESTICIDE_INGEST_SUMMARY::${JSON.stringify({ ...counters, dryRun, failed: hardFailure })}`);
  await disconnectSystem();
  if (hardFailure) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  console.log(`::PESTICIDE_INGEST_SUMMARY::${JSON.stringify({ ...counters, fatal: String(e instanceof Error ? e.message : e).slice(0, 200) })}`);
  await disconnectSystem().catch(() => {});
  process.exitCode = 1;
});
