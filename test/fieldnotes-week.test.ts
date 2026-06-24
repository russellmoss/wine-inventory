import { describe, it, expect } from "vitest";
import {
  mostRecentFriday,
  isValidWeekOf,
  toISODateUTC,
  parseISODateUTC,
} from "@/lib/fieldnotes/week";

// 2000-01-01 (UTC) was a Saturday, so 2000-01-07 is a Friday. Anchor on it.
const utc = (y: number, m: number, d: number, h = 12) => new Date(Date.UTC(y, m - 1, d, h));

describe("mostRecentFriday", () => {
  it("returns today when today is Friday", () => {
    expect(mostRecentFriday(utc(2000, 1, 7))).toBe("2000-01-07");
  });
  it("walks back from Saturday/Sunday to the just-passed Friday", () => {
    expect(mostRecentFriday(utc(2000, 1, 8))).toBe("2000-01-07"); // Sat
    expect(mostRecentFriday(utc(2000, 1, 9))).toBe("2000-01-07"); // Sun
  });
  it("walks back from mid-week to the previous Friday", () => {
    expect(mostRecentFriday(utc(2000, 1, 13))).toBe("2000-01-07"); // Thu
    expect(mostRecentFriday(utc(2000, 1, 14))).toBe("2000-01-14"); // next Fri
  });
  it("always returns an actual Friday for a week-long sweep", () => {
    for (let d = 7; d <= 20; d++) {
      const iso = mostRecentFriday(utc(2000, 1, d));
      expect(parseISODateUTC(iso)!.getUTCDay()).toBe(5);
    }
  });
  it("ignores intra-day time (no local-time drift)", () => {
    expect(mostRecentFriday(utc(2000, 1, 8, 0))).toBe("2000-01-07");
    expect(mostRecentFriday(utc(2000, 1, 8, 23))).toBe("2000-01-07");
  });
});

describe("isValidWeekOf", () => {
  const now = utc(2000, 1, 20); // a Thursday, well after 2000-01-07
  it("accepts a passed Friday", () => {
    expect(isValidWeekOf("2000-01-07", now)).toBe(true);
    expect(isValidWeekOf("2000-01-14", now)).toBe(true);
  });
  it("rejects a non-Friday", () => {
    expect(isValidWeekOf("2000-01-06", now)).toBe(false); // Thu
    expect(isValidWeekOf("2000-01-08", now)).toBe(false); // Sat
  });
  it("rejects a future week", () => {
    expect(isValidWeekOf("2000-01-21", now)).toBe(false); // next Fri, future
  });
  it("rejects malformed or impossible dates", () => {
    expect(isValidWeekOf("not-a-date", now)).toBe(false);
    expect(isValidWeekOf("2000-02-30", now)).toBe(false);
    expect(isValidWeekOf("2000-13-01", now)).toBe(false);
  });
  it("round-trips toISODateUTC/parseISODateUTC", () => {
    const d = parseISODateUTC("2000-01-07")!;
    expect(toISODateUTC(d)).toBe("2000-01-07");
  });
});
