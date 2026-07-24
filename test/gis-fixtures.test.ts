import { describe, it, expect } from "vitest";
import { coverageOverGrid, coveredAreaM2, shoelace, pixelCoverageFraction } from "@/lib/gis/coverage";
import { validateVineyardPolygon } from "@/lib/gis/geometry";
import {
  GRID,
  GRID_HALF_PIXEL_OFFSET,
  KNOWN_COVERAGE_PLANTING,
  KNOWN_COVERAGE_EXPECTATIONS,
  KNOWN_COVERAGE_AREA_M2,
  BLOCK_WEST,
  BLOCK_EAST,
  BLOCK_WEST_AREA_M2,
  BLOCK_EAST_AREA_M2,
  PLANTING_WITH_HOLE_SHELL,
  PLANTING_WITH_HOLE_HOLE,
  PLANTING_WITH_HOLE_AREA_M2,
  U_SHAPE_BLOCK,
  U_SHAPE_PIXEL_00_FRACTION,
  NARROW_BLOCK,
  NARROW_BLOCK_AREA_M2,
  DISCONNECTED_A,
  DISCONNECTED_B,
  DISCONNECTED_TOTAL_AREA_M2,
  highVertexBlock,
  DEGENERATE_CASES,
  TANGENT_HOLE_SHELL,
  TANGENT_HOLE_HOLE,
  TANGENT_HOLE_AREA_M2,
} from "./fixtures/gis/plantings";
import { makeFixtureScene, NDVI_SAMPLES, SCL, at, BASELINE_TRAP } from "./fixtures/gis/rasters";

describe("the known-coverage planting hits its analytic fractions", () => {
  const cov = coverageOverGrid([KNOWN_COVERAGE_PLANTING], GRID);
  const byKey = new Map(cov.map((c) => [`${c.col},${c.row}`, c.fraction]));

  for (const [col, row, expected] of KNOWN_COVERAGE_EXPECTATIONS) {
    it(`pixel (${col},${row}) is exactly ${expected}`, () => {
      expect(byKey.get(`${col},${row}`) ?? 0).toBeCloseTo(expected, 12);
    });
  }

  it("total covered area equals the polygon's own area", () => {
    expect(coveredAreaM2(cov, GRID.pixelSize)).toBeCloseTo(KNOWN_COVERAGE_AREA_M2, 6);
    expect(Math.abs(shoelace(KNOWN_COVERAGE_PLANTING))).toBeCloseTo(KNOWN_COVERAGE_AREA_M2, 6);
  });
});

describe("the two blocks share a byte-identical boundary", () => {
  it("the split coordinates are literally the same values in both rings", () => {
    const westSplit = BLOCK_WEST.filter(([x]) => x === 20);
    const eastSplit = BLOCK_EAST.filter(([x]) => x === 20);
    expect(westSplit.length).toBeGreaterThanOrEqual(2);
    expect(eastSplit.length).toBeGreaterThanOrEqual(2);
    // identity, not proximity — the whole point of the fixture
    for (const w of westSplit) {
      expect(eastSplit.some(([x, y]) => x === w[0] && y === w[1])).toBe(true);
    }
  });

  it("the two blocks' areas sum to the parent planting's", () => {
    expect(BLOCK_WEST_AREA_M2 + BLOCK_EAST_AREA_M2).toBe(KNOWN_COVERAGE_AREA_M2);
    expect(Math.abs(shoelace(BLOCK_WEST))).toBeCloseTo(BLOCK_WEST_AREA_M2, 6);
    expect(Math.abs(shoelace(BLOCK_EAST))).toBeCloseTo(BLOCK_EAST_AREA_M2, 6);
  });

  it("no pixel is double-counted, and the children reconcile with the parent", () => {
    const parent = coverageOverGrid([KNOWN_COVERAGE_PLANTING], GRID);
    const west = coverageOverGrid([BLOCK_WEST], GRID);
    const east = coverageOverGrid([BLOCK_EAST], GRID);

    const summed = new Map<number, number>();
    for (const c of [...west, ...east]) summed.set(c.index, (summed.get(c.index) ?? 0) + c.fraction);

    for (const v of summed.values()) expect(v).toBeLessThanOrEqual(1 + 1e-9);
    for (const p of parent) expect(summed.get(p.index) ?? 0).toBeCloseTo(p.fraction, 9);
    expect(coveredAreaM2(west, 10) + coveredAreaM2(east, 10)).toBeCloseTo(coveredAreaM2(parent, 10), 6);
  });
});

