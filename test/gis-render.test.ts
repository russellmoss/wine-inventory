import { describe, it, expect } from "vitest";
import { rasterToRgba, paintablePixelCount, leafletBounds } from "@/lib/gis/render";
import { fixedDomain, VIGOR_CLASSIC, colorAtNormalized } from "@/lib/gis/color";
import { NO_DATA } from "@/lib/gis/ndvi";

const DOMAIN = fixedDomain(0, 1, "ABSOLUTE");

describe("rasterToRgba", () => {
  it("emits exactly 4 bytes per pixel, the layout ImageData expects", () => {
    const out = rasterToRgba(new Float64Array([0.5, 0.5, 0.5, 0.5]), 2, 2, DOMAIN, VIGOR_CLASSIC);
    expect(out.data.length).toBe(16);
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
  });

  it("maps a value through the domain and palette", () => {
    const out = rasterToRgba(new Float64Array([1]), 1, 1, DOMAIN, VIGOR_CLASSIC);
    const expected = colorAtNormalized(1, VIGOR_CLASSIC);
    expect([out.data[0], out.data[1], out.data[2]]).toEqual(expected);
    expect(out.data[3]).toBe(255);
  });

  it("renders NO-DATA fully transparent — we have nothing to say about that pixel", () => {
    const out = rasterToRgba(new Float64Array([NO_DATA]), 1, 1, DOMAIN, VIGOR_CLASSIC);
    expect(out.data[3]).toBe(0);
  });

  it("does NOT paint a no-data pixel some default colour", () => {
    const out = rasterToRgba(new Float64Array([NO_DATA]), 1, 1, DOMAIN, VIGOR_CLASSIC);
    expect([out.data[0], out.data[1], out.data[2]]).toEqual([0, 0, 0]);
    expect(out.data[3]).toBe(0); // invisible regardless
  });

  it("fades boundary pixels by coverage, so 12% inside reads as 12% present", () => {
    // brief §2.4: a partial pixel is neither dropped nor drawn whole
    const out = rasterToRgba(new Float64Array([0.5, 0.5]), 2, 1, DOMAIN, VIGOR_CLASSIC, {
      coverage: [1, 0.12],
    });
    expect(out.data[3]).toBe(255);
    expect(out.data[7]).toBe(Math.round(255 * 0.12));
  });

  it("keeps the COLOUR identical for a partial pixel — only alpha changes", () => {
    const out = rasterToRgba(new Float64Array([0.5, 0.5]), 2, 1, DOMAIN, VIGOR_CLASSIC, {
      coverage: [1, 0.3],
    });
    expect([out.data[0], out.data[1], out.data[2]]).toEqual([out.data[4], out.data[5], out.data[6]]);
    expect(out.data[3]).not.toBe(out.data[7]);
  });

  it("applies layer opacity on top of coverage", () => {
    const out = rasterToRgba(new Float64Array([0.5]), 1, 1, DOMAIN, VIGOR_CLASSIC, {
      coverage: [0.5],
      opacity: 0.5,
    });
    expect(out.data[3]).toBe(Math.round(255 * 0.25));
  });

  it("clamps a coverage outside [0,1] rather than producing a wild alpha", () => {
    const out = rasterToRgba(new Float64Array([0.5, 0.5]), 2, 1, DOMAIN, VIGOR_CLASSIC, {
      coverage: [5, -3],
    });
    expect(out.data[3]).toBe(255);
    expect(out.data[7]).toBe(0);
  });

  it("clamps values outside the domain to the end colours, never wrapping", () => {
    const out = rasterToRgba(new Float64Array([-99, 99]), 2, 1, DOMAIN, VIGOR_CLASSIC);
    expect([out.data[0], out.data[1], out.data[2]]).toEqual(colorAtNormalized(0, VIGOR_CLASSIC));
    expect([out.data[4], out.data[5], out.data[6]]).toEqual(colorAtNormalized(1, VIGOR_CLASSIC));
  });
});

describe("paintablePixelCount", () => {
  it("counts only pixels that will actually be drawn", () => {
    const vals = new Float64Array([0.1, NO_DATA, 0.3, NO_DATA]);
    expect(paintablePixelCount(vals, 4)).toBe(2);
  });
});

describe("leafletBounds", () => {
  it("swaps to Leaflet's lat-before-lng order", () => {
    // GeoJSON is [lon, lat]; Leaflet is [lat, lng]. Getting this backwards silently relocates the
    // raster instead of raising, which is why it is a named function with a test.
    expect(leafletBounds([-78.52, 38.02, -78.48, 38.05])).toEqual([
      [38.02, -78.52],
      [38.05, -78.48],
    ]);
  });
});

describe("throughput at estate scale", () => {
  it("converts a full estate raster well inside a frame budget", () => {
    // 342 x 342 is the real live-scene size from Unit 11 (116,964 px)
    const n = 342 * 342;
    const values = new Float64Array(n);
    for (let i = 0; i < n; i++) values[i] = (i % 100) / 100;

    const t0 = performance.now();
    const out = rasterToRgba(values, 342, 342, DOMAIN, VIGOR_CLASSIC);
    const ms = performance.now() - t0;

    expect(out.data.length).toBe(n * 4);
    // generous ceiling for CI: the point is that it is milliseconds, not seconds
    expect(ms).toBeLessThan(500);
  });
});
