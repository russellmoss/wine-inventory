// Plan 062 Unit 1 — the single SO₂-dosing resolver the work-order path uses.
//
// This is the thin adapter that turns a ppm-SO₂ addition target into the physical thing a
// cellar hand actually adds: grams of KMBS powder, OR millilitres of an "X% KMBS solution".
// It REUSES the audited pure math in winemaking-calc/so2.ts (KMBS_SO2_FRACTION, so2AsKmbs,
// so2AsLiquidSolution) — no constants or formulas are re-derived here.
//
// CONVENTION (locked to the winery's Formulas-and-Conversions.pdf; matches KMBS_SO2_FRACTION):
//   "X% KMBS solution" = X grams KMBS per 100 mL water (w/v KMBS). KMBS is 57.6% active SO₂.
//   so2AsLiquidSolution expects a % w/v of *active SO₂*, so an X% KMBS solution is passed as
//   (X × 0.576). Getting this conversion wrong under-doses SO₂ by ~1.74× — see the golden test.

import { KMBS_SO2_FRACTION, so2AsKmbs, so2AsLiquidSolution } from "@/lib/winemaking-calc/so2";

export type So2DoseInput = {
  /** Target free-SO₂ ADDITION in ppm (mg/L) — the amount to raise the wine by. */
  ppm: number;
  /** Vessel volume the dose acts on, in litres. */
  volumeL: number;
  /**
   * Strength of a stocked/dictated KMBS solution as the "X" in "X% KMBS solution" (g KMBS / 100 mL).
   * Omit / null for the neat-KMBS-powder path (no solution volume is computed).
   */
  solutionPercentKmbs?: number | null;
};

export type So2DoseResult = {
  /** Grams of pure SO₂ the addition delivers. */
  so2Grams: number;
  /** Grams of KMBS powder needed to deliver that SO₂ (÷ 0.576). */
  kmbsGrams: number;
  /** Millilitres of the X% KMBS solution to add; null when no solution strength was given. */
  solutionMl: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Resolve an SO₂ addition to its physical dose. Pure. Volume in litres, target in ppm.
 * Returns grams SO₂, grams KMBS, and (when a solution strength is given) mL of that solution.
 */
export function resolveSo2Dose(input: So2DoseInput): So2DoseResult {
  const ppm = Number(input.ppm);
  const volumeL = Number(input.volumeL);
  if (!Number.isFinite(ppm) || ppm < 0) throw new Error("SO₂ ppm must be a non-negative number.");
  if (!Number.isFinite(volumeL) || volumeL <= 0) throw new Error("Vessel volume must be greater than 0.");

  const so2Grams = round4((volumeL * ppm) / 1000);
  const kmbsGrams = round4(
    so2AsKmbs({ volume: volumeL, volumeUnit: "L", target: ppm, targetUnit: "ppm", outUnit: "g" }),
  );

  let solutionMl: number | null = null;
  const pct = input.solutionPercentKmbs;
  if (pct != null && Number.isFinite(Number(pct)) && Number(pct) > 0) {
    // An X% KMBS solution carries (X × 0.576)% w/v active SO₂ — the basis so2AsLiquidSolution expects.
    const concentrationPctSO2 = Number(pct) * KMBS_SO2_FRACTION;
    solutionMl = round2(
      so2AsLiquidSolution({
        volume: volumeL,
        volumeUnit: "L",
        rate: ppm,
        rateUnit: "ppm",
        concentrationPct: concentrationPctSO2,
        outUnit: "mL",
      }),
    );
  }

  return { so2Grams, kmbsGrams, solutionMl };
}
