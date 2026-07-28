import { describe, it, expect } from "vitest";
import { fillHeightPx, fillWithinTolerance } from "@/lib/vessels/fill-geometry";
import { computeFill } from "@/lib/vessels/fill";

describe("fillHeightPx", () => {
  it("is proportional", () => {
    expect(fillHeightPx(50, 100)).toBe(50);
    expect(fillHeightPx(25, 86)).toBeCloseTo(21.5, 6);
  });

  it("empty and full hit the ends exactly", () => {
    expect(fillHeightPx(0, 86)).toBe(0);
    expect(fillHeightPx(100, 86)).toBe(86);
  });

  it("clamps over-full at the top of the track", () => {
    expect(fillHeightPx(140, 86)).toBe(86);
  });

  it("clamps a negative percentage at zero rather than drawing upward", () => {
    expect(fillHeightPx(-10, 86)).toBe(0);
  });

  it("returns zero for a nonsense track rather than NaN", () => {
    expect(fillHeightPx(50, 0)).toBe(0);
    expect(fillHeightPx(50, -20)).toBe(0);
    expect(fillHeightPx(Number.NaN, 86)).toBe(0);
  });
});

describe("AC-S23 — fill height is within 1px of volumeL / capacityL", () => {
  // The claim: computeFill rounds pct to 0.1, so the inherited error is at most 0.05% of
  // the track. This asserts it across the sizes doc 04 §7 actually specifies and well past.
  const TRACKS = [86, 100, 132, 172, 300, 800, 1999];

  it("holds for the doc 04 tile sizes across the whole range of fills", () => {
    for (const track of TRACKS) {
      for (let v = 0; v <= 5000; v += 37) {
        const capacity = 5000;
        const fill = computeFill([v], capacity);
        expect(fillWithinTolerance(v, capacity, fill.pct, track)).toBe(true);
      }
    }
  });

  it("holds for awkward capacities that do not divide evenly", () => {
    for (const capacity of [1, 3, 227, 1137, 4999.99]) {
      for (const frac of [0, 0.001, 0.017, 0.333, 0.5, 0.6667, 0.99, 1]) {
        const v = capacity * frac;
        const fill = computeFill([v], capacity);
        expect(fillWithinTolerance(v, capacity, fill.pct, 86)).toBe(true);
        expect(fillWithinTolerance(v, capacity, fill.pct, 172)).toBe(true);
      }
    }
  });

  it("holds when the volume arrives as several rows", () => {
    const fill = computeFill([120.5, 80.25, 9.25], 400);
    expect(fillWithinTolerance(210, 400, fill.pct, 86)).toBe(true);
  });

  it("a zero-capacity vessel is vacuously in tolerance, not a divide-by-zero", () => {
    const fill = computeFill([100], 0);
    expect(fill.pct).toBe(0);
    expect(fillWithinTolerance(100, 0, fill.pct, 86)).toBe(true);
  });

  it("over-full clamps, and the overflow is carried by `over` not by the bar", () => {
    const fill = computeFill([6000], 5000);
    expect(fill.over).toBe(true);
    expect(fill.pct).toBe(120);
    expect(fillHeightPx(fill.pct, 86)).toBe(86);
    // Clamped, so it is still "within tolerance" of the capped ideal.
    expect(fillWithinTolerance(6000, 5000, fill.pct, 86)).toBe(true);
  });

  it("would FAIL if pct were rounded to whole percents on a tall track", () => {
    // Guards the reasoning, not just the result: 1% of a 1999px track is ~20px, so a
    // coarser rounding really would break AC-S23 and this test would catch it.
    const coarse = Math.round((1234 / 5000) * 100);
    expect(fillWithinTolerance(1234, 5000, coarse, 1999)).toBe(false);
  });
});
