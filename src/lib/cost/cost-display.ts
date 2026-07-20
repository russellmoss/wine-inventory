import { weightedAvgUnitCost } from "@/lib/cost/intake-cost";

// Plan 080 / feedback #372 — SURFACING the cost that receipts already booked. Mike asked two things: "I don't
// see the price I entered" and "are we averaging across shipments?". Both are answered by SHOWING what the
// cost engine already computes — this is a pure, read-only fold over the material's supply lots (COST-3: cost
// is never user-editable; COST-1: the number here is the SAME weighted average the depletion engine draws at,
// because it reuses `weightedAvgUnitCost` rather than recomputing it a second, divergent way).

/** A shipment as this summary needs it — one SupplyLot (a costed receipt). `unitCost` is the price PAID per
 *  stock unit at receipt (null = no price entered, D14). */
export type ConsumableCostShipment = {
  unitCost: number | null;
  qtyReceived: number;
  qtyRemaining: number;
};

export type ConsumableCostSummary = {
  /** Weighted average unit cost across the shipments STILL IN STOCK that carry a price. Null when no priced
   *  stock remains. This is exactly the material's `avgUnitCost` — the cost every draw-down is charged. */
  weightedAvgUnitCost: number | null;
  /** In-stock shipments that carry a price — the ones the average is built from. */
  pricedShipmentCount: number;
  /** In-stock shipments with NO price entered — excluded from the average (never counted as $0, COST-2). */
  unpricedShipmentCount: number;
};

/**
 * Summarize the cost basis a winery operator actually cares about: what is the blended cost of what I have on
 * hand, how many priced shipments is it built from, and is any in-stock shipment missing a price (so the
 * average is incomplete). Weighting is by REMAINING quantity — as older stock depletes, its shipment's pull on
 * the average shrinks, which is why the number moves between shipments. A shipment with qtyRemaining <= 0 is no
 * longer in stock, so it drops out of both the average and the counts (its price still shows in the per-shipment
 * list, as a historical record of what was paid).
 */
export function summarizeConsumableCost(shipments: readonly ConsumableCostShipment[]): ConsumableCostSummary {
  let priced = 0;
  let unpriced = 0;
  for (const s of shipments) {
    const q = Number(s.qtyRemaining);
    if (!Number.isFinite(q) || q <= 0) continue; // not in stock → not part of the current cost basis
    if (s.unitCost == null || !Number.isFinite(s.unitCost) || s.unitCost < 0) unpriced += 1;
    else priced += 1;
  }
  // Single source of truth for the arithmetic — reuse the engine's own weighted average (COST-1).
  return { weightedAvgUnitCost: weightedAvgUnitCost(shipments), pricedShipmentCount: priced, unpricedShipmentCount: unpriced };
}
