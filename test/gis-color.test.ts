import { describe, it, expect } from "vitest";
import {
  percentileDomain,
  fixedDomain,
  lockedDomain,
  normalize,
  colorAt,
  colorAtNormalized,
  legendStops,
  reversePalette,
  VIGOR_CLASSIC,
  PURPLE_GREEN,
  COLOR_VISION_SAFE,
  PALETTES,
} from "@/lib/gis/color";
import {
  resampleNearest,
  resampleBilinear,
  focalMedian3x3,
  type Grid,
} from "@/lib/gis/smooth";
import { NO_DATA, isNoData } from "@/lib/gis/ndvi";
import type { WeightedSample } from "@/lib/gis/zonal";

const s = (value: number, weight = 1): WeightedSample => ({ value, weight });
const grid = (w: number, h: number, vals: number[]): Grid => ({ width: w, height: h, values: Float64Array.from(vals) });

describe("percentileDomain", () => {
  it("uses robust percentiles so outliers cannot flatten the ramp", () => {
    // 100 values 0..1 plus one wild outlier; p5-p95 must ignore the outlier
    const vals = Array.from({ length: 100 }, (_, i) => s(i / 99));
    const withOutlier = [...vals, s(1000)];
    const d = percentileDomain(withOutlier);
    expect(d.max).toBeLessThan(2);
  });

  it("min/max would NOT have survived that outlier — which is why percentiles are the default", () => {
    const vals = [...Array.from({ length: 100 }, (_, i) => s(i / 99)), s(1000)];
    const rawMax = Math.max(...vals.map((v) => v.value));
    expect(rawMax).toBe(1000);
    expect(percentileDomain(vals).max).toBeLessThan(rawMax / 100);
  });

  it("defaults to p5-p95 and records them", () => {
    const d = percentileDomain([s(0), s(0.5), s(1)]);
    expect(d.percentileLow).toBe(0.05);
    expect(d.percentileHigh).toBe(0.95);
    expect(d.mode).toBe("VINEYARD_SCENE");
  });

  it("widens a constant field instead of dividing by zero, and says it is degenerate", () => {
    const d = percentileDomain([s(0.7), s(0.7), s(0.7)]);
    expect(d.max).toBeGreaterThan(d.min);
    expect(d.degenerate).toBe(true);
    expect(Number.isFinite(normalize(0.7, d))).toBe(true);
  });

  it("flags a narrow domain — the relative-ramp trap from brief §6.4", () => {
    // a uniformly weak vineyard: a relative ramp would paint dramatic colour across nothing
    const uniform = Array.from({ length: 50 }, (_, i) => s(0.30 + i * 0.0002));
    expect(percentileDomain(uniform).narrow).toBe(true);

    const spread = Array.from({ length: 50 }, (_, i) => s(0.2 + i * 0.012));
    expect(percentileDomain(spread).narrow).toBe(false);
  });

  it("survives an empty sample set without throwing", () => {
    const d = percentileDomain([]);
    expect(d.degenerate).toBe(true);
    expect(d.max).toBeGreaterThan(d.min);
  });

  it("respects coverage weighting, so legend and statistics cannot disagree", () => {
    const heavyLow = [s(0.2, 100), s(0.9, 1)];
    const heavyHigh = [s(0.2, 1), s(0.9, 100)];
    expect(percentileDomain(heavyLow).max).toBeLessThan(percentileDomain(heavyHigh).max);
  });
});

