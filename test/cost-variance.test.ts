import { describe, it, expect } from "vitest";
import { computeBottlingVariance } from "@/lib/cost/variance";

// Unit 13 (D12) — post-bottling variance split. Pure, hand-computed. Sold = good − onHand.
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe("computeBottlingVariance — sold/unsold split", () => {
  it("splits a cost increase across sold and on-hand bottles", () => {
    // frozen $5.00/btl, corrected to $5.50, 100 bottles, 40 on hand → 60 sold
    const v = computeBottlingVariance({ frozenCostPerBottle: 5, newCostPerBottle: 5.5, goodBottles: 100, onHandBottles: 40 });
    expect(near(v.deltaPerBottle, 0.5)).toBe(true);
    expect(v.soldBottles).toBe(60);
    expect(v.onHandBottles).toBe(40);
    expect(near(v.soldDelta, 30)).toBe(true); // 60 × 0.50 → period COGS variance
    expect(near(v.unsoldDelta, 20)).toBe(true); // 40 × 0.50 → inventory-value adjustment
    expect(near(v.totalDelta, 50)).toBe(true);
  });

  it("a cost decrease yields negative deltas", () => {
    const v = computeBottlingVariance({ frozenCostPerBottle: 5, newCostPerBottle: 4.75, goodBottles: 100, onHandBottles: 100 });
    expect(near(v.deltaPerBottle, -0.25)).toBe(true);
    expect(v.soldBottles).toBe(0);
    expect(near(v.soldDelta, 0)).toBe(true);
    expect(near(v.unsoldDelta, -25)).toBe(true);
    expect(near(v.totalDelta, -25)).toBe(true);
  });

  it("all bottles sold → the entire delta hits COGS variance, none to inventory", () => {
    const v = computeBottlingVariance({ frozenCostPerBottle: 5, newCostPerBottle: 6, goodBottles: 100, onHandBottles: 0 });
    expect(v.soldBottles).toBe(100);
    expect(near(v.soldDelta, 100)).toBe(true);
    expect(near(v.unsoldDelta, 0)).toBe(true);
  });

  it("on-hand is clamped to [0, goodBottles] (bad data can't invert the split)", () => {
    const v = computeBottlingVariance({ frozenCostPerBottle: 5, newCostPerBottle: 6, goodBottles: 100, onHandBottles: 999 });
    expect(v.onHandBottles).toBe(100);
    expect(v.soldBottles).toBe(0);
    expect(near(v.unsoldDelta, 100)).toBe(true);
  });

  it("no change → zero delta (caller skips emitting)", () => {
    const v = computeBottlingVariance({ frozenCostPerBottle: 5, newCostPerBottle: 5, goodBottles: 100, onHandBottles: 50 });
    expect(near(v.totalDelta, 0)).toBe(true);
  });

  it("conservation: soldDelta + unsoldDelta === totalDelta === deltaPerBottle × goodBottles", () => {
    const v = computeBottlingVariance({ frozenCostPerBottle: 3.33, newCostPerBottle: 3.99, goodBottles: 240, onHandBottles: 137 });
    expect(near(v.soldDelta + v.unsoldDelta, v.totalDelta)).toBe(true);
    expect(near(v.totalDelta, 0.66 * 240)).toBe(true);
  });
});
