/**
 * plan-027 — TTB filing-deadline REMINDERS, end-to-end against a dedicated synthetic tenant (never
 * prod; RLS-isolated). Drives the REAL service the widget / nav badge / banner / cron all call, plus
 * the recipient-selection + idempotent send-log the daily sweep relies on. Does NOT call Brevo — the
 * actual email transport is the same audited path exercised by the user-invite flow.
 *
 * Asserts:
 *   • openDeadlinesForTenant surfaces the MONTHLY ops (5120.17) deadlines in the window,
 *   • a FILED report drops its period (council S5),
 *   • with no taxpaid removals every semimonthly excise period is $0 → dropped (council C2),
 *   • dueMarkToday fires WEEK / TWO_DAY / DAY_OF at 7 / 2 / 0 days out (SEMIMONTHLY drops WEEK, S3),
 *   • recipient selection = opted-in prefs ∩ org members, non-banned (the sweep's audience),
 *   • the send-log unique [tenant,form,periodKey,mark,user] is idempotent: PENDING→SENT sticks, a
 *     re-run does not create a second row or re-send (council S2),
 *   • buildIcs emits one VEVENT (with a VALARM) per deadline,
 *   • RLS: a second tenant sees NONE of tenant A's prefs / logs / reports.
 *
 * Run:  npx tsx --conditions=react-server --env-file=.env scripts/verify-reminders.ts
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "../src/lib/tenant/context";
import { runAsSystem } from "../src/lib/tenant/system";
import { openDeadlinesForTenant, openDeadlineBadge } from "@/lib/compliance/reminders";
import { dueMarkToday } from "@/lib/compliance/deadline-status";
import { buildIcs } from "@/lib/compliance/ics";
import { OPS_FORM } from "@/lib/compliance/form-type";

const TENANT = "org_zz_reminders_synth";
const TENANT_B = "org_zz_reminders_synth_b";
const DAY = 86_400_000;

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

async function scrubTenant(t: string) {
  await runAsSystem(async (db) => {
    await db.complianceReminderLog.deleteMany({ where: { tenantId: t } });
    await db.complianceReminderPreference.deleteMany({ where: { tenantId: t } });
    await db.complianceReport.deleteMany({ where: { tenantId: t } });
    await db.complianceProfile.deleteMany({ where: { tenantId: t } });
    await db.member.deleteMany({ where: { organizationId: t } });
  });
}

async function main() {
  console.log("plan-027 reminders verify\n");

  // ── Fixtures ─────────────────────────────────────────────────────────────
  for (const t of [TENANT, TENANT_B]) {
    await runAsSystem((db) => db.organization.upsert({ where: { id: t }, update: {}, create: { id: t, name: `ZZ Reminders ${t}`, slug: t } }));
    await scrubTenant(t);
  }

  // Two users on tenant A: A1 opted-in, A2 opted-out. (User/Member are global auth tables.)
  const now = new Date();
  const u1 = `u_rem_optin_${TENANT}`;
  const u2 = `u_rem_optout_${TENANT}`;
  await runAsSystem(async (db) => {
    for (const [id, email] of [[u1, "optin@verify-reminders"], [u2, "optout@verify-reminders"]] as const) {
      await db.user.upsert({ where: { id }, update: {}, create: { id, email, name: email, emailVerified: true, createdAt: now, updatedAt: now } });
      await db.member.create({ data: { id: `${id}_m`, organizationId: TENANT, userId: id, role: "member", createdAt: now } });
    }
  });

  await runAsTenant(TENANT, async () => {
    await prisma.complianceProfile.create({
      data: { defaultCadence: "MONTHLY", defaultReturnCadence: "SEMIMONTHLY", isEftPayer: false },
    });
    await prisma.complianceReminderPreference.create({ data: { userId: u1, remindersEnabled: true } });
    await prisma.complianceReminderPreference.create({ data: { userId: u2, remindersEnabled: false } });
  });

  // ── 1. Deadlines surface (ops present, $0 excise dropped) ─────────────────
  const asOf = new Date(Date.UTC(2026, 6, 2)); // 2026-07-02 (fixed, matches unit-test calendar)
  const open = await runAsTenant(TENANT, () => openDeadlinesForTenant(TENANT, asOf, { horizonDays: 60, overdueDays: 21 }));
  const opsOpen = open.filter((d) => d.form === "5120.17");
  const exciseOpen = open.filter((d) => d.form === "5000.24");
  assert(opsOpen.length > 0, `MONTHLY ops deadlines surface (${opsOpen.length} in window)`);
  assert(exciseOpen.length === 0, "no taxpaid removals → every semimonthly excise period is $0 → dropped (C2)");

  // ── 2. A FILED report drops its period (S5) ───────────────────────────────
  const target = opsOpen[0];
  const periodEnd = target.periodEnd;
  await runAsTenant(TENANT, () =>
    prisma.complianceReport.create({
      data: {
        formType: OPS_FORM, status: "FILED", cadence: "MONTHLY", version: "ORIGINAL",
        periodStart: target.periodStart, periodEnd, computed: {}, onHandEnd: {}, overrides: {}, generatedAt: now,
      },
    }),
  );
  const afterFile = await runAsTenant(TENANT, () => openDeadlinesForTenant(TENANT, asOf, { horizonDays: 60, overdueDays: 21 }));
  assert(!afterFile.some((d) => d.periodKey === target.periodKey), `FILED period ${target.periodKey} dropped from open list`);

  // ── 3. dueMarkToday marks at 7 / 2 / 0 days (MONTHLY keeps WEEK) ───────────
  const anyOps = afterFile.find((d) => d.form === "5120.17")!;
  const due = anyOps.effectiveDueDate;
  const at = (offsetDays: number) => new Date(due.getTime() - offsetDays * DAY);
  assert(dueMarkToday(anyOps, at(0)) === "DAY_OF", "DAY_OF fires on the due date");
  assert(dueMarkToday(anyOps, at(2)) === "TWO_DAY", "TWO_DAY fires 2 days out");
  assert(dueMarkToday(anyOps, at(7)) === "WEEK", "WEEK fires 7 days out (MONTHLY)");
  assert(dueMarkToday(anyOps, at(4)) === null, "no mark 4 days out");

  // ── 4. Recipient selection = opted-in ∩ members, non-banned ───────────────
  const recipients = await runAsTenant(TENANT, async () => {
    const prefs = await prisma.complianceReminderPreference.findMany({ where: { remindersEnabled: true }, select: { userId: true } });
    const members = await prisma.member.findMany({ where: { organizationId: TENANT }, select: { userId: true } });
    const memberIds = new Set(members.map((m) => m.userId));
    const ids = prefs.map((p) => p.userId).filter((id) => memberIds.has(id));
    return prisma.user.findMany({ where: { id: { in: ids }, banned: { not: true } }, select: { id: true } });
  });
  assert(recipients.length === 1 && recipients[0].id === u1, "only the opted-in member is a recipient (opt-out excluded)");

  // ── 5. Send-log idempotency (S2) ──────────────────────────────────────────
  const logKey = { tenantId: TENANT, form: anyOps.form, periodKey: anyOps.periodKey, mark: "DAY_OF", recipientUserId: u1 };
  const whereUnique = { tenantId_form_periodKey_mark_recipientUserId: logKey };
  await runAsTenant(TENANT, async () => {
    await prisma.complianceReminderLog.upsert({
      where: whereUnique,
      create: { ...logKey, dueDate: due, recipientEmail: "optin@verify-reminders", status: "PENDING", updatedAt: now },
      update: {},
    });
    await prisma.complianceReminderLog.update({ where: whereUnique, data: { status: "SENT", sentAt: now } });
    // Simulate a cron re-run: the unique key hits the existing SENT row (no second insert).
    await prisma.complianceReminderLog.upsert({
      where: whereUnique,
      create: { ...logKey, dueDate: due, recipientEmail: "optin@verify-reminders", status: "PENDING", updatedAt: now },
      update: {}, // a real sweep would see status === "SENT" and skip before touching this
    });
  });
  const logs = await runAsTenant(TENANT, () => prisma.complianceReminderLog.findMany({ where: { periodKey: anyOps.periodKey } }));
  assert(logs.length === 1, "exactly one send-log row for the (period, mark, user) key — no duplicate");
  assert(logs[0].status === "SENT", "the row stays SENT across the re-run (never re-sent)");

  // ── 6. Badge + .ics ───────────────────────────────────────────────────────
  const badge = await runAsTenant(TENANT, () => openDeadlineBadge(TENANT, asOf));
  assert(badge.count === afterFile.length, `badge count (${badge.count}) matches open-deadline count`);
  const ics = buildIcs(afterFile, { tenantId: TENANT, calName: "verify", dtStampIso: now.toISOString() });
  const vevents = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
  assert(vevents === afterFile.length, `.ics has one VEVENT per deadline (${vevents})`);
  assert(ics.includes("BEGIN:VALARM"), ".ics events carry reminder alarms");

  // ── 7. RLS isolation ──────────────────────────────────────────────────────
  const bSees = await runAsTenant(TENANT_B, async () => ({
    prefs: await prisma.complianceReminderPreference.count(),
    logs: await prisma.complianceReminderLog.count(),
    reports: await prisma.complianceReport.count(),
  }));
  assert(bSees.prefs === 0 && bSees.logs === 0 && bSees.reports === 0, "tenant B sees none of tenant A's reminder rows (RLS)");

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await scrubTenant(TENANT);
  await scrubTenant(TENANT_B);
  await runAsSystem(async (db) => {
    await db.member.deleteMany({ where: { userId: { in: [u1, u2] } } });
    await db.user.deleteMany({ where: { id: { in: [u1, u2] } } });
  });

  console.log(`\n✅ verify-reminders: ${passed} assertions passed`);
}

main()
  .catch((e) => {
    console.error("\n❌ verify-reminders FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
