---
title: User Inbox — Gmail-like in-app message center
type: feat
status: draft
date: 2026-07-15
branch: claude/user-inbox-messaging
depth: deep
units: 10
---

## Overview

Give every user (all tenants) a personal, email-like message center reached from their
avatar in the sidebar. It unifies three streams into one Gmail-like surface: **updates on
their tickets** (a reply landed, the ticket was resolved), **their work orders** (assigned
to them, status changed), and **direct messages** with other people in their winery. A red
unread count sits on the avatar; opening an item marks it read; they can mark it unread
again. The avatar becomes the unified "me" hub — messages plus account/user management,
the way Gmail's account menu hosts settings.

## Problem Frame

Right now, when a user files a ticket and the developer/goalie resolves it with an outcome
note, that reply lands in the `/developer` console — the submitter never sees it unless they
go digging. Work-order assignments and status changes are invisible unless you happen to be
looking at the work-orders page. There is no person-to-person messaging at all. Work is
happening *to* users with no feedback loop back *to* them.

The job the user is hiring this feature for: "tell me what happened to the things I care
about, in one place, without me having to go check five screens." That is an inbox.

What happens if we do nothing: the ticket loop stays broken (users assume nothing happened),
and coordination between cellar staff stays out-of-band (text messages, sticky notes).

**Framing note (not a blocker):** the "Work Orders" and "Tickets" buckets are *not* really
messages — they are saved, filtered views over live data. Only the discrete events (reply,
status change, new DM) are true inbox items that drive the unread count. The plan keeps these
two ideas separate on purpose: **notifications** (stored, per-event, read/unread) vs
**buckets** (live filtered queries). Conflating them makes read-receipts on a constantly
changing work-order record incoherent.

## Requirements

- MUST: A mailbox entry point on the user avatar card at the bottom of the sidebar
  (`src/components/AppShell.tsx:209-215`), with a **red** unread-count badge, clickable to `/inbox`.
- MUST: Unread count is driven by discrete stored notification rows (`readAt IS NULL`),
  computed server-side and threaded through `layout.tsx → AppShell` like the existing badges.
- MUST: `/inbox` renders a Gmail-like layout — left bucket rail, message list, reader pane.
- MUST: Buckets — **All messages**, **Work Orders**, **Tickets**, **Direct messages**.
  - Work Orders auto-opens to *my* open work orders (`WorkOrder.assigneeId == me`), filterable
    to in-progress / completed.
  - Tickets auto-opens to *my* open feedback tickets (`FeedbackTicket.actorUserId == me`),
    filterable to closed/resolved.
  - Everything scoped to **only mine** (personal inbox), never tenant-wide.
- MUST: A notification is emitted on: ticket reply/resolve, WO assigned to me, WO status change
  on a WO assigned to me, and a new direct message to me.
- MUST: Opening an item marks it read; user can mark it unread again; "mark all read".
- MUST: Direct messages — same-tenant user↔user, text **and attachments** (reuse the Vercel Blob
  pattern from feedback attachments).
- MUST: New models are tenant-scoped with RLS; notifications/messages never leak across tenant
  or across recipient user. New invariant + verify guard.
- SHOULD: Avatar hub also surfaces account/user management (link into existing `/settings` and,
  for admins, `/users`) — do NOT rebuild those; host entry points from the inbox rail.
- NICE: `/inbox?bucket=...&filter=...` is deep-linkable (so notifications can link straight in).
- OUT (design seam only): bridge to real external email.
- OUT: realtime push (websocket/SSE). Count refreshes on navigation/`router.refresh()`.

## Scope Boundaries

**In scope:**
- New Prisma models + two-migration (schema + RLS) rollout, composite tenant FKs (K11).
- Inbox read/write core (`src/lib/inbox/**`): emit, list, unread-count, mark read/unread.
- Direct-message core + attachment model reusing the blob upload helper.
- Notification emission hooks inside existing feedback + work-order cores (piggyback on their tx).
- `/inbox` route (RSC + client) and avatar entry point + red badge wiring.
- New invariant note + `verify:inbox-isolation` guard.

**Out of scope (and why):**
- External email send/receive — leave a `NotificationChannel` seam, don't implement (no provider
  wired, not needed for v1).
- Realtime push — no websocket/SSE infra exists; navigation-refresh matches every other badge.
- Rebuilding `/users` or `/settings` — they already exist; we only link to them from the hub.
- Notifications for events other than the four listed (no "someone edited a lot" firehose in v1).
- Cross-tenant messaging or messaging the dev/support team (explicitly deferred).

## Research Summary

### Codebase Patterns

**Tenant scoping is a denylist, not an allowlist.** `src/lib/tenant/models.ts:12-20` defines
`GLOBAL_MODELS` (User, Session, Account, Verification, Organization, Member, Invitation). Every
model *not* in that set is auto-scoped by the Prisma extension (`src/lib/prisma.ts:53-84`), which
injects `tenantId` on writes and sets `app.tenant_id` per transaction. **New tenant-scoped models
require NO edit to `models.ts`** — and adding them to `GLOBAL_MODELS` would be the bug (it strips
scoping). The coverage guard `scripts/verify-tenant-isolation.ts:66-81` auto-enumerates every
non-global model and asserts RLS is enabled+forced with a `tenant_isolation` policy, so a new
model that skips its RLS migration fails CI automatically.

**Migration convention** (`docs/architecture/decisions/0003-*`): two sequential migrations,
`..._<feature>_schema` then `..._<feature>_rls`; deploy via `prisma migrate deploy` (build step),
local dev via `prisma migrate dev` (`package.json:7,13`). Canonical example to mirror verbatim:
- Schema: `prisma/migrations/20260711132000_equipment_schema/migration.sql:4-37` — `tenantId TEXT NOT NULL DEFAULT ''`, `@@unique([tenantId, id])` promoted to a constraint via
  `ALTER TABLE ... UNIQUE USING INDEX` so it can be a composite-FK target, `tenantId → organization(id)` FK.
- RLS: `prisma/migrations/20260711132100_equipment_rls/migration.sql:5-33` — `ENABLE`+`FORCE ROW LEVEL SECURITY`, `CREATE POLICY "tenant_isolation" ... current_setting('app.tenant_id', true)`,
  `GRANT ... TO app_rls`, plus the trailing `DO $$` self-check that fails the migration if RLS/policy is missing.
- Composite FK (K11): `prisma/migrations/20260711132000_equipment_schema/migration.sql:36-37` —
  `FOREIGN KEY ("tenantId","taskId") REFERENCES "work_order_task"("tenantId","id")`. Scalar id
  columns, **no Prisma `@relation`**. NOTE: a FK to the global `User` table is a plain single-column
  `FOREIGN KEY (recipientUserId) REFERENCES "user"(id)` — composite `(tenantId, x)` FKs only apply
  when the parent is itself tenant-scoped.

