import { describe, expect, it } from "vitest";
import {
  combineDateAndTime,
  formatDueAt,
  normalizeTimeZone,
  parseClockTime,
  parseDueAt,
  toDateTimeLocalValue,
  toDueInputs,
  zonedClock,
  zonedDateKey,
  zonedWallClockToUtc,
} from "@/lib/work-orders/due-at";

const LA = "America/Los_Angeles";

describe("normalizeTimeZone", () => {
  it("passes a real IANA zone through", () => {
    expect(normalizeTimeZone(LA)).toBe(LA);
  });

  it("falls back to UTC for junk, empty, and missing zones", () => {
    expect(normalizeTimeZone("Mars/Olympus_Mons")).toBe("UTC");
    expect(normalizeTimeZone("")).toBe("UTC");
    expect(normalizeTimeZone(null)).toBe("UTC");
    expect(normalizeTimeZone(undefined)).toBe("UTC");
  });
});

describe("zonedWallClockToUtc", () => {
  it("reads the wall clock in the given zone, not the server's", () => {
    // 9am on 23 Jul in Los Angeles (PDT, UTC-7) is 16:00Z — the whole point of the feature.
    expect(zonedWallClockToUtc(2026, 7, 23, 9, 0, LA).toISOString()).toBe("2026-07-23T16:00:00.000Z");
  });

  it("uses the offset actually in force, not the standard one (DST)", () => {
    // Same wall clock in January is PST (UTC-8), so the instant differs by an hour.
    expect(zonedWallClockToUtc(2026, 1, 23, 9, 0, LA).toISOString()).toBe("2026-01-23T17:00:00.000Z");
  });

  it("resolves a wall clock right after a spring-forward changeover", () => {
    // 2026-03-08 02:00 PST → 03:00 PDT. 03:30 local is already PDT (UTC-7), so it sits at 10:30Z —
    // the naive single-pass offset (PST, UTC-8) would put it an hour late at 11:30Z.
    expect(zonedWallClockToUtc(2026, 3, 8, 3, 30, LA).toISOString()).toBe("2026-03-08T10:30:00.000Z");
    // The evening before the changeover is still PST.
    expect(zonedWallClockToUtc(2026, 3, 7, 22, 0, LA).toISOString()).toBe("2026-03-08T06:00:00.000Z");
  });

  it("treats UTC as a no-op", () => {
    expect(zonedWallClockToUtc(2026, 7, 23, 9, 0, "UTC").toISOString()).toBe("2026-07-23T09:00:00.000Z");
  });
});

describe("parseDueAt", () => {
  it("parses a date-only value as zone-local midnight and flags it as date-only", () => {
    const due = parseDueAt("2026-07-23", LA);
    expect(due?.hasTime).toBe(false);
    expect(due?.at.toISOString()).toBe("2026-07-23T07:00:00.000Z");
  });

  it("parses a datetime-local value and flags the time of day", () => {
    const due = parseDueAt("2026-07-23T09:00", LA);
    expect(due?.hasTime).toBe(true);
    expect(due?.at.toISOString()).toBe("2026-07-23T16:00:00.000Z");
  });

  it("accepts a space separator and seconds", () => {
    expect(parseDueAt("2026-07-23 09:00:00", LA)?.at.toISOString()).toBe("2026-07-23T16:00:00.000Z");
  });

  it("takes an already-zoned ISO instant at face value", () => {
    const due = parseDueAt("2026-07-23T16:00:00.000Z", LA);
    expect(due?.hasTime).toBe(true);
    expect(due?.at.toISOString()).toBe("2026-07-23T16:00:00.000Z");
  });

  it("returns null rather than guessing at anything else", () => {
    expect(parseDueAt("tomorrow", LA)).toBeNull();
    expect(parseDueAt("07/23/2026", LA)).toBeNull();
    expect(parseDueAt("", LA)).toBeNull();
    expect(parseDueAt(null, LA)).toBeNull();
    expect(parseDueAt(undefined, LA)).toBeNull();
  });
});

describe("parseClockTime", () => {
  it("normalizes the shapes a model actually emits", () => {
    expect(parseClockTime("09:00")).toBe("09:00");
    expect(parseClockTime("9:00")).toBe("09:00");
    expect(parseClockTime("9am")).toBe("09:00");
    expect(parseClockTime("9 AM")).toBe("09:00");
    expect(parseClockTime("9:30 p.m.")).toBe("21:30");
    expect(parseClockTime("0930")).toBe("09:30");
    expect(parseClockTime("17:45")).toBe("17:45");
  });

  it("handles the midnight/noon meridiem edges", () => {
    expect(parseClockTime("12am")).toBe("00:00");
    expect(parseClockTime("12pm")).toBe("12:00");
    expect(parseClockTime("12:30am")).toBe("00:30");
  });

  it("rejects out-of-range and non-times", () => {
    expect(parseClockTime("25:00")).toBeNull();
    expect(parseClockTime("09:71")).toBeNull();
    expect(parseClockTime("morning")).toBeNull();
    expect(parseClockTime("")).toBeNull();
    expect(parseClockTime(null)).toBeNull();
  });
});

