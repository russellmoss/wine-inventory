/**
 * Phase 6D saved barrel-group workflow verification.
 *
 * Uses Demo Winery only. Covers saved VesselGroup membership, membership merge
 * semantics (no physical ledger op), group apply preview, per-member blocked
 * results, shared-batch correction, and barrel-fill open/close cost projection.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { createGroupCore, mergeGroupMembershipCore } from "@/lib/vessels/groups";
import { applyToGroup, previewGroupApply } from "@/lib/cellar/group-apply";
import { correctBatchCore } from "@/lib/cellar/correct";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-barrel-groups" };
const stamp = Date.now().toString(36);
const prefix = `ZZ-P6D-${stamp}`;
let passed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ok - ${msg}`);
}

async function cleanup() {
  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } }).catch(() => []);
  const opIds = ops.map((o) => o.id);
  const lots = await prisma.lot.findMany({ where: { code: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const lotIds = lots.map((l) => l.id);
  const vessels = await prisma.vessel.findMany({ where: { code: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const vesselIds = vessels.map((v) => v.id);
  const groups = await prisma.vesselGroup.findMany({ where: { name: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const groupIds = groups.map((g) => g.id);

  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } }).catch(() => {});
  await prisma.lotOperation.updateMany({ where: { id: { in: opIds } }, data: { correctsOperationId: null } }).catch(() => {});
  await prisma.costLine.deleteMany({ where: { OR: [{ operationId: { in: opIds } }, { lotId: { in: lotIds } }] } }).catch(() => {});
  await prisma.operationCostTransfer.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.barrelFill.deleteMany({ where: { OR: [{ lotId: { in: lotIds } }, { barrelAsset: { vesselId: { in: vesselIds } } }] } }).catch(() => {});
  await prisma.barrelAsset.deleteMany({ where: { vesselId: { in: vesselIds } } }).catch(() => {});
  await prisma.lotTreatment.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.lotOperationLine.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { id: { in: opIds } } }).catch(() => {});
  await prisma.vesselGroupMember.deleteMany({ where: { OR: [{ groupId: { in: groupIds } }, { vesselId: { in: vesselIds } }] } }).catch(() => {});
  await prisma.vesselGroup.deleteMany({ where: { id: { in: groupIds } } }).catch(() => {});
  await prisma.vesselLot.deleteMany({ where: { OR: [{ lotId: { in: lotIds } }, { vesselId: { in: vesselIds } }] } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: lotIds } }, { childLotId: { in: lotIds } }] } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { id: { in: vesselIds } } }).catch(() => {});
}

async function makeVessel(code: string, type: "TANK" | "BARREL", capacityL: number): Promise<{ id: string; code: string; capacityL: number }> {
  const vessel = await prisma.vessel.create({ data: { code, type, capacityL }, select: { id: true, code: true, capacityL: true } });
  if (type === "BARREL") {
    await prisma.barrelAsset.create({ data: { vesselId: vessel.id, purchaseCost: 1000, usefulLifeFills: 4 } });
  }
  return { id: vessel.id, code: vessel.code, capacityL: Number(vessel.capacityL) };
}

async function seedLot(vesselId: string, vesselCode: string, volumeL: number): Promise<string> {
  const lot = await prisma.lot.create({ data: { code: `${prefix}-SOURCE`, form: "WINE" }, select: { id: true, code: true } });
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [
        { lotId: lot.id, vesselId, deltaL: volumeL },
        { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" },
      ] as LedgerLine[],
      actorUserId: ACTOR.actorUserId,
      enteredBy: ACTOR.actorEmail,
      metadata: { seedKind: "MANUAL_OPERATOR_SEED" },
      lotCodes: new Map([[lot.id, lot.code]]),
      vesselCodes: new Map([[vesselId, vesselCode]]),
      capacityByVessel: new Map([[vesselId, 1000]]),
    }),
  );
  return lot.id;
}

async function vesselTotal(vesselId: string): Promise<number> {
  const rows = await prisma.vesselLot.findMany({ where: { vesselId }, select: { volumeL: true } });
  return Math.round(rows.reduce((sum, row) => sum + Number(row.volumeL), 0) * 100) / 100;
}

async function main() {
  await runAsTenant(TENANT, async () => {
    await cleanup();
    try {
      await prisma.$queryRaw`SELECT 1`;

      console.log("\n1. Saved group membership is organizational");
      const source = await makeVessel(`${prefix}-SRC`, "TANK", 1000);
      const b1 = await makeVessel(`${prefix}-B1`, "BARREL", 225);
      const b2 = await makeVessel(`${prefix}-B2`, "BARREL", 225);
      const b3 = await makeVessel(`${prefix}-B3`, "BARREL", 50);
      await seedLot(source.id, source.code, 300);

      const beforeMergeOps = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
      const sourceGroup = await createGroupCore(ACTOR, { name: `${prefix}-SOURCE-GROUP`, vesselIds: [b1.id, b2.id, b3.id] });
      const targetGroup = await createGroupCore(ACTOR, { name: `${prefix}-TARGET-GROUP`, vesselIds: [b1.id] });
      const merged = await mergeGroupMembershipCore(ACTOR, { sourceGroupId: sourceGroup.id, targetGroupId: targetGroup.id });
      const afterMergeOps = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
      assert(afterMergeOps === beforeMergeOps, "membership create/merge wrote audit only, no ledger operation");
      assert(merged.members.length === 3, "merge copied source members into target group");
      const sourceActive = await prisma.vesselGroup.findUniqueOrThrow({ where: { id: sourceGroup.id }, select: { isActive: true } });
      assert(sourceActive.isActive === false, "source group was deactivated after membership merge");

      console.log("\n2. Group apply preview names ready and blocked barrels");
      const spec = { op: "TOPPING" as const, fromVesselId: source.id, volumeL: 100 };
      const preview = await previewGroupApply({ groupId: targetGroup.id }, spec);
      assert(preview.total === 3, "preview includes every saved-group member");
      assert(preview.ready === 2, "preview marks two barrels ready");
      assert(preview.blocked === 1, "preview blocks the over-capacity barrel");
      assert(preview.members.find((m) => m.vesselId === b3.id)?.message.includes("capacity") === true, "blocked preview names the capacity risk");

      console.log("\n3. Apply fans out per barrel and opens barrel fills once");
      const applied = await applyToGroup(ACTOR, { groupId: targetGroup.id }, spec);
      assert(applied.applied === 2 && applied.blocked === 1, "apply wrote two member ops and preserved one blocked result");
      const ops = await prisma.lotOperation.findMany({ where: { batchId: applied.batchId }, select: { id: true, type: true } });
      assert(ops.length === 2 && ops.every((op) => op.type === "TOPPING"), "fan-out wrote one TOPPING op per ready barrel");
      assert((await vesselTotal(source.id)) === 100, "source tank was drawn down once per applied barrel");
      assert((await vesselTotal(b1.id)) === 100 && (await vesselTotal(b2.id)) === 100 && (await vesselTotal(b3.id)) === 0, "ready barrels received wine; blocked barrel stayed empty");
      const openFills = await prisma.barrelFill.findMany({ where: { endedAt: null, barrelAsset: { vesselId: { in: [b1.id, b2.id, b3.id] } } }, select: { id: true, barrelAsset: { select: { vesselId: true } } } });
      assert(openFills.length === 2, "barrel-fill fold opened one fill per actual filled barrel");
      assert(!openFills.some((f) => f.barrelAsset.vesselId === b3.id), "blocked barrel did not open a barrel fill");

      // Simulate elapsed aging so correction materializes non-zero barrel cost on close.
      const past = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
      await prisma.barrelFill.updateMany({ where: { id: { in: openFills.map((f) => f.id) } }, data: { startedAt: past } });

      console.log("\n4. Batch correction unwinds each member and closes fills once");
      const corrected = await correctBatchCore(ACTOR, { batchId: applied.batchId });
      assert(corrected.corrected === 2 && corrected.blocked === 0 && corrected.errored === 0, "batch correction corrected every applied member op");
      assert((await vesselTotal(source.id)) === 300, "batch correction restored the source volume");
      assert((await vesselTotal(b1.id)) === 0 && (await vesselTotal(b2.id)) === 0, "batch correction emptied the target barrels");
      const fills = await prisma.barrelFill.findMany({ where: { barrelAsset: { vesselId: { in: [b1.id, b2.id] } } }, select: { endedAt: true, closeOpId: true, materializedCostLineId: true } });
      assert(fills.length === 2 && fills.every((f) => f.endedAt && f.closeOpId), "barrel fills closed once per filled barrel");
      assert(fills.every((f) => f.materializedCostLineId), "closing aged fills materialized barrel cost lines");
      const assets = await prisma.barrelAsset.findMany({ where: { vesselId: { in: [b1.id, b2.id, b3.id] } }, select: { vesselId: true, currentFillNumber: true } });
      assert(assets.filter((a) => a.vesselId !== b3.id).every((a) => a.currentFillNumber === 1), "filled barrels advanced fill count exactly once");
      assert(assets.find((a) => a.vesselId === b3.id)?.currentFillNumber === 0, "blocked barrel did not advance fill count");

      console.log(`\nPhase 6D barrel-group verifier passed (${passed} assertions).`);
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
