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
import { normalizeMaterialKey } from "@/lib/cellar/material-normalize";

const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-cost" };
const r2 = (n: number) => Math.round(n * 100) / 100;
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

const createdVesselIds: string[] = [];
const createdLotIds: string[] = [];
const createdMaterialIds: string[] = [];
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
  // FK-safe: cost artifacts (RESTRICT → op/supplyLot) → supplies → treatments → ops (cascades lines) →
  // lineage → vessels (cascades vessel_lot) → lots → material.
  await prisma.supplyConsumption.deleteMany({ where: { operationId: { in: opIds } } });
  await prisma.costLine.deleteMany({ where: { operationId: { in: opIds } } });
  await prisma.supplyLot.deleteMany({ where: { materialId: { in: matIds } } });
  await prisma.lotTreatment.deleteMany({ where: { lotId: { in: lotIds } } });
  await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } });
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: lotIds } }, { childLotId: { in: lotIds } }] } });
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "ZZ-COST" } } });
  await prisma.lot.deleteMany({ where: { code: { startsWith: "ZZCOST" } } });
  await prisma.cellarMaterial.deleteMany({ where: { normalizedKey: KMBS_KEY } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } });
  console.log(`  removed ${opIds.length} ops + their cost artifacts, ${lotIds.length} lots (by code pattern)`);
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
