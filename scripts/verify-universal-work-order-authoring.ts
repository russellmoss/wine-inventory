/**
 * Phase 9.3 universal work-order authoring verify. Demo Winery only.
 *
 * Proves the expanded surface: press-day / crush-day / vessel-sanitation / sample-pull authoring is
 * ready + committable, readiness is source-agnostic, authoring writes NO ledger/stock/sample rows, and
 * completing a SAMPLE_PULL task creates exactly one real (idempotent) Sample. Group barrel-down is
 * declined as future_phase.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { buildNlWorkOrderCommitArgs, buildNlWorkOrderProposal, assertFreshNlWorkOrderProposal } from "@/lib/work-orders/nl-resolve";
import { buildWorkOrderReadiness } from "@/lib/work-orders/proposal-readiness";
import { instantiateTaskBuilds } from "@/lib/work-orders/template-vocabulary";
import { createWorkOrderCore, issueWorkOrderCore } from "@/lib/work-orders/lifecycle";
import { completeTaskCore } from "@/lib/work-orders/execute";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-universal-wo" };
const PFX = "ZZUW";

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  OK ${msg}`);
}

async function scrub() {
  const wos = await prisma.workOrder.findMany({ where: { title: { startsWith: PFX } }, select: { id: true } });
  const woIds = wos.map((w) => w.id);
  const taskIds = (await prisma.workOrderTask.findMany({ where: { workOrderId: { in: woIds } }, select: { id: true } })).map((t) => t.id);
  await prisma.workOrderTaskAttempt.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.reservation.deleteMany({ where: { workOrderId: { in: woIds } } });
  await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } });

  const lots = await prisma.lot.findMany({ where: { code: { startsWith: PFX } }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  const materials = await prisma.cellarMaterial.findMany({ where: { name: { startsWith: PFX } }, select: { id: true } });
  const materialIds = materials.map((m) => m.id);
  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } });
  const opIds = ops.map((o) => o.id);

  await prisma.sample.deleteMany({ where: { lotId: { in: lotIds } } });
  await prisma.supplyConsumption.deleteMany({ where: { operationId: { in: opIds } } });
  await prisma.costLine.deleteMany({ where: { operationId: { in: opIds } } });
  await prisma.lotTreatment.deleteMany({ where: { lotId: { in: lotIds } } });
  await prisma.vesselTransfer.deleteMany({ where: { lotOperationId: { in: opIds } } });
  await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } });
  await prisma.supplyLot.deleteMany({ where: { materialId: { in: materialIds } } });
  await prisma.vessel.deleteMany({ where: { code: { startsWith: PFX } } });
  await prisma.lot.deleteMany({ where: { code: { startsWith: PFX } } });
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
      note: "verify-universal-wo seed",
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

    const t12 = await prisma.vessel.create({ data: { code: `${PFX}-T12`, type: "TANK", capacityL: 500 } });
    await prisma.vessel.create({ data: { code: `${PFX}-T15`, type: "TANK", capacityL: 500 } }); // referenced by code in press/gas/sanitation
    const lotId = await seedLotInVessel(`${PFX}-LOT-1`, t12.id, 200);
    const so2 = await prisma.cellarMaterial.create({
      data: { name: `${PFX} SO2`, normalizedKey: `${PFX}SO2`, kind: "SO2", category: "ADDITIVE", isStockTracked: true, stockUnit: "g" },
    });
    await prisma.supplyLot.create({ data: { materialId: so2.id, qtyReceived: 1000, qtyRemaining: 1000, stockUnit: "g", unitCost: "0.10" } });

    const opsBefore = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    const samplesBeforeAll = await prisma.sample.count({ where: { lotId } });

    // ── Crush day: weigh-in + crush + addition + setpoint ──
    const crushDay = await buildNlWorkOrderProposal({
      sourceText: `Crush day: weigh block, crush to ${PFX}-T12, add 30 ppm SO2, set ${PFX}-T12 to 14 C`,
      title: `${PFX} crush day`,
      tasks: [
        { kind: "HARVEST_WEIGH_IN" },
        { kind: "CRUSH", destVessel: `${PFX}-T12` },
        { kind: "ADDITION", vessel: `${PFX}-T12`, material: `${PFX} SO2`, amount: 30, unit: "ppm" },
        { kind: "TEMP_SETPOINT", vessel: `${PFX}-T12`, targetValue: 14, targetUnit: "C" },
      ],
    });
    assert(crushDay.status === "ready", "crush-day proposal is ready");
    assert(crushDay.taskBuilds.map((t) => t.taskType).join(",") === "HARVEST_WEIGH_IN,CRUSH,ADDITION,TEMP_SETPOINT", "crush-day task families resolved");
    assert(crushDay.warnings.some((w) => w.code === "dose_after_planned_rack") === false, "no spurious planned-rack dose warning on crush day");

    // ── Press day: press + gas (source/fractions runtime) ──
    const pressDay = await buildNlWorkOrderProposal({
      sourceText: `Press day: press and gas ${PFX}-T15 with argon`,
      title: `${PFX} press day`,
      tasks: [
        { kind: "PRESS", op: "PRESS" },
        { kind: "GAS", vessel: `${PFX}-T15`, gasType: "argon" },
      ],
    });
    assert(pressDay.status === "ready", "press-day proposal is ready");

    // ── Vessel sanitation ──
    const sanitation = await buildNlWorkOrderProposal({
      sourceText: `Clean and sanitize ${PFX}-T15`,
      title: `${PFX} sanitation`,
      tasks: [
        { kind: "CLEAN", vessel: `${PFX}-T15` },
        { kind: "SANITIZE", vessel: `${PFX}-T15` },
      ],
    });
    assert(sanitation.status === "ready", "vessel-sanitation proposal is ready");

    // ── Readiness is source-agnostic (manual builder == assistant for the same TaskBuild[]) ──
    const manual = await buildWorkOrderReadiness({ source: "manual", title: crushDay.title, assigneeEmail: null, dueDate: null, taskBuilds: crushDay.taskBuilds });
    assert(JSON.stringify(manual.warnings) === JSON.stringify(crushDay.warnings), "manual readiness matches assistant readiness for identical task builds");

    // ── Group barrel-down declined as future_phase (not faked) ──
    const grouped = await buildNlWorkOrderProposal({ sourceText: `Barrel down ${PFX}-T12 into new barrels` }).catch((e) => e as Error);
    assert(grouped instanceof Error && /isn't completable yet/i.test(grouped.message), "group barrel-down declined as future_phase");

    // ── Authoring wrote NO ledger ops ──
    const opsAfterAuthoring = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    assert(opsAfterAuthoring === opsBefore, "authoring wrote no LotOperation rows");
    const samplesAfterAuthoring = await prisma.sample.count({ where: { lotId } });
    assert(samplesAfterAuthoring === samplesBeforeAll, "authoring created no Sample rows");

    // ── Sample-pull: commit → issue → complete → exactly one real Sample, idempotent ──
    const sampleProposal = await buildNlWorkOrderProposal({
      sourceText: `Pull a sample from ${PFX}-T12 and send to ETS`,
      title: `${PFX} sample WO`,
      tasks: [{ kind: "SAMPLE_PULL", vessel: `${PFX}-T12`, lab: "ETS", sendNow: true }],
    });
    assert(sampleProposal.status === "ready", "sample-pull proposal is ready");
    const sArgs = buildNlWorkOrderCommitArgs(sampleProposal);
    await assertFreshNlWorkOrderProposal(sArgs);
    const created = await createWorkOrderCore(ACTOR, { title: sArgs.title, tasks: instantiateTaskBuilds(sArgs.taskBuilds) });
    await issueWorkOrderCore(ACTOR, { workOrderId: created.workOrderId });
    const sampleTask = (await prisma.workOrderTask.findMany({ where: { workOrderId: created.workOrderId } }))[0];
    assert(sampleTask.observationType === "SAMPLE_PULL", "issued a SAMPLE_PULL task");

    const before = await prisma.sample.count({ where: { lotId } });
    await completeTaskCore(ACTOR, { taskId: sampleTask.id, commandId: `${PFX}-cmd-1`, actualPayload: {} });
    const after = await prisma.sample.count({ where: { lotId } });
    assert(after === before + 1, "completing SAMPLE_PULL created exactly one real sample");

    // Idempotency: replaying the same commandId must NOT create a second sample.
    await completeTaskCore(ACTOR, { taskId: sampleTask.id, commandId: `${PFX}-cmd-1`, actualPayload: {} });
    const after2 = await prisma.sample.count({ where: { lotId } });
    assert(after2 === before + 1, "replaying the same commandId did not duplicate the sample");

    console.log(`\nALL UNIVERSAL WORK-ORDER CHECKS PASSED (${passed} assertions)`);
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
