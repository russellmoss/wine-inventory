import { describe, it, expect } from "vitest";
import {
  validateVineyardPolygon,
  signedArea,
  pointInRing,
  segmentsProperlyIntersect,
  isVineyardPolygon,
  eachRing,
  bbox,
  MAX_POLYGON_VERTICES,
  type LinearRing,
  type VineyardPolygon,
} from "@/lib/gis/geometry";

/** Counter-clockwise unit square, closed. */
const CCW_SQUARE: LinearRing = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];

const poly = (...rings: LinearRing[]) => ({ type: "Polygon" as const, coordinates: rings });

/** Narrow a validated geometry to its Polygon rings, failing loudly if it is a MultiPolygon. */
function polygonRings(value: VineyardPolygon): LinearRing[] {
  if (value.type !== "Polygon") throw new Error(`expected a Polygon, got ${value.type}`);
  return value.coordinates;
}

/** Narrow a validated geometry to its MultiPolygon parts. */
function multiParts(value: VineyardPolygon): LinearRing[][] {
  if (value.type !== "MultiPolygon") throw new Error(`expected a MultiPolygon, got ${value.type}`);
  return value.coordinates;
}

/**
 * A closed ring of `n` distinct points on a circle, coordinates rounded to 3 decimals.
 * Rounding keeps the serialized polygon well under MAX_POLYGON_BYTES so that a vertex-count test
 * actually exercises the vertex cap rather than tripping the byte cap first.
 */
function ringOf(n: number, cx = 0, cy = 0, r = 1): LinearRing {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const pts: LinearRing = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    pts.push([round(cx + r * Math.cos(t)), round(cy + r * Math.sin(t))]);
  }
  pts.push(pts[0]);
  return pts;
}

describe("signedArea", () => {
  it("is positive for a counter-clockwise ring and negative for a clockwise one", () => {
    expect(signedArea(CCW_SQUARE)).toBeGreaterThan(0);
    expect(signedArea([...CCW_SQUARE].reverse())).toBeLessThan(0);
  });

  it("reports the exact area of a unit square", () => {
    expect(Math.abs(signedArea(CCW_SQUARE))).toBeCloseTo(1, 12);
  });
});

describe("pointInRing", () => {
  it("puts an interior point inside and an exterior point outside", () => {
    expect(pointInRing([0.5, 0.5], CCW_SQUARE)).toBe(true);
    expect(pointInRing([5, 5], CCW_SQUARE)).toBe(false);
  });
});

describe("segmentsProperlyIntersect", () => {
  it("detects a crossing but not a shared endpoint", () => {
    expect(segmentsProperlyIntersect([0, 0], [2, 2], [2, 0], [0, 2])).toBe(true);
    // shared endpoint: adjacent ring edges must NOT count as an intersection
    expect(segmentsProperlyIntersect([0, 0], [1, 1], [1, 1], [2, 0])).toBe(false);
  });
});

