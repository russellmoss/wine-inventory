// plan-027 — US federal holidays + business-day roll for TTB filing due dates. Pure, DB-free, tested.
//
// Council C1: due dates roll in OPPOSITE directions by form, and holidays are NOT deferrable:
//   • 5120.17 operations report — roll FORWARD to the next business day (27 CFR 24.300(g)).
//   • 5000.24 excise return    — roll BACKWARD to the preceding business day (27 CFR 24.271(c)(1)(i));
//     paying late is a penalty, so the due date is pulled earlier, never pushed later.
// Federal holidays must be modeled: a holiday-adjacent due date computed wrong = a real penalty. We
// COMPUTE the 11 federal holidays for any year (deterministic rules) rather than hand-typing dates —
// more reliable, and unit-tested against known 2026 values.

const DAY = 86_400_000;

const ymd = (d: Date) => d.toISOString().slice(0, 10); // UTC YYYY-MM-DD
const utc = (y: number, m1: number, d: number) => new Date(Date.UTC(y, m1 - 1, d));

/** nth (1-based) `weekday` (0=Sun..6=Sat) of a 1-based month. */
function nthWeekday(year: number, m1: number, weekday: number, n: number): Date {
  const first = utc(year, m1, 1);
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return utc(year, m1, 1 + shift + (n - 1) * 7);
}
/** last `weekday` of a 1-based month. */
function lastWeekday(year: number, m1: number, weekday: number): Date {
  const lastDay = new Date(Date.UTC(year, m1, 0)).getUTCDate();
  const last = utc(year, m1, lastDay);
  const shift = (last.getUTCDay() - weekday + 7) % 7;
  return utc(year, m1, lastDay - shift);
}
/** Observed date for a FIXED-date holiday: Sat → prior Fri, Sun → next Mon (federal rule). */
function observed(d: Date): Date {
  const dow = d.getUTCDay();
  if (dow === 6) return new Date(d.getTime() - DAY); // Sat → Fri
  if (dow === 0) return new Date(d.getTime() + DAY); // Sun → Mon
  return d;
}

/** The 11 US federal holidays for a calendar year, as OBSERVED YYYY-MM-DD strings. */
export function federalHolidays(year: number): string[] {
  const fixed = [
    utc(year, 1, 1), // New Year's Day
    utc(year, 6, 19), // Juneteenth
    utc(year, 7, 4), // Independence Day
    utc(year, 11, 11), // Veterans Day
    utc(year, 12, 25), // Christmas
  ].map(observed);
  const floating = [
    nthWeekday(year, 1, 1, 3), // MLK — 3rd Mon Jan
    nthWeekday(year, 2, 1, 3), // Washington's Birthday — 3rd Mon Feb
    lastWeekday(year, 5, 1), // Memorial Day — last Mon May
    nthWeekday(year, 9, 1, 1), // Labor Day — 1st Mon Sep
    nthWeekday(year, 10, 1, 2), // Columbus Day — 2nd Mon Oct
    nthWeekday(year, 11, 4, 4), // Thanksgiving — 4th Thu Nov
  ];
  return [...fixed, ...floating].map(ymd);
}

/** Holidays for a date's year ± 1 (covers New-Year observation that lands in the adjacent year). */
function holidaySet(aroundYear: number): Set<string> {
  return new Set([aroundYear - 1, aroundYear, aroundYear + 1].flatMap(federalHolidays));
}

/** A business day = not Saturday/Sunday and not an observed federal holiday. */
export function isBusinessDay(d: Date, holidays: Set<string> = holidaySet(d.getUTCFullYear())): boolean {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !holidays.has(ymd(d));
}

export type RollDirection = "FORWARD" | "BACKWARD";

/**
 * Roll a due date to a business day. FORWARD (ops report) advances to the next business day; BACKWARD
 * (excise return) retreats to the preceding one. Idempotent when the date is already a business day.
 */
export function businessDayRoll(due: Date, direction: RollDirection): Date {
  const holidays = holidaySet(due.getUTCFullYear());
  const step = direction === "FORWARD" ? DAY : -DAY;
  let d = due;
  // Guard the loop (max ~10 days covers any weekend+holiday cluster).
  for (let i = 0; i < 14 && !isBusinessDay(d, holidays); i++) d = new Date(d.getTime() + step);
  return d;
}
