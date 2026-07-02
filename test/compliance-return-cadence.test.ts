import { describe, it, expect } from "vitest";
import { returnPeriodsForYear, returnPeriodBounds, returnPeriodContaining } from "@/lib/compliance/return-cadence";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe("return-cadence — semimonthly halves (plan-026 Unit 4)", () => {
  it("splits a 31-day month into 1–15 and 16–31", () => {
    const jan = returnPeriodsForYear(2026, "SEMIMONTHLY").filter((p) => p.start.getUTCMonth() === 0);
    expect(jan).toHaveLength(2);
    expect(ymd(jan[0].start)).toBe("2026-01-01");
    expect(ymd(jan[0].end)).toBe("2026-01-15");
    expect(ymd(jan[1].start)).toBe("2026-01-16");
    expect(ymd(jan[1].end)).toBe("2026-01-31");
  });

  it("handles 30-day months and February (28 and leap 29)", () => {
    const apr = returnPeriodsForYear(2026, "SEMIMONTHLY").filter((p) => p.start.getUTCMonth() === 3);
    expect(ymd(apr[1].end)).toBe("2026-04-30");
    const feb2026 = returnPeriodsForYear(2026, "SEMIMONTHLY").filter((p) => p.start.getUTCMonth() === 1);
    expect(ymd(feb2026[1].end)).toBe("2026-02-28");
    const feb2028 = returnPeriodsForYear(2028, "SEMIMONTHLY").filter((p) => p.start.getUTCMonth() === 1);
    expect(ymd(feb2028[1].end)).toBe("2028-02-29"); // leap
  });

  it("due date = period end + 14 days", () => {
    const [first] = returnPeriodsForYear(2026, "SEMIMONTHLY");
    // Jan 15 end-of-day + 14 days → Jan 29.
    expect(ymd(first.dueDate)).toBe("2026-01-29");
  });

  it("a full year has 25 semimonthly periods (September's split adds one)", () => {
    expect(returnPeriodsForYear(2026, "SEMIMONTHLY").length).toBe(25);
    expect(returnPeriodsForYear(2026, "SEMIMONTHLY", true).length).toBe(25);
  });
});

describe("return-cadence — the SEPTEMBER split (council C1)", () => {
  const sep = (eft: boolean) => returnPeriodsForYear(2026, "SEMIMONTHLY", eft).filter((p) => p.start.getUTCMonth() === 8);

  it("non-EFT: three periods 1–15 / 16–25 / 26–30", () => {
    const s = sep(false);
    expect(s).toHaveLength(3);
    expect([ymd(s[0].start), ymd(s[0].end)]).toEqual(["2026-09-01", "2026-09-15"]);
    expect([ymd(s[1].start), ymd(s[1].end)]).toEqual(["2026-09-16", "2026-09-25"]);
    expect([ymd(s[2].start), ymd(s[2].end)]).toEqual(["2026-09-26", "2026-09-30"]);
  });

  it("EFT: three periods 1–15 / 16–26 / 27–30", () => {
    const s = sep(true);
    expect(s).toHaveLength(3);
    expect([ymd(s[0].start), ymd(s[0].end)]).toEqual(["2026-09-01", "2026-09-15"]);
    expect([ymd(s[1].start), ymd(s[1].end)]).toEqual(["2026-09-16", "2026-09-26"]);
    expect([ymd(s[2].start), ymd(s[2].end)]).toEqual(["2026-09-27", "2026-09-30"]);
  });
});

describe("return-cadence — quarterly & annual", () => {
  it("quarterly windows + due dates", () => {
    const qs = returnPeriodsForYear(2026, "QUARTERLY");
    expect(qs).toHaveLength(4);
    expect([ymd(qs[0].start), ymd(qs[0].end)]).toEqual(["2026-01-01", "2026-03-31"]);
    expect([ymd(qs[2].start), ymd(qs[2].end)]).toEqual(["2026-07-01", "2026-09-30"]);
    expect([ymd(qs[3].start), ymd(qs[3].end)]).toEqual(["2026-10-01", "2026-12-31"]);
    expect(ymd(qs[0].dueDate)).toBe("2026-04-14"); // Mar 31 + 14
  });

  it("annual window is the whole calendar year", () => {
    const [y] = returnPeriodsForYear(2026, "ANNUAL");
    expect([ymd(y.start), ymd(y.end)]).toEqual(["2026-01-01", "2026-12-31"]);
    expect(ymd(y.dueDate)).toBe("2027-01-14");
  });

  it("returnPeriodBounds indexes into the year; out-of-range throws", () => {
    expect(returnPeriodBounds(2026, "QUARTERLY", 2).label).toBe("2026 · Q3");
    expect(() => returnPeriodBounds(2026, "QUARTERLY", 4)).toThrow();
  });

  it("returnPeriodContaining finds the period for an instant", () => {
    const p = returnPeriodContaining(new Date(Date.UTC(2026, 8, 20)), "SEMIMONTHLY", false); // Sep 20
    expect(p && [ymd(p.start), ymd(p.end)]).toEqual(["2026-09-16", "2026-09-25"]);
  });
});
