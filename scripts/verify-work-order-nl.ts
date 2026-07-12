/**
 * Phase 9.2 natural-language work-order authoring verify.
 *
 * Demo Winery only. This proves authoring creates and issues a WO with planned tasks, but does not write
 * LotOperation rows; ledger writes still wait for task completion.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { buildNlWorkOrderCommitArgs, buildNlWorkOrderProposal, assertFreshNlWorkOrderProposal } from "@/lib/work-orders/nl-resolve";
import { instantiateTaskBuilds } from "@/lib/work-orders/template-vocabulary";
import { resolveTaskVocabulary } from "@/lib/work-orders/vocabulary-resolver";
import { createWorkOrderCore, issueWorkOrderCore } from "@/lib/work-orders/lifecycle";

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
  await prisma.reservation.deleteMany({ where: { workOrderId: { in: woIds } } });
  await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } });

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

