---
title: Consolidate multi-vessel maintenance work orders — one task with N members, not one task per vessel
type: feat
status: completed
date: 2026-07-12
branch: claude/multi-vessel-work-orders-a650e5
depth: deep
units: 5
completion_model: all-at-once
---

## Overview

Authoring "clean barrels B1–B4" today produces **four near-identical task rows** on the work order (plan 060 / PR #155 fans a `vesselGroup` out to one record-only task per barrel). A winemaker filed feedback (`cmrih6g1k0001kz047ap40uox`, Demo Winery) asking for the opposite: **one task per operation across the range**. This plan collapses the fan-out into a single reviewable maintenance task that carries N member vessels in its payload — mirroring the existing group-rack "one task, N members" model — while still writing one record-only `VesselActivityEvent` per barrel at completion (WORKORDER-3 unchanged).

## Problem Frame

**Who:** cellar crews and winemakers authoring routine barrel maintenance (clean / sanitize / steam / SO₂ / gas / ozone / wet-storage) across a barrel range or saved group.

**The problem:** "Clean B1–B60" spawns 60 task rows. That is unreviewable — you cannot scan the work order and see "clean these 60 barrels" as one intent, and it inflates the task count against `NL_WORK_ORDER_MAX_TASKS` (25). This is exactly the failure mode the group-rack plan (050 / Phase 9.4a) called out and permanently banned for barrel-down: *"Each must remain one reviewable work-order task (not 10/20/60 near-identical rows)... per-barrel WO-task fanout (never)."*

**Why it exists:** plan 060 deliberately chose per-barrel fan-out, with the documented rationale *"Maintenance has NO ledger op (WORKORDER-3); a group-op wrapper would be dead weight."* That reasoning is correct **for a group-op wrapper** — there is no balanced ledger operation to consolidate. But it conflated "one op" with "one task." The winemaker is not asking for one op; they are asking for **one reviewable task**. Those are separable: a task can carry N members in JSON and still write N independent record-only events at completion, with zero ledger op. Group-rack already proves the pattern.

**If we do nothing:** the freshly-shipped group-maintenance authoring feature is actively annoying at real barrel counts, and the two multi-vessel models (group-rack consolidates, maintenance fans out) stay inconsistent — a maintenance trap for anyone extending either path. **And it is not just clutter: fan-out is capped.** `NL_WORK_ORDER_MAX_TASKS` is 25 (`nl-proposal.ts:8`), so "clean B1–B60" (60 fanned tasks) is **rejected outright today**. Consolidation is the only way to author a large-range maintenance WO at all — a functional gap, not just a cosmetic one.

## Requirements

- MUST: a `vesselGroup` maintenance intent produces **one** `WorkOrderTask` (not N), carrying the resolved member set (ids + codes) in `plannedPayload`.
- MUST: at completion, **each member still gets its own record-only `VesselActivityEvent` + overhead `VesselActivitySupplyUse`** — WORKORDER-3 preserved per barrel (no `SupplyConsumption`, no `CostLine`, no `LotOperation`).
- MUST: overhead depletion draws `amount` **per member** (preserving today's total-stock behavior: N barrels × per-barrel dose), never negative, shortfall surfaced softly (E1).
- MUST: per-member completion is idempotent — distinct command ids per member so a retry or partial completion cannot double-write or collide on `VesselActivityEvent.commandId`.
- MUST: a single-vessel maintenance intent (`vessel`, no `vesselGroup`) is **unchanged** — one plain maintenance task, no member payload, existing completion path.
- MUST: the proposal review card shows one row with an expandable member list (the existing `members[]` renderer).
- MUST: **all-at-once completion** — one action completes every member of the range in a single transaction; the task goes straight to DONE (no partial/IN_PROGRESS state). Undo reverses all N member events together.
- SHOULD: authoring stays inside `NL_WORK_ORDER_MAX_TASKS` regardless of member count (one task per operation, members are not tasks).
- NICE (deferred): progressive batch completion (subset now, rest later). Chosen against at the plan gate — the complaint is review clutter, which all-at-once fully resolves. Revisit only if crews report needing partial completion.
- NICE: the same one-task-N-members treatment for other per-vessel fan-outs (CAP_MGMT, TOPPING, ADDITION across barrels). **Explicitly deferred** — see Out of scope.

## Scope Boundaries

**In scope:**
- The 7 maintenance kinds that already accept `vesselGroup`: `CLEAN`, `SANITIZE`, `STEAM`, `OZONE`, `GAS`, `SO2`, `WET_STORAGE`.
- Authoring (NL → one task), completion (one task → N events), progressive batch completion + LIFO undo, the execute sub-form, the proposal card, evals/verify, and the docs/invariant note.

**Out of scope:**
- `TEMP_SETPOINT` group authoring (it has no `vesselGroup` alias today; a setpoint is typically per-vessel and cheap — not part of the complaint).
- `ADDITION` / `FINING` / `TOPPING` / `CAP_MGMT` multi-vessel consolidation. These either write a **ledger op** (additions capitalize into wine COGS per lot) or fan across N distinct lots, so "one task, N members" is a different, harder problem (closer to group-rack's balanced-op model, one op per lot). Their fan-out goldens (`assistant-write-tools.golden.ts:398,413-427`) stay as-is. Revisit as a follow-on plan once the maintenance model is proven.
- Any schema change. The member set rides in `plannedPayload` JSON exactly like `groupRack` — **no migration, no new table, no RLS change** (matches plan 054's "derive from attempts, never a `work_order_task_member` table").
- `EQUIPMENT_SERVICE` (services equipment assets, not vessels — a separate lane in `maintenance.ts:38-75`).

## Research Summary

### Codebase Patterns

**The fan-out to replace** — `src/lib/work-orders/nl-resolve.ts:589-627`. The maintenance branch resolves members via `resolveGroupMembers(intent.vesselGroup)` (`nl-resolve.ts:142`, wrapping `expandVesselRange` + `resolveGroupByName`), then loops `for (const vessel of members)` (line 613) pushing one `taskBuild` per barrel. `amount` and other dose fields are group-wide `sharedCandidate` copied verbatim into each task.

**The exact model to mirror — group-rack "one task, N members"** (`BARREL_DOWN` / `RACK_TO_TANK`):
- **Authoring** `nl-resolve.ts:442-491`: builds ONE `taskBuild` with `taskType: "GROUP_RACK"` and a `values.groupRack = { direction, sourceVesselId|destVesselId, destVesselIds|sourceVesselIds: [...], memberCodes: [...] }` block; pushes a proposal `tasks[]` row carrying `members: members.map(m => ({ id, label, detail }))`.
- **Persistence** `template-vocabulary.ts:428-460` (`instantiateTaskBuilds`): member arrays live **only in `plannedPayload` JSON**; there are no member columns. `canonicalColumns()` (`:375-392`) mirrors just the single scalar anchor (`sourceVesselId`/`destVesselId`). The downstream discriminator everywhere is **presence of `plannedPayload.groupRack`**.
- **Progress projection** `src/lib/work-orders/group-rack-progress.ts:72-127` (`deriveGroupRackProgress`): pure/DB-free; completed members = union of `actualPayload.groupRackBatch.memberVesselIds` across all **live (non-REJECTED)** attempts; returns `completedVesselIds`, `pendingVesselIds`, `allMembersDone`, `latestBatchAttemptId` (LIFO target).
- **Member selection** `group-rack-select.ts:29-65` (`selectGroupRackMembers`): resolves "B101-B104" / a list / "the rest" against pending members.
- **Batch completion** `execute.ts:496-618` (`completeGroupRackBatchCore`): writes the batch, records `actualPayload.groupRackBatch = { memberVesselIds, ... }`, keeps task `IN_PROGRESS` until the last member lands (CAS on `(status, currentAttemptId)`), releases reservations only when whole task done.
- **LIFO undo** `approval.ts:350-403` (`rejectGroupRackBatchCore`): reverses the latest live batch, marks its attempt `REJECTED`, members return to pending.
- **Execute dispatch** `execute.ts:62-124`: `parseGroupRackPayload(payload)` returns non-null → group path; else single-vessel. UI routing `ExecuteClient.tsx:295`: `t.kind === "OPERATION" && t.opType === "RACK" && t.groupRack` → `<GroupRackTaskForm>`.
- **View assembly** `data.ts:183-238`: builds `GroupRackTaskView` from the progress projection (per-member fill/headroom/done).
- **Proposal card** `AssistantChat.tsx:1194-1209`: already renders any proposal task's `members[]` as one row with a `<details>` expander ("{n} vessels"). **No change needed** — the consolidated maintenance task just needs to carry `members[]`.

**The completion primitive** — `src/lib/work-orders/vessel-activity.ts:104-142` (`recordVesselActivityTx`): writes exactly one `VesselActivityEvent` for `input.vesselId` + (if `materialId`+positive `amount`) one overhead depletion (`VesselActivitySupplyUse` per lot, decrement to zero, shortfall reported). Idempotency is on **DB uniqueness of `VesselActivityEvent.commandId`** — so calling it N times in one tx requires **distinct per-member command ids** (e.g. `${commandId}:${vesselId}`) or it collides. Reversal `reverseVesselActivityTx:149-194` is per-event → undo of a consolidated task reverses N events.

**Current single-vessel completion** — `src/lib/work-orders/maintenance.ts:77-160` (`completeMaintenanceTaskCore`): reads a single scalar `vesselId = task.destVesselId ?? task.sourceVesselId ?? merged.vesselId` (line 78) and writes one event. This path must branch on `plannedPayload.groupActivity` presence **before** line 78 (a group task has no single anchor vessel) — exactly how `execute.ts` branches on `groupRack`.

### Prior Learnings

- **Plan 060** (`docs/plans/2026-07-12-060-...-plan.md`, shipped PR #155): chose per-barrel fan-out; declined a **group-op wrapper** because maintenance has no ledger op. This plan does **not** build a group-op wrapper; it builds a one-*task*-N-*members* model with N record-only events. The 060 rationale does not preclude that — its own out-of-scope line targets "a grouped single-**op** model."
- **Plan 050 / Phase 9.4a**: "ONE `LotOperation`, many balanced lines. No schema change." Establishes the reviewability principle (never N task rows) and the payload-JSON member pattern.
- **Plan 054 / Phase 9.4b** (shipped PR #134): progressive batch completion, per-member state **derived from attempts** (no member table), LIFO reject. The template for this plan's completion model.
- **WORKORDER-3** (`docs/architecture/invariants/WORKORDER-3-maintenance-supply-is-overhead.md`): maintenance supply is overhead (VesselActivitySupplyUse only, never SupplyConsumption/CostLine/LotOperation). Expressed **per-task/per-supply-use, not per-vessel** — consolidation is compatible as long as each member still writes its own event + overhead-only use. Guard: `npm run verify:work-orders-enhancements`; the auto-context hook trips on edits to `vessel-activity.ts` and `maintenance.ts`.
- **Build/CI convention** (memory): build in the MAIN checkout `C:\Users\russe\Documents\Wine-inventory` (has `.env` for DB-backed `verify:*`), not this worktree; `check` CI does not run `next build`, so run `npx next build` locally for the new client form. Fixes to `src/lib/work-orders/*` are **outside** the assistant feedback auto-fix fence → ship as a normal human-reviewed PR.
- **D26/H8 eval-coverage** is a HARD CI gate: every assistant write-tool path needs a golden; `docs/architecture/assistant-coverage.md` is generated — do not hand-edit.

### External Research
None required — this is an internal refactor onto an existing, shipped pattern.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Task model | **One task, N members in `plannedPayload.groupActivity`** (mirror `groupRack`) | (a) keep per-barrel fan-out; (b) group-op wrapper | (a) is the complaint; (b) was rightly rejected by 060 (no ledger op). One-task-N-members needs no op and no schema. |
| Where members live | `plannedPayload.groupActivity = { activityType, memberVesselIds, memberCodes }` (JSON) | dedicated columns / `work_order_task_member` table | Exact `groupRack` pattern; no migration, no RLS, progress derives from attempts (plan 054). |
| Per-member events | Loop `recordVesselActivityTx` per member, one event each, `amount` per member | one event referencing the group | Preserves WORKORDER-3 per barrel + per-barrel stock depletion (today's behavior). |
| Idempotency | Per-member command id `${commandId}:${vesselId}` | reuse one commandId for all | `VesselActivityEvent.commandId` is unique → reuse collides; per-member keys also enable partial/batch. |
| **Completion granularity** | **All-at-once** (one tx completes every member; task → DONE; undo reverses all) — *chosen at gate* | progressive batches + LIFO undo (full group-rack parity) | All-at-once fully satisfies the complaint (kills the row clutter) at ~40% the surface area. No progress projection, no batch/subset UI, no LIFO. Progressive was rejected as over-build for a review-clutter complaint; can be added later without reworking the authoring/payload model. |
| `amount` semantics | Per-vessel dose (each barrel depletes `amount`) | total-across-group split N ways | Matches today (each fanned task depletes `amount` once) and the natural reading ("X sanitizer per barrel"). |
| Single-vessel path | Unchanged (no `groupActivity`, existing completion) | route everything through the group path | Zero-risk for the common case; group path is additive. |
| Member vessel columns | Leave `sourceVesselId`/`destVesselId` **null** on a group task; members live only in `groupActivity` JSON | anchor to first member; add a member join table | Matches group-rack. **Known tradeoff (review finding):** a null-column task does not appear on any member's *pre-completion* vessel timeline (`timeline-data.ts:208-209` matches by column). Post-completion the per-member events DO show. Anchoring to one member is misleading. Making the timeline query group-aware is a NICE follow-on (Unit 4). |
| Undo scope | Build a **new** maintenance reject path (none exists) | "extend the existing maintenance undo" | Review finding: `reverseVesselActivityTx` is currently dead code and `rejectTaskCore` throws for a DONE maintenance task. Undo is net-new, not an extension — see Unit 3. |

## Implementation Units

### Unit 1: Consolidated authoring — one maintenance task with a member payload

**Goal:** A `vesselGroup` maintenance intent emits ONE `taskBuild` carrying the resolved member set, instead of N taskBuilds.
**Files:** `src/lib/work-orders/nl-resolve.ts` (maintenance branch ~589-627), `src/lib/work-orders/nl-proposal.ts` (proposal task shape / payload typing), `src/lib/work-orders/template-vocabulary.ts` (accept + sanitize the `groupActivity` payload block for the maintenance vocab entries).
**Approach:** Replace the `for (const vessel of members)` loop (`nl-resolve.ts:613-625`) with a single `taskBuilds.push({ taskType: intent.kind, title: "${verb} ${firstCode}…${lastCode} (${n} barrels)", values: { groupActivity: { activityType: intent.kind, memberVesselIds, memberCodes }, ...sharedCandidate }, taskKey })` and one proposal `tasks[]` row carrying `members: members.map(m => ({ id, label, detail }))`. Keep the single-vessel branch (no `vesselGroup`) exactly as-is: one plain task with `vesselId`, no `groupActivity`. Mirror the `groupRack` block at `nl-resolve.ts:442-491`.
**GOTCHA (review finding):** the current authoring loop filters `values` to `k in fields` (`nl-resolve.ts:614-615`), and `groupActivity` is not a declared field on any maintenance def — so a naïve copy **silently drops the member payload**. Build `values` so `groupActivity` bypasses that filter (add it after the filter, like `groupRack` is assembled). Note `sanitizeTaskPayload` is NOT the constraint: maintenance defs are governed built-ins (not `isUserDefined`), so it keeps non-reserved keys (`payload-guard.ts:39`) exactly as it keeps `groupRack`. `canonicalColumns` needs no change — leave `sourceVesselId`/`destVesselId` null for a group task (see Key Decisions; members are JSON-only).
**Tests:** unit test in `test/work-order-nl-proposal.test.ts` — a `{kind:"CLEAN", vesselGroup:"B1-B4"}` intent yields `taskBuilds.length === 1` with `plannedPayload.groupActivity.memberVesselIds.length === 4`; two kinds (CLEAN+SANITIZE) over the same range → 2 builds (not 6); single vessel → 1 build with no `groupActivity`.
**Depends on:** none
**Patterns to follow:** `nl-resolve.ts:442-491` (group-rack authoring), `verify-universal-work-order-authoring.ts:157-167` (one-task-N-members assertion shape).
**Verification:** `npx tsx scripts/verify-work-order-nl.ts` after Unit 6 updates its assertions; unit test green.

### Unit 2: All-at-once completion core — N record-only events, one task → DONE

**Goal:** Completing a group maintenance task writes one `VesselActivityEvent` per member in a single transaction and takes the task straight to DONE.
**Files:** `src/lib/work-orders/maintenance.ts` (branch on `plannedPayload.groupActivity` **before** the single-vessel `vesselId` resolution at line 78); `src/lib/work-orders/execute.ts` (route a group maintenance completion to it — the dispatch already funnels maintenance tasks through `completeMaintenanceTaskCore`; add the group branch there).
**Approach:** In `completeMaintenanceTaskCore`, if `plannedPayload.groupActivity` is present, read `memberVesselIds`, then **dedup and sort them deterministically** (review finding — dedup avoids a `${commandId}:${vesselId}` self-collision if a member repeats; sorting gives a stable `SupplyLot` lock order so two concurrent completions touching overlapping vessels can't deadlock). In ONE `runInTenantTx` (Serializable, matching today's maintenance tx), loop `recordVesselActivityTx` once per member with `commandId: ${input.commandId}:${vesselId}` (distinct per member — `VesselActivityEvent.commandId` is a global `@unique`, confirmed `schema.prisma:3593`; the base is a colon-free UUID so suffixes are collision-free), `amount` applied **per member** (per-vessel dose), and kind/targetUnit/targetValue derived exactly as `maintenance.ts:83-93` does today. **Validate each member is still an active vessel before the loop** and skip-with-warning any that were decommissioned/deleted between authoring and completion (review finding — no FK on the JSON member ids, so a stale id would otherwise crash the whole tx). Record the member set on the attempt's `actualPayload.groupActivity = { memberVesselIds }` (share ONE attempt; events hang off it via `attemptId`) for audit + undo. Task → DONE in one CAS update on `(status, currentAttemptId)`; bump WO rollup once. Aggregate per-member shortfalls into one soft warning (E1). Task-level idempotency stays on the attempt `commandId` pre-check (`execute.ts:301` / P2002 handling — `WorkOrderTaskAttempt.commandId` is global `@unique`, confirmed `schema.prisma:3545`); the per-member suffix guards the individual events. No IN_PROGRESS state — all members land together. **Member cap:** confirm `expandVesselRange` (`vessels/range.ts:33`, `MAX_RANGE`) actually bounds the set so "clean B1–B999" can't push hundreds of events into one tx; if the cap is generous, surface a soft limit at authoring.
**Tests:** e2e via `runAsTenant("org_demo_winery", …)` (Unit 5 script) — completing a 4-member CLEAN task writes exactly 4 `VesselActivityEvent`s, task DONE, each event overhead-only (no `CostLine`/`SupplyConsumption`/`LotOperation`); total supply depletion == 4 × per-barrel dose; re-submitting the same `commandId` is an idempotent no-op.
**Depends on:** Unit 1
**Patterns to follow:** `maintenance.ts:99-160` (the single-vessel tx to generalize), `vessel-activity.ts:104-142` (`recordVesselActivityTx`), `execute.ts:327-332` (idempotency).
**Verification:** `npm run verify:work-orders-enhancements` (WORKORDER-3 guard) + the Unit 5 e2e script.

### Unit 3: Build the maintenance undo path, then make it reverse all N member events

**Goal:** Rejecting/undoing a completed group maintenance task reverses every one of its member events.
**⚠️ Review finding — this is NET-NEW, not an extension.** There is no working maintenance-reject path today: `reverseVesselActivityTx` (`vessel-activity.ts:149-194`) is **dead code** (its only callers are a verify script + docs), and `rejectTaskCore` **throws** for a DONE maintenance task — an APPROVED maintenance attempt has `operationId: null` (`maintenance.ts:108`), which falls into the `!attempt.operationId` block (`approval.ts:261-273`) that only handles `HARVEST_WEIGH_IN`. So the group-rack reject is the WRONG primitive to mirror (`liveGroupRackBatches` filters `operationId != null`; it reverses ledger ops, which maintenance has none of). Budget this as building the maintenance undo, not generalizing one.
**Files:** `src/lib/work-orders/approval.ts` (add a maintenance branch to the `!attempt.operationId` block in `rejectTaskCore`, ~261-273).
**Approach:** In that branch, when `task.kind === "MAINTENANCE"` and status `DONE`: look up the task's live events by `vesselActivityEvent.findMany({ where: { taskId, attemptId, voidedAt: null } })` (by `attemptId`/`taskId` — both indexed — NOT a `${commandId}:*` scan, which has no index), loop `reverseVesselActivityTx` per `eventId` in one tx (it claims-then-voids idempotently), mark the attempt `REJECTED`, return the task to its pre-completion status. One attempt covers all members (no batch/LIFO). Auth mirrors the existing reject (admin, or the recorder self-undo). This also fixes a latent bug: single-vessel maintenance tasks are un-rejectable today.
**Tests:** e2e in the Unit 5 script — complete a 4-member task, undo it, assert all 4 events voided and the task back to pre-completion; ALSO prove single-vessel maintenance undo works (net-new behavior, so assert it, don't assume it).
**Depends on:** Unit 2
**Patterns to follow:** `approval.ts:261-273` (the block to extend), `vessel-activity.ts:149-194` (`reverseVesselActivityTx`, currently uncalled in prod). Do NOT mirror `rejectGroupRackBatchCore` (ledger-op reversal, wrong primitive).
**Verification:** Unit 5 e2e script.

### Unit 4: View assembly + execute form + proposal card

**Goal:** The winemaker sees one task with its member list, completes the whole range in one action, and can undo.
**Files:** `src/lib/work-orders/data.ts` (build a `groupActivity` view block from `plannedPayload`, ~mirror `:183-238` but static — members + count, no progress projection); `src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx` (routing at `:295`, add a `kind==="MAINTENANCE" && task.groupActivity` branch); new `src/app/(app)/work-orders/[id]/execute/GroupMaintenanceTaskForm.tsx` (a simplified clone of `GroupRackTaskForm.tsx`); server-action wiring for complete + undo. Proposal card `AssistantChat.tsx:1194-1209` — **no change** (renders `members[]` already); confirm.
**Approach:** `data.ts` emits `groupActivity = { members: [{ vesselId, code }], count }` on `WorkOrderTaskView`. The form lists the members read-only and offers one primary action — "Complete all N barrels" — plus an "Undo" affordance once done. No subset checkboxes, no batch progress (all-at-once). Reuse the design tokens + layout from `GroupRackTaskForm.tsx` (do not hardcode colors — DESIGN.md).
**⚠️ Review finding — the "Undo once done" control is NET-NEW UI + a new server action.** The execute screen renders DONE tasks as read-only badges today (`ExecuteClient.tsx:305-314`); there is no per-task undo control for any task. This is not a `GroupRackTaskForm` clone for the undo half — budget a new server action wired to Unit 3's reject path and a new UI affordance. (Alternatively, route undo through the existing vessel History / timeline reject surface and skip the execute-screen control — decide in Unit 4; the History surface already exists.)
**NICE (deferred, review finding):** make the vessel-timeline query (`timeline-data.ts:208-209`) group-aware so a pre-completion group maintenance task shows on each member's History (today, null columns → it shows on none). Not required for the complaint; the post-completion events already show per barrel.
**Tests:** manual browser QA against the MAIN-checkout dev server (Demo Winery, `QA-*` barrels) — author "clean B1–B4", see one task + 4-member expander in the proposal, commit, open execute, "Complete all 4" → DONE, undo → reversed. Repo has no jsdom/RTL, so the form ships manual-QA-only; pure logic is covered by the e2e script.
**Depends on:** Unit 2, Unit 3
**Patterns to follow:** `GroupRackTaskForm.tsx`, `data.ts:183-238`, `ExecuteClient.tsx:295`.
**Verification:** browser QA per CLAUDE.md UI-QA setup; `npx next build` in the main checkout (client form imports from `src/lib`).

### Unit 5: Evals, verify scripts, docs + invariant note

**Goal:** Flip every assertion that hard-codes per-barrel fan-out, add coverage for the consolidated model, and record the decision.
**Files:** `scripts/verify-work-order-nl.ts:225-242` (6→2 builds; assert `groupActivity.memberVesselIds` arrays; keep single-vessel = 1 task); new `scripts/verify-group-maintenance.ts` (e2e: author → commit → complete-all → assert N events overhead-only + total depletion → undo → assert all N reversed) wired as `npm run verify:group-maintenance`; `test/evals/assistant-write-tools.golden.ts:257` (reword the "fans to one task per barrel" note; args unchanged); `src/lib/assistant/tools/propose-work-order.ts:307,336` (reword the tool + `vesselGroup` descriptions to "one consolidated task across the range"); `docs/architecture/invariants/WORKORDER-3-*.md` (add a line clarifying it holds per member of a consolidated task); `docs/plans/2026-07-12-060-...-plan.md` (add a "superseded-by-061" note on the fan-out decision) and a short ADR under `docs/architecture/decisions/` recording task-vs-op consolidation; regenerate `docs/architecture/assistant-coverage.md` if the tool surface changed (do not hand-edit).
**Approach:** Follow each file's existing assertion style. Add a golden that asserts the consolidated authoring (one task, member array) so D26/H8 coverage stays green.
**Tests:** the two verify scripts are the tests.
**Depends on:** Unit 1, Unit 2, Unit 3
**Patterns to follow:** `verify-universal-work-order-authoring.ts:157-167` (one-task-N-members shape), `verify-barrel-groups.ts`.
**Verification:** `npm run verify:work-order-nl`, `npm run verify:group-maintenance`, `npm run verify:work-orders-enhancements`, `npm run verify:ai-native`, `npm run verify:naming` (all from the MAIN checkout).

## Test Strategy

**Unit tests (node-env, pure):** `test/work-order-nl-proposal.test.ts` (consolidated authoring — task count + member array; single-vessel unchanged).
**Integration / e2e (DB-backed, `runAsTenant("org_demo_winery")`):** `scripts/verify-group-maintenance.ts` — full author → commit → complete-all → per-member event assertion (N events, overhead-only, WORKORDER-3, total depletion == N × dose) → undo → all-N-reversed assertion. Plus the flipped `scripts/verify-work-order-nl.ts`.
**Manual verification:** browser QA on the MAIN checkout dev server (Demo Winery, `QA-*` barrels) per Unit 4 — the proposal card one-row-with-member-expander, the one-task review, complete-all, and undo. Confirm `verify:naming` green before and after; clean up `QA-*` fixtures.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Per-member `commandId` collision on `VesselActivityEvent.commandId` | LOW | HIGH | **Confirmed safe by review:** the column is global `@unique` (`schema.prisma:3593`), UUID base is colon-free → `${commandId}:${vesselId}` suffixes never collide. Dedup members to avoid a repeated-id self-collision; e2e retry test. |
| **Undo is net-new, mis-scoped as an extension (severe review finding)** | HIGH | MED | `reverseVesselActivityTx` is dead code; `rejectTaskCore` throws for maintenance. Unit 3 reframed to BUILD the path; do it (and prove single-vessel undo) before wiring the UI. |
| Consolidated task drops off member vessel timelines pre-completion | MED | LOW | Documented tradeoff (matches group-rack). Post-completion events still show per barrel. Group-aware timeline query is a NICE follow-on (Unit 4). |
| A member vessel is decommissioned/deleted between authoring and completion (no FK) | LOW | MED | Validate members at completion; skip-with-warning stale ids rather than crash the tx (Unit 2). |
| Concurrent completions on overlapping ranges deadlock on shared `SupplyLot` | LOW | MED | Sort `memberVesselIds` deterministically before the loop (Unit 2). |
| WORKORDER-3 regression (a group task routing supply through wine COGS) | LOW | HIGH | Each member writes only `VesselActivityEvent` + `VesselActivitySupplyUse`; `verify:work-orders-enhancements` gate; auto-context hook trips on `maintenance.ts`/`vessel-activity.ts` edits. |
| Single-vessel path accidentally broken by the branch change | LOW | MED | Group path is additive, keyed on `groupActivity` presence; keep the single-vessel branch untouched; existing single-vessel goldens must stay green. |
| `amount` semantics drift (total vs per-vessel) changes stock behavior | MED | MED | Lock per-vessel dose in Unit 2; e2e asserts N barrels × dose total depletion equals today's fan-out total. |
| Large ranges make "complete all" write many events in one tx (e.g. B1–B60 = 60 events) | LOW | MED | Serializable tx already used for maintenance; bound member count by the same range guard as group-rack (`expandVesselRange`); if needed, cap and surface. |
| Fan-out precedent in sibling features (ADDITION/TOPPING/CAP_MGMT) creates inconsistency | LOW | LOW | Explicitly out of scope + noted as a follow-on; their goldens untouched. |

## Success Criteria

- [x] "clean and sanitize B1–B4" produces exactly **2** tasks (one CLEAN, one SANITIZE), each carrying 4 members — verified by `verify:work-order-nl` (54 assertions).
- [x] A single-vessel "clean T15" still produces one plain task, unchanged.
- [x] Completing a group maintenance task writes one `VesselActivityEvent` per member, each overhead-only (no `CostLine`/`SupplyConsumption`/`LotOperation`) — `verify:group-maintenance` (21) + `verify:work-orders-enhancements` (44) green.
- [x] Total overhead stock depletion for a consolidated task equals the pre-change per-barrel fan-out total (N × dose).
- [x] Completing the task writes all N member events in one action, task → DONE; undo reverses all N (and single-vessel maintenance is now rejectable — a latent bug fixed).
- [x] Proposal card shows one row + member expander (existing `members[]` renderer); execute screen drives complete-all + undo.
- [x] `verify:ai-native`, `verify:naming` (25), `verify:invariants` (29) green; eval coverage unchanged (no new tool); `assistant-coverage.md` in sync.
- [x] All existing tests pass (32 unit); tsc 0 errors; `next build` clean; no regression in group-rack or single-vessel maintenance.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Council — Gemini | `/council` (ask_all) | Independent adversarial design review | 1 | ⚠️ CHANGES | 5 findings; verdict RECONSIDER (keep DB fan-out, fix at UI). See below. |
| Council — Codex | `/council` (ask_all) | Independent 2nd opinion | 1 | ❌ FAILED | Codex CLI errored in the worktree sandbox (known gotcha — run from MAIN checkout). |
| Eng Review | Plan agent w/ repo access | Architecture & correctness vs. actual code | 1 | ⚠️ CHANGES | 1 SEVERE + 2 MED + 2 LOW; verdict BUILD WITH CHANGES. See below. |

**Eng review (code-verified) — folded into the plan:**
1. SEVERE — no working maintenance-reject exists (`reverseVesselActivityTx` dead, `rejectTaskCore` throws for maintenance). **Unit 3 reframed** to build it net-new.
2. MED-HIGH — null vessel columns drop the task from member timelines pre-completion. **Documented as a Key Decision + risk**; group-aware timeline is a NICE follow-on.
3. MED — undo event lookup must be by `attemptId`/`taskId`, not `${commandId}:*`. **Specified in Unit 3.**
4. LOW-MED — N events in one Serializable tx: member cap + deterministic sort. **Added to Unit 2.**
5. LOW — the `k in fields` authoring filter silently drops `groupActivity`. **Called out as the Unit 1 gotcha.**
- Confirmed safe: both `commandId` columns are global `@unique`; per-member suffix scheme is sound; `amount`-per-member preserves today's stock behavior.

**Council (Gemini) — considered:**
- Deadlock ordering + member dedup → **folded into Unit 2.**
- Dangling-member (no FK) → **folded into Unit 2** (validate/skip).
- Verdict RECONSIDER ("keep fan-out, group at the UI"): **noted, not adopted.** It does not satisfy the actual complaint (still N DB tasks, still blows `NL_WORK_ORDER_MAX_TASKS=25` for large ranges) and contradicts the shipped group-rack house pattern; the code-aware eng review confirms the one-task model is buildable and sound.

**VERDICT:** BUILD WITH CHANGES — all code-verified findings folded in. Full scope chosen (incl. undo).

### Pre-landing `/review` (post-build, on the committed diff)

Two independent Claude specialists (correctness/concurrency/tenancy + adversarial red-team) reviewed the real diff. Codex skipped (worktree sandbox). No P0. Findings + resolutions:

- **[P1] Missing tx timeout** on completion + undo (Prisma 5s default) → a large range would time out and become uncompletable. **Fixed:** raised `timeout` to 120s on both txns AND capped a group maintenance task at **60 members** at authoring (`GROUP_MAINTENANCE_MAX_MEMBERS`; bigger ranges get a "split" message). *User decision: cap at 60.*
- **[P2] Undo was broken** — errored for the cellar hand who did the work (approver-only) and left a dead-end REJECTED task (REJECTED→DONE illegal). **Fixed (user decision: rework):** new `undoMaintenanceTaskCore` — self-undo (recorder) or admin, reverses all N events, **reopens to PENDING** (re-completable). Removed the maintenance branch from `rejectTaskCore`. Proven by `verify:group-maintenance` (undo → PENDING → re-complete → DONE).
- **[P2] Readiness cost/ATP under-reported the supply draw by N** (used per-vessel dose, completion draws N×). **Fixed:** `validateGroupActivity` returns the member count; the estimate scales `amount × N`.
- Verified sound (no change): atomicity (one Serializable tx, CAS rollback), idempotency (task-level `commandId` + per-member suffix), multi-tenancy (RLS-scoped reads), WORKORDER-3 (overhead-only, impossible to write CostLine/SupplyConsumption/LotOperation), dedup/inactive-member handling.

Post-fix gates: `verify:group-maintenance` 23 · `verify:work-order-nl` 54 · unit 32 · tsc 0 · `next build` clean.
Known non-e2e'd guard: the 60-member cap (would need 61 seeded vessels) — covered by code + tsc, not the e2e.
