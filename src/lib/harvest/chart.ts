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

/** Compute the x (time, ms) and y (Brix) domain from the raw values. */
export function computeDomain(xs: number[], ys: number[]): Domain {
  const { yMin, yMax } = brixAxisBounds(ys);
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMaxRaw = xs.length ? Math.max(...xs) : 1;
  return { xMin, xMax: xMaxRaw === xMin ? xMin + 1 : xMaxRaw, yMin, yMax };
}
