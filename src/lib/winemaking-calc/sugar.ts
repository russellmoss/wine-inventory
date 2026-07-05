// Section 3 — fermentation & sugar. Verbatim port of the reference doc (constants 261.3 / 145 /
// 259 + the temp-correction quadratic). Deliberately separate from src/lib/ferment/sugar.ts,
// which uses a DIFFERENT cubic Brix→SG for canonical storage. Pure — tested in
// test/winemaking-calc-sugar.test.ts.

import { VOLUME_TO_LITERS, VolumeUnit, RATE_UNITS, RateUnitId, MassUnit, MASS_OUTPUT_FACTORS, dose } from "./units";
import { convertTemp } from "./conversions";
import { requireFinite, requirePositive, requireNonNegative, requireOneOf } from "./validate";

/** Refractometric Brix↔SG constant. */
export const BRIX_SG_CONSTANT = 261.3;

/** Brix → potential alcohol %, using a winemaker-supplied factor (0.55–0.60 typical). */
export function brixToAlcohol(brix: number, factor: number): number {
  requireFinite(brix, "Brix");
  requirePositive(factor, "Conversion factor");
  return brix * factor;
}

/** Brix → specific gravity (261.3 model). */
export function brixToSG(brix: number): number {
  return BRIX_SG_CONSTANT / (BRIX_SG_CONSTANT - brix);
}

/** Sugar g/L from Brix (Brix × SG × 10). */
export function brixToSugarGL(brix: number): number {
  return brix * brixToSG(brix) * 10;
}

export type SugarScales = { brix: number; baume: number; oechsle: number; altScale: number; sugarGL: number };

/** From a specific gravity, all five sugar scales at once. */
export function sgToScales(sg: number): SugarScales {
  requirePositive(sg, "Specific gravity");
  const brix = BRIX_SG_CONSTANT * (1 - 1 / sg);
  return {
    brix,
    baume: 145 - 145 / sg,
    oechsle: 1000 * (sg - 1),
    altScale: 259 - 259 / sg,
    sugarGL: brix * sg * 10,
  };
}

/**
 * Hydrometer temperature correction: corrected = measured + f(T), where
 * f(T) = 3.59e-6·T² + 6.971e-5·T − 1.51687e-3 (T in °F). °C input is converted first.
 */
export function sgTemperatureCorrection(input: { measuredSG: number; temp: number; tempUnit: "C" | "F" }): number {
  requirePositive(input.measuredSG, "Measured SG");
  const tF = input.tempUnit === "C" ? convertTemp(input.temp, "C", "F") : input.temp;
  const f = 3.59e-6 * tF * tF + 6.971e-5 * tF - 1.51687e-3;
  return input.measuredSG + f;
}

/** Yeast / nutrient dosing — the universal dose() helper (handles the lbs/1000gal mode). */
export function yeastNutrientDose(input: {
  volume: number; volumeUnit: VolumeUnit; rate: number; rateUnit: RateUnitId; outUnit: MassUnit;
}): number {
  requirePositive(input.volume, "Volume");
  requireNonNegative(input.rate, "Rate");
  return dose(input);
}

/** Per-product Yeast-Assimilable-Nitrogen contribution factors (from the reference doc). */
export const YAN_PRODUCTS: Record<string, number> = {
  "DAP": 0.2127,
  "Thiazote": 0.208,
  "Nutristart": 0.15,
  "Nutristart Arom": 0.14,
  "Fermaid-A": 0.12,
  "Nutriferm Advance": 0.116,
  "Fermaid-K / Superfood / Nutristart Org.": 0.1,
  "Dynastart": 0.07,
  "Fermaid-O": 0.04,
  "Go-Ferm / Go-Ferm Protect": 0.033,
  "SIY33": 0.032,
  "Fortiferm": 0.03,
  "Nutrient Vit End": 0.028,
};

/**
 * Mass of a nitrogen product to raise YAN by `yanIncrease` (mg/L). Literal port:
 * grams = (liters / src / targetFactor) × yanIncrease. src = product factor.
 */
export function yanDose(input: {
  volume: number; volumeUnit: VolumeUnit; yanIncrease: number; yanUnit: RateUnitId;
  product: string; outUnit: MassUnit;
}): number {
  requirePositive(input.volume, "Volume");
  requireNonNegative(input.yanIncrease, "YAN increase");
  const src = YAN_PRODUCTS[requireOneOf(input.product, Object.keys(YAN_PRODUCTS), "Product")];
  const liters = input.volume * VOLUME_TO_LITERS[input.volumeUnit];
  const grams = (liters / src / RATE_UNITS[input.yanUnit].factor) * input.yanIncrease;
  return grams / MASS_OUTPUT_FACTORS[input.outUnit];
}
