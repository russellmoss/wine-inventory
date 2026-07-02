import { describe, it, expect } from "vitest";
import { buildIcs } from "@/lib/compliance/ics";
import { reminderEmail } from "@/lib/compliance/reminder-email";
import type { Deadline } from "@/lib/compliance/deadlines";

const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const dl = (over: Partial<Deadline>): Deadline => ({
  form: "5120.17",
  cadence: "MONTHLY",
  periodStart: utc("2026-06-01"),
  periodEnd: utc("2026-06-30"),
  periodKey: "5120.17:2026-06-30",
  dueDate: utc("2026-07-15"),
  effectiveDueDate: utc("2026-07-15"),
  dueDateStr: "2026-07-15",
  label: "2026 · Jun",
  ...over,
});

describe("buildIcs (plan-027 Unit 9)", () => {
  const ics = buildIcs([dl({}), dl({ form: "5000.24", periodKey: "5000.24:2026-06-30", dueDateStr: "2026-07-14", effectiveDueDate: utc("2026-07-14") })], { tenantId: "org_x" });

  it("is a valid VCALENDAR", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics.split("\r\n").every((l) => l.length <= 998)).toBe(true); // RFC line-length sanity
  });
  it("one VEVENT per deadline with a stable, tenant-scoped UID (no date/mark in it)", () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("UID:org_x.5120.17:2026-06-30@bwc-compliance");
    expect(ics).not.toMatch(/UID:[^\r\n]*2026-07-15/); // UID must not embed the due date
  });
  it("all-day event + 3 alarms (−1w/−2d/day-of)", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20260715");
    expect(ics).toContain("TRIGGER:-P7D");
    expect(ics).toContain("TRIGGER:-P2D");
    expect(ics).toContain("TRIGGER:PT0S");
  });
});

describe("reminderEmail (plan-027 Unit 4)", () => {
  it("subject + body reflect a due-soon deadline", () => {
    const { subject, html } = reminderEmail({ form: "5120.17", label: "2026 · Jun", dueDateStr: "2026-07-15", daysUntil: 2 });
    expect(subject).toBe("TTB 5120.17 due in 2 days — 2026 · Jun");
    expect(html).toContain("Review &amp; file");
    expect(html).toContain("2026-07-15");
  });
  it("handles day-of + overdue phrasing", () => {
    expect(reminderEmail({ form: "5000.24", label: "2026 · Jun 16–30", dueDateStr: "2026-07-14", daysUntil: 0 }).subject).toBe("TTB 5000.24 due today — 2026 · Jun 16–30");
    expect(reminderEmail({ form: "5000.24", label: "x", dueDateStr: "2026-07-14", daysUntil: -3 }).subject).toContain("overdue by 3 days");
  });
});
