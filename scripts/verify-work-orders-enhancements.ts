/**
 * Phase 9.1 Work Orders enhancements — end-to-end verification against the live DB (Demo Winery). Drives
 * the real cores (no UI):
 *   • starter-material seeding is idempotent (org-bootstrap)
 *   • FILTRATION task → a real FILTRATION op + a LotTreatment carrying the filter medium + micron; loss =
 *     pre − actual output (A5)
 *   • TEMP_SETPOINT maintenance → a VesselActivityEvent (no LotOperation), task straight to DONE
 *   • CLEAN maintenance consuming a cleaning supply across TWO SupplyLots (multi-lot FIFO overhead
 *     depletion), writing append-only VesselActivitySupplyUse rows — and NO SupplyConsumption / CostLine
 *     (WORKORDER-3: overhead never enters the wine cost roll-up)
 *   • reverseVesselActivityTx restores the depleted lots by identity; double-undo is blocked (A2)
 *   • a below-stock SANITIZE draws-to-zero + surfaces a shortfall warning (never negative, never blocks, E1)
 *   • duplicate-submit (same commandId) is an idempotent no-op
 *   • the finished WOs appear in the filterable archive
 *
 *   npm run verify:work-orders-enhancements   (requires `npm run seed:demo-tenant` first)
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { createWorkOrderCore, issueWorkOrderCore } from "@/lib/work-orders/lifecycle";
import { completeTaskCore } from "@/lib/work-orders/execute";
import { reverseVesselActivityTx } from "@/lib/work-orders/vessel-activity";
import { seedStarterMaterials } from "@/lib/onboarding/seed-starter-materials";
import { getWorkOrderArchive } from "@/lib/work-orders/data";
import { disconnectSystem } from "../src/lib/tenant/system";

const TENANT = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-wo-enh" };

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
      type: "SEED", lines, actorUserId: null, enteredBy: ACTOR.actorEmail, note: "verify-wo-enh seed",
      lotCodes: new Map([[lot.id, code]]), vesselCodes: new Map([[vesselId, vessel.code]]), capacityByVessel: new Map([[vesselId, Number(vessel.capacityL)]]),
    }),
  );
  return lot.id;
}

async function scrub() {
  console.log("\n── scrubbing test data ──");
  const wos = await prisma.workOrder.findMany({ where: { title: { startsWith: "ZZWE" } }, select: { id: true } });
  const woIds = wos.map((w) => w.id);
  const mats = await prisma.cellarMaterial.findMany({ where: { name: { startsWith: "ZZWE" } }, select: { id: true } });
  const matIds = mats.map((m) => m.id);
  // Delete activity events BEFORE the work orders: the event→task composite FK is ON DELETE RESTRICT, so a
  // task with a recorded activity event can't be cascade-deleted while the event still references it.
  const events = await prisma.vesselActivityEvent.findMany({ where: { enteredByEmail: ACTOR.actorEmail }, select: { id: true } });
  const eventIds = events.map((e) => e.id);
  await prisma.vesselActivitySupplyUse.deleteMany({ where: { vesselActivityEventId: { in: eventIds } } });
  await prisma.vesselActivityEvent.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.reservation.deleteMany({ where: { workOrderId: { in: woIds } } });
  await prisma.workOrder.deleteMany({ where: { id: { in: woIds } } });
  const ops = await prisma.lotOperation.findMany({ where: { enteredBy: ACTOR.actorEmail }, select: { id: true } });
  const opIds = ops.map((o) => o.id);
  const lots = await prisma.lot.findMany({ where: { code: { startsWith: "ZZWE" } }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  await prisma.supplyConsumption.deleteMany({ where: { operationId: { in: opIds } } });
  await prisma.costLine.deleteMany({ where: { operationId: { in: opIds } } });
  await prisma.lotTreatment.deleteMany({ where: { lotId: { in: lotIds } } });
  await prisma.vesselTransfer.deleteMany({ where: { lotOperationId: { in: opIds } } });
  await prisma.lotOperation.deleteMany({ where: { enteredBy: ACTOR.actorEmail } });
  await prisma.supplyLot.deleteMany({ where: { materialId: { in: matIds } } });
  await prisma.vessel.deleteMany({ where: { code: { startsWith: "ZZWE" } } });
  await prisma.lot.deleteMany({ where: { code: { startsWith: "ZZWE" } } });
  await prisma.cellarMaterial.deleteMany({ where: { id: { in: matIds } } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.actorEmail } });
  console.log(`  removed ${woIds.length} WOs, ${eventIds.length} activity events, ${opIds.length} ops (by pattern)`);
}

async function main() {
  // ── Org-bootstrap seeding is idempotent (call twice → catalog stable). ──
  const first = await seedStarterMaterials(TENANT);
  const second = await seedStarterMaterials(TENANT);
  assert(first.seeded === second.seeded && first.seeded > 0, `seedStarterMaterials idempotent (${first.seeded} each run)`);

  await runAsTenant(TENANT, async () => {
    await scrub();

    // ── Fixtures: a wine tank (100 L), an empty tank, a costed proxycarb (2 lots for FIFO), a small PAA lot. ──
    const wineTank = await prisma.vessel.create({ data: { code: "ZZWE-WINE", type: "TANK", capacityL: 500 } });
    const emptyTank = await prisma.vessel.create({ data: { code: "ZZWE-EMPTY", type: "TANK", capacityL: 500 } });
    const wineLot = await seedLotInVessel("ZZWE-LOT-1", wineTank.id, 100);

    const proxycarb = await prisma.cellarMaterial.create({ data: { name: "ZZWE Proxycarb", normalizedKey: "ZZWEPROXYCARB", kind: "CLEANING", isStockTracked: true, stockUnit: "g" } });
    await prisma.supplyLot.create({ data: { materialId: proxycarb.id, qtyReceived: 30, qtyRemaining: 30, stockUnit: "g", unitCost: "0.01", receivedAt: new Date("2026-01-01"), updatedAt: new Date() } });
    await prisma.supplyLot.create({ data: { materialId: proxycarb.id, qtyReceived: 100, qtyRemaining: 100, stockUnit: "g", unitCost: "0.02", receivedAt: new Date("2026-02-01"), updatedAt: new Date() } });
    const paa = await prisma.cellarMaterial.create({ data: { name: "ZZWE PAA", normalizedKey: "ZZWEPAA", kind: "SANITIZER", isStockTracked: true, stockUnit: "mL" } });
    await prisma.supplyLot.create({ data: { materialId: paa.id, qtyReceived: 5, qtyRemaining: 5, stockUnit: "mL", unitCost: "0.50", updatedAt: new Date() } });
    const tannin = await prisma.cellarMaterial.create({ data: { name: "ZZWE Tannin", normalizedKey: "ZZWETANNIN", kind: "TANNIN", isStockTracked: true, stockUnit: "g" } });
    await prisma.supplyLot.create({ data: { materialId: tannin.id, qtyReceived: 1000, qtyRemaining: 1000, stockUnit: "g", unitCost: "0.02", updatedAt: new Date() } });
    console.log("── fixtures seeded ──");

    // Snapshot the wine cost DAG so WORKORDER-3 can prove maintenance never touches it.
    const consumptionsBefore = await prisma.supplyConsumption.count();
    const costLinesBefore = await prisma.costLine.count();

    // ── 1. FILTRATION task → real FILTRATION op + treatment (medium/micron); loss = 100 − 98 = 2 (A5). ──
    const filtWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWE filtration",
      tasks: [{ seq: 1, kind: "OPERATION", title: "Filter wine", opType: "FILTRATION", destVesselId: wineTank.id, lotId: wineLot, plannedPayload: { vesselId: wineTank.id, filterType: "Cross-flow", micron: 0.45, actualOutputL: 98 } }],
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: filtWo.workOrderId });
    const filtTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: filtWo.workOrderId } });
    const filtDone = await completeTaskCore(ACTOR, { taskId: filtTask.id, commandId: "zzwe-filt-1", actualPayload: { actualOutputL: 98 } });
    assert(filtDone.operationId != null, "FILTRATION completion wrote a ledger op");
    const filtOp = await prisma.lotOperation.findUniqueOrThrow({ where: { id: filtDone.operationId! }, select: { type: true } });
    assert(filtOp.type === "FILTRATION", "the op is a real FILTRATION");
    const treatment = await prisma.lotTreatment.findFirst({ where: { operationId: filtDone.operationId!, kind: "FILTRATION" } });
    assert(!!treatment && treatment.medium === "Cross-flow" && near(num(treatment.micron), 0.45), "LotTreatment carries the filter medium + micron");
    const wineVol = num((await prisma.vesselLot.aggregate({ where: { vesselId: wineTank.id }, _sum: { volumeL: true } }))._sum.volumeL);
    assert(near(wineVol, 98), `filtration loss = pre − actual (100 → ${wineVol}); A5`);

    // ── 2. TEMP_SETPOINT maintenance → VesselActivityEvent, NO ledger op, task DONE. ──
    const opsBeforeTemp = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    const tempWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWE temp setpoint",
      tasks: [{ seq: 1, kind: "MAINTENANCE", title: "Cold settle", activityType: "TEMP_SETPOINT", destVesselId: wineTank.id, plannedPayload: { vesselId: wineTank.id, targetValue: 4, targetUnit: "°C" } }],
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: tempWo.workOrderId });
    const tempTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: tempWo.workOrderId } });
    const tempDone = await completeTaskCore(ACTOR, { taskId: tempTask.id, commandId: "zzwe-temp-1", actualPayload: { targetValue: 4, achievedValue: 5 } });
    assert(tempDone.status === "DONE" && tempDone.operationId === null, "TEMP_SETPOINT went straight to DONE, no ledger op");
    const opsAfterTemp = await prisma.lotOperation.count({ where: { enteredBy: ACTOR.actorEmail } });
    assert(opsAfterTemp === opsBeforeTemp, "TEMP_SETPOINT wrote NO LotOperation");
    const tempEvent = await prisma.vesselActivityEvent.findFirst({ where: { taskId: tempTask.id } });
    assert(!!tempEvent && tempEvent.kind === "TEMP_SETPOINT" && near(num(tempEvent.targetValue), 4) && near(num(tempEvent.achievedValue), 5), "VesselActivityEvent recorded target + achieved temp (dec 4b)");

    // ── 3. CLEAN maintenance on the EMPTY tank consuming 50 g proxycarb across TWO lots (multi-lot FIFO). ──
    const cleanWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWE clean",
      tasks: [{ seq: 1, kind: "MAINTENANCE", title: "Clean empty tank", activityType: "CLEAN", destVesselId: emptyTank.id, materialId: proxycarb.id, plannedPayload: { vesselId: emptyTank.id, materialId: proxycarb.id, amount: 50 } }],
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: cleanWo.workOrderId });
    const cleanTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: cleanWo.workOrderId } });
    const cleanDone = await completeTaskCore(ACTOR, { taskId: cleanTask.id, commandId: "zzwe-clean-1", actualPayload: { amount: 50 } });
    assert(cleanDone.status === "DONE", "CLEAN maintenance on an EMPTY tank completed (A6)");
    const cleanEvent = await prisma.vesselActivityEvent.findFirstOrThrow({ where: { taskId: cleanTask.id }, include: { supplyUses: true } });
    assert(cleanEvent.supplyUses.length === 2, `overhead depletion spanned 2 SupplyLots (FIFO) — ${cleanEvent.supplyUses.length} use rows`);
    const proxycarbLots = await prisma.supplyLot.findMany({ where: { materialId: proxycarb.id }, orderBy: { receivedAt: "asc" } });
    assert(near(num(proxycarbLots[0].qtyRemaining), 0) && near(num(proxycarbLots[1].qtyRemaining), 80), `FIFO drew oldest-first: lot1 30→0, lot2 100→80 (${num(proxycarbLots[0].qtyRemaining)}, ${num(proxycarbLots[1].qtyRemaining)})`);

    // WORKORDER-3: the overhead depletion wrote NO SupplyConsumption + NO CostLine — the wine roll-up is untouched.
    const consumptionsAfter = await prisma.supplyConsumption.count();
    const costLinesAfter = await prisma.costLine.count();
    assert(consumptionsAfter === consumptionsBefore, `WORKORDER-3: no SupplyConsumption written by maintenance (${consumptionsBefore} → ${consumptionsAfter})`);
    assert(costLinesAfter === costLinesBefore, `WORKORDER-3: no CostLine written by maintenance (${costLinesBefore} → ${costLinesAfter})`);

    // ── 4. reverseVesselActivityTx restores the lots by identity; double-undo is blocked. ──
    const reversed = await runInTenantTx((tx) => reverseVesselActivityTx(tx, ACTOR, cleanEvent.id));
    assert(reversed.restoredUses === 2, "reversal restored both supply uses by identity");
    const proxycarbRestored = await prisma.supplyLot.findMany({ where: { materialId: proxycarb.id }, orderBy: { receivedAt: "asc" } });
    assert(near(num(proxycarbRestored[0].qtyRemaining), 30) && near(num(proxycarbRestored[1].qtyRemaining), 100), "on-hand restored to 30 / 100 after undo");
    let doubleBlocked = false;
    try { await runInTenantTx((tx) => reverseVesselActivityTx(tx, ACTOR, cleanEvent.id)); } catch { doubleBlocked = true; }
    assert(doubleBlocked, "double-undo is blocked (voided event throws)");

    // ── 5. Below-stock SANITIZE draws-to-zero + surfaces a shortfall warning (never negative, never blocks). ──
    const saniWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWE sanitize",
      tasks: [{ seq: 1, kind: "MAINTENANCE", title: "Sanitize empty tank", activityType: "SANITIZE", destVesselId: emptyTank.id, materialId: paa.id, plannedPayload: { vesselId: emptyTank.id, materialId: paa.id, amount: 20 } }],
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: saniWo.workOrderId });
    const saniTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: saniWo.workOrderId } });
    const saniDone = await completeTaskCore(ACTOR, { taskId: saniTask.id, commandId: "zzwe-sani-1", actualPayload: { amount: 20 } });
    assert(saniDone.status === "DONE", "below-stock SANITIZE still completed (never blocks the floor)");
    assert(/more than on record|warning/i.test(saniDone.message), `shortfall surfaced as a soft warning: "${saniDone.message}"`);
    const paaLot = await prisma.supplyLot.findFirstOrThrow({ where: { materialId: paa.id } });
    assert(near(num(paaLot.qtyRemaining), 0) && num(paaLot.qtyRemaining) >= 0, `PAA drew to zero, NOT negative (${num(paaLot.qtyRemaining)})`);

    // ── 6. Duplicate submit (same commandId) is an idempotent no-op. ──
    const eventsBeforeDup = await prisma.vesselActivityEvent.count({ where: { enteredByEmail: ACTOR.actorEmail } });
    const dup = await completeTaskCore(ACTOR, { taskId: saniTask.id, commandId: "zzwe-sani-1", actualPayload: { amount: 20 } });
    assert(dup.duplicate === true, "duplicate maintenance submit (same commandId) is a no-op");
    const eventsAfterDup = await prisma.vesselActivityEvent.count({ where: { enteredByEmail: ACTOR.actorEmail } });
    assert(eventsAfterDup === eventsBeforeDup, "no duplicate VesselActivityEvent written");

    // ── 6b. ADDITION dosed by a direct AMOUNT (not a rate) depletes EXACTLY that amount + costs it. ──
    const addWo = await createWorkOrderCore(ACTOR, {
      title: "ZZWE addition by amount",
      tasks: [{ seq: 1, kind: "OPERATION", title: "Add 40 g tannin", opType: "ADDITION", destVesselId: wineTank.id, lotId: wineLot, materialId: tannin.id, plannedPayload: { vesselId: wineTank.id, lotId: wineLot, materialId: tannin.id, amount: 40 } }],
    });
    await issueWorkOrderCore(ACTOR, { workOrderId: addWo.workOrderId });
    const addTask = await prisma.workOrderTask.findFirstOrThrow({ where: { workOrderId: addWo.workOrderId } });
    const addDone = await completeTaskCore(ACTOR, { taskId: addTask.id, commandId: "zzwe-add-1", actualPayload: { amount: 40 }, autoFinalize: true });
    assert(addDone.operationId != null, "amount-dosed ADDITION wrote a ledger op");
    const tanninLeft = num((await prisma.supplyLot.aggregate({ where: { materialId: tannin.id }, _sum: { qtyRemaining: true } }))._sum.qtyRemaining);
    assert(near(tanninLeft, 960), `dose-by-amount depleted EXACTLY 40 g (1000 → ${tanninLeft}), independent of volume`);
    const addCost = await prisma.costLine.findFirst({ where: { operationId: addDone.operationId!, component: "MATERIAL" } });
    assert(!!addCost, "a MATERIAL cost line was written for the amount-dosed addition");

    // ── 7. The finished WOs (all tasks DONE → WO APPROVED) appear in the filterable archive. ──
    const archive = await getWorkOrderArchive(TENANT, { q: "ZZWE" }, 1);
    assert(archive.rows.length >= 3, `archive lists the finalized ZZWE work orders (${archive.rows.length} found)`);
    assert(archive.rows.every((r) => r.status === "APPROVED" || r.status === "CANCELLED"), "archive only shows finalized WOs");

    console.log(`\nALL WORK-ORDER-ENHANCEMENTS CHECKS PASSED ✓  (${passed} assertions)`);
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
