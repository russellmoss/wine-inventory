// plan-026 Unit 4 — the wine EXCISE-return period calendar (27 CFR 24.271). Pure, DB-free, tested.
// Given a year + a return cadence, it produces the ordered list of filing periods with their window
// [start, end] (UTC, inclusive) and due date. This is a DIFFERENT calendar from the 5120.17 operations
// report (that one is monthly/quarterly/annual by gallons; this one is semimonthly/quarterly/annual by
// $ liability). Everything downstream (compute, generate, the review screen) drives off these windows.
//
// Council C1 — the SEPTEMBER SPLIT. Because the federal fiscal year ends Sept 30, semimonthly filers
// file THREE returns in September instead of two, and the boundaries depend on whether the filer pays
// by EFT (27 CFR 24.271(b)(2)):
//   • NOT paying by EFT:  Sep 1–15 · Sep 16–25 · Sep 26–30
//   • paying by EFT:      Sep 1–15 · Sep 16–26 · Sep 27–30
// VERIFY against 27 CFR 24.271(b)(2) at each form-version bump — the September due dates can also be
// accelerated; v1 uses the general "due = period end + 14 days" rule (§24.271(g)) for every period.

import type { ReturnCadence } from "./types";

export type ReturnPeriod = {
  cadence: ReturnCadence;
  /** Ordinal within the year (0-based, in chronological order). */
  index: number;
  /** Inclusive UTC window. */
  start: Date;
  end: Date;
  /** Filing/payment due date — period end + 14 days (27 CFR 24.271(g)). */
  dueDate: Date;
  /** Human label, e.g. "2026 · Sep 16–25" / "2026 · Q3" / "2026 (annual)". */
  label: string;
};

const DUE_DAYS = 14;

const startOfDay = (y: number, m1: number, d: number) => new Date(Date.UTC(y, m1 - 1, d, 0, 0, 0, 0));
const endOfDay = (y: number, m1: number, d: number) => new Date(Date.UTC(y, m1 - 1, d, 23, 59, 59, 999));
/** Last calendar day of a 1-based month (handles 28/29/30/31, incl. Feb leap). */
const lastDayOfMonth = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate();
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** [startDay, endDay] halves for a normal month (16→EOM for the back half). */
function monthHalves(y: number, m1: number): [number, number][] {
  return [
    [1, 15],
    [16, lastDayOfMonth(y, m1)],
  ];
}

/** September's three special periods (council C1), by payer type. */
function septemberPeriods(isEftPayer: boolean): [number, number][] {
  return isEftPayer
    ? [
        [1, 15],
        [16, 26],
        [27, 30],
      ]
    : [
        [1, 15],
        [16, 25],
        [26, 30],
      ];
}

/**
 * Every return period in a calendar year for a cadence, in chronological order. SEMIMONTHLY expands
 * September to three periods (25 periods/year for non-EFT and EFT alike, vs a naive 24).
 */
export function returnPeriodsForYear(year: number, cadence: ReturnCadence, isEftPayer = false): ReturnPeriod[] {
  const out: ReturnPeriod[] = [];
  if (cadence === "ANNUAL") {
    const end = endOfDay(year, 12, 31);
    out.push({ cadence: "ANNUAL", index: 0, start: startOfDay(year, 1, 1), end, dueDate: addDays(end, DUE_DAYS), label: `${year} (annual)` });
    return out;
  }
  if (cadence === "QUARTERLY") {
    for (let q = 0; q < 4; q++) {
      const startM = q * 3 + 1;
      const endM = q * 3 + 3;
      const end = endOfDay(year, endM, lastDayOfMonth(year, endM));
      out.push({ cadence: "QUARTERLY", index: q, start: startOfDay(year, startM, 1), end, dueDate: addDays(end, DUE_DAYS), label: `${year} · Q${q + 1}` });
    }
    return out;
  }
  // SEMIMONTHLY
  let index = 0;
  for (let m1 = 1; m1 <= 12; m1++) {
    const halves = m1 === 9 ? septemberPeriods(isEftPayer) : monthHalves(year, m1);
    for (const [dStart, dEnd] of halves) {
      const end = endOfDay(year, m1, dEnd);
      out.push({
        cadence: "SEMIMONTHLY",
        index,
        start: startOfDay(year, m1, dStart),
        end,
        dueDate: addDays(end, DUE_DAYS),
        label: `${year} · ${MONTH_ABBR[m1 - 1]} ${dStart}–${dEnd}`,
      });
      index++;
    }
  }
  return out;
}

/** The period at a given ordinal index (throws if out of range). */
export function returnPeriodBounds(year: number, cadence: ReturnCadence, index: number, isEftPayer = false): ReturnPeriod {
  const periods = returnPeriodsForYear(year, cadence, isEftPayer);
  const p = periods[index];
  if (!p) throw new Error(`No ${cadence} return period at index ${index} in ${year} (have ${periods.length}).`);
  return p;
}

/** The period that CONTAINS a given instant (or null). Used to default the generate screen to "now". */
export function returnPeriodContaining(date: Date, cadence: ReturnCadence, isEftPayer = false): ReturnPeriod | null {
  const periods = returnPeriodsForYear(date.getUTCFullYear(), cadence, isEftPayer);
  return periods.find((p) => date >= p.start && date <= p.end) ?? null;
}
