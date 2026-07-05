// Winemaking-calculator engine — shared unit tables + dosing helper.
//
// A faithful port of the winebusiness.com calculator constants (see
// docs/winebusiness-calculator-formulas.md). This engine is SELF-CONTAINED and
// deliberately NOT unified with src/lib/ferment/sugar.ts or src/lib/blend/* — those
// use different approximations for canonical storage; this matches the reference set.
//
// No prisma, no React, no server-only imports — pure, unit-tested in
// test/winemaking-calc-units.test.ts.
//
// LOCKED review revision #1: the reference code branches on `if (ratec === 0.12)` to
// detect "lbs/1000 gal" (a float used as a mode flag). That is unsafe. We model rate
// units as { factor, mode } and branch on `mode` — never on the raw factor value.

/** Bump on ANY formula/constant change. Stamped into every CalculationLog row (PR2) so a
 * shipped-then-fixed formula bug is provable, not mistaken for user error. */
export const CALC_ENGINE_VERSION = "1.0.0";

// ── Volume → liters (multiply an input volume by this to get liters) ──
export const VOLUME_UNITS = ["L", "GAL_US", "HL", "GAL_UK"] as const;
export type VolumeUnit = (typeof VOLUME_UNITS)[number];

export const VOLUME_TO_LITERS: Record<VolumeUnit, number> = {
  L: 1,
  GAL_US: 3.7854,
  HL: 100,
  GAL_UK: 4.546,
};

export const VOLUME_UNIT_LABEL: Record<VolumeUnit, string> = {
  L: "liters",
  GAL_US: "gallons (US)",
  HL: "hL",
  GAL_UK: "gallons (UK)",
};

// ── Rate / concentration units ──
// mode "divide": grams = liters × rate / factor (the normal path; factor converts to g/L).
// mode "multiply": grams = liters × rate × factor (the lbs/1000gal path; factor 0.12).
export type RateMode = "divide" | "multiply";
export type RateUnitId = "g_L" | "g_hL" | "mg_L" | "ppm" | "g_100ml" | "lbs_1000gal";

export type RateUnit = { id: RateUnitId; label: string; factor: number; mode: RateMode };

export const RATE_UNITS: Record<RateUnitId, RateUnit> = {
  g_L: { id: "g_L", label: "g/L", factor: 1, mode: "divide" },
  g_hL: { id: "g_hL", label: "g/hL", factor: 100, mode: "divide" },
  mg_L: { id: "mg_L", label: "mg/L", factor: 1000, mode: "divide" },
  ppm: { id: "ppm", label: "ppm", factor: 1000, mode: "divide" },
  g_100ml: { id: "g_100ml", label: "g/100mL", factor: 0.1, mode: "divide" },
  lbs_1000gal: { id: "lbs_1000gal", label: "lbs/1000 gal", factor: 0.12, mode: "multiply" },
};

// ── Mass output (divide grams by this to get the chosen unit) ──
export const MASS_UNITS = ["g", "kg", "oz", "lb"] as const;
export type MassUnit = (typeof MASS_UNITS)[number];

export const MASS_OUTPUT_FACTORS: Record<MassUnit, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 454,
};

export const MASS_UNIT_LABEL: Record<MassUnit, string> = {
  g: "grams",
  kg: "kg",
  oz: "oz",
  lb: "lbs",
};

// ── Liquid-volume output (for solution dosing; divide mL by this to get the chosen unit) ──
export const LIQUID_UNITS = ["mL", "L", "GAL_US", "GAL_UK"] as const;
export type LiquidUnit = (typeof LIQUID_UNITS)[number];

export const LIQUID_OUTPUT_FACTORS: Record<LiquidUnit, number> = {
  mL: 1,
  L: 1000,
  GAL_US: 3785.4,
  GAL_UK: 4546,
};

export const LIQUID_UNIT_LABEL: Record<LiquidUnit, string> = {
  mL: "mL",
  L: "liters",
  GAL_US: "gallons (US)",
  GAL_UK: "gallons (UK)",
};

/** Round to `dp` decimal places (display math, not ledger Decimal). */
export function round(n: number, dp = 4): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * The universal dosing helper used by yeast / nutrient / fining / oak / acid.
 * Converts the wine volume to liters, applies the rate in its unit's mode, and returns
 * the additive mass in `outUnit`. Branches on the rate unit's `mode`, never on 0.12.
 */
export function dose(input: {
  volume: number;
  volumeUnit: VolumeUnit;
  rate: number;
  rateUnit: RateUnitId;
  outUnit: MassUnit;
}): number {
  const liters = input.volume * VOLUME_TO_LITERS[input.volumeUnit];
  const ru = RATE_UNITS[input.rateUnit];
  const grams = ru.mode === "multiply" ? liters * input.rate * ru.factor : (liters * input.rate) / ru.factor;
  return grams / MASS_OUTPUT_FACTORS[input.outUnit];
}
