/**
 * Plan 035 — De-stem/crush + press/saignée as work-order blocks. End-to-end verification against the live
 * DB (Demo Winery). Drives the real cores through the work-order execution lane (no UI):
 *   • a CRUSH work-order task, completed with picks + measured output, originates a real MUST lot with
 *     yield + a CRUSH ledger op (crushLotTx ran inside the WO's single ledger tx), consuming the picks;
 *   • a PRESS work-order task on that must lot, completed with 2 fractions, splits it into 2 child lots
 *     with SPLIT lineage edges + drawn/loss;
 *   • rejecting a (fresh) crush task reverses the transform (reverseOperationCore → reverseTransformCore):
 *     the must lot is CORRECTED and its picks are freed;
 *   • a press whose fraction was MERGED into an existing lot refuses undo with a clear message;
 *   • the print view resolves the run-time transform ids to human vessel/lot codes (no raw cuids) and
 *     shows the output + fractions.
 * All fixtures are ZZWT-* / system@verify-wo-tf, in the Demo Winery tenant, scrubbed sequentially
 * (FK-safe: children before parents) in a finally block.
 *
 *   npm run verify:work-orders-transform   (requires `npm run seed:demo-tenant` first)
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { createWorkOrderCore, issueWorkOrderCore } from "@/lib/work-orders/lifecycle";
import { completeTaskCore } from "@/lib/work-orders/execute";
import { rejectTaskCore } from "@/lib/work-orders/approval";
import { reverseOperationCore } from "@/lib/ledger/reverse";
import { getWorkOrderPrintView } from "@/lib/work-orders/data";
import { disconnectSystem } from "../src/lib/tenant/system";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-wo-tf" };
const ADMIN = { id: "verify-wo-tf-admin", role: "admin" };

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}
async function assertThrows(fn: () => Promise<unknown>, msg: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    passed++;
    console.log(`  ✓ ${msg} (${e instanceof Error ? e.message : String(e)})`);
    return;
  }
  throw new Error(`ASSERT FAILED: expected throw — ${msg}`);
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;
const num = (d: unknown) => Number(d ?? 0);
const meta = async (opId: number) => ((await prisma.lotOperation.findUniqueOrThrow({ where: { id: opId }, select: { metadata: true } })).metadata ?? {}) as Record<string, unknown>;
const lotVol = async (vesselId: string, lotId: string) => Number((await prisma.vesselLot.findFirst({ where: { vesselId, lotId }, select: { volumeL: true } }))?.volumeL ?? 0);
const statusOf = async (lotId: string) => (await prisma.lot.findUnique({ where: { id: lotId }, select: { status: true } }))?.status;
const remainingKg = async (pickId: string) => Number((await prisma.lotHarvestSource.aggregate({ where: { harvestPickId: pickId }, _sum: { consumedKg: true } }))._sum.consumedKg ?? 0);

async function scrub() {
  const [vy, vt] = await Promise.all([
    prisma.vineyard.findMany({ where: { OR: [{ name: { startsWith: "ZZWT" } }, { abbreviation: "ZWV" }] }, select: { id: true } }),
    prisma.variety.findMany({ where: { OR: [{ name: { startsWith: "ZZWT" } }, { abbreviation: "ZWT" }] }, select: { id: true } }),
  ]);
  const vineyardIds = vy.map((v) => v.id);
  const varietyIds = vt.map((v) => v.id);
  const blocks = await prisma.vineyardBlock.findMany({ where: { vineyardId: { in: vineyardIds } }, select: { id: true } });
  const blockIds = blocks.map((b) => b.id);
  const records = await prisma.harvestRecord.findMany({ where: { OR: [{ vineyardId: { in: vineyardIds } }, { blockId: { in: blockIds } }] }, select: { id: true } });
  const recordIds = records.map((r) => r.id);
  const lots = await prisma.lot.findMany({ where: { OR: [{ originVineyardId: { in: vineyardIds } }, { code: { startsWith: "ZZWT" } }] }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  const wos = await prisma.workOrder.findMany({ where: { title: { startsWith: "ZZWT" } }, select: { id: true } });
  const woIds = wos.map((w) => w.id);

  await prisma.lotOperation.updateMany({ where: { enteredBy: ACTOR.actorEmail }, data: { correctsOperationId: null } }).catch(() => {});
  await prisma.reservation.deleteMany({ where: { workOrderId: { in: woIds } } }).catch(() => {});
  await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } }).catch(() => {}); // cascades tasks + attempts
  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } });
  const opIds = ops.map((o) => o.id);
  await prisma.costLine.deleteMany({ where: { operationId: { in: opIds } } }).catch(() => {});
  await prisma.vesselTransfer.deleteMany({ where: { lotOperationId: { in: opIds } } }).catch(() => {});
  await prisma.lotHarvestSource.deleteMany({ where: { lotId: { in: lotIds } } }).catch(() => {});
  await prisma.lotStateEvent.deleteMany({ where: { lotId: { in: lotIds } } }).catch(() => {});
  await prisma.lotTreatment.deleteMany({ where: { lotId: { in: lotIds } } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: lotIds } }, { childLotId: { in: lotIds } }] } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } }).catch(() => {}); // cascades lines
  await prisma.vesselLot.deleteMany({ where: { lotId: { in: lotIds } } }).catch(() => {});
  await prisma.lotVineyard.deleteMany({ where: { lotId: { in: lotIds } } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } }).catch(() => {});
  await prisma.harvestPick.deleteMany({ where: { harvestRecordId: { in: recordIds } } }).catch(() => {});
  await prisma.harvestRecord.deleteMany({ where: { id: { in: recordIds } } }).catch(() => {});
  await prisma.vesselComponent.deleteMany({ where: { OR: [{ varietyId: { in: varietyIds } }, { vineyardId: { in: vineyardIds } }] } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "ZZWT-" } } }).catch(() => {});
  await prisma.vineyardBlock.deleteMany({ where: { id: { in: blockIds } } }).catch(() => {});
  await prisma.variety.deleteMany({ where: { id: { in: varietyIds } } }).catch(() => {});
  await prisma.vineyard.deleteMany({ where: { id: { in: vineyardIds } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } }).catch(() => {});
}

async function main() {
  await runAsTenant(TENANT, async () => {
    await scrub();

    // ── Fixtures: a single block with generous picks + a set of tanks. ──
    const vineyard = await prisma.vineyard.create({ data: { name: "ZZWT Vineyard", abbreviation: "ZWV" } });
    const variety = await prisma.variety.create({ data: { name: "ZZWT Variety", abbreviation: "ZWT" } });
    const block = await prisma.vineyardBlock.create({ data: { vineyardId: vineyard.id, blockLabel: "ZZWT-B1", code: "1", varietyId: variety.id } });
    const record = await prisma.harvestRecord.create({ data: { blockId: block.id, vineyardId: vineyard.id, vintageYear: 2026, createdByEmail: ACTOR.actorEmail } });
    const pick1 = await prisma.harvestPick.create({ data: { harvestRecordId: record.id, pickDate: new Date("2026-09-10"), weightKg: 5000, brixAtPick: "23.5", createdByEmail: ACTOR.actorEmail } });
    const pick2 = await prisma.harvestPick.create({ data: { harvestRecordId: record.id, pickDate: new Date("2026-09-11"), weightKg: 5000, createdByEmail: ACTOR.actorEmail } });
    const pick3 = await prisma.harvestPick.create({ data: { harvestRecordId: record.id, pickDate: new Date("2026-09-12"), weightKg: 5000, createdByEmail: ACTOR.actorEmail } });
    const mkTank = async (code: string) => (await prisma.vessel.create({ data: { code, type: "TANK", capacityL: 5000 } })).id;
    const [tankA, tankB, tankC, tankD, tankE, tankF] = await Promise.all([mkTank("ZZWT-A"), mkTank("ZZWT-B"), mkTank("ZZWT-C"), mkTank("ZZWT-D"), mkTank("ZZWT-E"), mkTank("ZZWT-F")]);
    console.log("── fixtures seeded ──");

    // ── 1. CRUSH work-order task → real must lot + yield + op, picks consumed. ──
    console.log("\n── 1. CRUSH block on a work order ──");
    const crushWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWT crush", autoFinalize: true,
      tasks: [{ seq: 1, kind: "OPERATION", title: "De-stem block 1", opType: "CRUSH", plannedPayload: { destemmed: "true", crusherOn: "true", crushedPct: 100 } }],
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: crushWo.workOrderId });
    const crushTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: crushWo.workOrderId } });
    const crushDone = await completeTaskCore(ACTOR, {
      taskId: crushTask.id, commandId: "zzwt-crush-1", autoFinalize: true,
      actualPayload: { picks: [{ pickId: pick1.id, consumedKg: 2000 }], destVesselId: tankA, outputVolumeL: 1400, vintage: 2026, varietyId: variety.id, destemmed: true, crusherOn: true, crushedPct: 100, mustTempC: 18 },
    });
    assert(crushDone.operationId != null, "CRUSH task completion wrote a ledger op");
    const crushOp = await prisma.lotOperation.findUniqueOrThrow({ where: { id: crushDone.operationId! }, select: { type: true } });
    assert(crushOp.type === "CRUSH", "the op is a real CRUSH");
    const crushMeta = await meta(crushDone.operationId!);
    const mustLotId = String(crushMeta.lotId);
    const mustLot = await prisma.lot.findUniqueOrThrow({ where: { id: mustLotId }, select: { form: true } });
    assert(mustLot.form === "MUST", "a MUST lot was originated");
    assert(near(await lotVol(tankA, mustLotId), 1400), `the must lot holds the measured 1400 L (got ${await lotVol(tankA, mustLotId)})`);
    assert(num(crushMeta.yieldLPerTonne) > 0, `yield computed (${num(crushMeta.yieldLPerTonne)} L/t) from 2000 kg → 1400 L`);
    assert(near(await remainingKg(pick1.id), 2000), "pick1 shows 2000 kg consumed by the crush");

    // ── 2. PRESS work-order task on that must lot → 2 child lots + SPLIT lineage + loss. ──
    console.log("\n── 2. PRESS block on a work order ──");
    const pressWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWT press", autoFinalize: true,
      tasks: [{ seq: 1, kind: "OPERATION", title: "Press the must", opType: "PRESS", plannedPayload: { op: "PRESS" } }],
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: pressWo.workOrderId });
    const pressTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: pressWo.workOrderId } });
    const pressDone = await completeTaskCore(ACTOR, {
      taskId: pressTask.id, commandId: "zzwt-press-1", autoFinalize: true,
      actualPayload: { parentLotId: mustLotId, sourceVesselId: tankA, op: "PRESS", lossL: 100, fractions: [{ destVesselId: tankB, volumeL: 900, label: "free-run" }, { destVesselId: tankC, volumeL: 400, label: "press" }] },
    });
    assert(pressDone.operationId != null, "PRESS task completion wrote a ledger op");
    const pressOp = await prisma.lotOperation.findUniqueOrThrow({ where: { id: pressDone.operationId! }, select: { type: true } });
    assert(pressOp.type === "PRESS", "the op is a real PRESS");
    const pressMeta = await meta(pressDone.operationId!);
    const fractions = (pressMeta.fractions as { lotId: string; volumeL: number }[]) ?? [];
    assert(fractions.length === 2, `the press produced 2 child fraction lots (got ${fractions.length})`);
    assert(near(await lotVol(tankB, fractions[0].lotId), 900) && near(await lotVol(tankC, fractions[1].lotId), 400), "each fraction landed in its vessel at the measured volume (900 + 400)");
    const edges = await prisma.lotLineage.findMany({ where: { parentLotId: mustLotId, kind: "SPLIT" } });
    assert(edges.length === 2, `2 SPLIT lineage edges from the must lot to its children (got ${edges.length})`);
    assert(near(num(pressMeta.drawnL), 1400) && near(num(pressMeta.lossL), 100), `drawn 1400 L off the parent incl. 100 L lees loss (${num(pressMeta.drawnL)} / ${num(pressMeta.lossL)})`);
    assert(near(await lotVol(tankA, mustLotId), 0), "the pressed must lot drained to 0 L in its tank");

    // ── 3. Reject a (fresh) crush task → reverseTransformCore corrects the lot + frees the picks. ──
    console.log("\n── 3. Reject a crush → reverse ──");
    const rejWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWT crush to reject",
      tasks: [{ seq: 1, kind: "OPERATION", title: "De-stem (will reject)", opType: "CRUSH", plannedPayload: { destemmed: "true", crusherOn: "true" } }],
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: rejWo.workOrderId });
    const rejTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: rejWo.workOrderId } });
    const rejDone = await completeTaskCore(ACTOR, {
      taskId: rejTask.id, commandId: "zzwt-crush-rej",
      actualPayload: { picks: [{ pickId: pick2.id, consumedKg: 1500 }], destVesselId: tankD, outputVolumeL: 1000, vintage: 2026, varietyId: variety.id, destemmed: true, crusherOn: true },
    });
    assert(rejDone.status === "PENDING_APPROVAL", "the crush completion is PENDING_APPROVAL (no auto-finalize → reviewable)");
    const rejLotId = String((await meta(rejDone.operationId!)).lotId);
    assert(near(await remainingKg(pick2.id), 1500), "pick2 consumed 1500 kg by the to-be-rejected crush");
    const rejResult = await rejectTaskCore(ADMIN, ACTOR, { taskId: rejTask.id, reason: "wrong block" });
    assert(rejResult.status === "REJECTED", "rejecting the crush task moved it to REJECTED");
    assert((await statusOf(rejLotId)) === "CORRECTED", "reverseTransformCore ran: the must lot is CORRECTED (append-only)");
    assert(near(await remainingKg(pick2.id), 0), "pick2 was freed by the reversal (0 kg consumed → available again)");

    // ── 4. A press with a MERGED fraction refuses undo (no lineage snapshot). ──
    console.log("\n── 4. Merged-fraction press refuses undo ──");
    const mmWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWT crush for merge-parent", autoFinalize: true,
      tasks: [{ seq: 1, kind: "OPERATION", title: "De-stem for merge test", opType: "CRUSH", plannedPayload: {} }],
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: mmWo.workOrderId });
    const mmTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: mmWo.workOrderId } });
    const mmDone = await completeTaskCore(ACTOR, { taskId: mmTask.id, commandId: "zzwt-crush-mm", autoFinalize: true, actualPayload: { picks: [{ pickId: pick3.id, consumedKg: 1000 }], destVesselId: tankE, outputVolumeL: 800, vintage: 2026, varietyId: variety.id } });
    const mmLotId = String((await meta(mmDone.operationId!)).lotId);
    // A separate destination lot to merge the fraction into.
    const destWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWT crush for merge-dest", autoFinalize: true,
      tasks: [{ seq: 1, kind: "OPERATION", title: "De-stem merge dest", opType: "CRUSH", plannedPayload: {} }],
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: destWo.workOrderId });
    const destTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: destWo.workOrderId } });
    const destDone = await completeTaskCore(ACTOR, { taskId: destTask.id, commandId: "zzwt-crush-dest", autoFinalize: true, actualPayload: { picks: [{ pickId: pick3.id, consumedKg: 1000 }], destVesselId: tankF, outputVolumeL: 600, vintage: 2026, varietyId: variety.id } });
    const mergeDestLotId = String((await meta(destDone.operationId!)).lotId);
    const mergeWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWT press merged", autoFinalize: true,
      tasks: [{ seq: 1, kind: "OPERATION", title: "Press into existing lot", opType: "PRESS", plannedPayload: { op: "PRESS" } }],
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: mergeWo.workOrderId });
    const mergeTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: mergeWo.workOrderId } });
    const mergeDone = await completeTaskCore(ACTOR, {
      taskId: mergeTask.id, commandId: "zzwt-press-merge", autoFinalize: true,
      actualPayload: { parentLotId: mmLotId, sourceVesselId: tankE, op: "PRESS", lossL: 0, fractions: [{ destVesselId: tankF, volumeL: 800, label: "hard", mergeIntoLotId: mergeDestLotId }] },
    });
    await assertThrows(() => reverseOperationCore(ACTOR, { operationId: mergeDone.operationId! }), "a press with a merged fraction refuses undo with a clear message");

    // ── 5. The print view resolves the run-time transform ids to human labels (no cuids). ──
    console.log("\n── 5. Print view resolves crush + press ──");
    const cuidRe = /^c[a-z0-9]{20,}$/;
    const crushPrint = await getWorkOrderPrintView(TENANT, crushWo.workOrderId);
    const crushRows = new Map((crushPrint?.tasks[0]?.rows ?? []).map((r) => [r.label, r.value]));
    assert(crushRows.get("Destination") === "Tank ZZWT-A", `crush print resolves the destination vessel code (got "${crushRows.get("Destination")}")`);
    assert(crushRows.get("Output") === "1400 L", `crush print shows the measured output (got "${crushRows.get("Output")}")`);
    assert((crushRows.get("Picks") ?? "").includes("2000 kg"), `crush print summarizes the picks (got "${crushRows.get("Picks")}")`);
    const pressPrint = await getWorkOrderPrintView(TENANT, pressWo.workOrderId);
    const pressRows = pressPrint?.tasks[0]?.rows ?? [];
    const pressMap = new Map(pressRows.map((r) => [r.label, r.value]));
    assert(pressMap.get("Operation") === "Press", `press print shows the operation (got "${pressMap.get("Operation")}")`);
    const fractionRows = pressRows.filter((r) => r.label.startsWith("Fraction"));
    assert(fractionRows.length === 2 && fractionRows.every((r) => /Tank ZZWT-[BC] · \d+ L/.test(r.value)), `press print shows 2 fraction rows with vessel + volume (${fractionRows.map((r) => r.value).join("; ")})`);
    assert(pressMap.get("Lees loss") === "100 L", `press print shows lees loss (got "${pressMap.get("Lees loss")}")`);
    const allValues = [...crushRows.values(), ...pressRows.map((r) => r.value)];
    assert(!allValues.some((v) => cuidRe.test(v)), "no raw cuid appears in the printed transform rows");

    console.log(`\nALL WORK-ORDER-TRANSFORM CHECKS PASSED ✓  (${passed} assertions)`);
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
    await disconnectSystem();
  });