describe("domain modes", () => {
  it("fixedDomain orders its bounds and never has zero width", () => {
    expect(fixedDomain(1, 0, "ABSOLUTE").min).toBe(0);
    expect(fixedDomain(0.5, 0.5, "ABSOLUTE").max).toBeGreaterThan(0.5);
  });

  it("lockedDomain spans every scene, which is what stops comparison drift", () => {
    const a = fixedDomain(0.2, 0.6, "VINEYARD_SCENE");
    const b = fixedDomain(0.4, 0.9, "VINEYARD_SCENE");
    const locked = lockedDomain([a, b]);
    expect(locked.min).toBe(0.2);
    expect(locked.max).toBe(0.9);
    expect(locked.mode).toBe("COMPARISON_LOCKED");
  });

  it("a value renders identically across dates under a locked domain", () => {
    const locked = lockedDomain([fixedDomain(0.2, 0.6, "VINEYARD_SCENE"), fixedDomain(0.4, 0.9, "VINEYARD_SCENE")]);
    expect(colorAt(0.5, locked, VIGOR_CLASSIC)).toEqual(colorAt(0.5, locked, VIGOR_CLASSIC));
    // whereas independent domains would paint the SAME value differently — the drift we prevent
    const indepA = colorAt(0.5, fixedDomain(0.2, 0.6, "VINEYARD_SCENE"), VIGOR_CLASSIC);
    const indepB = colorAt(0.5, fixedDomain(0.4, 0.9, "VINEYARD_SCENE"), VIGOR_CLASSIC);
    expect(indepA).not.toEqual(indepB);
  });
});

describe("normalize", () => {
  it("clamps below the low endpoint and above the high one (brief §6.1)", () => {
    const d = fixedDomain(0.2, 0.8, "ABSOLUTE");
    expect(normalize(0.0, d)).toBe(0);
    expect(normalize(1.0, d)).toBe(1);
    expect(normalize(0.5, d)).toBeCloseTo(0.5, 12);
  });
});

describe("palettes", () => {
  it("every palette runs end to end and returns valid RGB", () => {
    for (const p of PALETTES) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const c = colorAtNormalized(t, p);
        expect(c).toHaveLength(3);
        for (const ch of c) {
          expect(ch).toBeGreaterThanOrEqual(0);
          expect(ch).toBeLessThanOrEqual(255);
          expect(Number.isInteger(ch)).toBe(true);
        }
      }
    }
  });

  it("ships a colour-vision-safe option, since both vigour ramps use the red-green axis", () => {
    expect(COLOR_VISION_SAFE.colorVisionSafe).toBe(true);
    expect(VIGOR_CLASSIC.colorVisionSafe).toBe(false);
    expect(PURPLE_GREEN.colorVisionSafe).toBe(false);
    expect(PALETTES.some((p) => p.colorVisionSafe)).toBe(true);
  });

  it("interpolates between stops rather than stepping", () => {
    const mid = colorAtNormalized(0.125, VIGOR_CLASSIC);
    const a = colorAtNormalized(0, VIGOR_CLASSIC);
    const b = colorAtNormalized(0.25, VIGOR_CLASSIC);
    expect(mid).not.toEqual(a);
    expect(mid).not.toEqual(b);
  });

  it("reversing swaps the ends and is its own inverse", () => {
    const r = reversePalette(VIGOR_CLASSIC);
    expect(colorAtNormalized(0, r)).toEqual(colorAtNormalized(1, VIGOR_CLASSIC));
    expect(colorAtNormalized(1, r)).toEqual(colorAtNormalized(0, VIGOR_CLASSIC));
    expect(colorAtNormalized(0, reversePalette(r))).toEqual(colorAtNormalized(0, VIGOR_CLASSIC));
  });

  it("clamps out-of-range positions to the end colours", () => {
    expect(colorAtNormalized(-5, VIGOR_CLASSIC)).toEqual(colorAtNormalized(0, VIGOR_CLASSIC));
    expect(colorAtNormalized(5, VIGOR_CLASSIC)).toEqual(colorAtNormalized(1, VIGOR_CLASSIC));
  });
});

describe("legendStops", () => {
  it("always carries numbers, spanning the domain", () => {
    const d = fixedDomain(0.2, 0.8, "ABSOLUTE");
    const stops = legendStops(d, VIGOR_CLASSIC, 5);
    expect(stops).toHaveLength(5);
    expect(stops[0].value).toBeCloseTo(0.2, 12);
    expect(stops[4].value).toBeCloseTo(0.8, 12);
    for (const st of stops) expect(st.color).toHaveLength(3);
  });
});

