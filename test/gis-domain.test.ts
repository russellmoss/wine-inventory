import { describe, it, expect } from "vitest";
import { resolveDomain, toWeightedSamples, MIN_DOMAIN_SPREAD, ABSOLUTE_NDVI_MIN, ABSOLUTE_NDVI_MAX } from "@/lib/gis/domain";
import { fixedDomain } from "@/lib/gis/color";
import type { WeightedSample } from "@/lib/gis/zonal";
import { ndviHistogram } from "@/lib/gis/histogram";
import { NO_DATA } from "@/lib/gis/ndvi";

const samples = (vals: number[]): WeightedSample[] => vals.map((value) => ({ value, weight: 1 }));

describe("resolveDomain: scale-mode dispatch", () => {
  it("VINEYARD_SCENE uses robust p5–p95 over the pixels", () => {
    const d = resolveDomain({ mode: "VINEYARD_SCENE", pixels: samples([0.2, 0.4, 0.5, 0.6, 0.8]) });
    expect(d.mode).toBe("VINEYARD_SCENE");
    expect(d.min).toBeGreaterThanOrEqual(0.2);
    expect(d.max).toBeLessThanOrEqual(0.8);
    expect(d.max - d.min).toBeGreaterThanOrEqual(MIN_DOMAIN_SPREAD - 1e-9); // wide data → clamp doesn't fire
    expect(d.clamped).toBe(false);
  });

  it("MIN-SPREAD CLAMP fires on a near-uniform vineyard (council fix #4)", () => {
    // Every pixel ~0.62 → p5–p95 width far below 0.15. A relative ramp would paint a false rainbow.
    const d = resolveDomain({ mode: "VINEYARD_SCENE", pixels: samples([0.61, 0.62, 0.62, 0.62, 0.63]) });
    expect(d.clamped).toBe(true);
    expect(d.max - d.min).toBeCloseTo(MIN_DOMAIN_SPREAD, 6);
    // Centre preserved.
    expect((d.min + d.max) / 2).toBeCloseTo(0.62, 2);
    // The narrowness is still flagged honestly.
    expect(d.narrow).toBe(true);
  });

  it("ABSOLUTE is the fixed NDVI reference scale and is NEVER clamped", () => {
    const d = resolveDomain({ mode: "ABSOLUTE", pixels: samples([0.62, 0.62, 0.62]) });
    expect(d.min).toBeCloseTo(ABSOLUTE_NDVI_MIN, 6);
    expect(d.max).toBeCloseTo(ABSOLUTE_NDVI_MAX, 6);
    expect(d.clamped).toBe(false);
  });

  it("CUSTOM honours user bounds", () => {
    const d = resolveDomain({ mode: "CUSTOM", fixed: { min: 0.3, max: 0.7 } });
    expect(d.min).toBeCloseTo(0.3, 6);
    expect(d.max).toBeCloseTo(0.7, 6);
    expect(d.clamped).toBe(false);
  });

  it("COMPARISON_LOCKED spans both dates' domains", () => {
    const a = fixedDomain(0.3, 0.6, "VINEYARD_SCENE");
    const b = fixedDomain(0.4, 0.8, "VINEYARD_SCENE");
    const d = resolveDomain({ mode: "COMPARISON_LOCKED", lockedDomains: [a, b] });
    expect(d.min).toBeCloseTo(0.3, 6);
    expect(d.max).toBeCloseTo(0.8, 6);
    expect(d.mode).toBe("COMPARISON_LOCKED");
  });

  it("toWeightedSamples drops no-data and zero-coverage", () => {
    const values = [0.5, NO_DATA, 0.7, 0.9];
    const coverage = [1, 1, 0, 0.5];
    const s = toWeightedSamples(values, coverage);
    expect(s).toEqual([
      { value: 0.5, weight: 1 },
      { value: 0.9, weight: 0.5 },
    ]);
  });
});

describe("ndviHistogram: value-axis, coverage-weighted", () => {
  it("bins values across the domain and totals the weights", () => {
    const h = ndviHistogram(samples([0.1, 0.2, 0.2, 0.3, 0.4]), { min: 0, max: 0.5 }, 5);
    expect(h.edges).toHaveLength(6);
    expect(h.counts).toHaveLength(5);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(5);
    expect(h.total).toBe(5);
  });

  it("tallies under/overflow honestly (clamped into end bins)", () => {
    const h = ndviHistogram(samples([-0.3, 0.25, 1.2]), { min: 0, max: 0.5 }, 5);
    expect(h.underflow).toBe(1);
    expect(h.overflow).toBe(1);
    expect(h.counts[0]).toBeGreaterThanOrEqual(1);
    expect(h.counts[4]).toBeGreaterThanOrEqual(1);
  });

  it("weights the counts by coverage", () => {
    const s: WeightedSample[] = [
      { value: 0.25, weight: 0.5 },
      { value: 0.25, weight: 0.25 },
    ];
    const h = ndviHistogram(s, { min: 0, max: 0.5 }, 2);
    expect(h.total).toBeCloseTo(0.75, 6);
  });
});
