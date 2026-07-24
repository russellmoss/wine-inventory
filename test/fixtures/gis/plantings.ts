/**
 * P0 Unit 4 — deterministic geometry fixtures.
 *
 * Synthesized in TypeScript rather than committed as binaries: diffable, no `.gitattributes`
 * questions, and it matches the repo's inline-golden convention (goldens here are hand-written `.ts`
 * modules, never `toMatchSnapshot()`).
 *
 * Every fixture carries its ANALYTICALLY-expected value as data, so tests assert against arithmetic
 * we can do on paper rather than against whatever the code happened to emit on its first run. A
 * golden that merely records previous output proves nothing, and correctness is this phase's entire
 * purpose.
 *
 * Coordinates are in RECENTRED PROJECTED METRES — the space the clipper actually works in
 * (`projection.ts`). The grid below is 10 m to match Sentinel-2's native B04/B08 resolution.
 */
import type { Pt, PixelGrid } from "@/lib/gis/coverage";
import type { RejectionCode } from "@/lib/gis/geometry";

/** 20 x 20 pixels of 10 m — a 200 m square, the scale of a small block. */
export const GRID: PixelGrid = {
  originX: 0,
  originY: 0,
  pixelSize: 10,
  width: 20,
  height: 20,
};

/**
 * The same grid shifted by half a pixel.
 *
 * Research named pixel-corner vs pixel-centre geotransform confusion as THE realistic failure in
 * this problem space: it shows up as a large, systematic, EDGE-ONLY disagreement against the oracle,
 * not as a tolerance question. Detecting it is a fixture, not a hope.
 */
export const GRID_HALF_PIXEL_OFFSET: PixelGrid = {
  ...GRID,
  // shifted NEGATIVELY so the grid still fully contains the fixtures. A positive shift would move
  // the grid off the geometry and lose area to legitimate edge clipping, which would mask the
  // positional error this fixture exists to expose rather than reveal it.
  originX: GRID.originX - GRID.pixelSize / 2,
  originY: GRID.originY - GRID.pixelSize / 2,
};

const ring = (...pts: [number, number][]): Pt[] => pts;

// ── The known-coverage planting (runbook §5) ──────────────────────────────────
//
// One continuous step-shaped planting that crosses pixels at EXACTLY 0.10, 0.25, 0.50 and 0.90.
//
//   y 20..40 : x from  5 to 39      (upper tread)
//   y  0..20 : x from  9 to 32.5    (lower tread)
//
// Pixel (col 0, row 0) sees x in [9,10]  -> 1 x 10 / 100 = 0.10
// Pixel (col 3, row 0) sees x in [30,32.5] -> 2.5 x 10 / 100 = 0.25
// Pixel (col 0, row 2) sees x in [5,10]  -> 5 x 10 / 100 = 0.50
// Pixel (col 3, row 2) sees x in [30,39] -> 9 x 10 / 100 = 0.90

export const KNOWN_COVERAGE_PLANTING: Pt[] = ring(
  [9, 0],
  [32.5, 0],
  [32.5, 20],
  [39, 20],
  [39, 40],
  [5, 40],
  [5, 20],
  [9, 20],
);

/** `[col, row, expectedFraction]` — computed by hand from the geometry above. */
export const KNOWN_COVERAGE_EXPECTATIONS: [number, number, number][] = [
  [0, 0, 0.1],
  [0, 1, 0.1],
  [3, 0, 0.25],
  [3, 1, 0.25],
  [0, 2, 0.5],
  [0, 3, 0.5],
  [3, 2, 0.9],
  [3, 3, 0.9],
  // fully interior pixels, for completeness
  [1, 0, 1],
  [2, 0, 1],
  [1, 2, 1],
  [2, 2, 1],
];

/** Exact area of the step: lower 23.5 x 20 + upper 34 x 20 = 470 + 680 = 1150 m². */
export const KNOWN_COVERAGE_AREA_M2 = 1150;

// ── The same planting split into two blocks at x = 20 ─────────────────────────
//
// The split coordinates are BYTE-IDENTICAL in both rings — (20,0) and (20,40) appear verbatim in
// each. That is the point: "shared boundary" must mean shared coordinates, not two edges that merely
// look coincident, or the no-double-count property is untested.

export const BLOCK_WEST: Pt[] = ring([9, 0], [20, 0], [20, 40], [5, 40], [5, 20], [9, 20]);
export const BLOCK_EAST: Pt[] = ring([20, 0], [32.5, 0], [32.5, 20], [39, 20], [39, 40], [20, 40]);

/** West: lower 11x20 + upper 15x20 = 220 + 300 = 520. East: 12.5x20 + 19x20 = 250 + 380 = 630. */
export const BLOCK_WEST_AREA_M2 = 520;
export const BLOCK_EAST_AREA_M2 = 630;

// ── A planting with a non-vine hole ───────────────────────────────────────────

/** 100 m square shell with a 20 m square hole: 10000 − 400 = 9600 m². */
export const PLANTING_WITH_HOLE_SHELL: Pt[] = ring([20, 20], [120, 20], [120, 120], [20, 120]);
/** Wound CLOCKWISE so its signed area subtracts. */
export const PLANTING_WITH_HOLE_HOLE: Pt[] = ring([50, 50], [50, 70], [70, 70], [70, 50]);
export const PLANTING_WITH_HOLE_AREA_M2 = 9600;

// ── A U-shape that re-enters one pixel (the ULP case) ─────────────────────────
//
// The bar sits below pixel (0,0); two prongs poke up into it. The intersection is two DISJOINT
// components, which Sutherland–Hodgman returns as one ring joined by zero-width bridges.
// Prongs: x in [1,3] and x in [7,9], each y in [0,6] -> 2 x (2 x 6) = 24 m² of a 100 m² pixel = 0.24.

