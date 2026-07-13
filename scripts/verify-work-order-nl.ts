/**
 * Phase 9.2 natural-language work-order authoring verify.
 *
 * Demo Winery only. This proves authoring creates and issues a WO with planned tasks, but does not write
 * LotOperation rows; ledger writes still wait for task completion.
 */
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { buildNlWorkOrderCommitArgs, buildNlWorkOrderProposal, assertFreshNlWorkOrderProposal } from "@/lib/work-orders/nl-resolve";
import { instantiateTaskBuilds } from "@/lib/work-orders/template-vocabulary";
import { resolveTaskVocabulary } from "@/lib/work-orders/vocabulary-resolver";
import { createWorkOrderCore, issueWorkOrderCore } from "@/lib/work-orders/lifecycle";
import { attachTaskEquipmentCore } from "@/lib/equipment/equipment";
import { completeTaskCore, completeGroupRackBatchCore } from "@/lib/work-orders/execute";
import { rejectGroupRackBatchCore } from "@/lib/work-orders/approval";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-work-order-nl" };

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  OK ${msg}`);
}

const num = (d: unknown) => Number(d ?? 0);

async function scrub() {
  const wos = await prisma.workOrder.findMany({ where: { title: { startsWith: "ZZNL" } }, select: { id: true } });
  const woIds = wos.map((w) => w.id);
  const zzEquip = await prisma.equipmentAsset.findMany({ where: { name: { startsWith: "ZZNL" } }, select: { id: true } });
  const zzEquipIds = zzEquip.map((e) => e.id);
  const zzTasks = woIds.length ? await prisma.workOrderTask.findMany({ where: { workOrderId: { in: woIds } }, select: { id: true } }) : [];
  const zzTaskIds = zzTasks.map((t) => t.id);
  // Plan 055 U10: drop the advisory task↔equipment links first (they FK the tasks about to be deleted and
  // the ZZNL equipment about to be removed), then the WOs, then the equipment.
  await prisma.workOrderTaskEquipment.deleteMany({ where: { OR: [{ equipmentId: { in: zzEquipIds } }, { taskId: { in: zzTaskIds } }] } });
  await prisma.reservation.deleteMany({ where: { workOrderId: { in: woIds } } });
  await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } });
  await prisma.equipmentAsset.deleteMany({ where: { id: { in: zzEquipIds } } });

  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } });
  const opIds = ops.map((op) => op.id);
  const lots = await prisma.lot.findMany({ where: { code: { startsWith: "ZZNL" } }, select: { id: true } });
  const lotIds = lots.map((lot) => lot.id);
  const materials = await prisma.cellarMaterial.findMany({ where: { name: { startsWith: "ZZNL" } }, select: { id: true } });
  const materialIds = materials.map((m) => m.id);

  await prisma.supplyConsumption.deleteMany({ where: { operationId: { in: opIds } } });
  await prisma.costLine.deleteMany({ where: { operationId: { in: opIds } } });
  await prisma.analysisReading.deleteMany({ where: { panel: { lotId: { in: lotIds } } } });
  await prisma.analysisPanel.deleteMany({ where: { lotId: { in: lotIds } } });
  await prisma.lotTreatment.deleteMany({ where: { lotId: { in: lotIds } } });
  await prisma.vesselTransfer.deleteMany({ where: { lotOperationId: { in: opIds } } });
  await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } });
  await prisma.supplyLot.deleteMany({ where: { materialId: { in: materialIds } } });
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "ZZNL" } } });
  await prisma.lot.deleteMany({ where: { code: { startsWith: "ZZNL" } } });
  await prisma.cellarMaterial.deleteMany({ where: { id: { in: materialIds } } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } });
}

async function seedLotInVessel(code: string, vesselId: string, volumeL: number): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, form: "WINE" } });
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
      note: "verify-work-order-nl seed",
      lotCodes: new Map([[lot.id, code]]),
      vesselCodes: new Map([[vesselId, vessel.code]]),
      capacityByVessel: new Map([[vesselId, Number(vessel.capacityL)]]),
    }),
  );
  return lot.id;
}

async function main() {
  await runAsTenant(TENANT, async () => {
    await scrub();

    const src = await prisma.vessel.create({ data: { code: "ZZNL-T12", type: "TANK", capacityL: 500 } });
    const dst = await prisma.vessel.create({ data: { code: "ZZNL-T15", type: "TANK", capacityL: 500 } });
    const lotId = await seedLotInVessel("ZZNL-LOT-1", src.id, 120);
    const material = await prisma.cellarMaterial.create({
      data: {
        name: "ZZNL SO2",
        normalizedKey: "ZZNLSO2",
        kind: "SO2",
        category: "ADDITIVE",
        isStockTracked: true,
        stockUnit: "g",
      },
    });
    await prisma.supplyLot.create({
      data: { materialId: material.id, qtyReceived: 1000, qtyRemaining: 1000, stockUnit: "g", unitCost: "0.10" },
    });

    const opsBeforeAuthoring = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    const proposal = await buildNlWorkOrderProposal({
      sourceText: "Rack ZZNL-T12 to ZZNL-T15, add 30 ppm SO2, pull a juice panel.",
      title: "ZZNL natural-language WO",
    });
    assert(proposal.status === "ready", "proposal is ready");
    assert(proposal.taskBuilds.map((t) => t.taskType).join(",") === "RACK,ADDITION,PANEL", "proposal has rack/addition/panel task builds");
    assert(proposal.cost.lines.length === 1 && proposal.cost.lines[0].estimatedCost != null, "proposal includes known supply cost estimate");

    const args = buildNlWorkOrderCommitArgs(proposal);
    await assertFreshNlWorkOrderProposal(args);
    const tasks = instantiateTaskBuilds(args.taskBuilds, await resolveTaskVocabulary());
    const created = await createWorkOrderCore(ACTOR, { title: args.title, tasks });
    const issued = await issueWorkOrderCore(ACTOR, { workOrderId: created.workOrderId });
    assert(issued.status === "ISSUED", "work order issued");

    const rows = await prisma.workOrderTask.findMany({ where: { workOrderId: created.workOrderId }, orderBy: { seq: "asc" } });
    assert(rows.length === 3, "issued work order has 3 tasks");
    assert(rows[0].opType === "RACK" && rows[1].opType === "ADDITION" && rows[2].observationType === "PANEL", "task types persisted");
    assert(rows[0].sourceVesselId === src.id && rows[0].destVesselId === dst.id, "rack canonical vessels persisted");
    assert(rows[1].materialId === material.id, "addition material id persisted");
    assert(rows[2].lotId === lotId, "panel lot id persisted");

    const reservations = await prisma.reservation.findMany({ where: { workOrderId: created.workOrderId } });
    assert(reservations.some((r) => r.kind === "LOT_VOLUME"), "rack source volume reservation created on issue");
    assert(reservations.some((r) => r.kind === "VESSEL_CAPACITY"), "rack destination capacity reservation created on issue");
    assert(reservations.some((r) => r.kind === "MATERIAL_QTY" && num(r.qty) > 0), "addition material reservation created on issue");

    const opsAfterAuthoring = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    assert(opsAfterAuthoring === opsBeforeAuthoring, "authoring and issuing the WO wrote no LotOperation rows");

    const blocked = await buildNlWorkOrderProposal({
      sourceText: "Add 30 ppm sanitizer to ZZNL-T12 as a work order",
      tasks: [{ kind: "ADDITION", vessel: "ZZNL-T12", material: "sanitizer", amount: 30, unit: "ppm" }],
    }).catch((e) => e as Error);
    assert(blocked instanceof Error && /No additive|cannot be dosed|sanitizer/i.test(blocked.message), "non-doseable or missing sanitizer does not become a free-form material");

    // ── Plan 055a: author a BOTTLE work order WITH its packaging BoM via NL (authoring only; the
    //    execute→deplete→capitalize path is proven by verify:cost + verify:work-orders-transform). ──
    const glass = await prisma.cellarMaterial.create({ data: { name: "ZZNL Glass 750", normalizedKey: "ZZNLGLASS750", kind: "PACKAGING", category: "PACKAGING", isStockTracked: true, stockUnit: "unit" } });
    await prisma.supplyLot.create({ data: { materialId: glass.id, qtyReceived: 5000, qtyRemaining: 5000, stockUnit: "unit", unitCost: "0.80" } });
    const cork = await prisma.cellarMaterial.create({ data: { name: "ZZNL Cork Natural", normalizedKey: "ZZNLCORKNATURAL", kind: "PACKAGING", category: "PACKAGING", isStockTracked: true, stockUnit: "unit" } });
    await prisma.supplyLot.create({ data: { materialId: cork.id, qtyReceived: 5000, qtyRemaining: 5000, stockUnit: "unit", unitCost: "0.10" } });

    const opsBeforeBottle = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    const pkgProposal = await buildNlWorkOrderProposal({
      sourceText: "bottle it",
      title: "ZZNL bottling with packaging",
      tasks: [{ kind: "BOTTLE", vessel: "ZZNL-T12", skuName: "ZZNL Estate", skuVintage: 2026, cases: 100, packaging: ["ZZNL Glass", "ZZNL Cork"] }],
    });
    assert(pkgProposal.status === "ready", "BOTTLE proposal is ready (runtime coverage — no vessels/count/ABV needed to author)");
    assert(pkgProposal.taskBuilds.length === 1 && pkgProposal.taskBuilds[0].taskType === "BOTTLE", "one BOTTLE task build");
    const bv = pkgProposal.taskBuilds[0].values as { packagingBottles?: number; packaging?: { materialId: string; per: string; factor: number; qty: number }[] };
    assert(bv.packagingBottles === 1200, `packagingBottles derived from 100 cases = 1200 (got ${bv.packagingBottles})`);
    assert(Array.isArray(bv.packaging) && bv.packaging.length === 2, `two resolved packaging lines (got ${bv.packaging?.length})`);
    assert(bv.packaging!.some((l) => l.materialId === glass.id && l.qty === 1200) && bv.packaging!.some((l) => l.materialId === cork.id && l.qty === 1200), "packaging lines carry the resolved material ids + derived qty (1200 each, per bottle ×1)");

    const pkgArgs = buildNlWorkOrderCommitArgs(pkgProposal);
    await assertFreshNlWorkOrderProposal(pkgArgs);
    const pkgTasks = instantiateTaskBuilds(pkgArgs.taskBuilds, await resolveTaskVocabulary());
    const pkgCreated = await createWorkOrderCore(ACTOR, { title: pkgArgs.title, tasks: pkgTasks });
    const pkgIssued = await issueWorkOrderCore(ACTOR, { workOrderId: pkgCreated.workOrderId });
    assert(pkgIssued.status === "ISSUED", "bottling work order issued");
    const bottleTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: pkgCreated.workOrderId } });
    assert(bottleTask.opType === "BOTTLE", "persisted task is a BOTTLE");
    const pp = (bottleTask.plannedPayload ?? {}) as { skuName?: string; packagingBottles?: number; packaging?: unknown[] };
    assert(pp.skuName === "ZZNL Estate" && pp.packagingBottles === 1200, "plannedPayload carries skuName + packagingBottles");
    assert(Array.isArray(pp.packaging) && pp.packaging.length === 2, "plannedPayload.packaging persisted with 2 lines");
    const pkgHolds = await prisma.reservation.findMany({ where: { workOrderId: pkgCreated.workOrderId, kind: "MATERIAL_QTY" } });
    assert(pkgHolds.length === 2 && pkgHolds.every((h) => num(h.qty) === 1200), `two MATERIAL_QTY holds (1200 eaches each) on issue (got ${pkgHolds.map((h) => num(h.qty))})`);
    assert((await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } })) === opsBeforeBottle, "authoring + issuing the bottling WO wrote NO ledger op (the BOTTLE op is written at execute)");

    const vocab = await resolveTaskVocabulary();

    // ── Plan 055 U3/U10: EQUIPMENT_SERVICE — author (equipment attaches) + complete (status flips, no op). ──
    // The assistant commit routes through createWorkOrderFromBuildsAction (equipment attach lives inside it);
    // this script drives the SAME cores it wraps (createWorkOrderCore + attachTaskEquipmentCore) — WORKORDER-1.
    const press = await prisma.equipmentAsset.create({ data: { name: "ZZNL Basket Press", kind: "press", status: "available" } });
    const opsBeforeEquip = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    const eqProposal = await buildNlWorkOrderProposal({
      sourceText: "service the press and set it to maintenance",
      title: "ZZNL equipment service",
      tasks: [{ kind: "EQUIPMENT_SERVICE", equipmentId: press.id, setStatus: "maintenance" }],
    });
    assert(eqProposal.status === "ready", "EQUIPMENT_SERVICE proposal is ready (record-only, no vessel/lot/material)");
    assert(eqProposal.taskBuilds.length === 1 && eqProposal.taskBuilds[0].taskType === "EQUIPMENT_SERVICE", "one EQUIPMENT_SERVICE task build");
    const eqIds = eqProposal.taskBuilds[0].equipmentIds;
    assert(Array.isArray(eqIds) && eqIds.length === 1 && eqIds[0] === press.id, "the resolved equipment id rides the task build's equipmentIds");
    const eqArgs = buildNlWorkOrderCommitArgs(eqProposal);
    await assertFreshNlWorkOrderProposal(eqArgs);
    const eqTasks = instantiateTaskBuilds(eqArgs.taskBuilds, vocab);
    const eqCreated = await createWorkOrderCore(ACTOR, { title: eqArgs.title, tasks: eqTasks });
    const eqRows = await prisma.workOrderTask.findMany({ where: { workOrderId: eqCreated.workOrderId }, orderBy: { seq: "asc" }, select: { id: true, seq: true } });
    for (const t of eqRows) {
      const ids = eqArgs.taskBuilds[t.seq - 1]?.equipmentIds;
      if (Array.isArray(ids) && ids.length > 0) await attachTaskEquipmentCore(t.id, ids);
    }
    await issueWorkOrderCore(ACTOR, { workOrderId: eqCreated.workOrderId });
    const eqLink = await prisma.workOrderTaskEquipment.findFirst({ where: { taskId: eqRows[0].id, equipmentId: press.id } });
    assert(!!eqLink, "the equipment is attached to the service task (WorkOrderTaskEquipment row)");
    assert((await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } })) === opsBeforeEquip, "authoring + issuing the equipment-service WO wrote NO ledger op");
    const eqDone = await completeTaskCore(ACTOR, { taskId: eqRows[0].id, commandId: randomUUID(), actualPayload: { setStatus: "maintenance" } });
    assert(eqDone.status === "DONE" && eqDone.operationId === null, "completing the equipment-service task is DONE with NO ledger op (E16 record-only)");
    const pressAfter = await prisma.equipmentAsset.findUniqueOrThrow({ where: { id: press.id } });
    assert(pressAfter.status === "maintenance", "completion flipped the equipment status to maintenance");
    assert((await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } })) === opsBeforeEquip, "equipment-service completion still wrote NO ledger op");

    // ── Plan 055 U5/U6/U10: group_rack_batch cores — subset complete, D1 self-undo, D4 all-or-nothing. ──
    const grSrc = await prisma.vessel.create({ data: { code: "ZZNL-GRT", type: "TANK", capacityL: 900 } });
    await seedLotInVessel("ZZNL-GR-LOT", grSrc.id, 700);
    const b1 = await prisma.vessel.create({ data: { code: "ZZNL-B1", type: "BARREL", capacityL: 225 } });
    const b2 = await prisma.vessel.create({ data: { code: "ZZNL-B2", type: "BARREL", capacityL: 225 } });
    const b3 = await prisma.vessel.create({ data: { code: "ZZNL-B3", type: "BARREL", capacityL: 225 } });

    // ── Plan 061 (supersedes plan-060 fan-out): maintenance across a barrel group/range consolidates into
    // ONE task carrying the member set in plannedPayload.groupActivity — NOT one task per barrel. ──
    const maintProposal = await buildNlWorkOrderProposal({
      sourceText: "clean and sanitize the three barrels",
      title: "ZZNL barrel maintenance group",
      tasks: [
        { kind: "CLEAN", vesselGroup: "ZZNL-B1, ZZNL-B2, ZZNL-B3" },
        { kind: "SANITIZE", vesselGroup: "ZZNL-B1, ZZNL-B2, ZZNL-B3" },
      ],
    });
    assert(maintProposal.status === "ready", "barrel-group maintenance proposal is ready");
    const maintTypes = maintProposal.taskBuilds.map((t) => t.taskType);
    assert(maintProposal.taskBuilds.length === 2, `two maintenance kinds consolidate to 2 tasks, not one-per-barrel (got ${maintProposal.taskBuilds.length})`);
    assert(maintTypes.filter((t) => t === "CLEAN").length === 1, `CLEAN is ONE consolidated task (got ${maintTypes.filter((t) => t === "CLEAN").length})`);
    assert(maintTypes.filter((t) => t === "SANITIZE").length === 1, `SANITIZE is ONE consolidated task (got ${maintTypes.filter((t) => t === "SANITIZE").length})`);
    const cleanGa = (maintProposal.taskBuilds.find((t) => t.taskType === "CLEAN")!.values as { groupActivity?: { memberVesselIds?: string[] } }).groupActivity;
    const cleanMembers = new Set(cleanGa?.memberVesselIds ?? []);
    assert(cleanMembers.size === 3 && cleanMembers.has(b1.id) && cleanMembers.has(b2.id) && cleanMembers.has(b3.id), "the consolidated CLEAN task carries all 3 barrels as members (b1/b2/b3)");
    // The consolidated task carries no single vessel column (members live in the payload).
    assert((maintProposal.taskBuilds.find((t) => t.taskType === "CLEAN")!.values as { vesselId?: string }).vesselId === undefined, "the consolidated task has no single vesselId (members are in groupActivity)");
    const oneVessel = await buildNlWorkOrderProposal({ sourceText: "clean one barrel", title: "ZZNL one barrel", tasks: [{ kind: "CLEAN", vessel: "ZZNL-B1" }] });
    assert(oneVessel.taskBuilds.length === 1 && oneVessel.taskBuilds[0].taskType === "CLEAN", "single-vessel maintenance still produces exactly one plain task");
    assert((oneVessel.taskBuilds[0].values as { groupActivity?: unknown; vesselId?: string }).groupActivity === undefined && !!(oneVessel.taskBuilds[0].values as { vesselId?: string }).vesselId, "single-vessel maintenance keeps its vesselId and has NO groupActivity");

    const grProposal = await buildNlWorkOrderProposal({
      sourceText: "barrel down the tank into the three barrels",
      title: "ZZNL group rack",
      tasks: [{ kind: "BARREL_DOWN", from: "ZZNL-GRT", toGroup: "ZZNL-B1, ZZNL-B2, ZZNL-B3", drawL: 600 }],
    });
    assert(grProposal.status === "ready", "barrel-down proposal is ready");
    const grArgs = buildNlWorkOrderCommitArgs(grProposal);
    const grTasks = instantiateTaskBuilds(grArgs.taskBuilds, vocab);
    const grCreated = await createWorkOrderCore(ACTOR, { title: grArgs.title, tasks: grTasks });
    await issueWorkOrderCore(ACTOR, { workOrderId: grCreated.workOrderId });
    const grTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: grCreated.workOrderId } });

    // Complete a SUBSET (b1, b2) with a REAL user actor so D1's self-executor check has an id to match.
    const memberUserId = (await prisma.member.findFirstOrThrow({ where: { organizationId: TENANT }, select: { userId: true } })).userId;
    const grActor: LedgerActor = { actorUserId: memberUserId, actorEmail: ACTOR.actorEmail };
    const batch1 = await completeGroupRackBatchCore(grActor, { taskId: grTask.id, commandId: randomUUID(), memberVesselIds: [b1.id, b2.id] });
    assert(batch1.status === "IN_PROGRESS", "completing a subset (2 of 3 barrels) leaves the task IN_PROGRESS");

    // D1: the SAME executor (a non-admin) may self-undo their own last batch while IN_PROGRESS.
    const selfUser = { id: memberUserId, role: "user" };
    const undo1 = await rejectGroupRackBatchCore(selfUser, grActor, { taskId: grTask.id });
    assert(undo1.status === "PENDING", "D1: the same executor (non-admin) self-undoes the only batch → task back to PENDING");

    // D1 negative: a DIFFERENT non-admin cannot undo someone else's batch.
    const batch2 = await completeGroupRackBatchCore(grActor, { taskId: grTask.id, commandId: randomUUID(), memberVesselIds: [b1.id, b2.id] });
    assert(batch2.status === "IN_PROGRESS", "re-completed the subset after the undo");
    const denied = await rejectGroupRackBatchCore({ id: "zznl-not-the-executor", role: "user" }, grActor, { taskId: grTask.id }).catch((e) => e as Error);
    assert(denied instanceof Error && /admin|person who recorded/i.test(denied.message), "D1: a different non-admin is refused the undo");

    // D4: all-or-nothing — a batch mixing an already-done member (b1) with a pending one (b3) is rejected whole.
    const d4 = await completeGroupRackBatchCore(grActor, { taskId: grTask.id, commandId: randomUUID(), memberVesselIds: [b1.id, b3.id] }).catch((e) => e as Error);
    assert(d4 instanceof Error && /already recorded|aren't part of this task/i.test(d4.message), "D4: mixing a done member with a pending one rejects the whole batch (no partial write)");
    const stillTwo = await prisma.workOrderTaskAttempt.count({ where: { taskId: grTask.id, status: { not: "REJECTED" } } });
    assert(stillTwo === 1, "D4: the rejected batch wrote no new attempt (still one live batch)");

    // Finish the last pending barrel cleanly → the whole task enters review.
    const batch3 = await completeGroupRackBatchCore(grActor, { taskId: grTask.id, commandId: randomUUID(), memberVesselIds: [b3.id] });
    assert(batch3.status === "PENDING_APPROVAL" || batch3.status === "APPROVED", "completing the final barrel moves the task into review");

    // ── Plan 055 U7/U8/U10: per-task assignee + priority persist through the shared cores. ──
    const apProposal = await buildNlWorkOrderProposal({
      sourceText: "checklist assigned high priority",
      title: "ZZNL assignee priority",
      tasks: [{ kind: "NOTE", title: "ZZNL check the crush pad", assigneeId: memberUserId, priority: "HIGH" }],
    });
    assert(apProposal.status === "ready", "assignee/priority NOTE proposal is ready");
    assert(apProposal.taskBuilds[0].assigneeId === memberUserId, "resolved assignee id lands on the task build");
    assert(apProposal.taskBuilds[0].priority === "HIGH", "priority lands on the task build");
    const apArgs = buildNlWorkOrderCommitArgs(apProposal);
    const apTasks = instantiateTaskBuilds(apArgs.taskBuilds, vocab);
    const apCreated = await createWorkOrderCore(ACTOR, { title: apArgs.title, tasks: apTasks });
    const apTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: apCreated.workOrderId } });
    assert(apTask.assigneeId === memberUserId, "per-task assignee id persisted on the WorkOrderTask");
    assert(apTask.priority === "HIGH", "per-task priority persisted on the WorkOrderTask");

    console.log(`\nALL NL WORK-ORDER CHECKS PASSED (${passed} assertions)`);
  });
}

main()
  .catch((e) => {
    console.error("\nVERIFY FAILED\n", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await runAsTenant(TENANT, scrub).catch((e) => console.error("scrub error", e));
    await prisma.$disconnect();
  });

