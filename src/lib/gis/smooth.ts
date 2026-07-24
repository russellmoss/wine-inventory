/**
 * Vineyard Intelligence — display resampling and analytical smoothing (brief §7).
 *
 * PURE: no React, no Leaflet, no DOM, no I/O.
 *
 * THE HONESTY CONTRACT (brief §7.4). Sentinel-2 B04/B08 have 10 m source pixels. Resampling the
 * display to look smooth does NOT create sub-10-m information, and the two operations here are kept
 * deliberately separate so they can never be confused:
 *
 *   - DISPLAY resampling (`resampleNearest` / `resampleBilinear`) changes appearance only and MUST
 *     NEVER feed statistics. It exists so the map does not look like a wall of hard squares.
 *   - ANALYTICAL smoothing (`focalMedian3x3`) produces a DERIVED layer, recorded with its method and
 *     kernel, which a user opts into. Raw pixels remain the authoritative statistics.
 *
 * Both refuse to invent data across a no-data boundary: a smoothed value is only produced where
 * enough real neighbours exist, so the vineyard edge cannot bleed inward from whatever is outside it.
 */
import { isNoData, NO_DATA } from "./ndvi";

export type Grid = {
  readonly width: number;
  readonly height: number;
  readonly values: Float64Array;
};

const idx = (x: number, y: number, w: number) => y * w + x;

/**
 * PURE: nearest-neighbour display resampling.
 *
 * Preserves the visible source pixels. This is the "inspect the real resolution" toggle, and it is
 * what an honest UI shows when a user asks what the data actually looks like.
 */
export function resampleNearest(src: Grid, outWidth: number, outHeight: number): Grid {
  const out = new Float64Array(outWidth * outHeight);
  const sx = src.width / outWidth;
  const sy = src.height / outHeight;
  for (let y = 0; y < outHeight; y++) {
    const srcY = Math.min(src.height - 1, Math.floor((y + 0.5) * sy));
    for (let x = 0; x < outWidth; x++) {
      const srcX = Math.min(src.width - 1, Math.floor((x + 0.5) * sx));
      out[idx(x, y, outWidth)] = src.values[idx(srcX, srcY, src.width)];
    }
  }
  return { width: outWidth, height: outHeight, values: out };
}

/**
 * PURE: bilinear display resampling — the recommended default so the map is not blocky.
 *
 * No-data is CONTAGIOUS here on purpose: if any of the four contributing neighbours is no-data, the
 * output is no-data rather than a plausible-looking average of three real values and one guess.
 * Interpolating across a cloud edge would paint confident colour over exactly the pixels we masked.
 */
export function resampleBilinear(src: Grid, outWidth: number, outHeight: number): Grid {
  const out = new Float64Array(outWidth * outHeight);
  const sx = src.width / outWidth;
  const sy = src.height / outHeight;
  for (let y = 0; y < outHeight; y++) {
    const fy = Math.min(src.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(src.height - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < outWidth; x++) {
      const fx = Math.min(src.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(src.width - 1, x0 + 1);
      const tx = fx - x0;

      const v00 = src.values[idx(x0, y0, src.width)];
      const v10 = src.values[idx(x1, y0, src.width)];
      const v01 = src.values[idx(x0, y1, src.width)];
      const v11 = src.values[idx(x1, y1, src.width)];

      if (isNoData(v00) || isNoData(v10) || isNoData(v01) || isNoData(v11)) {
        out[idx(x, y, outWidth)] = NO_DATA;
        continue;
      }
      const top = v00 + tx * (v10 - v00);
      const bot = v01 + tx * (v11 - v01);
      out[idx(x, y, outWidth)] = top + ty * (bot - top);
    }
  }
  return { width: outWidth, height: outHeight, values: out };
}

export type SmoothingResult = {
  readonly grid: Grid;
  /** Recorded so a derived layer can never be displayed without saying what produced it. */
  readonly method: "median";
  readonly kernel: "3x3";
  readonly minValidFraction: number;
  /** Source resolution in metres, carried through so the UI cannot claim a finer one. */
  readonly sourceResolutionM: number;
};

/**
 * PURE: 3×3 median filter — the one analytical derivative P0 ships (brief §7.2).
 *
 * Median rather than mean: it removes salt-and-pepper noise without dragging an edge toward its
 * neighbours, so a genuine vigour boundary between two blocks stays a boundary.
 *
 * `minValidFraction` (default 5/9) is the edge-aware mask, and it is a FRACTION of the IN-BOUNDS
 * window rather than an absolute count. That distinction matters: a raster corner has only 4
 * positions in bounds, and if all 4 carry real data there is nothing uncertain about it — an
 * absolute threshold of 5 would mask perfectly good corners of every scene. A pixel with 3 real
 * neighbours out of 9 possible is genuinely uncertain and IS masked. Two different situations,
 * previously conflated.
 *
 * At 10 m a 3×3 kernel spans ~30 m, which will blur narrow blocks and headlands — hence opt-in,
 * labelled, and never the statistics source.
 */
export function focalMedian3x3(
  src: Grid,
  opts: { minValidFraction?: number; sourceResolutionM?: number } = {},
): SmoothingResult {
  const minValidFraction = opts.minValidFraction ?? 5 / 9;
  const out = new Float64Array(src.width * src.height);
  const buf: number[] = [];

  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const here = src.values[idx(x, y, src.width)];
      if (isNoData(here)) {
        out[idx(x, y, src.width)] = NO_DATA;
        continue;
      }
      buf.length = 0;
      let inBounds = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= src.height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= src.width) continue;
          inBounds++;
          const v = src.values[idx(nx, ny, src.width)];
          if (!isNoData(v)) buf.push(v);
        }
      }
      if (inBounds === 0 || buf.length / inBounds < minValidFraction) {
        out[idx(x, y, src.width)] = NO_DATA;
        continue;
      }
      buf.sort((a, b) => a - b);
      const mid = buf.length >> 1;
      out[idx(x, y, src.width)] = buf.length % 2 === 1 ? buf[mid] : (buf[mid - 1] + buf[mid]) / 2;
    }
  }

  return {
    grid: { width: src.width, height: src.height, values: out },
    method: "median",
    kernel: "3x3",
    minValidFraction,
    sourceResolutionM: opts.sourceResolutionM ?? 10,
  };
}