**Server action → Core → tenant-tx layering.** `action()`/`adminAction()` (`src/lib/actions.ts:48-72`)
resolve the verified tenant from session (K9, never client input) and wrap the handler in
`runAsTenant`. Cores write via `runInTenantTx` + `requireTenantId()` and call `writeAudit`
(template: `src/lib/equipment/equipment.ts:34-42`). Reads pass `tenantId` explicitly (K12) and use
`runAsTenant` (template: `src/lib/equipment/equipment.ts:111-120`). Raw aggregates use
`runInTenantRawTx` (`src/lib/tenant/tx.ts:42-60`), which is what `verify:raw-sql` enforces.

**Badge wiring.** `src/app/(app)/layout.tsx` computes counts in one `Promise.all` (lines 14-20)
from `requireReadyUser()` (line 11) with `effectiveTenantId = user.supportOrganizationId ?? user.activeOrganizationId`
(line 13), then passes props to `AppShell` (lines 22-26). `countPendingApprovalWorkOrders(tenantId)`
(`src/lib/work-orders/data.ts:420-422`) is the shape to mirror for `countUnreadInbox`. `AppShell`
`badgePill` style is at `src/components/AppShell.tsx:57-61`; the urgent/red override pattern
(`background: var(--danger)`, `color:#fff`) is at lines 194-197; the avatar card to augment is at
lines 209-215 (rendered in both desktop `<aside>` and mobile drawer; thread new props through
`SidebarContent` prop type at lines 154-171).

**Attachments / Vercel Blob.** `FeedbackAttachment` model at `prisma/schema.prisma:966-988`
(fields incl. `filename, contentType, byteSize, width?, height?, sha256, blobUrl, captureSource`).
Upload happens in `storeFeedbackAttachment` (`src/lib/feedback/attachments.ts:132-158`) via
`put(path, bytes, { access:"private", addRandomSuffix:true, contentType })` from `@vercel/blob`,
then `prisma.feedbackAttachment.create({ data: { ..., blobUrl: blob.url } })`, all in `runAsTenant`,
capped at `MAX_ATTACHMENTS_PER_ITEM = 5`. `BLOB_READ_WRITE_TOKEN` is checked at the route layer
(`src/app/api/feedback/attachments/route.ts:40`) with a graceful skip when absent. Client posts
`FormData` to `/api/feedback/attachments` (`FeedbackForm.tsx:62-67`).

**Hook points for emission (piggyback on existing tx):**
- Ticket reply/resolve: `closeFeedbackItemCore` (`src/lib/developer/feedback-item-actions.ts:140-289`,
  update shape at 184-190, sets `resolvedAt` + outcome note). Non-terminal edits:
  `updateFeedbackItemCore` (same file, 60-138). Emit to `FeedbackTicket.actorUserId` only, when present.
- WO assignment: `assignWorkOrderCore` (`src/lib/work-orders/lifecycle.ts:199-218`).
- WO status: `bumpWorkOrderRollupTx` (`lifecycle.ts:293-304`, the single choke point for rollup
  status), plus explicit `issueWorkOrderCore` (168-196) and `cancelWorkOrderCore` (248-269). Emit to
  `WorkOrder.assigneeId`. All cores already run in `runInTenantTx` + `writeAudit`.

