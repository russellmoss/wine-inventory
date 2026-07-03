import type { Prisma, CostingMethod } from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { planDepletion, type SupplyLotView } from "@/lib/cost/deplete";
import { round8 } from "@/lib/cost/rollup";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { coerceVesselActivityKind, type VesselActivityKindT } from "@/lib/cellar/vessel-activity-vocab";

// Phase 9.1 (Unit 3) — the vessel-activity lane's write path. A maintenance/setpoint task is LOTLESS and
// GATE-FREE: it writes a VesselActivityEvent (no LotOperation), and any cleaning/sanitizer/gas it consumes
// is drawn down as OVERHEAD — an append-only VesselActivitySupplyUse per depleted SupplyLot (A1), NEVER a
// SupplyConsumption or CostLine, NEVER in the wine cost roll-up (WORKORDER-3). Sanitizer isn't a cost of
// any specific wine; keeping it out of the wine DAG is what preserves cost conservation (COST-1/COST-2).
//
// Depletion reuses the SAME pure FIFO/WA planner as the wine path (cost/deplete.ts) and draws-to-zero:
// planDepletion sources what it can and REPORTS a shortfall — it never drives qtyRemaining negative and
// never throws on insufficient stock (E1). The caller surfaces the shortfall as a soft warning.

export type OverheadDepletionResult = {
  drawn: number;
  shortfall: number;
  totalCost: number;
  stockUnit: string | null;
  /** the SupplyLot ids drawn (for the caller/verify). */
  supplyLotIds: string[];
};

/**
 * Draw `qty` (in the material's stock unit) of an overhead supply down its open SupplyLots, FIFO/WA per the
 * tenant's costing method, and record one append-only VesselActivitySupplyUse row per depleted lot against
 * `eventId`. Draws-to-zero + returns the shortfall (never negative on-hand, never throws on short stock).
 * Writes NOTHING to SupplyConsumption/CostLine (overhead, WORKORDER-3).
 */
export async function depleteSupplyOverheadTx(
  tx: Prisma.TransactionClient,
  input: { eventId: string; materialId: string; qty: number },
): Promise<OverheadDepletionResult> {
  const [material, settings] = await Promise.all([
    tx.cellarMaterial.findUnique({ where: { id: input.materialId }, select: { isStockTracked: true, stockUnit: true } }),
    tx.appSettings.findFirst({ select: { costingMethod: true } }),
  ]);
  const method: CostingMethod = settings?.costingMethod ?? "WEIGHTED_AVG";
  const stockUnit = material?.stockUnit ?? null;
  const qty = round8(input.qty);
  if (!(qty > 0)) return { drawn: 0, shortfall: 0, totalCost: 0, stockUnit, supplyLotIds: [] };

  const available = await tx.supplyLot.findMany({
    where: { materialId: input.materialId, qtyRemaining: { gt: 0 } },
    select: { id: true, qtyRemaining: true, unitCost: true, receivedAt: true },
  });
  const lots: SupplyLotView[] = available.map((l) => ({
    id: l.id,
    qtyRemaining: Number(l.qtyRemaining),
    unitCost: l.unitCost == null ? null : Number(l.unitCost),
    receivedAt: l.receivedAt.getTime(),
  }));

  const plan = planDepletion(lots, qty, method);
  const supplyLotIds: string[] = [];
  for (const line of plan.lines) {
    // Draw-to-zero: only decrement what the planner sourced (never below 0, E1).
    await tx.supplyLot.update({ where: { id: line.supplyLotId }, data: { qtyRemaining: { decrement: line.qty } } });
    await tx.vesselActivitySupplyUse.create({
      data: {
        vesselActivityEventId: input.eventId,
        supplyLotId: line.supplyLotId,
        materialId: input.materialId,
        qty: line.qty,
        unit: stockUnit ?? "unit",
        unitCost: line.unitCost,
        extendedCost: line.extendedCost,
      },
    });
    supplyLotIds.push(line.supplyLotId);
  }
  return { drawn: plan.drawn, shortfall: plan.shortfall, totalCost: plan.totalCost, stockUnit, supplyLotIds };
}

export type RecordVesselActivityInput = {
  vesselId: string;
  kind: VesselActivityKindT;
  taskId?: string | null;
  attemptId?: string | null;
  targetValue?: number | null;
  targetUnit?: string | null;
  achievedValue?: number | null; // dec 4b: actual reading captured at completion (e.g. current tank temp)
  achievedUnit?: string | null;
  materialId?: string | null; // overhead supply to deplete (CLEAN/SANITIZE/GAS)
  amount?: number | null; // qty of the supply used, in its stock unit
  note?: string | null;
  observedAt?: Date;
  commandId: string;
};

export type RecordVesselActivityResult = {
  eventId: string;
  depletion: OverheadDepletionResult | null;
};

