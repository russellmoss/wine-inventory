import { describe, it, expect } from "vitest";
import { blendWeightedAverage, blendPH, wineCost, totalVolume, GALLONS_PER_CASE } from "@/lib/winemaking-calc/blending";
import { DomainError } from "@/lib/winemaking-calc/validate";

describe("volume-weighted average", () => {
  it("100 L @ 13% + 300 L @ 14% → 13.75%", () => {
    expect(blendWeightedAverage([{ volume: 100, value: 13 }, { volume: 300, value: 14 }])).toBeCloseTo(13.75, 4);
  });
  it("totalVolume sums", () => {
    expect(totalVolume([{ volume: 100 }, { volume: 300 }])).toBe(400);
  });
});

describe("pH blending in H⁺ space (the standout formula)", () => {
  it("equal volumes at pH 3.0 and 4.0 → ≈3.26, NOT the linear 3.5", () => {
    const r = blendPH([{ volume: 100, pH: 3.0 }, { volume: 100, pH: 4.0 }]);
    expect(r.blendPH).toBeCloseTo(3.26, 2);
    expect(r.blendPH).toBeLessThan(3.5); // log-correct: pulled toward the stronger acid
    expect(r.phIsEstimate).toBe(true);
  });
  it("identical pH components return that pH", () => {
    expect(blendPH([{ volume: 100, pH: 3.5 }, { volume: 200, pH: 3.5 }]).blendPH).toBeCloseTo(3.5, 6);
  });
  it("rejects empty components, NaN pH, and negative component volume (no silent NaN)", () => {
    expect(() => blendPH([])).toThrow(DomainError);
    expect(() => blendPH([{ volume: 100, pH: NaN }, { volume: 100, pH: 3.5 }])).toThrow(DomainError);
    expect(() => blendPH([{ volume: -100, pH: 3.2 }, { volume: 100, pH: 3.5 }])).toThrow(DomainError);
  });
});

describe("wine cost", () => {
  it("sums categories, computes % and cases (2.38 gal/case)", () => {
    const r = wineCost([1, 2, 3, 4, 5, 6]);
    expect(r.totalCostPerGal).toBe(21);
    expect(r.totalCases).toBeCloseTo(21 / GALLONS_PER_CASE, 6);
    expect(r.percentByCategory[0]).toBeCloseTo((1 / 21) * 100, 4);
  });
  it("rejects all-zero cost buckets", () => {
    expect(() => wineCost([0, 0, 0, 0, 0, 0])).toThrow(DomainError);
  });
});