describe("other geometry fixtures carry the area they claim", () => {
  it("the hole subtracts", () => {
    const cov = coverageOverGrid([PLANTING_WITH_HOLE_SHELL, PLANTING_WITH_HOLE_HOLE], GRID);
    expect(coveredAreaM2(cov, GRID.pixelSize)).toBeCloseTo(PLANTING_WITH_HOLE_AREA_M2, 6);
  });

  it("the U-shape covers exactly its two-component area in pixel (0,0)", () => {
    expect(pixelCoverageFraction([U_SHAPE_BLOCK], 0, 0, 10, 10)).toBeCloseTo(U_SHAPE_PIXEL_00_FRACTION, 12);
  });

  it("the narrow block is dominated by partial pixels", () => {
    const cov = coverageOverGrid([NARROW_BLOCK], GRID);
    expect(coveredAreaM2(cov, GRID.pixelSize)).toBeCloseTo(NARROW_BLOCK_AREA_M2, 6);
    // every touched pixel is partial: this is the mixed-pixel warning case from brief §2.4
    expect(cov.every((c) => c.fraction < 1)).toBe(true);
    expect(cov.length).toBeGreaterThan(10);
  });

  it("the two disconnected plantings sum without interacting", () => {
    const cov = coverageOverGrid([DISCONNECTED_A, DISCONNECTED_B], GRID);
    expect(coveredAreaM2(cov, GRID.pixelSize)).toBeCloseTo(DISCONNECTED_TOTAL_AREA_M2, 6);
  });

  it("the high-vertex block is small in area but large in vertex count", () => {
    const ring = highVertexBlock(2000);
    expect(ring.length).toBe(2000);
    const area = Math.abs(shoelace(ring));
    // ~pi * 40^2 with a small wobble: a ~0.5 ha block carrying 2000 vertices
    expect(area).toBeGreaterThan(4_500);
    expect(area).toBeLessThan(5_500);
    const cov = coverageOverGrid([ring], GRID);
    expect(coveredAreaM2(cov, GRID.pixelSize)).toBeCloseTo(area, 3);
  });
});

describe("the half-pixel-offset grid is genuinely different", () => {
  it("shifts coverage, so a geotransform error cannot pass unnoticed", () => {
    const aligned = coverageOverGrid([KNOWN_COVERAGE_PLANTING], GRID);
    const offset = coverageOverGrid([KNOWN_COVERAGE_PLANTING], GRID_HALF_PIXEL_OFFSET);
    const key = (c: { col: number; row: number }) => `${c.col},${c.row}`;
    const a = new Map(aligned.map((c) => [key(c), c.fraction]));
    const b = new Map(offset.map((c) => [key(c), c.fraction]));
    let differing = 0;
    for (const [k, v] of a) if (Math.abs((b.get(k) ?? 0) - v) > 1e-9) differing++;
    expect(differing).toBeGreaterThan(0);
  });

  it("but still conserves total area — the error is positional, not a leak", () => {
    const offset = coverageOverGrid([KNOWN_COVERAGE_PLANTING], GRID_HALF_PIXEL_OFFSET);
    expect(coveredAreaM2(offset, GRID.pixelSize)).toBeCloseTo(KNOWN_COVERAGE_AREA_M2, 6);
  });
});

describe("every degenerate fixture is refused with the documented reason", () => {
  for (const c of DEGENERATE_CASES) {
    it(`${c.name} -> ${c.expected}`, () => {
      const res = validateVineyardPolygon(c.geometry);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe(c.expected);
    });
  }

  it("documents WHY each one is refused, not just that it is", () => {
    for (const c of DEGENERATE_CASES) expect(c.why.length).toBeGreaterThan(30);
  });
});

