/**
 * Vineyard Intelligence P1 — robust boolean polygon operations (union / difference / true line-split)
 * and spatial-continuity grouping, for planting-area geometry.
 *
 * PURE: no React, no Leaflet, no I/O. Wraps `jsts` (the JTS TopologySuite port).
 *
 * WHY jsts, NOT the martinez family (`polygon-clipping` / `polyclip-ts`):
 *   P0 rejected martinez for the `Unable to complete output ring` failures that cluster at the 6th
 *   decimal of a WGS84 degree. Council (2026-07-24) established that working in recentred UTM metres
 *   fixes OUR arithmetic but NOT the library's INTERNAL coincident-edge/precision failure — that is a
 *   precision-model problem, independent of coordinate scale. jsts carries a real `PrecisionModel` +
 *   snap-rounding (`GeometryPrecisionReducer`), which is the actual mitigation. See the P1 plan +
 *   `docs/GIS/phases/phase-1-council-feedback.md` (C1/C2).
 *
 * WHY A TRUE BLADE-SPLIT, NOT buffer-and-corridor:
 *   Buffering the split line into a strip and differencing it destroys the shared row-middle boundary
 *   and mints a permanent gap = corridor width (council C2). A true split nodes the blade with the
 *   polygon boundary and polygonizes, so the two blocks share a mathematically identical edge and lose
 *   zero area.
 *
 * All ops project to ONE recentred UTM frame (shared across the operands), snap to `GEOM_EPSILON_M`,
 * run in metres, inverse-project, and re-validate every output ring through `validateVineyardPolygon`
 * so downstream only ever sees canonical geometry.
 */
// Side-effect import: attaches the binary ops (distance/union/difference/intersection/contains/
// getBoundary) onto the jsts Geometry prototype. Without it those methods are undefined.
import "jsts/org/locationtech/jts/monkey.js";
import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeoJSONWriter from "jsts/org/locationtech/jts/io/GeoJSONWriter.js";
import UnaryUnionOp from "jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js";
import Polygonizer from "jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js";
import GeometryPrecisionReducer from "jsts/org/locationtech/jts/precision/GeometryPrecisionReducer.js";
import PrecisionModel from "jsts/org/locationtech/jts/geom/PrecisionModel.js";

import { bbox, validateVineyardPolygon, type Position, type VineyardPolygon } from "./geometry";
import { createProjectorForBbox, GEOM_EPSILON_M, type Projector } from "./projection";

/** Every way a boolean op can refuse. Distinct codes so callers/tests can assert the reason. */
export type BooleanFault =
  | "empty_result" // op produced no polygon (e.g. difference removed everything)
  | "blade_does_not_cross" // split blade never divided the polygon into ≥2 parts
  | "invalid_output"; // a produced ring failed validateVineyardPolygon

export class BooleanOpError extends Error {
  constructor(
    readonly code: BooleanFault,
    message: string,
  ) {
    super(message);
    this.name = "BooleanOpError";
  }
}

// Snap-rounding grid: 1 / 1e-6 m = 1e6 → a 1 µm fixed grid, matching ε_geom. This is the load-bearing
// robustness knob (council C1): jsts overlay resolves coincident edges against this precision model.
const PRECISION_MODEL = new PrecisionModel(1 / GEOM_EPSILON_M);
const reader = new GeoJSONReader();
const writer = new GeoJSONWriter();

function reduce(g: JstsGeometry): JstsGeometry {
  const r = new GeometryPrecisionReducer(PRECISION_MODEL);
  r.setPointwise(false); // allow topology repair during snapping
  return r.reduce(g);
}

// Difference/intersection along a coincident edge can leave a hairline numerical sliver (sub-mm drift
// from independent projection round-trips). That is noise, not geometry, and it fails
// validateVineyardPolygon as a degenerate ring. Drop polygonal members below this area (10 cm²) — far
// below any floor topology reports (1 m²) — so those ops return the real result (or null), not a throw.
const SLIVER_EPS_M2 = 1e-3;

/** Keep only polygonal members with area ≥ minAreaM2; return null if nothing survives. */
function dropSlivers(geom: JstsGeometry, minAreaM2: number): JstsGeometry | null {
  if (geom.isEmpty()) return null;
  const n = geom.getNumGeometries();
  const kept: JstsGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const g = geom.getGeometryN(i);
    if (g.getArea() >= minAreaM2) kept.push(g);
  }
  if (kept.length === 0) return null;
  if (kept.length === n && geom.getArea() >= minAreaM2) return geom;
  return geom.getFactory().createGeometryCollection(kept);
}

