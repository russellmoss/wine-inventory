import { describe, it, expect } from "vitest";
import {
  fillDepreciationFraction,
  barrelFillDepreciation,
  accruedBarrelCost,
  daysBetween,
} from "@/lib/cost/barrel";

// Unit 8 (D7) — barrel amortization: pure, hand-computed fixtures. Accelerated (SYD) by fill,
// prorated by time (days/365, capped at 1yr) × space (vol/capacity). Mirrors the DB-free style
// of test/cost-rollup.test.ts.

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe("fillDepreciationFraction — accelerated, front-loaded, sums to 1", () => {
  it("a 4-fill life yields 0.40 / 0.30 / 0.20 / 0.10 (SYD)", () => {
    expect(near(fillDepreciationFraction(1, 4), 0.4)).toBe(true);
    expect(near(fillDepreciationFraction(2, 4), 0.3)).toBe(true);
    expect(near(fillDepreciationFraction(3, 4), 0.2)).toBe(true);
    expect(near(fillDepreciationFraction(4, 4), 0.1)).toBe(true);
  });

  it("fill 1 costs more than fill 4 (front-loaded)", () => {
    expect(fillDepreciationFraction(1, 4)).toBeGreaterThan(fillDepreciationFraction(4, 4));
  });

  it("the life's fractions sum to exactly 1", () => {
    const N = 5;
    let sum = 0;
    for (let k = 1; k <= N; k++) sum += fillDepreciationFraction(k, N);
    expect(near(sum, 1)).toBe(true);
  });

  it("a fill past the useful life is fully depreciated (0)", () => {
    expect(fillDepreciationFraction(5, 4)).toBe(0);
    expect(fillDepreciationFraction(0, 4)).toBe(0);
  });
});

describe("barrelFillDepreciation — dollar slice", () => {
  it("fill 1 of a $1000 / 4-fill barrel amortizes $400", () => {
    expect(near(barrelFillDepreciation(1000, 1, 4), 400)).toBe(true);
    expect(near(barrelFillDepreciation(1000, 4, 4), 100)).toBe(true);
  });
});

describe("accruedBarrelCost — time × space proration", () => {
  it("a full-barrel, full-year fill absorbs its entire slice", () => {
    // $400 slice, 365 days, 225L in a 225L barrel → 400 × 1 × 1
    expect(near(accruedBarrelCost({ fillDepreciation: 400, days: 365, residentVolumeL: 225, capacityL: 225 }), 400)).toBe(true);
  });

  it("a 5 L topping in a 225 L barrel over a year absorbs ~2 %, not 100 %", () => {
    const c = accruedBarrelCost({ fillDepreciation: 400, days: 365, residentVolumeL: 5, capacityL: 225 });
    expect(near(c, 400 * (5 / 225))).toBe(true); // ≈ $8.89
    expect(c).toBeLessThan(400 * 0.03);
  });

  it("half a year accrues half the slice (accrue-to-date), then plateaus after a year", () => {
    const half = accruedBarrelCost({ fillDepreciation: 400, days: 182.5, residentVolumeL: 225, capacityL: 225 });
    expect(near(half, 200)).toBe(true);
    const twoYears = accruedBarrelCost({ fillDepreciation: 400, days: 730, residentVolumeL: 225, capacityL: 225 });
    expect(near(twoYears, 400)).toBe(true); // capped — never over-allocates the slice
  });

  it("two lots sharing a barrel for the same year split cost by volume", () => {
    const a = accruedBarrelCost({ fillDepreciation: 400, days: 365, residentVolumeL: 150, capacityL: 225 });
    const b = accruedBarrelCost({ fillDepreciation: 400, days: 365, residentVolumeL: 75, capacityL: 225 });
    expect(near(a + b, 400)).toBe(true); // 150 + 75 = 225 = full barrel → full slice
    expect(near(a, 400 * (150 / 225))).toBe(true);
  });

  it("zero/degenerate inputs accrue nothing", () => {
    expect(accruedBarrelCost({ fillDepreciation: 0, days: 365, residentVolumeL: 225, capacityL: 225 })).toBe(0);
    expect(accruedBarrelCost({ fillDepreciation: 400, days: 0, residentVolumeL: 225, capacityL: 225 })).toBe(0);
    expect(accruedBarrelCost({ fillDepreciation: 400, days: 365, residentVolumeL: 0, capacityL: 225 })).toBe(0);
    expect(accruedBarrelCost({ fillDepreciation: 400, days: 365, residentVolumeL: 225, capacityL: 0 })).toBe(0);
  });
});

describe("daysBetween", () => {
  it("counts whole-ish days and never goes negative", () => {
    const start = 1_000_000_000_000;
    expect(near(daysBetween(start, start + 86_400_000), 1)).toBe(true);
    expect(daysBetween(start + 86_400_000, start)).toBe(0);
  });
});
