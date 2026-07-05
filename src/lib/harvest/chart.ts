// Pure scale math for the Brix-over-time chart. No React, no DOM, no I/O.
// The chart component maps (date, brix) data points into an SVG viewBox using
// these helpers; keeping them pure makes the tricky bits (degenerate domains,
// single-point series) unit-testable.

export type Domain = { xMin: number; xMax: number; yMin: number; yMax: number };

/**
 * Friendly Brix axis bounds: floor toward zero in steps of 5, ceil up in steps
 * of 5, so the curve sits in a readable band. Empty input → a sane default band.
 */
export function brixAxisBounds(values: number[]): { yMin: number; yMax: number } {
  if (values.length === 0) return { yMin: 0, yMax: 30 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const yMin = Math.max(0, Math.floor(lo / 5) * 5);
  let yMax = Math.ceil(hi / 5) * 5;
  if (yMax <= yMin) yMax = yMin + 5;
  return { yMin, yMax };
}

/**
 * Linear map of v from [dMin,dMax] onto [rMin,rMax]. If the domain is degenerate
 * (dMin === dMax) returns the range midpoint, so a single reading renders centered
 * instead of dividing by zero.
 */
export function scaleLinear(
  v: number,
  dMin: number,
  dMax: number,
  rMin: number,
  rMax: number,
): number {
  if (dMax === dMin) return (rMin + rMax) / 2;
  const t = (v - dMin) / (dMax - dMin);
  return rMin + t * (rMax - rMin);
}

function round4(x: number): number {
  return Math.round(x * 1e4) / 1e4;
}

/** A "nice" number near x (1/2/5 × 10ⁿ), for friendly axis steps. */
function niceNum(x: number, round: boolean): number {
  if (!(x > 0)) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  const nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * Math.pow(10, exp);
}

/**
 * Generalized friendly Y bounds for ANY analyte (pH, SO₂, TA, …) — unlike `brixAxisBounds`
 * it does NOT clamp to 0 (a pH band must not floor to 0) and it picks a nice step from the
 * data instead of hardcoding 5. Pass an explicit `step` to override. Empty → a 0–1 default;
 * a single value (degenerate span) → a one-step band around it. Returns the step for ticks.
 */
export function niceAxisBounds(values: number[], step?: number): { yMin: number; yMax: number; step: number } {
  if (values.length === 0) return { yMin: 0, yMax: 1, step: 1 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const s = step ?? (span > 0 ? niceNum(span / 4, true) : niceNum(Math.abs(hi) || 1, false) / 5 || 1);
  const yMin = Math.floor(lo / s + 1e-9) * s;
  let yMax = Math.ceil(hi / s - 1e-9) * s;
  if (yMax - yMin < s - 1e-9) yMax = yMin + s; // single value / degenerate → a readable band
  return { yMin: round4(yMin), yMax: round4(yMax), step: round4(s) };
}

/**
 * Index of the value in `sortedXs` (ascending) nearest to `target`. Used by the
 * interactive chart to snap a pointer's data-time to the closest reading. Pure —
 * no DOM. Handles: empty → -1; single → 0; exact match → that index; between two
 * points → the closer one (ties round to the LATER/higher index); before the first
 * → 0; after the last → last. Bisect (O(log n)).
 */
export function nearestByX(sortedXs: number[], target: number): number {
  const n = sortedXs.length;
  if (n === 0) return -1;
  if (n === 1) return 0;
  if (target <= sortedXs[0]) return 0;
  if (target >= sortedXs[n - 1]) return n - 1;

  // Binary search for the first index whose value is >= target (lower bound).
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedXs[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  // `lo` is the first index >= target; its neighbor `lo - 1` is the last < target.
  const hiIdx = lo;
  const loIdx = lo - 1;
  const distHi = sortedXs[hiIdx] - target;
  const distLo = target - sortedXs[loIdx];
  // Tie → the later (higher-index) point.
  return distHi <= distLo ? hiIdx : loIdx;
}

/** Compute the x (time, ms) and y (Brix) domain from the raw values. */
export function computeDomain(xs: number[], ys: number[]): Domain {
  const { yMin, yMax } = brixAxisBounds(ys);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMaxRaw = xs.length ? Math.max(...xs) : 1;
  return { xMin, xMax: xMaxRaw === xMin ? xMin + 1 : xMaxRaw, yMin, yMax };
}
