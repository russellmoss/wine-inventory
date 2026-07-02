import { describe, it, expect } from "vitest";
import { upcomingDeadlines, type Deadline } from "@/lib/compliance/deadlines";

const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const find = (ds: Deadline[], key: string) => ds.find((d) => d.periodKey === key);

describe("upcomingDeadlines (plan-027 Unit 2)", () => {
  const yearWindow = { from: utc("2026-01-01"), to: utc("2027-02-01") };

  it("5120.17 monthly June 2026 is due Jul 15 (forward-rolled; Wed, no shift)", () => {
    const ds = upcomingDeadlines({ opsCadence: "MONTHLY" }, yearWindow);
    const june = find(ds, "5120.17:2026-06-30");
    expect(june?.dueDateStr).toBe("2026-07-15");
    expect(june?.form).toBe("5120.17");
  });

  it("5120.17 December rolls into the NEXT year (due Jan 15 2027)", () => {
    const ds = upcomingDeadlines({ opsCadence: "MONTHLY" }, yearWindow);
    expect(find(ds, "5120.17:2026-12-31")?.dueDateStr).toBe("2027-01-15");
  });

  it("omitting returnCadence yields ONLY the 5120.17 stream", () => {
    const ds = upcomingDeadlines({ opsCadence: "MONTHLY" }, yearWindow);
    expect(ds.every((d) => d.form === "5120.17")).toBe(true);
  });

  it("5000.24 semimonthly adds the excise stream, incl. the September 3-split", () => {
    const ds = upcomingDeadlines({ opsCadence: "MONTHLY", returnCadence: "SEMIMONTHLY" }, yearWindow);
    const excise = ds.filter((d) => d.form === "5000.24");
    expect(excise.length).toBeGreaterThan(20);
    const september = excise.filter((d) => d.periodEnd.getUTCMonth() === 8); // Sep = month 8
    expect(september).toHaveLength(3); // Sep 1–15, 16–25, 26–30 (non-EFT)
  });

  it("excise due dates roll BACKWARD to a business day", () => {
    const ds = upcomingDeadlines({ opsCadence: "MONTHLY", returnCadence: "SEMIMONTHLY" }, yearWindow);
    for (const d of ds.filter((x) => x.form === "5000.24")) {
      // effective due is never AFTER the statutory due (backward roll only pulls earlier or stays)
      expect(d.effectiveDueDate.getTime()).toBeLessThanOrEqual(d.dueDate.getTime());
    }
  });

  it("results are sorted by effective due date and within the window", () => {
    const ds = upcomingDeadlines({ opsCadence: "QUARTERLY", returnCadence: "QUARTERLY" }, yearWindow);
    for (let i = 1; i < ds.length; i++) expect(ds[i].effectiveDueDate.getTime()).toBeGreaterThanOrEqual(ds[i - 1].effectiveDueDate.getTime());
    expect(ds.every((d) => d.effectiveDueDate >= yearWindow.from && d.effectiveDueDate <= yearWindow.to)).toBe(true);
  });
});
