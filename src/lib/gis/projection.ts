/**
 * Vineyard Intelligence — WGS84 <-> local metric projection, and the geometry epsilon.
 *
 * PURE: no React, no Leaflet, no I/O. `proj4` is the one runtime dependency (see the ADR).
 *
 * WHY A PROJECTED CRS IS MANDATORY, not a preference:
 *   1. A coverage fraction is a ratio of AREAS. Sentinel-2 pixels are square in UTM, never in
 *      degrees, so a "10 m pixel" in lon/lat is a non-square quadrilateral whose degree-squared area
 *      is not proportional to m². Computing fractions in degrees is not merely imprecise, it is wrong.
 *   2. An absolute epsilon in degrees is anisotropic on the ground: a degree of longitude is
 *      cos(latitude) shorter than a degree of latitude.
 *   3. The documented robustness failures in the JS polygon-clipping family cluster around the 6th
 *      decimal of a WGS84 degree, which is ~0.11 m — exactly the magnitude of a block boundary.
 *
 * WHY WE RECENTRE. Float64 spacing scales with magnitude. A raw UTM northing of ~5e6 m has an ULP
 * near 1e-9 m; translating so the AOI sits near the origin drops the magnitude to ~1e2 m and the ULP
 * to ~1e-14 m. That is roughly four decimal digits of headroom, bought for one subtraction. The
 * numbers are measured, not asserted — see `docs/GIS/phases/p0-tolerance-decision.md`.
 */
import proj4 from "proj4";
import { bbox, type Position, type VineyardPolygon } from "./geometry";

/**
 * ε_geom — the INPUT-side geometry epsilon, in recentred projected METRES.
 *
 * Used for vertex snapping and degenerate-edge rejection inside the clipper. Fixed here, a priori,
 * before any golden exists, because a tolerance chosen to make a failing test pass is not a tolerance
 * (runbook §5).
 *
 * 1e-6 m = 1 µm, justified three ways:
 *   - ~8 orders of magnitude above the float64 ULP at recentred vineyard scale (~1e-14 m),
 *   - 7 orders below the 10 m Sentinel-2 pixel,
 *   - ~6 orders below any real block-boundary survey accuracy (~1 m).
 * It cannot move a coverage fraction at any digit we will ever report.
 *
 * NOT to be confused with ε_agree, the OUTPUT-side tolerance for agreement against `exactextract`.
 * That one is derived empirically in Unit 5. Conflating the two made the first draft circular.
 */
export const GEOM_EPSILON_M = 1e-6;

/** WGS84 as proj4 understands it. */
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

/** PURE: the UTM zone number (1-60) containing a longitude. */
export function utmZone(lon: number): number {
  const z = Math.floor((lon + 180) / 6) + 1;
  return Math.min(60, Math.max(1, z));
}

/** PURE: the EPSG code for a UTM zone — 326NN in the north, 327NN in the south. */
export function utmEpsg(lon: number, lat: number): string {
  const zone = utmZone(lon);
  return `EPSG:${lat >= 0 ? 326 : 327}${String(zone).padStart(2, "0")}`;
}

/**
 * A proj4 definition string rather than an EPSG alias. proj4 resolves common EPSG codes, but the
 * explicit definition removes any dependence on its built-in registry.
 */
function utmDef(zone: number, north: boolean): string {
  return `+proj=utm +zone=${zone} ${north ? "" : "+south "}+datum=WGS84 +units=m +no_defs`;
}

export type Projector = {
  /** EPSG code of the working CRS, for provenance. */
  readonly epsg: string;
  readonly zone: number;
  readonly north: boolean;
  /** The projected point subtracted from every coordinate (whole metres, so it is reproducible). */
  readonly origin: readonly [number, number];
  /**
   * True when the AOI bounding box straddles a UTM zone boundary. We pin the centroid's zone and
   * carry on — a real vineyard cannot span 6° of longitude (~500 km) — but the flag is recorded in
   * provenance so a caller can refuse or warn rather than silently accepting the added distortion.
   */
  readonly spansMultipleZones: boolean;
  /** WGS84 `[lon, lat]` -> recentred projected metres `[x, y]`. */
  forward(pos: Position): [number, number];
  /** Recentred projected metres `[x, y]` -> WGS84 `[lon, lat]`. */
  inverse(xy: readonly [number, number]): Position;
};

