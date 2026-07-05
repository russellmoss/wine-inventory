// Section 8 — blending & cost. Volume-weighted attribute averages + chemically-correct pH
// blending in H⁺ space. Verbatim port of the reference doc's standout formula.
//
// LOCKED #6: pH blending is an ESTIMATE. It converts each component to [H⁺], volume-weights,
// and converts back — more correct than the linear pH average most tools use, but it does NOT
// model wine's buffer capacity. The true blend pH must be confirmed by a bench trial. Callers
// surface `phIsEstimate` so the UI/assistant can show that disclaimer.
//
// Pure — tested in test/winemaking-calc-blending.test.ts.

import { requirePositive } from "./validate";

export type BlendComponent = { volume: number; value: number };

/** Total volume across components. */
export function totalVolume(components: { volume: number }[]): number {
  return components.reduce((s, c) => s + c.volume, 0);
}

/** Simple volume-weighted average — correct for alcohol, TA, ppm SO₂, etc. */
export function blendWeightedAverage(components: BlendComponent[]): number {
  const total = requirePositive(totalVolume(components), "Total volume");
  return components.reduce((s, c) => s + c.volume * c.value, 0) / total;
}

export type BlendPHResult = { blendPH: number; phIsEstimate: true };

/**
 * Blend pH in H⁺ space: Hi = 10^(−pHi)×Bi; H_avg = ΣHi/B8×10000; blend_pH = −log10(H_avg×10⁻⁴).
 * Two equal volumes at pH 3.0 and 4.0 blend to ≈3.26 (NOT the linear 3.5).
 */
export function blendPH(components: { volume: number; pH: number }[]): BlendPHResult {
  const total = requirePositive(totalVolume(components), "Total volume");
  const hTotal = components.reduce((s, c) => s + Math.pow(10, -c.pH) * c.volume, 0);
  const hAvg = (hTotal / total) * 10000;
  return { blendPH: -Math.log10(hAvg * 1e-4), phIsEstimate: true };
}

/** US gallons per standard 12-bottle case (12 × 750 mL ≈ 9 L ≈ 2.38 US gal). */
export const GALLONS_PER_CASE = 2.38;

export type WineCostResult = {
  totalCostPerGal: number;
  percentByCategory: number[];
  totalCases: number;
};

/**
 * Wine cost roll-up. `categories` = the 6 per-gallon cost buckets; total = Σ; each category's
 * % of total; total cases = total / 2.38.
 */
export function wineCost(categories: number[]): WineCostResult {
  const total = categories.reduce((s, c) => s + c, 0);
  requirePositive(total, "Total cost");
  return {
    totalCostPerGal: total,
    percentByCategory: categories.map((c) => (c / total) * 100),
    totalCases: total / GALLONS_PER_CASE,
  };
}
