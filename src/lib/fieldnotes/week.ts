// Canonical week-of (Friday anchor) helpers. Pure, unit-tested, and strictly
// UTC date-only ("YYYY-MM-DD") — NO local-time Date math. A Saturday submission
// on bad signal must file against the right Friday, so the manager picks weekOf
// (defaulting to the most-recently-passed Friday) and we validate it here.

const FRIDAY = 5; // Date.getUTCDay(): 0=Sun .. 6=Sat

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Format a Date as a UTC "YYYY-MM-DD" string (date-only, no time/zone drift). */
export function toISODateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Parse a "YYYY-MM-DD" string into a UTC midnight Date. Returns null if the
 * string is not a real calendar date (rejects "2026-13-40", "2026-02-30", etc.).
 */
export function parseISODateUTC(s: string): Date | null {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // round-trip guard: rejects overflowed components (Feb 30 -> Mar 2)
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

/**
 * The most-recently-passed Friday (today included when today is Friday), as a
 * UTC "YYYY-MM-DD" string. Retained for any week-anchored callers; field-note
 * reports are now dated per day and default to `todayISODateUTC`.
 */
export function mostRecentFriday(now: Date = new Date()): string {
  const day = now.getUTCDay();
  const daysSinceFriday = (day - FRIDAY + 7) % 7;
  const friday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceFriday),
  );
  return toISODateUTC(friday);
}

/** Today as a UTC "YYYY-MM-DD" string — the default report date for a new note. */
export function todayISODateUTC(now: Date = new Date()): string {
  return toISODateUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
}

/**
 * A report date is valid iff it is a real calendar date and is not in the future
 * (not later than today, UTC). Any day is allowed — reports are no longer locked
 * to a weekly Friday cadence. Accepts a "YYYY-MM-DD" string or a Date.
 */
export function isValidReportDate(reportDate: string | Date, now: Date = new Date()): boolean {
  const iso = reportDate instanceof Date ? toISODateUTC(reportDate) : reportDate;
  const date = parseISODateUTC(iso);
  if (!date) return false;
  return iso <= todayISODateUTC(now); // lexical compare is safe for ISO dates
}

/**
 * A weekOf is valid iff it is a real date, falls on a Friday, and is not in the
 * future (not later than the most-recently-passed Friday). Accepts a "YYYY-MM-DD"
 * string or a Date. Kept for back-compat; field notes use {@link isValidReportDate}.
 */
export function isValidWeekOf(weekOf: string | Date, now: Date = new Date()): boolean {
  const iso = weekOf instanceof Date ? toISODateUTC(weekOf) : weekOf;
  const date = parseISODateUTC(iso);
  if (!date) return false;
  if (date.getUTCDay() !== FRIDAY) return false;
  return iso <= mostRecentFriday(now); // lexical compare is safe for ISO dates
}
