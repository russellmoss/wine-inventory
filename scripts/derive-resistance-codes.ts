/**
 * Spray S2 Unit 9 — derive AI→FRAC assignments from Tier-1 EXTENSION sources and emit the coverage
 * report (the deliverable, not a byproduct).
 *
 *   npm run derive:resistance                # fetch sources, refresh the curated artifact, write DB
 *   npm run derive:resistance -- --dry-run   # report only, write nothing
 *   npm run derive:resistance -- --propose   # rewrite src/lib/pesticide/data/*.json from the sources
 *                                            # (a HUMAN then reviews the diff and commits it)
 *
 * No FRAC/HRAC/IRAC compilation is fetched or parsed — only UC IPM's grape Pest Management
 * Guidelines, which are already Tier-1 in our corpus, gated by TRUSTED_DOMAINS, and cited on every
 * row. The pages are fetched directly rather than read out of the chunked corpus copy because
 * chunking splits table cells (measured: it truncated iprodione's mode-of-action cell) — same
 * source, same citation, no chunk-boundary loss.
 *
 * Default (no --propose) is a REPLAY of the committed artifact: the JSON is the reviewed truth, the
 * fetch only re-verifies it and reports drift. That is what makes the monthly re-derivation a
 * DETECTOR rather than an unreviewed auto-update.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { fetchDocument } from "@/lib/knowledge/crawl/fetcher";
import { TRUSTED_DOMAIN_SET } from "@/lib/knowledge/config";
import {
  extractUcIpmRows,
  extractUcIpmBiologicalProposals,
  toAiAssignments,
  normalizeAiName,
  buildCoverageReport,
  resolutionOf,
  type Resolution,
  type SiteType,
} from "@/lib/pesticide/resistance-derive";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "pesticide", "data");
const isAllowedHost = (h: string) => TRUSTED_DOMAIN_SET.has(h.toLowerCase());

const SOURCES = [
  {
    url: "https://ipm.ucanr.edu/agriculture/grape/general-properties-of-fungicides-used-in-grapes",
    title: "General Properties of Fungicides Used in Grapes — UC IPM Grape Pest Management Guidelines",
    kind: "ai-keyed" as const,
  },
  {
    url: "https://ipm.ucanr.edu/agriculture/grape/fungicide-efficacybiologicals-annd-natural-products",
    title: "Fungicide Efficacy — Biologicals and Natural Products — UC IPM Grape Pest Management Guidelines",
    kind: "trade-name-keyed" as const,
  },
];

interface CuratedAssignment {
  subject: string;
  subjectKind: "ACTIVE_INGREDIENT";
  scheme: "FRAC";
  resolution: Resolution;
  codes: string[];
  siteType: SiteType;
  derivedFrom: "AI_KEYED_TABLE";
  sourceUrl: string;
  sourceTitle: string;
  sourceAsOf: string;
  reviewedBy: string;
  reviewedAt: string;
}

interface NormalizationEntry {
  apprilName: string;
  citedParent: string;
  reason: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceAsOf: string;
  reviewedBy: string;
  reviewedAt: string;
}

interface TradeNameEntry {
  tradeName: string;
  codes: string[];
  confirmed: boolean;
  epaRegNumber: string | null;
  sourceUrl: string;
  sourceTitle: string;
  sourceAsOf: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) as T;
}

const counters = {
  sourcesFetched: 0,
  extensionRows: 0,
  curatedAssignments: 0,
  driftFromSource: 0,
  aisInScope: 0,
  assignmentsWritten: 0,
  assignmentsUnchanged: 0,
  tradeNameProposals: 0,
  tradeNameConfirmed: 0,
  sourceConflicts: 0,
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const propose = process.argv.includes("--propose");
  const reviewer = process.env.PESTICIDE_REVIEWER ?? "russellmoss";
  const today = new Date().toISOString().slice(0, 10);

  // 1. Fetch the extension sources (host-gated, TRUSTED_DOMAINS).
  const fetched: { url: string; title: string; kind: (typeof SOURCES)[number]["kind"]; html: string; asOf: string }[] = [];
  for (const s of SOURCES) {
    const res = await fetchDocument(s.url, { isAllowedHost });
    if (res.notModified || !res.bytes) {
      console.log(`  ! ${s.url}: no body`);
      continue;
    }
    counters.sourcesFetched++;
    const html = res.bytes.toString("utf8");
    // "Text Updated: 07/24" is the page's own revision stamp.
    const stamp = /Text Updated:\s*(\d{2})\/(\d{2})/.exec(html.replace(/<[^>]*>/g, " "));
    const asOf = stamp ? `20${stamp[2]}-${stamp[1]}-01` : (res.lastModified ? new Date(res.lastModified).toISOString().slice(0, 10) : today);
    fetched.push({ url: s.url, title: s.title, kind: s.kind, html, asOf });
  }

  // 2. Extract proposals.
  const proposedAssignments: CuratedAssignment[] = [];
  const proposedTradeNames: TradeNameEntry[] = [];
  for (const f of fetched) {
    if (f.kind === "ai-keyed") {
      const rows = extractUcIpmRows(f.html);
      counters.extensionRows += rows.length;
      for (const a of toAiAssignments(rows)) {
        proposedAssignments.push({
          subject: a.aiName,
          subjectKind: "ACTIVE_INGREDIENT",
          scheme: "FRAC",
          resolution: resolutionOf(a),
          codes: a.codes,
          siteType: a.siteType,
          derivedFrom: "AI_KEYED_TABLE",
          sourceUrl: f.url,
          sourceTitle: f.title,
          sourceAsOf: f.asOf,
          reviewedBy: reviewer,
          reviewedAt: today,
        });
      }
    } else {
      for (const p of extractUcIpmBiologicalProposals(f.html)) {
        for (const tradeName of p.tradeNames) {
          // NEVER auto-applied (G6) — confirmed:false until a human maps it to a reg number.
          proposedTradeNames.push({
            tradeName,
            codes: p.codes,
            confirmed: false,
            epaRegNumber: null,
            sourceUrl: f.url,
            sourceTitle: f.title,
            sourceAsOf: f.asOf,
            reviewedBy: null,
            reviewedAt: null,
          });
        }
      }
    }
  }

  // Premix rows repeat their constituents (cyprodinil appears in three rows), so dedupe by AI name.
  // A CONFLICT — the same AI carrying different codes in two rows — is SURFACED, never silently
  // resolved: the first row wins and the disagreement is printed and counted.
  const dedupedAssignments: CuratedAssignment[] = [];
  {
    const byName = new Map<string, CuratedAssignment>();
    for (const a of proposedAssignments) {
      const k = normalizeAiName(a.subject);
      const prev = byName.get(k);
      if (!prev) {
        byName.set(k, a);
        dedupedAssignments.push(a);
      } else if (JSON.stringify(prev.codes) !== JSON.stringify(a.codes) || prev.siteType !== a.siteType) {
        counters.sourceConflicts++;
        console.log(`  ~ CONFLICT ${a.subject}: ${JSON.stringify(prev.codes)}/${prev.siteType} vs ${JSON.stringify(a.codes)}/${a.siteType} — keeping the first, surfaced not resolved`);
      }
    }
  }
  proposedAssignments.length = 0;
  proposedAssignments.push(...dedupedAssignments);

  if (propose) {
    const existingTrade = readJson<TradeNameEntry[]>("trade-name-map.json").filter((t) => t.confirmed);
    const merged = [
      ...existingTrade,
      ...proposedTradeNames.filter((p) => !existingTrade.some((e) => e.tradeName.toLowerCase() === p.tradeName.toLowerCase())),
    ];
    writeFileSync(join(DATA_DIR, "resistance-codes.json"), JSON.stringify(proposedAssignments, null, 2) + "\n");
    writeFileSync(join(DATA_DIR, "trade-name-map.json"), JSON.stringify(merged, null, 2) + "\n");
    console.log(`proposed: ${proposedAssignments.length} assignments, ${merged.length} trade names → ${DATA_DIR}`);
    console.log("REVIEW THE DIFF before committing — these artifacts are the reviewed truth.");
  }

  // 3. The committed artifacts are the truth; the fetch is a drift DETECTOR.
  const curated = readJson<CuratedAssignment[]>("resistance-codes.json");
  const normalization = readJson<NormalizationEntry[]>("ai-normalization.json");
  const tradeNames = readJson<TradeNameEntry[]>("trade-name-map.json");
  counters.curatedAssignments = curated.length;
  counters.tradeNameProposals = tradeNames.length;
  counters.tradeNameConfirmed = tradeNames.filter((t) => t.confirmed).length;

  const proposedByName = new Map(proposedAssignments.map((a) => [normalizeAiName(a.subject), a]));
  const driftDetail: string[] = [];
  for (const c of curated) {
    const p = proposedByName.get(normalizeAiName(c.subject));
    if (!p) {
      counters.driftFromSource++;
      driftDetail.push(`${c.subject}: no longer present in the source table`);
    } else if (JSON.stringify(p.codes) !== JSON.stringify(c.codes) || p.siteType !== c.siteType) {
      counters.driftFromSource++;
      driftDetail.push(`${c.subject}: source now ${JSON.stringify(p.codes)}/${p.siteType}, artifact has ${JSON.stringify(c.codes)}/${c.siteType}`);
    }
  }
  for (const d of driftDetail) console.log(`  ~ DRIFT ${d}`);

  const artifactSha = createHash("sha256").update(readFileSync(join(DATA_DIR, "resistance-codes.json"))).digest("hex");

  // 4. Apply to the DB + build the coverage report.
  const report = await runAsSystem(async (db) => {
    const revision = dryRun ? null : await db.pesticideDataRevision.create({ data: { status: "RUNNING", resistanceArtifactSha256: artifactSha } });

    const ais = await db.pesticideActiveIngredient.findMany({
      where: { products: { some: { product: { sourceStatus: "ACTIVE" } } } },
      select: { id: true, name: true, normalizedName: true, parentActiveIngredientId: true },
    });
    counters.aisInScope = ais.length;
    // FRAC codes fungicides only — the scoped denominator that makes the GAP number readable.
    // Filtered in JS, not with a `contains:` predicate: the Unit 11 boundary guard bans every fuzzy
    // matcher in this lane outright (K6), and a blanket rule with no exemptions is the point.
    const fungicideAiIds = new Set<string>();
    for (const p of await db.pesticideProduct.findMany({
      where: { sourceStatus: "ACTIVE" },
      select: { pestCategoryRaw: true, ingredients: { select: { activeIngredientId: true } } },
    })) {
      if (!p.pestCategoryRaw?.toLowerCase().includes("fungicide")) continue;
      for (const i of p.ingredients) fungicideAiIds.add(i.activeIngredientId);
    }

    const curatedByName = new Map(curated.map((c) => [normalizeAiName(c.subject), c]));
    const normByAppril = new Map(normalization.map((n) => [normalizeAiName(n.apprilName), n]));
    const aiIdByNormalized = new Map(ais.map((a) => [normalizeAiName(a.name), a.id]));

    const coverageInput: { name: string; resolution: Resolution; viaNormalization: boolean; inFungicideProduct: boolean }[] = [];
    const attachedSubjects = new Set<string>();

    for (const ai of ais) {
      const key = normalizeAiName(ai.name);
      let match = curatedByName.get(key);
      let viaNormalization = false;
      let parentId: string | null = null;
      if (!match) {
        // Curated salt/ester/copper collapse (G5) — cited, never a suffix-stripping regex (K5).
        const norm = normByAppril.get(key);
        if (norm) {
          match = curatedByName.get(normalizeAiName(norm.citedParent));
          viaNormalization = match != null;
          parentId = aiIdByNormalized.get(normalizeAiName(norm.citedParent)) ?? null;
        }
      }
      const resolution: Resolution = match ? match.resolution : "GAP";
      if (match) attachedSubjects.add(normalizeAiName(match.subject));
      coverageInput.push({ name: ai.name, resolution, viaNormalization, inFungicideProduct: fungicideAiIds.has(ai.id) });

      if (dryRun) continue;

      // Record the curated parent link (identity is untouched — assignment-time only).
      if (parentId && parentId !== ai.id && ai.parentActiveIngredientId !== parentId) {
        await db.pesticideActiveIngredient.update({ where: { id: ai.id }, data: { parentActiveIngredientId: parentId } });
      }

      const desired = {
        resolution,
        codes: match?.codes ?? [],
        siteType: (match?.siteType ?? "UNKNOWN") as SiteType,
        derivedFrom: "AI_KEYED_TABLE" as const,
        sourceUrl: match?.sourceUrl ?? null,
        sourceTitle: match?.sourceTitle ?? null,
        sourceAsOf: match ? new Date(match.sourceAsOf) : null,
        reviewedBy: match?.reviewedBy ?? null,
        reviewedAt: match ? new Date(match.reviewedAt) : null,
        revisionId: revision!.id,
      };
      const existing = await db.pesticideResistanceAssignment.findFirst({
        where: { subjectKind: "ACTIVE_INGREDIENT", activeIngredientId: ai.id, scheme: "FRAC" },
      });
      if (!existing) {
        await db.pesticideResistanceAssignment.create({
          data: { subjectKind: "ACTIVE_INGREDIENT", activeIngredientId: ai.id, scheme: "FRAC", ...desired },
        });
        counters.assignmentsWritten++;
      } else if (
        existing.resolution !== desired.resolution ||
        JSON.stringify(existing.codes) !== JSON.stringify(desired.codes) ||
        existing.siteType !== desired.siteType
      ) {
        await db.pesticideResistanceAssignment.update({ where: { id: existing.id }, data: desired });
        counters.assignmentsWritten++;
      } else {
        counters.assignmentsUnchanged++;
      }
    }

    const unattached = curated.filter((c) => !attachedSubjects.has(normalizeAiName(c.subject))).length;
    const coverage = buildCoverageReport(coverageInput, unattached);

    if (!dryRun && revision) {
      await db.pesticideDataRevision.update({
        where: { id: revision.id },
        // Cast through the JSON round-trip: Prisma's InputJsonValue wants an index signature and
        // CoverageReport is a closed interface (a nominal shape is the point of it).
        data: { status: "PUBLISHED", completedAt: new Date(), summary: JSON.parse(JSON.stringify({ ...counters, coverage, drift: driftDetail })) },
      });
    }
    return { coverage, gapAis: coverageInput.filter((c) => c.resolution === "GAP").map((c) => c.name) };
  });

  console.log(`\ncoverage: ${JSON.stringify(report.coverage, null, 1)}`);
  console.log(`::PESTICIDE_RESISTANCE_SUMMARY::${JSON.stringify({ ...counters, coverage: report.coverage, artifactSha256: artifactSha, dryRun })}`);
  await disconnectSystem();
}

main().catch(async (e) => {
  console.error(e);
  console.log(`::PESTICIDE_RESISTANCE_SUMMARY::${JSON.stringify({ ...counters, fatal: String(e instanceof Error ? e.message : e).slice(0, 200) })}`);
  await disconnectSystem().catch(() => {});
  process.exitCode = 1;
});
