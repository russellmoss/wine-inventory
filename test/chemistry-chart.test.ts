import { describe, it, expect } from "vitest";
import { niceAxisBounds } from "@/lib/harvest/chart";

describe("niceAxisBounds", () => {
  it("does NOT floor pH to 0 (the key analyte regression)", () => {
    const { yMin, yMax } = niceAxisBounds([3.0, 3.4, 3.72, 3.9]);
    expect(yMin).toBeGreaterThan(2); // a sane pH floor, never 0
    expect(yMin).toBeLessThanOrEqual(3.0);
    expect(yMax).toBeGreaterThanOrEqual(3.9);
    expect(yMax).toBeLessThanOrEqual(4.5);
  });

  it("gives a clean 0-based band for SO₂", () => {
    const b = niceAxisBounds([0, 18, 40, 60]);
    expect(b.yMin).toBe(0);
    expect(b.yMax).toBeGreaterThanOrEqual(60);
    expect(b.step).toBeGreaterThan(0);
  });

  it("brackets a single value in a readable band (no zero-width axis)", () => {
    const b = niceAxisBounds([3.5]);
    expect(b.yMax).toBeGreaterThan(b.yMin);
    expect(b.yMin).toBeLessThanOrEqual(3.5);
    expect(b.yMax).toBeGreaterThanOrEqual(3.5);
    expect(b.yMin).toBeGreaterThan(0); // a pH-ish single value is not floored to 0
  });

  it("returns a sane default for an empty series", () => {
    expect(niceAxisBounds([])).toEqual({ yMin: 0, yMax: 1, step: 1 });
  });

  it("honors an explicit step", () => {
    const b = niceAxisBounds([12, 28], 10);
    expect(b.yMin).toBe(10);
    expect(b.yMax).toBe(30);
    expect(b.step).toBe(10);
  });

  it("handles all-equal values (degenerate span) without dividing by zero", () => {
    const b = niceAxisBounds([20, 20, 20]);
    expect(Number.isFinite(b.yMin)).toBe(true);
    expect(b.yMax).toBeGreaterThan(b.yMin);
  });
});
