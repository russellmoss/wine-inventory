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
import { executeBottling } from "@/lib/bottling/run";
import { getLotCost } from "@/lib/cost/cache";
import { round2 } from "@/lib/bottling/draw";

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

async function seedLot(code: string, vesselId: string, volumeL: number): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, form: "WINE" } });
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
  const mats = await prisma.cellarMaterial.findMany({ where: { normalizedKey: KMBS_KEY }, select: { id: true } });
  const matIds = mats.map((m) => m.id);
  const skus = await prisma.wineSku.findMany({ where: { name: { startsWith: "ZZCOST" } }, select: { id: true } });
  const skuIds = skus.map((s) => s.id);
  const runs = await prisma.bottlingRun.findMany({ where: { wineSkuId: { in: skuIds } }, select: { id: true } });
  const runIds = runs.map((r) => r.id);
  // FK-safe: cost artifacts (RESTRICT → op/supplyLot) → COGS snapshot (RESTRICT → run/sku) → stock/
  // inventory/run → sku → supplies → treatments → ops (cascades lines) → lineage → vessels (cascades
  // vessel_lot) → lots → material → location (run→location RESTRICT, so after runs).
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
  await prisma.cellarMaterial.deleteMany({ where: { normalizedKey: KMBS_KEY } });
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
  const negCons = await prisma.supplyConsumption.findMany({ where: { reversalOfConsumptionId: { not: null } } });
  assert(negCons.length === 1 && r2(Number(negCons[0].qty)) === -18, `a negating SupplyConsumption (−18 g) was appended (got ${negCons.map((c) => Number(c.qty))})`);
  const negLines = await prisma.costLine.findMany({ where: { reversalOfCostLineId: { not: null } } });
  assert(negLines.length === 1 && r2(Number(negLines[0].amount)) === -0.9, `a negating CostLine (−$0.90) was appended (got ${negLines.map((l) => Number(l.amount))})`);
  const lcAfterUndo = await getLotCost(lotId, { forceRecompute: true });
  assert(near(lcAfterUndo.totalCost, 0), `lot cost nets to $0 after undo (got ${lcAfterUndo.totalCost})`);

  // Unit 6: a bigger dose so the bottled cost is clearly nonzero, then bottle → freeze a COGS snapshot.
  console.log("\n── BOTTLING freezes a COGS snapshot (U6) ──");
  await addAdditionCore(ACTOR, { vesselId: tank.id, materialId: material.id, rateValue: 2, rateBasis: "G_L" }); // 900 g → $45.00
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

  console.log(`\nALL ${passed} ASSERTIONS PASSED`);
}

runAsTenant("org_bhutan_wine_co", async () => {
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
      await runAsTenant("org_bhutan_wine_co", scrub);
    } catch (se) {
      console.error("scrub error:", se);
    }
    await prisma.$disconnect();
    process.exit(1);
  });
