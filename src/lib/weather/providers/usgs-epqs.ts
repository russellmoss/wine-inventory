// VI-P8 — USGS EPQS point elevation (keyless). Not a daily series: gives the vineyard SITE elevation used to
// compute the station-vs-site elevation delta that explains any gap between the station and the estimate.

import { fetchJson } from "./fetch-util";
import { ProviderFetchError } from "./types";

/** Pure: parse the EPQS v1 JSON (or the legacy nested shape) into meters. */
export function parseEpqsElevationM(json: unknown): number | null {
  const v1 = (json as { value?: number | string })?.value;
  if (v1 !== undefined) {
    const n = Number(v1);
    return Number.isFinite(n) && n > -1_000_000 ? n : null;
  }
  const legacy = (json as {
    USGS_Elevation_Point_Query_Service?: { Elevation_Query?: { Elevation?: number } };
  })?.USGS_Elevation_Point_Query_Service?.Elevation_Query?.Elevation;
  if (typeof legacy === "number" && legacy > -1_000_000) return legacy;
  return null;
}

export async function fetchElevationM(lat: number, lon: number): Promise<number | null> {
  const url = `https://epqs.nationalmap.gov/v1/json?x=${lon}&y=${lat}&units=Meters&wkid=4326&includeDate=false`;
  try {
    const json = await fetchJson("usgs_epqs", url);
    return parseEpqsElevationM(json);
  } catch (e) {
    // Elevation is non-fatal context, not a data series — a failure just leaves the delta unknown.
    if (e instanceof ProviderFetchError) return null;
    throw e;
  }
}
