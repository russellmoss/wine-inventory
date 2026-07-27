/**
 * Vineyard Intelligence P4 — a coarse "is this in SSURGO territory" gate (design §UI "Out of SSURGO
 * territory"). PURE. Deliberately coarse: a cheap "definitely not covered" filter that disables the
 * control BEFORE any network call, NOT a coverage oracle. An in-bbox location still calls SDA and may
 * come back empty (the "no survey coverage" state). Non-US (e.g. the Bhutan tenant, ~27°N/90°E) is
 * refused here without a round trip.
 */
import { bbox, type VineyardPolygon } from "../gis/geometry";

/** True if (lat,lng) plausibly falls in CONUS, Alaska, Hawaii, or Puerto Rico / USVI. */
export function isLikelyUsLocation(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const inBox = (latMin: number, latMax: number, lngMin: number, lngMax: number) =>
    lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax;
  return (
    inBox(24, 50, -125, -66) || // CONUS
    inBox(51, 72, -170, -129) || // Alaska
    inBox(18, 23, -161, -154) || // Hawaii
    inBox(17, 19, -68, -64) // Puerto Rico + USVI
  );
}

/** The polygon's bounding-box centroid [lng, lat] — the fallback location when a vineyard has no GPS. */
export function polygonCentroid(poly: VineyardPolygon): [number, number] {
  const [minX, minY, maxX, maxY] = bbox(poly);
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}
