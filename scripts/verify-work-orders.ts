/**
 * Phase 9 Work Orders — end-to-end verification against the live DB (Demo Winery). Drives the real
 * cores (no UI): seed → create + issue a WO (reservations created, ATP reflected) → complete a RACK task
 * (real RACK op written, projection moved, task PENDING_APPROVAL, attempt owns the op) → complete an
 * ADDITION task (SupplyLot depleted + MATERIAL cost line) → complete a BRIX OBSERVATION (panel written,
 * DONE, no approval) → approve the rack (finalize) → reject the addition (reverseOperationCore corrects,
 * cost negated, stock restored) → idempotent duplicate completion is a no-op. Scrubs in a finally path.
 *
 *   npm run verify:work-orders   (requires `npm run seed:demo-tenant` first)
 *
 * Neon cold-start: widen timeouts if the compute is asleep (see verify-cost.ts header).
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { createWorkOrderCore, issueWorkOrderCore } from "@/lib/work-orders/lifecycle";
import { completeTaskCore, completeTasksBatchCore } from "@/lib/work-orders/execute";
import { approveTaskCore, rejectTaskCore } from "@/lib/work-orders/approval";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-work-orders" };
const ADMIN = { id: "verify-wo-admin", role: "admin" as const };

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;
const num = (d: unknown) => Number(d ?? 0);

async function seedLotInVessel(code: string, vesselId: string, volumeL: number): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, form: "WINE" } });
  const vessel = await prisma.vessel.findUniqueOrThrow({ where: { id: vesselId } });
  const lines: LedgerLine[] = [
    { lotId: lot.id, vesselId, deltaL: volumeL },
    { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" },
  ];
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED", lines, actorUserId: null, enteredBy: ACTOR.actorEmail, note: "verify-work-orders seed",
      lotCodes: new Map([[lot.id, code]]), vesselCodes: new Map([[vesselId, vessel.code]]), capacityByVessel: new Map([[vesselId, Number(vessel.capacityL)]]),
    }),
  );
  return lot.id;
}

async function scrub() {
  console.log("\n── scrubbing test data ──");
  const wos = await prisma.workOrder.findMany({ where: { title: { startsWith: "ZZWO" } }, select: { id: true } });
  const woIds = wos.map((w) => w.id);
  // Delete WOs first (cascades tasks → attempts → reservations), which frees the RESTRICT ref to ops.
  await prisma.reservation.deleteMany({ where: { workOrderId: { in: woIds } } });
  await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } });
  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } });
  const opIds = ops.map((o) => o.id);
  const lots = await prisma.lot.findMany({ where: { code: { startsWith: "ZZWO" } }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  const mats = await prisma.cellarMaterial.findMany({ where: { name: { startsWith: "ZZWO" } }, select: { id: true } });
  const matIds = mats.map((m) => m.id);
  await prisma.supplyConsumption.deleteMany({ where: { operationId: { in: opIds } } });
  await prisma.costLine.deleteMany({ where: { operationId: { in: opIds } } });
  await prisma.analysisReading.deleteMany({ where: { panel: { lotId: { in: lotIds } } } });
  await prisma.analysisPanel.deleteMany({ where: { lotId: { in: lotIds } } });
  await prisma.lotTreatment.deleteMany({ where: { lotId: { in: lotIds } } });
  await prisma.vesselTransfer.deleteMany({ where: { lotOperationId: { in: opIds } } });
  await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } });
  await prisma.supplyLot.deleteMany({ where: { materialId: { in: matIds } } });
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "ZZ-WO" } } });
  await prisma.lot.deleteMany({ where: { code: { startsWith: "ZZWO" } } });
  await prisma.cellarMaterial.deleteMany({ where: { id: { in: matIds } } });
  // Plan 039: harvest weigh-in fixtures (vineyard → block → record → picks). Delete records (cascades
  // picks) before blocks (block delete is RESTRICTed by records); WOs above already freed the task→block FK.
  const zVineyards = await prisma.vineyard.findMany({ where: { name: { startsWith: "ZZWO" } }, select: { id: true } });
  const zvIds = zVineyards.map((v) => v.id);
  const zBlocks = await prisma.vineyardBlock.findMany({ where: { vineyardId: { in: zvIds } }, select: { id: true } });
  const zbIds = zBlocks.map((b) => b.id);
  await prisma.harvestRecord.deleteMany({ where: { blockId: { in: zbIds } } });
  await prisma.vineyardBlock.deleteMany({ where: { id: { in: zbIds } } });
  await prisma.vineyard.deleteMany({ where: { id: { in: zvIds } } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } });
  console.log(`  removed ${woIds.length} WOs, ${opIds.length} ops, ${lotIds.length} lots (by pattern)`);
}

async function main() {
  await runAsTenant(TENANT, async () => {
    await scrub(); // clean any prior interrupted run

    // ── Fixtures: source tank (100 L of a lot), empty dest tank, a keg, a stock-tracked material. ──
    const src = await prisma.vessel.create({ data: { code: "ZZ-WO-SRC", type: "TANK", capacityL: 500 } });
    const dst = await prisma.vessel.create({ data: { code: "ZZ-WO-DST", type: "TANK", capacityL: 500 } });
    const lotId = await seedLotInVessel("ZZWO-LOT-1", src.id, 100);
    const material = await prisma.cellarMaterial.create({
      data: { name: "ZZWO Tannin", normalizedKey: "ZZWOTANNIN", kind: "TANNIN", isStockTracked: true, stockUnit: "g" },
    });
    await prisma.supplyLot.create({ data: { materialId: material.id, qtyReceived: 1000, qtyRemaining: 1000, stockUnit: "g", unitCost: "0.02", updatedAt: new Date() } });
    console.log("── fixtures seeded ──");

    // ── Create + issue a WO with a RACK, an ADDITION, and a BRIX observation task. ──
    const wo = await createWorkOrderCore(ACTOR, {
      title: "ZZWO end-to-end",
      tasks: [
        { seq: 1, kind: "OPERATION", title: "Rack src→dst", opType: "RACK", sourceVesselId: src.id, destVesselId: dst.id, lotId, plannedPayload: { fromVesselId: src.id, toVesselId: dst.id, drawL: 40 } },
        { seq: 2, kind: "OPERATION", title: "Add tannin", opType: "ADDITION", destVesselId: src.id, lotId, materialId: material.id, plannedPayload: { vesselId: src.id, lotId, materialId: material.id, rateValue: 0.5, rateBasis: "G_L", plannedAmount: 50, plannedUnit: "g" } },
        { seq: 3, kind: "OBSERVATION", title: "Log Brix", observationType: "BRIX", lotId, destVesselId: src.id, plannedPayload: { vesselId: src.id, lotId } },
      ],
    });
    assert(!!wo.workOrderId && wo.status === "DRAFT", "WO created in DRAFT with a number");

    // ── Plan 069 (WORKORDER-5): the Lead is mandatory. A create with no Lead defaults to the creating
    // actor; an explicit Lead passes through unchanged. ──
    const woLead = await prisma.workOrder.findUniqueOrThrow({ where: { id: wo.workOrderId }, select: { assigneeEmail: true } });
    assert(woLead.assigneeEmail === ACTOR.actorEmail, "WORKORDER-5: a null Lead defaulted to the creating actor");
    const leadWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWO explicit lead",
      assigneeEmail: "lead@zzwo.test",
      tasks: [{ seq: 1, kind: "OBSERVATION", title: "Log Brix", observationType: "BRIX", lotId, destVesselId: src.id, plannedPayload: { vesselId: src.id, lotId } }],
    });
    const explicitLead = await prisma.workOrder.findUniqueOrThrow({ where: { id: leadWo.workOrderId }, select: { assigneeEmail: true } });
    assert(explicitLead.assigneeEmail === "lead@zzwo.test", "WORKORDER-5: an explicit Lead passes through unchanged");

    const issued = await issueWorkOrderCore(ACTOR, { workOrderId: wo.workOrderId });
    assert(issued.status === "ISSUED", "WO issued");
    const reservations = await prisma.reservation.findMany({ where: { workOrderId: wo.workOrderId } });
    assert(reservations.some((r) => r.kind === "LOT_VOLUME" && near(num(r.qty), 40)), "LOT_VOLUME reservation of 40 L created on issue");
    assert(reservations.some((r) => r.kind === "VESSEL_CAPACITY" && r.vesselId === dst.id), "destination VESSEL_CAPACITY reservation created");
    assert(reservations.some((r) => r.kind === "MATERIAL_QTY" && near(num(r.qty), 50)), "MATERIAL_QTY reservation of 50 g created");

    const tasks = await prisma.workOrderTask.findMany({ where: { workOrderId: wo.workOrderId }, orderBy: { seq: "asc" } });
    const [rackTask, addTask, obsTask] = tasks;

    // ── Complete the RACK task → real RACK op, projection moved, PENDING_APPROVAL. ──
    const rackDone = await completeTaskCore(ACTOR, { taskId: rackTask.id, commandId: "zzwo-rack-1", actualPayload: { drawL: 40 } });
    assert(rackDone.operationId != null && !rackDone.duplicate, "RACK completion wrote a ledger op");
    assert(rackDone.status === "PENDING_APPROVAL", "rack task is PENDING_APPROVAL");
    const rackOp = await prisma.lotOperation.findUniqueOrThrow({ where: { id: rackDone.operationId! }, select: { type: true } });
    assert(rackOp.type === "RACK", "the op is a real RACK");
    const dstVol = num((await prisma.vesselLot.aggregate({ where: { vesselId: dst.id }, _sum: { volumeL: true } }))._sum.volumeL);
    assert(near(dstVol, 40), "projection reflects 40 L now in the destination");

    // Idempotency: same commandId is a no-op (no second op).
    const dup = await completeTaskCore(ACTOR, { taskId: rackTask.id, commandId: "zzwo-rack-1", actualPayload: { drawL: 40 } });
    assert(dup.duplicate === true, "duplicate rack completion (same commandId) is a no-op");
    const rackOpsCount = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail, type: "RACK" } });
    assert(rackOpsCount === 1, "no duplicate RACK op written");

    // ── Complete the ADDITION task → supply depleted + cost line. ──
    const addDone = await completeTaskCore(ACTOR, { taskId: addTask.id, commandId: "zzwo-add-1", actualPayload: { rateValue: 0.5, rateBasis: "G_L" } });
    assert(addDone.status === "PENDING_APPROVAL", "addition task is PENDING_APPROVAL");
    const supplyAfter = num((await prisma.supplyLot.aggregate({ where: { materialId: material.id }, _sum: { qtyRemaining: true } }))._sum.qtyRemaining);
    // A3: the dose is computed from the source's CURRENT volume (60 L after the 40 L rack out), NOT the
    // 100 L at issue time — 0.5 g/L × 60 L = 30 g. Proves the amount isn't frozen at issue.
    assert(near(supplyAfter, 970), `supply depleted by the OPEN-TIME dose 0.5 g/L × 60 L = 30 g (1000 → ${supplyAfter}); A3 not frozen at issue`);
    const costLine = await prisma.costLine.findFirst({ where: { operationId: addDone.operationId!, component: "MATERIAL" } });
    assert(!!costLine, "a MATERIAL cost line was attached");

    // ── Complete the OBSERVATION task → panel written, DONE, no approval gate. ──
    const obsDone = await completeTaskCore(ACTOR, { taskId: obsTask.id, commandId: "zzwo-obs-1", actualPayload: { readings: [{ analyte: "BRIX", value: 21.5, unit: "Brix" }] } });
    assert(obsDone.status === "DONE" && obsDone.operationId === null, "observation task went straight to DONE (no ledger op)");
    const panel = await prisma.analysisPanel.findFirst({ where: { lotId }, include: { readings: true } });
    assert(!!panel && panel.readings.length === 1, "an AnalysisPanel + reading were written directly");

    // ── Approve the rack (finalize) — no op mutation. ──
    const approved = await approveTaskCore(ADMIN, ACTOR, { taskId: rackTask.id });
    assert(approved.status === "APPROVED", "rack task approved (finalized)");

    // ── Reject the addition → reverseOperationCore corrects, cost negated, stock restored. ──
    const rejected = await rejectTaskCore(ADMIN, ACTOR, { taskId: addTask.id, reason: "wrong tannin" });
    assert(rejected.status === "REJECTED", "addition task rejected");
    const supplyRestored = num((await prisma.supplyLot.aggregate({ where: { materialId: material.id }, _sum: { qtyRemaining: true } }))._sum.qtyRemaining);
    assert(near(supplyRestored, 1000), `stock restored on reject (${supplyRestored} → 1000)`);
    const negatedSum = num((await prisma.costLine.aggregate({ where: { lotId, component: "MATERIAL" }, _sum: { amount: true } }))._sum.amount);
    assert(near(negatedSum, 0), `MATERIAL cost nets to zero after reversal (${negatedSum})`);

    // ── Plan 039: a HARVEST_WEIGH_IN block writes a HarvestPick (no ledger op). ──
    const vineyard = await prisma.vineyard.create({ data: { name: "ZZWO Vineyard" } });
    const block = await prisma.vineyardBlock.create({ data: { vineyardId: vineyard.id, blockLabel: "ZZWO Block" } });
    const weighWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWO weigh-in",
      tasks: [
        { seq: 1, kind: "OBSERVATION", title: "Weigh in fruit", observationType: "HARVEST_WEIGH_IN", blockId: block.id, plannedPayload: {} },
      ],
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: weighWo.workOrderId });
    const weighTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: weighWo.workOrderId } });
    const opsBefore = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    const weighDone = await completeTaskCore(ACTOR, {
      taskId: weighTask.id,
      commandId: "zzwo-weigh-1",
      actualPayload: { blockId: block.id, weightKg: 1200, brixAtPick: 24, phAtPick: 3.4, taAtPick: 6.2, pickDate: "2026-09-15" },
    });
    assert(weighDone.status === "DONE" && weighDone.operationId === null, "weigh-in went straight to DONE (no ledger op)");
    const opsAfter = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    assert(opsAfter === opsBefore, "weigh-in wrote NO ledger op");
    const pick = await prisma.harvestPick.findFirst({ where: { harvestRecord: { blockId: block.id, vintageYear: 2026 } } });
    assert(!!pick && near(num(pick!.weightKg), 1200) && near(num(pick!.brixAtPick), 24) && near(num(pick!.phAtPick), 3.4) && near(num(pick!.taAtPick), 6.2),
      "a HarvestPick was written to the block's 2026 record with weight/Brix/pH/TA");
    // Idempotency: same commandId is a no-op (no second pick).
    const weighDup = await completeTaskCore(ACTOR, { taskId: weighTask.id, commandId: "zzwo-weigh-1", actualPayload: { blockId: block.id, weightKg: 1200 } });
    assert(weighDup.duplicate === true, "duplicate weigh-in completion (same commandId) is a no-op");
    const pickCount = await prisma.harvestPick.count({ where: { harvestRecord: { blockId: block.id } } });
    assert(pickCount === 1, "no duplicate HarvestPick written");

    // ── Plan 043: cap management as a WO — issue across 3 tanks, BATCH-complete, reject one (reverse). ──
    const capTanks = await Promise.all(
      [1, 2, 3].map((n) => prisma.vessel.create({ data: { code: `ZZ-WO-CAP${n}`, type: "TANK", capacityL: 500 } })),
    );
    for (let i = 0; i < capTanks.length; i++) await seedLotInVessel(`ZZWO-CAP-${i + 1}`, capTanks[i].id, 200);
    const capWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWO cap management",
      tasks: capTanks.map((v, i) => ({
        seq: i + 1,
        kind: "OPERATION" as const,
        title: `Work the cap — ${v.code}`,
        opType: "CAP_MGMT" as const,
        destVesselId: v.id,
        plannedPayload: { vesselId: v.id, technique: "PUNCHDOWN" },
      })),
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: capWo.workOrderId });
    const capReservations = await prisma.reservation.count({ where: { workOrderId: capWo.workOrderId } });
    assert(capReservations === 0, "cap management reserves nothing (volume-neutral)");
    const capTasks = await prisma.workOrderTask.findMany({ where: { workOrderId: capWo.workOrderId }, orderBy: { seq: "asc" } });

    // Batch-complete all three at once (one commandId per task; shared technique + duration).
    const batch = await completeTasksBatchCore(ACTOR, {
      items: capTasks.map((t, i) => ({ taskId: t.id, commandId: `zzwo-cap-${i + 1}`, actualPayload: { technique: "PUMPOVER", durationMin: 5 } })),
    });
    assert(batch.completed === 3 && batch.failed === 0, `batch completed all 3 cap tasks (completed=${batch.completed}, failed=${batch.failed})`);
    assert(batch.results.every((r) => r.ok && r.operationId != null), "each batch item wrote a real CAP_MGMT op");
    const capOps = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail, type: "CAP_MGMT" } });
    assert(capOps === 3, `three CAP_MGMT ops written (${capOps})`);
    const capTreatments = await prisma.lotTreatment.count({ where: { kind: "PUMPOVER", operation: { enteredBy: ACTOR.actorEmail } } });
    assert(capTreatments === 3, `each cap op wrote a PUMPOVER treatment on its resident lot (${capTreatments})`);
    const capVol = num((await prisma.vesselLot.aggregate({ where: { vesselId: capTanks[0].id }, _sum: { volumeL: true } }))._sum.volumeL);
    assert(near(capVol, 200), "cap management is volume-neutral (200 L unchanged)");

    // Batch idempotency: re-submitting the same commandIds is a no-op (no new ops).
    const capDup = await completeTasksBatchCore(ACTOR, {
      items: capTasks.map((t, i) => ({ taskId: t.id, commandId: `zzwo-cap-${i + 1}`, actualPayload: { technique: "PUMPOVER" } })),
    });
    assert(capDup.results.every((r) => r.ok), "duplicate batch completion is reported ok");
    const capOpsAfterDup = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail, type: "CAP_MGMT" } });
    assert(capOpsAfterDup === 3, "duplicate batch wrote no new CAP_MGMT ops (idempotent)");

    // Regression (review P1): re-completing a PENDING_APPROVAL task with a FRESH commandId must be REJECTED —
    // it must never write a second immutable op. (The same-commandId path above is the idempotent no-op;
    // this is the different-commandId double-write the completeTaskCore guard now closes.)
    let doubleWriteBlocked = false;
    try {
      await completeTaskCore(ACTOR, { taskId: capTasks[1].id, commandId: "zzwo-cap-fresh-2", actualPayload: { technique: "PUNCHDOWN" } });
    } catch {
      doubleWriteBlocked = true;
    }
    assert(doubleWriteBlocked, "re-completing a PENDING_APPROVAL task (fresh commandId) is rejected");
    const capOpsAfterFresh = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail, type: "CAP_MGMT" } });
    assert(capOpsAfterFresh === 3, "no second CAP_MGMT op written by the fresh-commandId re-completion");

    // Reject one cap task → reverseOperationCore voids the neutral op (WORKORDER-1 reject path).
    const capRejected = await rejectTaskCore(ADMIN, ACTOR, { taskId: capTasks[0].id, reason: "wrong technique" });
    assert(capRejected.status === "REJECTED", "a cap-management task can be rejected (op reversed)");

    console.log(`\nALL WORK-ORDER CHECKS PASSED ✓  (${passed} assertions)`);
  });
}

main()
  .catch((e) => {
    console.error("\n✗ VERIFY FAILED\n", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await runAsTenant(TENANT, scrub).catch((e) => console.error("scrub error", e));
    await prisma.$disconnect();
  });
