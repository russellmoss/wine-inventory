/**
 * Vineyard Intelligence — coverage-weighted zonal statistics (brief §15).
 *
 * PURE: no React, no Leaflet, no I/O, no blob SDK. Node-testable, and it survives a flip to the
 * worker architecture unchanged (runbook rule §2.4).
 *
 * Every statistic is weighted by the pixel's COVERAGE FRACTION, never by a binary in/out decision.
 * Brief §2.4 is explicit: a pixel 12% inside the boundary contributes 0.12, and describing it as one
 * full vineyard pixel is wrong. The fractions come from `coverage.ts`, validated cell-by-cell against
 * `exactextract` in Unit 5.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It reports the NDVI of whole 10 m source pixels, weighted by
 * how much of each lies inside the boundary. It does NOT reveal the NDVI of only the 12% inside —
 * that information does not exist in the data. Boundary pixels may mix vines, road, soil and
 * neighbouring vegetation, which is why `mixedPixelShare` is reported rather than hidden.
 */

/** One pixel's contribution: a value and the fraction of the pixel inside the zone. */
export type WeightedSample = {
  readonly value: number;
  readonly weight: number;
};

export type ZonalStats = {
  /** Σ coverageFraction — the "effective pixel count" (brief §2.4). Not the pixel tally. */
  readonly effectivePixelCount: number;
  /** How many source pixels the zone touches at all, whole or partial. */
  readonly intersectingPixelCount: number;
  /** Pixels carrying a usable value (not no-data, not quality-masked). */
  readonly validPixelCount: number;
  /** validPixelCount / intersectingPixelCount, in [0,1]. */
  readonly validFraction: number;
  /** Physical covered area in m², from Σ coverageFraction × pixelArea. */
  readonly coveredAreaM2: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  readonly p10: number;
  readonly p25: number;
  readonly p75: number;
  readonly p90: number;
  /** Coverage-weighted population standard deviation. */
  readonly stdDev: number;
  /**
   * Share of the zone's effective area contributed by pixels that are NOT fully inside it.
   * High values mean mixed boundary pixels dominate and the statistics describe a blend of vineyard
   * and whatever else is in those cells — the narrow-block warning from brief §2.4.
   */
  readonly mixedPixelShare: number;
};

/**
 * Coverage-weighted quantile, PINNED to the midpoint (type-5 style) plotting position:
 *
 *   p_i = (C_i - w_i/2) / W        C_i = cumulative weight through i, W = total weight
 *
 * Values are linearly interpolated between bracketing positions; requests outside the range clamp to
 * the end values.
 *
 * WHY THIS AND NOT A WEIGHTED TYPE-7. The obvious generalisation of type-7 is
 * `p_i = (C_i - w_i)/(W - w_i)`, which has the appeal of reducing EXACTLY to type-7's `i/(n-1)` when
 * every weight is equal. It was tried first and rejected, because it pins the endpoints to 0 and 1
 * regardless of weight: for two samples the weights cancel completely, so
 * `[value 1 weight 9, value 100 weight 1]` returns a median of 50.5 as if the weights did not exist.
 * A weighted quantile that ignores its weights is not fit for the one thing brief §2.4 asks for.
 *
 * The midpoint form respects weights at every n. The same case returns ~10.9, properly dragged toward
 * the heavily-weighted value. The cost is that with equal weights it is type-5, not type-7: the
 * median still agrees, but p25/p75 differ slightly. Weight-correctness beats matching an unweighted
 * convention, and the deviation is documented rather than silent.
 *
 * This choice is stated rather than left implicit because weighted quantiles are
 * definition-dependent and two correct implementations legitimately disagree. Unit 9 therefore
 * validates quantiles against ANALYTIC fixtures and never against `exactextract`, so an estimator
 * mismatch can never be mistaken for a clipper bug.
 */
