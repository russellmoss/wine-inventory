import { describe, it, expect } from "vitest";
import { computeBlockMetricsCore, MIN_VALID_FRACTION, QUALITY_FLAG, type SceneGeotransform } from "@/lib/spatial/block-metrics-core";
import { createProjectorFromAnchor } from "@/lib/gis/projection";
import { NO_DATA } from "@/lib/gis/ndvi";
import type { VineyardPolygon } from "@/lib/gis/geometry";

/**
 * Unit 5 over a synthetic 4×4 raster with a KNOWN north→south NDVI gradient, so the load-bearing y-flip
 * (a north-up GeoTIFF has row 0 at the NORTH; PixelGrid is y-up) is proven by value, not asserted by faith.
 * Blocks are built by projecting UTM grid-cell corners BACK to WGS84 (createProjectorFromAnchor.inverse),
 * so each maps to exactly the intended pixel.
 */
const W = 4;
const H = 4;
const PIX = 10;
const EPSG = 32617;
const ABS_ORIGIN_X = 700_000;
const ABS_BOTTOM_Y = 4_200_000; // lower-left corner; top edge = +H·PIX
const GT: SceneGeotransform = {
  originX: ABS_ORIGIN_X,
  originY: ABS_BOTTOM_Y + H * PIX, // TOP edge (north-up)
  pixelSizeM: PIX,
  axisYSign: -1,
  crsEpsg: EPSG,
  width: W,
  height: H,
};

// Recover the SAME frame the core uses, to build blocks by inverse-projection.
const projector = createProjectorFromAnchor({ epsg: `EPSG:${EPSG}`, originX: ABS_ORIGIN_X, originY: ABS_BOTTOM_Y });
/** WGS84 polygon for the local-frame rectangle [x0,x1]×[y0,y1] (metres from the grid's lower-left). */
const rectPoly = (x0: number, y0: number, x1: number, y1: number): VineyardPolygon => ({
  type: "Polygon",
  coordinates: [[projector.inverse([x0, y0]), projector.inverse([x1, y0]), projector.inverse([x1, y1]), projector.inverse([x0, y1]), projector.inverse([x0, y0])]],
});
/** The WGS84 polygon covering grid cell (col, rowGrid) — rowGrid 0 = SOUTH. */
const cellPoly = (col: number, rowGrid: number): VineyardPolygon => rectPoly(col * PIX, rowGrid * PIX, (col + 1) * PIX, (rowGrid + 1) * PIX);

// NDVI raster in FILE order (row 0 = NORTH). Distinct value per raster row → a flip error is visible.
// raster row 0 (north)=0.9, 1=0.7, 2=0.5, 3 (south)=0.3.
const gradient = () => {
  const v = new Float64Array(W * H);
  const perRow = [0.9, 0.7, 0.5, 0.3];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) v[r * W + c] = perRow[r];
  return v;
};
const planting = { id: "pa", geometry: rectPoly(0, 0, W * PIX, H * PIX) }; // covers the whole grid

