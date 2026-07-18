import { round2 } from "@/lib/bottling/draw";

// Plan 072 Unit 5 (MONEY-CRITICAL, pure): fold an invoice's charges (shipping / handling / surcharge) into
// each line's TOTAL cost by proportional absorption, so the freight rides into inventory unit cost (correct
// absorption costing — both council models confirmed). NO prisma, no React — unit-tested directly.
//
// Rules that keep the money honest:
//  - TAX is EXCLUDED from the capitalized landed cost (surfaced separately in the reconciliation gate, Unit 7).
//  - A line with UNKNOWN price (subtotal null) absorbs NO charge and stays unknown (D14) — never a fabricated $0.
//  - Charges distribute by line SUBTOTAL (goods value); the rounding residual lands on the last priced line so
//    Σ(landedLineTotal) == Σ(subtotal) + allocatable charges EXACTLY (conservation).

export type InvoiceCharges = {
  shipping?: number | null;
  handling?: number | null;
  surcharge?: number | null;
  /** Surfaced in the reconciliation gate; NOT folded into capitalized landed cost. */
  tax?: number | null;
};

export type LandedAllocation = {
  /** Charge dollars folded into this line (null for an unknown-price line, which absorbs nothing). */
  allocatedCharge: number | null;
  /** subtotal + allocatedCharge; null when the line's price is unknown (D14). */
  landedLineTotal: number | null;
};

/** Non-negative money or 0 (nullish/negative/NaN → 0). */
function money(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

/** The charge total that is ALLOCATED into unit cost: shipping + handling + surcharge (tax excluded). */
export function allocatableCharges(charges: InvoiceCharges | null | undefined): number {
  if (!charges) return 0;
  return round2(money(charges.shipping) + money(charges.handling) + money(charges.surcharge));
}

/**
 * Distribute allocatable charges across line subtotals proportionally. `subtotals[i]` is the goods value of
 * line i (qty × unitPrice, or the extracted line total): a finite number ≥ 0 is a KNOWN price; `null` is an
 * UNKNOWN price. Returns per-line `{ allocatedCharge, landedLineTotal }` in the same order.
 *
 * Conservation: Σ(allocatedCharge over known lines) == allocatableCharges, and Σ(landedLineTotal over known
 * lines) == Σ(known subtotals) + allocatableCharges. Residual (from cent-rounding each share) is applied to
 * the last known line WITH a positive subtotal, so no charge is parked on a $0 line and the sum ties exactly.
 */
export function allocateLandedCost(
  subtotals: readonly (number | null | undefined)[],
  charges: InvoiceCharges | null | undefined,
): LandedAllocation[] {
  const C = allocatableCharges(charges);
  // Known = a real (finite, ≥ 0) price; unknown (null/undefined/NaN) absorbs nothing and stays unknown (D14).
  const known = subtotals.map((s) => (typeof s === "number" && Number.isFinite(s) && s >= 0 ? s : null));
  const base = known.reduce<number>((acc, s) => acc + (s ?? 0), 0);

  // No charge to spread, or no positive base to spread it over → passthrough (landed = subtotal for known lines).
  if (C <= 0 || base <= 0) {
    return known.map((s) => (s == null ? { allocatedCharge: null, landedLineTotal: null } : { allocatedCharge: 0, landedLineTotal: round2(s) }));
  }

  const shares = known.map((s) => (s == null || s <= 0 ? 0 : round2((C * s) / base)));
  // Residual → last known line with a positive subtotal (a real contributor), so the sum ties to the cent.
  let lastPricedIdx = -1;
  for (let i = 0; i < known.length; i++) if (known[i] != null && (known[i] as number) > 0) lastPricedIdx = i;
  if (lastPricedIdx >= 0) {
    const residual = round2(C - shares.reduce((a, b) => a + b, 0));
    shares[lastPricedIdx] = round2(shares[lastPricedIdx] + residual);
  }

  return known.map((s, i) => {
    if (s == null) return { allocatedCharge: null, landedLineTotal: null };
    return { allocatedCharge: shares[i], landedLineTotal: round2(s + shares[i]) };
  });
}
