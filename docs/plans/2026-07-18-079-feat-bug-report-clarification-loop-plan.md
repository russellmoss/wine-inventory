---
title: Bug-report clarification loop + auto-capture console
type: feat
status: draft
date: 2026-07-18
branch: claude/bug-report-clarification-loop
depth: deep
units: 13
---

## Build Status (2026-07-18) — 13/13 units SHIPPED to main + browser-QA'd end-to-end

Landed across four PRs: the backend spine (#276), the deferred UI surfaces (#281 = U11-UI + U12), the
inventory-error sibling (#277), and finally the in-agent tool (**#282 = U8, `6ac7b0b`**). Each unit
verified against the live Demo DB (script proves the DB) + tsc + eslint + vitest green; 3 Neon migrations
applied. The complete loop was browser-QA'd in the in-app Claude browser: report → console auto-capture →
sufficiency gate asks 3 questions → DM from "Cellarhand Support" with `[Ref: BUG-XXXX]` token → My Reports
"Needs your input" chip → assistant nudge surfacing the open clarification → `/developer` panel (waiting →
answered) → reply strips the ref token → attempt-2 re-dispatch. The multi-round loop guard
(`MAX_CLARIFICATION_ROUNDS=2`) is now live (U8 provides round 2 from the in-agent tool).

Branch `claude/bug-report-clarification-loop` (off fresh `origin/main`). Each unit verified against the
live Demo DB (script proves the DB) + tsc + vitest green; 3 Neon migrations applied.

**Built + proven:** U1 console ring buffer · U2 drain into both report paths + server clamp (round-trip
proven) · U3 `<console_errors>` in fix agents (shared formatter, C-3 DRY) · U4 Cellarhand Support sender
(no credential Account; Demo+Bhutan backfilled) · U5 `FeedbackClarification` + `AWAITING_CLARIFICATION` +
RLS + partial-unique/CHECK (migrations applied; constraints proven) · U6 `requestClarificationCore`
(persist-then-send C-3.1, insert-first C-3.2) · U7 cheap-LLM sufficiency gate (FIX-only, in-app, C-2/C-6) ·
U9 reply-hook → answer + auto-re-dispatch / escalate (token routing, intent + round guards, C-3.6/8) ·
U10 `<clarification_history>` on re-runs · U13 watchdog + TTL sweep cron · U11 `verify:feedback-clarification`
end-to-end gate (11/11). All 9 council concurrency fixes folded in.

**Deferred to a browser-QA / ship pass** (per user decision — need the dev server + a real CI run):
U8 in-agent `request_clarification` tool + workflow YAML branch; U11 `/developer` clarification panel +
My Reports "Needs your input" status chip (D-1); U12 assistant surfacing of open clarifications.

**Reviewed** (eng+council pre-build, then /review specialists+adversarial on the code): 4 CRITICALs +
hardening fixed and re-proven (see commit "pre-landing review fixes"). Two known items carried forward:
- The multi-round loop guard (`MAX_CLARIFICATION_ROUNDS=2` + `countClarificationRounds`) is **inert until
  U8 lands** — as built the system does exactly ONE clarification round (pre-flight gate on attempt 1;
  the reply re-dispatches straight to CI). Round 2 would come from the deferred in-agent tool. Safe (the
  cap can't be exceeded), but the "loop" is single-round for now. Wire the cap when U8 is built.
- The Cellarhand Support user is non-authenticatable via the missing credential Account + `disableSignUp`;
  its only theoretical activation is self-service password reset, blocked today only because
  `@cellarhand.system` is an unroutable TLD. Low priority follow-up: hard-refuse the reserved address in
  the password-reset path (auth.ts) if that domain ever becomes real.

## Overview

Two connected upgrades to the reported-bug pipeline. (1) When a user reports a bug, automatically
capture the browser console (recent logs + uncaught errors) at that moment and attach it to the
ticket, so the fix agent sees the real error instead of a vague description. (2) When the automation
(a pre-check gate OR the fix agent mid-investigation) decides the report is too thin to act on, it
DMs the reporter through the in-app inbox as a seeded **Cellarhand Support** account, asks the
specific questions it needs, and — when the reporter replies — feeds that answer back onto the ticket
and re-dispatches the GitHub Actions plan/fix workflow with a bumped attempt so the next pass is
specific.

## Problem Frame

Users file bug tickets (via `/help/feedback`, the assistant "Report a bug" modal, or a 👎 on an
assistant reply) that are too vague: no repro steps, no screenshot, no error. The report goes to
GitHub Actions, `scripts/bug-feedback-agent.ts` runs Claude against `<bug_title>` / `<bug_description>`
/ `<page_url>` / `<debug_context>`, and with nothing concrete to go on it either guesses at a fix or
stalls. There is no way for the automation to reach back to the human who has the missing context.

Doing nothing means the fix loop keeps producing low-confidence PRs on thin tickets, burning a full
agent run per attempt and pushing triage back onto a human anyway. The reporter is right there at the
screen where the bug happened — the console still holds the error, and they can answer a targeted
question in one line. We just have no channel to ask.

**Product note (pressure test):** the highest-value half is probably the console auto-capture — it's
near-free (an existing JSON channel already reaches the fix agent) and removes the most common cause
of "too vague" (a missing error). The clarification loop is the completeness play: it closes the gap
when even the console isn't enough. Both are worth building; console-capture lands value on day one
even before the loop exists.

## Requirements

- MUST: On bug submit from the client (form + assistant bug modal + 👎 assistant feedback), capture a
  bounded ring buffer of recent `console.error/warn/log` + `window` `error`/`unhandledrejection`
  events and attach it to the report's existing `debugContext` JSON (no schema migration for this half).
- MUST: The fix agent's prompt surfaces the captured console errors explicitly.
- MUST: A cheap, deterministic **pre-flight sufficiency gate** runs before a fix/plan run is
  dispatched; if the report lacks the basics (repro/error/console/screenshot/page) AND clarification
  rounds remain, it routes to a clarification request instead of dispatching.
- MUST: The fix agent can, mid-investigation, call a `request_clarification` tool instead of applying
  a low-confidence fix; the workflow honors that by asking the reporter rather than opening a PR.
- MUST: Clarification questions are delivered as an in-app DM sent **as a seeded per-tenant "Cellarhand
  Support" member** (the DM core requires a real tenant member as sender — there is no bot identity).
- MUST: When the reporter replies in that DM thread, the answer is appended to the ticket context, the
  clarification is marked answered, and the automation run is re-dispatched with `attempt + 1`.
- MUST: A loop guard caps clarification rounds (default 2). After the cap, escalate to a human
  (leave the item for developer triage) rather than re-asking.
- MUST: Cover BOTH source types — `FeedbackTicket` (form + assistant modal) and `AssistantFeedback`
  (👎), since both share the `AutomationRun` spine.
- MUST: Console logs / clarification context stay developer-only (never surfaced back to the customer
  in `my-reports`), and console payloads are size-clamped + lightly redacted.
- SHOULD: The `/developer` feedback console shows clarification state (awaiting / questions asked /
  answer received) and the new `AWAITING_CLARIFICATION` status.
- SHOULD: At most one OPEN clarification per source at a time (keeps reply-correlation unambiguous on
  the shared support↔reporter thread).
- NICE: Mirror Sentry console breadcrumbs into the same buffer via `beforeBreadcrumb` for higher fidelity.

## Scope Boundaries

**In scope:**
- Client console ring buffer + drain into `debugContext` for all three client submit paths.
- New `Cellarhand Support` per-tenant seeded member + resolver + backfill for Demo & Bhutan tenants.
- New `FeedbackClarification` model + `AWAITING_CLARIFICATION` automation status; RLS per Phase-12 checklist.
- Pre-flight sufficiency gate (deterministic heuristic) in the automation dispatch path.
- `request_clarification` tool in the bug + assistant fix agents; workflow branch that asks instead of PRs.
- "Ask clarification" core (DM out + clarification row + status transition), invoked by both triggers.
- Reply-hook that detects the reporter's answer and re-dispatches with `attempt + 1`, with a round cap.
- Fix/plan agents read prior clarification Q&A into their context on re-runs.
- `/developer` UI surfacing + a `verify:feedback-clarification` end-to-end script + unit tests.

**Out of scope:**
- Rewriting `scripts/feedback-plan-agent.ts` to be a real LLM investigation (it currently emits static
  boilerplate). The PLAN path will carry clarification context, but making the plan agent *use* it well
  is a separate follow-up (noted as a risk).
- Email/toast/realtime DM delivery. The inbox is in-app + badge-on-navigation only today; we inherit that.
- Adding `debugContext`/console capture to the server-composed assistant `file_feedback` tool path
  (that tool is composed model-side with no client context; capture is inherently client-only).
- Any change to auth/org/global models. `Cellarhand Support` is a normal tenant `Member`, not a global user.

## Research Summary

### Codebase Patterns

**Intake → core → automation spine.** Two client intake surfaces converge on one core:
- Plain form `src/app/(app)/help/feedback/FeedbackForm.tsx` (`submit()` ~L41–86) POSTs to
  `src/app/api/feedback/tickets/route.ts` (`POST` L7) → `createFeedbackTicket()`
  `src/lib/feedback/tickets.ts:28`. The assistant "Report a bug" modal
  `src/app/(app)/assistant/FeedbackTicketModal.tsx` renders the **same** `FeedbackForm` (compact), so
  covering the form covers the modal.
- The client payload already includes `debugContext` (`FeedbackForm.tsx` ~L56:
  `{ schemaVersion: 1, source }`), passed through the route (~L45, object-guarded) into
  `FeedbackTicket.debugContext Json?` (`prisma/schema.prisma:933`). **No migration needed** to add
  `consoleLog`/`clientErrors` — they nest under `debugContext`.
- The 👎 path is separate: `src/app/api/assistant/feedback/route.ts` → `AssistantFeedback`
  (`schema.prisma:892`, also has `debugContext Json?`), built by
  `src/lib/assistant/feedback-snapshot.ts` (typed `FeedbackDebugContext`).

**Automation state machine** (`src/lib/feedback/automation.ts`):
- `recordAutomationGate(tx, { ...source, tenantId, mode, attempt? })` L240 upserts an `AutomationRun`
  keyed by `automationIdempotencyKey({..., attempt})` (L257) — **attempt is already a first-class part
  of the idempotency key**, so bumping attempt mints a fresh run: this is our re-dispatch mechanism.
- Status sync helper `updateSourceAutomationStatus(tx, source, status)` L171 keeps
  `feedbackTicket.automationStatus` / `assistantFeedback.automationStatus` in lockstep with
  `AutomationRun.status` — every new state must go through it (matches learning
  [[assistant-chat-history-windowing-fix]] about the two-field sync).
- `dispatchApprovedRun(runId, tenantId)` (~L762) claims → RUNNING → POSTs `repository_dispatch`
  (event via `repositoryDispatchEventForRun` L161) with `client_payload { automationRunId, tenantId,
  sourceType, sourceId, ticketId?, feedbackId? }`.
- Write-back from CI: `scripts/feedback-automation-mark.ts` (→ `completeAutomationRun` L632, flips item
  `status` to TRIAGED) and `scripts/feedback-automation-fail.ts`. Statuses:
  `FeedbackAutomationStatus = NOT_REQUESTED | AWAITING_APPROVAL | QUEUED | RUNNING | PLANNED | PR_OPENED | FAILED | SKIPPED` (`schema.prisma:226`).

**GitHub Actions** (`.github/workflows/`): `feedback-bug-fix.yml` (event `feedback_bug_fix`) runs
`scripts/bug-feedback-agent.ts` (tools `list_dir`/`read_file`/`apply_fix`, MAX_TURNS 30, fenced to
`src/app|components|lib`, `tsc --noEmit`, never runs tests in-job). `feedback-plan.yml`
(`feedback_plan`) runs `scripts/feedback-plan-agent.ts` (**static boilerplate today**).
`assistant-feedback.yml` (`assistant_feedback`) runs `scripts/assistant-feedback-agent.ts`.
Screenshots reach the agent via `scripts/feedback-attachment-images.ts` (base64 image blocks,
prefers `annotatedBlobUrl`).

**Inbox / DM** (`src/lib/inbox/`, Plan 068):
- `sendDirectMessageCore(actor: { actorUserId, actorEmail }, { recipientUserId, body }) → { threadId, messageId }`
  `src/lib/inbox/direct-messages.ts:74`. Atomic; **requires a real, non-null sender who is a `Member`
  of the tenant**, blocks self-send, validates recipient membership. **No bot/system sender exists.**
- `DirectMessage` (`schema.prisma:4139`) is plain `threadId + sender + body` — **no metadata/reference
  column, no `inReplyToMessageId`.** Threads are a unique sorted user-pair
  (`DirectMessageThread` `@@unique([tenantId, userAId, userBId])` L4137), so all Support↔reporter
  clarifications share ONE thread. Reply correlation is therefore **thread-level + time-watermark**,
  not message-level.
- Send action choke point: `sendDirectMessageAction({ recipientUserId, body })`
  `src/lib/inbox/dm-actions.ts:9` — the single place both compose and reply flow through
  (`ComposeMessage.tsx`). Ideal hook point for reply detection (keeps feedback logic out of inbox core).
- Script recipe: `runAsTenant(tenantId, () => sendDirectMessageCore(actor, {...}), { userId: senderUserId })`,
  run under `tsx --conditions=react-server` (core is `server-only`).

**Console capture** (`src/instrumentation-client.ts`): Sentry client init present (`enableLogs`,
replay), but **no app-level `window.onerror`/`unhandledrejection` handler and no console interception
anywhere** — greenfield. Sentry breadcrumbs are not reliably readable client-side; we own our own
ring buffer. `instrumentation-client.ts` runs first, app-wide, before React mounts → best install point.
`src/lib/feedback/my-reports.ts:16` already lists `debugContext` as customer-hidden — the redaction
contract lives there.

### Prior Learnings

- [[assistant-chat-history-windowing-fix]] — neutralizing/So advancing an automation run needs BOTH
  `AutomationRun.status` AND the denormalized `feedbackTicket.automationStatus` in sync. Our new state
  transitions must go through `updateSourceAutomationStatus`.
- [[plan068-inbox-backend-complete]] — inbox emit MUST use `createMany` (a `create ... RETURNING` trips
  per-user SELECT RLS); RLS cleanup needs an OWNER connection; never `git add -A`.
- [[prismabase-rls-zero-rows-gotcha]] / [[raw-sql-tenant-scoping]] — cross-tenant reads/backfills need
  `runAsSystem`; `$queryRaw` bypasses the tenant extension.
- [[prisma-neon-migrations-windows]] — enum changes go in an isolated `ALTER TYPE` migration committed
  before anything defaults to the new value; use `migrate diff` → `deploy`; stop the dev server before
  `db:generate`.
- [[server-action-actionerror-redacted-in-prod]] — return `{ ok:false, error }`, don't throw
  `ActionError`, from the reply-hook server path.
- [[blob-images-into-feedback-llm-shipped]] — the screenshot→vision pattern is the precedent for
  feeding diagnostic artifacts to the fix agent; console text is the small-structured analog (inline,
  not blob).

### External Research

None required — no new external APIs. All surfaces (Prisma/Neon, GitHub `repository_dispatch`,
Anthropic tool loop, inbox) are already in the codebase.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Console storage | Nest `consoleLog`/`clientErrors` under existing `debugContext` JSON (bump `schemaVersion` to 2) | First-class columns on `FeedbackTicket`/`AssistantFeedback` | Zero migration; the field already threads client→agent; stays developer-only via existing `my-reports` contract |
| DM sender identity | Seeded per-tenant **Cellarhand Support** `Member`; resolver + backfill | Send as developer/owner; send as tenant admin | DM core needs a real tenant member; a dedicated support member is unambiguous, non-impersonating, and works for every current/future winery |
| When to ask | **Both**: deterministic pre-flight sufficiency gate + in-agent `request_clarification` tool | Gate-only (generic questions); agent-only (a full run per thin ticket) | Gate cheaply short-circuits obviously-thin tickets; the tool catches gaps only visible after reading code |
| Re-dispatch mechanism | Bump `attempt` and reuse `recordAutomationGate` → approve → `dispatchApprovedRun` | New bespoke re-run path | `attempt` is already in the idempotency key; reuse keeps one spine and one write-back contract |
| Reply correlation | Thread-level match, refined to per-REPORTER below (see eng-review row) | Per-message reply id (doesn't exist); dedicated thread per ticket (thread is unique per user-pair) | Matches what the inbox schema actually supports |
| Reply hook location | `src/lib/inbox/dm-actions.ts` post-send callback into a feedback module | Inside `sendDirectMessageCore` | Keeps inbox core decoupled from feedback; the action is the single choke point for compose + reply |
| Loop guard | Max 2 rounds, then escalate to human triage | Unbounded | Prevents ping-pong; keeps a human backstop |
| Source coverage | Both `FeedbackTicket` and `AssistantFeedback` (polymorphic `sourceType`/`sourceId`, mirrors `AutomationRun`) | Ticket-only | User chose full scope; the spine is already polymorphic |
| Reply-correlation constraint | **SUPERSEDED by council** → per-TICKET + tracking token (see Council Revisions) | ~~≤1 OPEN per reporter~~ (deadlocked: couldn't ask about a 2nd bug) | Both models flagged the per-reporter limit as a deadlock; the token routes replies without it |
| Re-dispatch approval | **Auto-approve** the answer-triggered re-run (user-confirmed after council) | Human re-gate; split by kind | The fix agent opens a DRAFT PR only (human merge-review is the gate); loop is fast. Injection risk accepted within the fenced, no-merge sandbox |
| Reporter notification | **Assistant surfaces open clarifications + existing inbox badge** | Badge only; wire real email | Inbox has no email/toast/realtime; users reporting bugs are already in the assistant. No new email infra (EmailChannel is a no-op stub) |
| Sender identity (council) | Keep **"Cellarhand Support"** name, but the DM **body must state it's automated** + set reply expectations | Rename to "Automated Triage" | User kept the warmer name; the honesty concern is addressed in copy, not identity |
| Sufficiency gate (council) | **Cheap-LLM sufficiency check** (replaces deterministic heuristic) | Deterministic keywords; agent-only | Keyword proxies ("imperative verb", "screenshot present") mis-judge valid reports; a small fast LLM asks smart questions without a full agent run |

## Implementation Units

### Unit 1: Console ring buffer + global error capture

**Goal:** A bounded, app-wide client buffer of recent console output and uncaught errors, drainable at bug-submit time.
**Files:** `src/lib/observability/console-buffer.ts` (new), `src/instrumentation-client.ts` (install)
**Approach:** New client module holds a fixed-size ring (e.g. last 50 entries) of `{ level, ts, message }`,
patching `console.error/warn/log` (preserving originals) and adding `window.addEventListener("error", ...)`
+ `("unhandledrejection", ...)`. Each entry is stringified with a per-entry char cap and total-bytes cap;
apply a light redaction pass (strip obvious token/email-looking substrings) before storing. Export
`drainConsoleBuffer(): { consoleLog: Entry[]; clientErrors: Entry[] }` (non-destructive read + trimmed
copy). Install once from `instrumentation-client.ts` (runs before React mounts, widest coverage). Guard
against double-install (module singleton). Optionally mirror Sentry console breadcrumbs via
`beforeBreadcrumb` (NICE) — keep behind a simple flag.
**Tests:** `test/console-buffer.test.ts` — pure ring semantics: overflow drops oldest; per-entry + total
caps enforced; redaction masks a fake token; `drainConsoleBuffer` returns errors separated from logs;
double-install is a no-op.
**Depends on:** none
**Patterns to follow:** module-singleton client util imported by `instrumentation-client.ts`; caps mirror the
image-selection guards in `scripts/feedback-attachment-images.ts` (bounded, pure).
**Verification:** `npm run test -- console-buffer`; in dev, throw a console.error then open the bug form and confirm the buffer is non-empty.

### Unit 2: Drain console into all client submit payloads

**Goal:** Attach the captured console to every client-originated report, developer-only.
**Files:** `src/app/(app)/help/feedback/FeedbackForm.tsx`, `src/app/api/feedback/tickets/route.ts`,
`src/lib/feedback/tickets.ts`, `src/app/api/assistant/feedback/route.ts`,
`src/lib/assistant/feedback-snapshot.ts`, `src/lib/feedback/debug-context.ts` (new shared clamp/type)
**Approach:** In `FeedbackForm.submit()`, call `drainConsoleBuffer()` and merge into `debugContext`
(`schemaVersion: 2`, add `consoleLog`, `clientErrors`). The assistant bug modal inherits this (same form).
For the 👎 path, drain client-side where the 👎 payload is built and thread it into
`feedback-snapshot.ts`'s `FeedbackDebugContext`. Add a shared `clampDebugContext()` in a new
`debug-context.ts` and call it server-side in both routes (`tickets/route.ts` ~L45 and the assistant
feedback route) and defensively in `createFeedbackTicket` (`tickets.ts` ~L23/50) to bound stored size.
Confirm `my-reports.ts` still excludes `debugContext` (it does at L16) — add a test asserting it.
**Tests:** extend `test/developer-feedback-db.test.ts` (or new `test/feedback-debug-context.test.ts`):
oversized console is clamped server-side; `consoleLog` round-trips into `FeedbackTicket.debugContext`;
`my-reports` never returns `debugContext`.
**Depends on:** Unit 1
**Patterns to follow:** existing `debugContext` pass-through (object-guarded) in `tickets/route.ts`.
**Verification:** submit a bug with a console error present; read the row back via a `runAsTenant("org_demo_winery", …)` tsx script and confirm `debugContext.consoleLog` is populated and clamped.

### Unit 3: Surface console errors in the fix agent prompt

**Goal:** The fix/assistant agents explicitly see captured console errors.
**Files:** `scripts/bug-feedback-agent.ts`, `scripts/assistant-feedback-agent.ts`
**Approach:** When building the first user message, read `debugContext.consoleLog`/`clientErrors` and, if
present, add a `<console_errors>` block (framed as untrusted data, like `<debug_context>` already is).
Keep it bounded (reuse the clamp). No behavior change when absent.
**Tests:** if these scripts have unit-testable message builders, assert the block renders when console
data is present and is omitted otherwise; else cover via the Unit 11 verify script.
**Depends on:** Unit 2
**Patterns to follow:** the existing `<debug_context>`/untrusted-data framing in `bug-feedback-agent.ts` (~L206–224, system prompt ~L151).
**Verification:** run the agent locally against a seeded ticket that has console data; confirm the block appears in the composed prompt (log/inspect, don't call the API).

### Unit 4: Cellarhand Support sender identity + resolver + backfill

**Goal:** A real, per-tenant support member the automation can send DMs as.
**Files:** `src/lib/feedback/support-sender.ts` (new), `scripts/ensure-support-member.ts` (new),
`prisma/seed*` or `scripts/seed-demo-tenant` touchpoint, docs note
**Approach:** Add `resolveSupportSenderForTenant(tenantId): { userId, email }` that finds-or-ensures a
dedicated `Cellarhand Support` `User` + `Member` in the tenant (idempotent; stable email like
`support@cellarhand.system` or per-tenant variant). Because auth/org tables are global and RLS-denylisted,
the `User` is global and the `Member` row ties it to the org — follow the existing member-creation path
(mirror how `seed:demo-tenant` adds members). Provide `scripts/ensure-support-member.ts` (wrapped in
`runAsSystem`/owner as needed) to backfill Demo + Bhutan and to run at tenant creation. The support user
must NOT be a login target (no credentials / disabled sign-in) — it exists only as a message sender.
**Tests:** `test/support-sender.test.ts` or a verify assertion: calling the resolver twice yields the same
member (idempotent); the member is a `Member` of the tenant so `sendDirectMessageCore` accepts it as actor.
**Depends on:** none (can run parallel to 1–3)
**Patterns to follow:** member creation in the demo-tenant seed; `runAsSystem` for cross-tenant ensure
([[prismabase-rls-zero-rows-gotcha]]).
**Verification:** run `ensure-support-member.ts` for Demo; then a tsx script sends a test DM as the support member to a demo user and reads it back.

### Unit 5: FeedbackClarification model + AWAITING_CLARIFICATION status (schema + RLS)

**Goal:** Persist a clarification round and a new automation status, tenant-isolated.
**Files:** `prisma/schema.prisma`, `prisma/migrations/*` (enum ALTER isolated first, then table + RLS),
`src/lib/tenant/models.ts` (ensure NOT on the global denylist), `scripts/verify-tenant-isolation.ts` /
`test/tenant-isolation.test.ts` (add a case)
**Approach:** Add `AWAITING_CLARIFICATION` to `FeedbackAutomationStatus` in an **isolated `ALTER TYPE`
migration** committed before any column defaults to it (Windows enum rule). Add model
`FeedbackClarification` (polymorphic like `AutomationRun`): `tenantId`, `id`, `sourceType
(FeedbackAutomationSource)`, `sourceId`, `ticketId?`, `assistantFeedbackId?`, `automationRunId?`,
`round Int`, `dmThreadId`, `dmMessageId`, `reporterUserId` (the person we ask — denormalized so the
per-reporter constraint + reply lookup are one indexed query), `questions String` (or `Json`),
`askedByUserId`, `askedAt`, `status (new enum FeedbackClarificationStatus = OPEN|ANSWERED|CANCELLED)`,
`answerBody?`, `answeredAt?`, `answeredByUserId?`, timestamps. Follow the Phase-12 checklist verbatim:
`tenantId @default("")` + `@@index`, composite `@@unique([tenantId, id])`, FK → `organization(id)` ON
DELETE RESTRICT, composite FKs to the source rows, `ENABLE`+`FORCE ROW LEVEL SECURITY` +
`tenant_isolation` policy (USING + WITH CHECK on `current_setting('app.tenant_id', true)`), app_rls
grants. **Reply-correlation constraint (eng-review decision):** a **partial unique on
`(tenantId, reporterUserId)` WHERE `status='OPEN'`** — ≤1 OPEN clarification per REPORTER (stronger than
per-source; removes the which-ticket ambiguity on the shared Support↔reporter thread). Add index
`(tenantId, dmThreadId, status)` for the reply-hook lookup.
**Tests:** add to `test/tenant-isolation.test.ts`; a schema test that a second OPEN row for the same
REPORTER (even a different ticket) is rejected.
**Depends on:** none (schema can land early; Unit 4 independent)
**Patterns to follow:** `AutomationRun` polymorphic `sourceType/sourceId` + the Phase-12 checklist in AGENTS.md; enum-migration discipline from [[prisma-neon-migrations-windows]].
**Verification:** `npm run db:migrate` locally; `npm run verify` tenant-isolation case green; owner-run RLS check that a cross-tenant select returns 0 rows.

### Unit 6: "Ask clarification" core (DM out + row + status transition)

**Goal:** One core that asks the reporter a set of questions and parks the run.
**Files:** `src/lib/feedback/clarification.ts` (new)
**Approach:** `requestClarificationCore({ tenantId, source, automationRunId, round, questions })`:
resolve the reporter's `userId` (ticket `actorUserId` / assistantFeedback actor), resolve the support
sender (Unit 4), format a friendly DM body (the questions + a line telling them to just reply here),
send via `sendDirectMessageCore` under `runAsTenant(tenantId, …, { userId: supportUserId })`, then in a
tenant tx create the `FeedbackClarification` row (storing `dmThreadId`/`dmMessageId` returned by the
core) and transition run + source to `AWAITING_CLARIFICATION` via the existing
`updateSourceAutomationStatus` path. Enforce the ≤1-OPEN invariant (no-op/short-circuit if one is
already OPEN). Guard: if reporter `actorUserId` is null (e.g. anonymized), skip the DM and mark the run
for human triage instead.
**Tests:** `test/feedback-clarification.test.ts` — happy path creates a DM + OPEN row + sets
AWAITING_CLARIFICATION on both run and source; second call while OPEN is a no-op; null-reporter path
escalates instead of DMing.
**Depends on:** Units 4, 5
**Patterns to follow:** `sendDirectMessageCore` recipe; `updateRunAndSourceAutomationStatus`/`updateSourceAutomationStatus` in `automation.ts`.
**Verification:** covered by Unit 11 end-to-end; plus the unit test above.

### Unit 7: Pre-flight sufficiency gate

**Goal:** Cheaply block obviously-thin tickets and ask before spending a fix run.
**Files:** `src/lib/feedback/sufficiency.ts` (new, pure), wire into the dispatch path in
`src/lib/feedback/automation.ts` (`dispatchApprovedRun` or an approve→dispatch pre-step)
**Approach:** Pure `assessSufficiency(source): { sufficient: boolean; missing: string[]; questions: string[] }`
using deterministic heuristics: has repro-ish signal (body length / imperative verbs), has an error
(console errors present in `debugContext`, or an error-shaped phrase), has a screenshot attachment, has
`pageUrl`. If insufficient AND `roundsUsed < MAX_ROUNDS`, call `requestClarificationCore` (Unit 6)
instead of POSTing `repository_dispatch`; the run parks at `AWAITING_CLARIFICATION`. If sufficient (or
rounds exhausted), dispatch as today. **Council C-2: use a cheap-LLM check (not deterministic keywords)**,
with a deterministic fallback so an LLM outage never blocks dispatch. **C-6 scope: this gate fires ONLY
for `kind = AGENTIC_FIX`** — never on PLAN (feature-gap) runs. Runs **in-app** (in `automation.ts`), never
in a CI script.
**Tests:** `test/feedback-sufficiency.test.ts` — thin ticket (no error, short body, no screenshot) →
insufficient with sensible questions; ticket with console errors + repro steps → sufficient; rounds
exhausted → sufficient (forces dispatch/escalation, never loops).
**Depends on:** Unit 6
**Patterns to follow:** pure-module + wired-at-choke-point (like `src/lib/audit.ts` classifier in [[dashboard-recent-activity-ops-filter]]).
**Verification:** unit tests; plus Unit 11 drives a thin ticket through it.

### Unit 8: In-agent request_clarification tool + workflow branch

**Goal:** Let the fix agent ask instead of applying a low-confidence fix; the workflow honors it.
**Files:** `scripts/bug-feedback-agent.ts`, `scripts/assistant-feedback-agent.ts`,
`scripts/feedback-clarification-request.ts` (new CI write-back entry),
`.github/workflows/feedback-bug-fix.yml`, `.github/workflows/assistant-feedback.yml`
**Approach:** Add a `request_clarification` tool (input: `{ questions: string[], reason: string }`)
alongside `apply_fix`. When the model calls it, the agent stops, writes an output artifact
(`clarification_requested=true` + questions to a body file) instead of `changed=true`. The workflow adds
a branch: if the agent requested clarification, run `scripts/feedback-clarification-request.ts
<automationRunId>` (resolves tenant under `runAsSystem`, calls `requestClarificationCore` with the
agent's questions, `round = attempt`) and skip the PR step. Cap: the agent's system prompt instructs it
to prefer a fix and only request clarification when genuinely blocked, and never more than
`MAX_ROUNDS`.
**Tests:** covered by Unit 11 (workflow-shaped) + a unit test of the agent's output-branch selection if extractable.
**Depends on:** Units 6, 7 (shares `requestClarificationCore`)
**Patterns to follow:** existing tool definitions + output wiring (`changed/branch/title`) in `bug-feedback-agent.ts`; write-back script pattern of `feedback-automation-mark.ts` (`runAsSystem` + resolve tenant).
**Verification:** dry-run the agent with a stub that forces a `request_clarification` call; confirm the workflow branch calls the request script and does not open a PR.

### Unit 9: Reply-hook → append answer → re-dispatch (attempt+1) with loop guard

**Goal:** The reporter's reply closes the loop and re-runs the workflow, specifically.
**Files:** `src/lib/inbox/dm-actions.ts` (post-send callback), `src/lib/feedback/clarification.ts`
(`advanceClarificationFromReply`), `src/lib/feedback/automation.ts` (re-dispatch helper)
**Approach:** After a successful `sendDirectMessageAction`, call
`advanceClarificationFromReply({ threadId, senderUserId })` (best-effort; failures logged, never break
the send — return-shape errors per [[server-action-actionerror-redacted-in-prod]]). Because of the
per-reporter OPEN constraint (Unit 5) there is **at most one** OPEN `FeedbackClarification` for a given
`reporterUserId`, so the lookup is unambiguous: find the OPEN clarification where
`reporterUserId === senderUserId` AND `dmThreadId === threadId` (i.e. the reporter, not Support,
replied in the right thread). If found: read the reply body, mark the clarification `ANSWERED`
(+ `answerBody`, `answeredAt`), append the Q&A onto the source's `debugContext` (a `clarifications[]`
array) so future agent runs see it, then **auto-re-dispatch (eng-review decision — no human re-gate):**
call `recordAutomationGate` with `attempt = previousAttempt + 1`, system-approve, and
`dispatchApprovedRun`. Loop guard: if `previousAttempt >= MAX_ROUNDS`, do NOT re-ask/re-dispatch — set
the item to a human-triage state and leave a developer note. Only the reporter's message advances it
(Support's own outbound is ignored). If a reply arrives with no OPEN clarification for that reporter,
it's an ordinary DM — no-op.
**Tests:** `test/feedback-clarification-reply.test.ts` — reporter reply on the clarification thread marks
ANSWERED + creates an attempt-2 run in QUEUED; a Support (self) message does nothing; a reply from a
reporter with NO open clarification is an ordinary DM (no-op); a reporter with an unrelated OPEN
clarification (per-reporter constraint guarantees ≤1) is unambiguous; at MAX_ROUNDS the reply escalates
instead of re-dispatching.
**Depends on:** Units 5, 6, and the automation re-dispatch path
**Patterns to follow:** `dm-actions.ts` single choke point; `recordAutomationGate(attempt)` +
`dispatchApprovedRun` in `automation.ts`; two-field status sync ([[assistant-chat-history-windowing-fix]]).
**Verification:** Unit 11 drives the full round-trip; unit tests cover the guards.

### Unit 10: Agents read prior clarification Q&A on re-runs

**Goal:** The re-dispatched run is actually more specific because it sees the answer.
**Files:** `scripts/bug-feedback-agent.ts`, `scripts/assistant-feedback-agent.ts`,
`scripts/feedback-plan-agent.ts` (carry-only)
**Approach:** When composing the first message, read `debugContext.clarifications[]` (and/or the
`FeedbackClarification` rows for the source) and render a `<clarification_history>` block of prior
Q&A (untrusted-data framed). For the plan agent, at minimum include the block in the issue body it
emits (it's static today; making it *reason* over the answer is out of scope, noted as a risk).
**Tests:** covered by Unit 11; assert the block appears when a prior answered clarification exists.
**Depends on:** Unit 9
**Patterns to follow:** the `<debug_context>`/`<console_errors>` blocks from Units 3.
**Verification:** run the agent against a source with one answered clarification; confirm the history block renders.

### Unit 11: Developer UI surfacing + verify script + wiring

**Goal:** Make the loop observable and prove it end-to-end.
**Files:** `/developer` feedback view components + status rendering (locate the existing status column
that renders `FeedbackAutomationStatus`), `scripts/verify-feedback-clarification.ts` (new),
`package.json` (add `verify:feedback-clarification`), docs/security note
**Approach:** Add `AWAITING_CLARIFICATION` to the status rendering + a small panel showing the latest
clarification (questions asked, answer received, round). Keep the customer `my-reports` view unchanged
(no clarification internals leak). Write a deterministic verify script (mirrors `scripts/verify-feedback.ts`)
that, under `runAsTenant("org_demo_winery", …)` with `QA-`-prefixed fixtures: creates a thin ticket →
runs the sufficiency gate → asserts a DM was sent as Cellarhand Support + an OPEN clarification +
AWAITING_CLARIFICATION on run & source → simulates the reporter reply via `sendDirectMessageAction` →
asserts ANSWERED + an attempt-2 QUEUED run + the Q&A landed on `debugContext` → asserts the round cap
escalates on a third pass. Clean up fixtures; keep `verify:naming` green before and after.
**Tests:** the verify script IS the integration test; plus it runs the Unit 6/7/9 unit suites.
**Depends on:** Units 1–10
**Patterns to follow:** `scripts/verify-feedback*.ts`; QA fixture discipline + Demo-Winery-only rule (AGENTS.md, [[demo-winery-testing-convention]]).
**Verification:** `npm run verify:feedback-clarification` green; `/developer` shows the new state in the browser (in-app Claude browser, user logs in).

### Unit 12: Assistant surfaces open clarifications (reporter nudge) — eng-review add

**Goal:** The reporter actually notices the question, so the loop completes (the inbox has no email/toast/realtime — badge-on-navigation only).
**Files:** the assistant server context assembly (locate where `/api/assistant` builds its system/context —
`src/lib/assistant/run.ts` / `prompt.ts`), a small read `src/lib/feedback/clarification.ts`
(`listOpenClarificationsForUser`), and the assistant UI surface (`src/app/(app)/assistant/AssistantChat.tsx`) if a visible chip is warranted
**Approach:** When the user opens the assistant, look up their OPEN `FeedbackClarification` (at most one,
per the per-reporter constraint) and, if present, inject a short context note so the assistant proactively
says "the team needs one detail on the bug you reported: <questions> — reply here and I'll pass it along,"
AND/OR render a small chip linking to the DM thread. The reply still flows through the DM path (Unit 9),
so the assistant can either hand off to the inbox or capture the answer and post it as the reporter's DM
reply. Keep it read-only context; no new write tool required for v1 (v2 could let the assistant post the
answer directly). Belt-and-suspenders with the inbox badge — no email infra.
**Tests:** `test/feedback-clarification.test.ts` extension — `listOpenClarificationsForUser` returns the
single OPEN row for the reporter and nothing for others; a user with no open clarification gets no note.
**Depends on:** Units 5, 6
**Patterns to follow:** assistant context assembly in `run.ts`/`prompt.ts`; per-user scoping like the inbox reads.
**Verification:** open the assistant as a Demo user with an OPEN clarification; confirm the assistant surfaces the question; confirm a user without one sees nothing.

### Unit 13: Watchdog reconciliation + TTL sweep (cron) — GH Actions fragility, council C-6

**Goal:** No ticket ever silently dies because a `repository_dispatch` was lost or a reporter never replied.
**Files:** `src/lib/feedback/automation-sweep.ts` (new), `src/app/api/cron/feedback-automation-sweep/route.ts` (new), cron registration (Vercel `vercel.json` / existing cron config), `scripts/verify-feedback-clarification.ts` (extend)
**Approach:** Mirror the existing sweep pattern (`runVendorSyncSweep` + `/api/cron/qbo-vendor-sync`; the Commerce7 poll cron). One cron (`runFeedbackAutomationSweep`, `runAsSystem` across tenants) with two jobs:
1. **Lost-dispatch reconciliation:** find `AutomationRun` rows stuck in `QUEUED`/`RUNNING` with no `claimedAt` (the workflow never picked up) older than a threshold (~15 min). Re-dispatch once (respecting the per-ticket lifetime dispatch ceiling below); if it's already been re-dispatched and still not claimed, mark `FAILED` + move the source to a human-triage state with a developer note. `claimedAt` (set by `claimAutomationRun`) is the "CI actually started" signal.
2. **Unanswered-clarification TTL:** find `FeedbackClarification` rows `status='OPEN'` older than a TTL (~7 days, configurable). Mark `CANCELLED`, move the source out of `AWAITING_CLARIFICATION` to human triage, and leave a note ("reporter didn't respond in N days").
Add a **per-ticket lifetime dispatch ceiling** (e.g. 6 total dispatches across all attempts) as a runaway backstop independent of `MAX_ROUNDS`. Everything terminal lands in a clear `/developer`-visible state, never limbo (Unit 11 renders it). Idempotent + safe to run every N minutes.
**Tests:** `test/feedback-automation-sweep.test.ts` — a stuck-unclaimed run past threshold re-dispatches once then dead-letters; a claimed/running run is left alone; an OPEN clarification past TTL is CANCELLED + escalated; a fresh one is untouched; the dispatch ceiling stops re-dispatch. Extend the e2e verify to assert the sweep escalates a never-answered clarification.
**Depends on:** Units 5, 6, 9
**Patterns to follow:** `runVendorSyncSweep` + `/api/cron/qbo-vendor-sync` (14:45 UTC cron); Commerce7 poll cron as "single ingest path + backstop"; `runAsSystem` cross-tenant sweep ([[prismabase-rls-zero-rows-gotcha]]).
**Verification:** `npm run verify:feedback-clarification` (sweep cases green); manually stub a lost dispatch (park a run `QUEUED` with null `claimedAt`, backdate it) and confirm one sweep re-dispatches then dead-letters.

## Test Strategy

**Unit tests (pure / DB):** console buffer (Unit 1), debug-context clamp + my-reports exclusion (Unit 2),
support-sender idempotency (Unit 4), tenant-isolation + single-OPEN (Unit 5), clarification core (Unit 6),
sufficiency heuristic (Unit 7), reply-hook guards + re-dispatch (Unit 9). Follow the repo's node test
runner (`test/*.test.ts`); no jsdom/RTL for UI — test pure logic only ([[assistant-dock-history-shipped]]).

**Integration:** `scripts/verify-feedback-clarification.ts` drives the full loop against Demo Winery with
`runAsTenant` (DB proves persistence; the browser proves the UI). Existing `verify:feedback` /
`verify:feedback-routing` must stay green (new status must not break the routing/status invariants).

**Manual verification (browser, in-app Claude browser + user login as Demo):**
1. Trigger a console error, open `/help/feedback`, submit a thin bug → confirm ticket has console data.
2. As developer, approve automation → confirm the pre-flight gate parks it at AWAITING_CLARIFICATION and
   a DM from "Cellarhand Support" arrives in the reporter's `/inbox`.
3. Reply to the DM → confirm the clarification flips to ANSWERED and a new attempt-2 run is QUEUED.
4. Confirm the re-dispatched agent prompt contains `<console_errors>` and `<clarification_history>`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Reply mis-correlation (shared Support↔reporter thread) picks the wrong clarification | LOW | MED | **Eng-review:** ≤1 OPEN clarification per REPORTER (partial unique on `(tenantId, reporterUserId)`, Unit 5) makes any reply unambiguous; only the reporter's message advances it; a reply with no open clarification is an ordinary DM |
| Clarification answer is free user text fed into the fix-agent prompt (injection) | MED | MED | **Eng-review:** render inside `<clarification_history>` framed as untrusted data (same contract as `<debug_context>`); the fix agent is already fenced (modify-existing-only, `tsc`-gated, no tests-in-job) |
| Reporter never notices the question (no email/toast/realtime inbox) | MED | HIGH | **Eng-review:** Unit 12 surfaces the open clarification in the assistant (where bug-reporters already are) + the inbox badge; stale-sweep is a follow-up |
| Auto-approved re-dispatch fires a CI run from a user DM with no human gate | LOW | MED | **Eng-review decision:** accepted — a human approved attempt 1, the answer only adds context, and fix runs are fenced/draft-PR only; the round cap bounds total runs |
| Console logs contain PII/secrets | MED | MED | Per-entry + total size clamp, light redaction (Unit 1), and `debugContext` stays developer-only (`my-reports` exclusion, asserted in Unit 2) |
| Infinite clarify ↔ reply ping-pong | LOW | MED | Hard round cap (MAX_ROUNDS=2), then escalate to human triage (Units 7, 9) |
| DM core rejects the support sender (not a member / RLS) | MED | HIGH | `resolveSupportSenderForTenant` ensures a real `Member`; backfill Demo+Bhutan; verify test sends a real DM as Support |
| No bot identity → sending "as Support" still needs correct ALS/user context in CI | MED | MED | `requestClarificationCore` runs `runAsTenant(tenantId, …, { userId: supportUserId })`; CI script uses `runAsSystem` to resolve tenant then the core (react-server conditions) |
| Enum migration ordering breaks on Windows | LOW | HIGH | Isolated `ALTER TYPE` migration committed before any default references it ([[prisma-neon-migrations-windows]]) |
| Asking bug-shaped questions on a feature-gap PLAN run | MED | MED | **C-6:** the clarification gate fires ONLY for `kind = AGENTIC_FIX`; PLAN runs never trigger it (a `PRODUCT_GAP` isn't a thin bug). Plan-agent reasoning stays a separate plan |
| `repository_dispatch` lost (GitHub drop / concurrency / bad runner) → run stuck forever | MED | HIGH | **Unit 13 watchdog:** stuck `QUEUED`/`RUNNING` with no `claimedAt` past threshold → re-dispatch once, then dead-letter to human triage. Per-ticket dispatch ceiling caps runaway |
| Reporter never replies → run parked forever | MED | MED | **Unit 13 TTL sweep:** OPEN clarification past ~7 days → CANCELLED + escalate to human; `AWAITING_CLARIFICATION` is `/developer`-visible throughout |
| `attempt`-bump collides with the `PRODUCT_GAP`→PLAN reroute logic | LOW | MED | Reuse `recordAutomationGate` (idempotency key includes attempt); add a verify assertion that re-dispatch keeps the same `kind` as the original run |

## Success Criteria

- [ ] A bug submitted with a console error present stores `debugContext.consoleLog`/`clientErrors` (clamped, developer-only) for both `FeedbackTicket` and `AssistantFeedback` client paths.
- [ ] The fix/assistant agents' prompts render `<console_errors>` when present.
- [ ] A thin ticket routes to a clarification instead of a fix run; a DM from a seeded "Cellarhand Support" member lands in the reporter's inbox; run + source show `AWAITING_CLARIFICATION`.
- [ ] The fix agent can call `request_clarification`, and the workflow asks the reporter instead of opening a PR.
- [ ] The reporter's reply marks the clarification `ANSWERED`, appends the Q&A to the ticket, and re-dispatches an `attempt + 1` run of the same kind.
- [ ] Round cap (2) is enforced; a further-thin report escalates to human triage rather than looping.
- [ ] `verify:feedback-clarification` green; `verify:feedback`, `verify:feedback-routing`, tenant-isolation, and `verify:naming` stay green.
- [ ] No customer-facing surface (`my-reports`) exposes console logs or clarification internals.
- [ ] The assistant surfaces an open clarification to the reporter (Unit 12).
- [ ] A lost `repository_dispatch` (run stuck unclaimed) is reconciled by the watchdog sweep, and an unanswered clarification is escalated to human triage after its TTL (Unit 13) — neither sits in limbo.
- [ ] The sufficiency gate never fires on a PLAN (`PRODUCT_GAP`) run; cheap judgment runs in-app, not in CI (C-6 invariant).
- [ ] All tests pass; no regressions.

## Eng-Review Notes (plan-eng-review, 2026-07-18)

**What already exists (reused, not rebuilt):**
- `AutomationRun` spine + `attempt`-keyed `automationIdempotencyKey` → re-dispatch mechanism (no new pipeline).
- `FeedbackTicket.debugContext Json?` client→agent channel → console capture with **zero migration**.
- `sendDirectMessageCore` + `dm-actions.ts` single choke point → DM-out and reply hook in one place.
- Polymorphic `sourceType/sourceId` (from `AutomationRun`) → covers both source types with one model.
- `feedback-attachment-images.ts` bounded/pure guards → the pattern for the console clamp.
- `updateSourceAutomationStatus` two-field sync → new statuses stay consistent.

**NOT in scope (considered, deferred):**
- Making `feedback-plan-agent.ts` reason over the answer (it's static boilerplate; PLAN only *carries* the Q&A). Follow-up.
- Real email/toast/realtime DM delivery (EmailChannel is a no-op stub). Unit 12 uses the assistant + badge instead.
- Console capture on the server-composed assistant `file_feedback` tool path (no client context to capture).
- Stale-clarification expiry sweep/cron (a reporter who never replies). Follow-up TODO.
- Any change to auth/org/global models — `Cellarhand Support` is a normal per-tenant `Member`.

**Code-quality decisions folded in (no alternatives, so no question spent):**
- **DRY:** extract ONE shared formatter for the `<debug_context>` / `<console_errors>` / `<clarification_history>` untrusted-data blocks (used by `bug-feedback-agent.ts`, `assistant-feedback-agent.ts`, `feedback-plan-agent.ts`) — Unit 3/10 build it once in a helper, not per-script.
- **Perf:** the reply-hook fires on every DM send app-wide → it must be a single indexed lookup on `(tenantId, dmThreadId, status)` (Unit 5 index) and fail-open (never block the send).
- **Console buffer:** always-on is required (must catch the error that already happened before the user opens the reporter); wrap+preserve originals, keep it cheap, guard against double-install and Sentry double-capture.

**Failure modes with a critical-gap check:** none left silent. Reply mis-correlation → per-reporter unique. Support-send rejection → membership backfill + verify. Enum ordering → isolated migration. Reporter-never-notices → Unit 12 (the one that was product-critical and is now addressed).

## Council Revisions (Codex + Gemini, 2026-07-18) — these SUPERSEDE the units above where they conflict

### User decisions on the 4 product/safety reversals
- **Re-run approval:** KEEP auto-approve (Unit 9 unchanged). Draft-PR + human merge-review is the accepted gate.
- **Sender identity:** KEEP the name "Cellarhand Support", BUT the clarification DM **body must clearly state it is automated** and set reply expectations, e.g. _"This is Cellarhand's automated triage. Reply here with the details and I'll pass them straight to engineering — no need to wait for a person."_ (Units 6, 12 copy.)
- **Reply correlation:** SWITCH to **per-TICKET + tracking token** (replaces the per-reporter constraint). See C-1 below.
- **Sufficiency gate:** SWITCH Unit 7 to a **cheap-LLM sufficiency check** (replaces the deterministic heuristic). See C-2 below.

### C-1: Per-ticket correlation via a tracking token (revises Units 5, 6, 9, 12)
- **Unit 5 constraint change:** drop the `(tenantId, reporterUserId) WHERE status='OPEN'` unique. Instead: partial unique **`(tenantId, sourceType, sourceId) WHERE status='OPEN'`** (≤1 open per TICKET) + **`UNIQUE (tenantId, automationRunId)`** (workflow-retry idempotency — Codex A7). Keep `reporterUserId` denormalized (for listing + fallback), add a short human-facing **`ref`** (e.g. `BUG-<base32(id)>`) column, unique per tenant. Prisma can't express partial uniques → **raw-SQL migration + a test asserting the index exists** (Codex). Add index `(tenantId, sourceType, sourceId, askedAt desc)` for source history.
- **Unit 6:** the DM body embeds the token, e.g. `[Ref: BUG-7Q2F]`. Multiple open clarifications per reporter are now allowed (different tickets).
- **Unit 9 reply routing:** parse the `[Ref: …]` token from the reply → resolve that OPEN clarification. Fallbacks: no token AND exactly one OPEN clarification for this reporter on the thread → use it; no token AND >1 OPEN → post a gentle auto-reply asking them to include the `[Ref: …]` code (do NOT guess), and leave all open. Only the reporter's message routes.

### C-2: Cheap-LLM sufficiency gate (revises Unit 7)
- Replace `assessSufficiency` heuristics with a small fast-LLM call (e.g. Haiku) prompted "is this bug report actionable? if not, what 1–3 specific questions?" → `{ sufficient, questions[] }`. Keep it behind the same dispatch choke point. Input is untrusted-data framed. Deterministic fallback (report has console errors + a screenshot ⇒ treat as sufficient) so an LLM outage never blocks dispatch. Also run a cheap **intent check on the reporter's REPLY** before re-dispatch (Gemini): "idk"/off-topic → route to human triage instead of burning a CI run.

### C-3: Concurrency & consistency fixes (Codex — folded into Units 5/6/8/9, no tradeoff)
1. **Lost-reply race:** persist the `FeedbackClarification` OPEN row in the SAME tx that parks run+source; **send the DM after commit**; patch `dmMessageId` after send. Never send-then-persist.
2. **TOCTOU on ≤1-open:** DB arbitrates — **insert-first + catch `23505`** on the partial unique (no app-level precheck).
3. **`attempt` vs round:** add a distinct **`clarificationRound Int`** on the clarification; `MAX_ROUNDS` gates on `clarificationRound`, NOT the automation `attempt`. Test the boundary (round 2 requested during attempt-2 still escalates correctly).
4. **Polymorphic integrity:** SQL **`CHECK`** that exactly one of `ticketId`/`assistantFeedbackId` is non-null and matches `sourceType`.
5. **Status desync (multiple runs per source):** add **`currentAutomationRunId`** to `FeedbackTicket` + `AssistantFeedback` (additive, RLS-neutral migration); derive the displayed `automationStatus` from the current run, and mark prior runs superseded so an old attempt can't leave the source stuck at `AWAITING_CLARIFICATION`.
6. **Double-reply race:** answer transition is a single **`UPDATE … WHERE status='OPEN' RETURNING *`**; only the winner appends + re-dispatches.
7. **Workflow-retry idempotency:** the `RUNNING → AWAITING_CLARIFICATION` transition is compare-and-set; `UNIQUE (tenantId, automationRunId)` (C-1) stops a re-run asking twice.
8. **Explicit tenant context:** `advanceClarificationFromReply({ tenantId, threadId, senderUserId })` — pass `tenantId` from the DM action and wrap in `runAsTenant(tenantId, …, { userId: senderUserId })` so RLS never silently returns 0 rows.
9. **Single source of truth:** `FeedbackClarification` **rows are authoritative**; agents render `<clarification_history>` from rows at read time (drop the duplicated `debugContext.clarifications[]` write, or make it a read-time projection only).

### C-4: Suggested improvements (folded — no tradeoff)
- **Black-hole UX (Gemini):** on a routed reply, the loop posts an immediate auto-ack DM ("Thanks — added to the ticket, the agent is investigating now").
- **Shared-kiosk PII (Gemini):** clear the console ring buffer on logout / session switch (Unit 1); regex-scrub emails/tokens/phone before persist (Unit 1/2).
- **Stale drain (Codex):** snapshot the buffer by cursor and reset after a successful submit so a later report on a different page doesn't carry old logs.
- **Orphaned reporter at reply time (Gemini):** catch DM-dispatch / user-not-found on both ask and reply → move to human triage.
- **Exhaustive enum (Codex):** `AWAITING_CLARIFICATION` handled in every status switch/badge/filter/serializer (compile-time exhaustive) — Unit 11.
- **debugContext versioning (Codex):** readers tolerate v1 legacy + mixed sources via a discriminated union, normalized on read (Units 2/3/10).
- **Support-user auth (Codex):** mark the Cellarhand Support user disabled / non-authenticatable in schema+auth, not "by convention" (Unit 4).

### C-5: Deferred design questions (not built now, flagged)
- **TTL on unanswered clarifications:** PROMOTED to a real deliverable — see Unit 13 (watchdog + TTL sweep).
- **GH Actions latency for multi-turn (Gemini):** ADDRESSED, not deferred — see C-6. The cheap judgment already runs in-app; only the fix runs in CI. Latency is a non-issue for an async DM loop; dispatch *reliability* is the real risk, handled by Unit 13.
- **Human-goalie ordering (Gemini):** auto-ask happens before the human goalie sees the ticket; acceptable given the round cap + `/developer` visibility. Revisit if it noisily front-runs triage.
- **Agent asking after edits (Codex):** the tool contract forbids `request_clarification` after `apply_fix` in the same run (mutual exclusion) — Unit 8.
- **Assistant surfacing an unrelated clarification (Codex/U12):** scope the surfaced clarification to the current assistant context where possible; otherwise list by `ref` so it's unambiguous.

### C-6: In-app vs CI split (GH Actions fragility — INVARIANT) + FIX-only scoping
Two AI decisions, two homes — this is an architecture invariant, not a preference:
- **CHEAP judgment runs IN-APP, never in CI:** the pre-flight sufficiency check (Unit 7) and the reply intent-check (C-2) are single LLM calls over ticket text — they do NOT need the repo. They run in `automation.ts` in-app, so a thin ticket gets a clarification DM **without ever dispatching a GitHub Action** (directly answers Gemini's "don't spin a container to ask a question"). Do NOT move these into a CI script.
- **HEAVY work runs in CI:** only the actual fix (repo checkout, fenced writes, `tsc`) needs the sandbox. The in-agent `request_clarification` necessarily runs in CI because the agent is already there, but that's a CI run that was happening anyway (it's a cheaper exit than a fix).
- **FIX-only clarification (PLAN-path fix):** the pre-flight gate fires ONLY for `kind = AGENTIC_FIX`. A `PLAN` run is a `PRODUCT_GAP` feature request — bug-shaped questions ("repro/error/screenshot") don't fit it, and the plan agent is static boilerplate anyway. If a PLAN clarification ever exists, carry the Q&A into the GitHub issue body for the human triager; don't ask bug questions on a feature request. Making the plan agent reason over answers is a separate plan.
- **`repository_dispatch` is fire-and-forget:** the app POSTs and gets a 204 with no guarantee the workflow ran (GitHub drop, concurrency cap, runner down, bad workflow file). Every dispatch (including the reply→re-dispatch) can be silently lost → the run sits `QUEUED`/`RUNNING` forever. Reliability is handled by Unit 13, not by hoping.

## Design Review Notes (plan-design-review, 2026-07-18) — calibrated to DESIGN.md

**UI scope:** 3 user-facing surfaces (all App-UI / conversational, no marketing UI; no mockups needed).
Initial design completeness 7/10 → 9/10 after the specs below. Reference DESIGN.md tokens (no hardcoded
colors/fonts/spacing) for every new element.

### D-1: Reporter's "My Reports" status chip (user decision — NEW, extends Unit 11)
Closes the "black hole": the reporter's own ticket list must reflect that the system is waiting on them.
- On the `my-reports` row, when `automationStatus = AWAITING_CLARIFICATION`: show a chip **"Needs your input — check your inbox"** (uses the existing status-token styling; links to `/inbox`). After they reply and the run re-dispatches: **"Re-investigating"**. Terminal states unchanged.
- **Redaction contract holds:** the chip conveys STATUS only — never the console logs, the questions, or the clarification body (those stay developer-only; `my-reports.ts` still excludes `debugContext`). This is a new *status* field surfaced, not the hidden internals.
- The `advanceClarificationFromReply` auto-ack (C-4) is the inbox echo; this chip is the reports-view echo. Both point the reporter to one place to act.

### D-2: The clarification DM copy (specifies Unit 6 "friendly body")
Not "a friendly body" — the actual copy, honest about being automated (council C-2) and carrying the token:
> **Cellarhand Support** _(automated triage)_
> "Thanks for reporting **‹bug title›**. I'm Cellarhand's automated triage — reply right here with the details and I'll pass them straight to engineering, no need to wait for a person.
> To fix this well I need: ‹question 1› ‹question 2›
> _(Ref: BUG-7Q2F — please keep this in your reply.)_"
- One job: ask. No more than 3 questions. Plain language, no dev jargon in the questions the reporter sees.
- The `[Ref: …]` line is visually subordinate (muted) so it doesn't dominate, but present for reply-routing (C-1).
- Auto-ack on reply: "Got it — added to your report. The engineering agent is taking another look now."

### D-3: /developer clarification panel — interaction state coverage (Unit 11)
The developer console must handle every state, not just the happy path:

| State | What the developer sees |
|-------|-------------------------|
| No clarification | Nothing extra on the row (default). |
| AWAITING_CLARIFICATION | A distinct badge + a panel: the questions asked, `round N/2`, "asked ‹relative time›", who it was sent to. |
| ANSWERED / re-dispatched | The Q&A shown inline (question → answer), plus the new run's status. |
| Round cap hit (escalated) | A clear "Escalated to human — max clarification rounds reached" state with the developer note. |
| Reporter unreachable (null/deleted) | "Couldn't ask — reporter unavailable; routed to human triage." |
| Loading / read error | Skeleton on load; on error, an inline "couldn't load clarification" with retry (never a blank panel). |

### D-4: Assistant nudge copy + states (Unit 12)
- With one open clarification: the assistant proactively opens with **"Quick thing — the team needs one detail on the bug you reported (‹short title›). ‹question›. Reply here or in your inbox and I'll pass it along."** Scoped by `ref` so it's unambiguous which bug (council C-5).
- No open clarification: no note, no empty-state noise (subtraction default — don't manufacture a prompt).
- The chip, if rendered, uses the assistant's existing affordance styling; it links to the DM thread, it does not duplicate the whole Q&A inline.

### D-5: Accessibility + responsive (universal)
- Status chips: not color-only (icon + text label) for colorblind users; meet contrast per DESIGN.md; 44px min touch target on the inbox/report links.
- The `/developer` clarification panel: keyboard-navigable, ARIA-labeled Q&A region; the reply thread reuses the existing accessible inbox components.
- Copy length: the DM and assistant note must read cleanly at 375px (no truncation of the `[Ref]` token).

**NOT in scope (design):** a bespoke "action required" inbox card type (kept as a plain DM per user's sender decision); a redesign of `/developer`; any visual change to the bug-submit form (console capture is invisible).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Council (Codex+Gemini) | `/council` | Cross-LLM adversarial | 1 | ISSUES→RESOLVED | 9 concurrency/consistency races (folded in) + 4 product/safety reversals (user re-decided: kept auto-approve + "Cellarhand Support"; switched to per-ticket+token + cheap-LLM gate). See Council Revisions section |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 3 load-bearing decisions resolved; +1 unit (assistant surfacing); DRY/perf/injection folded in |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | 7/10 → 9/10; 3 user-facing surfaces spec'd (My Reports status chip [user], DM copy, /developer state table, assistant nudge, a11y); calibrated to DESIGN.md |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not requested |

**UNRESOLVED:** 0.
**CROSS-MODEL:** Codex + Gemini + eng-review converged — the 4 product reversals were surfaced to the user and re-decided; the 9 concurrency fixes folded in with no dissent.
**VERDICT:** ENG CLEARED + COUNCIL RESOLVED + DESIGN CLEARED. Plan is review-complete and ready for `/work`.
