// Section 2 — SO₂ additions. Verbatim port of docs/winebusiness-calculator-formulas.md.
// Reuses SO2_PKA (1.81) from the existing chemistry lib so the constant lives once.
// Pure — tested in test/winemaking-calc-so2.test.ts.

import { SO2_PKA } from "@/lib/chemistry/so2";
import {
  VOLUME_TO_LITERS, VolumeUnit, RATE_UNITS, RateUnitId, MassUnit, MASS_OUTPUT_FACTORS,
  LiquidUnit, LIQUID_OUTPUT_FACTORS,
} from "./units";
import { requirePositive, requireNonNegative } from "./validate";

export { SO2_PKA };

/** SO₂ mass fraction in potassium metabisulfite (KMBS, K₂S₂O₅) — 57.6%. */
export const KMBS_SO2_FRACTION = 0.576;

/**
 * SO₂ addition as KMBS. grams SO₂ = liters × (target / targetFactor); grams KMBS = ÷ 0.576.
 * Verified: 1000 US gal, +50 ppm → 328.59 g KMBS.
 */
export function so2AsKmbs(input: {
  volume: number; volumeUnit: VolumeUnit; target: number; targetUnit: RateUnitId; outUnit: MassUnit;
}): number {
  requirePositive(input.volume, "Volume");
  requireNonNegative(input.target, "Target SO₂");
  const liters = input.volume * VOLUME_TO_LITERS[input.volumeUnit];
  const gramsSO2 = (liters * input.target) / RATE_UNITS[input.targetUnit].factor;
  return gramsSO2 / KMBS_SO2_FRACTION / MASS_OUTPUT_FACTORS[input.outUnit];
}

/**
 * SO₂ addition dosed from a liquid sulfurous stock solution of known % (w/v) strength.
 * result = ((liters / rateFactor) × ((rate / concentration) × 100)) / liquidOutFactor.
 * Verified: 1000 US gal, +50 ppm, 6% → 3154.5 mL.
 */
export function so2AsLiquidSolution(input: {
  volume: number; volumeUnit: VolumeUnit; rate: number; rateUnit: RateUnitId;
  concentrationPct: number; outUnit: LiquidUnit;
}): number {
  requirePositive(input.volume, "Volume");
  requireNonNegative(input.rate, "Rate");
  requirePositive(input.concentrationPct, "Solution concentration");
  const liters = input.volume * VOLUME_TO_LITERS[input.volumeUnit];
  const result =
    (liters / RATE_UNITS[input.rateUnit].factor) * ((input.rate / input.concentrationPct) * 100);
  return result / LIQUID_OUTPUT_FACTORS[input.outUnit];
}

export type MolecularTargetResult = { freeSO2: number; pKa: number; warning?: string };

/**
 * Free SO₂ (ppm) to target for a desired MOLECULAR SO₂. Inverse of Henderson–Hasselbalch:
 * free = molecular × (10^(pH − pKa) + 1). Verified: 0.8 @ pH 3.4 → 31.9 ppm.
 * LOCKED #3: standard molecular targets are 0.5–0.8 mg/L; warn if the target looks 10× low.
 */
export function freeSO2ForMolecularTarget(input: {
  molecularTarget: number; pH: number; pKa?: number;
}): MolecularTargetResult {
  requireNonNegative(input.molecularTarget, "Molecular SO₂ target");
  requirePositive(input.pH, "pH");
  const pKa = input.pKa ?? SO2_PKA;
  const freeSO2 = input.molecularTarget * (Math.pow(10, input.pH - pKa) + 1);
  const warning =
    input.molecularTarget > 0 && input.molecularTarget < 0.2
      ? `Molecular SO₂ target ${input.molecularTarget} mg/L is unusually low — standard is 0.5–0.8 mg/L. Did you mean ${input.molecularTarget * 10}?`
      : undefined;
  return { freeSO2, pKa, ...(warning ? { warning } : {}) };
}

/**
 * SO₂ Reduction (peroxide-style). ADVISORY + DANGEROUS: the reference's 35 / 0.0014 constants are
 * not a clean textbook identity (validate against the source UI), and H₂O₂ additions can
 * irreversibly oxidize/bleach wine. Ported literally; surfaced with a red-banner danger flag.
 */
export function so2Reduction(input: {
  actual: number; actualUnit: RateUnitId; target: number; targetUnit: RateUnitId;
  concentration: number; concentrationUnit: RateUnitId;
}): number {
  requireNonNegative(input.actual, "Actual SO₂");
  requireNonNegative(input.target, "Target SO₂");
  requirePositive(input.concentration, "Peroxide concentration");
  const tmp =
    input.actual * RATE_UNITS[input.actualUnit].factor *
    ((input.target * 1000) / RATE_UNITS[input.targetUnit].factor) * 0.0014;
  return (35 / input.concentration) * tmp / RATE_UNITS[input.concentrationUnit].factor;
}