export function weightedQuantile(sorted: readonly WeightedSample[], q: number): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sorted[0].value;

  let total = 0;
  for (const s of sorted) total += s.weight;
  if (total <= 0) return Number.NaN;

  const positions: number[] = new Array(n);
  let cum = 0;
  for (let i = 0; i < n; i++) {
    cum += sorted[i].weight;
    positions[i] = (cum - sorted[i].weight / 2) / total;
  }

  if (q <= positions[0]) return sorted[0].value;
  if (q >= positions[n - 1]) return sorted[n - 1].value;

  for (let i = 1; i < n; i++) {
    if (q <= positions[i]) {
      const span = positions[i] - positions[i - 1];
      if (span <= 0) return sorted[i].value;
      const t = (q - positions[i - 1]) / span;
      return sorted[i - 1].value + t * (sorted[i].value - sorted[i - 1].value);
    }
  }
  return sorted[n - 1].value;
}

/**
 * Coverage-weighted statistics over a zone.
 *
 * `samples` carries one entry per INTERSECTING pixel that has a usable value; `intersecting` is the
 * total touched, so the difference is the masked/no-data count. Returns `null` rather than throwing
 * when there is nothing valid to describe — following `src/lib/vineyard/units.ts`, where "cannot
 * compute" is a value, not an exception. A caller rendering a block panel needs an empty state, not
 * a crash.
 */
export function zonalStats(
  samples: readonly WeightedSample[],
  opts: { intersectingPixelCount: number; pixelAreaM2: number },
): ZonalStats | null {
  const usable = samples.filter((s) => s.weight > 0 && Number.isFinite(s.value));
  if (usable.length === 0) return null;

  let weightSum = 0;
  let weightedValueSum = 0;
  let min = Infinity;
  let max = -Infinity;
  let partialWeight = 0;

  for (const s of usable) {
    weightSum += s.weight;
    weightedValueSum += s.value * s.weight;
    if (s.value < min) min = s.value;
    if (s.value > max) max = s.value;
    if (s.weight < 1) partialWeight += s.weight;
  }
  if (weightSum <= 0) return null;

  const mean = weightedValueSum / weightSum;

  // Coverage-weighted POPULATION variance: Σ w(v-mean)² / Σ w. Population rather than sample,
  // because the pixels are the whole zone, not a draw from a larger set.
  let sqSum = 0;
  for (const s of usable) sqSum += s.weight * (s.value - mean) ** 2;
  const stdDev = Math.sqrt(sqSum / weightSum);

  const sorted = [...usable].sort((a, b) => a.value - b.value);

  return {
    effectivePixelCount: weightSum,
    intersectingPixelCount: opts.intersectingPixelCount,
    validPixelCount: usable.length,
    validFraction: opts.intersectingPixelCount > 0 ? usable.length / opts.intersectingPixelCount : 0,
    coveredAreaM2: weightSum * opts.pixelAreaM2,
    min,
    max,
    mean,
    median: weightedQuantile(sorted, 0.5),
    p10: weightedQuantile(sorted, 0.1),
    p25: weightedQuantile(sorted, 0.25),
    p75: weightedQuantile(sorted, 0.75),
    p90: weightedQuantile(sorted, 0.9),
    stdDev,
    mixedPixelShare: partialWeight / weightSum,
  };
}

/**
 * PURE: the coverage-fraction histogram, for the mixed-pixel sensitivity view (brief §2.4).
 * Ten bins over [0,1]; a fraction of exactly 1 lands in the last bin.
 */
export function coverageHistogram(samples: readonly WeightedSample[], bins = 10): number[] {
  const out = new Array(bins).fill(0);
  for (const s of samples) {
    if (!(s.weight > 0)) continue;
    const idx = Math.min(bins - 1, Math.floor(s.weight * bins));
    out[idx] += 1;
  }
  return out;
}

/**
 * PURE: re-run statistics keeping only pixels at or above a minimum coverage.
 *
 * The optional sensitivity filter brief §2.4 asks for. Comparing the filtered result against the
 * unfiltered one tells a manager whether a block's numbers are being driven by its edges — which is
 * the honest way to present a narrow block rather than quietly reporting a blended figure.
 */
export function withMinimumCoverage(
  samples: readonly WeightedSample[],
  minCoverage: number,
): WeightedSample[] {
  return samples.filter((s) => s.weight >= minCoverage);
}
