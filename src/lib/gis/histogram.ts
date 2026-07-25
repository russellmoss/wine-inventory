/**
 * Vineyard Intelligence — NDVI VALUE histogram for the legend (brief §6.4, P3).
 *
 * PURE: no React, no Leaflet, no DOM, no I/O.
 *
 * WHY A NEW HISTOGRAM. P2's block metrics carry a coverage histogram — bins on the COVERAGE-FRACTION axis
 * (how partial each edge pixel is). The legend needs the opposite: bins on the NDVI VALUE axis, so a manager
 * can see the shape of vigor across the vineyard (bimodal = two populations, long left tail = a weak corner).
 * Coverage-weighted counts, so the histogram and the coverage-weighted domain/stats can never disagree.
 */
import { isNoData } from "./ndvi";
import type { ColorDomain } from "./color";
import type { WeightedSample } from "./zonal";

export type NdviHistogram = {
  /** Bin edges, length = bins + 1 (spanning [domainMin, domainMax]). */
  readonly edges: number[];
  /** Coverage-weighted count per bin, length = bins. Values are Σ coverage weight, not raw pixel tallies. */
  readonly counts: number[];
  /** The domain the bins span (echoed for the legend). */
  readonly min: number;
  readonly max: number;
  /** Total coverage weight counted across ALL samples (in-range + under/overflow) = sum(counts). */
  readonly total: number;
  /** Coverage weight that fell BELOW min / ABOVE max (clamped into the end bins but reported for honesty). */
  readonly underflow: number;
  readonly overflow: number;
};

/**
 * PURE: a coverage-weighted histogram of NDVI values across a domain.
 *
 * Values outside [domain.min, domain.max] are counted into the first/last bin (matching the clamped colour
 * ramp) but ALSO tallied as under/overflow so the caller can be honest that the tails were clipped.
 */
export function ndviHistogram(
  samples: readonly WeightedSample[],
  domain: Pick<ColorDomain, "min" | "max">,
  bins = 32,
): NdviHistogram {
  const n = Math.max(1, Math.floor(bins));
  const min = domain.min;
  const max = domain.max;
  const width = max - min;
  const edges: number[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) edges[i] = min + (width * i) / n;

  const counts = new Array(n).fill(0);
  let total = 0;
  let underflow = 0;
  let overflow = 0;

  for (const s of samples) {
    if (s.weight <= 0 || isNoData(s.value)) continue;
    total += s.weight;
    if (s.value < min) {
      underflow += s.weight;
      counts[0] += s.weight;
      continue;
    }
    if (s.value >= max) {
      overflow += s.weight;
      counts[n - 1] += s.weight;
      continue;
    }
    const bin = width <= 0 ? 0 : Math.min(n - 1, Math.floor(((s.value - min) / width) * n));
    counts[bin] += s.weight;
  }

  return { edges, counts, min, max, total, underflow, overflow };
}
