/**
 * Phase 6 state-transforms & fermentation end-to-end verification against the live DB.
 *
 * Builds isolated ZZF-* fixtures (vineyard/block/variety + harvest picks + vessels), drives the
 * real CORES (no UI) with an explicit actor, and proves every Phase 6 exit criterion: crush
 * (partial pick + sequential-fill ADD + over-consume reject + measured yield + origination leg
 * excluded from loss + commandId idempotency), the offline panel submit (idempotent re-submit +
 * stale-occupancy reject + derived stuck that self-corrects on a late reading), the AF/MLF/form
 * transitions (white AF→DRY flips form=WINE), press (free-run + a MERGED fraction, estimated
 * volume, SPLIT lineage + lees balance + expectedRevision guard), saignée (MUST→JUICE), and a
 * cold soak at af:NONE. Everything is scrubbed in a finally block so the DB stays pristine.
 *
 * Run:  npx tsx --env-file=.env scripts/verify-ferment.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { foldLines, balanceKey } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { crushLotCore } from "@/lib/transform/crush-core";
import { pressLotCore } from "@/lib/transform/press-core";
import { transitionStateCore, stuckForLot } from "@/lib/ferment/transition-core";
import { submitPanelCore } from "@/lib/ferment/panel-core";
import { capManagementCore } from "@/lib/cellar/treatments";

const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-ferment" };
const r2 = (n: number) => Math.round(n * 100) / 100;
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}
async function expectThrow(fn: () => Promise<unknown>, msg: string) {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  assert(threw, msg);
}
const uid = (() => {
  let n = 0;
  return () => `zzf-${Date.now()}-${++n}`;
})();

const created = { vineyards: [] as string[], vessels: [] as string[], lots: [] as string[], blocks: [] as string[], varieties: [] as string[], records: [] as string[] };

async function projectionMatchesFold(): Promise<boolean> {
  const lines = await prisma.lotOperationLine.findMany({
    orderBy: [{ operationId: "asc" }, { id: "asc" }],
    select: { lotId: true, vesselId: true, deltaL: true },
  });
  const folded = foldLines([], lines.map((l) => ({ lotId: l.lotId, vesselId: l.vesselId, deltaL: Number(l.deltaL) })));
  const foldByKey = new Map(folded.map((b) => [balanceKey(b.vesselId, b.lotId), r2(b.volumeL)]));
  const proj = await prisma.vesselLot.findMany({ select: { vesselId: true, lotId: true, volumeL: true } });
  if (proj.length !== foldByKey.size) return false;
  for (const p of proj) if (foldByKey.get(balanceKey(p.vesselId, p.lotId)) !== r2(Number(p.volumeL))) return false;
  return true;
}

async function makeVessel(code: string, capacityL: number): Promise<string> {
  const v = await prisma.vessel.create({ data: { code, type: "TANK", capacityL } });
  created.vessels.push(v.id);
  return v.id;
}
async function lotVol(vesselId: string, lotId: string): Promise<number> {
  const vl = await prisma.vesselLot.findFirst({ where: { vesselId, lotId }, select: { volumeL: true } });
  return vl ? Number(vl.volumeL) : 0;
}

async function main() {
  await scrub(); // pre-clean any leftover ZZF-* fixtures from a prior crashed run
  // ── Fixtures ──
  const vineyard = await prisma.vineyard.create({ data: { name: "ZZF-TEST Vineyard", abbreviation: "ZVF" } });
  created.vineyards.push(vineyard.id);
  const variety = await prisma.variety.create({ data: { name: "ZZF-Test Variety", abbreviation: "ZQF" } });
  created.varieties.push(variety.id);
  const block = await prisma.vineyardBlock.create({
    data: { vineyardId: vineyard.id, blockLabel: "ZZF-B1", code: "1", varietyId: variety.id },
  });
  created.blocks.push(block.id);
  const record = await prisma.harvestRecord.create({
    data: { blockId: block.id, vineyardId: vineyard.id, vintageYear: 2024, createdByEmail: ACTOR.actorEmail },
  });
  created.records.push(record.id);
  // One big 18 t pick (for partial + sequential-fill), one 5 t pick for the white/saignée path.
  const pickBig = await prisma.harvestPick.create({ data: { harvestRecordId: record.id, pickDate: new Date("2024-09-10"), weightKg: 18000, createdByEmail: ACTOR.actorEmail } });
  const pickWhite = await prisma.harvestPick.create({ data: { harvestRecordId: record.id, pickDate: new Date("2024-09-12"), weightKg: 5000, createdByEmail: ACTOR.actorEmail } });
  const pickWC = await prisma.harvestPick.create({ data: { harvestRecordId: record.id, pickDate: new Date("2024-09-13"), weightKg: 2000, createdByEmail: ACTOR.actorEmail } }); // for whole-cluster press

  const tankRed = await makeVessel("ZZF-RED", 20000);
  const tankWhite = await makeVessel("ZZF-WHT", 8000);
  const tankFR = await makeVessel("ZZF-FR", 20000);
  const barrelHP = await makeVessel("ZZF-HP", 20000);
  const tankWhole = await makeVessel("ZZF-WC", 8000);
  const tankWhole2 = await makeVessel("ZZF-WC2", 8000);

  // ── 1. Crush: NEW must lot from a PARTIAL pick, measured yield ──
  console.log("\n── 1. Crush (partial pick → new MUST lot at measured yield) ──");
  const crush1 = await crushLotCore(ACTOR, {
    commandId: uid(),
    picks: [{ pickId: pickBig.id, consumedKg: 10000 }],
    destVesselId: tankRed,
    outputVolumeL: 7300,
    target: { mode: "NEW", vintage: 2024 },
  });
  created.lots.push(crush1.lotId);
  const redLot = await prisma.lot.findUniqueOrThrow({ where: { id: crush1.lotId } });
  assert(redLot.form === "MUST", "crush originates a MUST lot");
  assert(redLot.afState === "NONE", "new must lot starts AF:NONE");
  assert((await lotVol(tankRed, crush1.lotId)) === 7300, "must lot is at the MEASURED 7300 L (not arithmetic)");
  assert(Math.abs(crush1.yieldLPerTonne - 730) < 0.01, "yield derived from measured output (730 L/t)");
  const hs1 = await prisma.lotHarvestSource.findMany({ where: { lotId: crush1.lotId } });
  assert(hs1.length === 1 && Number(hs1[0].consumedKg) === 10000, "LotHarvestSource records 10000 kg consumed");
  // The −V leg is origination, EXCLUDED from loss reports.
  const crushLines = await prisma.lotOperationLine.findMany({ where: { operationId: crush1.operationId } });
  assert(crushLines.some((l) => l.reason === "crush_origination"), "the −V counter-leg is typed crush_origination");
  assert(!crushLines.some((l) => l.reason === "loss"), "crush writes NO loss-reason line (origination ≠ loss)");

  // ── 2. Over-consume rejected ──
  console.log("\n── 2. Guards ──");
  await expectThrow(
    () => crushLotCore(ACTOR, { commandId: uid(), picks: [{ pickId: pickBig.id, consumedKg: 9000 }], destVesselId: tankRed, outputVolumeL: 100, target: { mode: "ADD", lotId: crush1.lotId } }),
    "over-consume rejected (only 8000 kg remain of the 18 t pick)",
  );

  // ── 3. Sequential-fill ADD into the same must lot ──
  console.log("\n── 3. Sequential-fill ADD ──");
  const crush2 = await crushLotCore(ACTOR, {
    commandId: uid(),
    picks: [{ pickId: pickBig.id, consumedKg: 8000 }],
    destVesselId: tankRed,
    outputVolumeL: 5900,
    target: { mode: "ADD", lotId: crush1.lotId },
  });
  assert(crush2.lotId === crush1.lotId, "ADD keeps the same lot identity");
  assert((await lotVol(tankRed, crush1.lotId)) === 13200, "must lot grew to 13200 L (7300+5900)");
  const hsAll = await prisma.lotHarvestSource.findMany({ where: { harvestPickId: pickBig.id } });
  assert(hsAll.reduce((a, h) => a + Number(h.consumedKg), 0) === 18000, "Σ consumedKg over the pick = 18000 (fully consumed)");

  // ── 4. Crush commandId idempotency ──
  console.log("\n── 4. Crush idempotency ──");
  const dupCmd = uid();
  const c4a = await crushLotCore(ACTOR, { commandId: dupCmd, picks: [{ pickId: pickWhite.id, consumedKg: 2000 }], destVesselId: tankWhite, outputVolumeL: 1500, target: { mode: "NEW", vintage: 2024 } });
  created.lots.push(c4a.lotId);
  const c4b = await crushLotCore(ACTOR, { commandId: dupCmd, picks: [{ pickId: pickWhite.id, consumedKg: 2000 }], destVesselId: tankWhite, outputVolumeL: 1500, target: { mode: "NEW", vintage: 2024 } });
  assert(c4b.duplicate && c4b.operationId === c4a.operationId, "re-running the same crush commandId is a no-op success");

  // ── 5. Ferment: AF active, daily Brix panels, derived stuck ──
  console.log("\n── 5. Ferment + offline panels + derived stuck ──");
  await transitionStateCore(ACTOR, { lotId: crush1.lotId, kind: "AF", to: "ACTIVE", commandId: uid() });
  const occ = `${tankRed}:${crush1.lotId}`;
  async function panel(dateISO: string, brix: number, temp: number, ids?: { panelId: string; commandId: string; capBrix: string; capTemp: string }) {
    const p = ids ?? { panelId: uid(), commandId: uid(), capBrix: uid(), capTemp: uid() };
    return submitPanelCore(ACTOR, {
      panelId: p.panelId, commandId: p.commandId, vesselId: tankRed, lotId: crush1.lotId, occupancyToken: occ, deviceObservedAt: dateISO,
      readings: [{ captureId: p.capBrix, analyte: "BRIX", value: brix, unit: "°Bx" }, { captureId: p.capTemp, analyte: "TEMP", value: temp, unit: "°C" }],
    });
  }
  // A flat run well above dryness → stuck.
  await panel("2024-09-20T08:00:00Z", 12.1, 26);
  await panel("2024-09-21T08:00:00Z", 12.0, 27);
  await panel("2024-09-22T08:00:00Z", 11.9, 27);
  assert((await stuckForLot(crush1.lotId, "ACTIVE")).stuck === true, "a flat ACTIVE run above the floor raises stuck");

  // Idempotent re-submit (same ids) → no duplicate panel.
  const fixed = { panelId: uid(), commandId: uid(), capBrix: uid(), capTemp: uid() };
  const s1 = await panel("2024-09-23T08:00:00Z", 11.85, 26, fixed);
  const s2 = await panel("2024-09-23T08:00:00Z", 11.85, 26, fixed);
  assert(s1.ok && s2.ok && (s2 as { duplicate: boolean }).duplicate === true, "re-submitting the same panel/captureId is a duplicate success");
  const panelCount = await prisma.analysisPanel.count({ where: { clientRequestId: fixed.commandId } });
  assert(panelCount === 1, "the duplicate panel was NOT inserted twice");

  // Plan 060: the offline-sync core stamps vesselReadingGroupId — a whole-tank reading syncs as N
  // one-lot captures (one per co-resident lot) that all carry the shared group id.
  const grpIds = { panelId: uid(), commandId: uid(), capBrix: uid(), capTemp: uid() };
  const grp = await submitPanelCore(ACTOR, {
    panelId: grpIds.panelId, commandId: grpIds.commandId, vesselId: tankRed, lotId: crush1.lotId, occupancyToken: occ,
    deviceObservedAt: "2024-09-23T09:00:00Z", vesselReadingGroupId: "vrg:zz-offline-1",
    readings: [{ captureId: grpIds.capBrix, analyte: "BRIX", value: 11.7, unit: "°Bx" }, { captureId: grpIds.capTemp, analyte: "TEMP", value: 26, unit: "°C" }],
  });
  const grpPanel = await prisma.analysisPanel.findUnique({ where: { id: grpIds.panelId }, select: { vesselReadingGroupId: true } });
  assert(grp.ok && grpPanel?.vesselReadingGroupId === "vrg:zz-offline-1", "offline-sync core persists vesselReadingGroupId onto the panel (plan 060)");

  // A real drop CLEARS stuck (derived recompute).
  await panel("2024-09-24T08:00:00Z", 8.0, 25);
  assert((await stuckForLot(crush1.lotId, "ACTIVE")).stuck === false, "a real Brix drop clears the derived stuck signal");

  // Out-of-order late reading still computes correctly (self-correcting).
  await panel("2024-09-19T08:00:00Z", 18.0, 24); // an earlier day, synced late
  assert((await stuckForLot(crush1.lotId, "ACTIVE")).stuck === false, "a late out-of-order reading recomputes stuck without breaking");

  // ── 6. Stale-occupancy reject ──
  console.log("\n── 6. As-of occupancy ──");
  const stale = await submitPanelCore(ACTOR, {
    panelId: uid(), commandId: uid(), vesselId: tankWhite, lotId: crush1.lotId, occupancyToken: `${tankWhite}:${crush1.lotId}`, deviceObservedAt: "2024-09-25T08:00:00Z",
    readings: [{ captureId: uid(), analyte: "BRIX", value: 5, unit: "°Bx" }],
  });
  assert(!stale.ok && (stale as { error: string }).error === "STALE_OCCUPANCY", "a reading whose (vessel,lot) is not current is rejected STALE_OCCUPANCY");

  // ── 7. White path: saignée MUST→JUICE, then AF→DRY flips JUICE→WINE ──
  console.log("\n── 7. Saignée + white AF→DRY→WINE ──");
  const sai = await pressLotCore(ACTOR, {
    commandId: uid(), parentLotId: c4a.lotId, sourceVesselId: tankWhite, op: "SAIGNEE",
    fractions: [{ destVesselId: tankFR, volumeL: 300, label: "rosé" }],
  });
  const juiceLot = sai.fractions[0].lotId;
  created.lots.push(juiceLot);
  const juice = await prisma.lot.findUniqueOrThrow({ where: { id: juiceLot } });
  assert(juice.form === "JUICE", "saignée bleeds a JUICE fraction off the must");
  assert((await prisma.lot.findUniqueOrThrow({ where: { id: c4a.lotId } })).form === "MUST", "the bled parent stays MUST");
  await transitionStateCore(ACTOR, { lotId: juiceLot, kind: "AF", to: "ACTIVE", commandId: uid() });
  const dry = await transitionStateCore(ACTOR, { lotId: juiceLot, kind: "AF", to: "DRY", commandId: uid() });
  assert(dry.form === "WINE" && dry.formAutoFlipped, "a white going dry (JUICE + AF→DRY) auto-flips form=WINE");

  // ── 8. MLF on the red ──
  console.log("\n── 8. MLF ──");
  await transitionStateCore(ACTOR, { lotId: crush1.lotId, kind: "MLF", to: "ACTIVE", commandId: uid() });
  const mlfDone = await transitionStateCore(ACTOR, { lotId: crush1.lotId, kind: "MLF", to: "COMPLETE", commandId: uid() });
  assert(mlfDone.mlfState === "COMPLETE", "MLF advances ACTIVE→COMPLETE independently of AF");

  // ── 8b. Whole-cluster press: harvest fruit → JUICE, skipping crush (op PRESS) ──
  console.log("\n── 8b. Whole-cluster press (fruit → juice, skips crush) ──");
  const wc = await crushLotCore(ACTOR, {
    commandId: uid(),
    picks: [{ pickId: pickWC.id, consumedKg: 2000 }], // press the whole 2 t pick
    destVesselId: tankWhole,
    outputVolumeL: 1300,
    destinations: [
      { vesselId: tankWhole, volumeL: 800 },
      { vesselId: tankWhole2, volumeL: 500 },
    ],
    target: { mode: "NEW", vintage: 2024 },
    outputForm: "JUICE",
    opType: "PRESS",
  });
  created.lots.push(wc.lotId);
  const wcLot = await prisma.lot.findUniqueOrThrow({ where: { id: wc.lotId } });
  assert(wcLot.form === "JUICE", "whole-cluster press originates a JUICE lot (skips MUST)");
  assert((await lotVol(tankWhole, wc.lotId)) === 800 && (await lotVol(tankWhole2, wc.lotId)) === 500, "the juice lot split across two vessels (800 + 500 = 1300 L)");
  const wcOp = await prisma.lotOperation.findUniqueOrThrow({ where: { id: wc.operationId }, select: { type: true } });
  assert(wcOp.type === "PRESS", "whole-cluster press is recorded as a PRESS operation");
  const pickFullyUsed = Number((await prisma.lotHarvestSource.aggregate({ where: { harvestPickId: pickWC.id }, _sum: { consumedKg: true } }))._sum.consumedKg ?? 0);
  assert(pickFullyUsed === 2000, "the pressed pick is now fully consumed → it can no longer be crushed (shared ledger)");
  await expectThrow(
    () => crushLotCore(ACTOR, { commandId: uid(), picks: [{ pickId: pickWC.id, consumedKg: 1 }], destVesselId: tankWhole, outputVolumeL: 1, target: { mode: "NEW", vintage: 2024 } }),
    "crushing an already whole-cluster-pressed pick is rejected (no kg remain)",
  );

  // ── 9. Cold soak on a must lot at af NONE ──
  console.log("\n── 9. Cold soak ──");
  const cold = await capManagementCore(ACTOR, { vesselId: tankWhite, kind: "COLD_SOAK", durationMin: 720 });
  assert(cold.operationId > 0, "a cold soak (CAP_MGMT kind COLD_SOAK) logs on the must lot");

  // ── 10. Press the red: free-run (new) + hard press (merged), estimated, lees, expectedRevision ──
  console.log("\n── 10. Press (free-run new + merged + lees + expectedRevision) ──");
  // Mark the red dry first (red presses dry-on-skins → child WINE).
  await transitionStateCore(ACTOR, { lotId: crush1.lotId, kind: "AF", to: "DRY", commandId: uid() });
  // A pre-existing destination lot to MERGE the hard press into.
  const mergeDest = await crushLotCore(ACTOR, { commandId: uid(), picks: [{ pickId: pickWhite.id, consumedKg: 1000 }], destVesselId: barrelHP, outputVolumeL: 700, target: { mode: "NEW", vintage: 2024 } });
  created.lots.push(mergeDest.lotId);
  const redVl = await prisma.vesselLot.findFirstOrThrow({ where: { vesselId: tankRed, lotId: crush1.lotId }, select: { volumeL: true, updatedAt: true } });
  const avail = Number(redVl.volumeL); // 13200
  // Stale-revision guard.
  await expectThrow(
    () => pressLotCore(ACTOR, { commandId: uid(), parentLotId: crush1.lotId, sourceVesselId: tankRed, expectedRevision: "1999-01-01T00:00:00.000Z", fractions: [{ destVesselId: tankFR, volumeL: 100, label: "fr" }] }),
    "press with a stale expectedRevision is rejected (CONFLICT)",
  );
  const press = await pressLotCore(ACTOR, {
    commandId: uid(), parentLotId: crush1.lotId, sourceVesselId: tankRed, expectedRevision: redVl.updatedAt.toISOString(), lossL: 400,
    fractions: [
      { destVesselId: tankFR, volumeL: 10000, label: "free-run" },
      { destVesselId: barrelHP, volumeL: 2800, label: "hard", estimated: true, mergeIntoLotId: mergeDest.lotId },
    ],
  });
  const frFraction = press.fractions.find((f) => f.label === "free-run")!;
  created.lots.push(frFraction.lotId);
  assert(r2(press.drawnL) === r2(avail), "press drew the whole parent (10000 + 2800 + 400 lees = 13200 = available)");
  assert(r2(press.lossL) === 400, "lees recorded as 400 L loss");
  const frLot = await prisma.lot.findUniqueOrThrow({ where: { id: frFraction.lotId } });
  assert(frLot.form === "WINE", "the free-run fraction off a dry red is WINE");
  assert(press.fractions.find((f) => f.label === "hard")!.merged === true, "the hard press merged into the existing destination lot");
  assert((await lotVol(barrelHP, mergeDest.lotId)) === 700 + 2800, "merge grew the destination lot (700 + 2800)");
  const splitEdges = await prisma.lotLineage.findMany({ where: { parentLotId: crush1.lotId, kind: "SPLIT" } });
  assert(splitEdges.length === 2, "two SPLIT lineage edges (free-run + merged hard)");

  assert(await projectionMatchesFold(), "projection == fold at the end of the run");
  console.log(`\nALL ${passed} ASSERTIONS PASSED`);
}

async function scrub() {
  // Resolve fixtures BY PATTERN (not just tracked ids) so even a crashed run is cleaned on the
  // next invocation — the variety abbreviation + vineyard name are fixed + unique.
  const [pVarieties, pVineyards] = await Promise.all([
    prisma.variety.findMany({ where: { OR: [{ name: { startsWith: "ZZF" } }, { abbreviation: "ZQF" }] }, select: { id: true } }),
    prisma.vineyard.findMany({ where: { OR: [{ name: { startsWith: "ZZF-TEST" } }, { abbreviation: "ZVF" }] }, select: { id: true } }),
  ]);
  const varietyIds = [...new Set([...created.varieties, ...pVarieties.map((v) => v.id)])];
  const vineyardIds = [...new Set([...created.vineyards, ...pVineyards.map((v) => v.id)])];
  const pBlocks = await prisma.vineyardBlock.findMany({ where: { OR: [{ id: { in: created.blocks } }, { vineyardId: { in: vineyardIds } }] }, select: { id: true } });
  const blockIds = [...new Set([...created.blocks, ...pBlocks.map((b) => b.id)])];
  const pRecords = await prisma.harvestRecord.findMany({ where: { OR: [{ id: { in: created.records } }, { blockId: { in: blockIds } }] }, select: { id: true } });
  const recordIds = [...new Set([...created.records, ...pRecords.map((r) => r.id)])];

  const patternLots = await prisma.lot.findMany({
    where: { OR: [{ code: { startsWith: "2024-ZQF" } }, { id: { in: created.lots } }, { originVineyardId: { in: vineyardIds } }] },
    select: { id: true },
  });
  const allLotIds = [...new Set([...created.lots, ...patternLots.map((l) => l.id)])];
  await prisma.lotHarvestSource.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  await prisma.lotStateEvent.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  await prisma.analysisReading.deleteMany({ where: { panel: { lotId: { in: allLotIds } } } }).catch(() => {});
  await prisma.analysisPanel.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  await prisma.lotTreatment.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  await prisma.lotOperationLine.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: allLotIds } }, { childLotId: { in: allLotIds } }] } }).catch(() => {});
  await prisma.vesselLot.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  await prisma.lotVineyard.deleteMany({ where: { lotId: { in: allLotIds } } }).catch(() => {});
  const orphanOps = await prisma.lotOperation.findMany({ where: { lines: { none: {} }, enteredBy: ACTOR.actorEmail }, select: { id: true } });
  await prisma.lotStateEvent.deleteMany({ where: { operationId: { in: orphanOps.map((o) => o.id) } } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { id: { in: orphanOps.map((o) => o.id) } } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: allLotIds } } }).catch(() => {});
  await prisma.harvestPick.deleteMany({ where: { harvestRecordId: { in: recordIds } } }).catch(() => {});
  await prisma.harvestRecord.deleteMany({ where: { id: { in: recordIds } } }).catch(() => {});
  // Crush originates single-origin lots, so writeLotOperation also wrote vessel_component rows
  // (the legacy projection) keyed by our variety/vineyard — clear them before the FK parents.
  await prisma.vesselComponent.deleteMany({ where: { OR: [{ varietyId: { in: varietyIds } }, { vineyardId: { in: vineyardIds } }] } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "ZZF-" } } }).catch(() => {});
  await prisma.vineyardBlock.deleteMany({ where: { id: { in: blockIds } } }).catch(() => {});
  await prisma.variety.deleteMany({ where: { id: { in: varietyIds } } }).catch(() => {});
  await prisma.vineyard.deleteMany({ where: { id: { in: vineyardIds } } }).catch(() => {});
}

runAsTenant("org_bhutan_wine_co", async () => {
  await scrub(); // clean any leftovers from an interrupted prior run
  await main().then(scrub);
  const ok = await projectionMatchesFold();
  console.log(ok ? "POST-SCRUB: projection == fold (DB pristine)." : "POST-SCRUB WARNING: projection drift!");
  return ok;
})
  .then(async (ok) => {
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
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
