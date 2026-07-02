import { describe, it, expect } from "vitest";
import { federalHolidays, isBusinessDay, businessDayRoll } from "@/lib/compliance/holidays";

const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe("federalHolidays (plan-027)", () => {
  const h = federalHolidays(2026);
  it("yields the 11 federal holidays", () => expect(h).toHaveLength(11));
  it("MLK = 3rd Monday of January 2026 (Jan 19)", () => expect(h).toContain("2026-01-19"));
  it("Christmas 2026 (Fri) = Dec 25", () => expect(h).toContain("2026-12-25"));
  it("Juneteenth 2026 (Fri) = Jun 19", () => expect(h).toContain("2026-06-19"));
  it("Independence Day 2026 (Sat Jul 4) is OBSERVED on Fri Jul 3", () => {
    expect(h).toContain("2026-07-03");
    expect(h).not.toContain("2026-07-04");
  });
  it("Thanksgiving 2026 = 4th Thursday (Nov 26)", () => expect(h).toContain("2026-11-26"));
});

describe("businessDayRoll", () => {
  it("a business day is unchanged (idempotent)", () => {
    const wed = utc("2026-07-15"); // Wednesday, not a holiday
    expect(ymd(businessDayRoll(wed, "FORWARD"))).toBe("2026-07-15");
    expect(ymd(businessDayRoll(wed, "BACKWARD"))).toBe("2026-07-15");
  });
  it("Christmas (Fri, holiday) rolls FORWARD past the weekend to Mon Dec 28", () => {
    expect(ymd(businessDayRoll(utc("2026-12-25"), "FORWARD"))).toBe("2026-12-28");
  });
  it("Christmas (Fri, holiday) rolls BACKWARD to Thu Dec 24", () => {
    expect(ymd(businessDayRoll(utc("2026-12-25"), "BACKWARD"))).toBe("2026-12-24");
  });
  it("Sat Jul 4 rolls BACKWARD past the observed-holiday Fri Jul 3 to Thu Jul 2", () => {
    expect(ymd(businessDayRoll(utc("2026-07-04"), "BACKWARD"))).toBe("2026-07-02");
  });
  it("Sat Jul 4 rolls FORWARD to Mon Jul 6", () => {
    expect(ymd(businessDayRoll(utc("2026-07-04"), "FORWARD"))).toBe("2026-07-06");
  });
  it("isBusinessDay is false on weekends + holidays, true on a plain weekday", () => {
    expect(isBusinessDay(utc("2026-07-15"))).toBe(true);
    expect(isBusinessDay(utc("2026-07-04"))).toBe(false); // Saturday
    expect(isBusinessDay(utc("2026-12-25"))).toBe(false); // Christmas
  });
});
