/**
 * Retrieval-displacement gate — catches a new source quietly taking top-k slots from the sources that
 * were answering practical questions well.
 *
 *   npm run verify:kb-register -- --capture   # record the current occupancy as the baseline
 *   npm run verify:kb-register                # compare against the baseline and fail on drift
 *
 * WHY THIS EXISTS ALONGSIDE verify:knowledge-base. That gate scores RECALL: it passes when ONE expected
 * document appears anywhere in top-k, and never looks at the other slots. It cannot see displacement,
 * and its documented response to a new source pushing out an old one is to WIDEN the expectation. This
 * gate measures the opposite thing — WHO holds the slots — so corpus growth has to earn its place.
 *
 * See src/lib/knowledge/eval/register.ts for why displacement (not "register") is the measured quantity
 * and why MMR makes it a live risk rather than a theoretical one.
 *
 * RUNS AGAINST THE REAL CORPUS as the Demo Winery tenant, so it needs DATABASE_URL — i.e. the main
 * checkout, not a bare worktree. The comparison logic itself is pure and unit-tested in
 * test/knowledge-register.test.ts.
 *
 * WORKFLOW when adding a source: capture BEFORE enabling it, enable it, re-run. The diff is the
 * evidence. A failure is not automatically a bug — it means look at what moved and decide. Unlike the
 * recall eval, the correct default response is NOT to widen the expectation; prefer scoping the new
 * source's crawl, or leaving it defaultEnabled:false as an opt-in.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import {
  PRACTICAL_QUERIES,
  diffSlots,
  judgeDrift,
  DEFAULT_THRESHOLDS,
  type RegisterBaseline,
  type SlotObservation,
} from "@/lib/knowledge/eval/register";
import { disconnectSystem } from "@/lib/tenant/system";
import { prisma } from "@/lib/prisma";

const TENANT = "org_demo_winery";
const TOP_K = 6;
const BASELINE_PATH = path.join(process.cwd(), "docs", "kb-register-baseline.json");

async function observe(): Promise<SlotObservation[]> {
  const out: SlotObservation[] = [];
  for (const question of PRACTICAL_QUERIES) {
    const passages = await retrieveKnowledge({ tenantId: TENANT, query: question, topK: TOP_K });
    out.push({ question, publishers: passages.map((p) => p.publisher) });
  }
  return out;
}

async function main() {
  const capture = process.argv.includes("--capture");
  console.log(`KB retrieval-displacement gate — ${PRACTICAL_QUERIES.length} practical questions, top-${TOP_K}\n`);

  const current = await observe();

  if (capture) {
    const baseline: RegisterBaseline = {
      capturedAt: new Date().toISOString(),
      topK: TOP_K,
      questions: current,
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
    console.log(`baseline written: ${BASELINE_PATH}`);
    for (const q of current) {
      console.log(`  ${q.publishers.length}/${TOP_K}  ${q.question.slice(0, 58)}`);
      console.log(`         ${q.publishers.join(", ") || "(no passages)"}`);
    }
    console.log("\nCommit this file. It is the evidence a later corpus change is compared against.");
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(`No baseline at ${BASELINE_PATH}. Run with --capture first (before adding a source).`);
    process.exitCode = 1;
    return;
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as RegisterBaseline;
  if (baseline.topK !== TOP_K) {
    console.error(`baseline was captured at top-${baseline.topK} but this run is top-${TOP_K} — re-capture.`);
    process.exitCode = 1;
    return;
  }

  const drifts = diffSlots(baseline, current);
  const verdict = judgeDrift(drifts, DEFAULT_THRESHOLDS);

  // Always print the per-question movement, pass or fail. A green run that silently moved 20% of slots
  // is information worth seeing BEFORE the run that finally trips the threshold.
  let moved = 0;
  for (const d of drifts) {
    if (d.displaced === 0) continue;
    moved++;
    console.log(`~ ${d.question.slice(0, 62)}`);
    console.log(`    was: ${d.baseline.join(", ") || "(none)"}`);
    console.log(`    now: ${d.current.join(", ") || "(none)"}`);
    console.log(`    -${d.lost.join(", ") || "none"}  +${d.gained.join(", ") || "none"}`);
  }
  if (moved === 0) console.log("no slot movement against the baseline.");

  console.log(
    `\n${verdict.totalDisplaced}/${verdict.totalSlots} slots changed hands; ` +
      `${verdict.totalFromNewPublishers} went to publishers absent from the baseline ` +
      `(${Math.round(verdict.newPublisherShare * 100)}%).`,
  );

  if (!verdict.ok) {
    console.log("\nDISPLACEMENT GATE FAILED ✗");
    for (const r of verdict.reasons) console.log(`  · ${r}`);
    console.log(
      "\nDecide, do not auto-widen: is the new source genuinely answering these practical questions\n" +
        "better, or is it winning slots on novelty? Prefer scoping its crawl or leaving it opt-in\n" +
        "(defaultEnabled:false) over accepting the drift.",
    );
    process.exitCode = 1;
    return;
  }
  console.log("DISPLACEMENT GATE PASSED ✓");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSystem().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  });
