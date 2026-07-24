/**
 * Vineyard Intelligence — NDVI numeric policy and SCL masking (brief §5, §15).
 *
 * PURE: no React, no Leaflet, no I/O. Node-testable, survives the worker flip unchanged.
 *
 * THE RADIOMETRIC CONTRACT, corrected. Runbook rule §2.13 says to pin `harmonizeValues` to guard
 * cross-date comparability. Its intent is right; its stated mechanism is wrong, and P0 proved it:
 *
 *   - In REFLECTANCE units, Sentinel Hub applies the BOA_ADD_OFFSET itself, REGARDLESS of the flag.
 *     So the real baseline guard is pinning `units: "REFLECTANCE"`, not the flag.
 *   - `harmonizeValues` only controls whether NEGATIVE reflectance is clamped to zero. Clamping is
 *     actively harmful here: a clamped B04 = 0 makes NDVI = (NIR-0)/(NIR+0) = exactly 1.0, a
 *     fabricated maximum indistinguishable from a real one. We pin it FALSE and handle negatives.
 *
 * Negative surface reflectance is physically real over deep shadow and water. It is data, not error.
 */

/** Sentinel-2 L2A Scene Classification Layer values. */
export const SCL_CLASS = {
  NO_DATA: 0,
  SATURATED_OR_DEFECTIVE: 1,
  DARK_AREA: 2,
  CLOUD_SHADOW: 3,
  VEGETATION: 4,
  BARE_SOIL: 5,
  WATER: 6,
  CLOUD_LOW_OR_UNCLASSIFIED: 7,
  CLOUD_MEDIUM: 8,
  CLOUD_HIGH: 9,
  CIRRUS: 10,
  SNOW_OR_ICE: 11,
} as const;

/**
 * Classes usable for vineyard vigour.
 *
 * Vegetation and bare soil only. Everything else is excluded, and CLOUD_SHADOW (3) is the one worth
 * naming: it is the class most often forgotten and the most damaging, because it depresses NDVI
 * without looking like cloud, so a shadowed block reads as a genuine vigour dip.
 */
const USABLE: ReadonlySet<number> = new Set([SCL_CLASS.VEGETATION, SCL_CLASS.BARE_SOIL]);

/** Marginal: kept only when the caller opts in, and flagged when it is. */
const MARGINAL: ReadonlySet<number> = new Set([SCL_CLASS.CLOUD_LOW_OR_UNCLASSIFIED]);

/**
 * NO_DATA sentinel.
 *
 * A distinct, representable value — never 0 (a legitimate NDVI) and never NaN-by-accident. Brief §5
 * is explicit that explicit no-data is easier to test and explain than silently adding an epsilon
 * everywhere. `Number.NaN` is chosen deliberately: it propagates loudly through arithmetic instead
 * of quietly biasing a mean toward zero, and `isNoData` is the only correct way to test for it.
 */
export const NO_DATA = Number.NaN;

/** PURE: is this a no-data output? Use this rather than `=== NO_DATA`, which is false for NaN. */
export const isNoData = (v: number): boolean => Number.isNaN(v);

/** Denominator floor. Below this the ratio is not meaningfully defined. */
const DENOM_EPSILON = 1e-6;

export type NdviOptions = {
  /** Treat SCL class 7 (low-probability cloud / unclassified) as usable. Default false. */
  readonly allowMarginal?: boolean;
};

/**
 * PURE: NDVI for one pixel, implementing brief §5's policy verbatim.
 *
 *   denominator = nir + red
 *   if red or nir is no-data / quality-masked, or |denominator| < epsilon  -> no-data
 *   else                                          clamp((nir - red) / denominator, -1, 1)
 *
 * Note there is no epsilon added to the denominator. Explicit no-data, not a silent nudge.
 */
export function ndviValue(red: number, nir: number): number {
  if (!Number.isFinite(red) || !Number.isFinite(nir)) return NO_DATA;
  const denom = nir + red;
  if (Math.abs(denom) < DENOM_EPSILON) return NO_DATA;
  const v = (nir - red) / denom;
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/** PURE: is a pixel usable given its SCL class? */
export function isUsableScl(scl: number, opts: NdviOptions = {}): boolean {
  if (USABLE.has(scl)) return true;
  return opts.allowMarginal === true && MARGINAL.has(scl);
}

export type NdviRaster = {
  readonly width: number;
  readonly height: number;
  /** NDVI per pixel, `NaN` where no-data. Use `isNoData`. */
  readonly values: Float64Array;
  /** How many pixels carry a usable value. */
  readonly validCount: number;
  /** Pixels excluded because of their SCL class (not because of band arithmetic). */
  readonly maskedCount: number;
  /**
   * Pixels whose NDVI came out at exactly 1.0. A SENTINEL, never a measurement.
   *
   * TWO different inputs land here, and both mean "do not read this as vigour":
   *   1. red == 0 — what a clamped band produces if something upstream ignored
   *      `harmonizeValues: false`. Fabricated, and indistinguishable from a real maximum.
   *   2. red < 0 — genuine negative reflectance over deep shadow or water. The raw ratio exceeds 1
   *      (e.g. red −0.01, NIR 0.40 gives 0.41/0.39 = 1.05) and brief §5's clamp pulls it to 1.0.
   *
   * Case 2 is real data we deliberately preserve rather than clamp away at the source, but its NDVI
   * is still not a vigour reading. Surfacing the count lets a caller distinguish "this block is
   * saturated" from "this block is in shadow" instead of silently averaging both into a mean.
   */
  readonly saturatedCount: number;
};

/**
 * PURE: NDVI over a whole scene, with SCL masking applied.
 *
 * Bands are REFLECTANCE, already offset-corrected by the provider. Nothing here rescales or shifts
 * them: doing so is precisely the mistake the baseline-04.00 trap punishes.
 */
export function computeNdvi(
  red: ArrayLike<number>,
  nir: ArrayLike<number>,
  scl: ArrayLike<number>,
  width: number,
  height: number,
  opts: NdviOptions = {},
): NdviRaster {
  const n = width * height;
  const values = new Float64Array(n);
  let validCount = 0;
  let maskedCount = 0;
  let saturatedCount = 0;

  for (let i = 0; i < n; i++) {
    if (!isUsableScl(scl[i], opts)) {
      values[i] = NO_DATA;
      maskedCount++;
      continue;
    }
    const v = ndviValue(red[i], nir[i]);
    values[i] = v;
    if (isNoData(v)) continue;
    validCount++;
    if (v === 1) saturatedCount++;
  }

  return { width, height, values, validCount, maskedCount, saturatedCount };
}

/**
 * PURE: what the same reflectance would read if the baseline-04.00 offset had NOT been applied.
 *
 * Exists so the failure can be pinned by a test rather than described in a comment. Post-2022 L2A
 * carries BOA_ADD_OFFSET = -1000 DN (= -0.1 reflectance at QUANTIFICATION_VALUE 10000); reading DN
 * without applying it inflates BOTH bands by 0.1. The denominator inflates faster, so NDVI is
 * compressed toward zero.
 *
 * The error is LARGEST at high vigour, which is exactly where this product earns its keep, and it is
 * NOT constant — so it cannot be calibrated out after the fact. It is a step discontinuity at
 * 25 Jan 2022 that would read as a fabricated collapse in vineyard vigour.
 */
export function unharmonizedNdvi(red: number, nir: number, offset = 0.1): number {
  return ndviValue(red + offset, nir + offset);
}
