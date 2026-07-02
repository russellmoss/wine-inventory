# Council Feedback — Plan 027: Compliance Filing-Deadline Reminders + Calendar Export

**Date**: 2026-07-01
**Reviewers**: Gemini 3.1 Pro (TTB domain + serverless), Claude (types + infra + reuse)
**Panel**: Gemini + Claude only (Codex excluded, per operator).
**Plan**: `docs/plans/2026-07-01-027-feat-compliance-deadline-reminders-plan.md`
(Note: 026's council findings live in that plan's Council Revisions section; this file is per-run.)

## Critical Issues (fold before /work)

- **C1 (Gemini) — due dates roll in OPPOSITE directions by form; holidays are NOT deferrable.**
  5120.17 rolls **FORWARD** to the next business day (27 CFR 24.300(g)); the 5000.24 excise return rolls
  **BACKWARD** to the immediately preceding business day (24.271(c)(1)(i)) — paying late is a penalty,
  so it's pulled earlier, never pushed later. A uniform "roll forward" would file excise LATE. Federal
  holidays must be in v1 (a holiday-adjacent due date computed wrong = a real penalty). Fix: directional
  roll per form + a hardcoded ~11 US federal holidays × ~5 years constant. Fixes Unit 2; removes the
  "holiday deferred" line.
- **C2 (Gemini) — a $0 semimonthly excise period need NOT be filed (24.271(i)); don't remind on it.**
  Firing OVERDUE/day-of for a $0 period is a false positive that kills trust. Fix: for 5000.24
  semimonthly, drop the deadline when the period's computed liability is $0 (the 5120.17 ops report is
  ALWAYS due, even at zero — keep it). Fixes Unit 3. (Claude C6: this couples the excise reminder to
  026's liability COMPUTE, not just its cadence — see build-order.)
- **C3 (Gemini) — the full-tenant sweep will time out on Vercel.** A synchronous route awaiting Brevo
  per recipient exceeds the function timeout at a few dozen tenants. Fix: `export const maxDuration =
  300`, batch tenants (e.g. chunks of 5), and handle Brevo's 300/day + HTTP 429 gracefully (abort
  cleanly without corrupting the log). Fixes Unit 5.

## Suggested Improvements (SHOULD-FIX)

- **S1 (Gemini) — kill the "±1-day fuzz"; use date-STRING equality.** Compute due dates as `YYYY-MM-DD`
  strings; the cron runs at 13:00 UTC (daytime across all US zones); send where `dueDateStr` minus the
  mark offset == today's UTC date string. No JS `Date` comparison, no fuzz (a double-send factory).
  Fixes Unit 2/5, Risk R7.
- **S2 (Gemini) — PENDING→SENT two-phase log (send-then-confirm).** A missed compliance reminder is
  worse than a double email. Insert a `PENDING` log row, send, update to `SENT`; a `PENDING` row older
  than N minutes on the next run is retried. Beats "insert-then-send" (misses on send failure) and
  "send-then-insert" (double-sends on insert failure). Add `status` to `ComplianceReminderLog`. Units 1/5.
- **S3 (Gemini) — drop the 1-week mark for SEMIMONTHLY.** A semimonthly period is ~15 days; a 1-week-out
  reminder fires ~1 day after the period ends = noise → opt-outs. Semimonthly gets 2-day + day-of only;
  keep 1-week for monthly/quarterly/annual. Fixes Unit 3.
