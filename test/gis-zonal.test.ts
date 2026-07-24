import { describe, it, expect } from "vitest";
import {
  zonalStats,
  weightedQuantile,
  coverageHistogram,
  withMinimumCoverage,
  type WeightedSample,
} from "@/lib/gis/zonal";
import { coverageOverGrid } from "@/lib/gis/coverage";
import { GRID, KNOWN_COVERAGE_PLANTING, BLOCK_WEST, BLOCK_EAST } from "./fixtures/gis/plantings";

const s = (value: number, weight = 1): WeightedSample => ({ value, weight });
const opts = (intersecting: number) => ({ intersectingPixelCount: intersecting, pixelAreaM2: 100 });

describe("weightedQuantile — the pinned midpoint estimator", () => {
  // Midpoint plotting positions on 5 equal-weight values: p_i = (i+0.5)/5 = .1 .3 .5 .7 .9
  const equal = [1, 2, 3, 4, 5].map((v) => s(v));

  it("median of an odd equal-weight set is the middle value", () => {
    expect(weightedQuantile(equal, 0.5)).toBeCloseTo(3, 12);
  });

  it("p25/p75 follow the midpoint positions, NOT type-7", () => {
    // documented deviation: type-7 would give 2 and 4. Midpoint interpolates from (i+0.5)/n.
    expect(weightedQuantile(equal, 0.25)).toBeCloseTo(1.75, 12);
    expect(weightedQuantile(equal, 0.75)).toBeCloseTo(4.25, 12);
  });

  it("interpolates linearly between bracketing positions", () => {
    // [10,20] equal weights: p = [0.25, 0.75]; q=0.5 sits halfway -> 15
    expect(weightedQuantile([s(10), s(20)], 0.5)).toBeCloseTo(15, 12);
  });

  it("clamps outside the range rather than extrapolating", () => {
    expect(weightedQuantile(equal, 0)).toBe(1);
    expect(weightedQuantile(equal, 1)).toBe(5);
    expect(weightedQuantile(equal, -5)).toBe(1);
    expect(weightedQuantile(equal, 5)).toBe(5);
  });

  it("a single sample is its own every quantile", () => {
    expect(weightedQuantile([s(42, 0.13)], 0.9)).toBe(42);
  });
});

describe("weightedQuantile actually respects the weights", () => {
  it("a heavily weighted low value pulls the median down", () => {
    // The regression that killed the weighted-type-7 estimator: it returned 50.5 here, i.e. the
    // weights cancelled entirely. Midpoint positions give ~10.9.
    const heavyLow = [s(1, 9), s(100, 1)];
    const m = weightedQuantile(heavyLow, 0.5);
    expect(m).toBeLessThan(50);
    expect(m).toBeCloseTo(10.9, 9);
  });

  it("a heavily weighted high value pulls it up", () => {
    const heavyHigh = [s(1, 1), s(100, 9)];
    expect(weightedQuantile(heavyHigh, 0.5)).toBeGreaterThan(50);
  });

  it("is symmetric — mirroring values mirrors the quantile", () => {
    const lo = weightedQuantile([s(0, 9), s(10, 1)], 0.5);
    const hi = weightedQuantile([s(0, 1), s(10, 9)], 0.5);
    expect(lo + hi).toBeCloseTo(10, 9);
  });

  it("halving every weight changes nothing — only relative weight matters", () => {
    const a = [s(1, 2), s(5, 6), s(9, 2)];
    const b = [s(1, 1), s(5, 3), s(9, 1)];
    for (const q of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(weightedQuantile(a, q)).toBeCloseTo(weightedQuantile(b, q), 12);
    }
  });
});

