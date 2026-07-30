/**
 * GROUP-3 guard — an issued work order's member list is FROZEN (plan 106, Unit 9).
 *
 * "No membership edit — add, remove, reorder, split, merge, archive, or retroactive admin correction
 * — may change what an already-issued work order covers."
 *
 * THE ASSERTION IS STATED AS AN OUTCOME, NOT A MECHANISM (RFC-001 AC-3): issue a work order against
 * a barrel group, then ADD and REMOVE a barrel and RENAME the group, and assert the reported member
 * list and per-barrel count come back byte-identical. A guard that checked "a memberSnapshot column
 * is non-null" would pass against a snapshot that silently re-resolved; comparing the serialized
 * before and after is what actually proves the freeze.
 *
 * End-to-end against a real database, in Demo Winery ONLY, with `ZZ-`-prefixed fixtures that are
 * cleaned up in a `finally`. Never Bhutan.
 *
 * Deliberately exercises the REAL cores — createWorkOrderCore and issueWorkOrderCore — rather than
 * calling freezeGroupSnapshotsTx directly. The unit tests already cover the freeze logic in
 * isolation; what this adds is proof that `issue` actually reaches it, inside its transaction, on
 * the real schema.
 *
 * Run:  npm run verify:wo-member-snapshot
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { createWorkOrderCore, issueWorkOrderCore } from "@/lib/work-orders/lifecycle";
import { updateWorkOrderCore } from "@/lib/work-orders/update-core";
import { addGroupMemberCore, removeGroupMemberCore, configureGroupCore, archiveGroupCore } from "@/lib/vessels/group-core";
import { resolveTaskMembers } from "@/lib/work-orders/group-snapshot";
import type { LedgerActor } from "@/lib/vessels/rack-core";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-wo-member-snapshot" };
const stamp = Date.now().toString(36);
const prefix = `ZZ-G3-${stamp}`;
let passed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ok - ${msg}`);
}

async function cleanup() {
  const groups = await prisma.vesselGroup.findMany({ where: { name: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const groupIds = groups.map((g) => g.id);
  const vessels = await prisma.vessel.findMany({ where: { code: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const vesselIds = vessels.map((v) => v.id);
  const wos = await prisma.workOrder.findMany({ where: { title: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const woIds = wos.map((w) => w.id);

  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } }).catch(() => {});
  await prisma.reservation.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => {});
  await prisma.workOrderTask.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => {});
  await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } }).catch(() => {});
  await prisma.vesselGroupMember.deleteMany({ where: { OR: [{ groupId: { in: groupIds } }, { vesselId: { in: vesselIds } }] } }).catch(() => {});
  await prisma.vesselGroup.deleteMany({ where: { id: { in: groupIds } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { id: { in: vesselIds } } }).catch(() => {});
}

/**
 * THE PAYLOAD the crew actually executes, read the way `data.ts` / `ExecuteClient` read it.
 * `groupRack` carries the members under destVesselIds (barrel-down) or sourceVesselIds
 * (rack-to-tank); `groupActivity` carries them under memberVesselIds.
 */
async function executedMembers(taskId: string): Promise<string[]> {
  const t = await prisma.workOrderTask.findUniqueOrThrow({ where: { id: taskId }, select: { plannedPayload: true } });
  const p = (t.plannedPayload ?? {}) as Record<string, unknown>;
  const block = (p.groupRack ?? p.groupActivity) as Record<string, unknown> | undefined;
  if (!block) return [];
  const ids = (block.memberVesselIds ?? block.destVesselIds ?? block.sourceVesselIds) as unknown;
  return Array.isArray(ids) ? ids.map(String) : [];
}

/** Read a task back and render exactly what the app would report as its member list. */
async function reportedMembers(taskId: string) {
  const task = await prisma.workOrderTask.findUniqueOrThrow({
    where: { id: taskId },
    select: { vesselGroupId: true, memberSnapshot: true, memberSnapshotAt: true, plannedPayload: true },
  });
  const live = task.vesselGroupId
    ? await prisma.vesselGroup.findUnique({
        where: { id: task.vesselGroupId },
        select: { name: true, members: { orderBy: [{ position: "asc" }], select: { position: true, vessel: { select: { id: true, code: true } } } } },
      })
    : null;
  return resolveTaskMembers(
    task,
    live ? live.members.map((m, i) => ({ vesselId: m.vessel.id, code: m.vessel.code, label: `Barrel ${m.vessel.code}`, position: i + 1 })) : null,
    live?.name ?? null,
  );
}

