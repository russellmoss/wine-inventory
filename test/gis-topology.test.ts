import { describe, it, expect } from "vitest";
import { reviewTopology, type TopologyFindingCode } from "../src/lib/gis/topology";
import { splitPolygonByLine } from "../src/lib/gis/boolean";
import type { PolygonGeometry, Position } from "../src/lib/gis/geometry";

const LON0 = -78.5;
const LAT0 = 38.03;

function square(sideDeg: number, ox = 0, oy = 0): PolygonGeometry {
  const x = LON0 + ox;
  const y = LAT0 + oy;
  return { type: "Polygon", coordinates: [[[x, y], [x, y + sideDeg], [x + sideDeg, y + sideDeg], [x + sideDeg, y], [x, y]]] };
}

const codes = (r: { findings: { code: TopologyFindingCode }[] }) => r.findings.map((f) => f.code);

describe("reviewTopology", () => {
  it("two shared-boundary blocks that tile the planting: no overlap, no gap, SHARED_BOUNDARY_OK", () => {
    const planting = square(0.004);
    const midLon = LON0 + 0.002;
    const blade: Position[] = [[midLon, LAT0 + 0.001], [midLon, LAT0 + 0.003]];
    const parts = splitPolygonByLine(planting, blade);
    expect(parts.length).toBe(2);
    const r = reviewTopology({
      planting: { id: "pa", geometry: planting },
      blocks: parts.map((g, i) => ({ id: `b${i}`, geometry: g })),
    });
    expect(codes(r)).toContain("SHARED_BOUNDARY_OK");
    expect(codes(r)).not.toContain("SIBLING_OVERLAP");
    expect(codes(r)).not.toContain("UNASSIGNED_AREA");
    expect(r.unassignedAreaM2).toBeLessThan(1);
    // areas reconcile: planting ≈ union of blocks
    expect(r.blocksUnionAreaM2).toBeCloseTo(r.plantingAreaM2, -1);
  });

  it("flags SIBLING_OVERLAP for double-drawn blocks", () => {
    const planting = square(0.006);
    const r = reviewTopology({
      planting: { id: "pa", geometry: planting },
      blocks: [
        { id: "a", geometry: square(0.004, 0, 0) },
        { id: "b", geometry: square(0.004, 0.001, 0.001) }, // overlaps a
      ],
    });
    expect(codes(r)).toContain("SIBLING_OVERLAP");
    const overlap = r.findings.find((f) => f.code === "SIBLING_OVERLAP")!;
    expect(overlap.severity).toBe("MASK_BREAKING");
    expect(overlap.areaM2).toBeGreaterThan(1);
  });

  it("flags BLOCK_OUTSIDE_PARENT for a block spilling past the planting", () => {
    const planting = square(0.004);
    const r = reviewTopology({
      planting: { id: "pa", geometry: planting },
      blocks: [{ id: "a", geometry: square(0.004, 0.002, 0) }], // half outside to the east
    });
    const f = r.findings.find((x) => x.code === "BLOCK_OUTSIDE_PARENT");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("MASK_BREAKING");
  });

  it("a planting HOLE is not counted as unassigned area", () => {
    // planting with a central hole; one block equal to the planting (hole and all) → no gap
    const outer = square(0.006).coordinates[0];
    const hx = LON0 + 0.002;
    const hy = LAT0 + 0.002;
    const hole: Position[] = [[hx, hy], [hx + 0.002, hy], [hx + 0.002, hy + 0.002], [hx, hy + 0.002], [hx, hy]];
    const planting: PolygonGeometry = { type: "Polygon", coordinates: [outer, hole] };
    const r = reviewTopology({
      planting: { id: "pa", geometry: planting },
      blocks: [{ id: "a", geometry: planting }],
    });
    expect(codes(r)).not.toContain("UNASSIGNED_AREA");
    expect(r.unassignedAreaM2).toBeLessThan(1);
  });

  it("flags UNASSIGNED_AREA when a small block leaves most of the planting uncovered", () => {
    const planting = square(0.006);
    const r = reviewTopology({
      planting: { id: "pa", geometry: planting },
      blocks: [{ id: "a", geometry: square(0.001, 0, 0) }], // tiny block in the corner
    });
    const f = r.findings.find((x) => x.code === "UNASSIGNED_AREA");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("ADVISORY");
    expect(f!.areaM2).toBeGreaterThan(1000);
  });
});
