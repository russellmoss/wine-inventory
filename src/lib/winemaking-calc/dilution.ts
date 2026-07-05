// Section 4 — chaptalization & water dilution. Verbatim port of the reference doc's
// mass-balance sequence (uses the same 261.3 SG constant). Pure — tested in
// test/winemaking-calc-dilution.test.ts.

import { VOLUME_TO_LITERS, VolumeUnit } from "./units";
import { BRIX_SG_CONSTANT } from "./sugar";
import { DomainError, requirePositive, requireNonZeroDenominator } from "./validate";

/**
 * Sugar to add to raise Brix. Literal port: (liters × (target − current) / (denom − target)) / outFactor.
 * `denom` is the reference/purity term (F3 in the source). LOCKED #6: guard current Brix ≥ 0.
 */
export function chaptalization(input: {
  volume: number; volumeUnit: VolumeUnit; currentBrix: number; targetBrix: number; denom: number; outUnit: VolumeUnit;
}): number {
  requirePositive(input.volume, "Volume");
  if (input.currentBrix < 0) throw new DomainError("Current Brix must be ≥ 0 for chaptalization.");
  const denomMinusTarget = requireNonZeroDenominator(
    input.denom - input.targetBrix,
    "Reference term and target Brix must differ.",
  );
  const liters = input.volume * VOLUME_TO_LITERS[input.volumeUnit];
  return (liters * (input.targetBrix - input.currentBrix) / denomMinusTarget) / VOLUME_TO_LITERS[input.outUnit];
}

/**
 * Water to add to LOWER Brix, mass-balancing sugar before/after. Verbatim port of the
 * tmp4/tmp2/tmp11/tmp10/tmp8 sequence. Returns the water volume in `outUnit`.
 */
export function waterDilution(input: {
  volume: number; volumeUnit: VolumeUnit; currentBrix: number; targetBrix: number; outUnit: VolumeUnit;
}): number {
  requirePositive(input.volume, "Volume");
  if (input.currentBrix < 0) throw new DomainError("Current Brix must be ≥ 0.");
  requireNonZeroDenominator(input.targetBrix, "Target Brix cannot be zero.");
  const sgStart = BRIX_SG_CONSTANT / (BRIX_SG_CONSTANT - input.currentBrix);
  const liters = input.volume * VOLUME_TO_LITERS[input.volumeUnit];
  const tmp4 = liters * sgStart;
  const tmp2 = (input.currentBrix * tmp4) / 100;
  const tmp11 = (tmp2 * 100) / input.targetBrix;
  const tmp10 = tmp4 - tmp2;
  const tmp8 = tmp11 - tmp2;
  return (tmp8 - tmp10) / VOLUME_TO_LITERS[input.outUnit];
}
