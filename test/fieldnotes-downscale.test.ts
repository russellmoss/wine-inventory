import { describe, it, expect } from "vitest";
import { fitDimensions, MAX_EDGE } from "@/app/(app)/vineyards/field-notes/manager/downscaleImage";

describe("fitDimensions", () => {
  it("never upscales an image smaller than max", () => {
    expect(fitDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitDimensions(1, 1, 1600)).toEqual({ width: 1, height: 1 });
  });

  it("caps the longest edge at max (landscape)", () => {
    const out = fitDimensions(3200, 2400, 1600);
    expect(Math.max(out.width, out.height)).toBe(1600);
    expect(out).toEqual({ width: 1600, height: 1200 });
  });

  it("caps the longest edge at max (portrait)", () => {
    const out = fitDimensions(2400, 3200, 1600);
    expect(Math.max(out.width, out.height)).toBe(1600);
    expect(out).toEqual({ width: 1200, height: 1600 });
  });

  it("preserves aspect ratio when downscaling", () => {
    const w = 4000;
    const h = 2000;
    const out = fitDimensions(w, h, 1600);
    expect(out.width / out.height).toBeCloseTo(w / h, 5);
  });

  it("handles a square image at the boundary", () => {
    expect(fitDimensions(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
    expect(fitDimensions(3200, 3200, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it("guards against non-positive dimensions", () => {
    expect(fitDimensions(0, 100, 1600)).toEqual({ width: 0, height: 0 });
    expect(fitDimensions(100, 0, 1600)).toEqual({ width: 0, height: 0 });
  });

  it("exports a sensible MAX_EDGE", () => {
    expect(MAX_EDGE).toBe(1600);
  });
});
