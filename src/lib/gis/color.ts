/**
 * Vineyard Intelligence — colour domain and palettes (brief §6).
 *
 * PURE: no React, no Leaflet, no DOM, no I/O.
 *
 * THE PRODUCT RULE THIS ENCODES. The default domain is calibrated to the whole VINEYARD, never
 * per block (brief §6.1). Rescaling each block independently would make a weak block and a strong
 * block look identical, which is the exact opposite of what a manager opens the map to see.
 *
 * The domain is computed with the SAME coverage weighting as the statistics in `zonal.ts`, so the
 * legend and the numbers can never disagree.
 */
import { weightedQuantile, type WeightedSample } from "./zonal";

export type ColorScaleMode =
  | "VINEYARD_SCENE"
  | "BLOCK_SCENE"
  | "COMPARISON_LOCKED"
  | "VINEYARD_BASELINE"
  | "ABSOLUTE"
  | "CUSTOM";

export type ColorStop = { readonly value: number; readonly color: readonly [number, number, number] };

export type ColorDomain = {
  readonly min: number;
  readonly max: number;
  readonly mode: ColorScaleMode;
  readonly percentileLow: number;
  readonly percentileHigh: number;
  /**
   * True when the domain is so tight that a relative ramp will paint dramatic colour across
   * essentially uniform vineyard. Brief §6.4's trap: a relative ramp ALWAYS produces a full spread
   * of colour, even when every pixel is the same. The UI must say so rather than let the picture lie.
   */
  readonly narrow: boolean;
  /** True when the domain had to be widened because every value was identical. */
  readonly degenerate: boolean;
};

/** Below this width an NDVI domain is flagged narrow. 0.05 NDVI is within scene-to-scene noise. */
const NARROW_DOMAIN_WIDTH = 0.05;

/** Minimum domain width, so a constant field cannot divide by zero. */
const MIN_DOMAIN_WIDTH = 1e-6;

/**
 * PURE: robust percentile domain over ALL valid pixels in the vineyard (brief §6.1 default: p5-p95).
 *
 * Percentiles rather than min/max because a handful of noisy or mixed boundary pixels would
 * otherwise flatten every useful colour difference into the middle of the ramp.
 */
export function percentileDomain(
  samples: readonly WeightedSample[],
  opts: { low?: number; high?: number; mode?: ColorScaleMode } = {},
): ColorDomain {
  const low = opts.low ?? 0.05;
  const high = opts.high ?? 0.95;
  const mode = opts.mode ?? "VINEYARD_SCENE";

  const usable = samples
    .filter((s) => s.weight > 0 && Number.isFinite(s.value))
    .sort((a, b) => a.value - b.value);

  if (usable.length === 0) {
    return { min: 0, max: MIN_DOMAIN_WIDTH, mode, percentileLow: low, percentileHigh: high, narrow: true, degenerate: true };
  }

  let min = weightedQuantile(usable, low);
  let max = weightedQuantile(usable, high);
  if (max < min) [min, max] = [max, min];

  let degenerate = false;
  if (max - min < MIN_DOMAIN_WIDTH) {
    // A constant field. Widen symmetrically so the ramp is defined, and SAY it is degenerate rather
    // than silently painting a full colour spread across identical values.
    const mid = (min + max) / 2;
    min = mid - MIN_DOMAIN_WIDTH / 2;
    max = mid + MIN_DOMAIN_WIDTH / 2;
    degenerate = true;
  }

  return { min, max, mode, percentileLow: low, percentileHigh: high, narrow: max - min < NARROW_DOMAIN_WIDTH, degenerate };
}

/** PURE: a fixed domain, for ABSOLUTE / CUSTOM / COMPARISON_LOCKED modes. */
export function fixedDomain(min: number, max: number, mode: ColorScaleMode): ColorDomain {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const width = hi - lo;
  return {
    min: lo,
    max: width < MIN_DOMAIN_WIDTH ? lo + MIN_DOMAIN_WIDTH : hi,
    mode,
    percentileLow: 0,
    percentileHigh: 1,
    narrow: width < NARROW_DOMAIN_WIDTH,
    degenerate: width < MIN_DOMAIN_WIDTH,
  };
}

/**
 * PURE: one locked domain spanning several scenes (brief §8, §15 Comparison).
 *
 * Comparing dates under independently-scaled ramps is the single easiest way to invent a trend that
 * is not there, so the locked domain is what comparison mode must use.
 */
export function lockedDomain(domains: readonly ColorDomain[]): ColorDomain {
  if (domains.length === 0) return fixedDomain(0, 1, "COMPARISON_LOCKED");
  const min = Math.min(...domains.map((d) => d.min));
  const max = Math.max(...domains.map((d) => d.max));
  return fixedDomain(min, max, "COMPARISON_LOCKED");
}

export type Palette = {
  readonly id: string;
  readonly label: string;
  readonly stops: readonly ColorStop[];
  /** True when the palette does not rely on distinguishing red from green. */
  readonly colorVisionSafe: boolean;
};

const rgb = (r: number, g: number, b: number): readonly [number, number, number] => [r, g, b];

