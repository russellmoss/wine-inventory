import type { OpenDeadline } from "./deadline-status";

// plan-027 Unit 7/8 (pure display) — shared presentation helpers for the dashboard widget, the nav
// badge, and the /compliance banner. Pure + DB-free so the same wording/tone is used everywhere.

/** "Due today" / "Due tomorrow" / "Due in 5 days" / "3 days overdue". */
export function deadlineWhen(d: Pick<OpenDeadline, "daysUntil" | "overdue">): string {
  if (d.overdue) {
    const n = Math.abs(d.daysUntil);
    return `${n} day${n === 1 ? "" : "s"} overdue`;
  }
  if (d.daysUntil === 0) return "Due today";
  if (d.daysUntil === 1) return "Due tomorrow";
  return `Due in ${d.daysUntil} days`;
}

/** Map the urgency tone to a Badge tone from the design system. */
export function deadlineBadgeTone(tone: OpenDeadline["tone"]): "red" | "gold" | "blue" {
  return tone === "danger" ? "red" : tone === "warning" ? "gold" : "blue";
}

/** "Operations report · June 2026" / "Excise return · 2026 · Jul 1–15". */
export function deadlineTitle(d: Pick<OpenDeadline, "form" | "label">): string {
  return `${d.form === "5120.17" ? "Operations report" : "Excise return"} · ${d.label}`;
}
