/**
 * Vineyard Intelligence P4 (soil overlay) — parse SDA's clipped-geometry WKT into GeoJSON.
 *
 * PURE: no I/O. SDA returns each map unit's block-clipped geometry via `STIntersection(...).STAsText()`
 * as WKT — `POLYGON ((lng lat, ...),(hole))` or `MULTIPOLYGON (((...)),((...)))`. We render it as a
 * Leaflet vector overlay, so parse to the repo's `VineyardPolygon` (GeoJSON, [lng,lat]). Returns null on
 * anything unparseable (an EMPTY/degenerate clip, or a GEOMETRYCOLLECTION) so a bad feature is dropped,
 * never rendered wrong — the authoritative composition snapshot is unaffected.
 */
import type { Position, VineyardPolygon } from "../gis/geometry";
import type { SdaGeometryRow } from "./parse-sda-core";

/** The stored display-geometry FeatureCollection (overlay only; composition snapshot is authoritative). */
export type SoilDisplayGeometry = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; properties: { mukey: string }; geometry: VineyardPolygon }>;
};

function parseRing(body: string): Position[] | null {
  const pts = body
    .trim()
    .split(",")
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .map(([x, y]) => [x, y] as Position);
  if (pts.length < 4) return null;
  if (pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  return pts;
}

/** Split "(ring),(hole),..." (one polygon's rings) into ring bodies, respecting nested parens depth 1. */
function splitRings(inner: string): string[] {
  const rings: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "(") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0 && start >= 0) rings.push(inner.slice(start, i));
    }
  }
  return rings;
}

function parsePolygonBody(inner: string): Position[][] | null {
  const rings = splitRings(inner).map(parseRing);
  if (rings.length === 0 || rings.some((r) => r === null)) return null;
  return rings as Position[][];
}

/** Parse a single WKT geometry string. Returns a Polygon/MultiPolygon, or null if not renderable. */
export function wktToPolygon(wkt: string | null): VineyardPolygon | null {
  if (!wkt) return null;
  const s = wkt.trim();
  const upper = s.toUpperCase();

  if (upper.startsWith("POLYGON")) {
    const open = s.indexOf("(");
    if (open < 0) return null;
    const inner = s.slice(open + 1, s.lastIndexOf(")"));
    const rings = parsePolygonBody(inner);
    return rings ? { type: "Polygon", coordinates: rings } : null;
  }

  if (upper.startsWith("MULTIPOLYGON")) {
    const open = s.indexOf("(");
    if (open < 0) return null;
    const inner = s.slice(open + 1, s.lastIndexOf(")"));
    // Split top-level polygons: each is a "((ring),(hole))" group at depth 1.
    const polys: string[] = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === "(") {
        if (depth === 0) start = i + 1;
        depth++;
      } else if (ch === ")") {
        depth--;
        if (depth === 0 && start >= 0) polys.push(inner.slice(start, i));
      }
    }
    const coords = polys.map(parsePolygonBody);
    if (coords.length === 0 || coords.some((c) => c === null)) return null;
    return { type: "MultiPolygon", coordinates: coords as Position[][][] };
  }

  return null; // EMPTY / GEOMETRYCOLLECTION / POINT / LINESTRING — not a renderable soil face
}

/** Build the stored display-geometry FeatureCollection from SDA geometry rows. Unparseable/EMPTY clips
 *  are DROPPED (never rendered wrong). Returns null if nothing renderable came back. */
export function soilDisplayFromRows(rows: SdaGeometryRow[]): SoilDisplayGeometry | null {
  const features = rows
    .map((r) => {
      const geometry = wktToPolygon(r.wkt);
      return geometry ? { type: "Feature" as const, properties: { mukey: r.mukey }, geometry } : null;
    })
    .filter((f): f is SoilDisplayGeometry["features"][number] => f !== null);
  return features.length > 0 ? { type: "FeatureCollection", features } : null;
}
