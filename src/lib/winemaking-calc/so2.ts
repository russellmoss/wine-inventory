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

export type SO2AdditionPlan = {
  freeTarget: number; // ppm free SO₂ needed in the wine to hit the molecular target at this pH
  additionNeeded: number; // ppm free SO₂ to ADD (target − current, floored at 0)
  kmbsMass: number; // mass of KMBS to deliver the addition, in `outUnit`
  solutionVolume: number; // volume of the % stock solution to deliver the addition, in `solutionOutUnit`
  pKa: number;
  warning?: string;
};

/**
 * The full SO₂ addition workflow in one step (composes the three single-purpose calcs): from a
 * MOLECULAR target + pH, derive the free-SO₂ target; subtract the free SO₂ already present to get the
 * ADDITION needed; then size that addition BOTH as KMBS mass and as a % stock-solution volume. Pure
 * composition of freeSO2ForMolecularTarget + so2AsKmbs + so2AsLiquidSolution — no new formula.
 */
export function so2AdditionPlan(input: {
  volume: number; volumeUnit: VolumeUnit;
  molecularTarget: number; pH: number; currentFree: number;
  concentrationPct: number; outUnit: MassUnit; solutionOutUnit?: LiquidUnit; pKa?: number;
}): SO2AdditionPlan {
  requireNonNegative(input.currentFree, "Current free SO₂");
  const { freeSO2: freeTarget, pKa, warning: lowWarn } = freeSO2ForMolecularTarget({
    molecularTarget: input.molecularTarget, pH: input.pH, pKa: input.pKa,
  });
  const additionNeeded = Math.max(0, freeTarget - input.currentFree);
  const kmbsMass = so2AsKmbs({ volume: input.volume, volumeUnit: input.volumeUnit, target: additionNeeded, targetUnit: "ppm", outUnit: input.outUnit });
  const solutionVolume = so2AsLiquidSolution({ volume: input.volume, volumeUnit: input.volumeUnit, rate: additionNeeded, rateUnit: "ppm", concentrationPct: input.concentrationPct, outUnit: input.solutionOutUnit ?? "mL" });
  const atTarget = additionNeeded === 0
    ? `Current free SO₂ (${input.currentFree} ppm) already meets or exceeds the ${freeTarget.toFixed(1)} ppm target — no addition needed.`
    : undefined;
  const warning = [lowWarn, atTarget].filter(Boolean).join(" ") || undefined;
  return { freeTarget, additionNeeded, kmbsMass, solutionVolume, pKa, ...(warning ? { warning } : {}) };
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
