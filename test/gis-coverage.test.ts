import { describe, it, expect } from "vitest";
import {
  pixelCoverageFraction,
  clipRingToRect,
  shoelace,
  coverageOverGrid,
  coveredAreaM2,
  effectivePixelCount,
  type Pt,
  type PixelGrid,
} from "@/lib/gis/coverage";

/** The unit pixel used by most cases: [0,1] x [0,1]. */
const PX = { x0: 0, y0: 0, x1: 1, y1: 1 };
const frac = (rings: Pt[][]) => pixelCoverageFraction(rings, PX.x0, PX.y0, PX.x1, PX.y1);

/** A CCW axis-aligned rectangle. */
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/**
 * A U-shape whose bar sits BELOW the pixel and whose two prongs poke up into it.
 * Intersection with the unit pixel is two DISJOINT rectangles:
 *   x in [0.1,0.3] and x in [0.7,0.9], each y in [0,0.6]  ->  2 * (0.2 * 0.6) = 0.24
 * Sutherland-Hodgman returns this as ONE ring joined by zero-width bridges along y=0.
 */
const U_SHAPE: Pt[] = [
  [0.1, -0.5],
  [0.9, -0.5],
  [0.9, 0.6],
  [0.7, 0.6],
  [0.7, 0.0],
  [0.3, 0.0],
  [0.3, 0.6],
  [0.1, 0.6],
];

describe("known fractional coverage — the runbook §5 fixtures", () => {
  // A vertical slab from the left edge covers exactly its own width.
  for (const target of [0.1, 0.25, 0.5, 0.9]) {
    it(`a slab of width ${target} covers exactly ${target} of the pixel`, () => {
      expect(frac([rect(0, 0, target, 1)])).toBeCloseTo(target, 12);
    });
  }

  it("a fully interior pixel is exactly 1", () => {
    expect(frac([rect(-5, -5, 5, 5)])).toBe(1);
  });

  it("a fully exterior polygon is exactly 0", () => {
    expect(frac([rect(10, 10, 11, 11)])).toBe(0);
  });

  it("never reports more than 1 or less than 0", () => {
    expect(frac([rect(-100, -100, 100, 100)])).toBeLessThanOrEqual(1);
    expect(frac([rect(0.4, 0.4, 0.6, 0.6)])).toBeGreaterThanOrEqual(0);
  });

  it("a polygon touching only at a corner contributes nothing, not a sliver", () => {
    const cornerTriangle: Pt[] = [
      [1, 1],
      [2, 1],
      [2, 2],
    ];
    expect(frac([cornerTriangle])).toBe(0);
  });

  it("a sliver thinner than the epsilon is dropped rather than kept as a phantom", () => {
    expect(frac([rect(0, 0, 1e-9, 1)])).toBe(0);
  });
});

describe("holes subtract via signed area", () => {
  it("a hole covering a quarter of the pixel leaves three quarters", () => {
    const outer = rect(-1, -1, 2, 2); // CCW, covers the whole pixel
    const hole = [...rect(0.25, 0.25, 0.75, 0.75)].reverse(); // CW
    expect(frac([outer, hole])).toBeCloseTo(0.75, 12);
  });

  it("a hole entirely outside the pixel changes nothing", () => {
    const outer = rect(-1, -1, 2, 2);
    const farHole = [...rect(1.2, 1.2, 1.4, 1.4)].reverse();
    expect(frac([outer, farHole])).toBe(1);
  });

  it("a hole straddling the pixel edge subtracts only its inside part", () => {
    const outer = rect(-1, -1, 2, 2);
    // hole spans x in [0.5, 1.5]; only x in [0.5, 1] is inside -> subtract 0.5 * 1 = 0.5
    const hole = [...rect(0.5, -1, 1.5, 2)].reverse();
    expect(frac([outer, hole])).toBeCloseTo(0.5, 12);
  });
});

describe("multipolygon parts accumulate", () => {
  it("two disjoint parts on one pixel sum their coverage", () => {
    expect(frac([rect(0, 0, 0.1, 1), rect(0.9, 0, 1, 1)])).toBeCloseTo(0.2, 12);
  });
});

describe("the ULP precondition — re-entrant geometry", () => {
  it("a U-shape crossing one pixel twice returns the exact two-component area", () => {
    // 2 prongs, each 0.2 wide x 0.6 tall = 0.24 total. If the zero-width bridges failed to cancel,
    // this would drift off 0.24 and no error would be raised anywhere.
    expect(frac([U_SHAPE])).toBeCloseTo(0.24, 12);
  });

  it("every clipped point on a boundary is EXACTLY on it, not within an ULP", () => {
    // This is the precondition itself. Sutherland-Hodgman's bridges cancel in the shoelace only
    // when both traversals use bit-identical coordinates, which requires the clipped ordinate to be
    // ASSIGNED rather than interpolated. Strict === on purpose.
    const clipped = clipRingToRect(U_SHAPE, PX.x0, PX.y0, PX.x1, PX.y1);
    expect(clipped.length).toBeGreaterThan(0);
    for (const [x, y] of clipped) {
      if (y <= PX.y0) expect(y).toBe(PX.y0);
      if (y >= PX.y1) expect(y).toBe(PX.y1);
      if (x <= PX.x0) expect(x).toBe(PX.x0);
      if (x >= PX.x1) expect(x).toBe(PX.x1);
    }
  });

  it("the bridge vertices really are duplicated and anti-parallel", () => {
    const clipped = clipRingToRect(U_SHAPE, PX.x0, PX.y0, PX.x1, PX.y1);
    const onBottom = clipped.filter(([, y]) => y === 0);
    // the two prongs each contribute two boundary points on y=0
    expect(onBottom.length).toBeGreaterThanOrEqual(4);
  });

  it("clipping a shape that lies wholly inside returns it unchanged", () => {
    const inner = rect(0.2, 0.2, 0.8, 0.8);
    const clipped = clipRingToRect(inner, PX.x0, PX.y0, PX.x1, PX.y1);
    expect(Math.abs(shoelace(clipped))).toBeCloseTo(0.36, 12);
  });
});

