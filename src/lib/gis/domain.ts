/**
 * Vineyard Intelligence — colour-domain DISPATCH: pick the right domain per scale mode (brief §6, P3).
 *
 * PURE: no React, no Leaflet, no DOM, no I/O.
 *
 * `color.ts` gives the primitives (`percentileDomain` / `fixedDomain` / `lockedDomain`). This is the glue
 * P2 deliberately left out: given a `ColorScaleMode` + the right inputs, produce ONE resolved domain. It
 * also applies the MIN-SPREAD CLAMP (council fix #4): on a nearly-uniform vineyard a relative p5–p95 ramp
 * is < 0.15 NDVI wide and paints a dramatic false-vigor rainbow across essentially identical values. When
 * that happens we pad the domain to ±0.075 around its centre — a CLAMP, not a dismissible warning — and
 * flag `clamped` so the legend can say the spread is real-but-tiny rather than let the picture lie. Fixed
 * modes (ABSOLUTE / CUSTOM / COMPARISON_LOCKED) are the user's deliberate choice and are NEVER clamped.
 */
import {
  fixedDomain,
  lockedDomain,
  percentileDomain,
  type ColorDomain,
  type ColorScaleMode,
} from "./color";
import { isNoData } from "./ndvi";
import type { WeightedSample } from "./zonal";

/** Below this p5–p95 width a relative domain is padded (council fix #4). 0.15 NDVI ≈ a real vigor band. */
export const MIN_DOMAIN_SPREAD = 0.15;

/** NDVI absolute reference domain (brief §6.2) — the cross-site "what is this value, really" scale. */
export const ABSOLUTE_NDVI_MIN = -0.2;
export const ABSOLUTE_NDVI_MAX = 0.9;

export type ResolvedDomain = ColorDomain & {
  /** True when the min-spread clamp fired: the underlying data was near-uniform and the domain was padded. */
  readonly clamped: boolean;
};

export type ResolveDomainInput = {
  readonly mode: ColorScaleMode;
  /** Coverage-weighted pixel samples for the relative modes (VINEYARD_SCENE / BLOCK_SCENE). */
  readonly pixels?: readonly WeightedSample[];
  /** Baseline-dataset pixels for VINEYARD_BASELINE (the reference scene the current one is read against). */
  readonly baselinePixels?: readonly WeightedSample[];
  readonly percentileLow?: number;
  readonly percentileHigh?: number;
  /** ABSOLUTE / CUSTOM fixed bounds. */
  readonly fixed?: { readonly min: number; readonly max: number };
  /** The per-date domains to lock across, for COMPARISON_LOCKED (computed over the mask intersection upstream). */
  readonly lockedDomains?: readonly ColorDomain[];
};

/** PURE: pad a domain to at least MIN_DOMAIN_SPREAD around its centre. Preserves flags; marks `clamped`. */
function applyMinSpreadClamp(d: ColorDomain): ResolvedDomain {
  const width = d.max - d.min;
  if (width >= MIN_DOMAIN_SPREAD) return { ...d, clamped: false };
  const mid = (d.min + d.max) / 2;
  return {
    ...d,
    min: mid - MIN_DOMAIN_SPREAD / 2,
    max: mid + MIN_DOMAIN_SPREAD / 2,
    // Keep `narrow` = the ORIGINAL narrowness (the honest signal); the numbers are now padded.
    clamped: true,
  };
}

/**
 * PURE: resolve the ONE domain for a scale mode.
 *
 * - VINEYARD_SCENE / BLOCK_SCENE: robust p5–p95 over the given pixels, then min-spread clamp.
 * - VINEYARD_BASELINE: same, but computed from the BASELINE dataset's pixels (falls back to `pixels`).
 * - ABSOLUTE: the fixed NDVI reference scale (never clamped).
 * - CUSTOM: the user's fixed bounds (never clamped).
 * - COMPARISON_LOCKED: the span across the per-date domains (never clamped — the whole point is a shared scale).
 */
export function resolveDomain(input: ResolveDomainInput): ResolvedDomain {
  const { mode } = input;
  const low = input.percentileLow ?? 0.05;
  const high = input.percentileHigh ?? 0.95;

  switch (mode) {
    case "VINEYARD_SCENE":
    case "BLOCK_SCENE":
      return applyMinSpreadClamp(percentileDomain(input.pixels ?? [], { low, high, mode }));

    case "VINEYARD_BASELINE":
      return applyMinSpreadClamp(
        percentileDomain(input.baselinePixels ?? input.pixels ?? [], { low, high, mode }),
      );

    case "ABSOLUTE": {
      const min = input.fixed?.min ?? ABSOLUTE_NDVI_MIN;
      const max = input.fixed?.max ?? ABSOLUTE_NDVI_MAX;
      return { ...fixedDomain(min, max, mode), clamped: false };
    }

    case "CUSTOM": {
      const min = input.fixed?.min ?? ABSOLUTE_NDVI_MIN;
      const max = input.fixed?.max ?? ABSOLUTE_NDVI_MAX;
      return { ...fixedDomain(min, max, mode), clamped: false };
    }

    case "COMPARISON_LOCKED":
      return { ...lockedDomain(input.lockedDomains ?? []), clamped: false };

    default: {
      // Exhaustiveness guard — a new ColorScaleMode must be handled here.
      const _never: never = mode;
      return { ...fixedDomain(ABSOLUTE_NDVI_MIN, ABSOLUTE_NDVI_MAX, _never), clamped: false };
    }
  }
}

/** PURE: build coverage-weighted samples from a value raster + optional per-pixel coverage weights. */
export function toWeightedSamples(
  values: ArrayLike<number>,
  coverage?: ArrayLike<number> | null,
): WeightedSample[] {
  const out: WeightedSample[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (isNoData(v)) continue;
    const w = coverage ? coverage[i] : 1;
    if (w > 0) out.push({ value: v, weight: w });
  }
  return out;
}