/**
 * Record a vessel activity inside the caller's tx (composed by the maintenance completion lane). Creates the
 * lotless event, then — if a supply + amount are given — draws it down as overhead. Guards live here (the
 * seam calls it directly). Works on an EMPTY / PARTIAL / FULL vessel (A6 — no residency check).
 */
export async function recordVesselActivityTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  input: RecordVesselActivityInput,
): Promise<RecordVesselActivityResult> {
  if (!input.vesselId) throw new ActionError("A vessel is required.");
  const kind = coerceVesselActivityKind(input.kind);

  const vessel = await tx.vessel.findUnique({ where: { id: input.vesselId }, select: { id: true, isActive: true, code: true } });
  if (!vessel) throw new ActionError("Vessel not found.");
  if (!vessel.isActive) throw new ActionError(`Vessel ${vessel.code} is inactive.`);

  const event = await tx.vesselActivityEvent.create({
    data: {
      vesselId: input.vesselId,
      kind,
      taskId: input.taskId ?? null,
      attemptId: input.attemptId ?? null,
      targetValue: input.targetValue != null && Number.isFinite(input.targetValue) ? input.targetValue : null,
      targetUnit: input.targetUnit?.trim() || null,
      achievedValue: input.achievedValue != null && Number.isFinite(input.achievedValue) ? input.achievedValue : null,
      achievedUnit: input.achievedUnit?.trim() || null,
      materialId: input.materialId ?? null,
      note: input.note?.trim() || null,
      observedAt: input.observedAt ?? new Date(),
      enteredById: actor.actorUserId,
      enteredByEmail: actor.actorEmail,
      commandId: input.commandId,
    },
    select: { id: true },
  });

  let depletion: OverheadDepletionResult | null = null;
  if (input.materialId && input.amount != null && Number.isFinite(input.amount) && input.amount > 0) {
    depletion = await depleteSupplyOverheadTx(tx, { eventId: event.id, materialId: input.materialId, qty: input.amount });
  }

  return { eventId: event.id, depletion };
}

/**
 * A2: reverse a vessel activity — restore each depleted SupplyLot BY IDENTITY (increment qtyRemaining back,
 * append a negating VesselActivitySupplyUse row linked to the original) and void the event. Double-undo is
 * blocked (a voided event throws). Mirrors negateCostForReversedOp's identity-restoration discipline.
 */
export async function reverseVesselActivityTx(
  tx: Prisma.TransactionClient,
  _actor: LedgerActor,
  eventId: string,
): Promise<{ restoredUses: number }> {
  const event = await tx.vesselActivityEvent.findUnique({ where: { id: eventId }, select: { id: true, voidedAt: true } });
  if (!event) throw new ActionError("That activity no longer exists.");
  if (event.voidedAt) throw new ActionError("That activity was already reversed.");

  // Claim the void FIRST, guarded on voidedAt still being null — the claim (not the read above) is the
  // concurrency guard, so two racing reversals can't both restore stock (the loser matches 0 rows → throws).
  const claimed = await tx.vesselActivityEvent.updateMany({ where: { id: eventId, voidedAt: null }, data: { voidedAt: new Date() } });
  if (claimed.count === 0) throw new ActionError("That activity was already reversed.");

  // Only the original draws (positive qty, not themselves reversal rows, not already reversed).
  const uses = await tx.vesselActivitySupplyUse.findMany({
    where: { vesselActivityEventId: eventId, reversalOfSupplyUseId: null },
    select: { id: true, supplyLotId: true, materialId: true, qty: true, unit: true, unitCost: true, extendedCost: true },
  });
  const alreadyReversed = new Set(
    (await tx.vesselActivitySupplyUse.findMany({ where: { vesselActivityEventId: eventId, reversalOfSupplyUseId: { not: null } }, select: { reversalOfSupplyUseId: true } })).map((r) => r.reversalOfSupplyUseId),
  );

  let restoredUses = 0;
  for (const u of uses) {
    if (alreadyReversed.has(u.id)) continue;
    const qty = Number(u.qty);
    if (qty <= 0) continue;
    await tx.supplyLot.update({ where: { id: u.supplyLotId }, data: { qtyRemaining: { increment: qty } } });
    await tx.vesselActivitySupplyUse.create({
      data: {
        vesselActivityEventId: eventId,
        supplyLotId: u.supplyLotId,
        materialId: u.materialId,
        qty: -qty, // negating row
        unit: u.unit,
        unitCost: u.unitCost,
        extendedCost: u.extendedCost == null ? null : -Number(u.extendedCost),
        reversalOfSupplyUseId: u.id,
      },
    });
    restoredUses += 1;
  }

  return { restoredUses }; // the event was already voided (claimed) above

}
