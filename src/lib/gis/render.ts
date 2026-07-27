/**
 * Vineyard Intelligence — raster to RGBA, for the Leaflet canvas overlay.
 *
 * PURE: no React, no Leaflet, no DOM. The `ImageData`/canvas handoff lives in the browser step; this
 * module is the transform, so it is node-testable and measurable without a headless browser.
 *
 * THIS IS THE DISPLAY HALF OF THE NO-WORKER HYPOTHESIS. Gemini's point in council review: the final
 * mile is getting a computed float array onto a Leaflet layer with no tile server. If that paint
 * blocks the main thread for seconds, the architecture fails at the display end even with perfect
 * math. Splitting the pure transform out is what lets us measure the expensive part in node.
 *
 * Alpha carries TWO different meanings and they must not be conflated:
 *   - no-data  -> fully transparent, because we have nothing to say about that pixel
 *   - fractional coverage -> partially transparent at the boundary, so a pixel 12% inside the
 *     planting reads as 12% present rather than being either dropped or drawn whole (brief §2.4)
 */
import { isNoData } from "./ndvi";
import { buildPaletteLut, type ColorDomain, type Palette } from "./color";

export type RgbaRaster = {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA, 4 bytes per pixel — the exact layout `ImageData` expects. */
  readonly data: Uint8ClampedArray;
};

export type RenderOptions = {
  /**
   * Per-pixel coverage fraction, indexed like the values. When present, alpha is scaled by it so the
   * boundary fades honestly instead of drawing a partial pixel at full strength.
   */
  readonly coverage?: ArrayLike<number> | null;
  /** Layer opacity in [0,1]. */
  readonly opacity?: number;
  /** A prebuilt palette LUT, so repeated renders of one palette build it once. */
  readonly lut?: Uint8Array;
};

/**
 * PURE: NDVI (or any indexed float raster) to RGBA.
 *
 * One pass, ZERO allocation per pixel. The palette is precomputed into a 256-entry LUT and indexed
 * directly, and the domain normalisation is inlined.
 *
 * Both details are load-bearing and were found by measuring in a real browser rather than by
 * reasoning. The first version called `colorAtNormalized` per pixel, which allocates a fresh
 * `[r,g,b]` array and walks the stop list each time: ~117,000 allocations for a 342x342 estate, and
 * **431.9 ms** of main-thread block inside a ~911 ms freeze. jsdom could not have caught this - it
 * has no rasteriser and no compositor, so the timing there would have been meaningless.
 */
export function rasterToRgba(
  values: ArrayLike<number>,
  width: number,
  height: number,
  domain: ColorDomain,
  palette: Palette,
  opts: RenderOptions = {},
): RgbaRaster {
  const n = width * height;
  const data = new Uint8ClampedArray(n * 4);
  const coverage = opts.coverage ?? null;
  const opacity = opts.opacity ?? 1;

  const lut = opts.lut ?? buildPaletteLut(palette);
  const levels = lut.length / 3;
  const lo = domain.min;
  const span = domain.max - domain.min;
  const scale = span === 0 ? 0 : (levels - 1) / span;
  const alphaBase = 255 * opacity;

  for (let i = 0; i < n; i++) {
    const v = values[i];
    const o = i * 4;
    if (isNoData(v)) {
      // fully transparent: nothing known about this pixel, so draw nothing
      data[o + 3] = 0;
      continue;
    }
    // inlined normalise + clamp, straight into a LUT index
    let idx = ((v - lo) * scale) | 0;
    if (idx < 0) idx = 0;
    else if (idx >= levels) idx = levels - 1;
    const li = idx * 3;
    data[o] = lut[li];
    data[o + 1] = lut[li + 1];
    data[o + 2] = lut[li + 2];
    const cov = coverage ? coverage[i] : 1;
    data[o + 3] = alphaBase * (cov > 1 ? 1 : cov < 0 ? 0 : cov);
  }

  return { width, height, data };
}

/**
 * PURE: how many pixels would actually be painted.
 *
 * Used by the measurement harness so "how long did the paint take" can be read against how much of
 * the raster was non-transparent, rather than against the raw pixel count.
 */
export function paintablePixelCount(values: ArrayLike<number>, n: number): number {
  let count = 0;
  for (let i = 0; i < n; i++) if (!isNoData(values[i])) count++;
  return count;
}

/**
 * PURE: the WGS84 bounds a Leaflet `ImageOverlay` needs, as `[[south, west], [north, east]]`.
 *
 * Leaflet orders lat before lng, which is the reverse of GeoJSON, and getting it backwards puts the
 * raster somewhere off the coast of Africa rather than raising an error. Hence a named function.
 */
export function leafletBounds(
  wgs84Bbox: readonly [number, number, number, number],
): [[number, number], [number, number]] {
  const [minLon, minLat, maxLon, maxLat] = wgs84Bbox;
  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}
