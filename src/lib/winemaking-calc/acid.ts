// Section 5 — acid addition & deacidification. Verbatim port of the reference doc.
// LOCKED #5: the deacid reagent factors (0.67 / 0.673 / 0.62) are the reference's REVISED
// values; a winemaker flagged KHCO₃ 0.673 as a possible half-dose vs textbook ~1.33. So
// deacidification is marked ADVISORY — verify against a bench trial / product label before use.
// Pure — tested in test/winemaking-calc-acid.test.ts.

import { VOLUME_TO_LITERS, VolumeUnit, RATE_UNITS, RateUnitId, MassUnit, MASS_OUTPUT_FACTORS, dose } from "./units";
import { requirePositive, requireNonNegative } from "./validate";

/** Straight acid dosing (no lbs/1000gal option) — the universal dose() divide path. */
export function acidAddition(input: {
  volume: number; volumeUnit: VolumeUnit; rate: number; rateUnit: RateUnitId; outUnit: MassUnit;
}): number {
  requirePositive(input.volume, "Volume");
  requireNonNegative(input.rate, "Acid rate");
  return dose(input);
}

export type DeacidResult = {
  caco3: number; // calcium carbonate
  khco3: number; // potassium bicarbonate
  kbicarbAlt: number; // third variant
  advisory: true;
};

/**
 * Reagent mass for THREE deacidifying agents at once, from the TA drop you want.
 * delta = current_TA/factor − target_TA/factor; reagent = delta × liters × k / massFactor.
 * k = 0.67 (CaCO₃) / 0.673 (KHCO₃) / 0.62 (alt) — the reference's revised trio.
 */
export function deacidification(input: {
  volume: number; volumeUnit: VolumeUnit;
  currentTA: number; currentTAUnit: RateUnitId;
  targetTA: number; targetTAUnit: RateUnitId;
  outUnit: MassUnit;
}): DeacidResult {
  requirePositive(input.volume, "Volume");
  requireNonNegative(input.currentTA, "Current TA");
  requireNonNegative(input.targetTA, "Target TA");
  const liters = input.volume * VOLUME_TO_LITERS[input.volumeUnit];
  const delta =
    input.currentTA / RATE_UNITS[input.currentTAUnit].factor - input.targetTA / RATE_UNITS[input.targetTAUnit].factor;
  const reagent = (k: number) => (delta * (liters * k)) / MASS_OUTPUT_FACTORS[input.outUnit];
  return { caco3: reagent(0.67), khco3: reagent(0.673), kbicarbAlt: reagent(0.62), advisory: true };
}
