// Plan 098 — THE display-unit authority for the whole app. Pure: no Prisma, no I/O, client-safe.
//
// Canonical storage is metric everywhere (°C, mm, L, kg, metres); this module owns the display
// edge for every dimension. It promotes the single-owner rule that `weather/units-core.ts`
// declared for weather (that file now delegates here): no other file may hold an inline `× 1.8`,
// `/ 25.4`, `× 3.785`, or any other display conversion. Deliberately named `display.ts`, NOT
// `display-core.ts` — it is a formatter library, not a domain core, and must not trip the
// verify:ai-native core→tool guard.
//
// Preference resolution contract (council DQ3), the ONE rule everything uses:
//     dimensionUnit = explicit override ?? masterMapping[dimension] ?? metric default
// Dimensions with no override column (wind speed, shoot length) always take the master mapping.
// `resolveUnitPrefs` is the ONLY reader that touches raw stored strings; everything downstream
// sees the precise unions. Read-side parsing is PERMISSIVE (an unknown stored value degrades to
// the fallback — a bad row must not break a render); write-side validation (settings/actions)
// uses the strict `parse*` helpers and refuses junk.
//
// Legacy lowercase unions ("imperial" | "metric" in vineyard/harvest) are input contracts with
// many construction sites — they are BRIDGED at the boundary here (council C3), never renamed.

import { C_TO_F_GDD } from "@/lib/weather/normals-core";
import { LITERS_PER_US_GALLON } from "@/lib/compliance/gallons";
import {
  FT_PER_M,
  formatArea as formatAreaLegacy,
  formatSpacing as formatSpacingLegacy,
  haToAcres,
  type Unit as LegacyUnit,
} from "@/lib/vineyard/units";
import { KG_PER_LB, formatWeightFromKg } from "@/lib/harvest/units";

// ── Types ────────────────────────────────────────────────────────────────────────────────

export type UnitSystem = "METRIC" | "IMPERIAL";
export type TemperatureUnit = "C" | "F";
export type PrecipitationUnit = "MM" | "IN";
export type VolumeUnit = "L" | "HL" | "GAL";
export type AreaUnit = "HA" | "ACRES";
export type LengthUnit = "M" | "FT";
export type WeightUnit = "KG" | "LB";

/** Fully-resolved display preferences — every dimension non-null. Only `resolveUnitPrefs` builds one. */
export type UnitPrefs = {
  /**
   * The RAW stored master — null when the tenant never configured one. Distinct from `system`
   * (which defaults to METRIC) because some chains treat "unconfigured" differently from "chose
   * metric": the weather chain falls through an unconfigured tenant to the geo default.
   */
  configuredSystem: UnitSystem | null;
  system: UnitSystem;
  temperature: TemperatureUnit;
  precipitation: PrecipitationUnit;
  volume: VolumeUnit;
  area: AreaUnit;
  length: LengthUnit;
  weight: WeightUnit;
};

/** The raw AppSettings columns (or any partial thereof). Strings arrive unvalidated. */
export type UnitPrefsRow = {
  unitSystem?: string | null;
  unitTemperature?: string | null;
  unitPrecipitation?: string | null;
  unitVolume?: string | null;
  unitArea?: string | null;
  unitLength?: string | null;
  unitWeight?: string | null;
};

const METRIC_MAPPING: Omit<UnitPrefs, "system" | "configuredSystem"> = {
  temperature: "C",
  precipitation: "MM",
  volume: "L",
  area: "HA",
  length: "M",
  weight: "KG",
};

const IMPERIAL_MAPPING: Omit<UnitPrefs, "system" | "configuredSystem"> = {
  temperature: "F",
  precipitation: "IN",
  volume: "GAL",
  area: "ACRES",
  length: "FT",
  weight: "LB",
};

export const DEFAULT_METRIC_PREFS: UnitPrefs = { configuredSystem: null, system: "METRIC", ...METRIC_MAPPING };
export const DEFAULT_IMPERIAL_PREFS: UnitPrefs = { configuredSystem: "IMPERIAL", system: "IMPERIAL", ...IMPERIAL_MAPPING };

// ── Strict parsers (write-side validation; read side uses them permissively via ??) ──────

function parseIn<T extends string>(allowed: readonly T[]): (v: string | null | undefined) => T | null {
  return (v) => (allowed.includes((v ?? "") as T) ? (v as T) : null);
}

