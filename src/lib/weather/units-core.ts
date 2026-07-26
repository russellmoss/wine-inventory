// Plan 096 Phase 0 Unit 3 — the ONE unit-conversion surface for everything the grower sees in the
// weather section. Storage is metric everywhere (°C / mm / km/h — audit §5.2); this module owns the
// display edge. No other file may hold an inline `× 1.8`, `/ 25.4`, or `× 9/5` — the audit found the
// assistant carrying a hardcoded 1.8 duplicate of C_TO_F_GDD, which is exactly the drift this kills.
// `unitSystem` is the per-vineyard config column ("METRIC" | "IMPERIAL", string union like
// coverageState); helpers take the metric value + the system and return a formatted string with its
// unit, so a call site can't accidentally show a number without saying which system it's in.

import { C_TO_F_GDD } from "./normals-core";

export type UnitSystem = "METRIC" | "IMPERIAL";

/** Coerce a stored string to the union (unknown/legacy values read as METRIC — the storage system). */
export function normalizeUnitSystem(v: string | null | undefined): UnitSystem {
  return v === "IMPERIAL" ? "IMPERIAL" : "METRIC";
}

// ── Raw converters (for chart scales / numeric comparisons — display formatting is below) ──
export const cToF = (c: number): number => c * (9 / 5) + 32;
export const fToC = (f: number): number => (f - 32) * (5 / 9);
export const mmToInches = (mm: number): number => mm / 25.4;
export const kphToMph = (kph: number): number => kph / 1.609344;
/** GDD are DEGREE-DAYS: a difference, not a point temperature — scale by 1.8, never offset by 32. */
export const gddCToF = (gddC: number): number => gddC * C_TO_F_GDD;
export const gddFToC = (gddF: number): number => gddF / C_TO_F_GDD;

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

/** Wind speed: "24 km/h" / "15 mph". Null → "—". */
export function formatSpeed(valueKph: number | null, u: UnitSystem): string {
  if (valueKph === null || !Number.isFinite(valueKph)) return "—";
  return u === "IMPERIAL" ? `${fmt(kphToMph(valueKph), 0)}${NBSP}mph` : `${fmt(valueKph, 0)}${NBSP}km/h`;
}

/** Growing degree days: "1,234 °F-GDD" / "686 °C-GDD". Null → "—". */
export function formatGdd(gddC: number | null, u: UnitSystem): string {
  if (gddC === null || !Number.isFinite(gddC)) return "—";
  return u === "IMPERIAL" ? `${fmt(Math.round(gddCToF(gddC)), 0)}${NBSP}°F-GDD` : `${fmt(Math.round(gddC), 0)}${NBSP}°C-GDD`;
}
