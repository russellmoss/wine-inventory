/**
 * Vineyard Intelligence — the canonical polygon type, validator, and normalizer.
 *
 * PURE: no React, no Leaflet, no I/O, no `server-only`. Node-testable, and it survives a flip to the
 * worker architecture unchanged (runbook rule §2.4).
 *
 * Before this module the repo had THREE unshared polygon representations and one file-private,
 * untested validator that accepted only `type: "Polygon"` and checked neither ring closure, winding,
 * self-intersection, nor hole containment (`src/lib/vineyard/actions.ts`, `SatelliteMap.tsx`).
 *
 * WHY THE STRICTNESS MATTERS. Fractional pixel coverage (see `coverage.ts`) clips each ring against a
 * pixel rectangle and sums SIGNED shoelace areas. That is exact — but only for VALID, simple rings.
 * For a self-intersecting or self-touching ring, signed area is *algebraic, not geometric*: the
 * enclosed regions cancel and the result is a confident, silent, wrong number. So those inputs are
 * rejected here rather than measured downstream. This gate is what makes the Unit 3 proof true.
 *
 * The types are declared STRUCTURALLY rather than via the global `GeoJSON.*` namespace, which reaches
 * this repo only transitively through `@types/leaflet` -> `@types/geojson` and is not a declared
 * dependency.
 */

/** A `[longitude, latitude]` position. Extra ordinates (elevation) are permitted but ignored. */
export type Position = number[];

/** A closed linear ring: first and last position equal, at least 4 positions. */
export type LinearRing = Position[];

/** `[outerRing, ...holes]`. */
export type PolygonRings = LinearRing[];

export type PolygonGeometry = { type: "Polygon"; coordinates: PolygonRings };
export type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: PolygonRings[] };

/** The canonical vineyard geometry. Brief §2.3 requires both Polygon and MultiPolygon. */
export type VineyardPolygon = PolygonGeometry | MultiPolygonGeometry;

/** Every way a candidate geometry can be refused. Distinct codes so tests can assert the reason. */
export type RejectionCode =
  | "too_large"
  | "not_a_polygon"
  | "empty_geometry"
  | "ring_too_short"
  | "invalid_position"
  | "out_of_range"
  | "too_many_vertices"
  | "unclosed_ring"
  | "degenerate_ring"
  | "self_touching"
  | "self_intersecting"
  | "hole_crosses_shell"
  | "hole_outside_shell";

export type ValidationResult =
  | { ok: true; value: VineyardPolygon }
  | { ok: false; code: RejectionCode; message: string };

// Carried over from the previous file-private validator so behaviour for currently-valid polygons
// does not change. Vertices are counted across ALL rings, holes included.
export const MAX_POLYGON_BYTES = 64 * 1024;
export const MAX_POLYGON_VERTICES = 2000;

/**
 * Ring-closure tolerance, in DEGREES. Deliberately tiny: this is an equality check on coordinates the
 * client just drew, not a geometric tolerance. The geometric epsilon that governs clipping is a
 * separate value in projected metres (`projection.ts` — ε_geom); conflating the two is the mistake
 * the council flagged.
 */
const CLOSURE_EPS_DEG = 1e-12;

/**
 * Minimum ring area, in squared DEGREES, below which a ring is treated as degenerate.
 *
 * `signedArea === 0` is not enough: a sliver 1e-13 deg wide has an area near 1e-26 — non-zero, so it
 * survives an exact test, yet it encloses nothing real and would seed a phantom coverage fraction
 * downstream. Found by the Unit 4 degenerate fixtures.
 *
 * 1e-16 deg² is roughly 1.2e-6 m². A 1 m² feature is ~8.1e-11 deg², five orders of magnitude larger,
 * so nothing anyone could legitimately draw is at risk. This is a validity floor in degrees and is
 * distinct from ε_geom, which governs clipping in projected metres.
 */
const DEGENERATE_AREA_EPS_DEG2 = 1e-16;