describe("validateVineyardPolygon — shape rules", () => {
  it("accepts a well-formed polygon and returns it unchanged when already canonical", () => {
    const res = validateVineyardPolygon(poly(CCW_SQUARE));
    expect(res.ok).toBe(true);
    if (res.ok) expect(polygonRings(res.value)).toEqual([CCW_SQUARE]);
  });

  it("rejects a ring with fewer than 4 positions", () => {
    const res = validateVineyardPolygon(poly([[0, 0], [1, 0], [0, 0]]));
    expect(res).toMatchObject({ ok: false, code: "ring_too_short" });
  });

  it("rejects a ring that does not close", () => {
    const res = validateVineyardPolygon(poly([[0, 0], [1, 0], [1, 1], [0, 1]]));
    expect(res).toMatchObject({ ok: false, code: "unclosed_ring" });
  });

  it("rejects coordinates outside the lon/lat domain", () => {
    const res = validateVineyardPolygon(poly([[0, 0], [181, 0], [181, 1], [0, 1], [0, 0]]));
    expect(res).toMatchObject({ ok: false, code: "out_of_range" });
  });

  it("rejects a non-finite coordinate", () => {
    const res = validateVineyardPolygon(poly([[0, 0], [Number.NaN, 0], [1, 1], [0, 1], [0, 0]]));
    expect(res).toMatchObject({ ok: false, code: "invalid_position" });
  });

  it("rejects a ring that encloses no area", () => {
    const res = validateVineyardPolygon(poly([[0, 0], [1, 1], [2, 2], [0, 0]]));
    expect(res).toMatchObject({ ok: false, code: "degenerate_ring" });
  });

  it("rejects anything that is not a Polygon or MultiPolygon", () => {
    expect(validateVineyardPolygon({ type: "Point", coordinates: [0, 0] })).toMatchObject({ code: "not_a_polygon" });
    expect(validateVineyardPolygon(null)).toMatchObject({ code: "not_a_polygon" });
  });

  it("counts vertices across holes, not just the shell, against the cap", () => {
    // shell alone is under the cap; shell + hole together exceed it
    const n = Math.floor(MAX_POLYGON_VERTICES * 0.7);
    const shell = ringOf(n, 0, 0, 10);
    const hole = ringOf(n, 0, 0, 5);
    expect(validateVineyardPolygon(poly(shell)).ok).toBe(true);
    const res = validateVineyardPolygon(poly(shell, [...hole].reverse()));
    expect(res).toMatchObject({ ok: false, code: "too_many_vertices" });
  });

  it("rejects an oversized shape on bytes before it ever counts vertices", () => {
    // full-precision coordinates blow the 64 KiB cap first — both are rejections, but the byte
    // guard is cheaper and must run first so a huge payload is never fully walked.
    const fat: LinearRing = [];
    for (let i = 0; i < 3000; i++) {
      const t = (2 * Math.PI * i) / 3000;
      fat.push([10 * Math.cos(t), 10 * Math.sin(t)]);
    }
    fat.push(fat[0]);
    expect(validateVineyardPolygon(poly(fat))).toMatchObject({ ok: false, code: "too_large" });
  });
});

describe("validateVineyardPolygon — the validity gate that makes signed-area coverage exact", () => {
  it("rejects a self-intersecting (bow-tie) ring, because signed area would silently cancel", () => {
    const bowtie: LinearRing = [
      [0, 0],
      [2, 2],
      [2, 0],
      [0, 2],
      [0, 0],
    ];
    const res = validateVineyardPolygon(poly(bowtie));
    expect(res).toMatchObject({ ok: false, code: "self_intersecting" });
  });

  it("ACCEPTS a snapped duplicate of the PREVIOUS vertex — a zero-length edge, not a pinch", () => {
    // The map runs Geoman with snappable:true, snapDistance:20, so a manager nudging a boundary can
    // easily drop a vertex on top of the previous one. That is a zero-length edge: it encloses
    // nothing and contributes nothing to signed area. Refusing it would fail a real user's save
    // after they had done the work, for a shape that is perfectly measurable.
    const snapped: LinearRing = [
      [0, 0],
      [4, 0],
      [4, 0], // snapped onto the previous vertex
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    const res = validateVineyardPolygon(poly(snapped));
    expect(res.ok).toBe(true);
    if (res.ok) expect(Math.abs(signedArea(polygonRings(res.value)[0]))).toBeCloseTo(16, 9);
  });

  it("still rejects a NON-adjacent repeat, which is a genuine pinch", () => {
    const pinched: LinearRing = [
      [0, 0],
      [2, 0],
      [1, 1],
      [2, 2],
      [0, 2],
      [1, 1],
      [0, 0],
    ];
    const res = validateVineyardPolygon(poly(pinched));
    expect(res).toMatchObject({ ok: false, code: "self_touching" });
  });

  it("rejects a hole that crosses its shell", () => {
    const shell: LinearRing = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ];
    const straddling: LinearRing = [
      [1, 1],
      [3, 1],
      [3, 3],
      [1, 3],
      [1, 1],
    ];
    const res = validateVineyardPolygon(poly(shell, straddling));
    expect(res).toMatchObject({ ok: false, code: "hole_crosses_shell" });
  });

  it("rejects a hole that lies entirely outside its shell", () => {
    const shell: LinearRing = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ];
    const elsewhere: LinearRing = [
      [10, 10],
      [11, 10],
      [11, 11],
      [10, 11],
      [10, 10],
    ];
    const res = validateVineyardPolygon(poly(shell, elsewhere));
    expect(res).toMatchObject({ ok: false, code: "hole_outside_shell" });
  });

  it("accepts a legitimate hole strictly inside its shell", () => {
    const shell: LinearRing = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    const hole: LinearRing = [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
      [1, 1],
    ];
    expect(validateVineyardPolygon(poly(shell, hole)).ok).toBe(true);
  });
});