describe("display resampling — appearance only, never statistics", () => {
  const src = grid(2, 2, [0, 1, 2, 3]);

  it("nearest preserves the source pixel values exactly", () => {
    const out = resampleNearest(src, 4, 4);
    const unique = new Set(Array.from(out.values));
    expect([...unique].sort()).toEqual([0, 1, 2, 3]);
  });

  it("bilinear produces intermediate values that nearest does not", () => {
    const out = resampleBilinear(src, 8, 8);
    const vals = Array.from(out.values);
    expect(vals.some((v) => v > 0 && v < 1)).toBe(true);
  });

  it("upsampling changes pixel COUNT but not the value range — no new information", () => {
    const out = resampleBilinear(src, 16, 16);
    expect(out.values.length).toBe(256);
    expect(Math.min(...out.values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...out.values)).toBeLessThanOrEqual(3);
  });

  it("bilinear refuses to interpolate across no-data instead of inventing a plausible value", () => {
    const withGap = grid(2, 2, [0, NO_DATA, 2, 3]);
    const out = resampleBilinear(withGap, 8, 8);
    expect(Array.from(out.values).some((v) => isNoData(v))).toBe(true);
  });

  it("nearest carries no-data through untouched", () => {
    const withGap = grid(2, 2, [0, NO_DATA, 2, 3]);
    const out = resampleNearest(withGap, 4, 4);
    expect(Array.from(out.values).some((v) => isNoData(v))).toBe(true);
  });
});

describe("focalMedian3x3 — the analytical derivative", () => {
  it("removes a salt-and-pepper spike without moving its neighbours", () => {
    const noisy = grid(5, 5, [
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 99, 1, 1,
      1, 1, 1, 1, 1,
      1, 1, 1, 1, 1,
    ]);
    const out = focalMedian3x3(noisy).grid;
    expect(out.values[12]).toBe(1);
  });

  it("does NOT mask raster corners, where fewer neighbours exist but all are real", () => {
    // the bug this pins: an absolute min-neighbour count masked every corner of every scene.
    // A corner has 4 in-bounds positions; 4 real out of 4 possible is full information.
    const flat = grid(4, 4, new Array(16).fill(0.7));
    const out = focalMedian3x3(flat).grid;
    expect(isNoData(out.values[0])).toBe(false);
    expect(isNoData(out.values[15])).toBe(false);
  });

  it("is the identity on a constant field", () => {
    const flat = grid(4, 4, new Array(16).fill(0.7));
    const out = focalMedian3x3(flat).grid;
    for (const v of out.values) expect(v).toBeCloseTo(0.7, 12);
  });

  it("preserves a genuine edge rather than blurring it — median, not mean", () => {
    const edge = grid(4, 4, [
      0, 0, 1, 1,
      0, 0, 1, 1,
      0, 0, 1, 1,
      0, 0, 1, 1,
    ]);
    const out = focalMedian3x3(edge).grid;
    // the boundary columns stay at their own side's value, not an average of 0.5
    expect(out.values[4]).toBe(0);
    expect(out.values[6]).toBe(1);
  });

  it("leaves no-data as no-data", () => {
    const withGap = grid(3, 3, [1, 1, 1, 1, NO_DATA, 1, 1, 1, 1]);
    expect(isNoData(focalMedian3x3(withGap).grid.values[4])).toBe(true);
  });

  it("refuses to smooth where too few real neighbours exist — the edge-aware mask", () => {
    // an isolated real pixel surrounded by no-data must NOT be given a synthesised value
    const lonely = grid(3, 3, [
      NO_DATA, NO_DATA, NO_DATA,
      NO_DATA, 0.5, NO_DATA,
      NO_DATA, NO_DATA, NO_DATA,
    ]);
    expect(isNoData(focalMedian3x3(lonely).grid.values[4])).toBe(true);
  });

  it("records method, kernel and SOURCE resolution so it can never be labelled higher-resolution", () => {
    const r = focalMedian3x3(grid(3, 3, new Array(9).fill(1)));
    expect(r.method).toBe("median");
    expect(r.kernel).toBe("3x3");
    expect(r.sourceResolutionM).toBe(10);
    expect(r.minValidFraction).toBeCloseTo(5 / 9, 12);
  });
});
