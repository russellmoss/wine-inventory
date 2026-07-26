// Plan 096 Phase 2 Unit 10 — the forecast registry, mirroring registry.ts. NWS where the US covers
// (its OWN bboxes via us-coverage — NOT the CONUS-only coverageStateFor, which excludes AK/HI and
// the territories NWS demonstrably serves; live-verified Anchorage/Honolulu/San Juan/Guam). The
// bboxes are approximate BY DESIGN: the NWS adapter treats a live /points 404 (InvalidPoint) as a
// typed coverage miss and the ingest falls through to the next provider — an edge miss degrades to
// Open-Meteo, never to an error. Open-Meteo covers globally (Bhutan's actual path today).

import { isUsForecastCoverage } from "../us-coverage";
import type { ForecastCoverageState, ForecastProvider } from "./forecast-types";
import { nwsForecastProvider } from "./forecast-nws";
import { openMeteoForecastProvider } from "./forecast-open-meteo";

const TIER_RANK: Record<ForecastCoverageState, number> = { US_HIGH_RES: 0, GLOBAL_COARSE: 1, UNAVAILABLE: 2 };

const ALL_FORECAST_PROVIDERS: ForecastProvider[] = [nwsForecastProvider, openMeteoForecastProvider];

/** Covering forecast providers for a point, best tier first. */
export function forecastProvidersForLocation(lat: number, lon: number): ForecastProvider[] {
  return ALL_FORECAST_PROVIDERS.filter((p) => p.coverageFor(lat, lon) !== "UNAVAILABLE").sort(
    (a, b) => TIER_RANK[a.coverageFor(lat, lon)] - TIER_RANK[b.coverageFor(lat, lon)],
  );
}

/** NWS forecast coverage — the shared US predicate (CONUS+AK+HI+territories). */
export function nwsCoverageFor(lat: number, lon: number): ForecastCoverageState {
  return isUsForecastCoverage(lat, lon) ? "US_HIGH_RES" : "UNAVAILABLE";
}
