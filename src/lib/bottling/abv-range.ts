// Server-authoritative ABV range for a bottling run (single source of truth, shared by the client
// hint, the /bottling server action, and — via runBottlingTx — the WO BOTTLE task).
//
// ABV is a percentage BY VOLUME, so it is physically bounded to (0, 100]: a value ≤ 0 is
// missing/invalid, and a value > 100 is impossible (pure ethanol is 100% v/v). Before this guard the
// flow accepted absurd input (e.g. 140%), writing corrupt data into the finished-goods / tax record.
//
// The upper bound is deliberately the physical maximum, NOT the 24% wine/spirits line: the compliance
// tax-class layer intentionally CAPTURES values above 24% and flags them for auditor review
// (`abv-over-24-review` in src/lib/compliance/tax-class.ts) rather than dropping the volume. Rejecting
// at 24% here would defeat that design, so this range only rejects the missing/impossible region.

export const MIN_BOTTLING_ABV = 0; // exclusive lower bound — ABV must be > 0
export const MAX_BOTTLING_ABV = 100; // inclusive upper bound — a percentage by volume can't exceed 100

export const ABV_REQUIRED_MESSAGE =
  "Enter the wine's alcohol by volume (%). ABV is required to classify the wine for TTB reporting.";
export const ABV_TOO_HIGH_MESSAGE =
  `That ABV looks off — enter a real alcohol by volume of ${MAX_BOTTLING_ABV}% or less (a percentage by volume can't exceed ${MAX_BOTTLING_ABV}%).`;

/**
 * Pure range check for a bottling ABV. Returns a friendly error message when the value is out of
 * range, or `null` when it is a valid bottling ABV. Shared by the client (inline hint) and the server
 * (throws an ActionError with the returned message), so the wording is identical in both places.
 */
export function validateBottlingAbv(abv: number): string | null {
  if (!Number.isFinite(abv) || abv <= MIN_BOTTLING_ABV) return ABV_REQUIRED_MESSAGE;
  if (abv > MAX_BOTTLING_ABV) return ABV_TOO_HIGH_MESSAGE;
  return null;
}