async function makeGroupWorkOrder(groupId: string, title: string) {
  return createWorkOrderCore(ACTOR, {
    title,
    assigneeEmail: ACTOR.actorEmail,
    tasks: [
      {
        seq: 1,
        kind: "MAINTENANCE",
        title: `${prefix} top the rack`,
        activityType: "CLEAN",
        vesselGroupId: groupId,
        plannedPayload: { groupActivity: { activityType: "CLEAN", memberVesselIds: [], memberCodes: [] } },
      },
    ],
  });
}

async function main() {
  await runAsTenant(TENANT, async () => {
    try {
      // ── fixtures ──
      const barrels = await Promise.all(
        ["A", "B", "C"].map((s) =>
          prisma.vessel.create({ data: { code: `${prefix}-${s}`, type: "BARREL", capacityL: 225 }, select: { id: true, code: true } }),
        ),
      );
      const group = await prisma.vesselGroup.create({ data: { name: `${prefix} rack`, type: "OPERATIONAL" }, select: { id: true } });
      await addGroupMemberCore(ACTOR, { groupId: group.id, vesselId: barrels[0].id });
      await addGroupMemberCore(ACTOR, { groupId: group.id, vesselId: barrels[1].id });

      // ── 1) a DRAFT reads LIVE membership ──
      const wo = await makeGroupWorkOrder(group.id, `${prefix} round one`);
      const task = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: wo.workOrderId }, select: { id: true } });

      assert((await reportedMembers(task.id)).source === "live", "a DRAFT work order reads live membership");
      await addGroupMemberCore(ACTOR, { groupId: group.id, vesselId: barrels[2].id });
      assert((await reportedMembers(task.id)).members.length === 3, "a DRAFT picks up a membership change made after it was drafted");
      await removeGroupMemberCore(ACTOR, { groupId: group.id, vesselId: barrels[2].id });
      assert((await reportedMembers(task.id)).members.length === 2, "a DRAFT picks up a removal too");

      // ── 2) issue freezes it ──
      await issueWorkOrderCore(ACTOR, { workOrderId: wo.workOrderId });
      const atIssue = await reportedMembers(task.id);
      assert(atIssue.source === "frozen", "issuing the work order froze the member list");
      assert(atIssue.frozenAt !== null, "the freeze carries a timestamp");
      assert(atIssue.members.length === 2, "the frozen list has the 2 barrels that were in the group at issue");
      const serializedAtIssue = JSON.stringify(atIssue);

      // ── 3) AC-3: churn the membership underneath, and the issued order does not move ──
      await addGroupMemberCore(ACTOR, { groupId: group.id, vesselId: barrels[2].id });
      await removeGroupMemberCore(ACTOR, { groupId: group.id, vesselId: barrels[0].id });
      await configureGroupCore(ACTOR, { groupId: group.id, name: `${prefix} rack renamed` });

      const afterChurn = await reportedMembers(task.id);
      assert(
        JSON.stringify(afterChurn) === serializedAtIssue,
        "AC-3 — after ADDING and REMOVING a barrel and renaming the group, the issued list is byte-identical",
      );
      assert(afterChurn.members.length === 2, "the per-barrel count is unchanged");
      assert(
        afterChurn.members.some((m) => m.vesselId === barrels[0].id),
        "a barrel REMOVED from the group is still on the issued work order",
      );
      assert(
        !afterChurn.members.some((m) => m.vesselId === barrels[2].id),
        "a barrel ADDED to the group after issue is NOT on the issued work order",
      );
      assert(afterChurn.groupName === `${prefix} rack`, "the group's name is frozen as it was, so a rename cannot repaint the worksheet");

      // ── 4) archiving the group does not touch an issued order either (§4.5) ──
      await archiveGroupCore(ACTOR, { groupId: group.id, archived: true, confirmOpenWorkOrders: true });
      assert(JSON.stringify(await reportedMembers(task.id)) === serializedAtIssue, "archiving the group leaves the issued list unchanged");
      await archiveGroupCore(ACTOR, { groupId: group.id, archived: false });

      // ── 5) issue REFUSES against an emptied group (D3) ──
      const empty = await prisma.vesselGroup.create({ data: { name: `${prefix} empty`, type: "OPERATIONAL" }, select: { id: true } });
      const woEmpty = await makeGroupWorkOrder(empty.id, `${prefix} round empty`);
      let refused = false;
      try {
        await issueWorkOrderCore(ACTOR, { workOrderId: woEmpty.workOrderId });
      } catch (e) {
        refused = /has no barrels in it/.test(e instanceof Error ? e.message : "");
      }
      assert(refused, "issuing against an EMPTY barrel group is refused");
      assert(
        (await prisma.workOrder.findUniqueOrThrow({ where: { id: woEmpty.workOrderId }, select: { status: true } })).status === "DRAFT",
        "the refused work order stayed a DRAFT — the refusal rolled back the ISSUED flip too",
      );

      // ── 6) issue REFUSES against an archived group (D3) ──
      const retired = await prisma.vesselGroup.create({ data: { name: `${prefix} retired`, type: "OPERATIONAL" }, select: { id: true } });
      await addGroupMemberCore(ACTOR, { groupId: retired.id, vesselId: barrels[1].id }).catch(() => {});
      const woRetired = await makeGroupWorkOrder(retired.id, `${prefix} round retired`);
      await archiveGroupCore(ACTOR, { groupId: retired.id, archived: true, confirmOpenWorkOrders: true });
      let refusedArchived = false;
      try {
        await issueWorkOrderCore(ACTOR, { workOrderId: woRetired.workOrderId });
      } catch (e) {
        refusedArchived = /archived group/.test(e instanceof Error ? e.message : "");
      }
      assert(refusedArchived, "issuing against an ARCHIVED barrel group is refused");

      // ── 7) re-issuing an already-ISSUED order is refused, so a second snapshot is impossible ──
      let refusedReissue = false;
      try {
        await issueWorkOrderCore(ACTOR, { workOrderId: wo.workOrderId });
      } catch {
        refusedReissue = true;
      }
      assert(refusedReissue, "an already-issued work order cannot be re-issued (no second snapshot)");
      assert(JSON.stringify(await reportedMembers(task.id)) === serializedAtIssue, "and its frozen list is still byte-identical");

      // ── 8) THE LOAD-BEARING ONE: the payload the crew EXECUTES is the frozen list ──
      // An earlier version of this verifier only checked `resolveTaskMembers`, a function NO PRODUCT
      // SURFACE CALLED — so it stayed green while the frozen list was never rendered and never
      // executed. A guard that reads a path nothing uses is the same no-op the phase set out to kill.
      const executedAtIssue = (await executedMembers(task.id)).slice().sort();
      const expectedFrozen = [barrels[0].id, barrels[1].id].slice().sort();
      assert(
        JSON.stringify(executedAtIssue) === JSON.stringify(expectedFrozen),
        "the EXECUTED payload (what the worksheet and execute form actually read) IS the frozen list",
      );

      // ── 9) an issued task's barrel list cannot be edited through the builder ──
      const issuedTask = await prisma.workOrderTask.findFirstOrThrow({
        where: { workOrderId: wo.workOrderId },
        select: { id: true, seq: true, groupSeq: true, title: true, vesselGroupId: true },
      });
      let editRefused = false;
      try {
        await updateWorkOrderCore(ACTOR, {
          workOrderId: wo.workOrderId,
          slots: [
            {
              seq: issuedTask.seq,
              groupSeq: issuedTask.groupSeq,
              existingTaskId: issuedTask.id,
              locked: false,
              input: {
                seq: issuedTask.seq,
                kind: "MAINTENANCE",
                title: issuedTask.title,
                activityType: "CLEAN",
                vesselGroupId: issuedTask.vesselGroupId,
                // The attack: swap the barrel list on an ALREADY-ISSUED work order. Before this was
                // closed, the payload was rewritten while memberSnapshot sat frozen and unread — the
                // snapshot said one rack, the crew worked another.
                plannedPayload: { groupActivity: { activityType: "CLEAN", memberVesselIds: [barrels[2].id], memberCodes: [barrels[2].code] } },
              },
            },
          ],
        });
      } catch (e) {
        editRefused = /frozen when this work order was issued/.test(e instanceof Error ? e.message : "");
      }
      assert(editRefused, "editing an ISSUED work order's barrel list through the builder is REFUSED");
      assert(
        JSON.stringify((await executedMembers(task.id)).slice().sort()) === JSON.stringify(executedAtIssue),
        "and the executed payload survived the attempt byte-identical",
      );

      console.log(`\nGROUP-3 verifier passed (${passed} assertions).`);
    } finally {
      await cleanup();
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
