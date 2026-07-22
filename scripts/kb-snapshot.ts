/**
 * Plan 090 Unit 1 — ranked retrieval snapshot.
 *
 *   npm run kb:snapshot           # capture -> docs/kb-eval/snapshot.json (overwrites)
 *   npm run kb:snapshot -- --diff # capture in memory, diff against the committed snapshot, print
 *
 * WHY. `verify:knowledge-base` asserts "the expected document is in top-k and the expected facts
 * appear". That is a floor, and it is blind to most of the result set: on its own PASSING YAN control
 * case, 4 of 8 returned passages are junk (an AWRI copyright-notice page, an OWRI announcement about a
 * website, an off-topic VT passage on phenolic spectral analysis). None of that is visible to a gate
 * that only asks whether one expected URL is present.
 *
 * This captures the WHOLE ranked list for every eval query and commits it, so any change to ingest,
 * chunking, or scoring produces an exact before/after diff. Retrieval is deterministic (pgvector
 * cosine + ts_rank, no sampling), so a movement in that diff is signal, not variance. That property is
 * the reason the primary artifact is NOT LLM-judged: the assistant LLM eval produced 9-12 failures
 * across runs on IDENTICAL code (plan 088), and a single run of 6 was misread as an improvement.
 *
 * NOT A CI GATE this round — evidence for a human, deliberately. A movement is not automatically a
 * regression: verify-knowledge-base.ts:61-66 records UC IPM displacing MAPA/PNW as retrieval getting
 * BETTER. Gating on "nothing moved" would freeze the corpus.
 *
 * REQUIRES the live corpus + an embedding key, so run it from the MAIN checkout
 * (`.claude/worktrees/*` has no .env). Read-only against the database: it embeds each query and
 * SELECTs. It performs no crawl and writes nothing to the corpus.
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { prisma } from "@/lib/prisma";
import { allSnapshotQueries } from "./kb-eval-cases";
import { diffSnapshots, formatDiff, type Snapshot, type SnapshotResult } from "./kb-snapshot-diff";

const TENANT = "org_demo_winery";
const SNAPSHOT_PATH = path.join("docs", "kb-eval", "snapshot.json");

/**
 * Deliberately WIDER than the gate's topK=6. The junk this artifact exists to expose sits at ranks 5-8,
 * and a passage sitting just below the cut is exactly what a chunking change promotes or demotes. Six
 * would hide the movement that matters most.
 */
const SNAPSHOT_TOP_K = 8;

function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

async function capture(): Promise<Snapshot> {
  const entries = [];
  for (const q of allSnapshotQueries()) {
    const passages = await retrieveKnowledge({ tenantId: TENANT, query: q, topK: SNAPSHOT_TOP_K });
    const results: SnapshotResult[] = passages.map((p, i) => ({
      rank: i + 1,
      publisher: p.publisher,
      tier: p.tier,
      canonicalUrl: p.canonicalUrl,
      // sectionPath and textHash are recorded for HUMAN reading only. Neither is identity — both change
      // by construction when the chunker is fixed. See kb-snapshot-diff.ts documentProfile().
      sectionPath: p.sectionPath,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString().slice(0, 10) : null,
      dateSource: p.dateSource,
      textHash: shortHash(p.text),
    }));
    entries.push({ query: q, results });
    process.stdout.write(`  ${results.length}/${SNAPSHOT_TOP_K}  ${q.slice(0, 62)}\n`);
  }
  return { capturedAt: new Date().toISOString(), entries };
}

function readCommitted(): Snapshot | null {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Snapshot;
}

async function main() {
  const wantDiff = process.argv.includes("--diff");
  console.log(`KB ranked snapshot — tenant ${TENANT}, topK ${SNAPSHOT_TOP_K}\n`);

  const current = await capture();
  const emptyQueries = current.entries.filter((e) => e.results.length === 0).map((e) => e.query);

  if (wantDiff) {
    const committed = readCommitted();
    if (!committed) {
      console.error(`\nNo committed snapshot at ${SNAPSHOT_PATH} — run without --diff to capture a baseline first.`);
      process.exitCode = 1;
    } else {
      console.log(`\n=== diff vs ${SNAPSHOT_PATH} (captured ${committed.capturedAt ?? "unknown"}) ===`);
      console.log(formatDiff(diffSnapshots(committed, current)));
    }
  } else {
    mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    // Trailing newline + 2-space indent: this file is reviewed as a git diff, so it must be readable.
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(current, null, 2) + "\n", "utf8");
    console.log(`\nwrote ${SNAPSHOT_PATH} — ${current.entries.length} queries`);
  }

  // A query returning nothing is almost always the fail-closed subscription path (retrieve.ts:78
  // returns [] when no sources are enabled), NOT a corpus hole. Say so rather than letting a run of
  // empty result sets read as a clean snapshot.
  if (emptyQueries.length) {
    console.log(`\n⚠️  ${emptyQueries.length} quer${emptyQueries.length === 1 ? "y" : "ies"} returned ZERO passages.`);
    console.log("   Check enabled sources for this tenant before reading anything into it (fail-closed).");
    for (const q of emptyQueries) console.log(`   · ${q}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