- **S4 (Gemini) — September split explicit due dates + backward roll.** Sept 1–15 → due ~Sep 29;
  16–25 → ~Sep 28 (non-EFT) / 29 (EFT); 26–30 → Oct 14. Pure "+14d" fails for the mid/late-Sept periods;
  `upcomingDeadlines` needs a September override (from 026's return-cadence) with the backward roll. Unit 2.
- **S5 (Gemini/Claude) — amended/late returns re-enter openDeadlines (derived).** Filter out periods with
  a FILED report UNLESS it's been re-opened/amended; be explicit so an amend re-surfaces the deadline. Unit 3.
- **S6 (Claude) — cron auth is timing-safe + at-least-once safe.** Vercel Cron can deliver twice; the
  PENDING/SENT log + unique constraint already dedupe. Compare `CRON_SECRET` with a constant-time check;
  reject missing/mismatched with 401. Unit 5.

## Design Questions (operator)

1. **Holiday source.** Hardcode US federal holidays as a checked-in constant (recommended, offline, no
   dep) vs a holiday library/API? (Recommend hardcode + a "refresh yearly" note.)
2. **In-app quiet hours / digest.** With semimonthly filers getting many marks, do we want a single
   "next deadline" summary in-app rather than one banner per open deadline? (Design review will weigh in.)

## Fork/decision updates after this review

- **Roll direction** — was uniform-forward; now **forward for 5120.17, backward for 5000.24** (C1).
- **Holidays** — was deferred; now **in v1** as a hardcoded constant (C1).
- **Timezone** — ±1-day fuzz **removed**, replaced by date-string equality at 13:00 UTC (S1).
- **Idempotency** — send-log gains a **PENDING→SENT** status (S2).
- **Marks** — **semimonthly drops the 1-week mark** (S3).

## Build-order (updated)

The 5120.17 reminder stream ships on 025 alone. The **5000.24 stream now depends on 026's excise
COMPUTE** (not just its cadence) because the $0-period drop (C2) needs the period's liability. So:
**026 must ship before 027's excise reminders.** The 5120.17 stream can ship first regardless.

---
## Raw Response — Gemini (gemini-3.1-pro-preview)

### CRITICAL
1. Weekend/holiday roll: 5120.17 rolls FORWARD (24.300(g)); 5000.24 rolls BACKWARD to the preceding
   business day (24.271(c)(1)(i)). Uniform forward-roll files excise late. Federal holidays cannot be
   deferred — hardcode ~11 holidays × 5 years.
2. $0 semimonthly excise (24.271(i)) need not be filed → don't remind/OVERDUE on it (false positive
   kills trust). Cross-reference the 5000.24 liability calc; drop if liability==0. Ops report always due.
3. Vercel Cron timeout: a synchronous all-tenant sweep exceeds the function limit. Set maxDuration=300,
   batch tenants, handle Brevo 429/300-day cap gracefully.

### SHOULD-FIX
4. Drop the ±1-day fuzz; compare `YYYY-MM-DD` strings; cron at 13:00 UTC is daytime US-wide.
5. Idempotency: send-then-insert (or PENDING→SENT) — a missed deadline is a violation; a double email
   is only annoying. Prefer PENDING→SENT with stale-retry.
6. Semimonthly fatigue: drop the 1-week mark for semimonthly (only ~15-day periods); keep -2d + day-of.

### DESIGN QUESTIONS
7. Amended/late returns re-enter the derived openDeadlines — filter FILED unless re-opened.
8. .ics: VALUE=DATE all-day is correct; UID = tenant+form+periodKey ONLY (not mark/dueDate) so
   calendar updates instead of duplicating.
9. September split explicit mapping (Sep 1–15→~29; 16–25→28/29; 26–30→Oct 14) with backward roll;
   "+14d" fails for mid/late September.

---
## Raw Response — Claude (types + infra + reuse)

### CRITICAL
- C6: the $0-drop (Gemini C2) couples the 5000.24 reminder to 026's excise COMPUTE (liability), not just
  its cadence helper. Deepens the build-order dependency: 026 (compute) before 027's excise stream.

### SHOULD-FIX
- S6: `CRON_SECRET` compare must be constant-time; the route must be safe under Vercel's at-least-once
  cron delivery (the PENDING/SENT log + unique constraint handle it).
- Keep in-app "daysUntil" date-only to match the send logic (no Date-object drift).
