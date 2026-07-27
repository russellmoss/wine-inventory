import { describe, expect, it } from "vitest";
import { resolveSiteTimeZone, siteTodayIso } from "@/lib/weather/site-time-core";

// Plan 096 U2 — the single site-local "today". The UTC-boundary cases are the whole point:
// a positive offset (Asia/Thimphu +6) and a negative one (America/Los_Angeles −8) must each
// flip the civil day relative to UTC at a fixed instant.

describe("resolveSiteTimeZone — fallback chain (first real zone wins)", () => {
  it("config zone wins over everything", () => {
    expect(resolveSiteTimeZone("Asia/Thimphu", "America/New_York", "Europe/Paris")).toBe("Asia/Thimphu");
  });
  it("null config → winery AppSettings zone", () => {
    expect(resolveSiteTimeZone(null, "America/New_York", "Europe/Paris")).toBe("America/New_York");
  });
  it("null config + null winery → viewer zone", () => {
    expect(resolveSiteTimeZone(null, null, "Europe/Paris")).toBe("Europe/Paris");
  });
  it("all null → UTC", () => {
    expect(resolveSiteTimeZone(null, null, null)).toBe("UTC");
    expect(resolveSiteTimeZone(undefined, undefined)).toBe("UTC");
  });
  it("an invalid config zone falls through to the next link", () => {
    expect(resolveSiteTimeZone("Not/AZone", "America/Los_Angeles")).toBe("America/Los_Angeles");
  });
});

describe("siteTodayIso — UTC-boundary day flips", () => {
  // 19:00 UTC Jan 15 = 01:00 Jan 16 in Thimphu (+6): the site is already on TOMORROW.
  it("Asia/Thimphu (+6): 19:00Z Jan 15 is already Jan 16 locally", () => {
    const now = new Date("2026-01-15T19:00:00.000Z");
    expect(siteTodayIso("Asia/Thimphu", now)).toBe("2026-01-16");
    expect(siteTodayIso("UTC", now)).toBe("2026-01-15");
  });
  // 05:00 UTC Jan 16 = 21:00 Jan 15 in LA (−8): the site is still on YESTERDAY.
  it("America/Los_Angeles (−8): 05:00Z Jan 16 is still Jan 15 locally", () => {
    const now = new Date("2026-01-16T05:00:00.000Z");
    expect(siteTodayIso("America/Los_Angeles", now)).toBe("2026-01-15");
    expect(siteTodayIso("UTC", now)).toBe("2026-01-16");
  });
  it("a bad zone degrades to UTC instead of throwing", () => {
    const now = new Date("2026-01-15T19:00:00.000Z");
    expect(siteTodayIso("Not/AZone", now)).toBe("2026-01-15");
  });
});
