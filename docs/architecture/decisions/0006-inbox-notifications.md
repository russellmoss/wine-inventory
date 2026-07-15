# ADR 0006 — Inbox: discrete notifications vs live buckets, per-user RLS, single-badge, deferred seams

- **Date:** 2026-07-15
- **Status:** accepted

## Context

Plan 068 adds a Gmail-like in-app message center: updates on a user's tickets and work orders, plus
person-to-person direct messages, with an unread badge on the sidebar avatar. Three design forks had to
be settled before building: what drives "unread," how "only mine" is enforced, and which delivery
channels ship in v1.

## Decision

1. **Notifications (discrete, read/unread) vs buckets (live queries) are separate concepts.** A single
   `InboxNotification` table holds one row per discrete event (ticket reply/status, WO assigned/status,
   new DM); `readAt IS NULL AND archivedAt IS NULL` = unread and drives the badge. The Work-Orders and
   Tickets *buckets* are live filtered queries over the existing WO/ticket tables (`assigneeId` /
   `actorUserId == me`), NOT copied rows — always current, no sync problem. Read-receipts only make
   sense on the discrete rows.

2. **Per-user isolation is DB-enforced (Unit 1b), not just app-layer.** A second per-transaction GUC
   `app.user_id` is set beside `app.tenant_id` by the Prisma extension. RESTRICTIVE per-user RLS policies
   on the inbox tables AND with `tenant_isolation`: reads/updates/deletes are owner-only (recipient /
   thread participant); INSERT stays tenant-only so a same-tenant actor can create a notification FOR
   another user (the emit path). Unset `app.user_id` fails closed. Invariant **INBOX-1**, guard
   `verify:inbox-isolation`.
   - **Load-bearing gotcha:** emit MUST use `createMany`, not `create` — Prisma's `INSERT … RETURNING`
     is checked against the restrictive per-user SELECT policy and would reject a foreign-recipient row.

3. **One badge source.** DMs emit an `InboxNotification` too, so a single `countUnreadInbox` query feeds
   the badge (no separate DM counter).

4. **Single choke point + channel seam.** All writes go through `emitNotificationTx`; `channels.ts`
   defines a `NotificationChannel` interface with an in-app channel (v1) and an email no-op stub. A
   future email channel is a drop-in; **realtime push (SSE/websocket) is deferred** — the badge refreshes
   on navigation / `router.refresh()`.

## Why (and what we rejected / accepted)

- **Rejected: count live open WOs+tickets+DMs directly for unread.** Incoherent with mark-read/unread on
  a constantly-changing WO record. Discrete rows win.
- **Rejected: snapshot every WO/ticket into inbox rows.** A sync problem for no gain; buckets stay live.
- **Rejected: a 4th `DirectMessageParticipant` table (v1).** 1:1 threads store the two user ids directly
  (sorted pair `userAId < userBId`, DB CHECK, idempotent resolve); `InboxNotification` already tracks
  read state, so a participant read-cursor is redundant. Reintroduce Participant for group DMs later.
- **Rejected: stored `href` column.** Deep links are derived at render from `sourceType`+`sourceId`
  (route changes don't become a backfill; no injection surface). `sourceId` is polymorphic (no FK) → the
  reader tombstones a deleted/no-longer-accessible source rather than 500.
- **Kept: denormalized `*Email` snapshots** (recipient/actor/sender) — house style + they feed the future
  email seam. IDs are source of truth; display resolves from `User` at read where practical. GDPR/staleness
  caveat: these are provenance snapshots, acceptable for v1.
- **Rate limiting:** a lightweight per-user DB-count cap on `sendDirectMessageCore` (no new infra);
  upstash/redis is the proper follow-up.
- **Accepted limitation — multi-org unread is per active org.** Unread is scoped to `effectiveTenantId`
  (matches the RLS/active-org model); a user in two wineries sees only the active org's unread until they
  switch. A cross-org aggregate would break tenant scoping.
- **WO_STATUS coverage (completed in review).** `bumpWorkOrderRollupTx` returns a change descriptor and
  stays pure (no actor threaded); EVERY caller emits WO_STATUS via `emitWorkOrderStatusTx` — the lifecycle
  cores (assign/issue/cancel/start), the approval paths, AND the task-completion cores
  (execute/maintenance/observations/sample-task/harvest/note). So any real status transition notifies the
  assignee (self-suppressed when the actor is the assignee). Emit fires only on `change.changed` (the
  conditional-`updateMany` gate), so no double-fire and no emit on a no-op rollup.

Guards: `verify:inbox-isolation` (per-user), `verify:tenant-isolation` (cross-org, auto-covers the new
tables), `verify:invariants` (INBOX-1 is guarded). Related: [[INBOX-1-recipient-isolation]],
[[TENANT-1-rls-isolation]], plan 068.
