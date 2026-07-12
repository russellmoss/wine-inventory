import type { Prisma, ReservationKind } from "@prisma/client";
import { evaluateAtp, advisoryWarning } from "@/lib/work-orders/atp";

// Soft, advisory, expiring reservations (Phase 9 Unit 5). Created on issue for a WO's OPERATION tasks:
// source-lot volume, destination-vessel capacity, and (when the template supplies a planned amount)
// supply quantity at the MATERIAL level (A9 — never a specific SupplyLot, so it doesn't fight the
// FIFO/WA costing engine). WARN-not-block (WORKORDER-2): a short demand still reserves and returns a
// warning; the hard guarantee is at commit. validUntil is SEPARATE from dueAt and defaults well past
// due (A10) so a past-due WO does not auto-expire its holds. All fns run inside the caller's tx.

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : typeof d === "number" ? d : Number(d));
const HOLD_DAYS_PAST_DUE = 7;

type PlannedPayload = {
  drawL?: number;
  lossL?: number;
  volumeL?: number;
  plannedAmount?: number; // supply amount in plannedUnit (templates supply this; else no material hold)
  plannedUnit?: string;
  // Plan 056: a BOTTLE task's planned packaging bill-of-materials (glass/cork/capsule/label/case). Each
  // line reserves the planned quantity (in eaches) as an advisory MATERIAL_QTY hold on issue.
  packaging?: { materialId?: string; qty?: number }[];
};

type ReservationIntent = {
  kind: ReservationKind;
  lotId?: string | null;
  vesselId?: string | null;
  materialId?: string | null;
  qty: number;
  unit?: string;
};

type TaskForReservation = {
  id: string;
  opType: string | null;
  sourceVesselId: string | null;
  destVesselId: string | null;
  lotId: string | null;
  materialId: string | null;
  dueAt: Date | null;
  plannedPayload: unknown;
};

/** Pure: the reservation intents a task implies from its canonical fields + plannedPayload. v1 op types:
 * RACK/TOPPING (source-lot volume + destination headroom) and ADDITION/FINING (material qty, only when
 * the template provided a planned amount). Unknown/partial payloads simply produce fewer intents. */
export function reservationIntentsForTask(task: TaskForReservation): ReservationIntent[] {
  const p = (task.plannedPayload ?? {}) as PlannedPayload;
  const intents: ReservationIntent[] = [];
  const op = task.opType;

  if (op === "RACK" || op === "TOPPING") {
    const drawL = op === "TOPPING" ? p.volumeL : p.drawL;
    const lossL = p.lossL ?? 0;
    if (task.lotId && typeof drawL === "number" && drawL > 0) {
      intents.push({ kind: "LOT_VOLUME", lotId: task.lotId, qty: drawL, unit: "L" });
    }
    if (task.destVesselId && typeof drawL === "number" && drawL > 0) {
      intents.push({ kind: "VESSEL_CAPACITY", vesselId: task.destVesselId, qty: Math.max(0, drawL - lossL), unit: "L" });
    }
  }

  if (op === "ADDITION" || op === "FINING") {
    if (task.materialId && typeof p.plannedAmount === "number" && p.plannedAmount > 0) {
      intents.push({ kind: "MATERIAL_QTY", materialId: task.materialId, qty: p.plannedAmount, unit: p.plannedUnit });
    }
  }

  // Plan 056: a BOTTLE task reserves each planned packaging line (materialId + planned eaches) as an
  // advisory MATERIAL_QTY hold — the same lifecycle an addition's material hold uses (warn-not-block).
  if (op === "BOTTLE" && Array.isArray(p.packaging)) {
    for (const line of p.packaging) {
      if (line && line.materialId && typeof line.qty === "number" && line.qty > 0) {
        intents.push({ kind: "MATERIAL_QTY", materialId: line.materialId, qty: line.qty, unit: "unit" });
      }
    }
  }

  return intents;
}

