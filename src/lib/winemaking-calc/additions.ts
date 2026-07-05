// Section 6 — oak, fining & copper. Verbatim port of the reference doc.
// LOCKED #4: copper is regulated (TTB caps residual Cu at ~0.5 ppm) and dosing is delicate —
// copper calcs carry a danger flag + a TTB-limit warning. Pure — tested in
// test/winemaking-calc-additions.test.ts.

import {
  VOLUME_TO_LITERS, VolumeUnit, RATE_UNITS, RateUnitId, MassUnit, MASS_OUTPUT_FACTORS,
  LiquidUnit, LIQUID_OUTPUT_FACTORS, dose,
} from "./units";
import { requirePositive, requireNonNegative } from "./validate";

/** Elemental Cu → mass of copper sulfate. */
export const CU_TO_CUSO4 = 3.93;
/** TTB residual copper limit (mg/L). */
export const TTB_COPPER_LIMIT_MGL = 0.5;

/** Fining agent dosing — universal dose() (with lbs/1000gal mode). */
export function finingDose(input: {
  volume: number; volumeUnit: VolumeUnit; rate: number; rateUnit: RateUnitId; outUnit: MassUnit;
}): number {
  requirePositive(input.volume, "Volume");
  requireNonNegative(input.rate, "Rate");
  return dose(input);
}

/** Oak addition dosing — identical engine to fining. */
export const oakDose = finingDose;

export type CopperResult = { mass: number; danger: true; ttbWarning?: string };

/** Copper as copper sulfate (anhydrous): liters × (rate × 3.93) / rateFactor / massFactor. */
export function copperAsSulfate(input: {
  volume: number; volumeUnit: VolumeUnit; rate: number; rateUnit: RateUnitId; outUnit: MassUnit;
}): CopperResult {
  requirePositive(input.volume, "Volume");
  requireNonNegative(input.rate, "Target Cu");
  const liters = input.volume * VOLUME_TO_LITERS[input.volumeUnit];
  const mass = (liters * (input.rate * CU_TO_CUSO4)) / RATE_UNITS[input.rateUnit].factor / MASS_OUTPUT_FACTORS[input.outUnit];
  return { mass, danger: true, ...ttbWarn(input.rate, input.rateUnit) };
}

/**
 * Copper as copper sulfate SOLUTION (dosing from a % stock). Mirrors the SO₂-liquid-solution
 * structure with the elemental-Cu → salt factor 3.93 applied. Returns the solution volume.
 */
export function copperAsSulfateSolution(input: {
  volume: number; volumeUnit: VolumeUnit; rate: number; rateUnit: RateUnitId;
  concentrationPct: number; outUnit: LiquidUnit;
}): CopperResult {
  requirePositive(input.volume, "Volume");
  requireNonNegative(input.rate, "Target Cu");
  requirePositive(input.concentrationPct, "Solution concentration");
  const liters = input.volume * VOLUME_TO_LITERS[input.volumeUnit];
  const result =
    (liters / RATE_UNITS[input.rateUnit].factor) * (((input.rate * CU_TO_CUSO4) / input.concentrationPct) * 100);
  return { mass: result / LIQUID_OUTPUT_FACTORS[input.outUnit], danger: true, ...ttbWarn(input.rate, input.rateUnit) };
}

/** Warn if the target Cu, expressed in mg/L, exceeds the TTB residual limit. */
function ttbWarn(rate: number, rateUnit: RateUnitId): { ttbWarning?: string } {
  // mg/L and ppm share factor 1000; g/L is 1000× larger. Normalize to mg/L via the rate factor.
  const mgPerL = rate * (1000 / RATE_UNITS[rateUnit].factor);
  return mgPerL > TTB_COPPER_LIMIT_MGL
    ? { ttbWarning: `Target copper ${mgPerL.toFixed(2)} mg/L exceeds the TTB residual limit of ${TTB_COPPER_LIMIT_MGL} mg/L.` }
    : {};
}
