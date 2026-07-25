import { describe, it, expect } from "vitest";
import { planNextVersion, markStaleFor, IOU_CORRECTION_THRESHOLD } from "../src/lib/gis/geometry-version";
import { canonicalAnchorFor, geometryFingerprint } from "../src/lib/gis/geometry-meta";
import type { PolygonGeometry } from "../src/lib/gis/geometry";

const LON0 = -78.5;
const LAT0 = 38.03;

function square(sideDeg: number, ox = 0, oy = 0): PolygonGeometry {
  const x = LON0 + ox;
  const y = LAT0 + oy;
  return { type: "Polygon", coordinates: [[[x, y], [x, y + sideDeg], [x + sideDeg, y + sideDeg], [x + sideDeg, y], [x, y]]] };
}

function stateFor(geom: PolygonGeometry, version = 1) {
  const anchor = canonicalAnchorFor(geom);
  return { geometry: geom, version, anchor, fingerprint: geometryFingerprint(geom, anchor) };
}

describe("planNextVersion", () => {
  it("NO_OP when the shape is unchanged", () => {
    const geom = square(0.004);
    const t = planNextVersion({ current: stateFor(geom), next: geom, subjectId: "pa1" });
    expect(t.kind).toBe("NO_OP");
  });

  it("CORRECT_IN_PLACE for a ~9 cm nudge (IoU > 0.98) — no version bump, no stale", () => {
    const geom = square(0.0063); // ~560–700 m block
    const nudged: PolygonGeometry = JSON.parse(JSON.stringify(geom));
    nudged.coordinates[0][1][0] += 0.000001; // ~0.09 m
    const t = planNextVersion({ current: stateFor(geom), next: nudged, subjectId: "pa1" });
    expect(t.kind).toBe("CORRECT_IN_PLACE");
    if (t.kind === "CORRECT_IN_PLACE") {
      expect(t.version).toBe(1); // unchanged
      expect(t.iouFromPrev).toBeGreaterThan(IOU_CORRECTION_THRESHOLD);
      expect(t).not.toHaveProperty("stale");
    }
  });

  it("NEW_VERSION for a real reshape (IoU ≤ 0.98) — version+1, stale hook fired", () => {
    const a = square(0.004);
    const b = square(0.004, 0.002, 0); // shifted halfway → ~50% overlap
    const t = planNextVersion({ current: stateFor(a, 3), next: b, subjectId: "pa1" });
    expect(t.kind).toBe("NEW_VERSION");
    if (t.kind === "NEW_VERSION") {
      expect(t.version).toBe(4); // current 3 + 1
      expect(t.iouFromPrev).toBeLessThanOrEqual(IOU_CORRECTION_THRESHOLD);
      expect(t.areaGeodesicM2).toBeGreaterThan(0);
      expect(Array.isArray(t.stale)).toBe(true);
      expect(t.stale).toEqual([]); // empty in P1, but present
    }
  });

  it("markStaleFor returns an empty (but real) dependent set in P1", () => {
    expect(markStaleFor("anything")).toEqual([]);
  });
});
