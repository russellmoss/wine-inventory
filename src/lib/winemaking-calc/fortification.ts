// Section 7 — fortification. Pearson's square + the "sweet spot" bench-trial ladder. Verbatim
// port of the reference doc. Pure — tested in test/winemaking-calc-fortification.test.ts.

import { VOLUME_TO_LITERS, VolumeUnit } from "./units";
import { DomainError, requirePositive, requireNonZeroDenominator } from "./validate";

/**
 * Pearson's square: volume of high-proof spirit to raise wine from `actualAlc` to `targetAlc`,
 * given spirit strength `initAlc` (all %). spiritVol = liters × (target − actual)/(init − target).
 * Guards: spirit must be stronger than the target, wine weaker than the target (else no solution).
 */
export function fortificationPearson(input: {
  volume: number; volumeUnit: VolumeUnit; initAlc: number; actualAlc: number; targetAlc: number; outUnit: VolumeUnit;
}): number {
  requirePositive(input.volume, "Volume");
  if (input.initAlc <= input.targetAlc) {
    throw new DomainError("Spirit strength must be greater than the target alcohol.");
  }
  if (input.actualAlc >= input.targetAlc) {
    throw new DomainError("Wine alcohol must be below the target (nothing to raise).");
  }
  const denom = requireNonZeroDenominator(input.initAlc - input.targetAlc, "Spirit and target strength must differ.");
  const liters = input.volume * VOLUME_TO_LITERS[input.volumeUnit];
  return (liters * (input.targetAlc - input.actualAlc) / denom) / VOLUME_TO_LITERS[input.outUnit];
}

export type SweetSpotRow = { alc: number; highComponent: number; lowComponent: number };

/**
 * "Sweet spot" bench-trial ladder. q1 = high-alc %, q2 = low-alc %, q3 = starting blend %,
 * q4 = target %, q5 = batch volume. Steps alc down 0.10%/row for ~29 rows, recomputing the
 * two component volumes so the winemaker can taste across a ladder.
 */
export function sweetSpotLadder(input: {
  highAlc: number; lowAlc: number; startAlc: number; targetAlc: number; batchVolume: number; rows?: number;
}): SweetSpotRow[] {
  requirePositive(input.batchVolume, "Batch volume");
  const span = requireNonZeroDenominator(input.highAlc - input.lowAlc, "High and low alcohol must differ.");
  const rows = input.rows ?? 29;
  const out: SweetSpotRow[] = [];
  for (let i = 0; i < rows; i++) {
    const alc = input.startAlc - i * 0.1;
    const high = input.batchVolume * ((alc - input.lowAlc) / span);
    out.push({ alc: Math.round(alc * 100) / 100, highComponent: high, lowComponent: input.batchVolume - high });
  }
  return out;
}