describe("combineDateAndTime", () => {
  it("joins a date and a loose time", () => {
    expect(combineDateAndTime("2026-07-23", "9am")).toBe("2026-07-23T09:00");
  });

  it("keeps the date when no time is given", () => {
    expect(combineDateAndTime("2026-07-23", null)).toBe("2026-07-23");
    expect(combineDateAndTime("2026-07-23")).toBe("2026-07-23");
  });

  it("drops an unparseable time rather than losing the due date", () => {
    expect(combineDateAndTime("2026-07-23", "sometime in the morning")).toBe("2026-07-23");
  });

  it("tolerates the whole wall clock arriving in the date field", () => {
    expect(combineDateAndTime("2026-07-23T09:00")).toBe("2026-07-23T09:00");
  });

  it("returns null when there is no date at all", () => {
    expect(combineDateAndTime(null, "9am")).toBeNull();
    expect(combineDateAndTime("next tuesday", "9am")).toBeNull();
  });
});

describe("formatDueAt", () => {
  const at = new Date("2026-07-23T16:00:00.000Z");

  it("shows only the date when no time was requested", () => {
    expect(formatDueAt(at, false, LA)).toBe("2026-07-23");
  });

  it("shows the zone-local clock time when one was", () => {
    expect(formatDueAt(at, true, LA)).toBe("2026-07-23 at 9:00 AM");
    expect(formatDueAt(at, true, "UTC")).toBe("2026-07-23 at 4:00 PM");
  });

  it("is empty for no due date", () => {
    expect(formatDueAt(null, true, LA)).toBe("");
    expect(formatDueAt(new Date("nope"), true, LA)).toBe("");
  });
});

describe("toDateTimeLocalValue", () => {
  it("round-trips a wall clock through the input value and back", () => {
    const due = parseDueAt("2026-07-23T09:00", LA)!;
    expect(toDateTimeLocalValue(due.at, due.hasTime, LA)).toBe("2026-07-23T09:00");
    expect(parseDueAt(toDateTimeLocalValue(due.at, due.hasTime, LA), LA)?.at.toISOString()).toBe(due.at.toISOString());
  });

  it("renders a date-only due date without a time part", () => {
    const due = parseDueAt("2026-07-23", LA)!;
    expect(toDateTimeLocalValue(due.at, due.hasTime, LA)).toBe("2026-07-23");
  });

  it("accepts the ISO string the server DTOs carry", () => {
    expect(toDateTimeLocalValue("2026-07-23T16:00:00.000Z", true, LA)).toBe("2026-07-23T09:00");
  });

  it("is empty for no due date", () => {
    expect(toDateTimeLocalValue(null, true, LA)).toBe("");
    expect(toDateTimeLocalValue("not a date", true, LA)).toBe("");
  });
});

describe("toDueInputs", () => {
  it("splits a timed due date into the date and time controls", () => {
    expect(toDueInputs("2026-07-23T16:00:00.000Z", true, LA)).toEqual({ date: "2026-07-23", time: "09:00" });
  });

  it("leaves the time control empty for a date-only due date — that IS the date-only state", () => {
    expect(toDueInputs("2026-07-23T07:00:00.000Z", false, LA)).toEqual({ date: "2026-07-23", time: "" });
  });

  it("is empty for no due date", () => {
    expect(toDueInputs(null, false, LA)).toEqual({ date: "", time: "" });
  });

  it("round-trips back through combineDateAndTime + parseDueAt", () => {
    const stored = new Date("2026-07-23T16:00:00.000Z");
    const { date, time } = toDueInputs(stored, true, LA);
    const due = parseDueAt(combineDateAndTime(date, time), LA);
    expect(due?.at.toISOString()).toBe(stored.toISOString());
    expect(due?.hasTime).toBe(true);
  });
});

describe("zoned readers", () => {
  it("reports the zone-local date and clock of an instant", () => {
    const at = new Date("2026-07-24T02:00:00.000Z"); // still the 23rd in Los Angeles
    expect(zonedDateKey(at, LA)).toBe("2026-07-23");
    expect(zonedClock(at, LA)).toBe("19:00");
    expect(zonedDateKey(at, "UTC")).toBe("2026-07-24");
  });
});
