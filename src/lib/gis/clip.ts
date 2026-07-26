/**
 * Vineyard Intelligence — clip an NDVI display grid to the vineyard's block polygons (P3 follow-on).
 *
 * PURE: no React, no Leaflet, no DOM, no I/O. `proj4` is the one runtime dependency (as in warp.ts).
 *
 * WHY. The stored raster covers the estate AOI (a rectangle around the planting geometry), so a naive
 * overlay paints NDVI over gaps, roads, ponds, and neighbours. This masks the warped display grid to the
 * BLOCK polygons: pixels whose centre falls inside a block get coverage 1, everything else 0. The mask
 * feeds BOTH the colour-domain (so "vineyard relative" is calibrated to the vines, not the surroundings)
 * AND the display alpha (so only the blocks are painted). Point-in-polygon on pixel centres — binary, no
 * anti-aliasing — which matches the honest 10 m block grid.
 */
import proj4 from "proj4";

const MERC_3857 =
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs";
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

/** A polygon as its rings (outer first, then holes), each ring a list of [lon, lat]. */
export type WgsPolygon = { readonly rings: ReadonlyArray<ReadonlyArray<readonly [number, number]>> };

/** PURE: normalize a GeoJSON Polygon/MultiPolygon into a flat list of ringed polygons. Returns [] if invalid. */
export function toWgsPolygons(geojson: unknown): WgsPolygon[] {
  if (!geojson || typeof geojson !== "object") return [];
  const g = geojson as { type?: string; coordinates?: unknown };
  const asRing = (r: unknown): Array<readonly [number, number]> =>
    Array.isArray(r) ? r.filter((p) => Array.isArray(p) && p.length >= 2).map((p) => [Number((p as number[])[0]), Number((p as number[])[1])] as const) : [];
  if (g.type === "Polygon" && Array.isArray(g.coordinates)) {
    return [{ rings: (g.coordinates as unknown[]).map(asRing).filter((r) => r.length >= 3) }];
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    return (g.coordinates as unknown[])
      .map((poly) => ({ rings: (poly as unknown[]).map(asRing).filter((r) => r.length >= 3) }))
      .filter((p) => p.rings.length > 0);
  }
  return [];
}

/** PURE: even-odd ray cast across a polygon's rings (outer + holes). True = inside. */
function insidePolygon(lon: number, lat: number, poly: WgsPolygon): boolean {
  let inside = false;
  for (const ring of poly.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
  }
  return inside;
}

/** PURE: true if the point falls inside ANY of the polygons (union). */
export function pointInAnyPolygon(lon: number, lat: number, polys: readonly WgsPolygon[]): boolean {
  for (const p of polys) if (insidePolygon(lon, lat, p)) return true;
  return false;
}

/**
 * PURE: a coverage mask (1 inside a block, 0 outside) for a north-up EPSG:3857 display grid.
 *
 * 3857→WGS84 is separable (lon = f(x), lat = g(y)), so we project one lon per column + one lat per row
 * (O(w+h) proj4 calls) then point-in-polygon each pixel centre (O(w·h)). Returns all-ones if `polys` is
 * empty, so a vineyard with no drawn blocks falls back to the unclipped AOI raster rather than a blank map.
 */
export function blockCoverageMask(
  originX3857: number,
  originY3857: number,
  pixelSizeM: number,
  width: number,
  height: number,
  polys: readonly WgsPolygon[],
): Float64Array {
  const mask = new Float64Array(width * height);
  if (polys.length === 0) {
    mask.fill(1);
    return mask;
  }
  // Separable projection: lon per column, lat per row (north-up: row 0 = max northing).
  const lonForCol = new Float64Array(width);
  for (let c = 0; c < width; c++) {
    const x = originX3857 + (c + 0.5) * pixelSizeM;
    lonForCol[c] = (proj4(MERC_3857, WGS84, [x, originY3857]) as [number, number])[0];
  }
  const latForRow = new Float64Array(height);
  for (let r = 0; r < height; r++) {
    const y = originY3857 - (r + 0.5) * pixelSizeM;
    latForRow[r] = (proj4(MERC_3857, WGS84, [originX3857, y]) as [number, number])[1];
  }
  for (let r = 0; r < height; r++) {
    const lat = latForRow[r];
    for (let c = 0; c < width; c++) {
      mask[r * width + c] = pointInAnyPolygon(lonForCol[c], lat, polys) ? 1 : 0;
    }
  }
  return mask;
}
