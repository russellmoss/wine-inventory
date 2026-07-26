// Plan 096 (council S2) — "is this point US for FORECAST purposes?" The legacy coverageStateFor
// bbox is CONUS-only (24–50N, −125…−66) and deliberately excludes Alaska, Hawaii, and the
// territories — correct for gridMET, wrong for NWS (which covers all of them, live-verified).
// This helper is the single predicate for (a) the NWS forecast provider's coverageFor (Phase 2
// Unit 10) and (b) the IMPERIAL unit-system default at config creation. Bboxes are approximate
// by design — the NWS adapter still treats a live /points 404 (InvalidPoint) as "not covered"
// and falls back, so an edge miss degrades to Open-Meteo, never to an error.

interface Bbox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

// CONUS + Alaska + Hawaii + Puerto Rico/USVI + Guam/CNMI + American Samoa.
const US_FORECAST_BBOXES: Bbox[] = [
  { latMin: 24, latMax: 50, lonMin: -125, lonMax: -66 }, // CONUS (matches gridmet.ts)
  { latMin: 51, latMax: 72, lonMin: -170, lonMax: -129 }, // Alaska
  { latMin: 18.5, latMax: 22.5, lonMin: -161, lonMax: -154 }, // Hawaii
  { latMin: 17.5, latMax: 18.6, lonMin: -68, lonMax: -64.5 }, // Puerto Rico + USVI
  { latMin: 13, latMax: 21, lonMin: 144, lonMax: 146.2 }, // Guam + CNMI
  { latMin: -14.7, latMax: -13.8, lonMin: -171.2, lonMax: -169.2 }, // American Samoa
];

/** True when the point is inside US forecast (NWS) coverage — broader than the CONUS-only grid bbox. */
export function isUsForecastCoverage(lat: number, lon: number): boolean {
  return US_FORECAST_BBOXES.some((b) => lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax);
}

/** The unit-system default for a NEW config at this point (display-edge only; storage is always metric). */
export function defaultUnitSystemFor(lat: number, lon: number): "METRIC" | "IMPERIAL" {
  return isUsForecastCoverage(lat, lon) ? "IMPERIAL" : "METRIC";
}
