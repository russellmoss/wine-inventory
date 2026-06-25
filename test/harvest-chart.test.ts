import { describe, it, expect } from "vitest";
import { brixAxisBounds, scaleLinear, computeDomain } from "@/lib/harvest/chart";

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
