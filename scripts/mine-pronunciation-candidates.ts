/**
 * Plan 091 Unit 1 — mine pronunciation candidates from real data.
 *
 *   npm run mine:pronunciation [-- --limit 400]
 *
 * Two sources, because they answer different questions:
 *   1. The knowledge corpus (36k+ chunks) answers "what vocabulary does this DOMAIN use".
 *   2. Variety / CellarMaterial answer "what does THIS app actually say out loud".
 *
 * A term the assistant says every day outranks a term that appears in fifty papers but
 * never leaves the library, so app-sourced terms are marked and floated.
 *
 * READ-ONLY. Writes one artifact: docs/kb-eval/pronunciation-candidates.json.
 * This is the wide end of the funnel — the TTS->STT screen (Unit 2) decides what
 * actually needs a rule. Do NOT treat this output as a lexicon.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import {
  extractFromChunk,
  FOREIGN_SOURCE_KEYS,
  rankCandidates,
  type Candidate,
} from "./mine-pronunciation-terms";

const DEMO_TENANT = "org_demo_winery";
const CHUNK_BATCH = 2000;
const OUT_DIR = "docs/kb-eval";
const OUT_FILE = `${OUT_DIR}/pronunciation-candidates.json`;

function parseLimit(): number {
  const i = process.argv.indexOf("--limit");
  if (i === -1) return 400;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 400;
}

type Tally = Map<string, { docs: Set<string>; occurrences: number; reasons: Set<string> }>;

function record(tally: Tally, term: string, docId: string, reasons: Iterable<string>) {
  let entry = tally.get(term);
  if (!entry) {
    entry = { docs: new Set(), occurrences: 0, reasons: new Set() };
    tally.set(term, entry);
  }
  entry.docs.add(docId);
  entry.occurrences += 1;
  for (const r of reasons) entry.reasons.add(r);
}

/** Sweep the global knowledge corpus. KB tables carry no tenantId, so no RLS dance. */
async function mineCorpus(tally: Tally): Promise<{ chunks: number; docs: number }> {
  return runAsSystem(async (db) => {
    const total = await db.knowledgeChunk.count();

    // documentId -> is its PUBLISHER non-English. 9 of 25 sources are, and without
    // this the accented/proper-noun heuristics return ordinary French and Spanish.
    const docs = await db.knowledgeDocument.findMany({
      select: { id: true, source: { select: { key: true } } },
    });
    const foreignDocs = new Set(
      docs.filter((d) => FOREIGN_SOURCE_KEYS.has(d.source.key)).map((d) => d.id),
    );
    console.log(
      `  language gate: ${foreignDocs.size}/${docs.length} documents from non-English sources`,
    );

    let seen = 0;
    let cursor: string | null = null;
    const docIds = new Set<string>();

    for (;;) {
      const batch: { id: string; documentId: string; text: string }[] =
        await db.knowledgeChunk.findMany({
          select: { id: true, documentId: true, text: true },
          orderBy: { id: "asc" },
          take: CHUNK_BATCH,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
      if (batch.length === 0) break;

      for (const chunk of batch) {
        docIds.add(chunk.documentId);
        const foreignSource = foreignDocs.has(chunk.documentId);
        for (const [term, reasons] of extractFromChunk(chunk.text, { foreignSource })) {
          record(tally, term, chunk.documentId, reasons);
        }
      }

      seen += batch.length;
      cursor = batch[batch.length - 1].id;
      process.stdout.write(`\r  corpus: ${seen}/${total} chunks`);
    }
    process.stdout.write("\n");
    return { chunks: seen, docs: docIds.size };
  });
}

/** Vocabulary the app itself emits. Tenant-scoped, so this runs under Demo Winery. */
async function mineAppVocabulary(): Promise<Map<string, string[]>> {
  return runAsTenant(DEMO_TENANT, async () => {
    const out = new Map<string, string[]>();
    const add = (raw: string | null | undefined, source: string) => {
      const value = raw?.trim();
      if (!value || value.length < 3) return;
      const existing = out.get(value);
      if (existing) existing.push(source);
      else out.set(value, [source]);
    };

    const varieties = await prisma.variety.findMany({
      select: { name: true, clone: true, rootstock: true, nursery: true },
    });
    for (const v of varieties) {
      add(v.name, "Variety.name");
      add(v.clone, "Variety.clone");
      add(v.rootstock, "Variety.rootstock");
      add(v.nursery, "Variety.nursery");
    }

    const materials = await prisma.cellarMaterial.findMany({
      select: { name: true, genericName: true, brand: true, brandName: true, kind: true },
    });
    for (const m of materials) {
      add(m.name, `CellarMaterial.name(${m.kind})`);
      add(m.genericName, "CellarMaterial.genericName");
      add(m.brand, "CellarMaterial.brand");
      add(m.brandName, "CellarMaterial.brandName");
    }

    return out;
  });
}

async function main() {
  const limit = parseLimit();
  console.log("Mining pronunciation candidates (read-only)\n");

  const tally: Tally = new Map();
  const corpus = await mineCorpus(tally);
  console.log(`  corpus: ${corpus.chunks} chunks across ${corpus.docs} documents`);

  const appVocab = await mineAppVocabulary();
  console.log(`  app:    ${appVocab.size} distinct Variety/CellarMaterial strings\n`);

  const ranked = rankCandidates(tally);

  // App vocabulary is what the assistant SAYS. It is promoted regardless of how often
  // the literature happens to mention it — "EC-1118" is spoken daily and cited rarely.
  const appTerms: Candidate[] = [];
  for (const [term, sources] of appVocab) {
    const corpusHit = ranked.find((c) => c.term.toLowerCase() === term.toLowerCase());
    appTerms.push({
      term,
      docFrequency: corpusHit?.docFrequency ?? 0,
      occurrences: corpusHit?.occurrences ?? 0,
      reasons: ["app-vocabulary", ...sources],
    });
  }

  const appKeys = new Set(appTerms.map((c) => c.term.toLowerCase()));
  const corpusOnly = ranked.filter((c) => !appKeys.has(c.term.toLowerCase()));

  // STRATIFIED cap, not a flat top-N. The heuristics have wildly different noise
  // profiles: 'binomial' and 'scientific' are narrow and almost all signal, while
  // 'proper-noun' is a firehose of countries, institutions and author names. A flat
  // top-400 by document frequency is therefore ~all proper nouns, and the genuinely
  // useful Latin terms never make the cut. Quota each heuristic instead.
  const STRATA = ["binomial", "scientific", "accented", "proper-noun"] as const;
  const primaryReason = (c: Candidate): string =>
    STRATA.find((s) => c.reasons.includes(s)) ?? "proper-noun";

  const quota = Math.floor(limit / STRATA.length);
  const perStratum: Record<string, { kept: number; found: number }> = {};
  const keptCorpus: Candidate[] = [];
  for (const stratum of STRATA) {
    const pool = corpusOnly.filter((c) => primaryReason(c) === stratum);
    const take = pool.slice(0, quota);
    perStratum[stratum] = { kept: take.length, found: pool.length };
    keptCorpus.push(...take);
  }
  const droppedCorpus = corpusOnly.length - keptCorpus.length;
  const candidates = [...appTerms, ...keptCorpus];

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        corpus,
        limit,
        counts: {
          appVocabulary: appTerms.length,
          corpusCandidatesFound: corpusOnly.length,
          corpusCandidatesKept: keptCorpus.length,
          corpusCandidatesDropped: droppedCorpus,
          total: candidates.length,
        },
        perStratum,
        candidates,
      },
      null,
      2,
    ),
    "utf8",
  );

  // No silent caps. A truncated list that does not say it was truncated reads as
  // "we covered everything" when it did not.
  console.log("CANDIDATES");
  console.log(`  app vocabulary (always kept): ${appTerms.length}`);
  console.log(`  corpus candidates found:      ${corpusOnly.length}`);
  console.log(`  corpus candidates kept:       ${keptCorpus.length} (--limit ${limit})`);
  console.log(`  corpus candidates DROPPED:    ${droppedCorpus}`);
  console.log(`  total written:                ${candidates.length}`);
  console.log("\n  per heuristic (kept / found):");
  for (const [stratum, v] of Object.entries(perStratum)) {
    console.log(`    ${stratum.padEnd(12)} ${String(v.kept).padStart(4)} / ${v.found}`);
  }
  console.log(`\n  -> ${OUT_FILE}`);
  for (const stratum of ["binomial", "scientific", "accented", "proper-noun"]) {
    const sample = keptCorpus.filter((c) => (c.reasons.includes(stratum) ? true : false)).slice(0, 12);
    if (sample.length === 0) continue;
    console.log(`\nTop ${stratum}:`);
    for (const c of sample) {
      console.log(`  ${String(c.docFrequency).padStart(5)} docs  ${c.term}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSystem().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });
