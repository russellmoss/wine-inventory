// Plan 096 Phase 0 Unit 5 — global site elevation. USGS EPQS is US-only, so before this NO non-US
// vineyard had a siteElevationM (audit §3.1). That matters more than it sounds: in Himalayan terrain
// a ~50 km gridcell's MEAN elevation vs a vineyard at ~2,300 m is a multi-degree temperature error —
// exactly the error that makes a frost forecast useless. Open-Meteo's elevation API is keyless,
// global (Copernicus DEM GLO-90, live-verified `{elevation:[n]}`), and the same value later feeds
// the Open-Meteo forecast's `elevation=` statistical-downscaling parameter (Phase 2 U13).

import { OPEN_METEO_API_KEY, OPEN_METEO_BASE_URL } from "../config";
import { isUsForecastCoverage } from "../us-coverage";
import { fetchJson } from "./fetch-util";
import { fetchElevationM as fetchEpqsElevationM } from "./usgs-epqs";
import { ProviderFetchError } from "./types";

/** Pure: parse `{elevation:[n]}` into meters. */
export function parseOpenMeteoElevationM(json: unknown): number | null {
  const arr = (json as { elevation?: unknown })?.elevation;
  const n = Array.isArray(arr) ? Number(arr[0]) : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function fetchOpenMeteoElevationM(lat: number, lon: number): Promise<number | null> {
  const key = OPEN_METEO_API_KEY ? `&apikey=${OPEN_METEO_API_KEY}` : "";
  const url = `${OPEN_METEO_BASE_URL}/v1/elevation?latitude=${lat}&longitude=${lon}${key}`;
  try {
    return parseOpenMeteoElevationM(await fetchJson("open_meteo", url));
  } catch (e) {
    // Elevation is non-fatal context (same stance as EPQS) — a failure leaves it unknown.
    if (e instanceof ProviderFetchError) return null;
    throw e;
  }
}

/**
 * The site-elevation chain: EPQS (US, ~10 m DEM) where the point is US at all, else / on-miss
 * Open-Meteo (global, 90 m). Injectable into ingest via deps.fetchElevationM.
 */
export async function fetchSiteElevationM(
  lat: number,
  lon: number,
  deps: { epqs?: typeof fetchEpqsElevationM; openMeteo?: typeof fetchOpenMeteoElevationM } = {},
): Promise<number | null> {
  const epqs = deps.epqs ?? fetchEpqsElevationM;
  const openMeteo = deps.openMeteo ?? fetchOpenMeteoElevationM;
  if (isUsForecastCoverage(lat, lon)) {
    return (await epqs(lat, lon)) ?? (await openMeteo(lat, lon));
  }
  // Non-US: EPQS can't answer — don't waste the request.
  return openMeteo(lat, lon);
}