export const parseUnitSystem = parseIn<UnitSystem>(["METRIC", "IMPERIAL"]);
export const parseTemperatureUnit = parseIn<TemperatureUnit>(["C", "F"]);
export const parsePrecipitationUnit = parseIn<PrecipitationUnit>(["MM", "IN"]);
export const parseVolumeUnit = parseIn<VolumeUnit>(["L", "HL", "GAL"]);
export const parseAreaUnit = parseIn<AreaUnit>(["HA", "ACRES"]);
export const parseLengthUnit = parseIn<LengthUnit>(["M", "FT"]);
export const parseWeightUnit = parseIn<WeightUnit>(["KG", "LB"]);

/**
 * The ONE resolver. NULL row / NULL master / NULL dimension all degrade exactly to today's
 * behavior (metric). An unknown stored string reads as "not set" — never an error.
 */
export function resolveUnitPrefs(row: UnitPrefsRow | null | undefined): UnitPrefs {
  const configuredSystem = parseUnitSystem(row?.unitSystem);
  const system = configuredSystem ?? "METRIC";
  const mapping = system === "IMPERIAL" ? IMPERIAL_MAPPING : METRIC_MAPPING;
  return {
    configuredSystem,
    system,
    temperature: parseTemperatureUnit(row?.unitTemperature) ?? mapping.temperature,
    precipitation: parsePrecipitationUnit(row?.unitPrecipitation) ?? mapping.precipitation,
    volume: parseVolumeUnit(row?.unitVolume) ?? mapping.volume,
    area: parseAreaUnit(row?.unitArea) ?? mapping.area,
    length: parseLengthUnit(row?.unitLength) ?? mapping.length,
    weight: parseWeightUnit(row?.unitWeight) ?? mapping.weight,
  };
}

// ── Legacy bridges (council C3: bridge at the seam, never rename the input contracts) ────

/** Coerce a stored string to the canonical union (unknown/legacy values read as METRIC — the storage system). */
export function normalizeUnitSystem(v: string | null | undefined): UnitSystem {
  return v === "IMPERIAL" ? "IMPERIAL" : "METRIC";
}

/** The vineyard/harvest lowercase union → canonical. */
export function legacyUnitToSystem(u: LegacyUnit): UnitSystem {
  return u === "imperial" ? "IMPERIAL" : "METRIC";
}

/** Canonical → the vineyard/harvest lowercase union. */
export function systemToLegacyUnit(s: UnitSystem): LegacyUnit {
  return s === "IMPERIAL" ? "imperial" : "metric";
}

/** Strict parse of a stored per-vineyard `defaultUnit` ("imperial" | "metric"); junk → null. */
export const parseLegacyUnit = parseIn<LegacyUnit>(["imperial", "metric"]);

/**
 * Vineyard geometry resolution (plan 098 U7): the per-vineyard `defaultUnit` override wins for the
 * whole geometry family; a NULL override follows the tenant's length dimension (spacing/elevation)
 * — area has its own resolver below because ha/acres is a separate override dimension.
 */
export function resolveSpacingUnit(override: string | null | undefined, prefs: UnitPrefs): LegacyUnit {
  const o = parseLegacyUnit(override);
  if (o) return o;
  return prefs.length === "FT" ? "imperial" : "metric";
}

export function resolveAreaUnit(override: string | null | undefined, prefs: UnitPrefs): LegacyUnit {
  const o = parseLegacyUnit(override);
  if (o) return o;
  return prefs.area === "ACRES" ? "imperial" : "metric";
}

// ── Raw converters (chart scales / numeric comparisons; formatting is below) ─────────────

export const cToF = (c: number): number => c * (9 / 5) + 32;
export const fToC = (f: number): number => (f - 32) * (5 / 9);
export const mmToInches = (mm: number): number => mm / 25.4;
export const kphToMph = (kph: number): number => kph / 1.609344;
/** GDD are DEGREE-DAYS: a difference, not a point temperature — scale by 1.8, never offset by 32. */
export const gddCToF = (gddC: number): number => gddC * C_TO_F_GDD;
export const gddFToC = (gddF: number): number => gddF / C_TO_F_GDD;

const IN_PER_CM = 1 / 2.54;
export function cmToInches(cm: number): number {
  return cm * IN_PER_CM;
}

const KM_PER_MILE = 1.609344;
const G_PER_OZ = KG_PER_LB * 1000 / 16; // 28.349523125 — derived, not a new constant
const LITERS_PER_HL = 100;

/** Canonical litres → the display unit's numeric value (for input hydration / chart axes). */
export function litersToDisplay(liters: number, unit: VolumeUnit): number {
  if (unit === "GAL") return liters / LITERS_PER_US_GALLON;
  if (unit === "HL") return liters / LITERS_PER_HL;
  return liters;
}

