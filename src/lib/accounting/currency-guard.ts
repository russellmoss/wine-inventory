// Plan 073 hardening — the tenant BASE currency (AppSettings.currency) MUST equal the connected QBO company's
// HOME currency. The A/P path stores `ApExportEvent.exchangeRate` as base-per-foreign and hands it to QBO as
// the Bill's `ExchangeRate` (which QBO reads as HOME-per-foreign); that identity only holds when base == home.
// If they differ, two things break: (1) the pinned rate's direction/base is wrong, and (2) a domestic
// base-currency receipt gets classified "foreign" vs the QBO home and posts with a CurrencyRef + no pinned
// rate. This is the single predicate the three guards share (connect-time, base-change, and the post sweep).
//
// Whole-app multi-currency (a base ≠ home cross-rate) is explicitly out of Plan 073's scope, so the guard
// PREVENTS the mismatch rather than trying to convert across it.

/** True when a non-empty base and home currency are set and differ (case-insensitive). Empty/unknown → false
 *  (nothing to compare yet — e.g. home currency not read on a legacy connection). */
export function baseHomeCurrencyMismatch(base: string | null | undefined, home: string | null | undefined): boolean {
  const b = (base ?? "").trim().toUpperCase();
  const h = (home ?? "").trim().toUpperCase();
  return b !== "" && h !== "" && b !== h;
}

/** A user-facing, actionable message for the mismatch. */
export function baseHomeMismatchMessage(base: string, home: string): string {
  const b = base.trim().toUpperCase();
  const h = home.trim().toUpperCase();
  return `Your base currency (${b}) doesn't match this QuickBooks company's home currency (${h}). They must match so bills post with the correct currency and rate. Set your base currency to ${h} in Settings, or connect a QuickBooks company whose books are in ${b}.`;
}
