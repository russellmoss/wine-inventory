/**
 * Plan 024b — origination/split reversal end-to-end verification (CRUSH, PRESS, SAIGNEE, BLEND).
 *
 * Drives the real cores forward, then reverses each through reverseOperationCore (the dispatcher the
 * UI calls) and asserts the append-only outcome + the ledger invariant:
 *   • CRUSH (NEW): must lot drained + marked CORRECTED, its harvest picks FREED (available again);
 *   • CRUSH (ADD): only the added must removed, the pre-existing lot kept, its picks freed;
 *   • CRUSH downstream guard: reversing a crush that was later pressed is BLOCKED;
 *   • PRESS: drawn volume returned to the parent, each NEW fraction marked CORRECTED (SPLIT edge kept);
 *   • SAIGNEE: the bled juice returns to the must;
 *   • PRESS merged-fraction: refused with a clear reason (no lineage snapshot);
 *   • pick over-restore guard: a crush whose consumption changed since is refused;
 *   • BLEND NEW_LOT: parents restored, child CORRECTED;
 *   • BLEND GROW_EXISTING: parent restored, resident NOT corrected, its pre-op lineage RESTORED
 *     (the edge the blend added is removed) — MUST-FIX #4.
 * Everything is ZRT-* / system@verify-rev-tf and scrubbed (by pattern) in a finally block.
 *
 * Run:  npx tsx --env-file=.env scripts/verify-reverse-transform.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { foldLines, balanceKey, type LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { crushLotCore } from "@/lib/transform/crush-core";
import { pressLotCore } from "@/lib/transform/press-core";
import { blendLotsCore } from "@/lib/blend/blend-core";
import { reverseOperationCore } from "@/lib/ledger/reverse";

const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-rev-tf" };
const r2 = (n: number) => Math.round(n * 100) / 100;
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}
async function assertThrows(fn: () => Promise<unknown>, msg: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    passed++;
    console.log(`  ✓ ${msg} (${e instanceof Error ? e.message : String(e)})`);
    return;
  }
  throw new Error(`ASSERT FAILED: expected throw — ${msg}`);
}
const uid = (() => { let n = 0; return () => `zrt-${Date.now()}-${++n}`; })();

const created = { vineyards: [] as string[], vessels: [] as string[], lots: [] as string[], blocks: [] as string[], varieties: [] as string[], records: [] as string[] };

async function projectionMatchesFold(): Promise<boolean> {
  const lines = await prisma.lotOperationLine.findMany({ orderBy: [{ operationId: "asc" }, { id: "asc" }], select: { lotId: true, vesselId: true, deltaL: true } });
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
const lotVol = async (vesselId: string, lotId: string) => Number((await prisma.vesselLot.findFirst({ where: { vesselId, lotId }, select: { volumeL: true } }))?.volumeL ?? 0);
const statusOf = async (lotId: string) => (await prisma.lot.findUnique({ where: { id: lotId }, select: { status: true } }))?.status;
const isCorrected = async (opId: number) => (await prisma.lotOperation.findUnique({ where: { id: opId }, select: { correctedBy: { select: { id: true } } } }))?.correctedBy != null;

async function seedWineLot(code: string, vesselId: string, volumeL: number, vineyardId: string): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, form: "WINE", afState: "DRY", originVineyardId: vineyardId, vintageYear: 2024 } });
  created.lots.push(lot.id);
  await prisma.lotVineyard.create({ data: { lotId: lot.id, vineyardId } });
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [{ lotId: lot.id, vesselId, deltaL: volumeL }, { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" }] as LedgerLine[],
      actorUserId: null, enteredBy: ACTOR.actorEmail, lotCodes: new Map([[lot.id, code]]), vesselCodes: new Map(), capacityByVessel: new Map([[vesselId, 20000]]),
    }),
  );
  return lot.id;
}

async function main() {
  await scrub();
  const vineyard = await prisma.vineyard.create({ data: { name: "ZRT-REV Vineyard", abbreviation: "ZRV" } });
  created.vineyards.push(vineyard.id);
  const variety = await prisma.variety.create({ data: { name: "ZRT-Rev Variety", abbreviation: "ZRT" } });
  created.varieties.push(variety.id);
  const block = await prisma.vineyardBlock.create({ data: { vineyardId: vineyard.id, blockLabel: "ZRT-B1", code: "1", varietyId: variety.id } });
  created.blocks.push(block.id);
  const record = await prisma.harvestRecord.create({ data: { blockId: block.id, vineyardId: vineyard.id, vintageYear: 2024, createdByEmail: ACTOR.actorEmail } });
  created.records.push(record.id);
  // Generous picks (kg) so cross-test consumption never runs a pick dry (yields aren't asserted here).
  const pick1 = await prisma.harvestPick.create({ data: { harvestRecordId: record.id, pickDate: new Date("2024-09-10"), weightKg: 20000, createdByEmail: ACTOR.actorEmail } });
  const pick2 = await prisma.harvestPick.create({ data: { harvestRecordId: record.id, pickDate: new Date("2024-09-11"), weightKg: 20000, createdByEmail: ACTOR.actorEmail } });
  const pick3 = await prisma.harvestPick.create({ data: { harvestRecordId: record.id, pickDate: new Date("2024-09-12"), weightKg: 20000, createdByEmail: ACTOR.actorEmail } });

  const tankA = await makeVessel("ZRT-A", 20000);
  const tankB = await makeVessel("ZRT-B", 20000);
  const tankC = await makeVessel("ZRT-C", 20000);
  const tankD = await makeVessel("ZRT-D", 20000);
  const tankE = await makeVessel("ZRT-E", 20000);
  // Fresh vessels for the blend tests (crush/press residue must not pollute a NEW_LOT destination).
  const tankF = await makeVessel("ZRT-F", 20000);
  const tankG = await makeVessel("ZRT-G", 20000);
  const tankH = await makeVessel("ZRT-H", 20000);
  const tankI = await makeVessel("ZRT-I", 20000);
  const tankJ = await makeVessel("ZRT-J", 20000);

  const remainingKg = async (pickId: string) =>
    Number((await prisma.lotHarvestSource.aggregate({ where: { harvestPickId: pickId }, _sum: { consumedKg: true } }))._sum.consumedKg ?? 0);

  // ── 1. CRUSH (NEW) reverse: drain the must lot + free its picks ──
  console.log("\n── 1. CRUSH NEW reverse ──");
  const crushNew = await crushLotCore(ACTOR, { commandId: uid(), picks: [{ pickId: pick1.id, consumedKg: 5000 }], destVesselId: tankA, outputVolumeL: 3600, target: { mode: "NEW", vintage: 2024 } });
  created.lots.push(crushNew.lotId);
  assert((await lotVol(tankA, crushNew.lotId)) === 3600, "crush NEW originated 3600 L must");
  assert((await remainingKg(pick1.id)) === 5000, "pick1 shows 5000 kg consumed after crush");
  const rc1 = await reverseOperationCore(ACTOR, { operationId: crushNew.operationId });
  assert(rc1.reversedType === "CRUSH", "dispatcher routes CRUSH → transform reversal");
  assert((await lotVol(tankA, crushNew.lotId)) === 0, "crush reversed: must lot drained from the tank");
  assert((await statusOf(crushNew.lotId)) === "CORRECTED", "NEW must lot marked CORRECTED (append-only, row kept)");
  assert((await remainingKg(pick1.id)) === 0, "pick1 freed (0 kg consumed → available to crush again)");
  assert(await isCorrected(crushNew.operationId), "the CRUSH op is marked corrected");

  // ── 2. CRUSH (ADD) reverse: remove only the added must, keep the pre-existing lot + its other picks ──
  console.log("\n── 2. CRUSH ADD reverse ──");
  const base = await crushLotCore(ACTOR, { commandId: uid(), picks: [{ pickId: pick2.id, consumedKg: 4000 }], destVesselId: tankB, outputVolumeL: 3000, target: { mode: "NEW", vintage: 2024 } });
  created.lots.push(base.lotId);
  const add = await crushLotCore(ACTOR, { commandId: uid(), picks: [{ pickId: pick2.id, consumedKg: 4000 }], destVesselId: tankB, outputVolumeL: 2800, target: { mode: "ADD", lotId: base.lotId } });
  assert((await lotVol(tankB, base.lotId)) === 5800, "ADD grew the must lot to 5800 L");
  assert((await remainingKg(pick2.id)) === 8000, "pick2 fully consumed (4000+4000)");
  const rc2 = await reverseOperationCore(ACTOR, { operationId: add.operationId });
  assert(rc2.reversedType === "CRUSH" && (await lotVol(tankB, base.lotId)) === 3000, "ADD reversed: lot back to 3000 L (only the added must removed)");
  assert((await statusOf(base.lotId)) === "ACTIVE", "the pre-existing lot is NOT marked corrected (ADD keeps identity)");
  assert((await remainingKg(pick2.id)) === 4000, "the ADD's 4000 kg freed; the base crush's 4000 kg still consumed");

  // ── 3. CRUSH downstream guard: a crush that was later pressed can't be reversed ──
  console.log("\n── 3. CRUSH downstream guard ──");
  const crushP = await crushLotCore(ACTOR, { commandId: uid(), picks: [{ pickId: pick3.id, consumedKg: 4000 }], destVesselId: tankC, outputVolumeL: 3000, target: { mode: "NEW", vintage: 2024 } });
  created.lots.push(crushP.lotId);
  const pressed = await pressLotCore(ACTOR, { commandId: uid(), parentLotId: crushP.lotId, sourceVesselId: tankC, fractions: [{ destVesselId: tankD, volumeL: 3000, label: "free-run" }] });
  created.lots.push(pressed.fractions[0].lotId);
  await assertThrows(() => reverseOperationCore(ACTOR, { operationId: crushP.operationId }), "reversing a later-pressed crush is BLOCKED");

  // ── 4. PRESS reverse: return the drawn volume to the parent, void the fractions ──
  console.log("\n── 4. PRESS reverse ──");
  const parentVolBefore = await lotVol(tankC, crushP.lotId); // 0 — fully pressed above; press #3 drew it all
  assert(parentVolBefore === 0, "the pressed parent was fully drawn (0 L left in tank)");
  const rc4 = await reverseOperationCore(ACTOR, { operationId: pressed.operationId });
  assert(rc4.reversedType === "PRESS", "dispatcher routes PRESS → transform reversal");
  assert((await lotVol(tankC, crushP.lotId)) === 3000, "press reversed: 3000 L returned to the parent in its tank");
  assert((await lotVol(tankD, pressed.fractions[0].lotId)) === 0, "the free-run fraction drained to zero");
  assert((await statusOf(pressed.fractions[0].lotId)) === "CORRECTED", "the NEW fraction lot marked CORRECTED");
  const splitEdge = await prisma.lotLineage.findFirst({ where: { parentLotId: crushP.lotId, childLotId: pressed.fractions[0].lotId } });
  assert(splitEdge != null, "SPLIT lineage edge is KEPT (append-only, points at the corrected child)");

  // ── 5. SAIGNEE reverse: the bled juice returns to the must ──
  console.log("\n── 5. SAIGNEE reverse ──");
  // Fresh must lot to bleed from.
  const mustS = await crushLotCore(ACTOR, { commandId: uid(), picks: [{ pickId: pick1.id, consumedKg: 5000 }], destVesselId: tankA, outputVolumeL: 3600, target: { mode: "NEW", vintage: 2024 } });
  created.lots.push(mustS.lotId);
  const sai = await pressLotCore(ACTOR, { commandId: uid(), parentLotId: mustS.lotId, sourceVesselId: tankA, op: "SAIGNEE", fractions: [{ destVesselId: tankE, volumeL: 400, label: "rosé" }] });
  created.lots.push(sai.fractions[0].lotId);
  assert((await lotVol(tankA, mustS.lotId)) === 3200 && (await lotVol(tankE, sai.fractions[0].lotId)) === 400, "saignée bled 400 L off the must (3600 → 3200 + 400 juice)");
  const rc5 = await reverseOperationCore(ACTOR, { operationId: sai.operationId });
  assert(rc5.reversedType === "SAIGNEE" && (await lotVol(tankA, mustS.lotId)) === 3600, "saignée reversed: 400 L returned to the must (back to 3600)");
  assert((await statusOf(sai.fractions[0].lotId)) === "CORRECTED", "the bled juice lot marked CORRECTED");

  // ── 6. PRESS merged-fraction reverse is refused (no lineage snapshot) ──
  console.log("\n── 6. PRESS merged-fraction refuse ──");
  const mustM = await crushLotCore(ACTOR, { commandId: uid(), picks: [{ pickId: pick2.id, consumedKg: 3000 }], destVesselId: tankB, outputVolumeL: 2200, target: { mode: "NEW", vintage: 2024 } });
  created.lots.push(mustM.lotId);
  const mergeDest = await crushLotCore(ACTOR, { commandId: uid(), picks: [{ pickId: pick3.id, consumedKg: 2000 }], destVesselId: tankD, outputVolumeL: 1500, target: { mode: "NEW", vintage: 2024 } });
  created.lots.push(mergeDest.lotId);
  const pressM = await pressLotCore(ACTOR, { commandId: uid(), parentLotId: mustM.lotId, sourceVesselId: tankB, fractions: [{ destVesselId: tankD, volumeL: 2200, label: "hard", mergeIntoLotId: mergeDest.lotId }] });
  await assertThrows(() => reverseOperationCore(ACTOR, { operationId: pressM.operationId }), "reversing a press with a merged fraction is refused with guidance");

  // ── 7. Pick over-restore guard: a crush whose consumption changed since is refused ──
  console.log("\n── 7. Pick over-restore guard ──");
  const crushG = await crushLotCore(ACTOR, { commandId: uid(), picks: [{ pickId: pick3.id, consumedKg: 1000 }], destVesselId: tankE, outputVolumeL: 700, target: { mode: "NEW", vintage: 2024 } });
  created.lots.push(crushG.lotId);
  // Simulate the pick's consumption changing out from under the reverse (row weight edited).
  await prisma.lotHarvestSource.updateMany({ where: { lotId: crushG.lotId, harvestPickId: pick3.id }, data: { consumedKg: 1234 } });
  await assertThrows(() => reverseOperationCore(ACTOR, { operationId: crushG.operationId }), "crush reverse is refused when the pick consumption no longer matches");
  await prisma.lotHarvestSource.updateMany({ where: { lotId: crushG.lotId, harvestPickId: pick3.id }, data: { consumedKg: 1000 } }); // restore so it can be reversed + scrubbed
  await reverseOperationCore(ACTOR, { operationId: crushG.operationId });

  // ── 8. BLEND NEW_LOT reverse via dispatcher ──
  console.log("\n── 8. BLEND NEW_LOT reverse ──");
  const p1 = await seedWineLot("ZRT-BL-P1", tankF, 500, vineyard.id);
  const p2 = await seedWineLot("ZRT-BL-P2", tankG, 500, vineyard.id);
  const blendNew = await blendLotsCore(ACTOR, { mode: "NEW_LOT", token: "ZRB", components: [{ vesselId: tankF, lotId: p1, drawL: 300 }, { vesselId: tankG, lotId: p2, drawL: 300 }], toVesselId: tankH });
  created.lots.push(blendNew.childLotId);
  assert((await lotVol(tankH, blendNew.childLotId)) === 600, "NEW_LOT blend made a 600 L child");
  const blendOp = await prisma.lotOperation.findUnique({ where: { id: blendNew.operationId }, select: { metadata: true } });
  assert((blendOp?.metadata as { mode?: string } | null)?.mode === "NEW_LOT", "blend op stamped metadata.mode=NEW_LOT");
  const rc8 = await reverseOperationCore(ACTOR, { operationId: blendNew.operationId });
  assert(rc8.reversedType === "BLEND", "dispatcher routes BLEND → blend reversal");
  assert((await lotVol(tankF, p1)) === 500 && (await lotVol(tankG, p2)) === 500, "NEW_LOT blend reversed: both parents restored to 500 L");
  assert((await statusOf(blendNew.childLotId)) === "CORRECTED", "the NEW blend child marked CORRECTED");

  // ── 9. BLEND GROW_EXISTING reverse: resident kept, its added lineage removed (MUST-FIX #4) ──
  console.log("\n── 9. BLEND GROW_EXISTING reverse ──");
  const resident = await seedWineLot("ZRT-GROW-R", tankI, 500, vineyard.id);
  const foreign = await seedWineLot("ZRT-GROW-P", tankJ, 300, vineyard.id);
  const grow = await blendLotsCore(ACTOR, { mode: "GROW_EXISTING", components: [{ vesselId: tankJ, lotId: foreign, drawL: 300 }], toVesselId: tankI });
  assert(grow.childLotId === resident && (await lotVol(tankI, resident)) === 800, "GROW blend grew the resident to 800 L (500 + 300)");
  const growOp = await prisma.lotOperation.findUnique({ where: { id: grow.operationId }, select: { metadata: true } });
  assert((growOp?.metadata as { mode?: string } | null)?.mode === "GROW_EXISTING", "grow blend op stamped metadata.mode=GROW_EXISTING");
  const edgeBefore = await prisma.lotLineage.findFirst({ where: { parentLotId: foreign, childLotId: resident } });
  assert(edgeBefore != null, "GROW blend added a BLEND lineage edge foreign → resident");
  const rc9 = await reverseOperationCore(ACTOR, { operationId: grow.operationId });
  assert(rc9.reversedType === "BLEND" && (await lotVol(tankJ, foreign)) === 300, "GROW reversed: foreign parent restored to 300 L");
  assert((await lotVol(tankI, resident)) === 500, "resident shrank back to its pre-blend 500 L");
  assert((await statusOf(resident)) === "ACTIVE", "the resident is NOT marked corrected (GROW keeps identity — MUST-FIX #4)");
  const edgeAfter = await prisma.lotLineage.findFirst({ where: { parentLotId: foreign, childLotId: resident } });
  assert(edgeAfter == null, "the lineage edge the blend ADDED was removed (pre-op lineage restored, not blind-kept)");

  assert(await projectionMatchesFold(), "projection == fold at the end of the run");
  console.log(`\nALL ${passed} 024b REVERSAL ASSERTIONS PASSED (crush NEW/ADD + downstream guard + press + saignée + merged-refuse + pick guard + blend NEW_LOT + GROW)`);
}

async function scrub() {
  const [pV, pVy] = await Promise.all([
    prisma.variety.findMany({ where: { OR: [{ name: { startsWith: "ZRT" } }, { abbreviation: "ZRT" }] }, select: { id: true } }),
    prisma.vineyard.findMany({ where: { OR: [{ name: { startsWith: "ZRT-REV" } }, { abbreviation: "ZRV" }] }, select: { id: true } }),
  ]);
  const varietyIds = [...new Set([...created.varieties, ...pV.map((v) => v.id)])];
  const vineyardIds = [...new Set([...created.vineyards, ...pVy.map((v) => v.id)])];
  const pBlocks = await prisma.vineyardBlock.findMany({ where: { OR: [{ id: { in: created.blocks } }, { vineyardId: { in: vineyardIds } }] }, select: { id: true } });
  const blockIds = [...new Set([...created.blocks, ...pBlocks.map((b) => b.id)])];
  const pRecords = await prisma.harvestRecord.findMany({ where: { OR: [{ id: { in: created.records } }, { blockId: { in: blockIds } }] }, select: { id: true } });
  const recordIds = [...new Set([...created.records, ...pRecords.map((r) => r.id)])];
  const patternLots = await prisma.lot.findMany({ where: { OR: [{ code: { startsWith: "2024-ZRV" } }, { code: { startsWith: "ZRT-" } }, { code: { contains: "-ZRB-" } }, { id: { in: created.lots } }, { originVineyardId: { in: vineyardIds } }] }, select: { id: true } });
  const ids = [...new Set([...created.lots, ...patternLots.map((l) => l.id)])];

  // Break the correctsOperationId Restrict FK among our ops before deleting them.
  await prisma.lotOperation.updateMany({ where: { enteredBy: ACTOR.actorEmail }, data: { correctsOperationId: null } }).catch(() => {});
  await prisma.lotHarvestSource.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.lotStateEvent.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.lotTreatment.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: ids } }, { childLotId: { in: ids } }] } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } }).catch(() => {}); // cascades lines
  await prisma.vesselLot.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.lotVineyard.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.harvestPick.deleteMany({ where: { harvestRecordId: { in: recordIds } } }).catch(() => {});
  await prisma.harvestRecord.deleteMany({ where: { id: { in: recordIds } } }).catch(() => {});
  await prisma.vesselComponent.deleteMany({ where: { OR: [{ varietyId: { in: varietyIds } }, { vineyardId: { in: vineyardIds } }] } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "ZRT-" } } }).catch(() => {});
  await prisma.vineyardBlock.deleteMany({ where: { id: { in: blockIds } } }).catch(() => {});
  await prisma.variety.deleteMany({ where: { id: { in: varietyIds } } }).catch(() => {});
  await prisma.vineyard.deleteMany({ where: { id: { in: vineyardIds } } }).catch(() => {});
}

runAsTenant("org_bhutan_wine_co", async () => { await scrub(); await main().then(scrub); const ok = await projectionMatchesFold(); console.log(ok ? "POST-SCRUB: projection == fold (DB pristine)." : "POST-SCRUB WARNING: drift!"); return ok; })
  .then(async (ok) => { await prisma.$disconnect(); process.exit(ok ? 0 : 1); })
  .catch(async (e) => { console.error("\nFAILED:", e); try { await runAsTenant("org_bhutan_wine_co", scrub); } catch (se) { console.error("scrub error:", se); } await prisma.$disconnect(); process.exit(1); });
