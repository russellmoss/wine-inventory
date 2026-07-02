---
title: Compliance Filing-Deadline Reminders + Calendar Export (Phase 14 follow-on)
type: feat
status: code-complete (migration apply + e2e verify pending DB connectivity)
date: 2026-07-01
branch: main
depth: deep
units: 11
---

## Build status (2026-07-02)

All 11 units built, committed to `main`, and offline-verified: `tsc --noEmit` clean repo-wide,
`eslint` clean on all touched files, 29 compliance unit tests green
(holidays / deadlines / deadline-status / ics). Two commits:
reminder backend (schema + migrations + `reminders.ts` + `reminder-sweep.ts` + cron route +
`vercel.json` + `.env.example`) and reminder UI (dashboard widget + nav badge + `/compliance` banner +
`/users` opt-in + Settings `.ics` button + `verify-reminders.ts`).

**Pending (blocked on local Prisma→Neon connectivity, P1001 — Neon itself confirmed up via MCP,
compute active):**
1. Apply the two migrations: `npx prisma migrate deploy` (creates `compliance_reminder_preference` +
   `compliance_reminder_log` + their RLS). Confirmed NOT yet applied to prod (0 tables, 0 migration
   records). NOTE: an unrelated pre-existing rolled-back migration `20260627172023_add_lot_code_abbreviations`
   sits in `_prisma_migrations` (June 27) — benign, `migrate deploy` skips rolled-back rows.
2. Stop the dev server, then `npx prisma generate` (Windows query-engine DLL lock).
3. `npm run verify:reminders` (e2e over a synthetic tenant).

Until (1) runs against a given DB, the dashboard widget / nav badge / `/compliance` banner queries
(`complianceReminderPreference`) will error there — apply the migration on every environment (local +
Vercel prod/preview) before exercising the UI.

## Overview

Never let a winemaker miss a federal filing deadline. Compute every upcoming TTB deadline from the
cadence they already set (5120.17 operations report due the 15th after each period; 5000.24 excise
return due the 14th after each return period), then nudge them three ways: **in-app** (dashboard
widget + nav badge + a banner on `/compliance`) at 1 week / 2 days / day-of, **email** to
admin-selected users at the same marks (reusing the existing Brevo transport), and a **calendar
export** (`.ics`) so the deadlines land in Google/Apple/Outlook when they set the winery up.

## Problem Frame

We now generate the forms (025 shipped, 026 planned) but do nothing to make sure they're FILED ON
TIME. Late filing is the real-world failure: TTB penalties + a compliance black mark. A semimonthly-
excise + monthly-ops winery has ~3 deadlines a month across two forms with different due-day rules —
exactly the kind of recurring, easy-to-miss cadence software should own. Job-to-be-done: "tell me what
I owe, to whom, and by when, before it's late — everywhere I'll see it."