const reject = (code: RejectionCode, message: string): ValidationResult => ({ ok: false, code, message });

/** PURE: shoelace signed area in squared degrees. Positive = counter-clockwise. Sign only — never area. */
export function signedArea(ring: LinearRing): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

/** PURE: is `pt` inside `ring`? Ray casting, boundary treated as outside. */
export function pointInRing(pt: Position, ring: LinearRing): boolean {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function orient(a: Position, b: Position, c: Position): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/**
 * PURE: do segments a1-a2 and b1-b2 cross at an interior point?
 * PROPER intersection only — shared endpoints and collinear overlap return false, because ring
 * segments legitimately share endpoints with their neighbours. Collinear/touching cases are caught
 * by the duplicate-vertex ("self_touching") check instead, which is stricter and cheaper.
 */
export function segmentsProperlyIntersect(a1: Position, a2: Position, b1: Position, b2: Position): boolean {
  const d1 = orient(a1, a2, b1);
  const d2 = orient(a1, a2, b2);
  const d3 = orient(b1, b2, a1);
  const d4 = orient(b1, b2, a2);
  return d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0 && d1 !== d2 && d3 !== d4;
}

/** Ring edges as index pairs, excluding the implicit closing duplicate. */
function edgeCount(ring: LinearRing): number {
  return ring.length - 1;
}

/**
 * Self-intersection: any two NON-ADJACENT edges of the same ring crossing.
 * O(n^2) over at most MAX_POLYGON_VERTICES (2000) edges. That is ~2M orientation tests worst case,
 * which is fine for a validation path that runs once per save, and is not on the per-pixel hot loop.
 */
function ringSelfIntersects(ring: LinearRing): boolean {
  const n = edgeCount(ring);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // skip adjacent edges, and the first/last pair which are adjacent through the closure
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsProperlyIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) return true;
    }
  }
  return false;
}

/**
 * Drop CONSECUTIVE duplicate vertices (a zero-length edge).
 *
 * This is not pedantry, it is the difference between refusing a real user's edit and accepting it.
 * The map runs Leaflet-Geoman with `snappable: true, snapDistance: 20` (`SatelliteMap.tsx`), so a
 * 20-pixel snap radius makes it easy to drop a vertex exactly on top of the previous one while
 * adjusting a boundary. That produces a repeated coordinate, but NOT an ambiguous shape: a
 * zero-length edge encloses nothing and contributes nothing to signed area, so it can simply be
 * removed. Only a NON-ADJACENT repeat pinches the ring into a figure-eight, and that is what
 * `ringSelfTouches` still refuses.
 *
 * Without this, a vineyard manager nudging a block boundary would get a hard save failure after
 * doing the work, for a shape that is perfectly measurable.
 */
function dropConsecutiveDuplicates(ring: LinearRing): LinearRing {
  const out: LinearRing = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const prev = out[out.length - 1];
    const cur = ring[i];
    if (Math.abs(cur[0] - prev[0]) > CLOSURE_EPS_DEG || Math.abs(cur[1] - prev[1]) > CLOSURE_EPS_DEG) {
      out.push(cur);
    }
  }
  // preserve explicit closure if collapsing removed it
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && (first[0] !== last[0] || first[1] !== last[1])) out.push([first[0], first[1]]);
  return out;
}

/**
 * Self-touching: a NON-ADJACENT vertex repeated within the ring (beyond the first==last closure).
 *
 * Adjacent repeats are removed by `dropConsecutiveDuplicates` before this runs, because they are
 * harmless. What remains here is the genuine pinch, where signed area becomes algebraic rather than
 * geometric and the lobes silently cancel.
 */
