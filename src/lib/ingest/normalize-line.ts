import { deriveOpeningLot } from "@/lib/cost/intake-cost";
import type { ExtraUnits } from "@/lib/units/measure";

// Plan 072 Unit 5 (MONEY-CRITICAL, pure): normalize an invoice line's quantity + landed cost into the
// material's CANONICAL STOCK UNIT and a per-stock-unit cost — the #1 blocker ChatGPT flagged (invoice units
// ≠ stock units). A line billed as "2 × 25 kg" for a material stocked in `g` must become 50000 g at
// (landedLineTotal / 50000) per g, NOT qty=2 at $/each. REUSES the existing, unit-tested `deriveOpeningLot`
// (convert + round8, D14 unknown≠$0) so this shares the exact intake-cost math the app already trusts.
// NO prisma, no React.

export type NormalizedLine = {
  /** Quantity in the material's canonical stock unit (g | mL | unit …); null when the unit can't be expressed there. */
  stockQty: number | null;
  /** Per-stock-unit landed cost; null = unknown (D14 — missing price OR unconvertible unit). */
  unitCost: number | null;
  /** True when the invoice unit can't convert to the stock unit (cross-dimension / unknown unit) — flag for the human, never silently pass raw qty. */
  dimensionMismatch: boolean;
};

const COUNT_SYNONYMS = new Set(["unit", "units", "ea", "each", "pc", "pcs", "piece", "pieces", "count", "ct"]);

/**
 * Split an invoice UOM string into a package amount + base unit. A leading number is the package size:
 *   "25 kg" → { amount: 25, unit: "kg" }   ·   "kg" → { amount: 1, unit: "kg" }   ·   "500 g" → { amount: 500, unit: "g" }
 * Common count synonyms (ea/each/pcs…) normalize to the canonical "unit". Ambiguous package words
 * (case/bag/box) are left as-is so they fail conversion and get flagged (we never guess a pack size).
 */
export function parsePackagingUnit(raw: string | null | undefined): { amount: number; unit: string } {
  const s = String(raw ?? "").trim();
  if (!s) return { amount: 1, unit: "" };
  const m = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*(.+)$/);
  const amount = m ? Number(m[1]) : 1;
  const rawUnit = (m ? m[2] : s).trim().toLowerCase();
  const unit = COUNT_SYNONYMS.has(rawUnit) ? "unit" : rawUnit;
  return { amount: Number.isFinite(amount) && amount > 0 ? amount : 1, unit };
}

/**
 * Normalize one receipt line to the material's stock unit + per-stock-unit landed cost. `qty` is the billed
 * count (of `unit` packages); `unit` is the invoice UOM ("25 kg", "g", "case"); `landedLineTotal` is the
 * charge-inclusive line total from `allocateLandedCost` (null = unknown price); `stockUnit` is the material's
 * canonical unit. Cross-dimension / unknown unit → `dimensionMismatch` (stockQty + unitCost null), never a
 * silent pass-through of the raw invoice qty.
 */
export function normalizeLineToStock(input: {
  qty: number | null | undefined;
  unit: string | null | undefined;
  landedLineTotal: number | null | undefined;
  stockUnit: string | null | undefined;
  /** Plan 075: the tenant's custom-unit registry, so a custom invoice UOM ("drum", "tote") converts to stock. */
  extraUnits?: ExtraUnits;
}): NormalizedLine {
  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { stockQty: null, unitCost: null, dimensionMismatch: false };
  }
  const parsed = parsePackagingUnit(input.unit);
  const packageAmount = qty * parsed.amount;
  const lot = deriveOpeningLot({
    packageAmount,
    packageUnit: parsed.unit,
    totalCost: input.landedLineTotal,
    stockUnit: input.stockUnit,
    extraUnits: input.extraUnits,
  });
  const dimensionMismatch = packageAmount > 0 && lot.qtyInStockUnit == null;
  return { stockQty: lot.qtyInStockUnit, unitCost: lot.unitCost, dimensionMismatch };
}
