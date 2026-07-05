/**
 * Plan 024a — universal timeline undo end-to-end verification.
 *
 * Drives the real CORES through reverseOperationCore (the dispatcher the UI calls) for every
 * 024a-reversible family — cellar (neutral void + volumetric revert), RACK, BOTTLE (still wine),
 * and sparkling (routing smoke) — and asserts:
 *   • the ledger invariant holds after each reversal (vessel-fold == projection),
 *   • the reversed op is marked corrected (append-only — never deleted),
 *   • the shared LIFO guard unwinds a chain (A→B→reverse-B→reverse-A) and blocks while a later
 *     un-reversed op stands,
 *   • neutral cellar ops reverse LOOSELY (a later volumetric op does NOT block them),
 *   • non-undoable types (SEED / CORRECTION) fail closed with a reason,
 *   • a cross-tenant reversal is denied.
 * Everything is created under ZZ-TEST / system@verify-reverse fixtures and scrubbed in a finally.
 *
 * Run:  npx tsx --env-file=.env scripts/verify-reverse.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { rackWineCore } from "@/lib/vessels/rack-core";
import { recordLossCore } from "@/lib/cellar/loss";
import { addAdditionCore } from "@/lib/cellar/addition";
import { executeBottling } from "@/lib/bottling/run";
import { tirageCore } from "@/lib/sparkling/tirage-core";
import { reverseOperationCore } from "@/lib/ledger/reverse";
import type { LotForm, AlcoholicFermState } from "@/lib/ledger/vocabulary";

const TENANT = "org_bhutan_wine_co";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-reverse" };
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}
async function assertThrows(fn: () => Promise<unknown>, msg: string): Promise<string> {
  try {
    await fn();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    passed++;
    console.log(`  ✓ ${msg} (${m})`);
    return m;
  }
  throw new Error(`ASSERT FAILED: expected throw — ${msg}`);
}

const created = { vineyardIds: [] as string[], vesselIds: [] as string[], lotIds: [] as string[], locationIds: [] as string[], materialIds: [] as string[] };

async function seedLot(code: string, vesselId: string, volumeL: number, vineyardId: string, form: LotForm = "WINE", afState: AlcoholicFermState = "DRY"): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, form, afState, originVineyardId: vineyardId, vintageYear: 2024 } });
  created.lotIds.push(lot.id);
  await prisma.lotVineyard.create({ data: { lotId: lot.id, vineyardId } });
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [{ lotId: lot.id, vesselId, deltaL: volumeL }, { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" }] as LedgerLine[],
      actorUserId: null, enteredBy: ACTOR.actorEmail, lotCodes: new Map([[lot.id, code]]), vesselCodes: new Map(), capacityByVessel: new Map([[vesselId, 3000]]),
    }),
  );
  return lot.id;
}

const vesselVol = async (vesselId: string, lotId: string) =>
  Number((await prisma.vesselLot.findFirst({ where: { vesselId, lotId } }))?.volumeL ?? 0);
const isCorrected = async (operationId: number) =>
  (await prisma.lotOperation.findUnique({ where: { id: operationId }, select: { correctedBy: { select: { id: true } } } }))?.correctedBy != null;
const latestOp = async (type: string, lotId: string) =>
  (await prisma.lotOperation.findFirst({ where: { type: type as never, correctedBy: { is: null }, OR: [{ lines: { some: { lotId } } }, { treatments: { some: { lotId } } }] }, orderBy: { id: "desc" }, select: { id: true } }))?.id ?? null;

/** The ledger invariant: the sum of a lot's VESSEL-bucket legs equals its live projection volume. */
async function assertFoldMatchesProjection(lotId: string, msg: string) {
  const fold = await prisma.lotOperationLine.aggregate({ where: { lotId, bucket: "VESSEL" }, _sum: { deltaL: true } });
  const proj = await prisma.vesselLot.aggregate({ where: { lotId }, _sum: { volumeL: true } });
  const f = Math.round(Number(fold._sum.deltaL ?? 0) * 100) / 100;
  const p = Math.round(Number(proj._sum.volumeL ?? 0) * 100) / 100;
  assert(f === p, `${msg} — vessel-fold (${f} L) == projection (${p} L)`);
}