function ringSelfTouches(ring: LinearRing): boolean {
  const seen = new Set<string>();
  for (let i = 0; i < ring.length - 1; i++) {
    const key = `${ring[i][0]},${ring[i][1]}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function ringsProperlyCross(a: LinearRing, b: LinearRing): boolean {
  for (let i = 0; i < edgeCount(a); i++) {
    for (let j = 0; j < edgeCount(b); j++) {
      if (segmentsProperlyIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}

/** Validate one ring's shape. Returns null when the ring is acceptable. */
function checkRing(ring: unknown): ValidationResult | null {
  if (!Array.isArray(ring) || ring.length < 4) {
    return reject("ring_too_short", "A polygon ring needs at least 4 points.");
  }
  for (const pos of ring) {
    if (!Array.isArray(pos) || pos.length < 2) {
      return reject("invalid_position", "Invalid polygon point.");
    }
    const [lng, lat] = pos as number[];
    if (typeof lng !== "number" || typeof lat !== "number" || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      return reject("invalid_position", "Polygon points must be numbers.");
    }
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return reject("out_of_range", "Polygon points are out of range.");
    }
  }
  const raw = ring as LinearRing;
  const first0 = raw[0];
  const last0 = raw[raw.length - 1];
  if (Math.abs(first0[0] - last0[0]) > CLOSURE_EPS_DEG || Math.abs(first0[1] - last0[1]) > CLOSURE_EPS_DEG) {
    return reject("unclosed_ring", "A polygon ring must start and end at the same point.");
  }
  // snapping artefacts first: an adjacent duplicate is a zero-length edge, not an ambiguous shape
  const r = dropConsecutiveDuplicates(raw);
  if (r.length < 4) {
    return reject("degenerate_ring", "That shape encloses no area.");
  }
  const first = r[0];
  const last = r[r.length - 1];
  if (Math.abs(first[0] - last[0]) > CLOSURE_EPS_DEG || Math.abs(first[1] - last[1]) > CLOSURE_EPS_DEG) {
    return reject("unclosed_ring", "A polygon ring must start and end at the same point.");
  }
  if (ringSelfTouches(r)) {
    // A NON-adjacent repeated vertex is geometrically ambiguous: a snapping spur (a vertex dropped
    // onto a distant one) and a genuine figure-eight pinch de-duplicate to the same simple ring, so
    // they cannot be told apart from coordinates alone. Consecutive duplicates (the common snap
    // case) were already removed above and never reach here. This one is rejected with an actionable
    // message rather than guessed at.
    return reject("self_touching", "That shape has a point that sits exactly on another. Move one vertex slightly so the boundary does not touch itself.");
  }
  if (ringSelfIntersects(r)) {
    return reject("self_intersecting", "That shape crosses itself. Split it into separate parts instead.");
  }
  if (Math.abs(signedArea(r)) < DEGENERATE_AREA_EPS_DEG2) {
    return reject("degenerate_ring", "That shape encloses no area.");
  }
  return null;
}

/** Validate one polygon's rings (shell + holes) including hole containment. */
function checkPolygonRings(rings: unknown): ValidationResult | null {
  if (!Array.isArray(rings) || rings.length === 0) {
    return reject("empty_geometry", "Invalid polygon geometry.");
  }
  // Enforce the vertex cap BEFORE the per-ring topology checks, because ringSelfIntersects is
  // O(n^2). A compact ~10k-vertex ring fits under the 64 KiB byte cap but would run ~10^8
  // orientation tests synchronously on the authenticated save path, blocking the event loop. The
  // cap makes the quadratic scan bounded at ~2000 vertices (~4M tests worst case). Counted across
  // all rings so holes cannot smuggle vertices past it.
  if ((rings as PolygonRings).reduce((n, r) => n + (Array.isArray(r) ? r.length : 0), 0) > MAX_POLYGON_VERTICES) {
    return reject("too_many_vertices", "That shape has too many points.");
  }
  for (const ring of rings) {
    const bad = checkRing(ring);
    if (bad) return bad;
  }
  const [shell, ...holes] = rings as PolygonRings;
  for (const hole of holes) {
    if (ringsProperlyCross(hole, shell)) {
      return reject("hole_crosses_shell", "A hole crosses the outside of its shape.");
    }
    // A non-crossing hole is either wholly inside or wholly outside; one vertex decides it.
    if (!pointInRing(hole[0], shell)) {
      return reject("hole_outside_shell", "A hole must lie inside its shape.");
    }
  }
  return null;
}

function countVertices(rings: PolygonRings): number {
  return rings.reduce((n, r) => n + r.length, 0);
}

/** PURE: force canonical winding — outer ring counter-clockwise, holes clockwise. */
function normalizeRings(rings: PolygonRings): PolygonRings {
  return rings.map((ring, i) => {
    const area = signedArea(ring);
    const wantPositive = i === 0; // shell CCW, holes CW
    const isPositive = area > 0;
    return isPositive === wantPositive ? ring : [...ring].reverse();
  });
}

/**
 * Validate and normalize a candidate vineyard geometry.
 *
 * Returns a discriminated result rather than throwing, so this stays a pure module; callers in the
 * server-action layer map `code` onto their own error type. On success the geometry is returned with
 * canonical winding, which is the precondition the signed-area hole handling in `coverage.ts` relies on.
 */
export function validateVineyardPolygon(input: unknown): ValidationResult {
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return reject("not_a_polygon", "Invalid polygon geometry.");
  }
  if (!serialized || serialized.length > MAX_POLYGON_BYTES) {
    return reject("too_large", "That shape is too large to save.");
  }

  const g = input as { type?: unknown; coordinates?: unknown };
  if (!g || typeof g !== "object" || !Array.isArray(g.coordinates)) {
    return reject("not_a_polygon", "Invalid polygon geometry.");
  }

  if (g.type === "Polygon") {
    const bad = checkPolygonRings(g.coordinates);
    if (bad) return bad;
    const rings = g.coordinates as PolygonRings;
    if (countVertices(rings) > MAX_POLYGON_VERTICES) {
      return reject("too_many_vertices", "That shape has too many points.");
    }
    return { ok: true, value: { type: "Polygon", coordinates: normalizeRings(rings) } };
  }

  if (g.type === "MultiPolygon") {
    const parts = g.coordinates as unknown[];
    if (parts.length === 0) return reject("empty_geometry", "Invalid polygon geometry.");
    let vertices = 0;
    const out: PolygonRings[] = [];
    for (const part of parts) {
      const bad = checkPolygonRings(part);
      if (bad) return bad;
      const rings = part as PolygonRings;
      vertices += countVertices(rings);
      out.push(normalizeRings(rings));
    }
    if (vertices > MAX_POLYGON_VERTICES) {
      return reject("too_many_vertices", "That shape has too many points.");
    }
    return { ok: true, value: { type: "MultiPolygon", coordinates: out } };
  }

  return reject("not_a_polygon", "Invalid polygon geometry.");
}

/** PURE: narrowing guard for consumers that only need the shape, not the full validation. */
export function isVineyardPolygon(g: unknown): g is VineyardPolygon {
  if (!g || typeof g !== "object") return false;
  const geo = g as { type?: unknown; coordinates?: unknown };
  if (!Array.isArray(geo.coordinates) || geo.coordinates.length === 0) return false;
  if (geo.type === "Polygon") {
    const ring = geo.coordinates[0];
    return (
      Array.isArray(ring) &&
      ring.length >= 4 &&
      ring.every((pt: unknown) => Array.isArray(pt) && pt.length >= 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
    );
  }
  if (geo.type === "MultiPolygon") {
    return geo.coordinates.every((part: unknown) => Array.isArray(part) && part.length > 0 && Array.isArray(part[0]));
  }
  return false;
}

/** PURE: every ring across a Polygon or MultiPolygon, shells and holes alike. */
export function eachRing(polygon: VineyardPolygon): LinearRing[] {
  return polygon.type === "Polygon" ? polygon.coordinates : polygon.coordinates.flat();
}

/** PURE: `[minX, minY, maxX, maxY]` over every ring. */
export function bbox(polygon: VineyardPolygon): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of eachRing(polygon)) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}
