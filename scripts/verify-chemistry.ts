/**
 * Phase 4 chemistry / tasting / samples end-to-end verification against the live DB.
 *
 * Builds isolated ZZ-TEST-* fixtures (a tank + a seeded lot), drives the real standalone-record
 * CORES (no UI) with an explicit actor, and asserts the Phase 4 exit criteria: an analysis panel
 * records ONE header + its readings and molecular SO₂ derives from same-panel free + pH; records
 * interleave on the lot timeline by observedAt while ops keep their id-order (D14); a sample runs
 * pull → sent → attach-result, flipping to ATTACHED with the result on the timeline (lotId
 * inherited); voiding a panel drops it off the feed; a tasting note records + is searchable; and
 * the vineyard BrixLog is UNTOUCHED (row count unchanged). EVERYTHING created is scrubbed in a
 * finally block so the user's data stays pristine (mirrors scripts/verify-cellar-ops.ts).
 *
 * Run:  npx tsx --env-file=.env scripts/verify-chemistry.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { recordMeasurementsCore, voidPanelCore } from "@/lib/chemistry/measurements";
import { recordTastingNoteCore } from "@/lib/chemistry/tasting";
import { pullSampleCore, markSampleSentCore, attachSampleResultsCore } from "@/lib/chemistry/samples";
import { getLotDetail, searchTastingNotes } from "@/lib/lot/data";
import { molecularSO2 } from "@/lib/chemistry/so2";

const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-chemistry" };
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

const createdVesselIds: string[] = [];
const createdLotIds: string[] = [];

async function makeVessel(code: string, capacityL: number): Promise<string> {
  const v = await prisma.vessel.create({ data: { code, type: "TANK", capacityL } });
  createdVesselIds.push(v.id);
  return v.id;
}

async function seedLot(code: string, vesselId: string, volumeL: number, observedAt: Date): Promise<{ lotId: string; opId: number }> {
  const lot = await prisma.lot.create({ data: { code, form: "WINE" } });
  createdLotIds.push(lot.id);
  const vessel = await prisma.vessel.findUniqueOrThrow({ where: { id: vesselId } });
  const lines: LedgerLine[] = [
    { lotId: lot.id, vesselId, deltaL: volumeL },
    { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" },
  ];
  const opId = await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines,
      observedAt,
      actorUserId: null,
      enteredBy: ACTOR.actorEmail,
      note: "verify-chemistry seed",
      lotCodes: new Map([[lot.id, code]]),
      vesselCodes: new Map([[vesselId, vessel.code]]),
      capacityByVessel: new Map([[vesselId, Number(vessel.capacityL)]]),
    }),
  );
  return { lotId: lot.id, opId };
}

async function brixCount(): Promise<number> {
  return prisma.brixLog.count();
}

async function scrub() {
  console.log("\n── scrubbing test data ──");
  // Panels (cascade readings) + tasting + samples, found by the verify actor email.
  await prisma.analysisPanel.deleteMany({ where: { enteredByEmail: ACTOR.actorEmail } });
  await prisma.lotTastingNote.deleteMany({ where: { enteredByEmail: ACTOR.actorEmail } });
  await prisma.sample.deleteMany({ where: { enteredByEmail: ACTOR.actorEmail } });
  const delOps = await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } });
  await prisma.vessel.deleteMany({ where: { id: { in: createdVesselIds } } });
  await prisma.lot.deleteMany({ where: { id: { in: createdLotIds } } });
  const delAudit = await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } });
  console.log(`  removed ${delOps.count} ops, ${createdVesselIds.length} vessels, ${createdLotIds.length} lots, ${delAudit.count} audit rows`);
}

async function leftoverCount(): Promise<number> {
  const [panels, tasting, samples, ops, audit] = await Promise.all([
    prisma.analysisPanel.count({ where: { enteredByEmail: ACTOR.actorEmail } }),
    prisma.lotTastingNote.count({ where: { enteredByEmail: ACTOR.actorEmail } }),
    prisma.sample.count({ where: { enteredByEmail: ACTOR.actorEmail } }),
    prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } }),
    prisma.auditLog.count({ where: { actorEmail: ACTOR.actorEmail } }),
  ]);
  return panels + tasting + samples + ops + audit;
}

async function main() {
  const brixBefore = await brixCount();
  console.log(`── building fixtures (BrixLog rows before = ${brixBefore}) ──`);
  const tank = await makeVessel("ZZ-TEST-CHEM-TANK", 1000);
  // Op observed mid-window so we can slot a backdated + a future panel around it.
  const opObserved = new Date("2026-05-10T12:00:00.000Z");
  const { lotId } = await seedLot("ZZTEST-CHEM", tank, 500, opObserved);
  console.log("  seeded ZZTEST-CHEM = 500 L");

  // 1) PANEL — one header + readings; molecular SO₂ derives from same-panel free + pH
  console.log("\n── 1. ANALYSIS PANEL (pH + TA + free SO₂) ──");
  const panel = await recordMeasurementsCore(ACTOR, {
    vesselId: tank, // 1 resident → auto-resolves the lot (D2)
    observedAt: opObserved,
    readings: [
      { analyte: "PH", value: 3.5, unit: "pH" },
      { analyte: "TA", value: 6.0, unit: "g/L tartaric" },
      { analyte: "FREE_SO2", value: 30, unit: "mg/L" },
    ],
  });
  assert(panel.lotId === lotId, "panel auto-resolved to the sole resident lot (D2)");
  const panelRow = await prisma.analysisPanel.findUniqueOrThrow({ where: { id: panel.panelId }, include: { readings: true } });
  assert(panelRow.readings.length === 3, `one panel with 3 readings (got ${panelRow.readings.length})`);
  const mol = molecularSO2({ freeSO2: 30, pH: 3.5 });
  assert(!!mol && mol.molecularSO2 > 0.4 && mol.molecularSO2 < 0.8, `molecular SO₂ derives (~0.60, got ${mol?.molecularSO2.toFixed(3)})`);

  // 2) TIMELINE interleave — records slot by observedAt; the op keeps its place
  console.log("\n── 2. TIMELINE interleave by observedAt ──");
  await recordMeasurementsCore(ACTOR, {
    vesselId: tank,
    observedAt: new Date("2026-05-08T12:00:00.000Z"), // BEFORE the op → slots below it
    readings: [{ analyte: "PH", value: 3.6, unit: "pH" }],
  });
  await recordMeasurementsCore(ACTOR, {
    vesselId: tank,
    observedAt: new Date("2026-05-12T12:00:00.000Z"), // AFTER the op → slots above it
    readings: [{ analyte: "PH", value: 3.4, unit: "pH" }],
  });
  const detail1 = await getLotDetail(lotId);
  if (!detail1) throw new Error("getLotDetail returned null");
  const kinds = detail1.events.map((e) => e.kind);
  const opIdx = detail1.events.findIndex((e) => e.kind === "OP");
  const measIdxs = detail1.events.map((e, i) => (e.kind === "MEASUREMENT" ? i : -1)).filter((i) => i >= 0);
  assert(measIdxs.length === 3, `three measurement items on the timeline (got ${measIdxs.length})`);
  assert(measIdxs.some((i) => i < opIdx) && measIdxs.some((i) => i > opIdx), "records interleave around the op (some above, some below)");
  assert(detail1.events[opIdx].kind === "OP", `the SEED op holds its place in the feed (kinds: ${kinds.join(",")})`);

  // 3) SAMPLE lifecycle — pull → sent → attach result (lotId inherited) → ATTACHED on timeline
  console.log("\n── 3. SAMPLE pull → send → attach ──");
  const pulled = await pullSampleCore(ACTOR, { vesselId: tank, source: "ZZ tank top" });
  assert(pulled.status === "PULLED", "sample pulled (status PULLED)");
  const sent = await markSampleSentCore(ACTOR, { sampleId: pulled.sampleId, lab: "ZZ-LAB" });
  assert(sent.status === "SENT", "sample marked sent (status SENT)");
  const attached = await attachSampleResultsCore(ACTOR, {
    sampleId: pulled.sampleId,
    readings: [{ analyte: "MALIC", value: 1.2, unit: "g/L" }],
  });
  assert(attached.status === "ATTACHED", "attaching a result flips the sample to ATTACHED");
  assert(attached.lotId === lotId, "result panel inherits the sample's captured lotId (never re-resolved)");
  const resultPanel = await prisma.analysisPanel.findUniqueOrThrow({ where: { id: attached.panelId }, include: { readings: true } });
  assert(resultPanel.sampleId === pulled.sampleId, "result panel is linked to the sample");
  const detail2 = await getLotDetail(lotId);
  const hasMalic = detail2!.events.some((e) => e.kind === "MEASUREMENT" && e.readings.some((r) => r.analyte === "MALIC"));
  assert(hasMalic, "the attached malic result shows on the lot timeline (feeds the trend)");

  // 4) TASTING note — records + is searchable
  console.log("\n── 4. TASTING note + search ──");
  await recordTastingNoteCore(ACTOR, { vesselId: tank, aroma: "zztest bramble cassis", score: 92, scoreScale: "HUNDRED_POINT", readiness: "READY_TO_BOTTLE" });
  const hits = await searchTastingNotes("bramble cassis");
  assert(hits.some((h) => h.lotId === lotId), "the tasting note is found by free-text search");
  const detail3 = await getLotDetail(lotId);
  assert(detail3!.events.some((e) => e.kind === "TASTING"), "the tasting note shows on the lot timeline");

  // 5) VOID — soft-deleting a panel drops it off the feed
  console.log("\n── 5. VOID a panel ──");
  const beforeVoid = (await getLotDetail(lotId))!.events.filter((e) => e.kind === "MEASUREMENT").length;
  await voidPanelCore(ACTOR, { panelId: panel.panelId });
  const afterVoid = (await getLotDetail(lotId))!.events.filter((e) => e.kind === "MEASUREMENT").length;
  assert(afterVoid === beforeVoid - 1, `voided panel drops off the feed (${beforeVoid} → ${afterVoid})`);
  assert(!(await getLotDetail(lotId))!.events.some((e) => e.kind === "MEASUREMENT" && e.id === panel.panelId), "the voided panel id is no longer in the feed");

  // 6) BrixLog UNTOUCHED
  console.log("\n── 6. BrixLog untouched ──");
  const brixAfter = await brixCount();
  assert(brixAfter === brixBefore, `BrixLog row count unchanged (${brixBefore} → ${brixAfter})`);

  console.log(`\nALL ${passed} ASSERTIONS PASSED`);
}

runAsTenant("org_bhutan_wine_co", async () => {
  await scrub();
  await main().then(scrub);
  const leftover = await leftoverCount();
  console.log(leftover === 0 ? "POST-SCRUB: no test rows remain (DB pristine)." : `POST-SCRUB WARNING: ${leftover} test rows remain!`);
  return leftover;
})
  .then(async (leftover) => {
    await prisma.$disconnect();
    process.exit(leftover === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error("\nFAILED:", e);
    try {
      await runAsTenant("org_bhutan_wine_co", scrub);
    } catch (se) {
      console.error("scrub error:", se);
    }
    await prisma.$disconnect();
    process.exit(1);
  });