/** Combine per-polygon bboxes into one `[minX,minY,maxX,maxY]` extent. */
function combinedBbox(polys: VineyardPolygon[], extra?: Position[]): [number, number, number, number] {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const fold = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  for (const p of polys) {
    const [a, b, c, d] = bbox(p);
    fold(a, b);
    fold(c, d);
  }
  for (const pt of extra ?? []) fold(pt[0], pt[1]);
  return [minX, minY, maxX, maxY];
}

/** Project a WGS84 polygon's rings into recentred metres as a GeoJSON geometry jsts can read. */
function toMetricGeoJSON(poly: VineyardPolygon, p: Projector) {
  const ring = (r: Position[]) => r.map((pos) => p.forward(pos) as unknown as Position);
  if (poly.type === "Polygon") {
    return { type: "Polygon", coordinates: poly.coordinates.map(ring) };
  }
  return { type: "MultiPolygon", coordinates: poly.coordinates.map((rings) => rings.map(ring)) };
}

function readMetric(poly: VineyardPolygon, p: Projector): JstsGeometry {
  return reduce(reader.read(toMetricGeoJSON(poly, p)));
}

/**
 * Inverse-project a jsts polygonal geometry back to WGS84 and re-validate. A MultiPolygon is returned
 * whole; a GeometryCollection is flattened to its polygonal members. Each output ring must pass
 * `validateVineyardPolygon` or the op fails closed (`invalid_output`).
 */
function toWgs84(geom: JstsGeometry, p: Projector): VineyardPolygon[] {
  if (geom.isEmpty()) return [];
  const gj = writer.write(geom) as { type: string; coordinates: number[][][] | number[][][][] };
  const unproject = (ring: number[][]): Position[] => ring.map((xy) => p.inverse([xy[0], xy[1]]));

  const candidates: VineyardPolygon[] = [];
  if (gj.type === "Polygon") {
    candidates.push({ type: "Polygon", coordinates: (gj.coordinates as number[][][]).map(unproject) });
  } else if (gj.type === "MultiPolygon") {
    candidates.push({
      type: "MultiPolygon",
      coordinates: (gj.coordinates as number[][][][]).map((poly) => poly.map(unproject)),
    });
  } else if (gj.type === "GeometryCollection") {
    // flatten polygonal members (Polygonizer/difference can yield collections)
    for (let i = 0; i < geom.getNumGeometries(); i++) {
      candidates.push(...toWgs84(geom.getGeometryN(i), p));
    }
    return candidates;
  }

  return candidates.map((c) => {
    const res = validateVineyardPolygon(c);
    if (!res.ok) throw new BooleanOpError("invalid_output", `boolean op produced invalid geometry: ${res.message}`);
    return res.value;
  });
}

/**
 * Union of one or more polygons into a single geometry (Polygon when the inputs are connected,
 * MultiPolygon when they are not). Adjacent shared boundaries dissolve with no residual sliver.
 */
export function unionPolygons(polys: VineyardPolygon[]): VineyardPolygon {
  if (polys.length === 0) throw new BooleanOpError("empty_result", "union of zero polygons");
  if (polys.length === 1) return polys[0];
  const projector = createProjectorForBbox(combinedBbox(polys));
  const geoms = polys.map((p) => readMetric(p, projector));
  const collection = geoms[0].getFactory().createGeometryCollection(geoms);
  const united = UnaryUnionOp.union(collection);
  const out = toWgs84(united, projector);
  if (out.length !== 1) throw new BooleanOpError("empty_result", `union returned ${out.length} geometries`);
  return out[0];
}

/** Difference `a \ b`. Returns null when the result is empty (b fully covers a). */
export function differencePolygons(a: VineyardPolygon, b: VineyardPolygon): VineyardPolygon | null {
  const projector = createProjectorForBbox(combinedBbox([a, b]));
  const raw = readMetric(a, projector).difference(readMetric(b, projector));
  const diff = dropSlivers(raw, SLIVER_EPS_M2);
  if (!diff) return null;
  const out = toWgs84(diff, projector);
  if (out.length === 0) return null;
  if (out.length === 1) return out[0];
  // multiple disjoint remnants → a MultiPolygon
  return { type: "MultiPolygon", coordinates: out.flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates)) };
}