export const U_SHAPE_BLOCK: Pt[] = ring(
  [1, -5],
  [9, -5],
  [9, 6],
  [7, 6],
  [7, 0],
  [3, 0],
  [3, 6],
  [1, 6],
);
export const U_SHAPE_PIXEL_00_FRACTION = 0.24;

// ── A narrow block dominated by boundary pixels (brief §2.4) ──────────────────
//
// 3 m wide by 150 m tall: every pixel it touches is a partial one, so mixed-pixel effects dominate
// and the "flag narrow blocks" warning in the brief has something to fire on.

export const NARROW_BLOCK: Pt[] = ring([48, 10], [51, 10], [51, 160], [48, 160]);
export const NARROW_BLOCK_AREA_M2 = 450;

// ── Two spatially disconnected plantings under one vineyard (brief §2.1) ──────

export const DISCONNECTED_A: Pt[] = ring([10, 10], [40, 10], [40, 40], [10, 40]);
export const DISCONNECTED_B: Pt[] = ring([120, 130], [180, 130], [180, 180], [120, 180]);
export const DISCONNECTED_TOTAL_AREA_M2 = 30 * 30 + 60 * 50; // 900 + 3000 = 3900

// ── A high-vertex block, for the Unit 14 scaling sweep ────────────────────────
//
// Small AREA, large VERTEX COUNT. This is the shape the council said actually breaks the
// architecture: Sutherland–Hodgman is O(vertices x pixels), so a 5 ha block with 20k vertices is a
// far more meaningful stressor than a 500 ha rectangle.

export function highVertexBlock(vertices: number, cx = 100, cy = 100, r = 40): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < vertices; i++) {
    const t = (2 * Math.PI * i) / vertices;
    // a gentle radial wobble so the ring is not a degenerate circle of collinear-ish points
    const rr = r * (1 + 0.02 * Math.sin(7 * t));
    out.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]);
  }
  return out;
}

// ── Degenerate geometry, each with the rejection it MUST produce ──────────────
//
// Runbook §5 requires these to pass "or their defined rejection behaviour is documented". The
// expected `RejectionCode` is carried as data so the test asserts WHICH rule fired, not merely that
// something was refused. These are WGS84 lon/lat because rejection happens at the validation
// boundary, before projection.

export type DegenerateCase = {
  readonly name: string;
  readonly geometry: { type: "Polygon"; coordinates: number[][][] };
  readonly expected: RejectionCode;
  readonly why: string;
};

const closed = (pts: number[][]): number[][] => [...pts, pts[0]];

export const DEGENERATE_CASES: DegenerateCase[] = [
  {
    name: "sliver thinner than the geometry epsilon",
    geometry: {
      type: "Polygon",
      coordinates: [closed([[0, 0], [1e-13, 0], [1e-13, 1e-13], [0, 1e-13]])],
    },
    expected: "degenerate_ring",
    why: "Encloses no representable area; keeping it would seed a phantom coverage fraction.",
  },
  {
    name: "self-touching ring (repeated vertex pinches the shape)",
    geometry: {
      type: "Polygon",
      coordinates: [closed([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2], [1, 1]])],
    },
    expected: "self_touching",
    why: "Signed area is algebraic, not geometric, for a pinched ring: the lobes cancel silently.",
  },
  {
    name: "self-intersecting bow-tie",
    geometry: {
      type: "Polygon",
      coordinates: [closed([[0, 0], [2, 2], [2, 0], [0, 2]])],
    },
    expected: "self_intersecting",
    why: "Same cancellation problem, reached by crossing edges rather than a shared vertex.",
  },
  {
    name: "hole entirely outside its shell",
    geometry: {
      type: "Polygon",
      coordinates: [closed([[0, 0], [2, 0], [2, 2], [0, 2]]), closed([[10, 10], [11, 10], [11, 11], [10, 11]])],
    },
    expected: "hole_outside_shell",
    why: "Nothing to subtract; almost always a ring-ordering bug upstream.",
  },
  {
    name: "unclosed ring",
    geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
    expected: "unclosed_ring",
    why: "GeoJSON requires explicit closure; an implicit close hides which vertex was dropped.",
  },
];

// ── Accepted edge cases: geometry that LOOKS degenerate but is measured correctly ──
//
// Runbook §5 asks for the degenerate fixtures to "pass, or their defined rejection behaviour is
// documented". These are the ones that legitimately PASS, and it is worth being explicit about why
// rather than tightening the validator to refuse something the math already handles.

/**
 * A hole sharing a full edge with its shell.
 *
 * It is not OGC-simple (an interior ring may touch the exterior at a point, not along a line), but
 * the coverage math is indifferent: rings are clipped INDEPENDENTLY and their signed areas summed,
 * so shell-minus-hole is still exact. Rejecting it would be tightening the validator to satisfy an
 * assumption rather than a failure, so it is accepted and pinned here with its expected area.
 *
 * Shell 40 x 40 = 1600, hole 20 x 20 = 400  ->  1200 m².
 */
export const TANGENT_HOLE_SHELL: Pt[] = ring([0, 0], [40, 0], [40, 40], [0, 40]);
/** Clockwise, and its right edge lies exactly on the shell's right edge at x = 40. */
export const TANGENT_HOLE_HOLE: Pt[] = ring([20, 10], [20, 30], [40, 30], [40, 10]);
export const TANGENT_HOLE_AREA_M2 = 1200;