describe("zonalStats", () => {
  it("computes a hand-checkable weighted mean", () => {
    // (10*0.5 + 20*0.5) / 1.0 = 15
    const st = zonalStats([s(10, 0.5), s(20, 0.5)], opts(2))!;
    expect(st.mean).toBeCloseTo(15, 12);
  });

  it("weights genuinely change the mean — this is the whole point", () => {
    // (10*0.9 + 20*0.1) / 1.0 = 11, NOT the unweighted 15
    const st = zonalStats([s(10, 0.9), s(20, 0.1)], opts(2))!;
    expect(st.mean).toBeCloseTo(11, 12);
  });

  it("returns null rather than NaN when nothing is valid", () => {
    expect(zonalStats([], opts(0))).toBeNull();
    expect(zonalStats([s(Number.NaN, 1)], opts(1))).toBeNull();
    expect(zonalStats([s(5, 0)], opts(1))).toBeNull();
  });

  it("gives zero standard deviation when every value is identical", () => {
    const st = zonalStats([s(7, 0.3), s(7, 1), s(7, 0.55)], opts(3))!;
    expect(st.stdDev).toBeCloseTo(0, 12);
    expect(st.mean).toBeCloseTo(7, 12);
  });

  it("reports effective pixel count as the sum of fractions, not the tally", () => {
    const st = zonalStats([s(1, 0.25), s(2, 0.5), s(3, 1)], opts(3))!;
    expect(st.effectivePixelCount).toBeCloseTo(1.75, 12);
    expect(st.validPixelCount).toBe(3);
    expect(st.coveredAreaM2).toBeCloseTo(175, 12);
  });

  it("min and max ignore weights — they are extremes, not averages", () => {
    const st = zonalStats([s(-1, 0.01), s(50, 1)], opts(2))!;
    expect(st.min).toBe(-1);
    expect(st.max).toBe(50);
  });

  it("tracks the masked/no-data share via validFraction", () => {
    // 3 usable out of 10 touched
    const st = zonalStats([s(1), s(2), s(3)], opts(10))!;
    expect(st.validFraction).toBeCloseTo(0.3, 12);
  });

  it("flags a zone dominated by partial boundary pixels", () => {
    const allPartial = zonalStats([s(1, 0.2), s(2, 0.3), s(3, 0.25)], opts(3))!;
    expect(allPartial.mixedPixelShare).toBeCloseTo(1, 12);

    const mostlyWhole = zonalStats([s(1, 1), s(2, 1), s(3, 1), s(4, 0.1)], opts(4))!;
    expect(mostlyWhole.mixedPixelShare).toBeLessThan(0.05);
  });
});

describe("statistics reconcile with real coverage from the fixtures", () => {
  const toSamples = (rings: number[][][] | readonly (readonly (readonly [number, number])[])[]) =>
    coverageOverGrid(rings as never, GRID).map((c) => s(1, c.fraction));

  it("a constant field yields that constant regardless of coverage weighting", () => {
    const st = zonalStats(toSamples([KNOWN_COVERAGE_PLANTING]), opts(16))!;
    expect(st.mean).toBeCloseTo(1, 12);
    expect(st.stdDev).toBeCloseTo(0, 12);
  });

  it("effective pixel count matches the planting's area over the pixel area", () => {
    const st = zonalStats(toSamples([KNOWN_COVERAGE_PLANTING]), opts(16))!;
    // 1150 m² of 100 m² pixels
    expect(st.effectivePixelCount).toBeCloseTo(11.5, 9);
    expect(st.coveredAreaM2).toBeCloseTo(1150, 6);
  });

  it("the two blocks' effective counts sum to the parent's", () => {
    const parent = zonalStats(toSamples([KNOWN_COVERAGE_PLANTING]), opts(16))!;
    const west = zonalStats(toSamples([BLOCK_WEST]), opts(8))!;
    const east = zonalStats(toSamples([BLOCK_EAST]), opts(8))!;
    expect(west.effectivePixelCount + east.effectivePixelCount).toBeCloseTo(parent.effectivePixelCount, 9);
  });
});

describe("coverageHistogram", () => {
  it("bins fractions across [0,1] with full coverage in the last bin", () => {
    const h = coverageHistogram([s(1, 0.05), s(1, 0.55), s(1, 1)]);
    expect(h[0]).toBe(1);
    expect(h[5]).toBe(1);
    expect(h[9]).toBe(1);
    expect(h.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("ignores zero-weight samples", () => {
    expect(coverageHistogram([s(1, 0)]).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("withMinimumCoverage — the sensitivity filter", () => {
  it("drops edge pixels below the threshold", () => {
    const all = [s(1, 0.05), s(2, 0.4), s(3, 1)];
    expect(withMinimumCoverage(all, 0.5).length).toBe(1);
    expect(withMinimumCoverage(all, 0.3).length).toBe(2);
    expect(withMinimumCoverage(all, 0).length).toBe(3);
  });

  it("changes the answer when edges were driving it — which is the point of offering it", () => {
    // low values only on slivers; filtering them raises the mean
    const mixed = [s(0, 0.02), s(0, 0.03), s(10, 1), s(10, 1)];
    const unfiltered = zonalStats(mixed, opts(4))!;
    const filtered = zonalStats(withMinimumCoverage(mixed, 0.5), opts(4))!;
    expect(filtered.mean).toBeGreaterThan(unfiltered.mean);
    expect(filtered.mean).toBeCloseTo(10, 12);
  });
});