/** Intersection `a ∩ b`. Returns null when the two do not overlap. */
export function intersectionPolygons(a: VineyardPolygon, b: VineyardPolygon): VineyardPolygon | null {
  const projector = createProjectorForBbox(combinedBbox([a, b]));
  const rawInter = readMetric(a, projector).intersection(readMetric(b, projector));
  const inter = dropSlivers(rawInter, SLIVER_EPS_M2);
  if (!inter) return null;
  const out = toWgs84(inter, projector);
  if (out.length === 0) return null;
  if (out.length === 1) return out[0];
  return { type: "MultiPolygon", coordinates: out.flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates)) };
}

/** Extend a metric polyline's two ends outward along their end segments by `delta`, so a blade that
 *  does not quite reach the boundary still transects it. */
function extendBlade(line: Position[], delta: number): Position[] {
  if (line.length < 2) return line;
  const out = line.map((p) => [p[0], p[1]] as Position);
  const push = (from: Position, to: Position): Position => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    return [to[0] + (dx / len) * delta, to[1] + (dy / len) * delta];
  };
  out[0] = push(line[1], line[0]); // extend start outward
  out[out.length - 1] = push(line[line.length - 2], line[line.length - 1]); // extend end outward
  return out;
}

/**
 * TRUE line-split ("blade"): split `poly` into ≥2 adjacent polygons that share a mathematically
 * identical edge. The blade is extended to transect the polygon, noded against its boundary, and
 * polygonized; faces whose interior lies inside the original are kept. Throws `blade_does_not_cross`
 * when the blade never divides the polygon (council S10).
 *
 * `lineCoords` are WGS84 `[lon,lat]` positions.
 */
export function splitPolygonByLine(poly: VineyardPolygon, lineCoords: Position[]): VineyardPolygon[] {
  if (lineCoords.length < 2) throw new BooleanOpError("blade_does_not_cross", "split blade needs ≥2 points");
  const projector = createProjectorForBbox(combinedBbox([poly], lineCoords));
  const polyG = readMetric(poly, projector);

  const [minX, minY, maxX, maxY] = combinedBbox([poly], lineCoords);
  // diagonal in METRES (bbox is in degrees) — the extension delta must be metric to match the blade.
  const sw = projector.forward([minX, minY]);
  const ne = projector.forward([maxX, maxY]);
  const diag = Math.hypot(ne[0] - sw[0], ne[1] - sw[1]) || 1;
  const metricLine = lineCoords.map((pos) => projector.forward(pos) as unknown as Position);
  const extended = extendBlade(metricLine, diag * 2); // extend well past the polygon on both ends
  const lineG = reader.read({ type: "LineString", coordinates: extended });

  // Node the blade with the polygon boundary, then rebuild faces.
  const noded = polyG.getBoundary().union(lineG);
  const polygonizer = new Polygonizer();
  polygonizer.add(noded);
  const faces = polygonizer.getPolygons().toArray();

  // Keep only faces whose interior point falls inside the original polygon.
  const inside = faces.filter((f) => polyG.contains(f.getInteriorPoint()));
  if (inside.length < 2) {
    throw new BooleanOpError("blade_does_not_cross", "blade did not divide the polygon into ≥2 parts");
  }
  return inside.flatMap((f) => toWgs84(f, projector));
}

/**
 * Group polygons by spatial continuity (union-find). Two polygons are adjacent when their geometries
 * lie within `snapM` metres of each other (edge-touch OR near-touch); a POINT-only touch does not
 * bridge. Returns index groups into the input array. Used by migration-by-union so a group can NEVER
 * bridge a road/creek into one analysis mask (council C3): the default 1 m keeps distinct plantings apart.
 */
export function groupByContinuity(polys: VineyardPolygon[], snapM = 1): number[][] {
  const n = polys.length;
  if (n === 0) return [];
  const projector = createProjectorForBbox(combinedBbox(polys));
  const geoms = polys.map((p) => readMetric(p, projector));

  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const unite = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (geoms[i].distance(geoms[j]) <= snapM) unite(i, j);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const g = groups.get(root) ?? [];
    g.push(i);
    groups.set(root, g);
  }
  return [...groups.values()];
}
