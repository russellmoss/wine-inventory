// plan-027 Unit 3 (pure core) — turn the deadline calendar into OPEN deadlines + the reminder mark to
// fire today. Pure, DB-free, tested. The DB wrapper (query FILED reports, compute $0-liability keys)
// lives in the service layer and feeds this; keeping the logic pure makes it unit-testable.

import type { Deadline } from "./deadlines";

export type ReminderMark = "WEEK" | "TWO_DAY" | "DAY_OF";
export type UrgencyTone = "danger" | "warning" | "info";
export type OpenDeadline = Deadline & { daysUntil: number; overdue: boolean; tone: UrgencyTone };

const DAY = 86_400_000;
const dateOnlyMs = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export type ClassifyInput = {
  deadlines: Deadline[];
  asOf: Date;
  /** periodKeys with a FILED report (excluding re-opened/amended) → dropped as done (council S5). */
  filedKeys: ReadonlySet<string>;
  /** 5000.24 periodKeys whose computed liability is $0 → dropped: need not be filed (council C2). */
  zeroLiabilityKeys?: ReadonlySet<string>;
};

/** Open deadlines (filed + $0-excise dropped), annotated with daysUntil + urgency tone. For the UI. */
export function classifyDeadlines(input: ClassifyInput): OpenDeadline[] {
  const asOf = dateOnlyMs(input.asOf);
  const zero = input.zeroLiabilityKeys ?? new Set<string>();
  return input.deadlines
    .filter((d) => !input.filedKeys.has(d.periodKey))
    .filter((d) => !(d.form === "5000.24" && zero.has(d.periodKey)))
    .map((d) => {
      const daysUntil = Math.round((dateOnlyMs(d.effectiveDueDate) - asOf) / DAY);
      const tone: UrgencyTone = daysUntil <= 2 ? "danger" : daysUntil <= 7 ? "warning" : "info";
      return { ...d, daysUntil, overdue: daysUntil < 0, tone };
    });
}

/**
 * The email reminder mark to fire TODAY for a deadline, or null. Marks at 7 / 2 / 0 days before the
 * effective due date (compared as UTC date-only — no Date-object drift, council S1). SEMIMONTHLY drops
 * the 1-week mark (~15-day period → a week-out reminder lands ~1 day after the period ends = noise, S3).
 */
export function dueMarkToday(d: Deadline, asOf: Date): ReminderMark | null {
  const daysUntil = Math.round((dateOnlyMs(d.effectiveDueDate) - dateOnlyMs(asOf)) / DAY);
  if (daysUntil === 0) return "DAY_OF";
  if (daysUntil === 2) return "TWO_DAY";
  if (daysUntil === 7 && d.cadence !== "SEMIMONTHLY") return "WEEK";
  return null;
}
