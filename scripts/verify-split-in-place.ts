/**
 * Phase 6C split-in-place / retained-lees verification.
 *
 * Uses Demo Winery only. Covers the append-only cellar split core, SPLIT lineage,
 * retained lees as a tracked child lot, discarded lees as ordinary loss, proportional
 * OperationCostTransfer rows, and transform reversal cleanup.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { splitLotInPlaceCore } from "@/lib/cellar/split-core";
import { computeLotCost } from "@/lib/cost/data";
import { reverseOperationCore } from "@/lib/ledger/reverse";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-split-in-place" };
const stamp = Date.now().toString(36);
const prefix = `ZZ-P6C-${stamp}`;
let passed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ok - ${msg}`);
}

function near(a: number, b: number, eps = 0.01): boolean {
  return Math.abs(a - b) <= eps;
}

async function cleanup() {
  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } }).catch(() => []);
  const opIds = ops.map((o) => o.id);
  const lots = await prisma.lot.findMany({ where: { code: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const lotIds = lots.map((l) => l.id);
  const vessels = await prisma.vessel.findMany({ where: { code: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const vesselIds = vessels.map((v) => v.id);

  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } }).catch(() => {});
  await prisma.lotOperation.updateMany({ where: { id: { in: opIds } }, data: { correctsOperationId: null } }).catch(() => {});
  await prisma.operationCostTransfer.deleteMany({ where: { OR: [{ operationId: { in: opIds } }, { fromLotId: { in: lotIds } }, { toLotId: { in: lotIds } }] } }).catch(() => {});
  await prisma.costLine.deleteMany({ where: { OR: [{ operationId: { in: opIds } }, { lotId: { in: lotIds } }] } }).catch(() => {});
  await prisma.lotOperationLine.deleteMany({ where: { OR: [{ operationId: { in: opIds } }, { lotId: { in: lotIds } }] } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { id: { in: opIds } } }).catch(() => {});
  await prisma.vesselLot.deleteMany({ where: { OR: [{ lotId: { in: lotIds } }, { vesselId: { in: vesselIds } }] } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: lotIds } }, { childLotId: { in: lotIds } }] } }).catch(() => {});
  await prisma.lotVineyard.deleteMany({ where: { lotId: { in: lotIds } } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { id: { in: vesselIds } } }).catch(() => {});
}

async function makeVessel(code: string, capacityL = 1000): Promise<{ id: string; code: string; capacityL: number }> {
  const vessel = await prisma.vessel.create({ data: { code, type: "TANK", capacityL }, select: { id: true, code: true, capacityL: true } });
  return { id: vessel.id, code: vessel.code, capacityL: Number(vessel.capacityL) };
}

async function seedCostedLot(vesselId: string, vesselCode: string, suffix = "PARENT"): Promise<{ lotId: string; seedOpId: number }> {
  const lot = await prisma.lot.create({
    data: {
      code: `${prefix}-${suffix}`,
      form: "WINE",
      vintageYear: 2026,
      ownership: "ESTATE",
      taxAbvOverride: 13.75,
      note: "phase 6c verifier parent",
    },
    select: { id: true, code: true },
  });
  const seedOpId = await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [
        { lotId: lot.id, vesselId, deltaL: 200 },
        { lotId: lot.id, vesselId: null, deltaL: -200, reason: "seed" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId,
      enteredBy: ACTOR.actorEmail,
      note: "phase 6c verifier seed",
      metadata: { seedKind: "MANUAL_OPERATOR_SEED" },
      lotCodes: new Map([[lot.id, lot.code]]),
      vesselCodes: new Map([[vesselId, vesselCode]]),
      capacityByVessel: new Map([[vesselId, 1000]]),
    }),
  );
  await prisma.costLine.create({
    data: {
      operationId: seedOpId,
      lotId: lot.id,
      component: "MATERIAL",
      amount: 200,
      basisCompleteness: "KNOWN",
    },
  });
  return { lotId: lot.id, seedOpId };
}

async function totalVolume(lotId: string): Promise<number> {
  const rows = await prisma.vesselLot.findMany({ where: { lotId }, select: { volumeL: true } });
  return rows.reduce((a, r) => a + Number(r.volumeL), 0);
}

async function main() {
  await runAsTenant(TENANT, async () => {
    await cleanup();
    try {
      await prisma.$queryRaw`SELECT 1`;

      console.log("\n1. Split in place writes truthful children, loss, and lineage");
      const source = await makeVessel(`${prefix}-SRC`);
      const leesTank = await makeVessel(`${prefix}-LEES`);
      const expTank = await makeVessel(`${prefix}-EXP`);
      const { lotId: parentLotId } = await seedCostedLot(source.id, source.code);
      const beforeCost = await computeLotCost(parentLotId);
      assert(near(beforeCost.totalCost, 200), "parent starts with known cost basis");

      const result = await splitLotInPlaceCore(ACTOR, {
        parentLotId,
        sourceVesselId: source.id,
        // LEDGER-12 (plan 088): EXP-A used to stay in the SOURCE tank alongside the parent's
        // 115 L remainder — two lots in one vessel, the fiction at its smallest scale. A sub-lot
        // now needs its own vessel unless the parent is fully drawn out of the source.
        children: [
          { volumeL: 60, sublotTag: "EXP-A", destVesselId: expTank.id },
          { volumeL: 20, sublotTag: "LEES", destVesselId: leesTank.id, role: "LEES" },
        ],
        discardedLeesL: 5,
        note: "verify split in place",
        commandId: `${prefix}-cmd`,
      });
      assert(result.drawnL === 85, "drawn volume includes tracked children and discarded lees");
      assert(result.discardedLeesL === 5, "discarded lees is recorded separately from retained lees");
      assert(result.children.length === 2, "split produced regular child plus retained lees child");

      const regular = result.children.find((c) => c.role === "SPLIT")!;
      const retainedLees = result.children.find((c) => c.role === "LEES")!;
      assert((await totalVolume(parentLotId)) === 115, "parent retains unsplit wine after draw");
      assert((await totalVolume(regular.lotId)) === 60, "regular child has its tracked volume");
      assert((await totalVolume(retainedLees.lotId)) === 20, "retained lees is tracked as wine inventory");

      const children = await prisma.lot.findMany({
        where: { id: { in: [regular.lotId, retainedLees.lotId] } },
        select: { id: true, sublotTag: true, ownership: true, taxAbvOverride: true, form: true, status: true },
      });
      assert(children.every((c) => c.form === "WINE" && c.ownership === "ESTATE"), "children inherit form and ownership");
      assert(children.every((c) => Number(c.taxAbvOverride) === 13.75), "children inherit tax ABV override");
      assert(children.some((c) => c.id === retainedLees.lotId && c.sublotTag === "LEES"), "retained lees child carries sublotTag");

      const edges = await prisma.lotLineage.findMany({ where: { parentLotId }, select: { childLotId: true, kind: true } });
      assert(edges.length === 2 && edges.every((e) => e.kind === "SPLIT"), "children have SPLIT lineage, not transform lineage");

      const lossLine = await prisma.lotOperationLine.findFirst({
        where: { operationId: result.operationId, lotId: parentLotId, vesselId: null, reason: "loss" },
        select: { deltaL: true },
      });
      assert(lossLine != null && Number(lossLine.deltaL) === 5, "discarded lees is an ordinary external loss line");

      console.log("\n2. Cost transfer rows move basis proportionally");
      const transfers = await prisma.operationCostTransfer.findMany({ where: { operationId: result.operationId }, orderBy: { transferredVolumeL: "desc" } });
      assert(transfers.length === 2, "split wrote one cost-transfer row per tracked child");
      assert(near(Number(transfers.find((t) => t.toLotId === regular.lotId)?.transferredCost ?? 0), 60), "regular child received proportional cost");
      assert(near(Number(transfers.find((t) => t.toLotId === retainedLees.lotId)?.transferredCost ?? 0), 20), "retained lees received proportional cost");
      assert(near((await computeLotCost(regular.lotId)).totalCost, 60), "regular child cost rollup follows transfer");
      assert(near((await computeLotCost(retainedLees.lotId)).totalCost, 20), "retained lees cost rollup follows transfer");
      assert(near((await computeLotCost(parentLotId)).totalCost, 120), "parent cost keeps discarded-lees basis as normal loss");

      console.log("\n3. Reversal restores volume and marks child lots corrected");
      const reversed = await reverseOperationCore(ACTOR, { operationId: result.operationId });
      assert(reversed.correctionId != null, "split reversal wrote a correction operation");
      assert((await totalVolume(parentLotId)) === 200, "reversal restored parent volume");
      assert((await totalVolume(regular.lotId)) === 0 && (await totalVolume(retainedLees.lotId)) === 0, "reversal drained child holdings");
      const statuses = await prisma.lot.findMany({ where: { id: { in: [regular.lotId, retainedLees.lotId] } }, select: { status: true } });
      assert(statuses.every((s) => s.status === "CORRECTED"), "reversal marked child lots corrected");
      const reversalTransfers = await prisma.operationCostTransfer.findMany({ where: { operationId: reversed.correctionId ?? -1 } });
      assert(reversalTransfers.length === 2 && reversalTransfers.every((t) => t.reversalOfTransferId), "reversal wrote inverse cost-transfer rows");
      assert(near((await computeLotCost(parentLotId)).totalCost, 200), "reversal restored parent cost basis");

      // ── LEDGER-12: a sub-lot cannot sit beside the parent's remainder (plan 088, Unit 10) ──
      console.log("\n4. A vessel still holds one wine after a split");
      const src2 = await makeVessel(`${prefix}-SRC2`);
      const { lotId: parent2 } = await seedCostedLot(src2.id, src2.code, "PARENT2");

      let refusedRemainder: string | null = null;
      await splitLotInPlaceCore(ACTOR, {
        parentLotId: parent2,
        sourceVesselId: src2.id,
        // Draws 60 of 200 and leaves EXP-B behind → the tank would hold the child AND 140 L of parent.
        children: [{ volumeL: 60, sublotTag: "EXP-B", destVesselId: src2.id }],
        commandId: `${prefix}-cmd-remainder`,
      }).catch((e: unknown) => {
        refusedRemainder = e instanceof Error ? e.message : String(e);
      });
      assert(refusedRemainder !== null, "a sub-lot left beside the parent's remainder is refused");
      assert(/one wine/i.test(refusedRemainder ?? ""), "the refusal explains that a vessel holds one wine");
      assert(
        /own\s+vessel|note the trial/i.test(refusedRemainder ?? ""),
        "the refusal offers a way forward (no dead end, no phantom vessel — ux-principles rule 12)",
      );

      let refusedTwo: string | null = null;
      await splitLotInPlaceCore(ACTOR, {
        parentLotId: parent2,
        sourceVesselId: src2.id,
        // Two sub-lots into the SAME tank — one liquid, not two, even if the parent is fully drawn.
        children: [
          { volumeL: 100, sublotTag: "EXP-C", destVesselId: src2.id },
          { volumeL: 100, sublotTag: "EXP-D", destVesselId: src2.id },
        ],
        commandId: `${prefix}-cmd-two`,
      }).catch((e: unknown) => {
        refusedTwo = e instanceof Error ? e.message : String(e);
      });
      assert(refusedTwo !== null, "two sub-lots in one vessel are refused even when the parent is fully drawn");

      // The legal shape: draw the WHOLE parent, and one child may stay behind.
      const wholeSplit = await splitLotInPlaceCore(ACTOR, {
        parentLotId: parent2,
        sourceVesselId: src2.id,
        children: [{ volumeL: 200, sublotTag: "EXP-E", destVesselId: src2.id }],
        commandId: `${prefix}-cmd-whole`,
      });
      assert(wholeSplit.children.length === 1, "splitting the WHOLE parent in place is still allowed");
      const src2Rows = await prisma.vesselLot.findMany({ where: { vesselId: src2.id } });
      assert(src2Rows.length === 1, "the source vessel ends holding exactly one lot");

      console.log(`\nPhase 6C split-in-place verifier passed (${passed} assertions).`);
    } finally {
      await cleanup();
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