async function main() {
  await prisma.$queryRaw`SELECT 1`; // warm the connection (Neon single-CU cold start → P2028)

  const vy = await prisma.vineyard.create({ data: { name: "ZZ-TEST Reverse VY" } });
  created.vineyardIds.push(vy.id);
  const loc = await prisma.location.create({ data: { name: "ZZ-TEST Reverse Cellar" } });
  created.locationIds.push(loc.id);
  const so2 = await prisma.cellarMaterial.create({ data: { name: "ZZ Reverse SO2", normalizedKey: "ZZREVSO2", kind: "SO2" } });
  created.materialIds.push(so2.id);

  // ── 1. Cellar volumetric (LOSS) reverse via the dispatcher ──
  console.log("\n── 1. Cellar volumetric reverse (LOSS) ──");
  const tank1 = await prisma.vessel.create({ data: { code: "ZZ-RV-1", type: "TANK", capacityL: 3000 } });
  created.vesselIds.push(tank1.id);
  const lot1 = await seedLot("ZZ-RV-LOT1", tank1.id, 500, vy.id);
  await recordLossCore(ACTOR, { vesselId: tank1.id, lossL: 120 });
  assert((await vesselVol(tank1.id, lot1)) === 380, "after LOSS: 380 L remain");
  const lossOp = (await latestOp("LOSS", lot1))!;
  const r1 = await reverseOperationCore(ACTOR, { operationId: lossOp });
  assert(r1.reversedType === "LOSS" && r1.correctionId != null, "dispatcher routes LOSS to the cellar core");
  assert((await vesselVol(tank1.id, lot1)) === 500, "LOSS reversed: 500 L restored");
  assert(await isCorrected(lossOp), "reversed LOSS op is marked corrected (append-only)");
  await assertFoldMatchesProjection(lot1, "after LOSS reverse");

  // ── 2. Neutral cellar op (ADDITION) reverses LOOSELY — a later LOSS does NOT block it ──
  console.log("\n── 2. Neutral reverse is loose (decision 3) ──");
  await addAdditionCore(ACTOR, { vesselId: tank1.id, materialId: so2.id, rateValue: 30, rateBasis: "G_L" });
  const addOp = (await latestOp("ADDITION", lot1))!;
  await recordLossCore(ACTOR, { vesselId: tank1.id, lossL: 50 }); // a LATER volumetric op
  const r2 = await reverseOperationCore(ACTOR, { operationId: addOp });
  assert(r2.reversedType === "ADDITION", "neutral ADDITION reverses even with a later LOSS standing (loose LIFO)");
  assert(await isCorrected(addOp), "reversed ADDITION op is marked corrected (treatment voided)");
  const voided = await prisma.lotTreatment.findFirst({ where: { operationId: addOp }, select: { voidedByOperationId: true } });
  assert(voided?.voidedByOperationId != null, "the addition's treatment carries voidedByOperationId");
  // clean up the later LOSS so tank1 is tidy (not asserted)
  const laterLoss = (await latestOp("LOSS", lot1))!;
  await reverseOperationCore(ACTOR, { operationId: laterLoss });

  // ── 3. Shared LIFO guard: A→B→reverse-B→reverse-A across the cellar family (Unit 2 characterization) ──
  console.log("\n── 3. LIFO chain unwind (A→B→reverse-B→reverse-A) ──");
  const tank2 = await prisma.vessel.create({ data: { code: "ZZ-RV-2", type: "TANK", capacityL: 3000 } });
  created.vesselIds.push(tank2.id);
  const lot2 = await seedLot("ZZ-RV-LOT2", tank2.id, 500, vy.id);
  await recordLossCore(ACTOR, { vesselId: tank2.id, lossL: 100 }); // op A
  const opA = (await latestOp("LOSS", lot2))!;
  await recordLossCore(ACTOR, { vesselId: tank2.id, lossL: 100 }); // op B (later, same position)
  const opB = (await latestOp("LOSS", lot2))!;
  await assertThrows(() => reverseOperationCore(ACTOR, { operationId: opA }), "reversing A is BLOCKED while later B stands (strict LIFO on volume)");
  await reverseOperationCore(ACTOR, { operationId: opB });
  assert((await vesselVol(tank2.id, lot2)) === 400, "reverse B: 400 L");
  const r3 = await reverseOperationCore(ACTOR, { operationId: opA });
  assert(r3.reversedType === "LOSS" && (await vesselVol(tank2.id, lot2)) === 500, "reverse A now succeeds (B already reversed → chain unwound): 500 L");
  await assertFoldMatchesProjection(lot2, "after chain unwind");

  // ── 4. RACK reverse via the dispatcher (opId → transferId resolver) ──
  console.log("\n── 4. RACK reverse ──");
  const tankFrom = await prisma.vessel.create({ data: { code: "ZZ-RV-FROM", type: "TANK", capacityL: 3000 } });
  const tankTo = await prisma.vessel.create({ data: { code: "ZZ-RV-TO", type: "TANK", capacityL: 3000 } });
  created.vesselIds.push(tankFrom.id, tankTo.id);
  const lot4 = await seedLot("ZZ-RV-LOT4", tankFrom.id, 500, vy.id);
  const rack = await rackWineCore(ACTOR, { fromVesselId: tankFrom.id, toVesselId: tankTo.id, drawL: 300 });
  assert((await vesselVol(tankTo.id, lot4)) === 300, "rack moved 300 L into the destination");
  const rackOpId = (await prisma.vesselTransfer.findUnique({ where: { id: rack.transferId }, select: { lotOperationId: true } }))!.lotOperationId!;
  const r4 = await reverseOperationCore(ACTOR, { operationId: rackOpId });
  assert(r4.reversedType === "RACK", "dispatcher routes RACK to revertTransferCore via the transferId resolver");
  assert((await vesselVol(tankFrom.id, lot4)) === 500 && (await vesselVol(tankTo.id, lot4)) === 0, "rack reversed: 500 L back in source, destination emptied");
  const t = await prisma.vesselTransfer.findUnique({ where: { id: rack.transferId }, select: { revertedAt: true } });
  assert(t?.revertedAt != null && (await isCorrected(rackOpId)), "original transfer marked reverted + RACK op corrected");
  await assertFoldMatchesProjection(lot4, "after RACK reverse");

  // ── 5. BOTTLE (still wine) reverse via the dispatcher (opId → runId from metadata) ──
  console.log("\n── 5. BOTTLE reverse ──");
  const tankBot = await prisma.vessel.create({ data: { code: "ZZ-RV-BOT", type: "TANK", capacityL: 3000 } });
  created.vesselIds.push(tankBot.id);
  const lot5 = await seedLot("ZZ-RV-LOT5", tankBot.id, 750, vy.id);
  const before = await vesselVol(tankBot.id, lot5);
  await executeBottling({ vesselIds: [tankBot.id], destinationLocationId: loc.id, skuName: "ZZ-TEST Reverse Still", skuVintage: 2024, bottlesProduced: 500, abv: 13.5, date: new Date("2026-07-01") }, ACTOR);
  const afterBottle = await vesselVol(tankBot.id, lot5);
  assert(afterBottle < before, `bottling drew wine out of the tank (${before} → ${afterBottle} L)`);
  const bottleOpId = (await latestOp("BOTTLE", lot5))!;
  const meta = await prisma.lotOperation.findUnique({ where: { id: bottleOpId }, select: { metadata: true } });
  assert((meta?.metadata as { runId?: string } | null)?.runId != null, "BOTTLE op carries metadata.runId (Unit 1 stamp)");
  const r5 = await reverseOperationCore(ACTOR, { operationId: bottleOpId });
  assert(r5.reversedType === "BOTTLE", "dispatcher routes BOTTLE to reverseBottlingRun via the runId resolver");
  assert(Math.abs((await vesselVol(tankBot.id, lot5)) - before) < 0.5, "BOTTLE reversed: bulk restored to the tank");
  assert(await isCorrected(bottleOpId), "reversed BOTTLE op marked corrected (SEED restore stamped correctsOperationId)");
  const stillInv = await prisma.bottledInventory.findFirst({ where: { wineSku: { name: "ZZ-TEST Reverse Still" } }, select: { totalBottles: true } });
  assert(stillInv == null || stillInv.totalBottles === 0, "finished bottles removed from inventory");

  // ── 6. Sparkling routing smoke: TIRAGE reversed through the dispatcher (no gate at core level) ──
  console.log("\n── 6. Sparkling routing (TIRAGE → tank) ──");
  const tankSpk = await prisma.vessel.create({ data: { code: "ZZ-RV-SPK", type: "TANK", capacityL: 3000 } });
  created.vesselIds.push(tankSpk.id);
  const lot6 = await seedLot("ZZ-RV-LOT6", tankSpk.id, 750, vy.id, "WINE", "NONE");
  await tirageCore(ACTOR, { lotId: lot6, sources: [{ vesselId: tankSpk.id, drawL: 750 }], bottleCount: 1000, method: "TRADITIONAL", locationId: loc.id });
  const tirageOpId = (await latestOp("TIRAGE", lot6))!;
  const r6 = await reverseOperationCore(ACTOR, { operationId: tirageOpId });
  assert(r6.reversedType === "TIRAGE", "dispatcher routes TIRAGE to the sparkling core");
  assert((await vesselVol(tankSpk.id, lot6)) === 750 && (await prisma.bottledLotState.findUnique({ where: { lotId: lot6 } })) === null, "tirage reversed: 750 L back in tank, bottle state gone");
  await assertFoldMatchesProjection(lot6, "after TIRAGE reverse");

  // ── 7. Non-undoable types fail closed with a reason ──
  console.log("\n── 7. Non-undoable + already-reversed guards ──");
  const seedOpId = (await prisma.lotOperation.findFirst({ where: { type: "SEED", lines: { some: { lotId: lot6 } } }, select: { id: true } }))!.id;
  await assertThrows(() => reverseOperationCore(ACTOR, { operationId: seedOpId }), "SEED (day-zero origination) is non-undoable");
  await assertThrows(() => reverseOperationCore(ACTOR, { operationId: r1.correctionId! }), "a CORRECTION op can't itself be reversed");
  await assertThrows(() => reverseOperationCore(ACTOR, { operationId: lossOp }), "an already-reversed op can't be reversed again");

  // ── 8. Tenant parity: a cross-tenant reverse is denied ──
  console.log("\n── 8. Tenant parity ──");
  const freshLossTank = await prisma.vessel.create({ data: { code: "ZZ-RV-TEN", type: "TANK", capacityL: 3000 } });
  created.vesselIds.push(freshLossTank.id);
  const lot8 = await seedLot("ZZ-RV-LOT8", freshLossTank.id, 300, vy.id);
  await recordLossCore(ACTOR, { vesselId: freshLossTank.id, lossL: 50 });
  const crossOp = (await latestOp("LOSS", lot8))!;
  await assertThrows(
    () => runAsTenant("org_ZZ_other_winery", () => reverseOperationCore(ACTOR, { operationId: crossOp })),
    "reversing an op that belongs to another tenant is denied",
  );
  // and it's still reversible under the right tenant (the guard didn't corrupt anything)
  const r8 = await reverseOperationCore(ACTOR, { operationId: crossOp });
  assert(r8.reversedType === "LOSS" && (await vesselVol(freshLossTank.id, lot8)) === 300, "same op reverses cleanly under its own tenant");

  console.log(`\nALL ${passed} REVERSAL ASSERTIONS PASSED (cellar volumetric + neutral-loose + LIFO unwind + RACK + BOTTLE + sparkling routing + non-undoable + tenant parity)`);
}