describe("winding", () => {
  it("a clockwise-drawn SHELL still yields positive coverage — winding-robust for the shell", () => {
    // Blocks are stored exactly as the client drew them, and Leaflet/Geoman produce either winding.
    // The shell (first ring) is taken as |area| so a CW shell is not silently read as zero coverage.
    const cw = [...rect(0, 0, 0.5, 1)].reverse();
    expect(pixelCoverageFraction([cw], PX.x0, PX.y0, PX.x1, PX.y1)).toBeCloseTo(0.5, 12);
    expect(pixelCoverageFraction([rect(0, 0, 0.5, 1)], PX.x0, PX.y0, PX.x1, PX.y1)).toBeCloseTo(0.5, 12);
  });

  it("a hole still subtracts regardless of the shell's winding", () => {
    // shell CW (drawn backwards), hole present: |shell| minus the hole
    const shellCW = [...rect(-1, -1, 2, 2)].reverse();
    const hole = [...rect(0.25, 0.25, 0.75, 0.75)].reverse();
    expect(pixelCoverageFraction([shellCW, hole], PX.x0, PX.y0, PX.x1, PX.y1)).toBeCloseTo(0.75, 12);
  });

  it("shoelace agrees with geometry.signedArea's sign convention", () => {
    expect(shoelace(rect(0, 0, 1, 1))).toBeGreaterThan(0);
    expect(shoelace([...rect(0, 0, 1, 1)].reverse())).toBeLessThan(0);
  });
});

describe("coverageOverGrid", () => {
  const grid: PixelGrid = { originX: 0, originY: 0, pixelSize: 10, width: 10, height: 10 };

  it("visits only pixels the geometry touches", () => {
    const square = rect(0, 0, 20, 20); // exactly 4 pixels
    const cov = coverageOverGrid([square], grid);
    expect(cov.length).toBe(4);
    for (const c of cov) expect(c.fraction).toBeCloseTo(1, 12);
  });

  it("assigns a stable row-major index", () => {
    const cov = coverageOverGrid([rect(0, 0, 10, 10)], grid);
    expect(cov[0]).toMatchObject({ col: 0, row: 0, index: 0 });
  });

  it("conserves area — sum(fraction) * pixelArea equals the polygon's own area", () => {
    // THE oracle-free invariant. Sliver and dropped-ring bugs in this problem space are usually
    // silent, so a thrown error is the good outcome; this check is what catches the quiet ones.
    const poly = rect(3, 7, 64, 51); // deliberately not grid-aligned
    const expected = Math.abs(shoelace(poly));
    const cov = coverageOverGrid([poly], grid);
    expect(coveredAreaM2(cov, grid.pixelSize)).toBeCloseTo(expected, 6);
  });

  it("conserves area for a shape with a hole", () => {
    const outer = rect(5, 5, 85, 85);
    const hole = [...rect(20, 20, 40, 40)].reverse();
    const expected = Math.abs(shoelace(outer) + shoelace(hole));
    const cov = coverageOverGrid([outer, hole], grid);
    expect(coveredAreaM2(cov, grid.pixelSize)).toBeCloseTo(expected, 6);
  });

  it("effective pixel count is the sum of fractions, not the pixel tally", () => {
    const half = rect(0, 0, 5, 10); // half of pixel (0,0)
    const cov = coverageOverGrid([half], grid);
    expect(cov.length).toBe(1);
    expect(effectivePixelCount(cov)).toBeCloseTo(0.5, 12);
  });

  it("clips candidate pixels to the grid rather than running off the edge", () => {
    const overhanging = rect(-50, -50, 30, 30);
    const cov = coverageOverGrid([overhanging], grid);
    for (const c of cov) {
      expect(c.col).toBeGreaterThanOrEqual(0);
      expect(c.row).toBeGreaterThanOrEqual(0);
      expect(c.col).toBeLessThan(grid.width);
      expect(c.row).toBeLessThan(grid.height);
    }
  });
});

describe("no double-counting across sibling blocks sharing a boundary", () => {
  it("two blocks split at a shared edge sum to the parent's coverage, never above 1", () => {
    const grid: PixelGrid = { originX: 0, originY: 0, pixelSize: 10, width: 10, height: 10 };
    // parent spans x in [5,35]; split at x=17 with BYTE-IDENTICAL shared coordinates
    const SPLIT = 17;
    const parent = rect(5, 5, 35, 35);
    const west = rect(5, 5, SPLIT, 35);
    const east = rect(SPLIT, 5, 35, 35);

    const parentCov = coverageOverGrid([parent], grid);
    const westCov = coverageOverGrid([west], grid);
    const eastCov = coverageOverGrid([east], grid);

    const byIndex = new Map<number, number>();
    for (const c of [...westCov, ...eastCov]) byIndex.set(c.index, (byIndex.get(c.index) ?? 0) + c.fraction);

    // no pixel is over-counted
    for (const v of byIndex.values()) expect(v).toBeLessThanOrEqual(1 + 1e-9);

    // and the children reconcile with the parent, pixel by pixel
    for (const p of parentCov) {
      expect(byIndex.get(p.index) ?? 0).toBeCloseTo(p.fraction, 9);
    }

    // and in total area
    expect(coveredAreaM2(westCov, 10) + coveredAreaM2(eastCov, 10)).toBeCloseTo(
      coveredAreaM2(parentCov, 10),
      6,
    );
  });
});
