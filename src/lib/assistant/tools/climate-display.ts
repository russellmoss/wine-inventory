// Plan 098 U11 — the PURE display block for query_climate's payload (council SF4, adapted).
//
// The model must never do unit arithmetic in its head (prompt.ts: "NEVER convert units" — the
// #311 lesson), so the tool emits DISPLAY-READY strings for everything the model would speak,
// formatted in the vineyard's RESOLVED unit system (config override → winery prefs → geo, the
// U6 chain — already resolved into ClimateSummary.unitSystem). Raw metric values stay in the
// payload for back-compat; the prompt tells the model to use these strings verbatim.
//
// Pure and DB-free so the imperial-tenant and auto-inherit behavior is pinned by unit tests
// (test/assistant-climate-display.test.ts) — the deterministic arm of the D26/H8 eval gate.

import type { ClimateSummary } from "@/lib/weather/read-core";
import { formatGdd, formatPrecip, formatTemp, type UnitSystem } from "@/lib/units/display";

/** Headline display strings for one vineyard's climate summary. */
export function climateDisplay(s: ClimateSummary): Record<string, string | null> {
  const u = s.unitSystem;
  const prior = s.headline.priorYear;
  return {
    unitSystem: u,
    gddSeasonToDate: formatGdd(s.headline.seasonGddC, u),
    gddVsLastYear: prior ? `${prior.deltaC >= 0 ? "+" : "−"}${formatGdd(Math.abs(prior.deltaC), u)} vs ${prior.seasonYear}` : null,
    growingSeasonTemp: formatTemp(s.headline.gst.gstC, u, 1),
    seasonRainfall: formatPrecip(s.headline.rainfall.totalMm, u),
  };
}

/** Display strings for one forecast day (high/low/rain), in the site's resolved system. */
export function forecastDayDisplay(
  d: { tmaxC: number | null; tminC: number | null; precipMm: number | null },
  u: UnitSystem,
): { high: string; low: string; expectedRain: string } {
  return { high: formatTemp(d.tmaxC, u), low: formatTemp(d.tminC, u), expectedRain: formatPrecip(d.precipMm, u) };
}

/** A single spoken temperature ("28.4 °F"), 1 dp. */
export function tempDisplay(valueC: number | null, u: UnitSystem): string {
  return formatTemp(valueC, u, 1);
}

/** A single rainfall amount ("0.48 in"). */
export function precipDisplay(valueMm: number | null, u: UnitSystem): string {
  return formatPrecip(valueMm, u);
}
