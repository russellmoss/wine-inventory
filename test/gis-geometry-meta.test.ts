import { describe, it, expect } from "vitest";
import {
  geometryFingerprint,
  canonicalAnchorFor,
  projectedAreaM2,
  geodesicAreaM2,
  iou,
} from "../src/lib/gis/geometry-meta";
import type { PolygonGeometry, Position } from "../src/lib/gis/geometry";

const LON0 = -78.5;
const LAT0 = 38.03;

/** A square whose side is `sideDeg` degrees, SW corner at (LON0+ox, LAT0+oy) degrees. */
function square(sideDeg: number, ox = 0, oy = 0): PolygonGeometry {
  const x = LON0 + ox;
  const y = LAT0 + oy;
  return {
    type: "Polygon",
    coordinates: [[[x, y], [x, y + sideDeg], [x + sideDeg, y + sideDeg], [x + sideDeg, y], [x, y]]],
  };
}

describe("geometryFingerprint", () => {
  it("is stable across a WGS84 round-trip with the same anchor", () => {
    const sq = square(0.002);
    const anchor = canonicalAnchorFor(sq);
    expect(geometryFingerprint(sq, anchor)).toBe(geometryFingerprint(sq, anchor));
  });

  it("is invariant to winding and start-vertex choice", () => {
    const sq = square(0.002);
    const anchor = canonicalAnchorFor(sq);
    const fp = geometryFingerprint(sq, anchor);
    // reverse winding
    const reversed: PolygonGeometry = { type: "Polygon", coordinates: [[...sq.coordinates[0]].reverse()] };
    expect(geometryFingerprint(reversed, anchor)).toBe(fp);
    // rotate the start vertex (drop closing dup, rotate, re-close)
    const open = sq.coordinates[0].slice(0, -1);
    const rot = [...open.slice(2), ...open.slice(0, 2)];
    const rotated: PolygonGeometry = { type: "Polygon", coordinates: [[...rot, rot[0]]] };
    expect(geometryFingerprint(rotated, anchor)).toBe(fp);
  });

  it("changes when a vertex actually moves", () => {
    const sq = square(0.002);
    const anchor = canonicalAnchorFor(sq);
    const moved: PolygonGeometry = JSON.parse(JSON.stringify(sq));
    moved.coordinates[0][1][0] += 0.0005; // shove one vertex ~44 m
    expect(geometryFingerprint(moved, anchor)).not.toBe(geometryFingerprint(sq, anchor));
  });
});

describe("area", () => {
  it("projected and geodesic agree within tolerance for a ~222 m square", () => {
    const sq = square(0.002); // ~178 m E-W × ~222 m N-S
    const proj = projectedAreaM2(sq);
    const geo = geodesicAreaM2(sq);
    expect(proj).toBeGreaterThan(30_000);
    expect(geo).toBeCloseTo(proj, -2); // agree within ~100 m² (well under 1%)
    expect(Math.abs(geo - proj) / proj).toBeLessThan(0.01);
  });

  it("subtracts holes", () => {
    const outer = square(0.004).coordinates[0];
    const holeX = LON0 + 0.001;
    const holeY = LAT0 + 0.001;
    const hole: Position[] = [
      [holeX, holeY], [holeX + 0.002, holeY], [holeX + 0.002, holeY + 0.002], [holeX, holeY + 0.002], [holeX, holeY],
    ];
    const withHole: PolygonGeometry = { type: "Polygon", coordinates: [outer, hole] };
    const solid = square(0.004);
    expect(projectedAreaM2(withHole)).toBeLessThan(projectedAreaM2(solid));
  });
});

describe("iou", () => {
  it("is 1.0 for an identical polygon", () => {
    const sq = square(0.002);
    expect(iou(sq, sq)).toBeCloseTo(1, 5);
  });

  it("is > 0.98 for a ~10 cm nudge on a ~700 m block (trace correction)", () => {
    const big = square(0.0063); // ~560–700 m block
    const nudged: PolygonGeometry = JSON.parse(JSON.stringify(big));
    nudged.coordinates[0][1][0] += 0.000001; // ~0.09 m at this latitude
    expect(iou(big, nudged)).toBeGreaterThan(0.98);
  });

  it("is low for a real reshape (half-overlap)", () => {
    const a = square(0.004);
    const b = square(0.004, 0.002, 0); // shifted halfway across → ~50% overlap
    const v = iou(a, b);
    expect(v).toBeGreaterThan(0.2);
    expect(v).toBeLessThan(0.5);
  });
});
