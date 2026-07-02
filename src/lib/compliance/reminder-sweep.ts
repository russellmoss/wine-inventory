import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenant/system";
import { runAsTenant } from "@/lib/tenant/context";
import { sendEmail } from "@/lib/email";
import { openDeadlinesForTenant } from "./reminders";
import { dueMarkToday } from "./deadline-status";
import { reminderEmail } from "./reminder-email";

// plan-027 Unit 5 (core) — the daily reminder sweep. Iterates tenants under runAsSystem (a cron has no
// session), and per tenant (runAsTenant, RLS) emails opted-in members at the 1-week / 2-day / day-of
// marks. Idempotent (council S2): a PENDING log row is inserted, the email sent, then marked SENT; a
// row already SENT is skipped, so a re-run (or Vercel's at-least-once cron delivery) never double-sends.
// A send failure leaves the row PENDING → retried next run (a missed reminder is worse than a dup).

const STALE_PENDING_MS = 15 * 60 * 1000; // a PENDING older than this is treated as a failed attempt → retry
const BATCH = 5; // tenants per Promise.all wave (council C3 — don't hammer the DB/Brevo all at once)

export type SweepSummary = { tenants: number; due: number; sent: number; skipped: number; failed: number };

async function sweepTenant(tenantId: string, asOf: Date): Promise<{ sent: number; skipped: number; failed: number }> {
  return runAsTenant(tenantId, async () => {
    const open = await openDeadlinesForTenant(tenantId, asOf);
    const dueToday = open.map((d) => ({ d, mark: dueMarkToday(d, asOf) })).filter((x): x is { d: (typeof open)[number]; mark: NonNullable<ReturnType<typeof dueMarkToday>> } => x.mark != null);
    if (dueToday.length === 0) return { sent: 0, skipped: 0, failed: 0 };

    // Recipients: opted-in (this tenant's prefs) ∩ current members of the org, non-banned, with an email.
    const prefs = await prisma.complianceReminderPreference.findMany({ where: { remindersEnabled: true }, select: { userId: true } });
    if (prefs.length === 0) return { sent: 0, skipped: 0, failed: 0 };
    const members = await prisma.member.findMany({ where: { organizationId: tenantId }, select: { userId: true } });
    const memberIds = new Set(members.map((m) => m.userId));
    const recipientIds = prefs.map((p) => p.userId).filter((id) => memberIds.has(id));
    if (recipientIds.length === 0) return { sent: 0, skipped: 0, failed: 0 };
    const users = await prisma.user.findMany({ where: { id: { in: recipientIds }, banned: { not: true } }, select: { id: true, email: true } });

    let sent = 0,
      skipped = 0,
      failed = 0;
    const now = asOf;
    for (const { d, mark } of dueToday) {
      for (const u of users) {
        if (!u.email) continue;
        const key = { tenantId, form: d.form, periodKey: d.periodKey, mark, recipientUserId: u.id };
        const whereUnique = { tenantId_form_periodKey_mark_recipientUserId: key };
        const existing = await prisma.complianceReminderLog.findUnique({ where: whereUnique, select: { id: true, status: true, updatedAt: true } });
        if (existing?.status === "SENT") { skipped++; continue; }
        if (existing?.status === "PENDING" && now.getTime() - existing.updatedAt.getTime() < STALE_PENDING_MS) { skipped++; continue; }

        const row = await prisma.complianceReminderLog.upsert({
          where: whereUnique,
          create: { ...key, dueDate: d.effectiveDueDate, recipientEmail: u.email, status: "PENDING", updatedAt: now },
          update: { status: "PENDING", recipientEmail: u.email, updatedAt: now },
          select: { id: true },
        });
        const { subject, html } = reminderEmail({ form: d.form, label: d.label, dueDateStr: d.dueDateStr, daysUntil: d.daysUntil });
        try {
          await sendEmail({ to: u.email, subject, html });
          await prisma.complianceReminderLog.update({ where: { id: row.id }, data: { status: "SENT", sentAt: now } });
          sent++;
        } catch {
          failed++; // leave PENDING → retried next run
        }
      }
    }
    return { sent, skipped, failed };
  });
}

/** Sweep every tenant. `asOf` is injectable for tests/backfill; the cron passes the real now. */
export async function runReminderSweep(asOf: Date = new Date()): Promise<SweepSummary> {
  const orgs = await runAsSystem((db) => db.organization.findMany({ select: { id: true } }));
  const summary: SweepSummary = { tenants: orgs.length, due: 0, sent: 0, skipped: 0, failed: 0 };
  for (let i = 0; i < orgs.length; i += BATCH) {
    const wave = orgs.slice(i, i + BATCH);
    const results = await Promise.all(wave.map((o) => sweepTenant(o.id, asOf).catch(() => ({ sent: 0, skipped: 0, failed: 0 }))));
    for (const r of results) {
      summary.sent += r.sent;
      summary.skipped += r.skipped;
      summary.failed += r.failed;
    }
  }
  return summary;
}
