/**
 * Plan 061 — consolidated multi-vessel maintenance verify (Demo Winery only).
 *
 * Proves: a barrel-group maintenance intent authors ONE task carrying the members in
 * plannedPayload.groupActivity (not one task per barrel); completion writes one record-only
 * VesselActivityEvent per member (WORKORDER-3: overhead-only, no CostLine/SupplyConsumption/LotOperation),
 * depletes N x per-vessel dose from the overhead SupplyLot; and undo (reject) reverses every member event
 * and restores the stock. Also proves single-vessel maintenance is unchanged AND now rejectable.
 */
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { buildNlWorkOrderProposal, buildNlWorkOrderCommitArgs } from "@/lib/work-orders/nl-resolve";
import { instantiateTaskBuilds } from "@/lib/work-orders/template-vocabulary";
import { resolveTaskVocabulary } from "@/lib/work-orders/vocabulary-resolver";
import { createWorkOrderCore, issueWorkOrderCore } from "@/lib/work-orders/lifecycle";
import { completeTaskCore } from "@/lib/work-orders/execute";
import { rejectTaskCore } from "@/lib/work-orders/approval";
import { parseGroupActivityPayload } from "@/lib/work-orders/group-activity";
import { normalizeMaterialKey } from "@/lib/cellar/material-normalize";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-group-maintenance" };

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  OK ${msg}`);
}
const num = (d: unknown) => Number(d ?? 0);

async function scrub() {
  const vessels = await prisma.vessel.findMany({ where: { code: { startsWith: "ZZGM" } }, select: { id: true } });
  const vesselIds = vessels.map((v) => v.id);
  const events = vesselIds.length
    ? await prisma.vesselActivityEvent.findMany({ where: { vesselId: { in: vesselIds } }, select: { id: true } })
    : [];
  const eventIds = events.map((e) => e.id);
  if (eventIds.length) {
    await prisma.vesselActivitySupplyUse.deleteMany({ where: { vesselActivityEventId: { in: eventIds } } });
    await prisma.vesselActivityEvent.deleteMany({ where: { id: { in: eventIds } } });
  }
  const wos = await prisma.workOrder.findMany({ where: { title: { startsWith: "ZZGM" } }, select: { id: true } });
  const woIds = wos.map((w) => w.id);
  if (woIds.length) {
    await prisma.reservation.deleteMany({ where: { workOrderId: { in: woIds } } });
    await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } }); // cascades tasks + attempts
  }
  const materials = await prisma.cellarMaterial.findMany({ where: { name: { startsWith: "ZZGM" } }, select: { id: true } });
  const materialIds = materials.map((m) => m.id);
  await prisma.supplyLot.deleteMany({ where: { materialId: { in: materialIds } } });
  await prisma.cellarMaterial.deleteMany({ where: { id: { in: materialIds } } });
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "ZZGM" } } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } });
}

async function main() {
  await runAsTenant(TENANT, async () => {
    const vocab = await resolveTaskVocabulary();
    await scrub();

    // Seed 4 barrels + an overhead sanitizer with 100 L on hand.
    const barrels = await Promise.all(
      ["ZZGM-B1", "ZZGM-B2", "ZZGM-B3", "ZZGM-B4"].map((code) => prisma.vessel.create({ data: { code, type: "BARREL", capacityL: 225 } })),
    );
    const barrelIds = new Set(barrels.map((b) => b.id));
    const mat = await prisma.cellarMaterial.create({ data: { name: "ZZGM Sanitizer", kind: "SANITIZER", normalizedKey: normalizeMaterialKey("ZZGM Sanitizer"), isStockTracked: true, stockUnit: "L" } });
    const supply = await prisma.supplyLot.create({ data: { materialId: mat.id, qtyReceived: 100, qtyRemaining: 100, stockUnit: "L", unitCost: 2 } });

    // 1. Authoring consolidates to ONE task with 4 members.
    const dose = 5;
    const proposal = await buildNlWorkOrderProposal({
      sourceText: "sanitize barrels ZZGM-B1 through ZZGM-B4",
      title: "ZZGM group sanitize",
      tasks: [{ kind: "SANITIZE", vesselGroup: "ZZGM-B1, ZZGM-B2, ZZGM-B3, ZZGM-B4", material: "ZZGM Sanitizer", amount: dose }],
    });
    assert(proposal.status === "ready", "group sanitize proposal is ready");
    assert(proposal.taskBuilds.length === 1, `consolidated to ONE task (got ${proposal.taskBuilds.length})`);
    const ga = parseGroupActivityPayload({ ...(proposal.taskBuilds[0].values as object) });
    assert(!!ga && ga.memberVesselIds.length === 4, `the task carries 4 members (got ${ga?.memberVesselIds.length ?? 0})`);
    assert(proposal.tasks[0].members?.length === 4, "the proposal review row exposes 4 members for the expander");

    // 2. Commit + issue.
    const args = buildNlWorkOrderCommitArgs(proposal);
    const tasks = instantiateTaskBuilds(args.taskBuilds, vocab);
    assert(tasks[0].destVesselId === null && tasks[0].sourceVesselId === null, "consolidated task has NO single vessel column (members are JSON-only)");
    const created = await createWorkOrderCore(ACTOR, { title: args.title, tasks });
    await issueWorkOrderCore(ACTOR, { workOrderId: created.workOrderId });
    const task = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: created.workOrderId } });

    const opsBefore = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });

    // 3. Complete ALL members at once.
    const done = await completeTaskCore(ACTOR, { taskId: task.id, commandId: randomUUID() });
    assert(done.status === "DONE" && done.operationId === null, "completing the group task is DONE with NO ledger op");

    // 4. One record-only VesselActivityEvent per member, none voided.
    const events = await prisma.vesselActivityEvent.findMany({ where: { taskId: task.id }, select: { id: true, vesselId: true, kind: true, voidedAt: true, commandId: true } });
    assert(events.length === 4, `4 activity events written, one per member (got ${events.length})`);
    assert(events.every((e) => e.kind === "SANITIZE" && !e.voidedAt), "every event is a live SANITIZE event");
    assert(events.every((e) => barrelIds.has(e.vesselId)), "every event targets one of the 4 members");
    assert(new Set(events.map((e) => e.commandId)).size === 4, "each member event has a distinct commandId (no collision)");

    // 5. WORKORDER-3: overhead only — no CostLine / SupplyConsumption / LotOperation; N x dose depleted.
    assert((await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } })) === opsBefore, "completion wrote NO ledger op (WORKORDER-3)");
    assert((await prisma.supplyConsumption.count({ where: { supplyLotId: supply.id } })) === 0, "NO SupplyConsumption (overhead, not wine COGS)");
    const uses = await prisma.vesselActivitySupplyUse.findMany({ where: { vesselActivityEventId: { in: events.map((e) => e.id) } }, select: { qty: true } });
    const drawn = uses.reduce((s, u) => s + num(u.qty), 0);
    assert(Math.abs(drawn - 4 * dose) < 1e-6, `total overhead depletion is 4 x ${dose} = ${4 * dose} (got ${drawn})`);
    const lotAfter = await prisma.supplyLot.findFirstOrThrow({ where: { materialId: mat.id } });
    assert(Math.abs(num(lotAfter.qtyRemaining) - (100 - 4 * dose)) < 1e-6, `SupplyLot drawn to ${100 - 4 * dose} (got ${num(lotAfter.qtyRemaining)})`);

    // 6. Undo (reject) reverses every member event and restores the stock.
    const admin = { id: ACTOR.actorUserId ?? "verify-admin", role: "admin" };
    const rejected = await rejectTaskCore(admin, ACTOR, { taskId: task.id, reason: "verify undo" });
    assert(rejected.status === "REJECTED", "reject/undo returns REJECTED");
    const liveAfter = await prisma.vesselActivityEvent.count({ where: { taskId: task.id, voidedAt: null } });
    assert(liveAfter === 0, `all member events voided after undo (got ${liveAfter} still live)`);
    const lotRestored = await prisma.supplyLot.findFirstOrThrow({ where: { materialId: mat.id } });
    assert(Math.abs(num(lotRestored.qtyRemaining) - 100) < 1e-6, `SupplyLot restored to 100 after undo (got ${num(lotRestored.qtyRemaining)})`);

    // 7. Single-vessel maintenance is unchanged AND now rejectable (net-new: it was un-rejectable before 061).
    const single = await buildNlWorkOrderProposal({ sourceText: "clean ZZGM-B1", title: "ZZGM single clean", tasks: [{ kind: "CLEAN", vessel: "ZZGM-B1" }] });
    assert(single.taskBuilds.length === 1 && parseGroupActivityPayload({ ...(single.taskBuilds[0].values as object) }) === null, "single-vessel clean is a plain task (no groupActivity)");
    const sArgs = buildNlWorkOrderCommitArgs(single);
    const sCreated = await createWorkOrderCore(ACTOR, { title: sArgs.title, tasks: instantiateTaskBuilds(sArgs.taskBuilds, vocab) });
    await issueWorkOrderCore(ACTOR, { workOrderId: sCreated.workOrderId });
    const sTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: sCreated.workOrderId } });
    const sDone = await completeTaskCore(ACTOR, { taskId: sTask.id, commandId: randomUUID() });
    assert(sDone.status === "DONE", "single-vessel maintenance completes to DONE");
    const sRej = await rejectTaskCore(admin, ACTOR, { taskId: sTask.id, reason: "verify undo single" });
    assert(sRej.status === "REJECTED", "single-vessel maintenance is now rejectable (net-new)");
    assert((await prisma.vesselActivityEvent.count({ where: { taskId: sTask.id, voidedAt: null } })) === 0, "single-vessel event voided after undo");

    await scrub();
    console.log(`\nverify:group-maintenance — ${passed} assertions passed.`);
  });
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