describe("computeBlockMetricsCore — orientation + clipping", () => {
  it("reads the NORTH block as 0.9 and the SOUTH block as 0.3 (the y-flip is correct)", () => {
    const ndvi = { values: gradient(), width: W, height: H };
    const blocks = [
      { id: "north", geometry: cellPoly(0, H - 1), geometryVersion: 1, geometryFingerprint: "fp-n" }, // top row
      { id: "south", geometry: cellPoly(0, 0), geometryVersion: 1, geometryFingerprint: "fp-s" }, // bottom row
    ];
    const res = computeBlockMetricsCore({ ndvi, geotransform: GT, planting, blocks });
    expect(res.refused).toBe(false);
    if (res.refused) return;
    const north = res.metrics.find((m) => m.blockId === "north")!;
    const south = res.metrics.find((m) => m.blockId === "south")!;
    expect(north.mean).toBeCloseTo(0.9, 6);
    expect(south.mean).toBeCloseTo(0.3, 6);
    // One fully-covered pixel each → effectivePixelCount ≈ 1, coveredArea ≈ 100 m².
    expect(north.effectivePixelCount).toBeCloseTo(1, 3);
    expect(north.coveredAreaM2).toBeCloseTo(100, 0);
    expect(north.intersectingPixelCount).toBe(1);
    expect(north.qualityFlags).toEqual([]);
  });

  it("stamps each metric with the block's geometryVersion + fingerprint (immutable snapshot)", () => {
    const ndvi = { values: gradient(), width: W, height: H };
    const blocks = [{ id: "b", geometry: cellPoly(1, 2), geometryVersion: 7, geometryFingerprint: "fp-v7" }];
    const res = computeBlockMetricsCore({ ndvi, geotransform: GT, planting, blocks });
    if (res.refused) throw new Error("unexpected refusal");
    expect(res.metrics[0].geometryVersion).toBe(7);
    expect(res.metrics[0].geometryFingerprint).toBe("fp-v7");
  });

  it("a coverage-weighted mean over a 2×1 block averages both pixels", () => {
    const ndvi = { values: gradient(), width: W, height: H };
    // A block spanning the top TWO rows in column 0 → raster rows 0 (0.9) and 1 (0.7) → mean 0.8.
    const blocks = [{ id: "twohigh", geometry: rectPoly(0, (H - 2) * PIX, PIX, H * PIX), geometryVersion: 1, geometryFingerprint: "fp" }];
    const res = computeBlockMetricsCore({ ndvi, geotransform: GT, planting, blocks });
    if (res.refused) throw new Error("unexpected refusal");
    expect(res.metrics[0].mean).toBeCloseTo(0.8, 6);
    expect(res.metrics[0].intersectingPixelCount).toBe(2);
    expect(res.metrics[0].effectivePixelCount).toBeCloseTo(2, 3);
  });
});

describe("computeBlockMetricsCore — mask gate + validity floor", () => {
  it("REFUSES a MASK_BREAKING mask (sibling overlap) and writes no metrics", () => {
    const ndvi = { values: gradient(), width: W, height: H };
    const blocks = [
      { id: "a", geometry: rectPoly(0, 0, 20, 20), geometryVersion: 1, geometryFingerprint: "fa" },
      { id: "b", geometry: rectPoly(10, 10, 30, 30), geometryVersion: 1, geometryFingerprint: "fb" }, // overlaps a
    ];
    const res = computeBlockMetricsCore({ ndvi, geotransform: GT, planting, blocks });
    expect(res.refused).toBe(true);
    if (!res.refused) return;
    expect(res.reason).toBe("mask-breaking");
    expect(res.findings.some((f) => f.code === "SIBLING_OVERLAP")).toBe(true);
  });

  it("nulls summary stats + flags INSUFFICIENT_VALID_COVERAGE below the 0.5 floor, keeping counts", () => {
    // A 2×2 block over cells where only ONE of four pixels is valid → validFraction 0.25 < 0.5.
    const v = new Float64Array(W * H).fill(NO_DATA);
    // Make exactly one of the four covered raster pixels valid. The block covers grid cols 0-1, rows 0-1
    // → raster rows 2-3, cols 0-1 → raster indices (2·4+0),(2·4+1),(3·4+0),(3·4+1). Set one valid.
    v[2 * W + 0] = 0.42;
    const ndvi = { values: v, width: W, height: H };
    const blocks = [{ id: "sparse", geometry: rectPoly(0, 0, 20, 20), geometryVersion: 1, geometryFingerprint: "fp" }];
    const res = computeBlockMetricsCore({ ndvi, geotransform: GT, planting, blocks });
    if (res.refused) throw new Error("unexpected refusal");
    const m = res.metrics[0];
    expect(m.mean).toBeNull();
    expect(m.median).toBeNull();
    expect(m.max).toBeNull();
    expect(m.qualityFlags).toContain(QUALITY_FLAG.INSUFFICIENT_VALID_COVERAGE);
    // Counts + coverage are still recorded.
    expect(m.intersectingPixelCount).toBe(4);
    expect(m.validPixelCount).toBe(1);
    expect(m.validFraction).toBeCloseTo(0.25, 6);
    expect(m.coveredAreaM2).toBeGreaterThan(0);
  });

  it("MIN_VALID_FRACTION is 0.5 (council Q3)", () => {
    expect(MIN_VALID_FRACTION).toBe(0.5);
  });
});
