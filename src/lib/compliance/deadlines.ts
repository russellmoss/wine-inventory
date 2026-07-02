// plan-027 Unit 2 — the filing-deadline calendar. Pure, DB-free, tested. Given a tenant's cadence
// settings and a date window, enumerate every TTB filing deadline with its statutory + business-day-
// rolled due date. This is the ONE source of due-date truth (widget, badge, banner, cron, .ics).
//
//   5120.17 (operations) — due = period end + 15 days, roll FORWARD (27 CFR 24.300(g)).
//   5000.24 (excise)     — due = return period end + 14 days, roll BACKWARD (27 CFR 24.271(c)(1)(i)).
// The excise periods (incl. the September triple-split) come from plan-026 return-cadence.ts.

import { businessDayRoll } from "./holidays";
import { returnPeriodsForYear } from "./return-cadence";
import type { ReturnCadence } from "./types";

export type FormId = "5120.17" | "5000.24";
export type OpsCadence = "MONTHLY" | "QUARTERLY" | "ANNUAL";

export type Deadline = {
  form: FormId;
  cadence: string;
  periodStart: Date; // UTC date-only
  periodEnd: Date; // UTC date-only (last day of the period)
  /** Stable key for dedupe + .ics UID + filed-status matching: `${form}:${periodEnd YYYY-MM-DD}`. */
  periodKey: string;
  dueDate: Date; // statutory raw due (date-only, pre-roll)
  effectiveDueDate: Date; // after the business-day roll (date-only)
  dueDateStr: string; // effectiveDueDate as YYYY-MM-DD (the send/compare key — no Date-object drift, S1)
  label: string;
};

const DAY = 86_400_000;
const dateOnly = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const lastDay = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate();
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Operations-report (5120.17) periods for a year, by cadence. */
function opsPeriods(year: number, cadence: OpsCadence): { start: Date; end: Date; label: string }[] {
  if (cadence === "ANNUAL") return [{ start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31)), label: `${year} (annual)` }];
  if (cadence === "QUARTERLY")
    return [0, 1, 2, 3].map((q) => ({
      start: new Date(Date.UTC(year, q * 3, 1)),
      end: new Date(Date.UTC(year, q * 3 + 2, lastDay(year, q * 3 + 3))),
      label: `${year} · Q${q + 1}`,
    }));
  return Array.from({ length: 12 }, (_, m) => ({
    start: new Date(Date.UTC(year, m, 1)),
    end: new Date(Date.UTC(year, m, lastDay(year, m + 1))),
    label: `${year} · ${MONTH[m]}`,
  }));
}

function opsDeadlines(year: number, cadence: OpsCadence): Deadline[] {
  return opsPeriods(year, cadence).map((p) => {
    const due = addDays(p.end, 15); // 15th day after period end (24.300(g))
    const eff = businessDayRoll(due, "FORWARD");
    return {
      form: "5120.17" as const,
      cadence,
      periodStart: p.start,
      periodEnd: p.end,
      periodKey: `5120.17:${ymd(p.end)}`,
      dueDate: due,
      effectiveDueDate: eff,
      dueDateStr: ymd(eff),
      label: p.label,
    };
  });
}

function exciseDeadlines(year: number, cadence: ReturnCadence, isEftPayer: boolean): Deadline[] {
  return returnPeriodsForYear(year, cadence, isEftPayer).map((p) => {
    const end = dateOnly(p.end);
    const due = dateOnly(p.dueDate); // period end + 14 (from return-cadence)
    const eff = businessDayRoll(due, "BACKWARD"); // excise rolls BACKWARD (24.271(c)(1)(i))
    return {
      form: "5000.24" as const,
      cadence,
      periodStart: dateOnly(p.start),
      periodEnd: end,
      periodKey: `5000.24:${ymd(end)}`,
      dueDate: due,
      effectiveDueDate: eff,
      dueDateStr: ymd(eff),
      label: p.label,
    };
  });
}

export type DeadlineConfig = {
  opsCadence: OpsCadence;
  /** Omit to exclude the 5000.24 stream (e.g. before plan-026's excise engine is enabled for a tenant). */
  returnCadence?: ReturnCadence | null;
  isEftPayer?: boolean;
};

/**
 * All filing deadlines whose EFFECTIVE due date falls within [from, to] (date-only, inclusive),
 * sorted by due date. Spans year boundaries. `returnCadence` omitted ⇒ only the 5120.17 stream.
 */
export function upcomingDeadlines(cfg: DeadlineConfig, window: { from: Date; to: Date }): Deadline[] {
  const fromD = dateOnly(window.from);
  const toD = dateOnly(window.to);
  const out: Deadline[] = [];
  for (let y = fromD.getUTCFullYear(); y <= toD.getUTCFullYear(); y++) {
    out.push(...opsDeadlines(y, cfg.opsCadence));
    if (cfg.returnCadence) out.push(...exciseDeadlines(y, cfg.returnCadence, cfg.isEftPayer ?? false));
  }
  return out
    .filter((d) => d.effectiveDueDate >= fromD && d.effectiveDueDate <= toD)
    .sort((a, b) => a.effectiveDueDate.getTime() - b.effectiveDueDate.getTime());
}
