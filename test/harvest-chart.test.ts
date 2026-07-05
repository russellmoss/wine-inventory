import { describe, it, expect } from "vitest";
import { brixAxisBounds, scaleLinear, computeDomain, nearestByX } from "@/lib/harvest/chart";

describe("brixAxisBounds", () => {
  it("returns a default band for no values", () => {
    expect(brixAxisBounds([])).toEqual({ yMin: 0, yMax: 30 });
  });

  it("floors to 0-by-5s and ceils up by 5s", () => {
    expect(brixAxisBounds([18, 22, 25])).toEqual({ yMin: 15, yMax: 25 });
    expect(brixAxisBounds([21, 23])).toEqual({ yMin: 20, yMax: 25 });
  });

  it("never goes below zero", () => {
    expect(brixAxisBounds([1, 3]).yMin).toBe(0);
  });

  it("guarantees yMax > yMin even when all values land on a boundary", () => {
    const b = brixAxisBounds([20, 20]);
    expect(b.yMin).toBe(20);
    expect(b.yMax).toBe(25);
  });
});

describe("scaleLinear", () => {
  it("maps endpoints and midpoint", () => {
    expect(scaleLinear(0, 0, 10, 0, 100)).toBe(0);
    expect(scaleLinear(10, 0, 10, 0, 100)).toBe(100);
    expect(scaleLinear(5, 0, 10, 0, 100)).toBe(50);
  });

  it("returns the range midpoint for a degenerate domain", () => {
    expect(scaleLinear(42, 5, 5, 0, 100)).toBe(50);
  });

  it("handles an inverted range (SVG y grows downward)", () => {
    expect(scaleLinear(0, 0, 10, 100, 0)).toBe(100);
    expect(scaleLinear(10, 0, 10, 100, 0)).toBe(0);
  });
});

describe("computeDomain", () => {
  it("derives x/y domain from values", () => {
    const d = computeDomain([100, 200, 300], [18, 25]);
    expect(d.xMin).toBe(100);
    expect(d.xMax).toBe(300);
    expect(d.yMin).toBe(15);
    expect(d.yMax).toBe(25);
  });

  it("widens a single-point x domain so it does not collapse", () => {
    const d = computeDomain([100], [20]);
    expect(d.xMin).toBe(100);
    expect(d.xMax).toBe(101);
  });

  it("is safe with no points", () => {
    const d = computeDomain([], []);
    expect(d.xMin).toBe(0);
    expect(d.xMax).toBe(1);
    expect(d.yMin).toBe(0);
    expect(d.yMax).toBe(30);
  });
});

describe("nearestByX", () => {
  const xs = [10, 20, 30, 40];

  it("returns -1 for an empty array", () => {
    expect(nearestByX([], 5)).toBe(-1);
  });

  it("returns 0 for a single-element array regardless of target", () => {
    expect(nearestByX([42], 0)).toBe(0);
    expect(nearestByX([42], 42)).toBe(0);
    expect(nearestByX([42], 999)).toBe(0);
  });

  it("returns the exact index on an exact match", () => {
    expect(nearestByX(xs, 10)).toBe(0);
    expect(nearestByX(xs, 30)).toBe(2);
    expect(nearestByX(xs, 40)).toBe(3);
  });

  it("picks the closer neighbor when between two points", () => {
    expect(nearestByX(xs, 21)).toBe(1); // closer to 20
    expect(nearestByX(xs, 29)).toBe(2); // closer to 30
    expect(nearestByX(xs, 34)).toBe(2); // closer to 30
    expect(nearestByX(xs, 36)).toBe(3); // closer to 40
  });

  it("rounds a midpoint tie to the later (higher) index", () => {
    expect(nearestByX(xs, 25)).toBe(2); // equidistant 20/30 → 30
    expect(nearestByX(xs, 15)).toBe(1); // equidistant 10/20 → 20
  });

  it("clamps to index 0 before the first point", () => {
    expect(nearestByX(xs, -100)).toBe(0);
    expect(nearestByX(xs, 9)).toBe(0);
  });

  it("clamps to the last index after the last point", () => {
    expect(nearestByX(xs, 41)).toBe(3);
    expect(nearestByX(xs, 1000)).toBe(3);
  });
});
