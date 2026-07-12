/**
 * Phase 9.4b — Progressive per-member group-rack completion. End-to-end against the live DB (Demo Winery),
 * driving the real cores (no UI):
 *   • barrel-down a source tank into 10 barrels in BATCHES: complete 4 now (one balanced op, source drawn,
 *     task IN_PROGRESS, 4 done / 6 pending), duplicate commandId is a no-op, undo the batch (LIFO reject
 *     restores source + reopens members), re-complete, then the remaining 6 (task → PENDING_APPROVAL, 2 ops),
 *     full reject reverses BOTH batches LIFO, then complete-all + approve finalizes every batch;
 *   • a rack-to-tank progressive case (2 source batches into one tank).
 * Fixtures are ZZGR-* / system@verify-grp; scrubbed FK-safe in a finally block.
 *
 *   npm run verify:group-rack-progressive   (requires `npm run seed:demo-tenant` first)
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { createWorkOrderCore, issueWorkOrderCore } from "@/lib/work-orders/lifecycle";
import { completeGroupRackBatchCore } from "@/lib/work-orders/execute";
import { approveTaskCore, rejectTaskCore, rejectGroupRackBatchCore } from "@/lib/work-orders/approval";
import { disconnectSystem } from "../src/lib/tenant/system";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-grp" };
const ADMIN = { id: "verify-grp-admin", role: "admin" as const };

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;
const vol = async (vesselId: string) => Number((await prisma.vesselLot.aggregate({ where: { vesselId }, _sum: { volumeL: true } }))._sum.volumeL ?? 0);
const taskStatus = async (id: string) => (await prisma.workOrderTask.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
const liveOps = async (taskId: string) => (await prisma.workOrderTaskAttempt.count({ where: { taskId, status: { not: "REJECTED" }, operationId: { not: null } } }));

async function seedLotInVessel(code: string, vesselId: string, volumeL: number): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, form: "WINE" } });
  const vessel = await prisma.vessel.findUniqueOrThrow({ where: { id: vesselId } });
  const lines: LedgerLine[] = [
    { lotId: lot.id, vesselId, deltaL: volumeL },
    { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" },
  ];
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED", lines, actorUserId: null, enteredBy: ACTOR.actorEmail, note: "verify-group-rack seed",
      lotCodes: new Map([[lot.id, code]]), vesselCodes: new Map([[vesselId, vessel.code]]), capacityByVessel: new Map([[vesselId, Number(vessel.capacityL)]]),
    }),
  );
  return lot.id;
}

async function scrub() {
  const wos = await prisma.workOrder.findMany({ where: { title: { startsWith: "ZZGR" } }, select: { id: true } });
  await prisma.reservation.deleteMany({ where: { workOrderId: { in: wos.map((w) => w.id) } } }).catch(() => {});
  await prisma.workOrder.deleteMany({ where: { id: { in: wos.map((w) => w.id) } } }).catch(() => {}); // cascades tasks + attempts
  const lots = await prisma.lot.findMany({ where: { code: { startsWith: "ZZGR" } }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  await prisma.lotOperation.updateMany({ where: { enteredBy: ACTOR.actorEmail }, data: { correctsOperationId: null } }).catch(() => {});
  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } });
  await prisma.costLine.deleteMany({ where: { operationId: { in: ops.map((o) => o.id) } } }).catch(() => {});
  await prisma.vesselTransfer.deleteMany({ where: { lotOperationId: { in: ops.map((o) => o.id) } } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } }).catch(() => {}); // cascades lines
  await prisma.vesselLot.deleteMany({ where: { lotId: { in: lotIds } } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "ZZGR-" } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } }).catch(() => {});
}

async function main() {
  await runAsTenant(TENANT, async () => {
    await scrub();

    // ── Fixtures: a source tank (1000 L wine) + 10 barrels (225 L each). ──
    const src = await prisma.vessel.create({ data: { code: "ZZGR-SRC", type: "TANK", capacityL: 2000 } });
    await seedLotInVessel("ZZGR-LOT", src.id, 1000);
    const barrels = [];
    for (let i = 1; i <= 10; i++) barrels.push(await prisma.vessel.create({ data: { code: `ZZGR-B${i}`, type: "BARREL", capacityL: 225 } }));
    const barrelIds = barrels.map((b) => b.id);
    console.log("── fixtures seeded (source 1000 L + 10 barrels) ──");

    const groupRack = { direction: "BARREL_DOWN" as const, sourceVesselId: src.id, destVesselIds: barrelIds, memberCodes: barrels.map((b) => b.code) };
    const mkWo = async () => {
      const wo = await createWorkOrderCore(ACTOR, {
        title: "ZZGR barrel down",
        tasks: [{ seq: 1, kind: "OPERATION", title: "Barrel down the tank", opType: "RACK", sourceVesselId: src.id, plannedPayload: { sourceVesselId: src.id, groupRack } }],
      });
      await issueWorkOrderCore(ACTOR, { workOrderId: wo.workOrderId });
      return prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: wo.workOrderId } });
    };

    // ── 1. First batch: 4 barrels @ 100 L. Task stays IN_PROGRESS. ──
    console.log("\n── 1. Batch of 4 ──");
    const task = await mkWo();
    const b1 = await completeGroupRackBatchCore(ACTOR, { taskId: task.id, commandId: "zzgr-b1", memberVesselIds: barrelIds.slice(0, 4), perMemberVolumeL: [100, 100, 100, 100] });
    assert(b1.operationId != null && b1.duplicate === false, "batch 1 wrote one balanced RACK op");
    assert(b1.status === "IN_PROGRESS", `task is IN_PROGRESS after a partial batch (got ${b1.status})`);
    assert(near(await vol(barrelIds[0]), 100) && near(await vol(barrelIds[3]), 100), "the 4 filled barrels each hold 100 L");
    assert(near(await vol(barrelIds[4]), 0), "an unfilled barrel is still empty");
    assert(near(await vol(src.id), 600), `source drew 400 L (1000 → ${await vol(src.id)})`);
    assert((await liveOps(task.id)) === 1, "exactly one live batch op so far");

    // ── 2. Idempotency: the same commandId is a no-op. ──
    const dup = await completeGroupRackBatchCore(ACTOR, { taskId: task.id, commandId: "zzgr-b1", memberVesselIds: barrelIds.slice(0, 4), perMemberVolumeL: [100, 100, 100, 100] });
    assert(dup.duplicate === true, "a same-commandId re-submit is reported duplicate");
    assert(near(await vol(src.id), 600) && (await liveOps(task.id)) === 1, "the duplicate wrote no second op (source unchanged)");

    // ── 3. Undo the batch (LIFO): source restored, members reopened, task back to PENDING. ──
    console.log("\n── 3. Undo the last batch ──");
    const undo = await rejectGroupRackBatchCore(ADMIN, ACTOR, { taskId: task.id, reason: "wrong barrels" });
    assert(undo.status === "PENDING", `undoing the only batch returns the task to PENDING (got ${undo.status})`);
    assert(near(await vol(src.id), 1000), `the batch's wine was returned to the source (back to ${await vol(src.id)} L)`);
    assert(near(await vol(barrelIds[0]), 0), "the reopened barrels are empty again");
    assert((await liveOps(task.id)) === 0, "no live batch ops after the undo");

    // ── 4. Re-complete in two batches → PENDING_APPROVAL with 2 live ops. ──
    console.log("\n── 4. Complete in two batches ──");
    await completeGroupRackBatchCore(ACTOR, { taskId: task.id, commandId: "zzgr-b1b", memberVesselIds: barrelIds.slice(0, 4), perMemberVolumeL: [100, 100, 100, 100] });
    assert((await taskStatus(task.id)) === "IN_PROGRESS", "still IN_PROGRESS after re-doing batch 1");
    const b2 = await completeGroupRackBatchCore(ACTOR, { taskId: task.id, commandId: "zzgr-b2", memberVesselIds: barrelIds.slice(4, 10), perMemberVolumeL: [100, 100, 100, 100, 100, 100] });
    assert(b2.status === "PENDING_APPROVAL", `the final batch moved the task to PENDING_APPROVAL (got ${b2.status})`);
    assert(near(await vol(src.id), 0), `source fully drained (${await vol(src.id)} L)`);
    assert((await liveOps(task.id)) === 2, "two live batch ops");

    // ── 5. Full reject reverses BOTH batches LIFO → source restored, all barrels empty, task REJECTED. ──
    console.log("\n── 5. Full reject (reverses both batches LIFO) ──");
    const rej = await rejectTaskCore(ADMIN, ACTOR, { taskId: task.id, reason: "redo tomorrow" });
    assert(rej.status === "REJECTED", "the whole task is REJECTED");
    assert(near(await vol(src.id), 1000), `both batches reversed — source restored to ${await vol(src.id)} L`);
    assert(near(await vol(barrelIds[9]), 0) && near(await vol(barrelIds[0]), 0), "every barrel is empty after the full reject");
    assert((await liveOps(task.id)) === 0, "no live batch ops after the full reject");

    // ── 6. A fresh task, complete all at once, approve → APPROVED, all batches approved. ──
    console.log("\n── 6. Complete-all + approve ──");
    const task2 = await mkWo();
    const all = await completeGroupRackBatchCore(ACTOR, { taskId: task2.id, commandId: "zzgr-all", memberVesselIds: barrelIds, perMemberVolumeL: barrelIds.map(() => 100) });
    assert(all.status === "PENDING_APPROVAL", "completing every member in one batch goes straight to PENDING_APPROVAL");
    const appr = await approveTaskCore(ADMIN, ACTOR, { taskId: task2.id });
    assert(appr.status === "APPROVED", "the task approves");
    const approvedAttempts = await prisma.workOrderTaskAttempt.count({ where: { taskId: task2.id, status: "APPROVED" } });
    assert(approvedAttempts >= 1, "the batch attempt is APPROVED");
    // reject it back to clean up the ledger for the next run
    await rejectTaskCore(ADMIN, ACTOR, { taskId: task2.id, reason: "cleanup" });
    assert(near(await vol(src.id), 1000), "post-approve reject restored the source (cleanup)");

    console.log(`\nALL GROUP-RACK-PROGRESSIVE CHECKS PASSED ✓  (${passed} assertions)`);
  });
}

main()
  .catch((e) => { console.error("\n✗ VERIFY FAILED\n", e); process.exitCode = 1; })
  .finally(async () => {
    await runAsTenant(TENANT, scrub).catch((e) => console.error("scrub error", e));
    await prisma.$disconnect();
    await disconnectSystem();
  });