describe("accepted edge case — a hole tangent to its shell", () => {
  it("is ACCEPTED, because the coverage math handles it correctly", () => {
    // Not OGC-simple (an interior ring may touch the exterior at a point, not along a line), but
    // rings are clipped independently and their signed areas summed, so shell-minus-hole stays
    // exact. Refusing it would mean tightening the validator against an assumption rather than a
    // failure. Documented as the defined behaviour instead.
    const geom = {
      type: "Polygon" as const,
      coordinates: [
        [...TANGENT_HOLE_SHELL, TANGENT_HOLE_SHELL[0]].map(([x, y]) => [x, y]),
        [...TANGENT_HOLE_HOLE, TANGENT_HOLE_HOLE[0]].map(([x, y]) => [x, y]),
      ],
    };
    expect(validateVineyardPolygon(geom).ok).toBe(true);
  });

  it("and measures the right area — shell minus hole, exactly", () => {
    const cov = coverageOverGrid([TANGENT_HOLE_SHELL, TANGENT_HOLE_HOLE], GRID);
    expect(coveredAreaM2(cov, GRID.pixelSize)).toBeCloseTo(TANGENT_HOLE_AREA_M2, 6);
  });
});

describe("the raster fixture scene", () => {
  const scene = makeFixtureScene();

  it("has the declared dimensions and one value per band per pixel", () => {
    expect(scene.width * scene.height).toBe(400);
    expect(scene.red.length).toBe(400);
    expect(scene.nir.length).toBe(400);
    expect(scene.scl.length).toBe(400);
  });

  it("carries exact-decimal NDVI inputs so expectations are arithmetic, not recorded output", () => {
    for (const s of Object.values(NDVI_SAMPLES)) {
      expect((s.nir - s.red) / (s.nir + s.red)).toBeCloseTo(s.ndvi, 12);
    }
  });

  it("puts vigorous canopy in the top rows and bare soil lower down", () => {
    expect(scene.red[at(scene, 5, 0)]).toBeCloseTo(NDVI_SAMPLES.vigorous.red, 6);
    expect(scene.red[at(scene, 5, 12)]).toBeCloseTo(NDVI_SAMPLES.moderate.red, 6);
    expect(scene.red[at(scene, 5, 16)]).toBeCloseTo(NDVI_SAMPLES.soil.red, 6);
  });

  it("includes cloud, shadow and cirrus that are plausible in value but unusable by class", () => {
    const row18 = Array.from({ length: scene.width }, (_, c) => scene.scl[at(scene, c, 18)]);
    expect(row18).toContain(SCL.CLOUD_HIGH);
    expect(row18).toContain(SCL.CLOUD_SHADOW);
    expect(row18).toContain(SCL.CIRRUS);
    // the trap: the reflectance looks fine, only SCL says otherwise
    expect(scene.red[at(scene, 0, 18)]).toBeGreaterThan(0);
  });

  it("includes a no-data row", () => {
    expect(scene.scl[at(scene, 0, 19)]).toBe(SCL.NO_DATA);
  });

  it("includes negative reflectance, which harmonizeValues:false must preserve", () => {
    expect(scene.red[0]).toBeLessThan(0);
  });
});

describe("the baseline-04.00 trap fixture", () => {
  it("reproduces the documented error magnitudes", () => {
    const vigorous = BASELINE_TRAP[0];
    expect(vigorous.trueNdvi - vigorous.unharmonizedNdvi).toBeCloseTo(0.257, 3);
  });

  it("is largest at high vigour and smallest on bare soil — so it cannot be calibrated out", () => {
    const errors = BASELINE_TRAP.map((b) => b.trueNdvi - b.unharmonizedNdvi);
    expect(errors[0]).toBeGreaterThan(errors[2]);
    // not a constant offset: that is precisely why it must be fixed at read time
    expect(Math.abs(errors[0] - errors[2])).toBeGreaterThan(0.15);
  });
});