async function scrub() {
  // Orphan-robust: match by the ZZ-RV*/ZZ-TEST* fixture namespaces + the verify actor, NOT just this
  // process's in-memory ids — so a PRIOR run whose own scrub was interrupted (P2024/P2028) is cleaned
  // on the next pre-run scrub instead of colliding (P2002 on Lot.code) forever.
  const opRows = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } }).catch(() => [] as { id: number }[]);
  const opIds = opRows.map((o) => o.id);
  const lotRows = await prisma.lot.findMany({ where: { code: { startsWith: "ZZ-RV" } }, select: { id: true } }).catch(() => [] as { id: string }[]);
  const ids = lotRows.map((l) => l.id);
  const matRows = await prisma.cellarMaterial.findMany({ where: { OR: [{ normalizedKey: "ZZREVSO2" }, { name: { startsWith: "ZZ Reverse" } }] }, select: { id: true } }).catch(() => [] as { id: string }[]);
  const matIds = matRows.map((m) => m.id);
  const vesselRows = await prisma.vessel.findMany({ where: { code: { startsWith: "ZZ-RV" } }, select: { id: true } }).catch(() => [] as { id: string }[]);
  const vesselIds = vesselRows.map((v) => v.id);
  const runs = await prisma.bottlingRun.findMany({ where: { wineSku: { name: { startsWith: "ZZ-TEST" } } }, select: { id: true } }).catch(() => [] as { id: string }[]);
  const runIds = runs.map((r) => r.id);
  const skus = await prisma.wineSku.findMany({ where: { name: { startsWith: "ZZ-TEST" } }, select: { id: true } }).catch(() => [] as { id: string }[]);
  const skuIds = skus.map((s) => s.id);
  const snaps = await prisma.bottlingCostSnapshot.findMany({ where: { OR: [{ runId: { in: runIds } }, { skuId: { in: skuIds } }] }, select: { id: true } }).catch(() => [] as { id: string }[]);
  const snapIds = snaps.map((s) => s.id);
  const exportEvents = await prisma.costExportEvent.findMany({ where: { OR: [{ sourceSnapshotId: { in: snapIds } }, { runId: { in: runIds } }, { skuId: { in: skuIds } }] }, select: { id: true } }).catch(() => [] as { id: string }[]);
  const exportEventIds = exportEvents.map((e) => e.id);

  // Break the correctsOperationId Restrict FK among our ops before deleting them.
  await prisma.lotOperation.updateMany({ where: { enteredBy: ACTOR.actorEmail }, data: { correctsOperationId: null } }).catch(() => {});
  // FK-safe order: accounting outbox → cost artifacts → COGS snapshot → stock/inventory/run → sku →
  // supplies → transfers → treatments/state → ops (cascades lines) → lineage → lots → material →
  // vessels (cascades vessel_lot) → location → vineyard.
  await prisma.accountingDelivery.deleteMany({ where: { costExportEventId: { in: exportEventIds } } }).catch(() => {});
  await prisma.costExportEvent.deleteMany({ where: { id: { in: exportEventIds } } }).catch(() => {});
  await prisma.costVarianceEvent.deleteMany({ where: { OR: [{ snapshotId: { in: snapIds } }, { runId: { in: runIds } }] } }).catch(() => {});
  await prisma.supplyConsumption.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.costLine.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.bottlingCostSnapshot.deleteMany({ where: { id: { in: snapIds } } }).catch(() => {});
  await prisma.bottlingSource.deleteMany({ where: { OR: [{ lotId: { in: ids } }, { bottlingRunId: { in: runIds } }] } }).catch(() => {});
  await prisma.stockMovement.deleteMany({ where: { OR: [{ bottlingRunId: { in: runIds } }, { wineSkuId: { in: skuIds } }] } }).catch(() => {});
  await prisma.bottlingRun.deleteMany({ where: { id: { in: runIds } } }).catch(() => {});
  await prisma.bottledInventory.deleteMany({ where: { wineSkuId: { in: skuIds } } }).catch(() => {});
  await prisma.wineSku.deleteMany({ where: { id: { in: skuIds } } }).catch(() => {});
  await prisma.supplyLot.deleteMany({ where: { materialId: { in: matIds } } }).catch(() => {});
  await prisma.vesselTransfer.deleteMany({ where: { OR: [{ fromVesselId: { in: vesselIds } }, { toVesselId: { in: vesselIds } }, { lotOperationId: { in: opIds } }] } }).catch(() => {});
  await prisma.lotStateEvent.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.lotTreatment.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.bottledLotState.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: ids } }, { childLotId: { in: ids } }] } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } }).catch(() => {}); // cascades lines
  await prisma.vesselLot.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.lotVineyard.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.cellarMaterial.deleteMany({ where: { id: { in: matIds } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { id: { in: vesselIds } } }).catch(() => {});
  await prisma.location.deleteMany({ where: { name: { startsWith: "ZZ-TEST Reverse" } } }).catch(() => {});
  await prisma.vineyard.deleteMany({ where: { name: { startsWith: "ZZ-TEST Reverse" } } }).catch(() => {});
}

runAsTenant(TENANT, async () => { await scrub(); await main().then(scrub); })
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error("\nFAILED:", e); try { await runAsTenant(TENANT, scrub); } catch (se) { console.error("scrub error:", se); } await prisma.$disconnect(); process.exit(1); });
