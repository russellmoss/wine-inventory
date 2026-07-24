/**
 * P0 Unit 4 — deterministic raster fixtures.
 *
 * A small synthetic Red/NIR/SCL stack on the same 10 m grid as `plantings.ts`, with NDVI values that
 * are exact in decimal so the tests assert arithmetic rather than recorded output.
 *
 * Reflectance is carried as REFLECTANCE, not DN. That mirrors the real request contract: in
 * REFLECTANCE units Sentinel Hub applies the BOA_ADD_OFFSET itself regardless of `harmonizeValues`,
 * and we pin `harmonizeValues: false` so negative reflectance arrives intact instead of being clamped
 * to zero (a clamped B04 = 0 would drive NDVI to a fabricated exactly-1.0). Hence the deliberate
 * negative-reflectance pixel below.
 */

/** Sentinel-2 L2A Scene Classification values used by these fixtures. */
export const SCL = {
  NO_DATA: 0,
  SATURATED: 1,
  DARK_AREA: 2,
  CLOUD_SHADOW: 3,
  VEGETATION: 4,
  BARE_SOIL: 5,
  WATER: 6,
  CLOUD_LOW: 7,
  CLOUD_MEDIUM: 8,
  CLOUD_HIGH: 9,
  CIRRUS: 10,
  SNOW: 11,
} as const;

export type RasterStack = {
  readonly width: number;
  readonly height: number;
  readonly red: Float32Array;
  readonly nir: Float32Array;
  readonly scl: Uint8Array;
};

/**
 * Reflectance pairs chosen so NDVI lands on exact decimals:
 *   vigorous : (0.45 - 0.05) / 0.50 = 0.80
 *   moderate : (0.30 - 0.20) / 0.50 = 0.20
 *   soil     : (0.25 - 0.25) / 0.50 = 0.00
 */
export const NDVI_SAMPLES = {
  vigorous: { red: 0.05, nir: 0.45, ndvi: 0.8 },
  moderate: { red: 0.2, nir: 0.3, ndvi: 0.2 },
  soil: { red: 0.25, nir: 0.25, ndvi: 0.0 },
} as const;

const W = 20;
const H = 20;

/**
 * The standard fixture scene.
 *
 * Layout by row, so a test can reason about a whole row at a time:
 *   rows  0-9  : vigorous canopy (NDVI 0.80)
 *   rows 10-14 : moderate        (NDVI 0.20)
 *   rows 15-17 : bare soil       (NDVI 0.00)
 *   row  18    : cloud + shadow + cirrus, values present but must be MASKED OUT
 *   row  19    : no-data
 * Column 0 of row 0 additionally carries NEGATIVE red reflectance, which is physically real over
 * deep shadow and must survive rather than be clamped.
 */
export function makeFixtureScene(): RasterStack {
  const red = new Float32Array(W * H);
  const nir = new Float32Array(W * H);
  const scl = new Uint8Array(W * H);

  const set = (i: number, r: number, n: number, c: number) => {
    red[i] = r;
    nir[i] = n;
    scl[i] = c;
  };

  for (let row = 0; row < H; row++) {
    for (let col = 0; col < W; col++) {
      const i = row * W + col;
      if (row <= 9) set(i, NDVI_SAMPLES.vigorous.red, NDVI_SAMPLES.vigorous.nir, SCL.VEGETATION);
      else if (row <= 14) set(i, NDVI_SAMPLES.moderate.red, NDVI_SAMPLES.moderate.nir, SCL.VEGETATION);
      else if (row <= 17) set(i, NDVI_SAMPLES.soil.red, NDVI_SAMPLES.soil.nir, SCL.BARE_SOIL);
      else if (row === 18) {
        // values are deliberately plausible; only the SCL class says they are unusable
        const cls = col % 3 === 0 ? SCL.CLOUD_HIGH : col % 3 === 1 ? SCL.CLOUD_SHADOW : SCL.CIRRUS;
        set(i, 0.4, 0.42, cls);
      } else set(i, 0, 0, SCL.NO_DATA);
    }
  }

  // deep shadow: negative surface reflectance is real and must not be clamped to zero
  set(0, -0.01, 0.4, SCL.VEGETATION);

  return { width: W, height: H, red, nir, scl };
}

/** A pixel whose NDVI denominator is zero — must yield no-data, never Infinity or NaN. */
export const ZERO_DENOMINATOR = { red: 0, nir: 0 } as const;

/**
 * The baseline-04.00 trap, as data.
 *
 * Post-2022 L2A carries BOA_ADD_OFFSET = -1000 DN (= -0.1 reflectance at QUANTIFICATION_VALUE
 * 10000). Reading DN without applying it inflates BOTH bands by 0.1; the denominator inflates faster,
 * so NDVI is compressed toward zero. The error is LARGEST at high vigour — exactly where this product
 * earns its keep — and it is NOT a constant, so it cannot be calibrated out after the fact.
 *
 * `unharmonized` values below are computed from (r + 0.1, n + 0.1), not copied from a source.
 */
export const BASELINE_TRAP = [
  { label: "vigorous vine", red: 0.03, nir: 0.45, trueNdvi: 0.875, unharmonizedNdvi: (0.55 - 0.13) / (0.55 + 0.13) },
  { label: "mid canopy", red: 0.05, nir: 0.35, trueNdvi: 0.75, unharmonizedNdvi: (0.45 - 0.15) / (0.45 + 0.15) },
  { label: "bare soil", red: 0.2, nir: 0.3, trueNdvi: 0.2, unharmonizedNdvi: (0.4 - 0.3) / (0.4 + 0.3) },
] as const;

/** PURE helper: index into a row-major raster. */
export const at = (r: RasterStack, col: number, row: number): number => row * r.width + col;
