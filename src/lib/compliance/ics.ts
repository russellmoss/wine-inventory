// plan-027 Unit 9 — build an .ics (RFC 5545) of filing deadlines. Pure, DB-free, tested. Universal
// (Google/Apple/Outlook). Each deadline is one all-day VEVENT with a STABLE UID (tenant+periodKey, no
// mark/date) so a re-import UPDATES the event instead of duplicating (council DQ8), plus VALARMs at
// −1 week / −2 days / day-of.

import type { Deadline } from "./deadlines";

const FORM_SHORT: Record<Deadline["form"], string> = { "5120.17": "TTB 5120.17", "5000.24": "TTB 5000.24" };

/** YYYYMMDD (RFC 5545 DATE value) from a UTC date-only. */
const icsDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
/** Escape TEXT per RFC 5545 (backslash, comma, semicolon, newline). */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export type IcsOptions = { tenantId?: string; calName?: string; dtStampIso?: string };

/**
 * Serialize deadlines to a VCALENDAR string. `dtStampIso` is injectable for deterministic tests
 * (defaults to a fixed stamp; callers in a request can pass `new Date().toISOString()`).
 */
export function buildIcs(deadlines: Deadline[], opts: IcsOptions = {}): string {
  const calName = opts.calName ?? "TTB Filing Deadlines";
  const domain = "bwc-compliance";
  const dtstamp = (opts.dtStampIso ?? "2026-01-01T00:00:00Z").replace(/[-:]/g, "").replace(/\.\d+/, "").replace(/Z$/, "Z");
  const uidTenant = opts.tenantId ? `${opts.tenantId}.` : "";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Cellarhand//Compliance//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
  ];

  for (const d of deadlines) {
    const start = d.effectiveDueDate;
    const summary = `${FORM_SHORT[d.form]} due — ${d.label}`;
    const desc = `Federal ${d.form} filing due ${d.dueDateStr}. Review & file in the Compliance screen.`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uidTenant}${d.periodKey}@${domain}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(start, 1))}`, // all-day (exclusive end)
      `SUMMARY:${esc(summary)}`,
      `DESCRIPTION:${esc(desc)}`,
      "TRANSP:TRANSPARENT",
      // Alarms: 1 week out, 2 days out, and the morning it's due.
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(summary)} (1 week)`,
      "TRIGGER:-P7D",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(summary)} (2 days)`,
      "TRIGGER:-P2D",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(summary)} (today)`,
      "TRIGGER:PT0S",
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
