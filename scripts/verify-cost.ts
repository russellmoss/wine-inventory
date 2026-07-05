/**
 * Phase 8 cost roll-up end-to-end verification against the live DB (grows with each unit; Unit 17
 * makes it the full conservation proof). Builds isolated ZZ-COST-* fixtures, drives the real cores
 * (no UI), asserts the physical + cost effects, and scrubs everything in a finally path.
 *
 * Neon cold-start: wake the compute first (a Neon MCP `SELECT 1`) and run with widened timeouts —
 *   DATABASE_URL_UNPOOLED="…&connect_timeout=30&pool_timeout=30" \
 *   DATABASE_URL="…&connect_timeout=30&pool_timeout=30" \
 *   npx tsx scripts/verify-cost.ts      (no --env-file, so the exported URLs stick)
 *
 * Current coverage: Unit 3 — receive a costed supply, dose a lot via ADDITION, assert stock draws
 * down (SupplyConsumption) and a MATERIAL CostLine is written at the right cost + completeness.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { addAdditionCore } from "@/lib/cellar/addition";
import { correctOperationCore } from "@/lib/cellar/correct";
import { normalizeMaterialKey } from "@/lib/cellar/material-normalize";
import { createStockMaterialCore, receiveSupplyCore, listMaterials } from "@/lib/cellar/materials";
import { receiveBulkWineCostCore } from "@/lib/cost/receive";
import { emitExportForSnapshot } from "@/lib/cost/export-emit";
import { executeBottling } from "@/lib/bottling/run";
import { getLotCost } from "@/lib/cost/cache";
import { round2 } from "@/lib/bottling/draw";

// Phase 8: dev/QA runs in the Demo Winery sandbox tenant, never the real Bhutan Wine Co. (AGENTS.md).
// Requires `npm run seed:demo-tenant` first so org_demo_winery exists.
const TENANT = "org_demo_winery";

const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-cost" };
const r2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

const createdVesselIds: string[] = [];
const createdLotIds: string[] = [];
const createdMaterialIds: string[] = [];
const createdLocationIds: string[] = [];
const KMBS_KEY = normalizeMaterialKey("ZZCOST KMBS");

async function seedLot(code: string, vesselId: string, volumeL: number, ownership: "ESTATE" | "CUSTOM_CRUSH_CLIENT" = "ESTATE"): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, form: "WINE", ownership } });
  createdLotIds.push(lot.id);
  const vessel = await prisma.vessel.findUniqueOrThrow({ where: { id: vesselId } });
  const lines: LedgerLine[] = [
    { lotId: lot.id, vesselId, deltaL: volumeL },
    { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" },
  ];
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines,
      actorUserId: null,
      enteredBy: ACTOR.actorEmail,
      note: "verify-cost seed",
      lotCodes: new Map([[lot.id, code]]),
      vesselCodes: new Map([[vesselId, vessel.code]]),
      capacityByVessel: new Map([[vesselId, Number(vessel.capacityL)]]),
    }),
  );
  return lot.id;
}

async function scrub() {
  console.log("\n── scrubbing test data ──");
  // Idempotent + robust to a PRIOR run whose own scrub was interrupted (high-latency P2024/P2028):
  // match by the ZZ-COST* / ZZCOST* code patterns + the verify actor, NOT just this process's ids.
  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } });
  const opIds = ops.map((o) => o.id);
  const lots = await prisma.lot.findMany({ where: { code: { startsWith: "ZZCOST" } }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  // Match every ZZCOST supply (KMBS + the U10/U12/U16 fixtures), not just the KMBS key.
  const mats = await prisma.cellarMaterial.findMany({ where: { OR: [{ normalizedKey: KMBS_KEY }, { name: { startsWith: "ZZCOST" } }] }, select: { id: true } });
  const matIds = mats.map((m) => m.id);
  const skus = await prisma.wineSku.findMany({ where: { name: { startsWith: "ZZCOST" } }, select: { id: true } });
  const skuIds = skus.map((s) => s.id);
  const runs = await prisma.bottlingRun.findMany({ where: { wineSkuId: { in: skuIds } }, select: { id: true } });
  const runIds = runs.map((r) => r.id);
  const vessels = await prisma.vessel.findMany({ where: { code: { startsWith: "ZZ-COST" } }, select: { id: true } });
  const vesselIds = vessels.map((v) => v.id);
  const snaps = await prisma.bottlingCostSnapshot.findMany({ where: { OR: [{ runId: { in: runIds } }, { skuId: { in: skuIds } }] }, select: { id: true } });
  const snapIds = snaps.map((s) => s.id);
  // FK-safe: cost artifacts (RESTRICT → op/supplyLot) → COGS snapshot (RESTRICT → run/sku) → stock/
  // inventory/run → sku → supplies → treatments → ops (cascades lines) → lineage → vessels (cascades
  // vessel_lot) → lots → material → location (run→location RESTRICT, so after runs).
  // Phase 8b: export events + variance events reference snapshots (RESTRICT) → delete first; account
  // mappings are matched by the ZZ- account codes the fixtures use; barrel fills reference ops (RESTRICT).
  const exportEvents = await prisma.costExportEvent.findMany({ where: { OR: [{ sourceSnapshotId: { in: snapIds } }, { runId: { in: runIds } }, { skuId: { in: skuIds } }] }, select: { id: true } });
  const exportEventIds = exportEvents.map((e) => e.id);
  // Phase 15/16: the accounting outbox references cost export events (composite-tenant FK, RESTRICT) —
  // delete any PENDING/settled delivery BEFORE its export event or the scrub hits P2003 on a prior
  // run's orphan (accounting_delivery_tenantId_costExportEventId_fkey).
  await prisma.accountingDelivery.deleteMany({ where: { costExportEventId: { in: exportEventIds } } });
  await prisma.costExportEvent.deleteMany({ where: { id: { in: exportEventIds } } });
  await prisma.accountMapping.deleteMany({ where: { debitAccount: { startsWith: "ZZ-" } } });
  await prisma.costVarianceEvent.deleteMany({ where: { OR: [{ snapshotId: { in: snapIds } }, { runId: { in: runIds } }] } });
  await prisma.barrelFill.deleteMany({ where: { OR: [{ lotId: { in: lotIds } }, { barrelAsset: { vesselId: { in: vesselIds } } }] } });
  await prisma.barrelAsset.deleteMany({ where: { vesselId: { in: vesselIds } } });
  await prisma.supplyConsumption.deleteMany({ where: { operationId: { in: opIds } } });
  await prisma.costLine.deleteMany({ where: { operationId: { in: opIds } } });
  await prisma.bottlingCostSnapshot.deleteMany({ where: { OR: [{ runId: { in: runIds } }, { skuId: { in: skuIds } }] } });
  await prisma.stockMovement.deleteMany({ where: { OR: [{ bottlingRunId: { in: runIds } }, { wineSkuId: { in: skuIds } }] } });
  await prisma.bottledInventory.deleteMany({ where: { wineSkuId: { in: skuIds } } });
  await prisma.bottlingRun.deleteMany({ where: { id: { in: runIds } } });
  await prisma.wineSku.deleteMany({ where: { id: { in: skuIds } } });
  await prisma.supplyLot.deleteMany({ where: { materialId: { in: matIds } } });
  await prisma.lotTreatment.deleteMany({ where: { lotId: { in: lotIds } } });
  await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } });
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: lotIds } }, { childLotId: { in: lotIds } }] } });
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "ZZ-COST" } } });
  await prisma.lot.deleteMany({ where: { code: { startsWith: "ZZCOST" } } });
  await prisma.cellarMaterial.deleteMany({ where: { id: { in: matIds } } });
  await prisma.location.deleteMany({ where: { name: { startsWith: "ZZ-COST" } } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } });
  console.log(`  removed ${opIds.length} ops + cost artifacts, ${runIds.length} runs, ${lotIds.length} lots (by pattern)`);
}

async function main() {
  console.log("── building fixtures ──");
  const tank = await prisma.vessel.create({ data: { code: "ZZ-COST-TANK", type: "TANK", capacityL: 1000 } });
  createdVesselIds.push(tank.id);
  const lotId = await seedLot("ZZCOST-TANK", tank.id, 450);

  // Receive a costed, stock-tracked supply: 1000 g KMBS @ $0.05/g.
  const material = await prisma.cellarMaterial.create({
    data: { name: "ZZCOST KMBS", normalizedKey: KMBS_KEY, kind: "SO2", isStockTracked: true, stockUnit: "g" },
  });
  createdMaterialIds.push(material.id);
  await prisma.supplyLot.create({
    data: { materialId: material.id, qtyReceived: 1000, qtyRemaining: 1000, stockUnit: "g", unitCost: "0.05" },
  });
  console.log("  seeded TANK=450 L, received 1000 g KMBS @ $0.05/g");

  // Unit 3: dose 40 ppm (MG_L) → 40 × 450 / 1000 = 18 g consumed; cost 18 × 0.05 = $0.90.
  console.log("\n── ADDITION (40 ppm KMBS) draws down stock + records cost ──");
  const add = await addAdditionCore(ACTOR, { vesselId: tank.id, materialId: material.id, rateValue: 40, rateBasis: "MG_L" });
  assert(add.computedTotal === 18 && add.computedUnit === "g", `40 ppm × 450 L = 18 g (got ${add.computedTotal} ${add.computedUnit})`);

  const supply = await prisma.supplyLot.findFirstOrThrow({ where: { materialId: material.id } });
  assert(r2(Number(supply.qtyRemaining)) === 982, `SupplyLot drew down 1000 → 982 g (got ${Number(supply.qtyRemaining)})`);

  const cons = await prisma.supplyConsumption.findMany({ where: { operationId: add.operationId } });
  assert(cons.length === 1, `one SupplyConsumption row (got ${cons.length})`);
  assert(r2(Number(cons[0].qty)) === 18, `consumption qty = 18 g (got ${Number(cons[0].qty)})`);
  assert(r2(Number(cons[0].extendedCost)) === 0.9, `extended cost = $0.90 (got ${Number(cons[0].extendedCost)})`);
  assert(cons[0].basisCompleteness === "KNOWN", "consumption basis is KNOWN (unit cost was known)");

  const costLines = await prisma.costLine.findMany({ where: { operationId: add.operationId } });
  assert(costLines.length === 1 && costLines[0].component === "MATERIAL", "one MATERIAL CostLine written");
  assert(r2(Number(costLines[0].amount)) === 0.9, `CostLine amount = $0.90 (got ${Number(costLines[0].amount)})`);
  assert(costLines[0].lotId === lotId, "CostLine attached to the dosed lot");

  // Unit 11: undo the addition → restore stock + negate cost by identity, append-only.
  console.log("\n── UNDO restores stock + negates cost (U11) ──");
  await correctOperationCore(ACTOR, { operationId: add.operationId });
  const supplyAfterUndo = await prisma.supplyLot.findFirstOrThrow({ where: { materialId: material.id } });
  assert(r2(Number(supplyAfterUndo.qtyRemaining)) === 1000, `undo restored SupplyLot 982 → 1000 g (got ${Number(supplyAfterUndo.qtyRemaining)})`);
  const negCons = await prisma.supplyConsumption.findMany({ where: { reversalOfConsumptionId: { not: null }, supplyLot: { materialId: material.id } } });
  assert(negCons.length === 1 && r2(Number(negCons[0].qty)) === -18, `a negating SupplyConsumption (−18 g) was appended (got ${negCons.map((c) => Number(c.qty))})`);
  const negLines = await prisma.costLine.findMany({ where: { reversalOfCostLineId: { not: null }, lotId } });
  assert(negLines.length === 1 && r2(Number(negLines[0].amount)) === -0.9, `a negating CostLine (−$0.90) was appended (got ${negLines.map((l) => Number(l.amount))})`);
  const lcAfterUndo = await getLotCost(lotId, { forceRecompute: true });
  assert(near(lcAfterUndo.totalCost, 0), `lot cost nets to $0 after undo (got ${lcAfterUndo.totalCost})`);

  // Unit 6: a bigger dose so the bottled cost is clearly nonzero, then bottle → freeze a COGS snapshot.
  console.log("\n── BOTTLING freezes a COGS snapshot (U6) ──");
  const bigDose = await addAdditionCore(ACTOR, { vesselId: tank.id, materialId: material.id, rateValue: 2, rateBasis: "G_L" }); // 900 g → $45.00
  const lc = await getLotCost(lotId, { forceRecompute: true });
  const bottles = 100;
  const consumedL = round2(0.75 * bottles); // 75 L
  const expectedTotal = r2((lc.costPerL ?? 0) * consumedL); // $/L × L consumed
  const expectedPerBottle = Math.round((expectedTotal / bottles) * 100) / 100;
  assert(near(lc.costPerL ?? 0, 45 / 450), `lot cost-per-L = $0.10 ($45.00 over 450 L, first dose undone; got ${lc.costPerL})`);

  const loc = await prisma.location.create({ data: { name: "ZZ-COST-DEST" } });
  createdLocationIds.push(loc.id);
  await executeBottling(
    { vesselIds: [tank.id], destinationLocationId: loc.id, skuName: "ZZCOST Wine", skuVintage: 2024, bottlesProduced: bottles, date: new Date(), abv: 13.5 },
    ACTOR,
  );
  const snap = await prisma.bottlingCostSnapshot.findFirst({ where: { sku: { name: "ZZCOST Wine" } }, orderBy: { createdAt: "desc" } });
  assert(!!snap, "a BottlingCostSnapshot was frozen for the run");
  assert(near(Number(snap!.totalRunCost), expectedTotal), `snapshot totalRunCost ≈ consumed liquid $${expectedTotal} (got ${Number(snap!.totalRunCost)})`);
  assert(Number(snap!.costPerBottle) === expectedPerBottle, `cost-per-bottle = $${expectedPerBottle} (got ${Number(snap!.costPerBottle)})`);
  assert(snap!.basisCompleteness === "KNOWN", "snapshot basis is KNOWN");
  assert(snap!.costBasisAsOfOperationId != null, "snapshot carries costBasisAsOfOperationId (D4 watermark)");
  assert(!!snap!.postingKey, "snapshot carries a postingKey (D18 idempotency)");
  const bd = snap!.componentBreakdown as Record<string, number>;
  assert(bd.MATERIAL != null && bd.MATERIAL > 0, "componentBreakdown includes the MATERIAL cost");

  // Unit 10/12: create a stock material with opening stock via the core, receive more, assert on-hand.
  console.log("\n── STOCK cores: create-with-opening + receive (U10/U12) ──");
  const bent = await createStockMaterialCore(ACTOR, { name: "ZZCOST BENT", kind: "FINING", stockUnit: "g", openingQty: 500, unitCost: 0.02 });
  createdMaterialIds.push(bent.id);
  assert(bent.isStockTracked === true && bent.onHand === 500, `create-with-opening seeds 500 g on hand (got ${bent.onHand})`);
  await receiveSupplyCore(ACTOR, { materialId: bent.id, qty: 250, unitCost: 0.03 });
  const bentListed = (await listMaterials({ includeInactive: true })).find((m) => m.id === bent.id);
  assert(!!bentListed && r2(bentListed.onHand ?? 0) === 750, `receive adds a lot → on-hand 500 → 750 g (got ${bentListed?.onHand})`);

  // Unit 16: a client-owned (custom-crush) lot bills supplies back — stock still depletes + a CostLine
  // is recorded, but the cost is NOT capitalized to the estate roll-up (totalCost 0, ownership flagged).
  console.log("\n── CUSTOM-CRUSH ownership routing (U16) ──");
  const ccTank = await prisma.vessel.create({ data: { code: "ZZ-COST-CCTANK", type: "TANK", capacityL: 500 } });
  createdVesselIds.push(ccTank.id);
  const ccLot = await seedLot("ZZCOST-CC", ccTank.id, 200, "CUSTOM_CRUSH_CLIENT");
  const ccBefore = r2(Number((await prisma.supplyLot.findFirstOrThrow({ where: { materialId: bent.id }, orderBy: { receivedAt: "asc" } })).qtyRemaining));
  const ccAdd = await addAdditionCore(ACTOR, { vesselId: ccTank.id, materialId: bent.id, rateValue: 1, rateBasis: "G_L" }); // 1 g/L × 200 L = 200 g
  const ccCons = await prisma.supplyConsumption.findMany({ where: { operationId: ccAdd.operationId } });
  assert(ccCons.length >= 1, `client-owned dose still depletes stock (SupplyConsumption written; got ${ccCons.length})`);
  const ccCostLines = await prisma.costLine.findMany({ where: { operationId: ccAdd.operationId } });
  assert(ccCostLines.length === 1 && ccCostLines[0].component === "MATERIAL", "client-owned dose still records a MATERIAL CostLine (for billing)");
  const ccCost = await getLotCost(ccLot, { forceRecompute: true });
  assert(ccCost.ownership === "CUSTOM_CRUSH_CLIENT", "roll-up reports the lot as client-owned");
  assert(near(ccCost.totalCost, 0), `client-owned cost is NOT capitalized to estate (totalCost 0; got ${ccCost.totalCost})`);
  const ccAfter = r2(Number((await prisma.supplyLot.findFirstOrThrow({ where: { materialId: bent.id }, orderBy: { receivedAt: "asc" } })).qtyRemaining));
  assert(ccBefore > ccAfter, `physical stock still drew down for the client dose (${ccBefore} → ${ccAfter} g)`);

  // Unit 8 (D7): a barrel is a depreciating asset. Seed a lot into a costed barrel ONE YEAR ago (past
  // observedAt opens the fill then) → the roll-up accrues the fill's slice to-date; racking the wine out
  // materializes an immutable BARREL CostLine for the full residency.
  console.log("\n── BARREL amortization: accrue-to-date + materialize at exit (U8) ──");
  const barrel = await prisma.vessel.create({ data: { code: "ZZ-COST-BARREL", type: "BARREL", capacityL: 225 } });
  createdVesselIds.push(barrel.id);
  await prisma.barrelAsset.create({ data: { vesselId: barrel.id, purchaseCost: "1000", usefulLifeFills: 4 } }); // fill 1 slice = $400 (SYD 0.4)
  const yearAgo = new Date(Date.now() - 365 * 86_400_000);
  const barrelLot = await prisma.lot.create({ data: { code: "ZZCOST-BARREL", form: "WINE" } });
  createdLotIds.push(barrelLot.id);
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [
        { lotId: barrelLot.id, vesselId: barrel.id, deltaL: 225 },
        { lotId: barrelLot.id, vesselId: null, deltaL: -225, reason: "seed" },
      ],
      actorUserId: null, enteredBy: ACTOR.actorEmail, note: "barrel seed", observedAt: yearAgo,
      lotCodes: new Map([[barrelLot.id, "ZZCOST-BARREL"]]),
      vesselCodes: new Map([[barrel.id, barrel.code]]),
      capacityByVessel: new Map([[barrel.id, 225]]),
    }),
  );
  const openFill = await prisma.barrelFill.findFirstOrThrow({ where: { lotId: barrelLot.id } });
  assert(openFill.fillNumber === 1 && openFill.endedAt === null, `a fill (#1) opened for wine entering the barrel (got #${openFill.fillNumber})`);
  const barrelCostAccrued = await getLotCost(barrelLot.id, { forceRecompute: true });
  assert(near(barrelCostAccrued.components.BARREL ?? 0, 400, 1), `accrue-to-date ≈ full $400 slice after ~1yr full barrel (got ${barrelCostAccrued.components.BARREL})`);
  // Rack the wine out → close the fill, materialize an immutable BARREL CostLine.
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "DEPLETE",
      lines: [
        { lotId: barrelLot.id, vesselId: barrel.id, deltaL: -225 },
        { lotId: barrelLot.id, vesselId: null, deltaL: 225, reason: "deplete" },
      ],
      actorUserId: null, enteredBy: ACTOR.actorEmail, note: "barrel exit",
      lotCodes: new Map([[barrelLot.id, "ZZCOST-BARREL"]]),
      vesselCodes: new Map([[barrel.id, barrel.code]]),
      capacityByVessel: new Map([[barrel.id, 225]]),
    }),
  );
  const closedFill = await prisma.barrelFill.findFirstOrThrow({ where: { lotId: barrelLot.id } });
  assert(closedFill.endedAt != null && closedFill.materializedCostLineId != null, "the fill closed + materialized a BARREL CostLine at exit");
  const barrelLine = await prisma.costLine.findFirstOrThrow({ where: { id: closedFill.materializedCostLineId! } });
  assert(barrelLine.component === "BARREL" && near(Number(barrelLine.amount), 400, 1), `materialized BARREL CostLine ≈ $400 (got ${Number(barrelLine.amount)})`);

  // Unit 16 (D20): receive purchased BULK WINE with cost → a mid-DAG MATERIAL CostLine on the lot.
  console.log("\n── BULK-WINE receive-with-cost (U16/D20) ──");
  const bulkTank = await prisma.vessel.create({ data: { code: "ZZ-COST-BULKTANK", type: "TANK", capacityL: 500 } });
  createdVesselIds.push(bulkTank.id);
  const bulkLot = await seedLot("ZZCOST-BULK", bulkTank.id, 300);
  await receiveBulkWineCostCore(ACTOR, { lotId: bulkLot, totalCost: 600, note: "purchased bulk cab" });
  const bulkCost = await getLotCost(bulkLot, { forceRecompute: true });
  assert(near(bulkCost.components.MATERIAL ?? 0, 600), `purchased bulk-wine cost capitalized as $600 MATERIAL (got ${bulkCost.components.MATERIAL})`);
  assert(near(bulkCost.costPerL ?? 0, 2), `bulk-wine cost-per-L = $2.00 ($600 / 300 L; got ${bulkCost.costPerL})`);

  // Unit 13 (D12): undo the pre-bottling dose AFTER bottling → the frozen snapshot is untouched, but an
  // explicit variance event records the basis change split across sold vs on-hand bottles.
  console.log("\n── POST-BOTTLING variance event (U13/D12) ──");
  const snapBefore = await prisma.bottlingCostSnapshot.findFirstOrThrow({ where: { id: snap!.id } });
  await correctOperationCore(ACTOR, { operationId: bigDose.operationId });
  const snapAfter = await prisma.bottlingCostSnapshot.findFirstOrThrow({ where: { id: snap!.id } });
  assert(Number(snapBefore.costPerBottle) === Number(snapAfter.costPerBottle), "the frozen COGS snapshot is UNCHANGED by the post-bottling correction (D4)");
  const variance = await prisma.costVarianceEvent.findFirst({ where: { snapshotId: snap!.id, triggeringOpId: { gt: bigDose.operationId } }, orderBy: { createdAt: "desc" } });
  assert(!!variance, "a CostVarianceEvent was emitted for the post-bottling basis change");
  assert(Number(variance!.totalDelta) < 0, `variance delta is negative (cost removed; got ${Number(variance!.totalDelta)})`);
  assert(near(Number(variance!.soldDelta) + Number(variance!.unsoldDelta), Number(variance!.totalDelta)), "sold + unsold delta conserves the total (D12 split)");

  // Unit 14 (D18): the accounting export is a TRANSACTIONAL OUTBOX — since Phase 15 the export lines are
  // emitted INSIDE the bottling tx whenever the tenant is mapped. The demo tenant carries a full
  // component→account mapping set, so the lines already exist post-bottling; we assert they carry each
  // component's mapped debit/credit accounts and that a re-emit is an idempotent no-op. (The old Phase-8b
  // form created a fixture MATERIAL mapping and expected the manual emit to produce the lines — that only
  // held on an UNMAPPED tenant where bottling withheld; it collides on the (tenant, component, taxClass)
  // unique now, and mutating real config wouldn't be abort-safe.)
  console.log("\n── ACCOUNTING export seam: emitted at bottling + idempotent re-emit (U14/D18) ──");
  const mappings = await prisma.accountMapping.findMany({ where: { taxClass: "*" } });
  const byComponent = new Map(mappings.map((m) => [m.component, m]));
  const exportLines = await prisma.costExportEvent.findMany({ where: { sourceSnapshotId: snap!.id } });
  assert(exportLines.length >= 1, `export lines were emitted for the snapshot at bottling (got ${exportLines.length})`);
  assert(
    exportLines.every((l) => {
      const m = byComponent.get(l.component);
      return !!m && l.debitAccount === m.debitAccount && l.creditAccount === m.creditAccount;
    }),
    "export lines carry each component's mapped debit/credit accounts",
  );
  const reemit = await emitExportForSnapshot(snap!.id);
  assert(reemit.emitted === 0, `re-emit is idempotent — 0 new lines (got ${reemit.emitted})`);

  console.log(`\nALL ${passed} ASSERTIONS PASSED`);
}

runAsTenant(TENANT, async () => {
  await scrub();
  await main().then(scrub);
  return true;
})
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("\nFAILED:", e);
    try {
      await runAsTenant(TENANT, scrub); // scrub under the SAME tenant the fixtures live in (org_demo_winery)
    } catch (se) {
      console.error("scrub error:", se);
    }
    await prisma.$disconnect();
    process.exit(1);
  });
