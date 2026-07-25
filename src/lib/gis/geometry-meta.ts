/**
 * Vineyard Intelligence P1 — geometry metadata: canonical fingerprint (staleness key), area summaries,
 * and IoU (the correction-vs-boundary-change gate).
 *
 * PURE: no React, no Leaflet, no I/O (Node's `crypto` is a builtin, used server-side + in tests).
 *
 * The FINGERPRINT is the staleness key shared with soil (P4). It must be frame-stable: the same shape
 * hashes the same across edits (council S1). So it is computed against a PINNED anchor (persisted with
 * the geometry), not a fresh per-edit projector. Coordinates are projected into the anchor frame,
 * rounded to the millimetre (sub-mm float noise cannot flip it; a real vertex move can), rings are
 * winding-normalized and sorted, then SHA-256'd.
 *
 * AREA: `geodesicAreaM2` (spherical excess on WGS84) is the "Boundary footprint" shown to users;
 * `projectedAreaM2` (shoelace in the AOI UTM frame) is an internal cross-check. NEITHER replaces the
 * spacing-based "Productive area" (`vineyard/units.ts`) — three numbers, one hierarchy (council C4).
 */
import { createHash } from "crypto";
import type { Position, VineyardPolygon } from "./geometry";
import { anchorFor, createProjector, createProjectorFromAnchor, type CanonicalAnchor } from "./projection";
import { intersectionPolygons } from "./boolean";

const FP_DECIMALS = 3; // millimetre grid for the fingerprint (in projected metres)
const EARTH_RADIUS_M = 6_378_137; // WGS84 semi-major axis

export type { CanonicalAnchor };

/** The frame `anchorFor` picks for a geometry, re-exported so cores persist it with the version row. */
export function canonicalAnchorFor(poly: VineyardPolygon): CanonicalAnchor {
  return anchorFor(poly);
}

/** PURE: per-polygon list of rings, preserving [outer, ...holes] grouping. */
function polygonsOf(poly: VineyardPolygon): Position[][][] {
  return poly.type === "Polygon" ? [poly.coordinates] : poly.coordinates;
}

/**
 * PURE: frame-stable canonical fingerprint. Project each ring into the anchor frame, round to the mm,
 * drop the closing duplicate, then normalize ring/polygon order so winding and start-vertex choice
 * don't change the hash. SHA-256 of the stable JSON.
 */
export function geometryFingerprint(poly: VineyardPolygon, anchor: CanonicalAnchor): string {
  const p = createProjectorFromAnchor(anchor);
  const round = (n: number) => {
    const f = 10 ** FP_DECIMALS;
    return Math.round(n * f) / f;
  };
  const rotateToMin = (pts: [number, number][]): [number, number][] => {
    let min = 0;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][0] < pts[min][0] || (pts[i][0] === pts[min][0] && pts[i][1] < pts[min][1])) min = i;
    }
    return [...pts.slice(min), ...pts.slice(0, min)];
  };
  // Canonical ring string: invariant to BOTH start-vertex AND winding direction — take the smaller of
  // the forward and reversed rotations (winding is normalized elsewhere, but the hash shouldn't depend on it).
  const canonRing = (ring: Position[]): string => {
    const pts = ring.slice(0, ring.length - 1).map((pos) => {
      const [x, y] = p.forward(pos);
      return [round(x), round(y)] as [number, number];
    });
    const fwd = JSON.stringify(rotateToMin(pts));
    const rev = JSON.stringify(rotateToMin([...pts].reverse()));
    return fwd < rev ? fwd : rev;
  };
  const canonPolys = polygonsOf(poly)
    .map((rings) => JSON.stringify(rings.map(canonRing)))
    .sort();
  return createHash("sha256").update(canonPolys.join("|")).digest("hex");
}

/** PURE: signed shoelace over a projected ring (absolute area). */
function shoelaceAbs(ring: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a) / 2;
}

/** PURE: area in m² via the AOI UTM projection (outer rings add, holes subtract). Internal cross-check. */
export function projectedAreaM2(poly: VineyardPolygon): number {
  const p = createProjector(poly);
  let total = 0;
  for (const rings of polygonsOf(poly)) {
    rings.forEach((ring, idx) => {
      const proj = ring.map((pos) => p.forward(pos));
      total += (idx === 0 ? 1 : -1) * shoelaceAbs(proj);
    });
  }
  return total;
}

/** PURE: geodesic area in m² on the WGS84 sphere (spherical excess). The "Boundary footprint" shown. */
export function geodesicAreaM2(poly: VineyardPolygon): number {
  const ringArea = (ring: Position[]): number => {
    // Spherical-excess area of a ring (radians -> m²). Sign encodes winding.
    let sum = 0;
    const n = ring.length - 1; // last == first
    for (let i = 0; i < n; i++) {
      const [lon1, lat1] = ring[i];
      const [lon2, lat2] = ring[(i + 1) % n];
      sum += ((lon2 - lon1) * Math.PI) / 180 * (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
    }
    return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
  };
  let total = 0;
  for (const rings of polygonsOf(poly)) {
    rings.forEach((ring, idx) => {
      total += (idx === 0 ? 1 : -1) * ringArea(ring);
    });
  }
  return total;
}

/**
 * PURE: Intersection-over-Union of two polygons, in projected metres. 1.0 = identical footprint,
 * ~0.98 = a small trace correction, low = a real reshape. Drives the Unit 6 correction-vs-change gate.
 */
export function iou(a: VineyardPolygon, b: VineyardPolygon): number {
  const areaA = projectedAreaM2(a);
  const areaB = projectedAreaM2(b);
  const inter = intersectionPolygons(a, b);
  const interArea = inter ? projectedAreaM2(inter) : 0;
  const unionArea = areaA + areaB - interArea;
  if (unionArea <= 0) return 1;
  return interArea / unionArea;
}