/** Deep red → orange → yellow → light green → dark green. The industry-default vigour ramp. */
export const VIGOR_CLASSIC: Palette = {
  id: "vigor-classic",
  label: "Vigour classic (red → dark green)",
  colorVisionSafe: false,
  stops: [
    { value: 0, color: rgb(165, 0, 38) },
    { value: 0.25, color: rgb(244, 109, 67) },
    { value: 0.5, color: rgb(255, 255, 191) },
    { value: 0.75, color: rgb(145, 207, 96) },
    { value: 1, color: rgb(0, 104, 55) },
  ],
};

/** Deep purple → lavender → light green → dark green. */
export const PURPLE_GREEN: Palette = {
  id: "purple-green",
  label: "Purple → green",
  colorVisionSafe: false,
  stops: [
    { value: 0, color: rgb(64, 0, 75) },
    { value: 0.33, color: rgb(153, 112, 171) },
    { value: 0.66, color: rgb(166, 219, 160) },
    { value: 1, color: rgb(0, 68, 27) },
  ],
};

/**
 * Perceptually ordered and NOT dependent on red-vs-green discrimination (viridis).
 *
 * Roughly 8% of men have some form of red-green colour vision deficiency, which is precisely the
 * axis both ramps above rely on. Shipping this is not decoration.
 */
export const COLOR_VISION_SAFE: Palette = {
  id: "color-vision-safe",
  label: "Colour-vision-safe (viridis)",
  colorVisionSafe: true,
  stops: [
    { value: 0, color: rgb(68, 1, 84) },
    { value: 0.25, color: rgb(59, 82, 139) },
    { value: 0.5, color: rgb(33, 145, 140) },
    { value: 0.75, color: rgb(94, 201, 98) },
    { value: 1, color: rgb(253, 231, 37) },
  ],
};

export const PALETTES: readonly Palette[] = [VIGOR_CLASSIC, PURPLE_GREEN, COLOR_VISION_SAFE];

/**
 * PURE: mirror a palette's stops. `reverse` in the UI must not mean "re-author the ramp".
 *
 * Each stop keeps its colour and moves to the mirrored position, then the list is re-sorted
 * ascending because `colorAtNormalized` walks stops in order.
 */
export function reversePalette(p: Palette): Palette {
  return {
    ...p,
    id: p.id.endsWith("-reversed") ? p.id.slice(0, -"-reversed".length) : `${p.id}-reversed`,
    label: `${p.label} (reversed)`,
    stops: p.stops
      .map((s) => ({ value: 1 - s.value, color: s.color }))
      .sort((a, b) => a.value - b.value),
  };
}

/** PURE: normalise a value into [0,1] across the domain, clamped at both ends (brief §6.1). */
export function normalize(value: number, domain: ColorDomain): number {
  const t = (value - domain.min) / (domain.max - domain.min);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** PURE: the RGB for a normalised position, linearly interpolated between stops. */
export function colorAtNormalized(t: number, palette: Palette): [number, number, number] {
  const stops = palette.stops;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  if (clamped <= stops[0].value) return [...stops[0].color];
  if (clamped >= stops[stops.length - 1].value) return [...stops[stops.length - 1].color];
  for (let i = 1; i < stops.length; i++) {
    if (clamped <= stops[i].value) {
      const a = stops[i - 1];
      const b = stops[i];
      const span = b.value - a.value;
      const k = span <= 0 ? 0 : (clamped - a.value) / span;
      return [
        Math.round(a.color[0] + k * (b.color[0] - a.color[0])),
        Math.round(a.color[1] + k * (b.color[1] - a.color[1])),
        Math.round(a.color[2] + k * (b.color[2] - a.color[2])),
      ];
    }
  }
  return [...stops[stops.length - 1].color];
}

/** PURE: the RGB for a raw value under a domain. */
export function colorAt(value: number, domain: ColorDomain, palette: Palette): [number, number, number] {
  return colorAtNormalized(normalize(value, domain), palette);
}

/** PURE: evenly spaced legend entries, so a legend always carries NUMBERS (brief §6.4). */
export function legendStops(
  domain: ColorDomain,
  palette: Palette,
  count = 5,
): { value: number; color: [number, number, number] }[] {
  const out: { value: number; color: [number, number, number] }[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const value = domain.min + t * (domain.max - domain.min);
    out.push({ value, color: colorAtNormalized(t, palette) });
  }
  return out;
}

/**
 * PURE: precompute a palette into a flat RGB lookup table.
 *
 * WHY THIS EXISTS — measured, not guessed. `colorAtNormalized` allocates a fresh `[r,g,b]` array on
 * every call and walks the stop list to find the bracketing pair. That is fine for a legend (five
 * calls) and pathological for a raster: a 342x342 estate is ~117,000 allocations plus ~117,000 stop
 * walks. Measured in a real browser, `rasterToRgba` cost **431.9 ms** of main-thread block that way,
 * inside a ~911 ms total freeze. A map that locks up for a second on every scene load is not
 * shippable.
 *
 * 256 levels is not a compromise: the output channel is 8-bit, so quantising the RAMP to 256 steps
 * is invisible by construction.
 */
export function buildPaletteLut(palette: Palette, levels = 256): Uint8Array {
  const lut = new Uint8Array(levels * 3);
  for (let i = 0; i < levels; i++) {
    const [r, g, b] = colorAtNormalized(i / (levels - 1), palette);
    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}
