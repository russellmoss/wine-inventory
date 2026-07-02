import { describe, it, expect } from "vitest";
import { classifyDeadlines, dueMarkToday } from "@/lib/compliance/deadline-status";
import type { Deadline } from "@/lib/compliance/deadlines";

const utc = (s: string) => new Date(`${s}T00:00:00Z`);

function mk(over: Partial<Deadline>): Deadline {
  const eff = over.effectiveDueDate ?? utc("2026-07-15");
  return {
    form: "5120.17",
    cadence: "MONTHLY",
    periodStart: utc("2026-06-01"),
    periodEnd: utc("2026-06-30"),
    periodKey: "5120.17:2026-06-30",
    dueDate: eff,
    effectiveDueDate: eff,
    dueDateStr: eff.toISOString().slice(0, 10),
    label: "2026 · Jun",
    ...over,
  };
}

describe("classifyDeadlines (plan-027 Unit 3)", () => {
  it("drops a FILED period", () => {
    const d = mk({});
    const open = classifyDeadlines({ deadlines: [d], asOf: utc("2026-07-10"), filedKeys: new Set([d.periodKey]) });
    expect(open).toHaveLength(0);
  });

  it("drops a $0-liability 5000.24 period (C2) but not a 5120.17 at $0", () => {
    const excise = mk({ form: "5000.24", periodKey: "5000.24:2026-06-30", cadence: "SEMIMONTHLY" });
    const ops = mk({ periodKey: "5120.17:2026-06-30" });
    const open = classifyDeadlines({
      deadlines: [excise, ops],
      asOf: utc("2026-07-10"),
      filedKeys: new Set(),
      zeroLiabilityKeys: new Set(["5000.24:2026-06-30", "5120.17:2026-06-30"]),
    });
    expect(open.map((o) => o.form)).toEqual(["5120.17"]); // ops kept even though "zero" listed
  });

  it("annotates daysUntil + urgency tone", () => {
    const [open] = classifyDeadlines({ deadlines: [mk({ effectiveDueDate: utc("2026-07-15") })], asOf: utc("2026-07-14"), filedKeys: new Set() });
    expect(open.daysUntil).toBe(1);
    expect(open.tone).toBe("danger"); // ≤2 days
    expect(open.overdue).toBe(false);
  });

  it("flags overdue", () => {
    const [open] = classifyDeadlines({ deadlines: [mk({ effectiveDueDate: utc("2026-07-10") })], asOf: utc("2026-07-15"), filedKeys: new Set() });
    expect(open.overdue).toBe(true);
    expect(open.daysUntil).toBe(-5);
  });
});

describe("dueMarkToday", () => {
  const d = (days: number, cadence = "MONTHLY") => mk({ cadence, effectiveDueDate: utc("2026-07-15"), dueDateStr: "2026-07-15" });
  it("fires WEEK/TWO_DAY/DAY_OF at 7/2/0 days out", () => {
    expect(dueMarkToday(d(7), utc("2026-07-08"))).toBe("WEEK");
    expect(dueMarkToday(d(2), utc("2026-07-13"))).toBe("TWO_DAY");
    expect(dueMarkToday(d(0), utc("2026-07-15"))).toBe("DAY_OF");
    expect(dueMarkToday(d(0), utc("2026-07-10"))).toBeNull(); // 5 days out → no mark
  });
  it("SEMIMONTHLY drops the 1-week mark (S3) but keeps 2-day/day-of", () => {
    const sm = mk({ cadence: "SEMIMONTHLY", effectiveDueDate: utc("2026-07-15") });
    expect(dueMarkToday(sm, utc("2026-07-08"))).toBeNull(); // would be WEEK, dropped
    expect(dueMarkToday(sm, utc("2026-07-13"))).toBe("TWO_DAY");
    expect(dueMarkToday(sm, utc("2026-07-15"))).toBe("DAY_OF");
  });
});
