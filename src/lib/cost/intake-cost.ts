import { round8 } from "@/lib/cost/rollup";
import { convert, type ExtraUnits } from "@/lib/units/measure";

// Phase 036: pure intake cost math. Turns a purchase ("a 100-gallon drum for $X") into the canonical
// per-stock-unit cost the cost engine already understands (SupplyLot.unitCost is per stockUnit), and
// previews the cost of an arbitrary use amount/unit. No prisma, no React — unit-tested directly.
// Cross-dimension or unknown units yield a null cost (UNKNOWN, D14) — never a fabricated $0.

export type OpeningLot = {
  /** Package amount converted into the material's canonical stock unit (g/mL/unit); null if unconvertible. */
  qtyInStockUnit: number | null;
  /** Cost per canonical stock unit; null = unknown (missing/invalid cost, or unconvertible package). */
  unitCost: number | null;
};

/**
 * From a purchase (package amount + unit + total cost) and the material's canonical stock unit, derive the
 * opening lot's quantity (in the stock unit) and its per-stock-unit cost. E.g. a 1-gallon package for $10
 * with stockUnit "mL" → qty 3785.411784 mL, unitCost ≈ 0.00264172 $/mL. Unconvertible (cross-dimension /
 * unknown unit) or non-positive cost → unitCost null (D14); qty null when it can't be expressed in the stock unit.
 */
export function deriveOpeningLot(input: {
  packageAmount: number | null | undefined;
  packageUnit: string | null | undefined;
  totalCost: number | null | undefined;
  stockUnit: string | null | undefined;
  /** Plan 075: the tenant's custom-unit registry, so a custom packageUnit ("drum") converts to canonical. */
  extraUnits?: ExtraUnits;
}): OpeningLot {
  const amount = Number(input.packageAmount);
  const qty = Number.isFinite(amount) && amount > 0 ? convert(amount, input.packageUnit, input.stockUnit, input.extraUnits) : null;
  // null/undefined cost is UNKNOWN (D14), NOT $0 — Number(null) is 0, so guard on nullish first.
  const cost = input.totalCost == null ? NaN : Number(input.totalCost);
  const unitCost = qty != null && qty > 0 && Number.isFinite(cost) && cost >= 0 ? round8(cost / qty) : null;
  return { qtyInStockUnit: qty, unitCost };
}

/**
 * Weighted-average cost per stock unit across a material's open lots (Phase 037 — the "cost" shown read-only
 * in the expendables detail modal). Lots with unknown cost (unitCost null, D14) or non-positive remaining
 * qty are skipped — never counted as $0. Null when no priced stock remains.
 */
export function weightedAvgUnitCost(lots: readonly { qtyRemaining: number; unitCost: number | null }[]): number | null {
  let qty = 0;
  let cost = 0;
  for (const l of lots) {
    if (l.unitCost == null || !Number.isFinite(l.unitCost) || l.unitCost < 0) continue;
    const q = Number(l.qtyRemaining);
    if (!Number.isFinite(q) || q <= 0) continue;
    qty += q;
    cost += q * l.unitCost;
  }
  return qty > 0 ? round8(cost / qty) : null;
}

/** Per-package-unit cost (display convenience): total cost ÷ package amount. Null if either is missing/invalid. */
export function costPerPackageUnit(totalCost: number | null | undefined, packageAmount: number | null | undefined): number | null {
  const c = totalCost == null ? NaN : Number(totalCost); // Number(null) is 0; nullish cost is unknown, not $0
  const a = Number(packageAmount);
  return Number.isFinite(c) && c >= 0 && Number.isFinite(a) && a > 0 ? round8(c / a) : null;
}

/**
 * Cost of using `useAmount` of `useUnit`, given a per-stock-unit `unitCost`. Converts the use into the stock
 * unit first. Null if the unit is unconvertible to the stock unit or the unit cost is unknown (D14).
 */
export function costForUse(input: {
  unitCost: number | null | undefined;
  useAmount: number | null | undefined;
  useUnit: string | null | undefined;
  stockUnit: string | null | undefined;
  /** Plan 075: the tenant's custom-unit registry, so a custom useUnit converts to the stock unit. */
  extraUnits?: ExtraUnits;
}): number | null {
  if (input.unitCost == null || !Number.isFinite(input.unitCost)) return null;
  const amount = Number(input.useAmount);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const qty = convert(amount, input.useUnit, input.stockUnit, input.extraUnits);
  if (qty == null) return null;
  return round8(qty * input.unitCost);
}