/** Current uncommitted supply for an intent's target (supply − Σ OTHER active holds), read in-tx. */
async function readAtpContext(
  tx: Prisma.TransactionClient,
  intent: ReservationIntent,
  excludeWorkOrderId: string,
): Promise<{ supply: number; alreadyReserved: number; label: string }> {
  if (intent.kind === "VESSEL_CAPACITY" && intent.vesselId) {
    const vessel = await tx.vessel.findUnique({ where: { id: intent.vesselId }, select: { code: true, capacityL: true } });
    const held = await tx.vesselLot.aggregate({ where: { vesselId: intent.vesselId }, _sum: { volumeL: true } });
    const other = await tx.reservation.aggregate({
      where: { vesselId: intent.vesselId, kind: "VESSEL_CAPACITY", status: "ACTIVE", NOT: { workOrderId: excludeWorkOrderId } },
      _sum: { qty: true },
    });
    const headroom = num(vessel?.capacityL) - num(held._sum.volumeL);
    return { supply: headroom, alreadyReserved: num(other._sum.qty), label: vessel?.code ?? "a vessel" };
  }
  if (intent.kind === "LOT_VOLUME" && intent.lotId) {
    const lot = await tx.lot.findUnique({ where: { id: intent.lotId }, select: { code: true } });
    const vol = await tx.vesselLot.aggregate({ where: { lotId: intent.lotId }, _sum: { volumeL: true } });
    const other = await tx.reservation.aggregate({
      where: { lotId: intent.lotId, kind: "LOT_VOLUME", status: "ACTIVE", NOT: { workOrderId: excludeWorkOrderId } },
      _sum: { qty: true },
    });
    return { supply: num(vol._sum.volumeL), alreadyReserved: num(other._sum.qty), label: lot?.code ? `Lot ${lot.code}` : "a lot" };
  }
  // MATERIAL_QTY
  const material = await tx.cellarMaterial.findUnique({ where: { id: intent.materialId! }, select: { name: true } });
  const onHand = await tx.supplyLot.aggregate({ where: { materialId: intent.materialId!, qtyRemaining: { gt: 0 } }, _sum: { qtyRemaining: true } });
  const other = await tx.reservation.aggregate({
    where: { materialId: intent.materialId!, kind: "MATERIAL_QTY", status: "ACTIVE", NOT: { workOrderId: excludeWorkOrderId } },
    _sum: { qty: true },
  });
  return { supply: num(onHand._sum.qtyRemaining), alreadyReserved: num(other._sum.qty), label: material?.name ?? "a material" };
}

/** Create the soft reservations for a WO's operation tasks on issue. Returns advisory warnings (never
 * throws for a shortfall). validUntil defaults to (max(now, dueAt) + 7 days) so a past-due WO keeps its
 * holds (A10). */
export async function reserveForWorkOrderTx(
  tx: Prisma.TransactionClient,
  input: { workOrderId: string; validUntil?: Date },
): Promise<string[]> {
  const tasks = (await tx.workOrderTask.findMany({
    where: { workOrderId: input.workOrderId, kind: "OPERATION" },
    select: { id: true, opType: true, sourceVesselId: true, destVesselId: true, lotId: true, materialId: true, dueAt: true, plannedPayload: true },
  })) as TaskForReservation[];

  const warnings: string[] = [];
  const now = new Date();
  for (const task of tasks) {
    const validUntil =
      input.validUntil ??
      new Date(Math.max(now.getTime(), (task.dueAt?.getTime() ?? now.getTime())) + HOLD_DAYS_PAST_DUE * 86_400_000);
    for (const intent of reservationIntentsForTask(task)) {
      const ctx = await readAtpContext(tx, intent, input.workOrderId);
      const advisory = evaluateAtp({
        kind: intent.kind,
        targetLabel: ctx.label,
        supply: ctx.supply,
        alreadyReserved: ctx.alreadyReserved,
        requested: intent.qty,
        unit: intent.unit,
      });
      const w = advisoryWarning(advisory);
      if (w) warnings.push(w);
      await tx.reservation.create({
        data: {
          workOrderId: input.workOrderId,
          taskId: task.id,
          kind: intent.kind,
          status: "ACTIVE",
          lotId: intent.lotId ?? null,
          vesselId: intent.vesselId ?? null,
          materialId: intent.materialId ?? null,
          qty: intent.qty,
          unit: intent.unit ?? null,
          validUntil,
        },
      });
    }
  }
  return warnings;
}

/** Release (RELEASED) all ACTIVE reservations for a work order — on cancel or full completion. */
export async function releaseReservationsForWorkOrderTx(
  tx: Prisma.TransactionClient,
  input: { workOrderId: string; reason?: string },
): Promise<number> {
  const res = await tx.reservation.updateMany({
    where: { workOrderId: input.workOrderId, status: "ACTIVE" },
    data: { status: "RELEASED", releasedAt: new Date() },
  });
  return res.count;
}

/** Release a single task's ACTIVE reservations — called on task completion (the real op has committed
 * the actual, so the advisory hold is discharged; reconciliation is planned-vs-actual on the op). */
export async function releaseReservationsForTaskTx(tx: Prisma.TransactionClient, input: { taskId: string }): Promise<number> {
  const res = await tx.reservation.updateMany({
    where: { taskId: input.taskId, status: "ACTIVE" },
    data: { status: "RELEASED", releasedAt: new Date() },
  });
  return res.count;
}

/** Expire (EXPIRED) ACTIVE reservations whose validUntil has passed — the sweep run on the poll cron or
 * on demand. Does NOT expire on due-date passing (A10); only on the hold horizon. */
export async function expireStaleReservationsTx(tx: Prisma.TransactionClient, asOf: Date): Promise<number> {
  const res = await tx.reservation.updateMany({
    where: { status: "ACTIVE", validUntil: { lt: asOf } },
    data: { status: "EXPIRED", releasedAt: asOf },
  });
  return res.count;
}
