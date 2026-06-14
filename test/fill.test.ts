import { describe, it, expect } from "vitest";
import { computeFill } from "@/lib/vessels/fill";

describe("computeFill", () => {
  it("sums components and computes percentage", () => {
    expect(computeFill([300, 200], 1000)).toEqual({ filledL: 500, pct: 50, over: false, remainingL: 500 });
  });

  it("empty vessel", () => {
    expect(computeFill([], 1000)).toEqual({ filledL: 0, pct: 0, over: false, remainingL: 1000 });
  });

  it("flags over-capacity", () => {
    const f = computeFill([600, 500], 1000);
    expect(f.filledL).toBe(1100);
    expect(f.over).toBe(true);
    expect(f.remainingL).toBe(-100);
  });

  it("rounds to one decimal percent / two decimal liters", () => {
    const f = computeFill([333.333], 1000);
    expect(f.filledL).toBe(333.33);
    expect(f.pct).toBe(33.3);
  });

  it("guards divide-by-zero capacity", () => {
    expect(computeFill([10], 0).pct).toBe(0);
  });
});
