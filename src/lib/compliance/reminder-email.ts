// plan-027 Unit 4 — the compliance reminder email (subject + branded HTML). Pure + DB-free (no
// server-only import) so it's unit-testable; the cron imports `sendEmail` separately. One deadline per
// email so the subject is actionable (council/design D4). Brand matches src/lib/email.ts.

import type { FormId } from "./deadlines";

function baseUrl(): string {
  return (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

const FORM_LABEL: Record<FormId, string> = {
  "5120.17": "Report of Wine Premises Operations (TTB F 5120.17)",
  "5000.24": "Wine Excise Tax Return (TTB F 5000.24)",
};
const FORM_SHORT: Record<FormId, string> = { "5120.17": "TTB 5120.17", "5000.24": "TTB 5000.24" };

export type ReminderEmailInput = { form: FormId; label: string; dueDateStr: string; daysUntil: number };

/** When-phrase for subject + body from a signed days-until. */
function whenPhrase(daysUntil: number): string {
  if (daysUntil < 0) return `overdue by ${-daysUntil} day${daysUntil === -1 ? "" : "s"}`;
  if (daysUntil === 0) return "due today";
  return `due in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
}

export function reminderEmail(input: ReminderEmailInput): { subject: string; html: string } {
  const when = whenPhrase(input.daysUntil);
  const subject = `${FORM_SHORT[input.form]} ${when} — ${input.label}`;
  const url = `${baseUrl()}/compliance`;
  const danger = input.daysUntil <= 2;
  const html = `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:24px;color:#2b2b2b">
    <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7a2e2e;margin:0 0 4px">Bhutan Wine Company · Compliance</p>
    <h1 style="font-size:23px;font-weight:400;margin:0 0 8px">Filing reminder</h1>
    <p style="font-size:16px;line-height:1.5;margin:0 0 4px"><strong>${FORM_LABEL[input.form]}</strong></p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 16px">Period <strong>${input.label}</strong> is
      <strong style="color:${danger ? "#b63d35" : "#7a2e2e"}">${when}</strong> (due ${input.dueDateStr}).</p>
    <p style="margin:24px 0"><a href="${url}" style="background:#7a2e2e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-family:Arial,sans-serif;font-size:15px;display:inline-block">Review &amp; file</a></p>
    <p style="font-size:13px;line-height:1.5;color:#666">Open the Compliance screen to generate, review, and file this report. This is a reminder, not tax advice — confirm the figures before filing.</p>
    <p style="font-size:12px;line-height:1.5;color:#999">You&rsquo;re receiving this because compliance reminders are enabled for your account. An admin can change that in User Management.</p>
  </div>`;
  return { subject, html };
}