**Product pressure test:** The right problem is *not missing the date*, not "a notifications system."
Keep it scoped to compliance deadlines (don't build a generic notification framework). The deadlines
fall out of data we already have (cadence + filed-status); the only new infra is a daily scheduler.
Reuse the Brevo email transport verbatim — do NOT add a provider.

## Requirements

- **MUST** compute the open filing deadlines for a tenant from cadence settings + filed status:
  5120.17 due = period end **+ 15 days** (monthly/quarterly/annual per `ComplianceProfile.defaultCadence`);
  5000.24 due = return period end **+ 14 days** (semimonthly [+ September split], quarterly, annual per
  `defaultReturnCadence` + `isEftPayer`, from plan 026). A deadline is "done" once a matching FILED
  `ComplianceReport` exists for that form+period. Both forms can be due the same month.
- **SHOULD** roll a due date that lands on a weekend forward to the next business day (federal-holiday
  calendar is a documented follow-on).
- **MUST** surface open/overdue deadlines **in-app**: a dashboard widget, a count **badge** on a
  Compliance nav item, and a banner on `/compliance`, each showing the nearest deadline + days-left,
  colored by urgency (≤2 days danger, ≤7 warning).
- **MUST** send **email reminders** at **1 week / 2 days / day-of** to users an admin has opted in,
  via the existing `sendEmail` (Brevo). Idempotent — a given (tenant, form, period, mark, user) is
  emailed at most once, enforced by a `ComplianceReminderLog`.
- **MUST** run the email sweep on a **daily schedule** (Vercel Cron → an auth-gated
  `/api/cron/compliance-reminders` route) that iterates tenants under `runAsSystem` (cron has no
  session), computes today's due-at-a-mark deadlines, finds opted-in members, sends + logs.
- **MUST** manage the per-user email opt-in in **User Management** (`/users`), admin-only, per tenant.
- **MUST** offer an **"Add filing deadlines to calendar"** action (Settings) that downloads an `.ics`
  (RFC 5545, universal) of the next N months of deadlines, each event with `VALARM`s at −1w/−2d/day-of.
- **MUST** be tenant-scoped + RLS-isolated (the two new tables) per the Phase-12 checklist.
- **DEFERRED:** federal-holiday roll-forward; per-form email granularity (v1 = all-forms opt-in);
  SMS/push; a generic notification center; Google Calendar API/OAuth (the `.ics` covers it).

## Scope Boundaries

**In scope:** deadline computation (both forms) + weekend roll; the in-app trio (widget/badge/banner);
per-user email opt-in in `/users`; the daily Vercel Cron sweep + idempotent send log; the reminder
email template; the `.ics` export + Settings button; the two RLS tables.

**Out of scope (documented):** a generic notification framework; SMS/push; federal-holiday calendar;
per-form opt-in; Google Calendar OAuth; reminders for any form other than 5120.17 / 5000.24.

## Research Summary

### Codebase (mapped, file:line)
- **Email is BUILT — reuse it.** `src/lib/email.ts` `sendEmail({to,subject,html})` via the Brevo HTTPS
  API (env `BREVO_API_KEY` / `BREVO_SENDER_EMAIL`), plus `brandShell()`/`pill()`/`ctaButton()`/`appBaseUrl()`
  and existing templates. `src/lib/users/actions.ts` has the **best-effort `trySend`** pattern (a failed
  send never rolls back). No new dependency.
- **Scheduling is GREENFIELD.** Bare `vercel.json` (`{framework:nextjs}`), no cron routes, no scheduler
  dep. → Vercel Cron: add a `crons` entry + `/api/cron/compliance-reminders` (Vercel sends
  `Authorization: Bearer $CRON_SECRET`; gate on it). Free tier covers a daily job.
- **Cadence data:** `ComplianceProfile.defaultCadence` (+ 026's `defaultReturnCadence`/`isEftPayer`);
  `periodBounds()` in `compliance/actions.ts:27` (reuse); 026's `return-cadence.ts` for the semimonthly
  5000.24 stream (dependency). `ComplianceReport.filedAt` marks a period done.
- **User/prefs:** `User` is GLOBAL (Better Auth); `Member` joins User↔Organization. Per-user reminder
  opt-in → a NEW tenant-scoped `ComplianceReminderPreference (tenantId, userId, remindersEnabled)`.
- **UI surfaces:** `/users` (page + `UsersClient` + `users/actions.ts`) for the opt-in toggle; Dashboard
  `src/app/(app)/page.tsx` for the widget (Card/Metric/Badge); `AppShell.tsx` NavItem has `badge?: number`
  rendered in `CollapsibleNavGroup` (same as the `pendingSamples` badge) — pass a deadline count from the
  `(app)/layout.tsx` like `pendingSamples`/`sparklingEnabled`.
- **Cron tenant sweep:** `runAsSystem` (owner) iterates all tenants; per tenant use `runAsTenant` to read
  cadence/filed status. K12: pass tenantId explicitly.

### External
- Vercel Cron: `vercel.json` `crons:[{path,schedule}]`; a GET route; secure with `CRON_SECRET`.
- `.ics`: RFC 5545 is simple text — hand-roll `VCALENDAR`/`VEVENT`/`VALARM` (no dependency); Google/
  Apple/Outlook all import it. Use stable `UID`s so re-import updates rather than duplicates.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Email transport | **Reuse `sendEmail` (Brevo)** + `trySend` best-effort | Add Resend/SES | Already built + wired; the operator confirmed invites/resets send today |
| Scheduler | **Vercel Cron** daily → auth-gated `/api/cron/compliance-reminders` | External cron; client-side check | Built-in, free, serverless-native; one route + one `vercel.json` entry (Fork 1) |
| Send idempotency | **`ComplianceReminderLog`** unique on (tenantId, form, periodKey, mark, userId) | Derive on the fly | A daily cron re-runs; you can't know "already emailed" without state (Fork 2) |
| Opt-in model | **Per-user** `ComplianceReminderPreference` (admin sets in /users) | Per-role default | Explicit control over who gets pinged; simple toggle (Fork 3) |
| Calendar | **Hand-rolled `.ics` download** with `VALARM`s | Google Calendar API (OAuth) | Universal, no OAuth, no dep, offline (Fork 4) |
| In-app surface | **All three** (dashboard widget + nav badge + /compliance banner) | Pick one | Each is small + reuses existing components; deadlines must be unmissable (Fork 5) |
| Deadline source | **Derive** from cadence + filed-status (no stored deadline rows) | Materialize deadlines | Deadlines are a pure function of cadence + calendar; the only stored state is the send LOG |

### Forks for the human
- **F1 scheduler:** **Vercel Cron (recommended)** vs external service vs client-side check. Vercel Cron
  is built-in + free; needs a `CRON_SECRET` env + one route.
- **F2 send-state:** **`ComplianceReminderLog` (recommended)** for idempotency+audit vs derive-on-the-fly
  (can't dedupe a daily cron without it).
- **F3 opt-in:** **per-user (recommended)** vs per-role vs everyone-in-org.
- **F4 calendar:** **`.ics` download (recommended)** vs Google Calendar API.
- **F5 in-app surface:** **all three (recommended)** vs a subset.

## Build-order dependency

The **5120.17 reminder stream works today** (plan 025 shipped). The **5000.24 stream needs plan 026**
(its `return-cadence.ts` + `defaultReturnCadence`/`isEftPayer`). Recommended order: **026 → 027.** If
027 is built first, ship 5120.17 reminders now and light up the excise stream when 026 lands (the
deadline-calc's 5000.24 branch is feature-gated on the excise cadence existing).

## Council Revisions (2026-07-01) — folded CRITICAL + SHOULD-FIX

Gemini (TTB domain + serverless) + Claude (infra/reuse) review. Full log: `council-feedback.md`. Folded:

- **C1 (CRITICAL) — due dates roll in OPPOSITE directions; holidays are v1, not deferred.** 5120.17
  rolls **FORWARD** to the next business day (27 CFR 24.300(g)); 5000.24 excise rolls **BACKWARD** to
  the preceding business day (24.271(c)(1)(i)). A uniform forward-roll files excise LATE. Unit 2 takes a
  per-form roll direction + a hardcoded US-federal-holiday constant (~11/yr × ~5 yrs). Removes the
  "weekend roll only / holidays deferred" line from Requirements + DEFERRED.
- **C2 (CRITICAL) — $0 semimonthly excise periods are NOT filed (24.271(i)) → no reminder.** Firing
  OVERDUE for a $0 period is a trust-killing false positive. Unit 3 drops a 5000.24 semimonthly deadline
  whose computed liability is $0 (the 5120.17 ops report is ALWAYS due — keep it). This couples the
  excise reminder to 026's liability COMPUTE (see build-order).
- **C3 (CRITICAL) — the tenant sweep will time out on Vercel.** Unit 5: `export const maxDuration = 300`,
  batch tenants (chunks of ~5), handle Brevo's 300/day + HTTP 429 gracefully (abort clean, don't corrupt
  the log).
- **S1 — kill the ±1-day timezone fuzz; use date-STRING equality.** Due dates are `YYYY-MM-DD` strings;
  the cron runs 13:00 UTC (US daytime); send where `dueDateStr − markOffset == todayUTCdate`. No JS
  `Date` comparisons. Fixes Unit 2/5 + Risk R7 (the fuzz was a double-send factory).
- **S2 — PENDING→SENT two-phase send log.** A missed compliance reminder beats a double email in
  badness. `ComplianceReminderLog.status` (PENDING→SENT); insert PENDING → send → mark SENT; a stale
  PENDING (>N min) on the next run is retried. Units 1/5. (Replaces the old "insert-then-send" R1.)
- **S3 — semimonthly drops the 1-week mark.** ~15-day periods → a 1-week reminder fires ~1 day after the
  period ends = noise/opt-outs. Semimonthly = 2-day + day-of; monthly/quarterly/annual keep 1-week. Unit 3.
- **S4 — September split explicit due dates + backward roll** (Sep 1–15→~29; 16–25→28 non-EFT/29 EFT;
  26–30→Oct 14). `upcomingDeadlines` uses 026's return-cadence Sept override; "+14d" alone fails. Unit 2.
- **S5 — amended/late returns re-enter openDeadlines.** Filter FILED periods UNLESS re-opened/amended, so
  an amendment re-surfaces the deadline. Unit 3.
- **S6 (Claude) — cron auth constant-time + at-least-once safe.** Constant-time `CRON_SECRET` compare;
  Vercel may deliver the cron twice — the PENDING/SENT log + unique constraint dedupe. Unit 5.
- **.ics UID** = `tenant+form+periodKey` ONLY (not mark/dueDate) so a date change UPDATES the event
  rather than duplicating (confirmed; Unit 9). In-app `daysUntil` stays date-only to match the send logic.

**Open design questions for the operator:** (Q1) hardcoded holiday constant (recommended) vs a library;
(Q2) in-app: one "next deadline" summary vs a banner per open deadline for busy semimonthly filers
(design review will weigh in).

**Build-order (updated):** 5120.17 reminders ship on 025 alone. The **5000.24 reminder stream now
depends on 026's excise COMPUTE** (the $0-period drop needs liability), not just its cadence → **026
before 027's excise stream.**

## Implementation Units

### Unit 1: Schema — reminder preference + send log (tenant-scoped, RLS)
**Goal:** Persist who wants reminders + which reminders were sent (idempotency/audit).
**Files:** `prisma/schema.prisma`, `prisma/migrations/*` (tables + RLS), `src/lib/tenant/models.ts` (NOT global), `scripts/verify-tenant-isolation.ts`, `test/tenant-isolation.test.ts`.
**Approach:** `ComplianceReminderPreference { tenantId, id, userId, remindersEnabled Boolean @default(false), updatedAt, @@unique([tenantId, userId]) }`. `ComplianceReminderLog { tenantId, id, form, periodKey String, dueDate DateTime, mark String (WEEK/TWO_DAY/DAY_OF), recipientUserId, recipientEmail, sentAt @default(now()), @@unique([tenantId, form, periodKey, mark, recipientUserId]) }`. Full Phase-12 checklist (tenantId + index + FK→organization, RLS ENABLE+FORCE+tenant_isolation, app_rls grant). Add `CRON_SECRET` to `.env.example`.
**Tests:** cross-tenant isolation for both tables; the log unique blocks a duplicate send.
**Depends on:** none. **Verification:** `verify-tenant-isolation` passes new cases.

### Unit 2: Deadline computation (pure, tested)
**Goal:** From cadence + a reference date, list upcoming deadlines per form.
**Files:** `src/lib/compliance/deadlines.ts`, `test/compliance-deadlines.test.ts`.
**Approach:** `upcomingDeadlines({ opsCadence, returnCadence, isEftPayer, asOf, horizonMonths })` → `{ form: "5120.17"|"5000.24", periodStart, periodEnd, dueDate, effectiveDueDate }[]`. 5120.17 due = periodEnd + 15d (reuse `periodBounds`); 5000.24 due = returnPeriodEnd + 14d (reuse 026 `return-cadence.ts`, incl. the September split). `effectiveDueDate` rolls a Saturday/Sunday forward to Monday. Pure. **Tests:** monthly/quarterly/annual ops due-dates; semimonthly halves + September 3-split; weekend roll; horizon window; both-forms-same-month.
**Depends on:** Unit (026 return-cadence). **Verification:** `npm test compliance-deadlines`.

### Unit 3: Open-deadline service (deadline × filed-status × reminder mark)
**Goal:** The one query the widget/badge/banner/cron all use.
**Files:** `src/lib/compliance/deadline-status.ts`, `test/compliance-deadline-status.test.ts`.
**Approach:** `openDeadlines(tenantId, asOf)`: compute `upcomingDeadlines`, drop any with a matching FILED `ComplianceReport` (form+period), annotate each open one with `daysUntil` + the current `mark` (WEEK ≤7d, TWO_DAY ≤2d, DAY_OF ==0, OVERDUE <0) and an urgency tone. Explicit `tenantId` (K12). **Tests:** a filed period drops out; marks assigned at the right day offsets; overdue flagged.
**Depends on:** Units 2 + 025/026 report data. **Verification:** `npm test compliance-deadline-status`.

### Unit 4: Reminder email template
**Goal:** A branded reminder email.
**Files:** `src/lib/email.ts` (add `complianceReminderEmailHtml`).
**Approach:** Reuse `brandShell`/`ctaButton`/`appBaseUrl`. Content: form name, period, **due date + days left**, a "Review & file" button to `/compliance`. **Tests:** snapshot/among email unit tests if present (else covered via the cron test).
**Depends on:** none. **Verification:** renders with sample data.

### Unit 5: Daily cron sweep (Vercel Cron)
**Goal:** Send due-at-a-mark reminders once each, daily.
**Files:** `src/app/api/cron/compliance-reminders/route.ts`, `vercel.json` (`crons`), `.env.example` (`CRON_SECRET`).
**Approach:** GET route gated on `Authorization: Bearer $CRON_SECRET` (Vercel Cron sets it). `runAsSystem` → list organizations → per tenant `runAsTenant`: `openDeadlines(tenantId, today)`; for each deadline whose `mark` ∈ {WEEK,TWO_DAY,DAY_OF} today, load opted-in members (`ComplianceReminderPreference.remindersEnabled` ∧ Member of org), and for each not already in `ComplianceReminderLog` (tenant,form,periodKey,mark,user) → `trySend` the reminder email → insert the log row. Best-effort per recipient; summarize counts in the response. `vercel.json`: `{ "crons": [{ "path": "/api/cron/compliance-reminders", "schedule": "0 13 * * *" }] }`.
**Tests:** integration (verify script or a seeded test): a due-today deadline emails each opted-in user exactly once; a second run same day sends 0 (idempotent); a filed deadline sends 0; unauthorized request → 401.
**Depends on:** Units 1, 3, 4. **Verification:** `verify:reminders` (synthetic tenant) + curl the route with/without the secret.

### Unit 6: Per-user email opt-in (User Management)
**Goal:** Admin picks who gets reminder emails.
**Files:** `src/app/(app)/users/page.tsx`, `UsersClient.tsx`, `src/lib/users/actions.ts`.
**Approach:** Load each user's `ComplianceReminderPreference.remindersEnabled` (per active tenant); add a toggle in the users table; `setComplianceReminderPref(userId, enabled)` adminAction upserts the pref. Default off. **Tests:** toggle persists; non-admin blocked; cross-tenant pref isolated.
**Depends on:** Unit 1. **Verification:** toggle a user in `/users`, confirm persisted.

### Unit 7: Dashboard widget
**Goal:** Upcoming deadlines visible on the home dashboard.
**Files:** `src/app/(app)/page.tsx`, a `DeadlinesWidget` component.
**Approach:** Server-fetch `openDeadlines(tenantId, now)`; render a Card listing the nearest 3 (form · due date · days-left, urgency-toned), a "Review & file" link, and a calm empty state ("All caught up — no deadlines in the next 30 days."). DESIGN.md tokens. **Tests:** RTL — renders deadlines; empty state.
**Depends on:** Unit 3. **Verification:** load `/`, see the widget.

### Unit 8: Nav badge + /compliance banner
**Goal:** An unmissable count + an on-screen banner.
**Files:** `src/components/AppShell.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/compliance/ComplianceClient.tsx` (or page).
**Approach:** Layout computes the open-deadline count (like `pendingSamples`) and passes it to `AppShell`; set `badge` on a Compliance nav item (danger tone if any ≤2 days). On `/compliance`, a top banner: "N filing deadline(s) coming up — nearest: {form} due {date} ({daysLeft})", or overdue in danger. **Tests:** badge count reflects open deadlines; banner shows nearest/overdue.
**Depends on:** Unit 3. **Verification:** badge + banner render with seeded deadlines.

### Unit 9: `.ics` calendar export
**Goal:** One-click add all deadlines to the winemaker's calendar.
**Files:** `src/lib/compliance/ics.ts`, `src/app/api/compliance/calendar/route.ts`, Settings button (`SettingsClient.tsx`).
**Approach:** `buildIcs(deadlines, horizonMonths)` emits RFC 5545 `VCALENDAR` with one `VEVENT` per deadline (all-day on `effectiveDueDate`, stable `UID` = tenant+form+periodKey so re-import updates), each with `VALARM` triggers at −1 week / −2 days / day-of. Auth-gated tenant-scoped route streams `text/calendar` as an attachment. Settings gets an **"Add filing deadlines to calendar"** button. **Tests:** valid VCALENDAR; one VEVENT per deadline; VALARMs present; route rejects unauth/other-tenant.
**Depends on:** Unit 2. **Verification:** download the `.ics`, import into Google/Apple.

### Unit 10: Wire-through + settings copy
**Goal:** Small glue — the layout count, settings section header, docs pointer.
**Files:** `src/app/(app)/layout.tsx`, `SettingsClient.tsx`, `ROADMAP.md`.
**Approach:** Pass the deadline count to AppShell; group the calendar button + a "who gets reminder emails" note near the compliance profile in Settings; mark the ROADMAP slice. **Depends on:** 7/8/9.

### Unit 11: Verify script + docs
**Goal:** Prove the sweep end-to-end + document.
**Files:** `scripts/verify-reminders.ts`, `docs/*`, plan appendix.
**Approach:** Synthetic tenant: set a cadence, opt in a user, set "today" to a deadline mark, run the sweep core → assert one email attempt + one log row; run again → 0 (idempotent); file the report → the deadline drops; build the `.ics` → assert events/alarms. **Depends on:** 1–10. **Verification:** `npm run verify:reminders` green.

## Eng Review Revisions (2026-07-01) — folded

Architecture + tests (Claude eng pass; Codex outside-voice excluded per operator). Folded:

- **E1 (DRY) — `openDeadlines` is the ONE authority.** The dashboard widget, nav badge, /compliance
  banner, the cron sweep, AND the `.ics` export all consume `deadline-status.openDeadlines(tenantId, asOf)`
  so in-app and email can never disagree about what's due. `deadlines.ts` (pure cadence→dates+roll) is
  the only place the due-date math lives. Units 2/3/5/7/8/9.
- **E2 (arch) — the $0-excise check is a per-period call into 026's compute, feature-gated.** For each
  open 5000.24 semimonthly deadline, `deadline-status` calls 026's `computeExcise` for that period; if
  026 isn't built yet, the whole 5000.24 branch is skipped (5120.17 stream still ships). A handful of
  periods per tenant per daily run → fine. Unit 3.
- **E3 (infra) — the send-log write is an UPSERT on the unique key.** The unique
  (tenant,form,periodKey,mark,user) row is created PENDING then updated to SENT; a retry UPDATEs the
  existing PENDING (never inserts a duplicate). A stale PENDING (> ~15 min) is treated as failed and
  re-attempted. Units 1/5.
- **E4 (correctness) — business-day roll + holidays is a PURE, heavily-tested function.** `businessDayRoll(date, direction, holidays)` + a checked-in US-federal-holiday set. Test holiday-on-due-date and
  holiday-adjacent in BOTH directions, weekend+holiday combos, and the September dates. Unit 2.
- **E5 (infra) — cron is idempotent under at-least-once + partial failure.** Constant-time `CRON_SECRET`
  check; `maxDuration=300`; tenant batching; on Brevo 429 abort the sweep cleanly (leave un-sent rows
  absent so the next run picks them up). Unit 5.

## Test Coverage Map (eng review)

```
PURE LOGIC (unit — Vitest)
==========================
deadlines.ts (U2)
  ├─ [★★★] 5120.17 due = periodEnd+15, roll FORWARD; 5000.24 due = periodEnd+14, roll BACKWARD   [C1]
  ├─ [★★★] holiday ON due date + holiday-ADJACENT, both directions; weekend+holiday combo        [C1/E4]
  ├─ [★★★] September split explicit (1–15→~29 / 16–25→28|29 / 26–30→Oct14), backward roll         [S4]
  └─ [★★★] output is YYYY-MM-DD date-strings (no Date-object drift)                               [S1]
deadline-status.ts (U3)
  ├─ [★★★] FILED period drops out; amended/re-opened re-surfaces                                  [S5]
  ├─ [★★★] $0 semimonthly excise dropped (026 compute mocked); 5120.17 never dropped at $0        [C2]
  ├─ [★★★] marks WEEK≤7 / TWO_DAY≤2 / DAY_OF==0 / OVERDUE<0 at right offsets                       
  └─ [★★★] semimonthly OMITS the WEEK mark; other cadences keep it                                [S3]
ics.ts (U9)  [★★★] valid VCALENDAR; UID = tenant+form+periodKey (re-import UPDATES); VALUE=DATE; VALARM −1w/−2d/day-of

INFRA / INTEGRATION (verify:reminders, synthetic tenant)
==========================
cron sweep (U5)
  ├─ [★★★] 401 without CRON_SECRET; constant-time compare                                         [E5]
  ├─ [★★★] sends once per (tenant,form,period,mark,user); re-run same day → 0 (idempotent)         [S2]
  ├─ [★★★] PENDING inserted → SENT on success; stale PENDING retried; send-fail leaves retryable   [S2/E3]
  ├─ [★★★] respects opt-in + FILED-status; batched; Brevo 429 aborts clean                          [C3/E5]
  └─ [★★  →E2E] daily fire end-to-end
tenant isolation (U1)  [★★★] both tables: cross-tenant read = 0; per-user pref unique per tenant
COMPONENT (RTL)
  ├─ [★★★] dashboard widget renders deadlines + empty state; nav badge count; /compliance banner (nearest/overdue)
  └─ [★★★] /users reminder toggle persists, admin-only
────────────────────────────────────────────────────────────
COVERAGE TARGET: 100% new paths. Critical gaps flagged: directional roll + holidays (C1/E4), $0-excise
drop (C2), cron auth + idempotency (S2/E5). None left BOTH untested AND silent.
```

## Test Strategy

**Unit:** deadline math (both forms, semimonthly + Sept split, weekend roll, horizon); open-deadline
status (filed drops out, mark offsets, overdue); `.ics` validity (events/UIDs/alarms); email template.
**Integration (verify:reminders, synthetic tenant):** cron sweep sends once per (deadline,mark,user),
idempotent on re-run, respects opt-in + filed-status, 401 without the secret. **Component:** dashboard
widget (+empty state), nav badge count, /compliance banner, /users toggle.

## Design Review Revisions (2026-07-01) — folded

Design completeness 6/10 → 9/10, calibrated to DESIGN.md + the existing screens (Card/Metric/Badge,
wine `--accent`, cream surfaces, light-only, `<th scope>`). Folded:

- **D1 — dashboard widget leads with the nearest deadline.** A Card: "Next filing: {form} due {date}
  ({N days})" in an urgency tone (≤2d danger, ≤7 warning), then up to 2 more, then a "Review & file"
  link. Calm empty state: "All caught up — no filings due in the next 30 days."
- **D2 — nav badge = open-deadline count**, danger-toned if any ≤2 days or overdue (reuses the
  `pendingSamples` badge pattern, passed from `(app)/layout.tsx`).
- **D3 — /compliance banner is a SINGLE summarized line (resolves council Q2).** "Next: {form} due
  {date} ({daysLeft}) · {N} upcoming" (overdue → danger). NOT one banner per deadline — a semimonthly
  filer would drown. One line, links to the full list.
- **D4 — reminder email: one deadline per email, scannable.** Subject is the action ("TTB 5120.17 due
  in 2 days — June 2026"); body via `brandShell` leads with form + due date + days-left + a "Review &
  file" CTA to `/compliance`. One deadline per email (not a digest) so the subject is actionable.
- **D5 — /users opt-in is an explicit labeled toggle** ("Compliance reminder emails") with helper text,
  not color-only; default off.
- **D6 — Settings calendar button** labeled "Add filing deadlines to calendar" with a note: "downloads a
  calendar file with alerts 1 week, 2 days, and the day each report is due."
- **D7 — states + a11y:** empty (warm), overdue (danger icon+text+color, never color alone), 44px
  targets, focus-visible ring, real table semantics, light-only.

**No design forks.** Council Q2 resolved (summary line). Q1 (hardcoded holidays) is an eng/ops choice,
recommended hardcode.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| R1 Duplicate/again emails from the daily cron | MED | MED | `ComplianceReminderLog` unique (tenant,form,periodKey,mark,user); insert-then-send-guard |
| R2 Cron route publicly hittable | MED | MED | Gate on `CRON_SECRET` bearer; 401 otherwise; test it |
| R3 Wrong due date (weekend, semimonthly, Sept) | MED | HIGH | Pure `deadlines.ts` + boundary tests; reuse 025/026 cadence helpers; weekend roll |
| R4 Brevo 300/day free-tier cap | LOW | MED | Small recipient set; best-effort `trySend`; log failures (don't block) |
| R5 5000.24 stream before 026 exists | MED | LOW | Feature-gate the excise branch on the return-cadence module; ship 5120.17 stream first |
| R6 New tenant tables leak | LOW | HIGH | Phase-12 checklist + isolation tests (Unit 1) |
| R7 Timezone drift (UTC cron vs winery local) | MED | MED | Compute deadlines in UTC date-only; a ±1-day fuzz on marks so nobody is skipped |

## Success Criteria

- [ ] A tenant's open 5120.17 (+5000.24 once 026 lands) deadlines are computed correctly from cadence,
      with weekend-rolled due dates, and drop off once the matching report is FILED.
- [ ] Dashboard widget + nav badge + /compliance banner show upcoming/overdue deadlines with urgency.
- [ ] Opted-in users get emails at 1 week / 2 days / day-of; each (deadline, mark, user) at most once;
      re-running the sweep sends nothing new.
- [ ] Admins set who receives reminders in /users; default off; tenant-isolated.
- [ ] The daily Vercel Cron route runs the sweep and rejects unauthenticated calls.
- [ ] "Add filing deadlines to calendar" downloads a valid `.ics` that imports into Google/Apple/Outlook
      with −1w/−2d/day-of alarms.
- [ ] Both new tables pass tenant-isolation; all tests + `verify:reminders` green; no 025/026 regressions;
      `tsc` + lint clean.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Council (Gemini + Claude) | `/council` | Cross-LLM adversarial | 1 | ✅ folded | 3 CRITICAL (C1 directional roll + holidays-in-v1, C2 $0-semimonthly no-remind, C3 cron timeout/batching), 6 SHOULD-FIX (S1 date-string no-fuzz, S2 PENDING→SENT log, S3 semimonthly drops 1wk mark, S4 Sept split, S5 amend re-surfaces, S6 constant-time cron auth). Codex excluded. All folded. |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | excluded | Operator excludes Codex |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ✅ CLEAR | 5 folded (E1 one-authority openDeadlines, E2 $0-excise gated on 026, E3 upsert send-log, E4 pure business-day-roll+holidays, E5 idempotent cron). Test Coverage Map added; critical gaps assigned tests (directional roll+holidays, $0-drop, cron auth/idempotency); 0 left open. Codex excluded. |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ✅ folded | 6/10 → 9/10. D1 nearest-deadline widget, D2 count badge, D3 single summarized banner (resolves council Q2), D4 one-deadline-per-email, D5 /users toggle, D6 Settings calendar button, D7 states+a11y. No design forks. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | n/a | Internal admin tool. |

**VERDICT:** ✅ **COUNCIL folded · ENG CLEARED · DESIGN 9/10** — full pipeline complete (Council → Eng →
Design), all CRITICAL + SHOULD-FIX folded. Directional roll + v1 holidays, $0-semimonthly no-remind,
date-string (no fuzz), PENDING→SENT idempotent cron, semimonthly-drops-1wk, single summary banner.
**Build-order: 026 (excise compute) before 027's excise reminder stream; the 5120.17 stream ships on
025 alone.** Ready to implement: `/work docs/plans/2026-07-01-027-feat-compliance-deadline-reminders-plan.md`.