/** PURE: build a projector for an arbitrary `[minX, minY, maxX, maxY]` WGS84 extent. */
export function createProjectorForBbox(b: readonly [number, number, number, number]): Projector {
  const [minX, minY, maxX, maxY] = b;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const zone = utmZone(cx);
  const north = cy >= 0;
  const def = utmDef(zone, north);
  const epsg = utmEpsg(cx, cy);
  const spansMultipleZones = utmZone(minX) !== utmZone(maxX);

  // Recentre on the projected AOI centre, rounded to whole metres so the origin is stable across
  // runs and reproducible from provenance alone.
  const [ox, oy] = proj4(WGS84, def, [cx, cy]) as [number, number];
  const origin: readonly [number, number] = [Math.round(ox), Math.round(oy)];

  return {
    epsg,
    zone,
    north,
    origin,
    spansMultipleZones,
    forward(pos: Position): [number, number] {
      const [x, y] = proj4(WGS84, def, [pos[0], pos[1]]) as [number, number];
      return [x - origin[0], y - origin[1]];
    },
    inverse(xy: readonly [number, number]): Position {
      const [lon, lat] = proj4(def, WGS84, [xy[0] + origin[0], xy[1] + origin[1]]) as [number, number];
      return [lon, lat];
    },
  };
}

/** PURE: build a projector sized to a vineyard geometry. */
export function createProjector(polygon: VineyardPolygon): Projector {
  return createProjectorForBbox(bbox(polygon));
}

/**
 * A frozen projection frame: the working CRS + the recentre origin, in projected metres. Persisting
 * this alongside a geometry lets a LATER edit be projected into the SAME frame, so a fingerprint of an
 * unchanged shape is byte-identical across edits (VI-P1 council S1 — an unpinned origin hashes two ways).
 */
export type CanonicalAnchor = { epsg: string; originX: number; originY: number };

/** PURE: rebuild a projector from a persisted anchor (fixed origin), rather than from a fresh bbox. */
export function createProjectorFromAnchor(anchor: CanonicalAnchor): Projector {
  const code = anchor.epsg.replace("EPSG:", "");
  const north = code.startsWith("326");
  const zone = Number(code.slice(3));
  const def = utmDef(zone, north);
  const origin: readonly [number, number] = [anchor.originX, anchor.originY];
  return {
    epsg: anchor.epsg,
    zone,
    north,
    origin,
    spansMultipleZones: false,
    forward(pos: Position): [number, number] {
      const [x, y] = proj4(WGS84, def, [pos[0], pos[1]]) as [number, number];
      return [x - origin[0], y - origin[1]];
    },
    inverse(xy: readonly [number, number]): Position {
      const [lon, lat] = proj4(def, WGS84, [xy[0] + origin[0], xy[1] + origin[1]]) as [number, number];
      return [lon, lat];
    },
  };
}

/** PURE: the canonical anchor for a geometry — the frame `createProjector` would pick, as data. */
export function anchorFor(polygon: VineyardPolygon): CanonicalAnchor {
  const p = createProjector(polygon);
  return { epsg: p.epsg, originX: p.origin[0], originY: p.origin[1] };
}

/** PURE: project every ring of a geometry into recentred metres. Winding is preserved. */
export function projectRings(polygon: VineyardPolygon, p: Projector): [number, number][][] {
  const rings = polygon.type === "Polygon" ? polygon.coordinates : polygon.coordinates.flat();
  return rings.map((ring) => ring.map((pos) => p.forward(pos)));
}

/**
 * PURE: the float64 spacing (ULP) at a magnitude — the smallest representable difference near `v`.
 * Exposed so the tolerance decision can be measured and re-measured rather than asserted.
 */
export function ulpAt(v: number): number {
  const a = Math.abs(v);
  if (a === 0) return Number.MIN_VALUE;
  const next = a + Math.max(a * Number.EPSILON, Number.MIN_VALUE);
  return next - a;
}

/**
 * PURE: convert a WGS84 bbox into the AOI's UTM zone, returning the projected bbox and its OGC URI.
 *
 * WHY THIS EXISTS. The Sentinel Hub Process API expresses `output.resx/resy` in the units of the
 * REQUESTED CRS. Asking for `resx: 10` under CRS84 therefore requests 10 DEGREES per pixel, which
 * CDSE rejects outright:
 *
 *   "Your request of 3504.23 meters per pixel exceeds the limit 1500.00 meters per pixel"
 *
 * Pinning Sentinel-2's native 10 m grid is only possible in a metric CRS. This is the helper that
 * makes that correct by construction rather than by remembering.
 */
export function utmBboxFor(wgs84: readonly [number, number, number, number]): {
  epsg: string;
  crsUri: string;
  bbox: [number, number, number, number];
} {
  const [minX, minY, maxX, maxY] = wgs84;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const zone = utmZone(cx);
  const north = cy >= 0;
  const def = utmDef(zone, north);
  const epsg = utmEpsg(cx, cy);
  const [x0, y0] = proj4(WGS84, def, [minX, minY]) as [number, number];
  const [x1, y1] = proj4(WGS84, def, [maxX, maxY]) as [number, number];
  return {
    epsg,
    crsUri: `http://www.opengis.net/def/crs/EPSG/0/${epsg.replace("EPSG:", "")}`,
    bbox: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)],
  };
}
