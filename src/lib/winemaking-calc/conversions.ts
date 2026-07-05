// Section 1 — unit conversions. Factor-based dimensions (each unit's factor converts TO the
// dimension's base unit): result_in(to) = value × factor[from] / factor[to]. Temperature is
// special-cased (°F/°C affine, not factor-based). Constants are verbatim from
// docs/winebusiness-calculator-formulas.md. Pure — tested in test/winemaking-calc-conversions.test.ts.

import { DomainError, requireFinite, requireOneOf } from "./validate";

export type ConvertibleDimension = "volume" | "mass" | "pressure" | "area" | "distance";

/** factor = how many base units one of this unit equals. */
export const CONVERSION_FACTORS: Record<ConvertibleDimension, Record<string, number>> = {
  // base = liters
  volume: {
    mL: 0.001, L: 1, hL: 100, "m³": 1000,
    "fl oz": 0.0295735296, cup: 0.2365882, pint: 0.473176473, quart: 0.946352946,
    tbsp: 0.0147867648, tsp: 0.00492892159, "in³": 0.016387064, gal: 3.78541178,
  },
  // base = grams
  mass: {
    mg: 0.001, g: 1, kg: 1000, "metric ton": 1_000_000, oz: 28.3495231, lb: 453.59237, ton: 907148.74,
  },
  // base = pascals
  pressure: {
    Pa: 1, atm: 101325, mbar: 100, bar: 100000, psi: 6894.757, "lb/ft²": 47.88026,
    "kg/mm²": 9806650, "kg/cm²": 98066.5, "kg/m²": 9.80665, torr: 133.3224, cmHg: 1333.224,
    "cmH₂O": 98.0665, ftHg: 40636.66, "ftH₂O": 2989.067, inHg: 3386.389, "inH₂O": 249.0889,
    mmHg: 133.3224, "mmH₂O": 9.80665,
  },
  // base = m²
  area: {
    "m²": 1, acre: 4046.85642, hectare: 10000, "ft²": 0.09290304, "in²": 0.00064516,
    "mi²": 2589988.11, "yd²": 0.83612736,
  },
  // base = meters
  distance: {
    m: 1, cm: 0.01, km: 1000, mm: 0.001, micron: 1e-6, in: 0.0254, ft: 0.3048, yd: 0.9144,
    mi: 1609.344, "nautical mi": 1852,
  },
};

export function unitsFor(dimension: ConvertibleDimension): string[] {
  return Object.keys(CONVERSION_FACTORS[dimension]);
}

/** Convert a value within one factor-based dimension. Throws DomainError on unknown units. */
export function convert(dimension: ConvertibleDimension, value: number, from: string, to: string): number {
  requireFinite(value, "value");
  const table = CONVERSION_FACTORS[dimension];
  const units = Object.keys(table);
  requireOneOf(from, units, "from unit");
  requireOneOf(to, units, "to unit");
  return (value * table[from]) / table[to];
}

/** Convert a value to EVERY unit in the dimension at once (the reference "fill all fields" behavior). */
export function convertAll(dimension: ConvertibleDimension, value: number, from: string): Record<string, number> {
  requireFinite(value, "value");
  const table = CONVERSION_FACTORS[dimension];
  const base = value * table[requireOneOf(from, Object.keys(table), "from unit")];
  const out: Record<string, number> = {};
  for (const [unit, factor] of Object.entries(table)) out[unit] = base / factor;
  return out;
}

export type TempUnit = "C" | "F";

/** Temperature is affine, not factor-based: °F = °C×9/5+32, °C = (°F−32)×5/9. */
export function convertTemp(value: number, from: TempUnit, to: TempUnit): number {
  requireFinite(value, "temperature");
  if (from !== "C" && from !== "F") throw new DomainError("from unit must be C or F.");
  if (to !== "C" && to !== "F") throw new DomainError("to unit must be C or F.");
  if (from === to) return value;
  return from === "C" ? value * 9 / 5 + 32 : (value - 32) * 5 / 9;
}
