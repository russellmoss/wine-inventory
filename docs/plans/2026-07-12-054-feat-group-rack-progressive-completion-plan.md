---
title: Phase 9.4b — Progressive per-member completion for group-rack work orders
type: feat
status: draft
date: 2026-07-12
branch: feat/group-rack-progressive-completion-054
depth: standard
units: 7
depends_on:
  - docs/plans/2026-07-09-050-feat-phase-9-4a-group-rack-barrel-down-plan.md
---

## Overview

A cellar crew barreling down a tank into 10 barrels rarely finishes in one go. They fill 4 now, come back tomorrow for the rest. Today a GROUP_RACK work-order task is **all-or-nothing** — one balanced RACK op over every member vessel, one attempt, one terminal completion. This makes the crew either do all 10 in one session or record nothing until they do (so the ledger lags reality for a day). Phase 9.4b lets them complete a **subset of members now and the rest later**, while it stays **one reviewable task**: each batch writes its own balanced RACK op over just the members in that batch, the task stays `IN_PROGRESS` until the last member lands, then rolls up to `PENDING_APPROVAL`/`APPROVED`.

## Problem Frame

Real barrel-down / rack-to-tank work spans hours or days. The 9.4a all-or-nothing model forces a false choice: hold the whole task open with no ledger record (wine physically moved but the system says it didn't), or block the crew from recording partial progress. Both push crews off-system, which is exactly what the work-order engine exists to prevent. The job: "mark the 4 barrels I actually filled, leave the other 6 for tomorrow," with the tank's volume dropping correctly after each batch.

**Premise correction (from research):** the 9.4a plan deferred this saying it "needs a schema/model change." That turns out to be wrong. `WorkOrderTaskAttempt` already supports N ops per task (`seq` counter + `@@unique([tenantId, operationId])` = "one attempt per immutable op", `schema.prisma:3548`). Each batch is just another attempt with its own op. The real blockers are pure *logic* — the terminal-status guard, the completion status transition, singular `currentAttemptId` semantics, and per-batch reject. **No new table, no migration, no RLS surface.** That is a large risk reduction versus what 9.4a assumed.

## Requirements

- MUST: complete an arbitrary subset of a group-rack task's members in one action ("these 4 now"), writing ONE balanced RACK op over just that subset (via the existing `groupRackTx`), drawn against the source's *current* state at that moment.
- MUST: the task stays `IN_PROGRESS` while members remain; it transitions to `PENDING_APPROVAL` (or `APPROVED` when auto-finalize) only when the **last** member is completed.
- MUST: never write N per-barrel task rows — it remains ONE reviewable task with per-member progress (the 9.4a invariant).
- MUST: per-batch idempotency (each batch carries its own `commandId`; a duplicate submit is a no-op).
- MUST: reject reverses a batch's real op through the existing `reverseOperationCore`/`reverseGroupRackCore` path and reopens exactly that batch's members; batches reverse **LIFO** (latest first), because batches share the source vessel and the ledger's LIFO reverse-guard already enforces that order.
- MUST: WORKORDER-1 holds — ledger writes only through the deterministic core; every batch op is balanced (`assertBalanced`).
- MUST: keep NL/assistant group-rack authoring working unchanged (the resolved member set is already in the signed payload; authoring does not change).
- SHOULD: the execute screen shows done vs. pending members with per-member checkboxes and a "complete N now" action; done members can't be re-selected.
- SHOULD: the WO detail page shows group-rack member progress (currently members are invisible there — a bonus fix).
- NICE: a "complete all remaining" shortcut that batches every pending member at once (parity with today's one-shot completion).

## Scope Boundaries

**In scope:**
- Progressive completion for GROUP_RACK tasks (both `BARREL_DOWN` and `RACK_TO_TANK` directions).
- A dedicated group-rack execute sub-form with per-member selection.
- Per-batch reject + LIFO reversal semantics.
- Deriving per-member progress from the task's live batch attempts (no persisted per-member table).
- WO detail-page member progress display.
- e2e + unit coverage; keep all existing gates green.

**Out of scope:**
- Any new table / migration / RLS (research proved unnecessary — see Key Decisions).
- Per-member *approval* granularity (review stays at the task grain: the task enters review once, when fully complete; approve/reject act over all its live batch ops). Per-batch reject *before* full completion is an in-progress correction affordance, not a review step.
- Changing single-vessel RACK, or any non-group task type.
- Progressive completion for other multi-target task families (crush/press already own their run-time forms; not in scope).
- Auto-blend on rack-to-tank into a foreign-lot tank (still `needs_input`/`blocked`, unchanged from 9.4a).

## Research Summary

### Codebase Patterns

- **The one-terminal-attempt assumption is logic, not schema** (`src/lib/work-orders/execute.ts`):
  - `execute.ts:308-310` — terminal guard rejects re-completing a task in `DONE/APPROVED/SKIPPED/PENDING_APPROVAL`. A task in `IN_PROGRESS` passes this guard, so additional batches from `IN_PROGRESS` are already accepted.
  - `execute.ts:331` — `assertTaskTransition(task.status, "PENDING_APPROVAL")`. Completion is modeled only as `→ PENDING_APPROVAL`; there is no "record a batch, stay open" path.
  - `execute.ts:372` — `seq = count(attempts)+1` (already N-aware). `execute.ts:373-388` — attempt create (own `commandId`, `operationId`, `actualPayload`).
  - `execute.ts:396-407` — the completion CAS unconditionally sets `PENDING_APPROVAL/APPROVED` and overwrites `currentAttemptId`. This is the core single-op assumption to relax.
  - `execute.ts:411` — `releaseReservationsForTaskTx(tx, {taskId})` releases the whole task's holds on first completion (must become incremental).
- **Status machine** (`src/lib/work-orders/status.ts:30-38`): `TASK_TRANSITIONS`; `isLegalTaskTransition` allows `from===to` self-moves (`status.ts:55`). `rollUpWorkOrderStatus` (`status.ts:74-89`) keeps the WO at `IN_PROGRESS` while a task is `IN_PROGRESS` — **already friendly** to a task that stays open across batches. Group gating (`group-gating.ts:10-15`) counts only `PENDING_APPROVAL/APPROVED/DONE/SKIPPED` as worker-done, so a mid-batch task correctly keeps downstream groups gated.
- **Group-rack core** (`src/lib/vessels/group-rack-core.ts`): `groupRackTx(tx, actor, input, {commandId, note})` writes ONE balanced RACK op over the given member set and is **already subset-friendly** — pass a subset of `destVesselIds`/`sourceVesselIds` and it plans/balances/writes just those. `previewGroupRack(input)` returns `GroupRackMemberPreview[]` (`{vesselId, code, label, role, currentL, capacityL, allocationL, status, message}`) — exactly the per-member headroom shape the execute form needs, but it is not loaded on the execute page today. `reverseGroupRackCore` reverses one op as a single CORRECTION (already wired into `reverseOperationCore`'s rack family; the LIFO guard is `laterTouchedKeys`).
- **Completion dispatch** (`execute.ts:61-124`): `parseGroupRackPayload(payload)` reads `payload.groupRack` (direction + member list + optional `perDestVolumeL`/`perSourceDrawL` actuals) and the RACK case calls `groupRackTx`. Member set + `memberCodes` live in `plannedPayload.groupRack` (`nl-resolve.ts:372-405`); per-member allocations are computed at completion, not stored.
- **Batch-complete UI precedent** (`src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx`): `BatchCapExecutor` (lines 172-253) is the multi-select-with-per-item-`commandId` pattern to mirror, though it operates over N *tasks*; here we operate over N *members of one task*. Bespoke sub-forms are dispatched by kind/opType (`ExecuteClient.tsx:284-294`); a GROUP_RACK task currently falls through to the generic `TaskExecutor` (which only renders the `note` field). `completeTasksBatchCore` (`execute.ts:447-467`) runs each item in its own `runLedgerWrite` (per-item pass/fail) — the same isolation we want per batch.
- **Approve/reject** (`src/lib/work-orders/approval.ts`): both key off the singular `currentAttemptId` and drive the whole task terminal. `rejectTaskCore` reverses `attempt.operationId` via `reverseOperationCore` (`approval.ts:198,211-235`) and moves the task to `REJECTED`. Multi-batch needs approve-all-live-ops and reject-one-batch (LIFO).
- **Data view** (`src/lib/work-orders/data.ts`): `WorkOrderTaskView.plannedPayload` carries the group-rack block opaquely; there is no per-member state or member resolution today. `getWorkOrderPickers` has `volumeL/capacityL` but the execute client's local `Picker` type (`ExecuteClient.tsx:27`) is too narrow to show headroom.

### Prior Learnings

- Build in the MAIN checkout `C:\Users\russe\Documents\Wine-inventory` (has `.env`); branch → PR to protected `main`; never direct push. `.claude/worktrees/*` is `.env`-less. (`[[build-in-main-checkout-not-worktrees]]`, `[[main-repo-has-env-verify-runs]]`)
- `check` CI does NOT run `next build`; a client→server import leak only surfaces on Vercel. Run `npx next build` locally before finishing any PR that adds/edits a client component importing from `src/lib`. (Plan 053 B10 gotcha)
- The `review` CI bot flakes "max turns" on big diffs — benign, non-required. GitGuardian red is a benign CI-cred false-positive.
- TASK_COVERAGE in `proposal-readiness.ts` is an exhaustiveness contract; but this plan adds no new TASK_VOCABULARY key (GROUP_RACK already exists), so no coverage entry change.

### External Research

None needed — this is internal ledger/work-order logic on patterns the codebase already owns.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Per-member state storage | **Derive from batch attempts (NO new table)** | (a) new `work_order_task_member` RLS table; (b) per-barrel task fanout | The attempt model already holds N ops/task (`seq` + `@@unique([tenantId,operationId])`). Completed members = union of members recorded in the task's live (non-rejected) batch attempts' `actualPayload.groupRackBatch`. Avoids a migration + RLS + isolation fixture entirely. Fanout is explicitly banned by 9.4a (blows `NL_WORK_ORDER_MAX_TASKS`, unreviewable). Revisit a table only if per-member querying becomes a bottleneck. |
| Task status while partial | **Reuse `IN_PROGRESS`; no new enum value** | new `PARTIALLY_DONE` status | Adding a status value is a Prisma enum change (violates the "no new enums" constraint) and ripples through the status machine, rollup, gating, and every status switch. `IN_PROGRESS` already means "started, not settled" and the rollup/gating already treat it correctly. Progress ("4 of 10") is derived, not a status. |
| Where batch logic lives | **New `completeGroupRackBatchCore` in `execute.ts` (or a sibling), reusing `groupRackTx`** | overload `completeTaskCore` with subset branches | Keep `completeTaskCore` (the general op lane) intact; a focused core for the group-rack batch path is easier to reason about and test, and it reuses `groupRackTx` for the actual balanced write. The single-shot GROUP_RACK completion becomes "batch = all pending members." |
| Review grain | **Task-level review, entered once when fully complete** | per-batch approval | Matches today's one-review-per-task model and the maker-checker mental model. Approve finalizes all the task's live batch ops; full reject reverses them all LIFO. A per-batch *correction* reject is available while `IN_PROGRESS` to fix a mis-recorded batch. |
| Reject ordering | **LIFO across batches (reverse latest batch first)** | arbitrary-order per-batch reject | Batches share the source vessel; a later batch draws from the source after an earlier one. The ledger's `laterTouchedKeys` LIFO guard already blocks out-of-order reversal. Surfacing LIFO explicitly (disable "undo" on non-latest batches with a clear reason) matches the ledger reality instead of fighting it. |
| Source drift between batches | **Each batch re-reads current source state at completion; allocations computed then** | freeze plan-time allocations | `groupRackTx` already plans against loaded current state (`buildGroupRackPlan`), so a batch is self-correcting. If the source changed so the remaining members no longer fit, the batch fails cleanly with the existing friendly capacity error — never overfills. |

## Implementation Units

### Unit 1: Member-progress projection (pure)

**Goal:** A pure function that, given a group-rack task's `plannedPayload.groupRack` member set + its live (non-rejected) batch attempts, returns per-member status (`done` / `pending`) and which op completed each done member.
**Files:** `src/lib/work-orders/group-rack-progress.ts` (new), `test/group-rack-progress.test.ts` (new).
**Approach:** Define `deriveGroupRackProgress(plannedGroupRack, attempts[])`. Each batch attempt records its completed member vessel ids under `actualPayload.groupRackBatch.memberVesselIds` (Unit 3 writes this). Completed = union across attempts whose status is not `REJECTED`; pending = plannedMembers − completed. Return `{ direction, members: [{vesselId, code, done, byAttemptId?, byOperationId?}], allMembersDone, latestBatchAttemptId }`. Pure, no DB.
**Tests:** no batches → all pending; one batch of 4/10 → 4 done, 6 pending; a rejected batch's members return to pending; a duplicate member across two attempts counts once; empty member set is a defensive error.
**Depends on:** none.
**Execution note:** test-first (pure, high leverage).
**Verification:** `npx vitest run test/group-rack-progress.test.ts`.

### Unit 2: Expose member progress on the task view

**Goal:** The execute + detail pages can render resolved members with done/pending + current volume/headroom.
**Files:** `src/lib/work-orders/data.ts` (extend `WorkOrderTaskView` / `getWorkOrderDetail`), `src/lib/vessels/group-rack-core.ts` (reuse `previewGroupRack`), `src/app/(app)/work-orders/[id]/execute/page.tsx` (load group-rack member data when a WO has a GROUP_RACK task, mirroring the crush/press/bottling conditional loads).
**Approach:** Add an optional `groupRack` block to the task view: `{ direction, members: [{vesselId, code, currentL, capacityL, done, allocationHintL}], sideVessel, pending count }`, built from `deriveGroupRackProgress` (Unit 1) + a `previewGroupRack` call over the *pending* subset (for headroom + allocation hints). Load only when the WO has an open GROUP_RACK task (perf — same gate as `hasCrush`/`hasBottle` in `page.tsx`).
**Tests:** unit test that a task with a partial batch surfaces the right done/pending split in the view DTO; a fully-done task surfaces `allMembersDone`.
**Depends on:** Unit 1.
**Verification:** `npx tsc --noEmit`; targeted vitest on the data mapper.

### Unit 3: Group-rack batch completion core

**Goal:** Complete a selected subset of a group-rack task's members as one balanced op, keeping the task `IN_PROGRESS` until the last member lands.
**Files:** `src/lib/work-orders/execute.ts` (new `completeGroupRackBatchCore` + wire it), `src/lib/work-orders/status.ts` (allow the partial self-transition if needed), `test` coverage via Unit 7 e2e + a focused unit test.
**Approach:** New core `completeGroupRackBatchCore(actor, { taskId, commandId, memberVesselIds[], perMemberVolumeL?, lossL?, note?, autoFinalize? })`:
- Idempotency pre-check on `commandId` (mirror `execute.ts:290-300`).
- Guard the task is a GROUP_RACK op task in `PENDING`/`IN_PROGRESS`/`REJECTED` (not terminal). Reuse/relax the `execute.ts:308-310` guard so `IN_PROGRESS` continues to pass and additional batches are accepted.
- Derive pending members (Unit 1); reject any selected member not in pending (already done or not a member) with a clear error.
- Build a `GroupRackInput` restricted to the selected members (subset of `destVesselIds`/`sourceVesselIds`, aligned `perDest/perSource` volumes), inside one `runLedgerWrite`: call `groupRackTx` → one balanced op; create the attempt with `actualPayload.groupRackBatch = { memberVesselIds, operationId }`; compute `allDone = deriveGroupRackProgress(after this batch).allMembersDone`; CAS the task to `IN_PROGRESS` if `!allDone`, else `PENDING_APPROVAL`/`APPROVED` (respecting `autoFinalize`); set `currentAttemptId` to this attempt; release reservations only for the completed members (incremental); rollup; audit.
- P2002 → idempotent success (mirror `execute.ts:424-434`).
**Tests:** partial batch keeps `IN_PROGRESS`; final batch flips to `PENDING_APPROVAL`; selecting an already-done member errors; duplicate `commandId` is a no-op; a batch whose members no longer fit the (changed) source fails cleanly without writing.
**Depends on:** Units 1, 2.
**Execution note:** the shared `runLedgerWrite` is SERIALIZABLE + retry — safe for the incremental source draw across concurrent batches (CAS on `(status, currentAttemptId)` serializes).
**Verification:** unit test + `npm run verify:work-orders-transform` (Unit 7).

### Unit 4: Per-batch reject (LIFO) + full-task review

**Goal:** Reject reverses a single batch's op and reopens exactly its members; full-task reject reverses all batches LIFO; approve finalizes all live batch ops.
**Files:** `src/lib/work-orders/approval.ts`, coverage via Unit 7.
**Approach:** Add `rejectGroupRackBatchCore(admin, actor, { taskId, attemptId, reason })`: only the *latest* live batch attempt is rejectable (LIFO — the ledger `laterTouchedKeys` guard enforces it; surface a clear "undo the later batch first" error otherwise). Reverse that attempt's `operationId` via `reverseOperationCore` (reuses `reverseGroupRackCore`), mark the attempt `REJECTED`, recompute progress; if the task was `PENDING_APPROVAL`/`APPROVED`, move it back to `IN_PROGRESS` (batches remain) or `REJECTED` (no live batches left). Extend `approveTaskCore` so approving a fully-complete group-rack task marks *all* its live batch attempts APPROVED (not just `currentAttemptId`). `rejectTaskCore` full-task path reverses all live batch ops in LIFO order.
**Tests:** reject the latest batch → its members reopen, task returns to `IN_PROGRESS`, earlier batch untouched; rejecting a non-latest batch is refused with the LIFO message; approve after all members done finalizes every batch op; full reject reverses all LIFO and reopens the task.
**Depends on:** Unit 3.
**Verification:** `npm run verify:work-orders-transform` (Unit 7).

### Unit 5: Group-rack execute sub-form

**Goal:** The crew sees done/pending members with checkboxes, picks "these N," enters optional per-member volume + loss, and records the batch; a "complete all remaining" shortcut.
**Files:** `src/app/(app)/work-orders/[id]/execute/GroupRackTaskForm.tsx` (new), `src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx` (dispatch GROUP_RACK → the new form), `src/lib/work-orders/actions.ts` (new `completeGroupRackBatchAction` + `rejectGroupRackBatchAction` wrappers, mirroring the existing completion actions incl. `shouldAutoFinalize`).
**Approach:** Mirror `BottlingTaskForm`/`BatchCapExecutor`: render pending members as checkboxes (done members shown checked+locked with their op link), a per-member volume input (optional; blank = auto fill-to-headroom), a loss field, note; "Complete N now" mints one `commandId` and calls `completeGroupRackBatchAction`; "Complete all remaining" selects every pending member. Show the derived progress ("4 of 10 done") and headroom from Unit 2. Controlled inputs: use click+type per the CLAUDE.md QA note; native selects/checkboxes are fine.
**Tests:** manual/QA (repo has no jsdom/RTL — assistant/exec UI ships manual-QA-only per house rule); logic is covered by Units 1/3/7.
**Depends on:** Units 2, 3, 4.
**Verification:** `npx next build` (client/server boundary); browser QA in Unit 7.

### Unit 6: WO detail-page member progress

**Goal:** A group-rack task on the detail page shows its members + progress instead of looking like a plain rack.
**Files:** `src/app/(app)/work-orders/[id]/WorkOrderDetailClient.tsx`.
**Approach:** When a task has a `groupRack` view block (Unit 2), render the parent summary + a collapsed member list with done/pending badges (reuse the progress DTO). Small, read-only.
**Tests:** manual/QA.
**Depends on:** Unit 2.
**Verification:** `npx next build`; browser QA.

### Unit 7: e2e + gates

**Goal:** Prove the full progressive lifecycle against the live DB and keep every gate green.
**Files:** `scripts/verify-work-orders-transform.ts` (extend), optionally a focused `scripts/qa-group-rack-progressive.ts` seeder for browser QA.
**Approach:** Add a progressive barrel-down section: seed a source tank + 10 barrels; complete a batch of 4 → assert 4 barrels filled, source drawn by that amount, ONE op written, task `IN_PROGRESS`, 6 pending; complete the remaining 6 → assert task `PENDING_APPROVAL`, source drained, a SECOND op; duplicate the first batch's `commandId` → no third op (idempotent); reject the latest batch LIFO → those members empty + source restored, task back to `IN_PROGRESS`; assert rejecting the non-latest batch is refused. Also a rack-to-tank progressive case (2 source batches into one tank). Scrub all `ZZWT-*` fixtures.
**Tests:** the e2e assertions above.
**Depends on:** Units 3, 4.
**Verification:** `npm run verify:work-orders-transform`; then the full gate suite (below).

## Test Strategy

**Unit tests (vitest, node-env, pure logic):** member-progress projection (Unit 1); the data-view mapper (Unit 2); the batch-core status/idempotency guards via a focused test (Unit 3).
**Integration/e2e (MAIN checkout, `.env`, live Neon):** `verify:work-orders-transform` extended with progressive barrel-down + rack-to-tank + LIFO reject + idempotency (Unit 7).
**Manual browser QA (Demo Winery, in-app Claude browser per CLAUDE.md):** author a group barrel-down WO, complete 4 of 10, reload → 4 done / 6 pending; complete the rest → task moves to review; reject the last batch → members reopen. Prove DB writes with a `runAsTenant("org_demo_winery", …)` readback. Screenshots may hang — use `get_page_text`/`read_page`; controlled text inputs need click+type.
**Full gate suite before PR:** `npx tsc --noEmit`, `npx eslint` (changed files), `npx next build`, `npm run verify:work-orders`, `npm run verify:work-orders-transform`, `npm run verify:work-orders-enhancements`, `npm run verify:tenant-isolation`, `npm run verify:naming`, `npm run verify:invariants`, `npm run eval:assistant`, full `npx vitest run`.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LIFO reversal blocks a mid-history batch reject | MED | MED | Design reject as LIFO-only and surface it in the UI (disable undo on non-latest batches with the ledger's own reason). Matches `laterTouchedKeys`; do not fight the guard. |
| Relaxing the `execute.ts:308-310` terminal guard weakens the double-write protection for normal tasks | LOW | HIGH | Scope the new accept-additional-batches path to the dedicated `completeGroupRackBatchCore`; leave `completeTaskCore`'s guard intact for every other task type. Per-batch `commandId` idempotency + the CAS still prevent double-writes. |
| Concurrent batches race on the shared source | LOW | MED | `runLedgerWrite` is SERIALIZABLE + retry; the task CAS on `(status, currentAttemptId)` serializes; a losing batch retries or gets a clean CONFLICT. |
| Source volume changed between batches so remaining members don't fit | MED | LOW | `groupRackTx` plans against current state and throws the existing friendly capacity error; the batch fails cleanly, nothing partial is written. |
| Approve/reject rework regresses single-op group-rack (9.4a) or single-vessel RACK | MED | HIGH | Keep the one-shot path working ("batch = all members"); Unit 7 asserts a single-batch group-rack still completes+reverses exactly as 9.4a; keep `verify:work-orders`/`transform` green. |
| UI ships without automated coverage (no jsdom/RTL) | MED | MED | Logic lives in pure cores (Units 1/3/4) with unit + e2e coverage; UI is thin and manually QA'd; `next build` guards the boundary. |

## Success Criteria

- [ ] A group-rack task accepts multiple completion batches; each writes one balanced RACK op over its subset; the source draws down incrementally.
- [ ] The task stays `IN_PROGRESS` until the last member; then `PENDING_APPROVAL` (or `APPROVED` when auto-finalize).
- [ ] Per-batch `commandId` idempotency: a duplicate submit writes no second op.
- [ ] Reject reverses the latest batch's op and reopens exactly its members; non-latest reject is refused LIFO; full reject reverses all batches LIFO.
- [ ] The execute screen shows done/pending members + "complete N now" + "complete all remaining"; the detail page shows member progress.
- [ ] A single-batch (all members at once) group-rack still behaves exactly as 9.4a (no regression).
- [ ] NL/assistant group-rack authoring unchanged.
- [ ] `verify:work-orders-transform` extended and green; all gates green; `next build` clean.
- [ ] No new table / migration / RLS surface.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Grounded in the 9.4a deferral; research corrected the "needs schema" premise. |
| Scope Boundaries | HIGH | Clean in/out; no migration; other task families excluded. |
| Implementation Units | MEDIUM-HIGH | Units 1-3 are well-understood; Unit 4 (approve/reject rework) is the subtlest — touches shared `approval.ts`, mitigated by keeping the one-shot path intact + LIFO. |
| Test Strategy | HIGH | Extends the existing `verify:work-orders-transform` e2e harness; pure cores unit-tested. |
| Risk Assessment | HIGH | Main risks (LIFO reject, guard relaxation, concurrency) identified with concrete mitigations. |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT:** NO REVIEWS YET -- run `/autoplan` for full review pipeline, or individual reviews above.