/** A value typed in the display unit → canonical litres (for input save paths). */
export function displayToLiters(value: number, unit: VolumeUnit): number {
  if (unit === "GAL") return value * LITERS_PER_US_GALLON;
  if (unit === "HL") return value * LITERS_PER_HL;
  return value;
}

// ── Formatters ───────────────────────────────────────────────────────────────────────────
// Every formatter returns the number WITH its unit (NBSP-joined) so a call site can't show a
// bare number without saying which system it's in. Null/non-finite → "—".

const NBSP = " ";

function fmt(n: number, digits: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A point temperature: "−2.0 °C" / "28 °F". Null → "—". */
export function formatTemp(valueC: number | null, u: UnitSystem, digits = 0): string {
  if (valueC === null || !Number.isFinite(valueC)) return "—";
  return u === "IMPERIAL" ? `${fmt(cToF(valueC), digits)}${NBSP}°F` : `${fmt(valueC, digits)}${NBSP}°C`;
}

/** Precipitation: "12.3 mm" / "0.48 in". Null → "—". */
export function formatPrecip(valueMm: number | null, u: UnitSystem): string {
  if (valueMm === null || !Number.isFinite(valueMm)) return "—";
  return u === "IMPERIAL" ? `${fmt(mmToInches(valueMm), 2)}${NBSP}in` : `${fmt(valueMm, 1)}${NBSP}mm`;
}

/** Wind speed: "24 km/h" / "15 mph". No override column — always follows the master system. */
export function formatSpeed(valueKph: number | null, u: UnitSystem): string {
  if (valueKph === null || !Number.isFinite(valueKph)) return "—";
  return u === "IMPERIAL" ? `${fmt(kphToMph(valueKph), 0)}${NBSP}mph` : `${fmt(valueKph, 0)}${NBSP}km/h`;
}

/** Growing degree days: "1,234 °F-GDD" / "686 °C-GDD". Null → "—". */
export function formatGdd(gddC: number | null, u: UnitSystem): string {
  if (gddC === null || !Number.isFinite(gddC)) return "—";
  return u === "IMPERIAL" ? `${fmt(Math.round(gddCToF(gddC)), 0)}${NBSP}°F-GDD` : `${fmt(Math.round(gddC), 0)}${NBSP}°C-GDD`;
}

export function volumeUnitLabel(unit: VolumeUnit): string {
  return unit === "GAL" ? "gal" : unit === "HL" ? "hL" : "L";
}

/**
 * A tank/lot volume from canonical litres: "1,250 L" / "12.5 hL" / "330 gal".
 * Rounding: whole (grouped) at ≥100 in the display unit, 1 decimal below, 2 below 10 —
 * a 225 L barrique is "2.25 hL", not "2.3 hL".
 */
export function formatVolume(liters: number | null | undefined, unit: VolumeUnit): string {
  if (liters == null || !Number.isFinite(liters)) return "—";
  const v = litersToDisplay(liters, unit);
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  // Trim noise decimals ("2.0 hL" → "2 hL") without losing real ones ("2.25 hL").
  const rounded = Number(v.toFixed(digits));
  const shown = Number.isInteger(rounded) ? fmt(rounded, 0) : fmt(rounded, digits);
  return `${shown}${NBSP}${volumeUnitLabel(unit)}`;
}

/**
 * A money rate per volume, converted for display only: cost/L × 3.785… = cost/gal, × 100 = cost/hL.
 * Reconciliation and every stored figure stay canonical $/L — this string is the ONLY place the
 * converted rate exists. Up to 3 fraction digits (min 2), matching the cost surfaces.
 */
export function formatCostPerVolume(costPerLiter: number | null | undefined, unit: VolumeUnit, symbol: string): string {
  if (costPerLiter == null || !Number.isFinite(costPerLiter)) return "—";
  const rate = costPerLiter * displayToLiters(1, unit);
  const shown = rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  return `${symbol}${shown}/${volumeUnitLabel(unit)}`;
}

/** Elevation / lengths in metres: "120 m" / "394 ft". Null → "—". */
export function formatLength(valueM: number | null | undefined, unit: LengthUnit): string {
  if (valueM == null || !Number.isFinite(valueM)) return "—";
  return unit === "FT" ? `${fmt(Math.round(valueM * FT_PER_M), 0)}${NBSP}ft` : `${fmt(Math.round(valueM), 0)}${NBSP}m`;
}

/** Distances in km (station distance): "2.4 km" / "1.5 mi". Null → "—". */
export function formatDistance(valueKm: number | null | undefined, unit: LengthUnit): string {
  if (valueKm == null || !Number.isFinite(valueKm)) return "—";
  return unit === "FT" ? `${fmt(valueKm / KM_PER_MILE, 1)}${NBSP}mi` : `${fmt(valueKm, 1)}${NBSP}km`;
}

/** An area from canonical hectares: "1.25 ha" / "3.09 acres". Null → "—". */
export function formatAreaHa(ha: number | null | undefined, unit: AreaUnit): string {
  if (ha == null || !Number.isFinite(ha)) return "—";
  return unit === "ACRES" ? `${haToAcres(ha).toFixed(2)}${NBSP}acres` : `${ha.toFixed(2)}${NBSP}ha`;
}

/** Canonical-metric spacing for display — bridges to the vineyard geometry formatter. */
export function formatSpacingM(valueM: number | null | undefined, unit: LengthUnit): string {
  return formatSpacingLegacy(valueM, unit === "FT" ? "imperial" : "metric");
}

/** An already-converted area value in the legacy geometry unit — re-exported bridge. */
export const formatAreaLegacyUnit = formatAreaLegacy;

/** A fruit weight from canonical kg with t / short-ton rollup — bridges to the harvest formatter. */
export function formatWeightKg(kg: number | null | undefined, unit: WeightUnit): string {
  return formatWeightFromKg(kg, unit === "LB" ? "imperial" : "metric");
}

/**
 * The dosing TOTAL-TO-ADD readout (plan 098 U10): the physical amount a cellar hand weighs out,
 * from canonical grams. Metric rolls g → kg at 1000; imperial rolls oz → lb at 1 lb. The dose
 * RATE (mg/L, g/hL) is untouchable — this formats only the computed total.
 */
export function formatWeightToAdd(grams: number | null | undefined, unit: WeightUnit): string {
  if (grams == null || !Number.isFinite(grams)) return "—";
  if (unit === "LB") {
    const lb = grams / (KG_PER_LB * 1000);
    if (lb < 1) return `${fmt(grams / G_PER_OZ, 1)}${NBSP}oz`;
    return `${fmt(lb, 2)}${NBSP}lb`;
  }
  if (grams >= 1000) return `${fmt(grams / 1000, 2)}${NBSP}kg`;
  return `${fmt(Math.round(grams), 0)}${NBSP}g`;
}

// ── Shoot length (folded in from phenology/units — the documented deviation, now resolved) ──

/**
 * One decimal, with a trailing ".0" stripped. Deliberately NOT a `< 10 ? 1 : 0` decimal rule:
 * 25.4 cm converts to 9.999999999999998 inches, so a threshold on the converted value flips on
 * floating-point noise and renders "10.0 in" for exactly ten inches.
 */
function trim1(v: number): string {
  return v.toFixed(1).replace(/\.0$/, "");
}

/** A shoot length for display. No override column — follows the master system. */
export function formatShootLength(cm: number | null, unitSystem: UnitSystem): string {
  if (cm === null) return "—";
  return unitSystem === "IMPERIAL" ? `${trim1(cmToInches(cm))} in` : `${trim1(cm)} cm`;
}

/** A shoot-length RANGE — bands are ranges, never points (S4 council C8); never collapse to an average. */
export function formatShootLengthRange(minCm: number, maxCm: number, unitSystem: UnitSystem): string {
  const unit = unitSystem === "IMPERIAL" ? "in" : "cm";
  const lo = unitSystem === "IMPERIAL" ? cmToInches(minCm) : minCm;
  const hi = unitSystem === "IMPERIAL" ? cmToInches(maxCm) : maxCm;
  return `${trim1(lo)}–${trim1(hi)} ${unit}`;
}

// ── Prose (assistant system prompt) ──────────────────────────────────────────────────────

const UNIT_WORDS: Record<string, string> = {
  C: "°C",
  F: "°F",
  MM: "millimetres",
  IN: "inches",
  L: "litres",
  HL: "hectolitres",
  GAL: "US gallons",
  HA: "hectares",
  ACRES: "acres",
  M: "metres",
  FT: "feet",
  KG: "kilograms and tonnes",
  LB: "pounds and short tons",
};

/** One human sentence describing the tenant's display units, for the assistant system prompt. */
export function unitPrefsSentence(prefs: UnitPrefs): string {
  return (
    `temperatures in ${UNIT_WORDS[prefs.temperature]}, rainfall in ${UNIT_WORDS[prefs.precipitation]}, ` +
    `volumes in ${UNIT_WORDS[prefs.volume]}, areas in ${UNIT_WORDS[prefs.area]}, ` +
    `lengths in ${UNIT_WORDS[prefs.length]}, fruit weights in ${UNIT_WORDS[prefs.weight]}`
  );
}
