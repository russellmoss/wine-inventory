import { describe, it, expect } from "vitest";
import { bucketFor, bucketWorkOrders } from "@/lib/work-orders/buckets";

const NOW = new Date("2026-07-03T12:00:00");

describe("bucketFor", () => {
  it("classifies by due date relative to today", () => {
    expect(bucketFor(new Date("2026-07-01T09:00:00"), NOW)).toBe("overdue");
    expect(bucketFor(new Date("2026-07-03T08:00:00"), NOW)).toBe("today"); // earlier today still 'today'
    expect(bucketFor(new Date("2026-07-03T23:00:00"), NOW)).toBe("today");
    expect(bucketFor(new Date("2026-07-05T09:00:00"), NOW)).toBe("upcoming");
    expect(bucketFor(null, NOW)).toBe("unscheduled");
  });

  it("uses the WINERY's calendar day when a zone is given, not the server's", () => {
    // The bug this closes: a WO due 9pm Eastern is 01:00Z the NEXT day. Bucketed on a UTC server it
    // read "upcoming" on the very evening the crew had to do it.
    const nowEastern = new Date("2026-07-03T18:00:00.000Z"); // 2pm Jul 3 in New York
    const dueEastern9pm = new Date("2026-07-04T01:00:00.000Z"); // 9pm Jul 3 in New York

    expect(bucketFor(dueEastern9pm, nowEastern, "America/New_York")).toBe("today");
    expect(bucketFor(dueEastern9pm, nowEastern, "UTC")).toBe("upcoming"); // the old, server-clock answer
  });

  it("reads the other direction too — a zone ahead of UTC", () => {
    // 7am Jul 4 in Thimphu (UTC+6) is still Jul 3 in UTC.
    const nowThimphu = new Date("2026-07-03T20:00:00.000Z"); // 2am Jul 4 in Thimphu
    const due7amJul4 = new Date("2026-07-04T01:00:00.000Z");

    expect(bucketFor(due7amJul4, nowThimphu, "Asia/Thimphu")).toBe("today");
    expect(bucketFor(due7amJul4, nowThimphu, "UTC")).toBe("upcoming");
  });

  it("falls back to server-local day boundaries when no zone is configured", () => {
    // Unchanged behaviour for a tenant that never sets a winery timezone.
    expect(bucketFor(new Date("2026-07-03T08:00:00"), NOW)).toBe("today");
    expect(bucketFor(new Date("2026-07-03T08:00:00"), NOW, undefined)).toBe("today");
  });
});

describe("bucketWorkOrders", () => {
  it("groups items into the four buckets, preserving order", () => {
    const items = [
      { id: "a", dueAt: new Date("2026-07-01T09:00:00") }, // overdue
      { id: "b", dueAt: new Date("2026-07-03T10:00:00") }, // today
      { id: "c", dueAt: null }, // unscheduled
      { id: "d", dueAt: new Date("2026-07-10T09:00:00") }, // upcoming
      { id: "e", dueAt: new Date("2026-06-30T09:00:00") }, // overdue
    ];
    const b = bucketWorkOrders(items, NOW);
    expect(b.overdue.map((x) => x.id)).toEqual(["a", "e"]);
    expect(b.today.map((x) => x.id)).toEqual(["b"]);
    expect(b.upcoming.map((x) => x.id)).toEqual(["d"]);
    expect(b.unscheduled.map((x) => x.id)).toEqual(["c"]);
  });
});