describe("validateVineyardPolygon — normalization", () => {
  it("rewinds a clockwise shell to counter-clockwise", () => {
    const cw = [...CCW_SQUARE].reverse();
    const res = validateVineyardPolygon(poly(cw));
    expect(res.ok).toBe(true);
    if (res.ok) expect(signedArea(polygonRings(res.value)[0])).toBeGreaterThan(0);
  });

  it("rewinds a counter-clockwise hole to clockwise, so signed areas subtract", () => {
    const shell: LinearRing = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ];
    const holeCCW: LinearRing = [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
      [1, 1],
    ];
    const res = validateVineyardPolygon(poly(shell, holeCCW));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const [outer, hole] = polygonRings(res.value);
      expect(signedArea(outer)).toBeGreaterThan(0);
      expect(signedArea(hole)).toBeLessThan(0);
      // shell 16 minus hole 1 == 15, straight from the signed sum
      expect(signedArea(outer) + signedArea(hole)).toBeCloseTo(15, 12);
    }
  });

  it("is idempotent — validating an already-normalized polygon changes nothing", () => {
    const once = validateVineyardPolygon(poly([...CCW_SQUARE].reverse()));
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    const twice = validateVineyardPolygon(once.value);
    expect(twice.ok).toBe(true);
    if (twice.ok) expect(twice.value).toEqual(once.value);
  });
});

describe("validateVineyardPolygon — MultiPolygon", () => {
  it("accepts two disconnected parts and normalizes each", () => {
    const far: LinearRing = [
      [10, 10],
      [11, 10],
      [11, 11],
      [10, 11],
      [10, 10],
    ];
    const res = validateVineyardPolygon({
      type: "MultiPolygon",
      coordinates: [[[...CCW_SQUARE].reverse()], [far]],
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.type).toBe("MultiPolygon");
      for (const part of multiParts(res.value)) {
        expect(signedArea(part[0])).toBeGreaterThan(0);
      }
    }
  });

  it("rejects a MultiPolygon when any single part is invalid", () => {
    const res = validateVineyardPolygon({
      type: "MultiPolygon",
      coordinates: [[CCW_SQUARE], [[[0, 0], [1, 0], [0, 0]]]],
    });
    expect(res).toMatchObject({ ok: false, code: "ring_too_short" });
  });
});

describe("helpers", () => {
  it("isVineyardPolygon narrows both geometry types and rejects junk", () => {
    expect(isVineyardPolygon(poly(CCW_SQUARE))).toBe(true);
    expect(isVineyardPolygon({ type: "MultiPolygon", coordinates: [[CCW_SQUARE]] })).toBe(true);
    expect(isVineyardPolygon({ type: "Polygon", coordinates: [] })).toBe(false);
    expect(isVineyardPolygon(undefined)).toBe(false);
  });

  it("eachRing yields shells and holes across both geometry types", () => {
    expect(eachRing(poly(CCW_SQUARE)).length).toBe(1);
    expect(eachRing({ type: "MultiPolygon", coordinates: [[CCW_SQUARE, CCW_SQUARE], [CCW_SQUARE]] }).length).toBe(3);
  });

  it("bbox spans every ring", () => {
    expect(bbox(poly(CCW_SQUARE))).toEqual([0, 0, 1, 1]);
  });
});
