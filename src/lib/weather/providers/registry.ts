// VI-P8 — the ClimateProvider registry. Adding a network (CIMIS/AgriMet/NEWA later) is a plug-in here, not a
// rewrite. `providersForLocation` returns the daily-series providers that cover a point, best tier first.

import { gridmetProvider } from "./gridmet";
import { daymetProvider } from "./daymet";
import { nasaPowerProvider } from "./nasa-power";
import { rccAcisProvider } from "./rcc-acis";
import { noaaCdoProvider } from "./noaa-cdo";
import type { ClimateProvider, CoverageState } from "./types";

/** All daily-series providers (USGS EPQS is elevation-only, not here). */
export const ALL_PROVIDERS: ClimateProvider[] = [
  gridmetProvider,
  rccAcisProvider,
  noaaCdoProvider,
  daymetProvider,
  nasaPowerProvider,
];

const TIER_RANK: Record<CoverageState, number> = { US_HIGH_RES: 0, GLOBAL_COARSE: 1, UNAVAILABLE: 2 };

/**
 * Providers that cover the point, best tier first. Excludes UNAVAILABLE (incl. CDO when its token is unset).
 * Defaults to `live` providers only — `history` providers (Daymet, NOAA CDO) lag too far to drive an
 * in-season window and are opt-in via `includeHistory`.
 */
export function providersForLocation(
  lat: number,
  lon: number,
  opts: { includeHistory?: boolean } = {},
): ClimateProvider[] {
  return ALL_PROVIDERS.filter(
    (p) => p.coverageFor(lat, lon) !== "UNAVAILABLE" && (opts.includeHistory || p.role === "live"),
  ).sort((a, b) => TIER_RANK[a.coverageFor(lat, lon)] - TIER_RANK[b.coverageFor(lat, lon)]);
}

/** The best coverage tier available at a point (US_HIGH_RES > GLOBAL_COARSE > UNAVAILABLE). */
export function coverageStateFor(lat: number, lon: number): CoverageState {
  const states = ALL_PROVIDERS.map((p) => p.coverageFor(lat, lon));
  if (states.includes("US_HIGH_RES")) return "US_HIGH_RES";
  if (states.includes("GLOBAL_COARSE")) return "GLOBAL_COARSE";
  return "UNAVAILABLE";
}
