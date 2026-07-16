---
title: Full work-order editing — reopen in the builder, save in place
type: feat
status: draft
date: 2026-07-15
branch: claude/work-order-full-edit
depth: deep
units: 8
status: completed
---

> **Build status (2026-07-15):** Units 1-8 built + committed on `claude/work-order-full-edit`. Every
> not-yet-executed task type edits fully in the builder EXCEPT the two GROUP types (barrel-down/rack,
> multi-vessel maintenance) — Unit 8 locks those read-only with a "recreate/reverse" message rather than
> risk a lossy round trip (the palette builder has no group authoring; their forms are execute-time). Full
> in-builder group editing is a documented follow-up. Green: tsc, vitest 2086, verify:work-orders 43
> (incl. WORKORDER-5+6), verify:invariants 32/32, verify:invariant-frontmatter 33, ai-native, `next build`.
> Follow-up: browser-QA the editor (no RTL/jsdom in repo).

## Overview

Make "Edit" on a work order reopen the whole thing in the same palette builder used to create it,
pre-populated with its current state, so an admin/developer can change any editable aspect (tasks, vessels,
materials, doses, per-task assignees, groups, add/remove tasks, title, instructions, Lead, due date,
priority, location, WO dependencies) and Save updates the existing WO in place — same id, number, and
history. This replaces the thin Lead + due-date edit card shipped in Plan 070 (PR #210, live), which the
user called "basically useless."

## Problem Frame

The winemaker builds a work order, then needs to fix it — wrong vessel, extra task, wrong dose, wrong
assignee. Today there is no way to change the tasks of an issued WO; the only "edit" is Lead + due date.
The natural mental model (confirmed by the user) is: Edit should take you back to the builder where you
made it, let you change everything, and save. Doing nothing leaves editing as cancel-and-recreate, which
loses the WO number, history, and any already-done work.

The ONE hard constraint (a domain rule, not a UI gap): a task that has already been **executed** wrote a
real, immutable ledger op (WORKORDER-1) — editing it would rewrite cost/TTB/inventory history. So executed
tasks are shown locked; you reverse them (existing lot-timeline Undo), you don't edit them. The user agreed
this is the only acceptable lock. Every **not-yet-executed** task must be editable, including the group
types.

On task types: crush / press / harvest weigh-in / bottling only *look* hard — their heavy fields (picks,
fractions, measured output, readings, bottle counts) are entered at EXECUTE, not authoring, so a PENDING one
carries only authoring fields and round-trips through the builder fine. The genuinely-hard ones are the two
GROUP types (group barrel-down/rack, group multi-vessel maintenance): their member-set payload isn't in the
generic `def.fields`, so the edit view renders each via its existing purpose-built authoring form (the
group-rack selector / GroupMaintenanceTaskForm) instead of the generic field renderer.

## Requirements

- **MUST:** Detail-page "Edit" (admin + developer) opens `/work-orders/[id]/edit` — the full builder,
  pre-populated with the WO's tasks/groups/fields/assignees/equipment + WO-level fields.
- **MUST:** Save updates the existing WO in place (same id/number/history); never creates a new one.
- **MUST:** Every **not-yet-executed** task is editable, whatever its type (generic-field types via the
  builder's field renderer; the two GROUP types via their own authoring forms). The ONLY locked case is a
  task that has been executed (an attempt with a ledger op) — shown read-only with a "reverse it to edit"
  note. (An unresolved/unknown taskType is also locked as a safety net.)
- **MUST:** Editing never mutates or deletes an executed task, its attempts, or its ledger op.
- **MUST:** On an ISSUED WO, editing re-syncs reservations for the changed pending tasks only (release +
  recreate per task); executed tasks' holds are untouched. WO keeps its status.
- **MUST:** Re-run the readiness gate server-side with the post-edit builds (same as create), honoring the
  readiness fingerprint for stale-state protection.
- **MUST:** Per-task reassignment works (it's part of full editing). Removing a pending task deletes it
  (cascade cleans reservations/equipment); adding a task creates a new PENDING task.
- **SHOULD:** WO-level fields (title, instructions, Lead, due, priority, location, dependencies) editable
  whenever the WO isn't APPROVED/CANCELLED, even if all tasks are locked.
- **SHOULD:** A `WORKORDER-6` invariant + verify guard: "editing a WO never mutates an executed task's op."
- **NICE / OUT:** In-builder editing of GROUP_RACK / group-maintenance / run-time-heavy types (locked for
  now, with a clear message). Reverting an executed task from the editor (that's the existing timeline Undo).

## Scope Boundaries

**In scope:** reverse-mapper (stored tasks → builder builds), `updateWorkOrderCore` +
`updateWorkOrderFromBuildsAction`, builder edit mode, `/work-orders/[id]/edit` route, detail-page entry,
per-task reservation re-sync, equipment set/detach, dependency diff, `WORKORDER-6` + verify.

**In scope (task types):** all not-yet-executed tasks — RACK, ADDITION, FINING, TOPPING, CAP_MGMT,
maintenance (single), observations (BRIX/PANEL/SAMPLE_PULL), NOTE/Custom-Log, CRUSH, PRESS,
HARVEST_WEIGH_IN, BOTTLE (authoring fields; pending only), **and** the GROUP types (group barrel-down/rack,
group multi-vessel maintenance) via their bespoke forms.

**Out of scope (and why):**
- Editing executed tasks (immutable ledger — reverse via the lot-timeline Undo instead).
- Editing the run-time data of crush/press/harvest/bottle (picks/fractions/readings/counts) — that's
  entered/edited on the execute screen, not authored in the builder; nothing to edit pre-execution.
- Changing a WO's status via the editor (status transitions stay in the lifecycle cores).
- Reworking "Cancel WO" (already exists; user confirmed "back out" means edit, not cancel).
- Schema changes (none needed).

## Research Summary

### Codebase Patterns
- **Forward mapping:** `instantiateTaskBuilds(builds, vocab)` — `src/lib/work-orders/template-vocabulary.ts:428`.
  `TaskBuild` `:401-424`; `canonicalColumns` `:375-392` derives the 5 columns
  (`sourceVesselId←fromVesselId/sourceVesselId`, `destVesselId←toVesselId/vesselId/destVesselId`,
  `lotId←lotId/parentLotId`, `materialId`, `blockId`) — the raw values still live in `plannedPayload`.
  `kind/opType/observationType/activityType` come from the vocab def, never the payload. `title||def.label`,
  `instructions` forced null. `sanitizeTaskPayload` (`payload-guard.ts:34-43`) strips reserved keys +
  (Custom-Log only) unknown fields.
- **Vocabulary:** `TASK_VOCABULARY` + `TaskTypeDef` `template-vocabulary.ts:17-39,89-308`;
  `resolveTaskVocabulary(tenantId?)` `vocabulary-resolver.ts:22-52` (merges tenant Custom Logs + overlays).
- **Reverse-map source of truth:** stored row keeps kind/discriminators + 5 columns + assigneeId + groupSeq
  + title + plannedPayload, but NOT the taskType key. Recover key via a reverse index on
  `(kind, opType|observationType|activityType)`; tiebreak RACK vs GROUP_RACK on `plannedPayload.groupRack`;
  NOTE vs Custom-Log on `__fieldSchema` match. `values = plannedPayload − {taskKey, __fieldSchema}`.
  Equipment via `WorkOrderTaskEquipment` (`actions.ts:213-221` attaches on create). Groups = group by
  `groupSeq`, order by `seq`.
- **Hydration model:** the NL path `resolveDraftToTaskBuilds` (`nl-resolve.ts:403-852`) →
  `draftWorkOrderFromTextAction` (`actions.ts:144-158`) → builder hydrates at
  `WorkOrderBuilderClient.tsx:283` (but drops groupSeq/assigneeId/equipmentIds — the edit hydrator must
  restore all three). `BuilderTask` shape at `WorkOrderBuilderClient.tsx:23`.
- **Reservations:** `src/lib/work-orders/reservations.ts` — per-task rows (`Reservation.taskId` always set;
  schema `prisma/schema.prisma:3766-3794`, task FK CASCADE). `reserveForWorkOrderTx` `:121-165` (whole-WO,
  loops all OPERATION tasks — do NOT call wholesale on an issued WO). Reusable primitives:
  `releaseReservationsForTaskTx({taskId})` `:181-187`, pure `reservationIntentsForTask(task)` `:48-81`, and
  the create loop `:132-162` to extract into a per-task `syncReservationsForTaskTx`.
- **Executed predicate:** a `WorkOrderTaskAttempt` with `operationId != null` (`schema.prisma:3629`;
  `completeTaskCore` `execute.ts:296-448`). Safe-to-edit = `status === "PENDING"` (no attempt, holds live).
  Status enum `WorkOrderTaskStatus` `schema.prisma:3347-3355`.
- **FKs / delete safety:** task children `work_order_task_attempt`, `reservation`, `work_order_task_equipment`
  all CASCADE on task delete; `vessel_activity_event.taskId` is RESTRICT (a MAINTENANCE task that recorded
  an event can't be deleted — another reason to gate PENDING-only). Executed ops are RESTRICT-protected.
- **Equipment:** `attachTaskEquipmentCore` (`equipment.ts:77-85`, createMany skipDuplicates) — **no detach
  core exists**; add one for the edit path. Dependencies: `addWorkOrderDependencyCore` /
  `removeWorkOrderDependencyCore` (`wo-dependencies.ts:53-102`).
- **Readiness gate:** `gateWorkOrderReadinessForWrite(builds, meta, fingerprint)`
  (`proposal-readiness.ts:937-951`) — read-only, throws on stale fingerprint or blocking warnings; re-run
  with post-edit builds exactly as `createWorkOrderFromBuildsAction` (`actions.ts:163-225`) does.

### Prior Learnings
- Build in the MAIN checkout (has `.env`); branch off `origin/main` ([[build-in-main-checkout-not-worktrees]]).
- `check` CI doesn't run `next build` — run it before merge ([[plan053-work-order-builder-drafted]]).
- After a rebase past schema changes, run `prisma generate` (stop the dev server first — Windows DLL lock)
  ([[prisma-neon-migrations-windows]], this session).
- Plan 070 shipped the light edit card + `isTenantAdminLike` gating + `listOrgMembers` on the detail page
  ([[plan069-wo-mandatory-lead-editability]]) — build on it, replace the card.

### External Research
None — internal only.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Edit UX | Reopen in the existing builder, pre-populated | Separate edit form | User-approved; one UI to learn; reuses field rendering + readiness |
| Save semantics | Update in place (same id/number/history) | Cancel + recreate | Preserves number, history, executed work, reservations |
| Editable set | PENDING + builder-representable tasks only | Allow editing everything | Immutable ledger (executed) + builder can't render some payloads; locking prevents corruption |
| Non-representable types | Locked read-only with a reason | Best-effort edit | GROUP_RACK etc. payloads aren't in `def.fields`; editing would silently drop them |
| Reservation re-sync | Per changed pending task (release + recreate) | Whole-WO recompute | `reserveForWorkOrderTx` double-holds untouched tasks; reservations are per-task |
| Status on edit | Keep as-is (issued stays issued) | Bounce to DRAFT | User-approved; reservations re-synced in place, no re-issue |
| Readiness | Re-run gate with post-edit builds + fingerprint | Skip (trust builder) | Write path is the last authority; same guarantee as create |

## Implementation Units

### Unit 1: Reverse-mapper — stored tasks → builder builds + locked set

**Goal:** Turn a WO's stored tasks into the builder's `BuilderTask[][]` (grouped) plus a per-task
`editable/locked(+reason)` classification.
**Files:** `src/lib/work-orders/task-to-build.ts` (new); `test/work-order-task-to-build.test.ts` (new).
**Approach:** Build a reverse index over `resolveTaskVocabulary(tenantId)` keyed on
`(kind, opType|observationType|activityType)`; tiebreak RACK/GROUP_RACK on `plannedPayload.groupRack`,
NOTE/Custom-Log on `__fieldSchema`. For each task: `values = plannedPayload − {taskKey, __fieldSchema}`,
`assigneeId` from column, `equipmentIds` from the passed equipment map, group by `groupSeq` (order by seq).
Classify a task `locked` ONLY when it's executed (an attempt with `operationId`, i.e. `status !== "PENDING"`)
or its taskType can't be resolved (safety net) — with a human reason string. All other pending tasks are
editable, including CRUSH/PRESS/HARVEST/BOTTLE (authoring fields) and the GROUP types. Tag each build with
its `renderMode`: `fields` (generic renderer) or `group-form` (bespoke form, for GROUP_RACK /
group-maintenance) so Unit 5/8 knows how to render it. Pure function (takes rows + vocab + equipment map).
**Tests:** round-trip for the common types (build → `instantiateTaskBuilds` → row → reverse === build) for
RACK, ADDITION, FINING, TOPPING, CAP_MGMT, a maintenance type, BRIX observation, NOTE; locked-classification
for an executed task and for a GROUP_RACK task; multi-group ordering.
**Depends on:** none
**Patterns to follow:** `template-vocabulary.ts:428` (forward) + `nl-resolve.ts:403` (build shape).
**Verification:** `npx vitest run test/work-order-task-to-build.test.ts`

### Unit 2: Per-task reservation re-sync helper

**Goal:** A reusable `syncReservationsForTaskTx(tx, task, {validUntil})` that releases a task's ACTIVE holds
and recreates them from its current intents — so the update path re-syncs only changed pending tasks.
**Files:** `src/lib/work-orders/reservations.ts`.
**Approach:** Extract the per-task create loop (`reservations.ts:132-162`) into `syncReservationsForTaskTx`:
`releaseReservationsForTaskTx({taskId})` then iterate `reservationIntentsForTask(task)` creating ACTIVE rows
(same validUntil rule, same ATP advisory warning). Refactor `reserveForWorkOrderTx` to call it per task (no
behavior change). Keep advisory-only (WORKORDER-2 — never blocks).
**Tests:** covered by Unit 4's verify e2e (holds released + recreated on edit). Optionally a unit test on
the pure intent recompute.
**Depends on:** none
**Patterns to follow:** `reservations.ts:121-187`.
**Verification:** `npx tsc --noEmit`; existing `verify:work-orders` reservation assertions still green.

### Unit 3: Equipment set/detach core

**Goal:** Let the update path set a task's equipment to an exact list (add missing, remove dropped).
**Files:** `src/lib/equipment/equipment.ts`.
**Approach:** Add `setTaskEquipmentCore(taskId, equipmentIds)` = detach rows not in the list + attach missing
(reuse `attachTaskEquipmentCore`'s createMany skipDuplicates). Tenant-safe.
**Tests:** small unit test (set from [] → [a,b] → [b,c] leaves {b,c}).
**Depends on:** none
**Patterns to follow:** `equipment.ts:77-85`.
**Verification:** `npx tsc --noEmit`; unit test.

### Unit 4: `updateWorkOrderCore` + `updateWorkOrderFromBuildsAction`

**Goal:** The in-place update: apply edited builds to pending tasks, re-sync reservations, keep status,
never touch executed tasks.
**Files:** `src/lib/work-orders/update-core.ts` (new); `src/lib/work-orders/actions.ts`.
**Approach:** `updateWorkOrderCore(actor, { workOrderId, title, instructions, assigneeId/assigneeEmail,
dueAt, priority, locationId, taskBuilds (each may carry existingTaskId), dependsOnWorkOrderIds })`. Guard:
throw if WO APPROVED/CANCELLED. In `runInTenantTx`: load tasks; compute locked set (Unit 1's predicate);
refuse if any build targets a locked/executed task id. Diff editable pending tasks vs builds — update in
place (re-instantiate via `instantiateTaskBuilds` → columns + plannedPayload + assigneeId + groupSeq +
title), create new PENDING tasks, delete removed pending tasks (release holds then delete — cascade cleans
equipment/reservations). Recompute `seq` for editable tasks while preserving locked tasks' seq/groupSeq.
For ISSUED WOs, call `syncReservationsForTaskTx` for each updated/created pending task (deleted tasks release
via the delete path). Update WO-level fields (reuse the Plan 070 lead resolution + #198
`resolveAssigneeIdByEmail`). Diff dependencies (add/remove cores). Set equipment (Unit 3). Write audit.
Keep status. The **action** `updateWorkOrderFromBuildsAction` mirrors `createWorkOrderFromBuildsAction`:
re-run `gateWorkOrderReadinessForWrite` with the post-edit editable builds + fingerprint, then call the core,
revalidate.
**Tests:** the verify e2e (Unit 7) is the integration guard; add a focused unit test on the diff/seq logic
if it's extractable as pure.
**Depends on:** Units 1, 2, 3
**Patterns to follow:** `actions.ts:163-225` (create action), `lifecycle.ts` cores (tx + audit),
`wo-dependencies.ts:53-102`.
**Verification:** `npx tsc --noEmit`; Unit 7 `verify:work-orders`.

### Unit 5: Builder edit mode

**Goal:** `WorkOrderBuilderClient` can run as an editor: pre-populated, locked tasks read-only, Save updates.
**Files:** `src/app/(app)/work-orders/new/WorkOrderBuilderClient.tsx`.
**Approach:** Add an optional `existing` prop: `{ workOrderId, status, builds: BuilderTask[][], locked:
{ groupIndex, taskKey, reason }[], title, leadEmail, priority, locationId, dueAt, dependsOn }`. When set:
seed all state from it; render locked tasks as read-only cards with the reason (no field inputs, no remove);
disable dragging a locked task out of its group; the submit calls `updateWorkOrderFromBuildsAction`
(carrying each editable task's `existingTaskId`) instead of create; button reads "Save changes"; keep the
mandatory-Lead guard from Plan 070. New/edited tasks behave exactly as today.
**Tests:** manual browser QA (client-only; no RTL/jsdom in repo).
**Depends on:** Unit 1 (build shape), Unit 4 (action)
**Patterns to follow:** existing hydration at `WorkOrderBuilderClient.tsx:283`; group render loop.
**Verification:** `npx next build`; browser QA on Demo.

### Unit 6: Edit route + detail-page entry

**Goal:** `/work-orders/[id]/edit` renders the builder in edit mode; the detail page links to it.
**Files:** `src/app/(app)/work-orders/[id]/edit/page.tsx` (new);
`src/app/(app)/work-orders/[id]/WorkOrderDetailClient.tsx`; `src/app/(app)/work-orders/[id]/page.tsx`.
**Approach:** New server page: `requireReadyUser` + `isTenantAdminLike` gate (else redirect to the detail
view); load the WO + its tasks + equipment map, `getWorkOrderPickers`, `listOrgMembers`, `listLocations`,
`listDependableWorkOrders`; run the Unit 1 reverse-mapper to produce builds + locked set; render
`WorkOrderBuilderClient` with the `existing` prop. If the WO is APPROVED/CANCELLED, redirect back (nothing
editable). On the detail page, replace the light Edit card (Plan 070) with an **Edit** button/link to
`/work-orders/[id]/edit` shown for admin+developer when the WO isn't APPROVED/CANCELLED.
**Tests:** manual browser QA.
**Depends on:** Units 1, 5
**Patterns to follow:** `work-orders/new/page.tsx` (loader shape), `[id]/page.tsx` (gate).
**Verification:** `npx next build`; browser QA — edit WO #2 (both pending), reorder/edit/add/remove, save,
confirm persistence via a `runAsTenant` read-back.

### Unit 7: WORKORDER-6 invariant + verify guard

**Goal:** Lock in "editing a WO never mutates an executed task's op" and the edit round-trip.
**Files:** `docs/architecture/invariants/WORKORDER-6-edit-never-mutates-executed-op.md` (new, LF);
`INVARIANTS.md`; `scripts/verify-work-orders.ts`.
**Approach:** Extend the verify drive: create+issue a WO with 2 tasks, complete one (executed), then call
`updateWorkOrderCore` to edit the still-pending task + attempt to edit/remove the executed one (must be
refused), and assert: the executed task's `operationId`/op is unchanged, the pending task's fields updated,
its reservations released+recreated, and a removed pending task's holds are gone. Add the `WORKORDER-6` note
(`status: guarded`, `verify: "npm run verify:work-orders"`) + `INVARIANTS.md` narrative.
**Tests:** the verify script is the guard.
**Depends on:** Unit 4
**Patterns to follow:** `WORKORDER-5-work-order-has-lead.md`; `scripts/verify-work-orders.ts` drive.
**Verification:** `npm run verify:work-orders`; `npm run verify:invariants`; `verify:invariant-frontmatter`.

### Unit 8: Group-type editing (group barrel-down/rack + group multi-vessel maintenance)

**Goal:** Make the two GROUP types editable in the edit view via their existing authoring forms, so "every
not-yet-executed task is editable" holds literally.
**Files:** `src/app/(app)/work-orders/new/WorkOrderBuilderClient.tsx` (per-type render override) or a small
wrapper; reuse `src/components/**/GroupMaintenanceTaskForm.tsx` and the group-rack selector
(`src/lib/work-orders/group-rack-select.ts` + its component); `src/lib/work-orders/task-to-build.ts`
(carry the group member payload into the build); `src/lib/work-orders/update-core.ts` (persist the group
payload back onto the pending task's plannedPayload).
**Approach:** In edit mode, when a task card's `renderMode` is `group-form`, render that type's bespoke
authoring form seeded from the task's `plannedPayload.groupRack` / group-activity members instead of the
generic field list. The form emits the same payload shape the create flow produces; the reverse-mapper
carries it in the build's `values`, and `updateWorkOrderCore` writes it straight back to `plannedPayload`
(group-rack/group-maintenance are not executed while PENDING, so this is a pure authoring edit). Verify the
member set + direction survive a round trip. If a group form proves disproportionately entangled with its
creation flow, ship the rest and lock that one type with a clear message (documented fallback), but the
target is full coverage.
**Tests:** round-trip unit test for the group payload in `task-to-build` (members/direction preserved);
manual browser QA editing a pending group-rack + group-maintenance WO.
**Depends on:** Units 1, 4, 5, 6
**Patterns to follow:** the group forms' own create wiring (`group-activity.ts`, group-rack authoring);
`nl-resolve.ts` GROUP_RACK build shape (`:460-486`).
**Verification:** `npx next build`; browser QA — edit a pending group-rack WO (change members), Save, confirm
via a `runAsTenant` read-back that the member set persisted and no new op was written.

## Test Strategy

**Unit (vitest):** `test/work-order-task-to-build.test.ts` (reverse round-trip + lock classification) — the
highest-value fast coverage; equipment set core test; diff/seq logic if extractable.
**DB e2e (verify:work-orders):** the WORKORDER-6 drive (executed untouched, pending edited, reservations
re-synced) against `org_demo_winery`; `verify:invariants` + frontmatter.
**Manual browser QA (Demo, QA-* fixtures):** edit an all-pending WO (change dose/vessel/assignee, add +
remove tasks, reorder groups, change Lead/due/priority/location) → Save → verify persisted; edit a
partially-executed WO (executed task locked with reason, pending task editable); confirm reservations move
via a `runAsTenant` read-back. `next build` before merge.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Reverse-map picks the wrong taskType (RACK/GROUP_RACK, NOTE/Custom-Log) | MED | MED | Explicit tiebreaks; lock GROUP_RACK + unresolved types; round-trip unit tests |
| Silent value loss round-tripping a run-time-heavy type | MED | HIGH | Lock CRUSH/PRESS/HARVEST/BOTTLE/GROUP_RACK from in-builder edit (read-only) |
| Editing corrupts an executed task's ledger op | LOW | HIGH | PENDING-only edit; core refuses locked ids; WORKORDER-6 guard; RESTRICT FKs backstop |
| Reservation double-hold or leak on re-sync | MED | MED | Per-task release+recreate (never whole-WO); verify asserts hold counts |
| seq/groupSeq incoherence with interleaved locked tasks | MED | MED | Preserve locked seq/groupSeq; renumber only editable; e2e assertion |
| Removed pending task blocked by a child FK | LOW | MED | Gate PENDING-only (no attempts/events); release holds before delete (cascade) |
| Stale readiness between load and save | LOW | MED | Re-run gate with fingerprint (same as create) |

## Success Criteria

- [ ] Detail "Edit" (admin+developer) opens the full builder pre-populated for any non-terminal WO.
- [ ] Every not-yet-executed task is editable — generic types via the field renderer, crush/press/harvest/
      bottle (authoring), and both GROUP types via their forms; add/remove/reassign/regroup; Save in place
      (same id/number).
- [ ] Executed tasks are the ONLY locked case (read-only + "reverse to edit"); the core refuses to edit them.
- [ ] Executed tasks' ops are provably untouched after an edit (WORKORDER-6 verify).
- [ ] ISSUED WOs stay issued; reservations for changed pending tasks are released + recreated; others
      untouched.
- [ ] Readiness gate re-runs on save; WO-level fields (incl. mandatory Lead from Plan 070) editable.
- [ ] `verify:work-orders` (incl. WORKORDER-5 + 6), `verify:invariants`, `verify:invariant-frontmatter`,
      full vitest, `next build` — all green.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | User-approved decisions; live bug context |
| Scope Boundaries | HIGH | Executed + non-representable locking is well-grounded in research |
| Implementation Units | MEDIUM-HIGH | Reverse-mapper + seq/reservation re-sync are the fiddly parts; researched in detail |
| Test Strategy | MEDIUM | Reverse round-trip well-covered by units; UI is manual-QA-only (no RTL/jsdom) |
| Risk Assessment | HIGH | Ledger-safety risks bounded by PENDING-only + lock + WORKORDER-6 |
