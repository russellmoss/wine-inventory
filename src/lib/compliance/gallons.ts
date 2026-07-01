// The SINGLE L→US-gallon conversion + rounding authority for the 5120.17 report (eng-review E3).
// Canonical storage is liters, Decimal(10,2) (VISION D8); the form is in US gallons to 2 dp. Every
// gallons value on the screen AND in the filled PDF flows through here — the PDF renders the
// already-rounded snapshot and NEVER re-rounds, so the paper can't disagree with the screen.

/** Exact US liquid gallon in liters (NIST). Division by this is the only L→gal path. */
export const LITERS_PER_US_GALLON = 3.785411784;

/**
 * Round to 2 decimal places (the form's `0.00` cell precision). Uses a tiny epsilon nudge so
 * values sitting a float-ulp below a half-cent (e.g. 2.675 → 2.68) round the way a human expects.
 * Symmetric for negatives (drift can be negative before it's posted to a gain/loss line).
 */
export function round2Gal(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 100 + Number.EPSILON)) / 100;
}

/** Exact (un-rounded) liters → gallons. Use inside a running total; round only at the cell boundary. */
export function litersToGallonsExact(liters: number): number {
  return liters / LITERS_PER_US_GALLON;
}

/** Liters → gallons, rounded to the form's 2 dp. The value that lands in a report cell. */
export function litersToGallons(liters: number): number {
  return round2Gal(litersToGallonsExact(liters));
}
