// Phase 8 (Unit 3) — the supply-depletion PLANNER: pure, DB-free, unit-tested directly. Given the
// on-hand SupplyLots for a material and a quantity to consume, it decides WHICH lots to draw down, in
// what order, at what unit cost, and the resulting basisCompleteness (D11/D14). The in-tx adapter in
// cost/consume.ts turns this plan into SupplyLot decrements + SupplyConsumption rows + a MATERIAL
// CostLine — but the arithmetic + method semantics live here so they can be proven without a database.
//
// Method semantics (D5): both methods deplete OLDEST-first physically (honest qtyRemaining). FIFO
// prices each depleted slice at THAT lot's own unitCost. WEIGHTED_AVG prices every slice at the
// weighted-average unit cost across all on-hand lots with a known cost. A null unitCost is UNKNOWN,
// never $0 (D14): an unknown-cost lot in the draw (or a stock shortfall) taints completeness.

import type { CostingMethod } from "@prisma/client";
import type { Completeness } from "@/lib/cost/rollup";
import { round8, mergeCompleteness } from "@/lib/cost/rollup";

const QTY_EPS = 1e-9;

/** An on-hand costed receipt as the planner sees it. `receivedAt` is epoch ms (pure/deterministic). */
export type SupplyLotView = {
  id: string;
  qtyRemaining: number;
  unitCost: number | null; // null = unknown cost (D14)
  receivedAt: number;
};

export type DepletionLine = {
  supplyLotId: string;
  qty: number;
  unitCost: number | null; // the cost rate ASSIGNED to this slice (lot's own for FIFO, WA rate for WA)
  extendedCost: number | null; // qty × unitCost; null when the rate is unknown
};

export type DepletionPlan = {
  lines: DepletionLine[];
  totalCost: number; // Σ extendedCost over the known-cost slices
  drawn: number; // total qty actually sourced from stock
  shortfall: number; // qty that could NOT be sourced (> 0 ⇒ insufficient stock → unknown-cost portion)
  completeness: Completeness;
};

/** Weighted-average unit cost across on-hand lots with a KNOWN cost. null when none is known. */
export function weightedAvgUnitCost(lots: SupplyLotView[]): number | null {
  let qty = 0;
  let cost = 0;
  for (const l of lots) {
    if (l.unitCost == null || l.qtyRemaining <= QTY_EPS) continue;
    qty += l.qtyRemaining;
    cost += l.qtyRemaining * l.unitCost;
  }
  return qty > QTY_EPS ? round8(cost / qty) : null;
}

/**
 * Plan the depletion of `qty` (in the material's stock unit) from `available` under `method`. Never
 * mutates its inputs. A shortfall (not enough stock) is reported, not thrown — the caller decides
 * whether to allow the addition (D14/Unit 10: a zero-stock addition records as unknown-cost).
 */
export function planDepletion(available: SupplyLotView[], qty: number, method: CostingMethod): DepletionPlan {
  const lines: DepletionLine[] = [];
  if (!(qty > QTY_EPS)) {
    return { lines, totalCost: 0, drawn: 0, shortfall: 0, completeness: "KNOWN" };
  }

  // Oldest-first physical draw (stable tiebreak on id for determinism).
  const ordered = [...available]
    .filter((l) => l.qtyRemaining > QTY_EPS)
    .sort((a, b) => a.receivedAt - b.receivedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const waRate = method === "WEIGHTED_AVG" ? weightedAvgUnitCost(available) : null;
  // Under WA, an on-hand lot with unknown cost taints the whole draw's completeness even though the
  // WA rate is computed over the known ones.
  const waHasUnknownOnHand = ordered.some((l) => l.unitCost == null);

  let remaining = qty;
  let totalCost = 0;
  let completeness: Completeness | undefined;

  for (const lot of ordered) {
    if (remaining <= QTY_EPS) break;
    const take = Math.min(lot.qtyRemaining, remaining);
    remaining = round8(remaining - take);

    const rate = method === "WEIGHTED_AVG" ? waRate : lot.unitCost;
    const known = rate != null && (method === "FIFO" ? lot.unitCost != null : !waHasUnknownOnHand);
    const extended = rate != null ? round8(take * rate) : null;
    if (extended != null) totalCost = round8(totalCost + extended);
    completeness = mergeCompleteness(completeness, known && rate != null ? "KNOWN" : "UNKNOWN");
    lines.push({ supplyLotId: lot.id, qty: round8(take), unitCost: rate, extendedCost: extended });
  }

  const shortfall = round8(Math.max(0, remaining));
  // A shortfall is unsourced, unknown-cost quantity (D14) — it can only make the basis worse.
  if (shortfall > QTY_EPS) completeness = mergeCompleteness(completeness, "UNKNOWN");

  return {
    lines,
    totalCost,
    drawn: round8(qty - shortfall),
    shortfall,
    completeness: completeness ?? "UNKNOWN",
  };
}
