// Phase 8b (Unit 8, D7) — barrel amortization: PURE math, unit-tested directly (no DB/server imports,
// like rollup / cogs / policy). A barrel is a depreciating asset whose cost amortizes over its useful
// life measured in FILLS, ACCELERATED by fill number — the first fill imparts the most oak character so
// it carries the most cost. Each fill's cost slice is then allocated to the resident wine by BOTH how
// long it sat (days / 365, capped at one year per fill) AND how much of the barrel it occupied
// (residentVolume / capacity). Two lots sharing a barrel each carry their own fill row, so cost splits
// by volume × time; a 5 L topping in a 225 L barrel absorbs ~2 %, not 100 % (D7 test intents).
//
// Accelerated curve: sum-of-years-digits (SYD) over the useful-life fills — the textbook accelerated
// method, front-loaded, generalizes to any life, and sums to exactly 1 across the life. For a 4-fill
// life it yields 0.40 / 0.30 / 0.20 / 0.10, matching the council's front-loaded intent (illustrative
// 50/25/15/10). Fills beyond the useful life are fully depreciated → zero further cost.

const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

/**
 * The fraction of the barrel's purchase cost that the Nth fill amortizes, via sum-of-years-digits over
 * `usefulLifeFills`. `fillNumber` is 1-based. A fill past the useful life amortizes nothing (already
 * fully depreciated). SYD weight for fill k of life N = (N − k + 1) / (N(N+1)/2).
 */
export function fillDepreciationFraction(fillNumber: number, usefulLifeFills: number): number {
  const N = Math.floor(usefulLifeFills);
  const k = Math.floor(fillNumber);
  if (N <= 0 || k <= 0 || k > N) return 0;
  const denom = (N * (N + 1)) / 2;
  return round8((N - k + 1) / denom);
}

/** The dollar cost slice the Nth fill amortizes = purchaseCost × SYD fraction. */
export function barrelFillDepreciation(purchaseCost: number, fillNumber: number, usefulLifeFills: number): number {
  return round8(purchaseCost * fillDepreciationFraction(fillNumber, usefulLifeFills));
}

/** Whole days between two epoch-ms instants (never negative). */
export function daysBetween(startMs: number, endMs: number): number {
  return Math.max(0, (endMs - startMs) / MS_PER_DAY);
}

export type BarrelAccrualInput = {
  /** the $ slice this fill amortizes (barrelFillDepreciation). */
  fillDepreciation: number;
  /** days the wine has occupied the barrel so far (open fill) or in total (closed fill). */
  days: number;
  /** resident volume of this lot in the barrel (L). */
  residentVolumeL: number;
  /** barrel capacity (L). */
  capacityL: number;
};

/**
 * Barrel cost accrued to a resident lot: fillDepreciation × timeFactor × spaceFactor, where the time
 * factor is min(1, days/365) — a fill amortizes at most its full slice, reached after one year, then
 * plateaus (so a multi-year fill never over-allocates) — and the space factor is min(1, vol/capacity).
 * Deterministic; the same inputs always yield the same cost. Used both for the accrue-to-date read event
 * (open fill, days-so-far) and the immutable materialized line at fill close (total residency days).
 */
export function accruedBarrelCost(input: BarrelAccrualInput): number {
  if (!(input.fillDepreciation > 0) || !(input.capacityL > 0) || !(input.residentVolumeL > 0)) return 0;
  const timeFactor = Math.min(1, input.days / DAYS_PER_YEAR);
  const spaceFactor = Math.min(1, input.residentVolumeL / input.capacityL);
  return round8(input.fillDepreciation * timeFactor * spaceFactor);
}
