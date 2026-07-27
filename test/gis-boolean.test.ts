import { describe, it, expect } from "vitest";
import {
  unionPolygons,
  differencePolygons,
  splitPolygonByLine,
  groupByContinuity,
  BooleanOpError,
} from "../src/lib/gis/boolean";
import { createProjector, type Projector } from "../src/lib/gis/projection";
import type { Position, PolygonGeometry, VineyardPolygon } from "../src/lib/gis/geometry";

// A vineyard near Charlottesville VA (UTM 17N) — matches the P0 fixtures' hemisphere/zone.
const LON0 = -78.5;
const LAT0 = 38.03;
const D = 0.002; // ~180 m E-W, ~222 m N-S at this latitude

/** Axis-aligned square in degrees, given its SW corner offsets (in units of D) and a size (in D). */
function square(ox: number, oy: number, size = 1): PolygonGeometry {
  const x0 = LON0 + ox * D;
  const y0 = LAT0 + oy * D;
  const s = size * D;
  return {
    type: "Polygon",
    coordinates: [
      [
        [x0, y0],
        [x0, y0 + s],
        [x0 + s, y0 + s],
        [x0 + s, y0],
        [x0, y0],
      ],
    ],
  };
}

function shoelace(ring: Array<[number, number]>): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a) / 2;
}

/** Projected area in m² (outer ring minus holes), for numeric assertions independent of Unit 5. */
function areaM2(poly: VineyardPolygon, p: Projector): number {
  const polys = poly.type === "Polygon" ? [poly.coordinates] : poly.coordinates;
  let total = 0;
  for (const rings of polys) {
    rings.forEach((ring: Position[], idx: number) => {
      const proj = ring.map((pos) => p.forward(pos));
      const a = shoelace(proj);
      total += idx === 0 ? a : -a; // outer adds, holes subtract
    });
  }
  return total;
}

function ringCount(poly: VineyardPolygon): number {
  return poly.type === "Polygon" ? poly.coordinates.length : poly.coordinates.reduce((n, r) => n + r.length, 0);
}

describe("unionPolygons", () => {
  it("dissolves two edge-sharing squares into ONE polygon with no residual sliver", () => {
    const a = square(0, 0);
    const b = square(1, 0); // shares the x = LON0+D edge with a
    const u = unionPolygons([a, b]);
    expect(u.type).toBe("Polygon"); // connected → single polygon, not multi
    expect(ringCount(u)).toBe(1); // no interior sliver/hole from the dissolved shared edge

    const p = createProjector(u);
    const merged = areaM2(u, p);
    const sum = areaM2(a, p) + areaM2(b, p);
    expect(merged).toBeCloseTo(sum, -1); // areas add (within ~0.1 m² at this scale)
  });

  it("returns a MultiPolygon for two disconnected squares", () => {
    const u = unionPolygons([square(0, 0), square(10, 0)]);
    expect(u.type).toBe("MultiPolygon");
  });

  it("is a no-op passthrough for a single polygon", () => {
    const a = square(0, 0);
    expect(unionPolygons([a])).toEqual(a);
  });
});

describe("differencePolygons", () => {
  it("subtracts the overlapping region", () => {
    const a = square(0, 0, 2); // 2D × 2D
    const b = square(1, 1, 2); // overlaps the NE quadrant of a (a D×D square)
    const diff = differencePolygons(a, b);
    expect(diff).not.toBeNull();
    const p = createProjector(diff!);
    // a is 4 D-cells, overlap is 1 D-cell → difference ≈ 3 cells
    const cell = areaM2(square(0, 0), p);
    expect(areaM2(diff!, p)).toBeCloseTo(3 * cell, -1);
  });

  it("returns null when b fully covers a", () => {
    const a = square(0, 0);
    const b = square(-1, -1, 3); // 3D square fully containing a
    expect(differencePolygons(a, b)).toBeNull();
  });
});

describe("splitPolygonByLine (true blade)", () => {
  it("splits a square into two half-area parts that share the exact cut edge (zero lost area)", () => {
    const sq = square(0, 0);
    // vertical blade through the middle; endpoints are INSIDE — extension makes it transect
    const midLon = LON0 + 0.5 * D;
    const blade: Position[] = [
      [midLon, LAT0 + 0.3 * D],
      [midLon, LAT0 + 0.7 * D],
    ];
    const parts = splitPolygonByLine(sq, blade);
    expect(parts.length).toBe(2);

    const p = createProjector(sq);
    const whole = areaM2(sq, p);
    const partAreas = parts.map((pt) => areaM2(pt, p));
    // zero lost area: parts sum to the whole
    expect(partAreas[0] + partAreas[1]).toBeCloseTo(whole, -1);
    // roughly equal halves
    expect(partAreas[0]).toBeCloseTo(whole / 2, -1);
    expect(partAreas[1]).toBeCloseTo(whole / 2, -1);
  });

  it("throws blade_does_not_cross for a degenerate (single-point) blade", () => {
    expect(() => splitPolygonByLine(square(0, 0), [[LON0, LAT0]])).toThrowError(BooleanOpError);
    try {
      splitPolygonByLine(square(0, 0), [[LON0, LAT0]]);
    } catch (e) {
      expect((e as BooleanOpError).code).toBe("blade_does_not_cross");
    }
  });

  it("throws blade_does_not_cross for a zero-length blade", () => {
    const pt: Position = [LON0 + 0.5 * D, LAT0 + 0.5 * D];
    try {
      splitPolygonByLine(square(0, 0), [pt, [pt[0], pt[1]]]);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BooleanOpError);
      expect((e as BooleanOpError).code).toBe("blade_does_not_cross");
    }
  });
});

describe("groupByContinuity", () => {
  it("groups edge-touching squares together and keeps far ones separate", () => {
    // a & b share an edge (distance 0); c is 10 cells away
    const groups = groupByContinuity([square(0, 0), square(1, 0), square(10, 0)]);
    expect(groups.length).toBe(2);
    const sizes = groups.map((g) => g.length).sort();
    expect(sizes).toEqual([1, 2]);
  });

  it("does NOT bridge a gap wider than snapM (cannot merge across a road)", () => {
    // two squares ~180 m apart (10 cells) with the default 1 m snap → distinct groups
    const groups = groupByContinuity([square(0, 0), square(10, 0)], 1);
    expect(groups.length).toBe(2);
  });

  it("bridges a sub-snap gap when snapM is widened", () => {
    // same two squares, but a very wide snap tolerance unions them
    const groups = groupByContinuity([square(0, 0), square(10, 0)], 5000);
    expect(groups.length).toBe(1);
  });
});
