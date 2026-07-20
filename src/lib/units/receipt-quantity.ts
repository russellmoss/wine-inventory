import { convert, dimensionOf, type ExtraUnits } from "@/lib/units/measure";

// Plan 080 U15: receive stock in the unit you actually BUY it in, not the unit the app stores it in.
//
// The field report: "labels can only be received in grams" (#366), and a "roll" does not say how many labels
// are on it (#370). The engine could already express "1 roll = 500 labels" (a count-dimension custom unit
// carries its pack size as perCanonical, plan 075) -- but the receive form was hard-locked to the material's
// canonical stock unit, so there was nowhere to say "3 rolls". This resolves a receipt stated in ANY
// compatible unit down to the material's stock unit.
//
// PURE on purpose: this is money math (it sets the per-stock-unit cost that every future depletion charges to
// wine), so it is unit-testable at pack boundaries and runs SERVER-side. The client only previews it.

export type ReceiptQuantityInput = {
  /** Quantity as the user typed it, in `qtyUnit`. */
  qty: number;
  /** The unit the user chose. Null/blank = already in the material's stock unit. */
  qtyUnit?: string | null;
  /** Cost per ONE `qtyUnit` (e.g. per roll), not per stock unit. Null/undefined = unknown cost (D14). */
  unitCost?: number | null;
  /** The material's canonical stock unit. */
  stockUnit: string;
  /** The tenant's user-defined units, so "roll"/"drum"/"tote" resolve. */
  extraUnits?: ExtraUnits;
};

export type ReceiptQuantityResult =
  | { ok: true; qty: number; unitCost: number | null }
  | { ok: false; error: string };

/**
 * Resolve a receipt stated in `qtyUnit` into the material's stock unit.
 *
 * Cost is converted through the TOTAL, never by scaling a per-unit rate: total = qty x unitCost, then
 * per-stock-unit = total / resolvedQty. That keeps Σ(cost) exactly what the user said they paid (COST-1)
 * instead of accumulating a rounding error per unit.
 *
 * Refuses rather than guesses. A cross-dimension request (receiving a gram-tracked powder "by the litre")
 * needs a density we do not have, so it returns an error instead of a fabricated number.
 */
export function resolveReceiptQuantity(input: ReceiptQuantityInput): ReceiptQuantityResult {
  const { qty, stockUnit, extraUnits } = input;
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "Received quantity must be greater than zero." };

  const rawUnitCost = input.unitCost;
  const unitCost = rawUnitCost == null || !Number.isFinite(rawUnitCost) || rawUnitCost < 0 ? null : rawUnitCost;

  const chosen = input.qtyUnit?.trim();
  // No unit given, or the same unit the material is stored in: nothing to convert.
  if (!chosen || chosen.toLowerCase() === stockUnit.trim().toLowerCase()) {
    return { ok: true, qty, unitCost };
  }

  if (dimensionOf(chosen, extraUnits) == null) {
    return { ok: false, error: `"${chosen}" isn't a unit this winery knows. Create it first, or receive in ${stockUnit}.` };
  }

  const resolved = convert(qty, chosen, stockUnit, extraUnits);
  if (resolved == null || !(resolved > 0)) {
    return {
      ok: false,
      error: `Can't receive ${chosen} into something tracked in ${stockUnit} — they measure different things. Receive in ${stockUnit}, or track this item in ${chosen}.`,
    };
  }

  // Convert cost through the total so the money the user entered is preserved exactly.
  const perStockUnit = unitCost == null ? null : (qty * unitCost) / resolved;
  return { ok: true, qty: resolved, unitCost: perStockUnit };
}
