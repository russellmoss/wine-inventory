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