**Verify guards** (`package.json:24-73`): `verify:tenant-isolation` (`scripts/verify-tenant-isolation.ts`,
live two-client BYPASSRLS vs `app_rls` exit-proof; also couples RLS checks with the app-layer
`src/lib/users/scope.ts` membership filter — the exact precedent for our "across recipient user"
dimension, see its lines 189-194), `verify:raw-sql`, `verify:invariants`
(`scripts/verify-invariant-guards.mjs` — reads `docs/architecture/invariants/*.md` frontmatter,
asserts each note's `verify:` guard exists), `verify:naming`. Invariant note template:
`docs/architecture/invariants/TENANT-1-rls-isolation.md`. **CRITICAL gotcha**: invariant notes must
use **LF line endings** — a CRLF frontmatter block is silently skipped (`invariants/README.md:22-23`).

### Prior Learnings

- **Build in the main checkout, not the worktree** — the source lives in
  `C:\Users\russe\Documents\Wine-inventory` (this worktree holds only `.claude/`). Migrations,
  `verify:*`, and `next build` must run there (it has `.env`).
- **`.claude/worktrees/*` is not a real worktree** — no `.env`/`node_modules`; run DB-touching
  verifies from main.
- **Assistant/inbox UI is manual-QA-only** — repo has no jsdom/RTL. Test pure logic (unread
  counting, bucket filtering, notification-payload builders); QA the UI in the browser.
- **Demo Winery tenant only** for QA; `QA-*`-prefixed fixtures; keep `verify:naming` green.
- **`gh pr merge --delete-branch` errors on worktree-locked main** but the remote merge succeeds.

### External Research

None required — no new external dependency. `@vercel/blob` is already in use.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Unread source of truth | One `InboxNotification` table; `readAt IS NULL` = unread | Count live open WOs+tickets+DMs directly | Discrete rows make read-receipts + mark-unread coherent; buckets stay live views |
| Buckets for WO/Tickets | Live filtered queries over existing tables (not copied rows) | Snapshot every WO/ticket into inbox rows | Always current; avoids a sync problem; matches "auto-open to my open items" |
| DM storage (v1) | Thread (2 user ids) + message + attachment | 4-table Thread+Participant model; 2-table no-Thread | Participant.lastReadAt is redundant since InboxNotification tracks read; 1:1 pair fits on the thread; add Participant when group DMs land (review decision 1) |
| DM attachments | Shared `attachments/blob.ts` helper + own `DirectMessageAttachment` table | Overload `FeedbackAttachment` FKs | DRY the blob upload; don't stretch feedback's FKs across an unrelated domain (review decision 2) |
| DM unread | DM emits an `InboxNotification` too | Separate DM unread counter | Single badge source; one `countUnread` query |
| Unread scope (multi-org) | Per active org (`effectiveTenantId`) | Aggregate across all a user's orgs | Matches the RLS/active-org model; cross-org aggregate would break tenant scoping. Known limitation: a user in 2 wineries sees only the active org's unread until they switch (documented, acceptable v1) |
| Recipient link | Plain scalar `recipientUserId`+`recipientEmail`, single-col FK to global `user` | Composite tenant FK | `User` is a GLOBAL table (no tenantId); composite FK only for tenant-scoped parents |
| Account/user mgmt in hub | Link into existing `/settings` + `/users` from the inbox rail | Rebuild inside `/inbox` | Don't duplicate working surfaces; Gmail also just links to account settings |
| Self-notification | Suppress when `recipientUserId === actorUserId` | Notify anyway | "I assigned a WO to myself" is noise, not news |
| Badge color | Red (`var(--danger)`, white text) | Reuse accent-soft pill | User explicitly asked for a red circle; matches the compliance-urgent precedent |

## Implementation Units

### Unit 1: Data model + migrations (schema + RLS + composite FKs)

**Goal:** Land the tenant-scoped tables that back the inbox.
**Files:**
- `prisma/schema.prisma` (add models + enums)
- `prisma/migrations/<ts>_inbox_schema/migration.sql` (new)
- `prisma/migrations/<ts>_inbox_rls/migration.sql` (new)

**Approach:** Add **four** tenant-scoped models (DM Participant table dropped — see review
decision 1), each with `tenantId String @default("")`, `@@unique([tenantId, id])`,
`@@index([tenantId])`, and no `@relation` across tenant boundaries (K11 — composite FKs in raw SQL).
- `InboxNotification` — `recipientUserId String`, `recipientEmail String`, `category`
  (`InboxCategory`: WORK_ORDER | TICKET | DIRECT_MESSAGE | SYSTEM), `kind` (`InboxKind`:
  TICKET_REPLY | TICKET_STATUS | WO_ASSIGNED | WO_STATUS | DIRECT_MESSAGE), `title String`,
  `snippet String`, `sourceType String`, `sourceId String`, `href String?` (deep link),
  `actorUserId String?`, `actorEmail String?`, `readAt DateTime?`, `archivedAt DateTime?`,
  `createdAt DateTime @default(now())`. Indexes: `@@index([tenantId, recipientUserId, readAt])`,
  `@@index([tenantId, recipientUserId, category, createdAt])`. NOTE: `sourceId` is polymorphic
  (points at a WO / ticket / DM thread) so it carries **no FK** — the UI must render gracefully when
  the source was deleted (dangling deep link → "this item no longer exists"); no cascade cleanup in v1.
- `DirectMessageThread` — `subject String?`, `createdByUserId String`, `userAId String`,
  `userAEmail String`, `userBId String`, `userBEmail String`, `lastMessageAt DateTime`. Store the two
  participants directly (v1 is 1:1). `@@unique([tenantId, userAId, userBId])` with a sorted-pair
  convention (userAId < userBId) so `resolveOrCreateThread` is idempotent. When group DMs arrive later,
  reintroduce a `DirectMessageParticipant` table then — not now (YAGNI).
- `DirectMessage` — `threadId String`, `senderUserId String`, `senderEmail String`, `body String`,
  `createdAt DateTime @default(now())`.
- `DirectMessageAttachment` — mirror `FeedbackAttachment` fields (`filename, contentType, byteSize,
  width?, height?, sha256, blobUrl`), `messageId String`.
- Composite FKs (raw SQL): `direct_message(tenantId, threadId) → direct_message_thread(tenantId, id)`,
  `direct_message_attachment(tenantId, messageId) → direct_message(tenantId, id)`, and every table's
  `tenantId → organization(id)`. `recipientUserId`/`senderUserId`/`userAId`/`userBId` get plain
  single-column FKs to `user(id)` (global table — no composite tenant FK; confirmed correct in review).
- RLS migration mirrors `20260711132100_equipment_rls` for all four tables (ENABLE+FORCE, policy
  `tenant_isolation`, GRANT to `app_rls`, trailing `DO $$` self-check listing all four).

**Tests:** none (schema unit). Verification is the migration self-check + `verify:tenant-isolation`.
**Depends on:** none.
**Execution note:** Run `prisma migrate dev` and all verifies from the **main checkout** (has `.env`).
Split schema vs RLS into two migrations. Watch the Neon cold-start P2028 on first connect.
**Patterns to follow:** `prisma/migrations/20260711132000_equipment_schema/migration.sql:4-37`,
`20260711132100_equipment_rls/migration.sql:5-33`, `prisma/schema.prisma:966-988` (attachment shape),
`prisma/schema.prisma:3477-3488` (K11 scalar-id + comment).
**Verification:** `npm run db:migrate` applies cleanly; `npm run verify:tenant-isolation` passes
(auto-covers the four new tables); `npx prisma validate`.

### Unit 2: Inbox notification core (emit / list / count / read state)

**Goal:** The server layer that emits notifications, lists them, counts unread, and toggles read.
**Files:**
- `src/lib/inbox/notifications.ts` (new — core)
- `src/lib/inbox/types.ts` (new — payload/DTO types)
- `src/lib/inbox/actions.ts` (new — `"use server"` wrappers)
- `test/inbox/notifications.test.ts` (new — pure-logic tests)

**Approach:**
- `emitNotificationTx(tx, { recipientUserId, recipientEmail, category, kind, title, snippet,
  sourceType, sourceId, href, actor })` — inserts one row inside a caller-provided tx (so hooks
  piggyback). Suppress when `recipientUserId === actor.actorUserId`. This is the single choke point.
- `listNotifications(tenantId, userId, { category?, unreadOnly?, limit, cursor })` — `runAsTenant`,
  `where: { recipientUserId: userId, archivedAt: null, ...category }`, newest first. Tenant scope via
  RLS **and** explicit `recipientUserId` predicate (defense in depth; User has no RLS).
- `countUnreadInbox(tenantId, userId)` — `runAsTenant` count where `recipientUserId=userId, readAt:null,
  archivedAt:null`. Mirror `countPendingApprovalWorkOrders` signature exactly.
- `markRead` / `markUnread` / `markAllRead` cores + actions — `updateMany` scoped to
  `recipientUserId=userId` so a user can only touch their own rows; `writeAudit` optional (skip for
  read-toggles to avoid audit noise — decide in review).
- Pure helpers extracted for tests: `buildTicketNotificationPayload`, `buildWorkOrderNotificationPayload`,
  `shouldSuppressSelfNotification`.

**Tests:** unread-count math (mixed read/unread/archived), category filtering, self-suppression true/false,
payload builders (title/snippet/href correctness), "markRead only affects my rows" (logic-level).
**Depends on:** Unit 1.
**Patterns to follow:** `src/lib/equipment/equipment.ts:34-42,111-120` (write/read layering),
`src/lib/work-orders/data.ts:420-422` (count helper), `src/lib/actions.ts:48-72` (action wrapper).
**Verification:** `npm run verify` (typecheck + lint) green; `npm test test/inbox/notifications.test.ts`.

### Unit 3: Direct-message core + attachments

**Goal:** Send/read same-tenant DMs with text + attachments, emitting notifications to recipients.
**Files:**
- `src/lib/inbox/direct-messages.ts` (new — core: `sendDirectMessageCore`, `listThreads`, `getThread`,
  `resolveOrCreateThread`, `listTenantRecipients`)
- `src/lib/inbox/dm-actions.ts` (new — `"use server"`)
- `src/lib/attachments/blob.ts` (new — shared helper factored out of `feedback/attachments.ts`:
  the `put(path, bytes, {access:"private", addRandomSuffix:true, contentType})` call + validate/strip;
  review decision 2). Refactor `feedback/attachments.ts` to call it (behavior-preserving; make the
  change easy, then make the easy change).
- `src/lib/inbox/attachments.ts` (new — `storeDirectMessageAttachment`, uses the shared blob helper,
  writes a `DirectMessageAttachment` row)
- `src/app/api/inbox/attachments/route.ts` (new — mirror feedback attachment route)
- `test/inbox/direct-messages.test.ts` (new)

**Approach:**
- `resolveOrCreateThread(tenantId, meId, otherId)` — sort the pair (`userAId < userBId`), look up the
  existing thread by `@@unique([tenantId, userAId, userBId])`, else create it. Idempotent.
- `sendDirectMessageCore(actor, { threadId?, recipientUserId, body, attachmentIds? })` —
  `runInTenantTx`: resolve/create the thread, insert `DirectMessage`, bump `thread.lastMessageAt`,
  then `emitNotificationTx` (category DIRECT_MESSAGE, sourceId=threadId,
  href=`/inbox?bucket=dm&thread=<id>`) to the *other* user only. `writeAudit`.
- `listTenantRecipients(tenantId, meUserId)` — users in my org via `Member(organizationId, userId)`
  minus me. NOTE: `Member`/`User` are GLOBAL — scope by `organizationId = effectiveTenantId` at the
  app layer (this is the `src/lib/users/scope.ts` precedent).
- Attachments reuse the blob `put(...access:"private"...)` flow; cap at 5; graceful skip if
  `BLOB_READ_WRITE_TOKEN` absent. Reads go through the authed proxy route (amendment 1), never raw `blobUrl`.
- **Rate-limit cap (T3):** before insert, count this user's DMs sent in the last minute/day; reject over
  the cap with a clear error. No new infra (DB count). ADR notes upstash/redis as the proper follow-up.
- **Recipient validation (amendment 4):** confirm `recipientUserId` is a `Member` of `effectiveTenantId`
  before creating the thread; reject otherwise.

**Tests:** thread resolution (reuse vs create, sorted-pair idempotency), notification goes to the
other user and never the sender, recipient-list excludes self and other tenants (logic-level), attachment cap.
**Depends on:** Unit 1, Unit 2.
**Patterns to follow:** `src/lib/feedback/attachments.ts:132-158`, `src/app/api/feedback/attachments/route.ts`,
`src/lib/feedback/actions` for action wrapping.
**Verification:** `npm test test/inbox/direct-messages.test.ts`; manual: send a DM in Demo Winery,
confirm the recipient's notification row via a `runAsTenant("org_demo_winery", …)` read-back script.

### Unit 4: Ticket event hooks (reply / status → notification)

**Goal:** When a ticket gets an outcome reply or status change, notify the submitter.
**Files:**
- `src/lib/developer/feedback-item-actions.ts` (modify — `closeFeedbackItemCore`, `updateFeedbackItemCore`)
- `test/inbox/feedback-emission.test.ts` (new — payload/guard logic)

**Approach:** Inside the existing tx, after the ticket write, only for `FeedbackTicket` (not
`AssistantFeedback`) with a non-null `actorUserId`, call `emitNotificationTx` with category TICKET,
kind TICKET_STATUS (or TICKET_REPLY when the outcome note text changed), title like "Your ticket was
resolved" / "Update on your ticket", snippet = first ~140 chars of the new outcome note,
href=`/inbox?bucket=tickets&ticket=<id>`. Suppress self-notification (developer resolving their own
ticket).
**Verified-against-code amendments (review):**
- The current `SELECT` in `closeFeedbackItemCore` (`feedback-item-actions.ts:167-174`) fetches only
  `developerNotes, developerNotesVersion` — **widen it to also select `actorUserId, actorEmail`** (and
  the same in `updateFeedbackItemCore`), or the hook has no recipient.
- The write is an optimistic-concurrency `updateMany` gated on `developerNotesVersion`. **Emit only when
  the `updateMany` actually applied (`result.count > 0`)** — otherwise a lost-version retry double-emits.
- `updateFeedbackItemCore` (non-terminal edits) rejects RESOLVED/DISMISSED — emit TICKET_STATUS there
  only when `status` or `triageClass` actually changed.

**Tests:** emit-on-resolve produces correct payload; no emit when `actorUserId` null; no emit to self;
no duplicate emit when version-retry re-runs (logic-level guard).
**Depends on:** Unit 2.
**Execution note:** This edits a **governed** feedback core — the PreToolUse brain hook will inject
feedback/tenancy invariants; respect them. Keep the emission strictly additive (never change the
existing update/audit/automation behavior).
**Patterns to follow:** `src/lib/developer/feedback-item-actions.ts:184-190` (update shape),
`src/lib/developer/feedback-outcome.ts:23-39` (outcome note format for the snippet).
**Verification:** `npm run verify:feedback-security` + `npm run verify:invariants` green; manual QA:
resolve a `QA-*` ticket in Demo Winery, confirm the submitter's inbox row.

### Unit 5: Work-order event hooks (assignment / status → notification)

**Goal:** Notify the assignee when a WO is assigned to them or its status changes.
**Files:**
- `src/lib/work-orders/lifecycle.ts` (modify — `assignWorkOrderCore`, `bumpWorkOrderRollupTx`,
  `issueWorkOrderCore`, `cancelWorkOrderCore`, **plus every caller of `bumpWorkOrderRollupTx`** to
  thread `actor` — `startTaskCore`, and the approval paths below)
- `src/lib/work-orders/approval.ts` (modify — `approveTaskCore`, `rejectTaskCore`,
  `bulkApproveTasksCore` all call `bumpWorkOrderRollupTx`; pass `actor` through)
- `test/inbox/work-order-emission.test.ts` (new)

**Approach:** Inside each core's existing tx, after the status/assignee write, if `assigneeId` is
non-null call `emitNotificationTx` (category WORK_ORDER):
- `assignWorkOrderCore`: kind WO_ASSIGNED → the *new* assignee, "Work order #N assigned to you".
- Status choke point `bumpWorkOrderRollupTx` (+ issue/cancel): kind WO_STATUS → current assignee,
  href=`/inbox?bucket=wo&wo=<id>`. Suppress self-notification.

**Verified-against-code amendments (review) — this is the highest-blast-radius unit:**
- `bumpWorkOrderRollupTx(tx, workOrderId)` (`lifecycle.ts:293-304`) already computes `next !== wo.status`
  and only writes inside `if (Object.keys(data).length > 0)`. **Emit inside that same `next !== wo.status`
  branch** — double-emit is then structurally impossible. Confirmed at line 299.
- But the function **takes no `actor` and selects only `status, startedAt` (line 294)**. To emit you must
  (a) change its signature to `bumpWorkOrderRollupTx(tx, workOrderId, actor)` and update **all callers**
  (`startTaskCore:284`, `approveTaskCore`, `rejectTaskCore`, `bulkApproveTasksCore`), and (b) add
  `assigneeId, assigneeEmail` to its `select`. This is a wider touch than "modify lifecycle.ts" implies —
  budget for it. Alternative considered: emit from each caller instead of inside the rollup — rejected,
  it scatters the WO_STATUS logic and reintroduces double-emit risk. Keep the single choke point.

**Tests:** assign emits to new assignee not old; status-change emits once per real transition; no
emit when assignee null; no emit to self; no emit on no-op rollup (logic-level).
**Depends on:** Unit 2.
**Execution note:** **Governed** work-order core — additive only; do not alter existing rollup/audit
semantics. Highest-risk unit for double-emit; the `next !== wo.status` guard is mandatory.
**Patterns to follow:** `src/lib/work-orders/lifecycle.ts:199-218,293-304,168-196,248-269`,
`src/lib/work-orders/approval.ts` (approve/reject/bulk callers).
**Verification:** `npm run verify:invariants`; manual QA: assign + advance a `QA-*` WO in Demo Winery,
confirm assignee inbox rows and that no duplicates appear.

### Unit 6: Avatar entry point + unread badge wiring

**Goal:** Mailbox entry on the avatar card with a red unread count, clickable to `/inbox`.
**Files:**
- `src/app/(app)/layout.tsx` (modify — add `unreadMessages` to the `Promise.all`, pass as prop)
- `src/components/AppShell.tsx` (modify — `SidebarContent` prop type + avatar card block 209-215)

**Approach:** In `layout.tsx`, add `effectiveTenantId ? countUnreadInbox(effectiveTenantId, user.id)
: Promise.resolve(0)` to the existing `Promise.all`, pass `unreadMessages` prop. In `AppShell`, add
`unreadMessages?: number` to props + `SidebarContent` type; wrap the avatar card in a `Link href="/inbox"`
(keep "Sign out" as a nested button that stops propagation), add a small mailbox icon, and render a red
count badge (reuse `badgePill` with `background: var(--danger)`, `color:#fff`, capped display "9+").
Render in both desktop `<aside>` and mobile drawer paths.

**Tests:** none (UI). Logic already covered by Unit 2's count tests.
**Depends on:** Unit 2.
**Patterns to follow:** `src/app/(app)/layout.tsx:14-26`, `src/components/AppShell.tsx:57-61,194-197,209-215`.
**Verification:** manual QA in browser (Demo Winery): badge shows correct count, clears on open,
reappears on mark-unread, links to `/inbox`. Confirm mobile drawer too.

### Unit 7: Inbox UI route (Gmail-like buckets + list + reader)

**Goal:** The `/inbox` surface — bucket rail, message list, reader pane, filters, mark read/unread.
**Files:**
- `src/app/(app)/inbox/page.tsx` (new — RSC: resolve user/tenant, fetch bucket data)
- `src/app/(app)/inbox/InboxClient.tsx` (new — three-pane layout, bucket rail, list, reader)
- `src/app/(app)/inbox/buckets.ts` (new — server reads: `listMyWorkOrders`, `listMyTickets`,
  wrapping existing work-order/feedback read layers filtered by `assigneeId`/`actorUserId`)
- `src/lib/inbox/routes.ts` (new — deep-link/query-param helpers)

**Approach:** RSC reads the active bucket + filter from `searchParams`, fetches:
- All messages → `listNotifications`.
- Work Orders → `listMyWorkOrders(tenantId, userId, statusFilter)` (`WorkOrder.assigneeId == me`,
  default open = not CANCELLED/APPROVED, filterable to in-progress/completed).
- Tickets → `listMyTickets(tenantId, userId, statusFilter)` (`FeedbackTicket.actorUserId == me`,
  default open = NEW/TRIAGED/IN_PROGRESS, filterable to closed = RESOLVED/DISMISSED).
- Direct messages → `listThreads`.
Client renders Gmail-like three panes using DESIGN.md tokens (no hardcoded colors/spacing). Opening a
notification calls `markRead` then reveals the reader (and can deep-link to source). Reader has a
"mark unread" control; list has "mark all read". A lower rail section "Account" links to `/settings`
and (admin/developer only) `/users` — do not embed, just link. Buckets are deep-linkable via
`/inbox?bucket=...&filter=...`.

**Tests:** pure logic in `buckets.ts` filter mapping (status → query) unit-tested; UI is manual QA.
**Depends on:** Unit 2, Unit 3.
**Execution note:** UI is manual-QA-only (no jsdom/RTL). Use `get_page_text`/`read_page` in the
in-app browser; screenshots can hang on this box.
**Patterns to follow:** existing `(app)` route structure (e.g. `src/app/(app)/work-orders/`),
`src/lib/work-orders/data.ts` reads, `src/lib/developer/feedback.ts` reads, DESIGN.md + tokens.
**Verification:** browser QA in Demo Winery — each bucket auto-opens correctly, filters work, read/unread
toggles reflect in the badge; `runAsTenant` read-back confirms read-state persistence.

### Unit 8: Direct-message compose + attachments UI

**Goal:** Compose a DM to a same-tenant user with text + file attachments, view a thread.
**Files:**
- `src/app/(app)/inbox/ComposeMessage.tsx` (new — recipient picker + body + file input)
- `src/app/(app)/inbox/ThreadView.tsx` (new — message list within the reader pane)

**Approach:** Recipient picker populated from `listTenantRecipients`. Compose posts via
`sendDirectMessageAction`; attachments upload to `/api/inbox/attachments` as `FormData` (mirror
`FeedbackForm.tsx:62-67`), collecting upload warnings rather than failing the send. Thread view renders
messages oldest→newest with sender/name/time and attachment download links. After send, `router.refresh()`.

**Tests:** none (UI); core covered by Unit 3.
**Depends on:** Unit 3, Unit 7.
**Patterns to follow:** `src/app/(app)/help/feedback/FeedbackForm.tsx` (attachment upload flow),
controlled-input QA gotcha (use click+type for controlled text fields in the in-app browser).
**Verification:** browser QA in Demo Winery — send a DM with an attachment between two `QA-*` users;
confirm recipient badge + thread render + attachment download; `runAsTenant` read-back of rows.

### Unit 9: Isolation invariant + verify guard + email seam + realtime note

**Goal:** Lock in the no-leak invariant with an enforced guard, and document the deferred seams.
**Files:**
- `docs/architecture/invariants/INBOX-1-recipient-isolation.md` (new — **LF line endings**)
- `scripts/verify-inbox-isolation.ts` (new)
- `package.json` (add `"verify:inbox-isolation"` script + include in the aggregate `verify` chain)
- `docs/architecture/invariants/README.md` (bump the coverage snapshot)
- `src/lib/inbox/channels.ts` (new — `NotificationChannel` interface + in-app impl + email no-op stub)
- `docs/architecture/decisions/0005-inbox-notifications.md` (new — ADR incl. email + realtime seams)

**Approach:** Invariant note modeled on `TENANT-1-rls-isolation.md` (`severity: critical`,
`enforcedBy: app-code`, `verify: "npm run verify:inbox-isolation"`, `appliesTo` the new models/dirs).
**Guard covers the per-user dimension (now DB-backed via Unit 1b):** the tenant cross-org dimension is
already auto-covered by `verify-tenant-isolation.ts:66-81`. `verify:inbox-isolation` proves the
per-user boundary two ways: (a) **DB** — with `app.user_id` set to user A, a raw read of user B's
`inbox_notification` / DM rows returns zero (live exit-proof, like the tenant one); and (b) **static** —
every read in `src/lib/inbox/**` touching `inboxNotification` constrains by `recipientUserId`, and every
`directMessageThread` read constrains by the current user being in the pair (belt-and-suspenders with the
RLS policy; mirrors the `src/lib/users/scope.ts` coupling that `verify-tenant-isolation.ts:189-194`
documents). Also assert the INSERT-for-another-user path still works (actor notifies recipient). Optionally add
one live two-user read-back assertion in Demo Winery. `NotificationChannel` seam: `deliver(notification)`
with an `InAppChannel` (writes the row, already done in Unit 2) and an `EmailChannel` stub that is a
no-op + TODO; `emitNotificationTx` stays the choke point so a future email channel is a drop-in. ADR
records the notifications-vs-buckets split, the single-badge decision, the multi-org-unread limitation,
and the realtime follow-up (SSE/polling).

**Tests:** the guard script *is* the test.
**Depends on:** Unit 2, Unit 3 (guard needs the DAL to exist). Invariant note can be authored earlier
with `status: planned` (omit `verify:`) and flipped to `guarded` once the script lands.
**Execution note:** write the invariant note with LF endings or `verify:invariants` silently skips it.
**Patterns to follow:** `docs/architecture/invariants/TENANT-1-rls-isolation.md`,
`scripts/verify-tenant-isolation.ts:66-81,189-194,405-408`, `docs/architecture/decisions/0003-*`.
**Verification:** `npm run verify:inbox-isolation` passes; `npm run verify:invariants` sees the guard;
a deliberately-broken query (drop the `recipientUserId` predicate) makes the guard fail.

## Council Review Amendments (must apply — Codex gpt-5.4 + Gemini 3.1 Pro consensus)

These override the unit text above where they conflict. All are cross-model consensus (both
reviewers) except where noted.

1. **[Unit 3/8, P0] Private-blob read auth.** Never hand the raw `blobUrl` to the client. Store the
   blob **key** and serve downloads through an authenticated route (`/api/inbox/attachments/[id]`) that
   re-checks: session tenant == attachment `tenantId` AND the requester is `userAId`/`userBId` on the
   parent thread, then mints a short-lived signed URL. Enforce size/content-type limits on upload.
2. **[Unit 5, P1] Do NOT thread `actor` through `bumpWorkOrderRollupTx`.** Both models independently
   flagged this as coupling a pure derived-state recompute to notification semantics (and a
   missed-caller trap). Instead: `bumpWorkOrderRollupTx` **returns a change descriptor**
   `{ changed, prev, next, assigneeId, assigneeEmail }`; each caller emits `WO_STATUS` from its own tx
   using that return value. Keeps the rollup pure; callers already have `actor`.
3. **[Unit 4/5, P1] Idempotent emit — gate on the write, not an app-level compare.** `next !== wo.status`
   in JS is not a concurrency barrier (two txns can both read the old status). Emit only off the
   conditional UPDATE that actually changed the row (`UPDATE ... WHERE status <> $next RETURNING`, or the
   `updateMany` `count > 0` for feedback). This is the real double-emit guard.
4. **[Unit 3, P1] Validate DM recipient org membership server-side.** RLS enforces tenant, not "userB is
   a member of this org." Before creating a thread, query `Member(organizationId = effectiveTenantId,
   userId = recipientUserId)` and reject if absent. Do not trust the client-supplied recipient id.
5. **[Unit 1, P1] Drop the stored `href` column.** Derive the deep link at render time from
   `sourceType` + `sourceId`. Storing URLs makes route changes a backfill and is a needless injection
   surface (Gemini).
6. **[Unit 7, P1] Tombstone on click-through.** A notification can point at a source that was deleted
   (polymorphic `sourceId`, no FK) OR reassigned away from the user (RLS now returns NOT_FOUND). The
   reader must catch both and render "this item no longer exists / you no longer have access," never 500.
7. **[Unit 3, P1] Mark all of a thread's notifications read on thread open** (since we dropped the
   Participant read-cursor). One `updateMany` where `sourceId = threadId AND recipientUserId = me`.
8. **[Unit 1, P2] Index must include `archivedAt`.** `countUnreadInbox` filters
   `readAt IS NULL AND archivedAt IS NULL`; use a partial index
   `@@index([tenantId, recipientUserId]) WHERE readAt IS NULL AND archivedAt IS NULL` (raw SQL partial
   index) or add `archivedAt` to the composite so it stays covering.
9. **[Unit 1, P2] DB CHECK constraints on `DirectMessageThread`:** `CHECK (userAId < userBId)` and
   `CHECK (userAId <> userBId)` — enforce the sorted-pair convention in the database, not just in code.
10. **[Unit 9, P2] Fix the invariant checker's CRLF handling** rather than relying on a "use LF" note —
    a guard that silently skips on CRLF is theater (both models). Normalize line endings in
    `verify-invariant-guards.mjs` before parsing frontmatter.
11. **[Unit 4] `actorUserId` confirmed = submitter** (set once at `tickets.ts:51`; it's the field
    `my-reports.ts:39` filters "my tickets" on). Recipient is correct. Codex's "last actor?" concern
    does not apply here.
12. **[Unit 7] Reuse, don't rebuild.** `src/lib/feedback/my-reports.ts` already returns "my tickets"
    (`actorUserId === me`). The Tickets bucket should call it. (Note its comment: no `actorUserId` index
    today — fine at current per-tenant row counts; revisit if it grows.)

### Resolved tensions (user decisions, 2026-07-15)

- **T1 — Per-user RLS: ADOPTED (build now).** Add DB-enforced per-user isolation on top of tenant-RLS,
  as a new **Unit 1b** (below). Set a second per-transaction GUC `app.user_id` in the Prisma extension
  (`src/lib/prisma.ts`) right beside `app.tenant_id`, and add per-user RLS policies on `inbox_notification`
  (`recipientUserId = current_setting('app.user_id', true)`) and on the DM tables
  (participant = current user via the thread pair). The app-layer `recipientUserId` filter + static guard
  stay as defense-in-depth; the DB policy is now the real boundary. `runAsTenant`/`runInTenantTx` must
  also set `app.user_id`. **This touches the core tenant extension — treat as the highest-blast-radius
  change in the plan and re-run `verify:tenant-isolation` + a new per-user exit-proof.**
  - GOTCHA: emission writes a row for a DIFFERENT user (recipient) than the acting user. A per-user
    RLS `WITH CHECK` keyed to `app.user_id` would then BLOCK the insert. So notification INSERTs must run
    in a context whose `app.user_id` is unset/bypassed for the write path (e.g. a dedicated
    `emitNotificationTx` that sets `app.user_id` to the recipient, or a policy that allows INSERT when
    tenant matches and only constrains SELECT/UPDATE/DELETE to the owner). Design the policy so
    **reads are owner-only but a same-tenant actor may create a notification for another user.** This is
    the crux of Unit 1b — get the policy shape right.
- **T2 — Denormalized `*Email` columns: KEEP as snapshots.** IDs are the source of truth; `*Email` are
  optional provenance snapshots matching house style (`assigneeEmail`/`actorEmail` elsewhere) and feed
  the future email seam. Resolve display from `User` at read when practical; document the GDPR/staleness
  caveat in the ADR (0005).
- **T3 — DM rate-limiting: LIGHTWEIGHT CAP now.** `sendDirectMessageCore` enforces a simple per-user
  send cap (count sent in the last minute/day, reject over the limit) — no new infra. ADR notes proper
  upstash/redis rate-limiting as a follow-up.

### Unit 1b: Per-user RLS (`app.user_id` GUC + owner-only read policies) — NEW

**Goal:** Make "a user reads only their own notifications / their own DM threads" a DB-enforced boundary,
not just an app-layer filter.
**Files:** `src/lib/prisma.ts` (set `app.user_id` alongside `app.tenant_id`), `src/lib/tenant/context.ts`
+ `src/lib/tenant/tx.ts` (carry the acting userId into the store / tx), `prisma/migrations/<ts>_inbox_user_rls/migration.sql` (new — per-user policies).
**Approach:** Extend the tenant context to hold `userId`; the extension sets both GUCs per tx. Add RLS
policies: SELECT/UPDATE/DELETE on `inbox_notification` require `recipientUserId = current_setting('app.user_id', true)`; INSERT allowed when `tenantId` matches (so a same-tenant actor can notify another
user — see the crux gotcha above). DM tables: read requires the current user be one of the thread pair.
Keep the tenant `tenant_isolation` policy too (policies AND together).
**Tests:** live exit-proof — user A cannot SELECT user B's notifications even within the same tenant;
actor CAN insert a notification for a recipient; reassigned-WO notification click by the new
non-recipient returns NOT_FOUND (RLS), not another user's row.
**Depends on:** Unit 1. Blocks Unit 2 (core reads/writes must set `app.user_id`).
**Execution note:** Core Prisma-extension change — run from the MAIN checkout; `verify:tenant-isolation`
must stay green (add a per-user dimension). Highest blast radius in the plan.
**Verification:** `npm run verify:tenant-isolation` + `npm run verify:inbox-isolation` (now DB-backed for
the per-user dimension) pass; manual two-user read-back in Demo Winery proves the boundary.

## Test Strategy

**Unit tests (pure logic — repo has no jsdom/RTL):** unread counting, category/status filter mapping,
self-suppression, notification payload builders, thread resolution, notification fan-out, "only my rows"
scoping logic. Under `test/inbox/`.

**DB / isolation:** `verify:tenant-isolation` (auto-covers new tables) + the new `verify:inbox-isolation`
(cross-tenant + cross-recipient exit-proof). Run from the main checkout.

**Manual verification (browser QA, Demo Winery, `QA-*` fixtures):**
1. Resolve a QA ticket → submitter sees a Tickets notification; badge increments; opening clears it; mark-unread restores it.
2. Assign + advance a QA work order → assignee sees WO notifications; no duplicates on rollup no-ops.
3. Send a QA↔QA direct message with an attachment → recipient badge + thread + download; sender gets no self-notification.
4. Each bucket auto-opens to the right default and filters correctly; account/user links resolve.
5. Confirm persistence with a `runAsTenant("org_demo_winery", …)` read-back script (browser proves UI, script proves DB).
Clean up all `QA-*` fixtures; keep `verify:naming` green before and after.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Cross-tenant / cross-recipient leak | MED | HIGH | RLS on every table + explicit `recipientUserId` predicate + `verify:inbox-isolation` guard (Unit 9) |
| Duplicate WO status notifications (rollup fires often) | HIGH | MED | "status actually changed" guard in `bumpWorkOrderRollupTx`; test for no-op rollups (Unit 5) |
| Editing governed cores (feedback, work-orders) introduces regression | MED | HIGH | Emission is strictly additive inside existing tx; PreToolUse brain hook + eng review; keep audit/automation paths untouched |
| Migration/RLS mistake (silent unscoped table) | LOW | HIGH | Two-migration pattern + trailing `DO $$` self-check + `verify:tenant-isolation` auto-coverage |
| Attachment code drift vs feedback | MED | LOW | Factor a shared `attachments/blob.ts` helper rather than copy-paste |
| Notification volume unbounded (no retention) | LOW | MED | `archivedAt` + index now; add a retention/cleanup cron as a follow-up (note in ADR) |
| Neon cold-start P2028 on migrate/verify | MED | LOW | Retry; run from main checkout with `.env` |

## Success Criteria

- [ ] Mailbox entry on the avatar with a red unread badge; count matches unread notifications; clears on open; restores on mark-unread.
- [ ] `/inbox` renders All / Work Orders / Tickets / Direct messages; WO & Tickets auto-open to *my* open items and filter to in-progress/completed & closed.
- [ ] Ticket reply/resolve, WO assign/status, and new DM each produce exactly one correct notification to the right user (no self-notifications, no duplicates).
- [ ] Same-tenant DMs send with text + attachments; thread view renders; recipient list excludes self and other tenants.
- [ ] Account/user-management links surface from the inbox hub (into existing `/settings` and `/users`).
- [ ] New tables are tenant-scoped with RLS; `verify:tenant-isolation` + new `verify:inbox-isolation` pass; INBOX-1 invariant enforced by `verify:invariants`.
- [ ] Email + realtime seams documented (ADR + `NotificationChannel`), not implemented.
- [ ] All `verify:*` (incl. `naming`) green before and after; QA fixtures cleaned up.
- [ ] All tests pass; no regressions in existing feedback/work-order tests.

## Governance / Review Gate

This plan introduces **new tenant-scoped tables + RLS** and edits **governed cores**
(`src/lib/work-orders/lifecycle.ts`, `src/lib/developer/feedback-item-actions.ts`). Per the repo's
brain conventions, run **`/plan-eng-review`** (architecture + tenancy/RLS + tests) before `/work`,
and expect the PreToolUse brain hook to inject tenancy/feedback invariants during execution. Optionally
run `/council` for an outside read on the notifications-vs-buckets split.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Clear user job; broken ticket loop is real |
| Scope Boundaries | HIGH | Email + realtime explicitly deferred; buckets vs notifications settled |
| Implementation Units | HIGH | Every hook point + pattern anchored to verified file:line |
| Test Strategy | MEDIUM | No jsdom/RTL means UI is manual-QA; logic + isolation guards carry the automated weight |
| Risk Assessment | HIGH | Double-emit and leak risks identified with concrete mitigations |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | HOLD SCOPE | Full 10 units kept; sequenced BEHIND SO₂ money-bug (062/066); +2 HOLD notes |
| Council (Codex+Gemini) | `/council` | Cross-LLM 2nd opinion | 1 | ISSUES FOUND → applied | 10 consensus gaps folded in; 3 tensions surfaced |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 3 decisions applied, 2 verified correctness amendments, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**Eng review outcome (2026-07-15):**
- Verified against code: piggybacking on the governed feedback/WO tx is atomic (`runInTenantTx` sets
  `skipWrap`; `prisma.ts:53-84`); the WO "status changed" guard maps to `bumpWorkOrderRollupTx:299`
  (`next !== wo.status`) so double-emit is structurally preventable. Confidence 9/10.
- **Decision 1** — DM model trimmed 4→3 tables (dropped `DirectMessageParticipant`; two user ids on the
  thread; unread already tracked by `InboxNotification`). Reintroduce Participant only for group DMs.
- **Decision 2** — factor a shared `src/lib/attachments/blob.ts` helper; keep a separate
  `DirectMessageAttachment` table (don't overload feedback FKs).
- **Decision 3** — `verify:inbox-isolation` scoped to the app-layer recipient dimension; the DB
  cross-tenant dimension is already auto-covered by `verify-tenant-isolation.ts:66-81`.
- **Blast-radius correction (Unit 5)** — `bumpWorkOrderRollupTx` takes no `actor` and selects only
  `status,startedAt`; the hook requires threading `actor` through all callers (`startTaskCore`,
  `approveTaskCore`, `rejectTaskCore`, `bulkApproveTasksCore`) and widening its `select`. Documented.
- **Correctness (Unit 4)** — widen `closeFeedbackItemCore`/`updateFeedbackItemCore` selects to fetch
  `actorUserId/actorEmail`; emit only when the optimistic `updateMany` applied (`count > 0`).
- Known limitation documented: multi-org unread is per active org.

**Council review (2026-07-15, Codex gpt-5.4 + Gemini 3.1 Pro):** 10 cross-model-consensus gaps folded
into the "Council Review Amendments" section above (blob read-auth, rollup-returns-change-object,
idempotent-emit-on-write, DM org-membership validation, drop stored href, click-through tombstones,
mark-thread-read, index+archivedAt, DM CHECK constraints, fix CRLF checker). Confirmed `actorUserId` =
submitter, and found `my-reports.ts` already implements "my tickets" (reuse it).

**RESOLVED (user decisions 2026-07-15, see "Resolved tensions" above):**
1. **Per-user RLS → ADOPTED now** as Unit 1b (`app.user_id` GUC + owner-only read policies on inbox/DM
   tables; INSERT allowed same-tenant so an actor can notify another user). Highest-blast-radius change.
2. **Denormalized `*Email` columns → KEEP** as provenance snapshots (house style + email seam); GDPR
   caveat documented in ADR 0005.
3. **DM rate-limiting → LIGHTWEIGHT CAP** in `sendDirectMessageCore` now; upstash/redis deferred to ADR.

**VERDICT:** ENG CLEARED + council applied + tensions resolved + CEO reviewed. Ready to implement (10 units) —
but **sequenced behind the SO₂ correctness work** (see CEO sequencing below).

### CEO review (2026-07-15) — HOLD SCOPE

- **Scope:** user chose to keep the full 10 units including direct messaging (my recommendation was a
  notifications-only v1 deferring DMs; user held scope — DMs stay in v1).
- **Sequencing decision (user):** **fix the SO₂ money bug first.** Plan 062 (SO₂-solution dosing,
  ~1.74× under-dose) Units 2-9 + Plan 066 (SO₂/KMBS ledger) land before this inbox work starts. In a
  system of record, numeric correctness outranks a net-new feature. This plan is queued, fully reviewed,
  ready for `/work` once the SO₂ line clears.
- **HOLD-rigor additions not caught by eng/council:**
  1. **Observability (Section 8 gap):** the plan has no telemetry on notification emission. Add a
     structured log at each `emitNotificationTx` (recipient, kind, sourceId) and a lightweight metric on
     the `countUnreadInbox` query so a slow badge query is visible before users feel it. Fold into Unit 2.
  2. **Deploy-window hazard for Unit 1b (Section 9):** adding the `app.user_id` GUC changes EVERY query's
     transaction. Land the Unit 1b migration + the `prisma.ts` extension change + the inbox reads that set
     `app.user_id` **together**, behind a feature flag for the inbox UI. Fail-closed is safe here (new
     tables, no existing reads), but the flag lets you dark-ship the schema and enable the surface
     deliberately. Note in Unit 1b/6.
- **Unresolved:** none. No critical gaps. Design review (Section 11) not run — worth a `/plan-design-review`
  before/during Unit 7 (the Gmail-like three-pane UI is the one place visual quality matters).
