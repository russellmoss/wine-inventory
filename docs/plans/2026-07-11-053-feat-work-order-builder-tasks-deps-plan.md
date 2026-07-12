---
title: Work-Order Builder + Execution Model — Palette, Sequential Groups, Planning, Customization
type: feat
status: draft
date: 2026-07-11
branch: feat/work-order-builder-053  # build in the MAIN repo checkout (has .env), PR to main — not a worktree
depth: deep
units: 16
phases: 5 (A builder foundation · B ERP planning · C admin customization · D assistant parity · E governed ops)
supersedes: the initial draft's "Adopted Revisions" section (this is a clean rewrite; no internal overrides)
---

## Overview

Turn the template-locked "new work order" form into an excellent interactive builder and execution
model first, then layer ERP planning and safe customization on top. A work order becomes an ordered
set of TASK GROUPS: tasks in a group run in parallel, and the next group can't complete until the
prior group is done. Individual tasks get their own assignee. Planning fields (priority, schedule
window, duration, location, required equipment) come next. Then admins can define record-only
"Custom Logs" and hide/relabel/reorder fields on built-in tasks. The AI assistant drafts into the
exact same model. Everything rides the SAME `createWorkOrderCore` / `instantiateTaskBuilds` core, so
agentic work-order building never forks.

## Assistant continuity (explicit — the AI never forks)

Building, issuing, completing, confirming, and approving work orders BY VOICE/CHAT keeps working
throughout, because the assistant and the UI share ONE core (`createWorkOrderCore`/`instantiateTaskBuilds`).
- **Unchanged and working from day one:** `propose_work_order`, `create_work_order`, `issue_operation_wo`,
  `issue_cap_management_wo`, `complete_task`, `review_task` (approve/reject), `manage_work_order`
  (start/assign/schedule/cancel), template authoring tools.
- **New gates apply to the AI for free:** sequential-group gating (A3) and WO→WO gating (A5) live in the
  core, so `complete_task`/`review_task` via the assistant automatically respect them.
- **Assistant reaches parity WITH the UI, not after it:** the vocab plumbing (A1) and the assistant tool
  schema/prompt updates for `groupSeq` + per-task `assigneeId` land in Phase A/B (same core, small
  schema/prompt change) — so the AI can author grouped, individually-assigned work orders as soon as the
  builder ships. Phase D adds only: custom-type fluency, the "describe the job → draft into the builder →
  edit → issue" accelerator, and expanded golden evals (the D26/H8 hard coverage gate).

## Problem Frame

The current create screen forces you to start from a template and defaults the first block to "Add
material addition." The fastest path to a work order today is the AI assistant, not the UI — backwards
for the crew on the floor. The deepest value is a builder + execution model that matches how cellar
work actually sequences (do these three in parallel, then the next thing), plus enough ERP structure
(who, where, with what, by when) to run a real winery. The trap to avoid: jumping straight from "bad
addition form" to "custom operation platform." Make the builder and execution model excellent first;
customization is the last mile, not the first.

## Requirements

- MUST: Build a work order from a task palette (no template lock). Templates = optional seed + save-as.
- MUST: Tasks arranged into SEQUENTIAL GROUPS — parallel within a group, groups run in order. No
  free-form DAG editor.
- MUST: Per-task assignee (order-level assignee is the lead/default; a task can be reassigned).
- MUST: WO→WO dependency ("finish WO-A before WO-B"): warn at start, hard-block completion until the
  predecessor is done. (Completion predicate: see Decisions.)
- MUST: The ledger-safety line holds. Only code-defined built-in task types write the immutable
  ledger / cost / governed measurement store. User-defined types are record-only. WORKORDER-1 stays
  true; `verify:work-orders` stays green.
- MUST: One shared core for UI + assistant. The vocabulary resolver + explicit-vocab plumbing lands in
  Phase A so no authoring path ever silently reads the hardcoded vocabulary.
- MUST: Every new table + the Location extension follows the Phase-12 RLS checklist; `verify:tenant-isolation` green.
- SHOULD: ERP planning fields — priority, estimated duration, scheduled start/end window, location,
  required equipment — on work orders and, where useful, tasks.
- SHOULD: Location as a first-class object (EXTEND the existing `Location` model, don't duplicate);
  a tenant-scoped `EquipmentAsset` registry referenced as advisory "required equipment."
- SHOULD: AI accelerator — "describe the job → draft into the builder → edit → issue" — same vocabulary
  and group/dependency rules as the manual path.
- SHOULD: Admin/owner-only editing of custom task definitions, overlays, and field layouts.
- NICE: Bottling as a first-class governed task (Phase E).
- NICE: Richer equipment maintenance, downtime/parts/cost (later).

## Scope Boundaries

**In scope:** palette builder with sequential groups; per-task assignee; WO→WO deps; planning fields;
Location extension + EquipmentAsset registry; record-only Custom Logs + built-in field overlays with
stage visibility; AI accelerator; assistant parity; bottling task (Phase E).

**Out of scope (deferred, with reasons):**
- A free-form task dependency GRAPH editor — sequential groups cover real winery work with far less UI.
- Teams / group assignment on work orders — teams belong in user management; the assignee picker can
  filter by team LATER. Assignments stay to individuals now (#9).
- A distinct "winemaker" role — roles are org-level (owner/admin/member); use admin/owner now. A
  winemaker role is a user-management addition, deferred with teams.
- A generic operation engine letting users author NEW ledger-writing task types. Forbidden by the
  safety line.
- Auto-scheduling / calendaring / Gantt, downtime & parts costing on equipment, attachment/photo
  custom fields (blob) — all later.
- Routing custom-field values into the governed chemistry/measurement store — Custom Logs write to the
  task's `actualPayload` only.

## Research Summary

### Codebase Patterns
- One shared core: new-WO form, vessel-modal issuer, and every assistant authoring tool funnel through
  `instantiateTaskBuilds`/`instantiateTasksFromSpec` → `createWorkOrderCore` (`src/lib/work-orders/lifecycle.ts:62`)
  → `issueWorkOrderCore` (`:144`). No assistant-only writer.
- `TaskBuild = { taskType, title?, values, taskKey? }` (`template-vocabulary.ts:354`); `instantiateTaskBuilds`
  (`:366`) spreads `values` VERBATIM into `plannedPayload` (no whitelist) — this is the hole Unit A2 closes.
- `createWorkOrderCore` already persists per-task `assigneeId`/`assigneeEmail` (`lifecycle.ts:121-122`);
  the instantiate fns never set them (Unit A4).
- Task→task dependency machinery exists but is inert: `assertTaskDependenciesReady` runs on every
  completion (`actions.ts:166-198`), reads `plannedPayload.dependsOn` (nothing writes it), throws via
  `assertDependenciesSatisfied` on a missing predecessor's latest-successful-attempt (`nl-dependencies.ts:183`).
  Unit A3 REPLACES the `dependsOn` blob with a positional group check.
- `canonicalizeTemplateSpec` (`template-vocabulary.ts:310`) drops unknown task types/fields; runs on
  TEMPLATE writes only (`templates.ts:21`). The builder's `taskBuilds` path does NOT canonicalize.
- **`Location` model ALREADY EXISTS** (`prisma/schema.prisma:271`): tenant-scoped, `name`, `isSystem`,
  `isActive`, related to bottling + finished-goods/bottled inventory + lot physical bin. EXTEND it (add
  `kind`), do NOT create a new one.
- **No Equipment model exists** — `EquipmentAsset` (Unit B10) is genuinely new.
- **Roles are org-level strings** `owner | admin | member` (`schema.prisma:126`, Better Auth org plugin).
  No app "winemaker" role. Admin-gating = owner/admin, same as template authoring.
- Planning fields present today: `WorkOrder.scheduledFor` (`:3336`), `WorkOrder.dueAt`, `WorkOrderTask.dueAt`.
  Missing: priority, estimatedDuration, scheduledStart/End window, locationId, equipment link.
- Multi-tenancy exemplar: `compliance_schema` + `compliance_rls` two-migration split (tenantId first
  field, `@@index([tenantId])`, tenant-first uniques, `@@map`; RLS ENABLE+FORCE + policy `tenant_isolation`
  USING+WITH CHECK on `current_setting('app.tenant_id', true)`; GRANT to app_rls; FK organization ON
  DELETE RESTRICT; composite cross-tenant FKs in raw SQL). New tables OFF `GLOBAL_MODELS`
  (`src/lib/tenant/models.ts:12`); isolation case in `scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts`.
- Bottling NOT a task type; `executeBottling` (`bottling/run.ts:273`) opens its own SERIAL tx → private
  `applyBottling` (`run.ts:49`) does BOTTLE ledger op + COGS + `materializeFinishedGoods`; `OperationType.BOTTLE` exists.
- No drag-and-drop lib in the repo.

### Prior Learnings
- Build in the MAIN repo checkout (has `.env` → `verify:*` + dev server work); branch + PR to protected
  main; NOT `.claude/worktrees` (`.env`-less, `gh pr merge` fails there).
- Prisma/Neon on Windows: `migrate diff` → `deploy` (not interactive `migrate dev`); NO new Prisma
  enums (isolated ALTER TYPE hazard) — validated strings for priority/kind/status/field-type; stop the
  dev server before `db:generate`.
- Column-only migrations to existing tenant tables are fine (Phase 14 v1.1 precedent) — no new RLS.
- Assistant/UI ships manual-QA-only (no jsdom/RTL, vitest node-env). Test PURE logic.
- Assistant write tools have a HARD golden-eval coverage gate (D26/H8) — a golden per new/changed write tool.

### External Research
React 19 + Next 16. If `@dnd-kit` is adopted for group/task reorder, confirm React 19 peers at install;
else hand-roll up/down + HTML5 drag. Ordering IS load-bearing now (group order = execution order), so
reorder must be correct, but the fallback keeps it shippable.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Within-order sequencing | SEQUENTIAL GROUPS: `groupSeq Int` per task; parallel within a group; group N+1 gated on group N | Matches cellar mental model (parallel steps then next step); positional, so reject/reissue-safe; needs NO edge table. |
| task→task dependency satisfaction | A task may complete only when every task in a LOWER group has a latest successful (non-rejected) attempt | Reuses the existing "latest successful attempt" predicate; positional not row-pointer. |
| WO→WO dependency point | WARN at start, HARD-BLOCK at complete; re-check at complete/approve | Preserves cellar momentum (Gemini) AND closes the reversal hole (Codex). |
| WO→WO "done" predicate | Predecessor is DONE when every one of its tasks has a latest successful (non-rejected) attempt (worker-completed), NOT necessarily approved | Consistency with task→task; don't block physical work on a back-office signature. **Flip to "APPROVED" if the operator wants the stricter gate.** |
| Predecessor reversal | Reversing a predecessor whose successors already ran WARNS; no cascade | LEDGER-10 / WORKORDER-1 keep corrections as events; cascading reversals would be surprising. |
| Vocabulary resolution | ONE resolver; pure validate/canonicalize/instantiate take a REQUIRED `ResolvedTaskVocabulary` (NO default); threaded through builder AND assistant in Phase A | A silent `= TASK_VOCABULARY` default would let a missed call site strip user types (Codex C1). |
| Payload safety | Class-split before persist: governed built-ins stripped to declared + reserved keys; user data namespaced | The builder's verbatim `values` spread otherwise lets stray/reserved keys ride onto governed tasks (Codex C2). |
| Custom types | Record-only "Custom Logs" (NOTE-kind; no opType/observationType/activityType); values land in `actualPayload`; field spec has `stage` (planning/execution/review) + `dimension`/unit on numbers; schema snapshotted onto the task | Keeps WORKORDER-1; avoids the "shadow ledger" trap; steer real ops to overlays on built-ins. |
| Overlays | Per-opType HIDEABLE allowlist (whitelist what CAN be hidden), relabel, reorder; admin/owner only | Hiding a required field would break a governed core (Codex/Gemini). |
| Location | EXTEND existing `Location` (add `kind`); nullable `locationId` refs on WO/task/equipment | A model already exists; duplicating would fork inventory location. |
| Equipment | New tenant-scoped `EquipmentAsset` (name/kind/status/location/notes); "required equipment" is ADVISORY | Matches WORKORDER-2 (holds warn, never block); keep simple, maintenance stays record-only. |
| No new Prisma enums | priority/kind/status/field-type/stage are validated strings | Windows isolated-ALTER-TYPE hazard. |
| Teams / winemaker role | Deferred to user management | Keep this plan focused; assignee picker filters by team later. |
| Reorder lib | Recommend `@dnd-kit`; fallback hand-rolled up/down | Group order is load-bearing; must be correct but not blocking. |

## Implementation Units

### PHASE A — Builder foundation + vocab plumbing (ships first)

#### Unit A1: Vocabulary resolver + explicit-vocab plumbing
**Goal:** One resolver threaded through every authoring path; no silent hardcoded-vocab fallback.
**Files:** `src/lib/work-orders/template-vocabulary.ts` (remove the default; the 4 pure fns take a
required `ResolvedTaskVocabulary`), `src/lib/work-orders/vocabulary-resolver.ts` (new, server-only
`resolveTaskVocabulary(tenantId)` — returns built-ins only until Phase C), assistant authoring tools
(`propose-work-order.ts`, `create-work-order.ts`, `issue-operation-wo.ts`, `work-orders-write.ts`,
`templates-write.ts`) + `templates.ts` + the new-WO server actions — all pass the resolved vocab.
**Approach:** `validateTemplateSpec`/`canonicalizeTemplateSpec`/`instantiateTasksFromSpec`/`instantiateTaskBuilds`
require an explicit vocab arg. Read-only display helpers may keep a const reference. A single request
boundary resolves vocab once and threads it.
Also update the assistant authoring tool schemas/prompts here (and in A6/B8) so the AI can emit
`groupSeq` + per-task `assigneeId` on the shared core — keeping the assistant at parity with the UI as
each capability ships (full custom-type fluency + draft-into-builder is Unit D14).
**Tests:** every authoring caller compiles with the required arg; canonicalize keeps/drops correctly by
the injected map; a grep test asserts no write-path references the bare const; an assistant golden that
authors a grouped, per-task-assigned order.
**Depends on:** none. **Verify:** `npm run build` types clean; `npm run verify:work-orders`.

#### Unit A2: Payload class-split hardening
**Goal:** Stop the builder path from writing stray/reserved keys onto governed tasks.
**Files:** `src/lib/work-orders/template-vocabulary.ts` (`instantiateTaskBuilds`), a
`src/lib/work-orders/payload-guard.ts` (new).
**Approach:** For GOVERNED built-ins, persist only fields declared by the resolved def + a reserved
framework key set (`taskKey`, `groupSeq`, `assigneeId`). Reject/strip unknown keys. Reserve
`opType`/`observationType`/`activityType` so no payload can smuggle them.
**Tests:** a governed task with an extra key persists without it; reserved keys never appear as user
data; a NOTE task keeps its namespaced user data.
**Depends on:** A1. **Verify:** unit tests; `verify:work-orders`.

#### Unit A3: Sequential-groups model + within-order gating
**Goal:** Replace the inert `dependsOn` blob with positional group sequencing.
**Files:** `prisma/schema.prisma` (`WorkOrderTask.groupSeq Int @default(0)`), column migration,
`src/lib/work-orders/actions.ts` (`assertTaskDependenciesReady` → positional check), `template-vocabulary.ts`
(carry `groupSeq` from `TaskBuild` → `CreateTaskInput`), `lifecycle.ts` (persist `groupSeq`).
**Approach:** A task may complete only if every task in the same WO with a LOWER `groupSeq` has a latest
successful (non-rejected) attempt. Positional, so a rejected-and-reissued task naturally holds its group
open. Remove reliance on `plannedPayload.dependsOn` (leave the field dormant/removed).
**Tests:** complete out-of-group-order → blocks; reissue a rejected predecessor → group stays blocked
until redone; parallel tasks in one group complete in any order.
**Depends on:** A1. **Verify:** `test/work-order-dependencies.test.ts` (rewritten); `verify:work-orders`.

#### Unit A4: Per-task assignee plumbing
**Goal:** Carry a per-task assignee end to end; persist the ID, not the email.
**Files:** `template-vocabulary.ts` (`TaskBuild` gains `assigneeId?`; email is a transient lookup hint
resolved server-side to id), `src/lib/work-orders/actions.ts` (resolve email→id), `nl-resolve.ts` (pass-through).
**Approach:** instantiate fns set `CreateTaskInput.assigneeId` (already persisted by `createWorkOrderCore`).
Keep assignee OUT of `plannedPayload`.
**Tests:** `TaskBuild` with assignee → `CreateTaskInput.assigneeId`; email resolved to id; no leak into payload.
**Depends on:** A1. **Verify:** instantiate unit tests.

#### Unit A5: WO→WO dependency table + gating
**Goal:** Cross-order dependencies with warn-at-start / block-at-complete.
**Files:** `prisma/schema.prisma` (`@@unique([tenantId, id])` on `WorkOrder`; new `WorkOrderDependency`),
migration pair `<ts>_wo_dependency_schema` (composite raw-SQL FKs) + `<ts>_wo_dependency_rls`,
`src/lib/work-orders/wo-dependencies.ts` (new: CRUD, transactional cycle-guard, `assertPredecessorsDone`,
override-audit), `lifecycle.ts` (warn at `startTaskCore`; hard-block + re-check in the completion/finalize path),
`actions.ts` (add/remove edge).
**Approach:** `WorkOrderDependency { tenantId, id, workOrderId, dependsOnWorkOrderId, createdAt,
@@unique([tenantId, workOrderId, dependsOnWorkOrderId]), @@index([tenantId, dependsOnWorkOrderId]),
@@index([tenantId, workOrderId]) }`. Composite FKs `(tenantId, workOrderId|dependsOnWorkOrderId)→work_order(tenantId,id)`
in raw SQL. `assertPredecessorsDone` = every predecessor WO worker-complete (all its tasks have a latest
successful attempt). Cycle-check + insert in ONE tx. `overrideBlocked` writes actor/timestamp/predecessor
snapshot/reason to the WO audit surface.
**Tests:** start dependent while predecessor open → warns; complete dependent while predecessor open →
blocks; predecessor reversed after successor started → warned, not cascaded; self/cyclic edge rejected;
isolation case for the new table + composite-FK cross-tenant reject.
**Depends on:** A3. **Verify:** `verify:tenant-isolation`; `verify:work-orders`; WO-dep unit tests.

#### Unit A6: The palette builder UI (primary surface)
**Goal:** Palette-first builder with groups, per-task assignee, no template lock.
**Files:** `src/app/(app)/work-orders/new/page.tsx` (load resolved vocab + org members), rewrite/replace
`NewWorkOrderClient.tsx` (or new `WorkOrderBuilderClient.tsx`), new `TaskPalette.tsx`, `TaskGroup.tsx`,
`BuilderTaskCard.tsx`; reuse `VesselMultiSelect`, `MaterialFilterPicker`, `WorkOrderReadinessPanel`.
**Approach:** State = ordered groups, each holding `builderTasks:{taskKey,taskType,title,values,assigneeId?}`.
Palette grouped by category from the resolved vocab; click adds a task to the current group; "+ add group"
adds a sequential step. Fields via the existing `renderField` dispatch; assignee select from org members.
Live readiness via `previewWorkOrderReadinessAction` + `WorkOrderReadinessPanel`. Submit maps groups →
`TaskBuild[]` (with `groupSeq` + assignee) → `createWorkOrderAction` (no template) or
`createWorkOrderFromTemplateAction` (seeded). Start-from-template / save-as-template. Keep locked-vessel
embedded mode. Reorder via `@dnd-kit` (fallback up/down). Empty state auto-offers template seed or the
"describe the job" box (Phase D wires the AI; the box can exist earlier as a stub).
**Tests:** pure `test/builder-payload.test.ts` — groups → `TaskBuild[]` (groupSeq, assignee, multi-vessel
fan-out). UI = manual `/qa`.
**Depends on:** A1–A5. **Verify:** `/qa` against Demo Winery: multi-group, multi-assignee WO; out-of-group
completion blocks; DESIGN.md tokens (no hardcoded colors/spacing).

#### Unit A7: Phase-A gates
**Goal:** Prove isolation + no regressions for Phase A.
**Files:** `scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts` (WorkOrderDependency case).
**Depends on:** A5, A6. **Verify:** `verify:tenant-isolation`, `verify:work-orders`, `verify:naming` green.

### PHASE B — ERP planning foundation

#### Unit B8: Planning fields on work orders + tasks
**Goal:** Priority, duration, schedule window on orders and tasks.
**Files:** `prisma/schema.prisma` (`WorkOrder` + `WorkOrderTask`: `priority String?` [validated
LOW/NORMAL/HIGH/URGENT], `estimatedDurationMin Int?`, `scheduledStart DateTime?`, `scheduledEnd DateTime?`;
task keeps `dueAt`), column-only migration, builder UI + WO views + list sort/filter.
**Approach:** No new tables/enums; mirror the Phase 14 v1.1 column-only migration. Surface in the builder
and the WO list (sort by priority/schedule). Keep it data capture — no auto-scheduling.
**Tests:** validated-priority guard; create/read round-trip.
**Depends on:** A6. **Verify:** `db:generate`; `verify:work-orders`.

#### Unit B9: Location as first-class (extend, don't duplicate)
**Goal:** Classify locations and let orders/tasks reference them.
**Files:** `prisma/schema.prisma` (`Location.kind String?` [cellar/warehouse/crush_pad/lab/bottling/external/other];
nullable `locationId` on `WorkOrder`/`WorkOrderTask`), column migration, location picker + display, seed a
default `kind` for existing rows.
**Approach:** Extend the EXISTING `Location` (`:271`). `locationId` FKs are plain refs resolved at runtime
(K11/K12), tenant-safe via the extension. Builder gets a location select.
**Tests:** validated-kind guard; WO/task carry locationId; picker lists tenant locations.
**Depends on:** B8. **Verify:** `verify:work-orders`; `verify:tenant-isolation` (Location already covered).

#### Unit B10: EquipmentAsset registry + advisory required-equipment
**Goal:** A presses/filters/pumps registry, referenced as advisory required equipment.
**Files:** `prisma/schema.prisma` (`EquipmentAsset` + `WorkOrderTaskEquipment` join), migration pair
(schema + RLS) for both, `src/lib/equipment/*` (CRUD, admin-gated), equipment picker in the builder, a
`/setup/equipment` admin surface.
**Approach:** `EquipmentAsset { tenantId, id, name, kind String, status String [available/in_use/maintenance/retired],
locationId String?, notes String?, isActive, timestamps, @@unique([tenantId, name]) }`. Required equipment
is a tenant-scoped join (advisory only — surfaced in readiness, never blocks; WORKORDER-2). RLS per the
exemplar; isolation cases.
**Tests:** isolation (A-sees-own/can't-see-B/foreign-INSERT-raises) for both tables; advisory-only (no block).
**Depends on:** B9. **Verify:** `verify:tenant-isolation`; `verify:work-orders`.

### PHASE C — Admin customization

#### Unit C11: Custom Logs (record-only user task types)
**Goal:** Admins define record-only tasks with custom fields + stage visibility.
**Files:** `prisma/schema.prisma` (`WorkOrderTaskType`), migration pair (schema + RLS),
`src/lib/work-orders/vocabulary-resolver.ts` (merge user types — plumbing already threaded in A1),
`template-vocabulary.ts` (`assertUserTaskTypeSafe`), `src/lib/work-orders/actions.ts` (admin/owner-gated CRUD),
EXECUTE screen (render custom fields by stage; capture into `actualPayload`), authoring snapshot of the
field schema onto the task.
**Approach:** `WorkOrderTaskType { tenantId, id, code @@unique([tenantId, code]), label, kind (NOTE),
fieldsJson [{ key, label, type∈{text,number,select,date,boolean}, options?, required?, dimension?
(for number: volume/mass/temp/count/unitless), stage∈{planning,execution,review}[] default all }],
archivedAt, timestamps }`. In-place update (no archive/recreate churn); archive = `archivedAt`. Numbers
store `{ value, unit }` in `actualPayload`. `assertUserTaskTypeSafe` throws on any opType/observationType/activityType.
**Tests:** safety throws on opType; dup field key / empty select options rejected; custom field survives
`instantiateTaskBuilds` into a namespaced payload; historical task renders from its snapshot after the
type changes; isolation case.
**Depends on:** A1, A2, B (for the shared execute surface). **Verify:** `verify:tenant-isolation`; `verify:work-orders`.

#### Unit C12: Built-in field overlays + stage-aware execute
**Goal:** Hide/relabel/reorder fields on built-in tasks, safely; stage-aware field rendering.
**Files:** `prisma/schema.prisma` (`WorkOrderTaskTypeOverlay`), migration pair, `src/lib/work-orders/overlays.ts`
(`applyOverlay`, `HIDEABLE_FIELDS_BY_TASK_TYPE` allowlist, `assertOverlaySafe`), vocabulary-resolver fold-in,
task-builder UI (`/work-orders/task-types` with Custom-logs + Built-in tabs), admin/owner gate.
**Approach:** `WorkOrderTaskTypeOverlay { tenantId, id, baseTaskType, hiddenFields String[], relabels Json,
fieldOrder String[], archivedAt, timestamps, @@unique([tenantId, baseTaskType]) }`. `assertOverlaySafe`
allows hiding ONLY fields on the per-opType hideable allowlist (whitelist, not "not-required" blocklist).
Overlays affect display + template authoring only.
**Tests:** hide an allowlisted field (ok); hide a non-hideable field (throws); relabel/reorder reflected;
overlay never changes opType/kind; isolation case.
**Depends on:** C11. **Verify:** `verify:tenant-isolation`; `verify:work-orders`.

#### Unit C13: Safety invariant + gates
**Goal:** Encode the record-only guarantee; keep all gates green.
**Files:** `docs/architecture/invariants/WORKORDER-4-user-types-record-only.md` + `INVARIANTS.md` line +
a `verify:` guard (asserts no user-defined type resolves to non-NOTE / non-null opType); optional add
`src/lib/work-orders/` to the PreToolUse `HOT` list.
**Depends on:** C11, C12. **Verify:** `verify:invariants`, `verify:tripwires`, `verify:work-orders`, `verify:naming`.

### PHASE D — Assistant parity

#### Unit D14: Assistant custom-type fluency + draft-into-builder accelerator
**Goal:** The AI is fluent in Phase-C custom types and can draft a full grouped order into the builder
for the user to edit. (Group + per-task-assignee AUTHORING already landed in A/B — see Unit A1 and the
Assistant-continuity note; this unit finishes parity.)
**Files:** assistant authoring tools + `nl-resolve.ts` (emit `groupSeq` + assignee + planning fields;
resolve user types via the resolver already threaded in A1), `draftWorkOrderFromTextAction` (client-callable
wrapper returning vocab+group-validated `{taskBuilds, groups, readiness}` + diagnostics — same contract as
builder submit), builder "describe the job" box (hydrate groups), `docs/architecture/assistant-coverage.md`,
golden evals.
**Approach:** Because the vocab plumbing landed in A, this is awareness + coverage, not a safety retrofit.
Serialize custom-field `required`/options into the LLM context; Zod-validate the draft output. NL ledger
intents stay code-defined; user types only NOTE-shaped.
**Tests:** draft yields groups + assignee in `TaskBuild[]`; a user type resolves in a draft; golden evals
(hard coverage gate) for every changed write tool.
**Depends on:** A6, C11. **Verify:** assistant eval suite; `/qa` the assistant end to end.

### PHASE E — Heavier governed operations

#### Unit E15: Bottling as a first-class governed task
**Goal:** A BOTTLE task routed through the existing bottling core.
**Files:** `src/lib/bottling/run.ts` (export in-tx `runBottlingTx(tx, input, actor)`), `template-vocabulary.ts`
(`BOTTLE` entry `{kind:OPERATION, opType:BOTTLE}` process-defaults only), `src/lib/work-orders/execute.ts`
(completion dispatch INSIDE the WO tx — not `executeBottling`), `[id]/execute/BottlingTaskForm.tsx` (run-time
sub-form: vessels/bottles/ABV/dest), optional `SYS-BOTTLE`.
**Approach:** Mirror CRUSH/PRESS run-time sub-form. Honors WORKORDER-1 (real BOTTLE ledger op + COGS via the
existing core), idempotent by commandId, rejection reverses.
**Tests:** completing a BOTTLE task writes the op + COGS + finished goods exactly once; rejection reverses.
**Depends on:** A6. **Verify:** `verify:work-orders`; bottling-task unit test; `/qa`.

#### Unit E16: Richer equipment maintenance (record-only)
**Goal:** Equipment maintenance tasks tie to `EquipmentAsset`, staying overhead/record-only.
**Files:** maintenance task wiring to `EquipmentAsset`; status transitions (available↔maintenance).
**Approach:** Maintenance stays WORKORDER-3 overhead (no wine COGS). Downtime/parts/cost deferred.
**Depends on:** B10, E15. **Verify:** `verify:work-orders-enhancements`.

## Test Strategy
**Unit (vitest, node-env, pure logic):** vocab resolver + no-default (A1); payload guard (A2); group gating +
reject/reissue (A3); assignee mapping + email→id (A4); WO-dep gating/cycles/predicate (A5); builder payload
(A6); priority guard (B8); location kind (B9); equipment advisory + isolation (B10); user-type safety + field
validation + snapshot (C11); overlay hideable-allowlist (C12); draft shape (D14); bottling ledger effects (E15).
**Integration/verify (MAIN checkout, `.env`):** `verify:tenant-isolation`, `verify:work-orders`,
`verify:work-orders-enhancements`, `verify:naming`, `verify:invariants`, `verify:tripwires`.
**Assistant golden evals:** D26/H8 coverage gate for every changed write tool (D14).
**Manual `/qa` (Demo Winery, QA-* fixtures):** build a multi-group, multi-assignee WO with a WO→WO dep;
confirm out-of-group completion blocks and cross-order completion blocks until predecessor done; create a
Custom Log with a unit'd number field and confirm it writes nothing to the ledger; run the AI accelerator;
(Phase E) bottle through a WO.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| User-defined type leaks a ledger write | LOW | HIGH | NOTE-only + `assertUserTaskTypeSafe` + payload class-split (A2) + WORKORDER-4 guard (C13). |
| A write path still reads the hardcoded vocab | MED | HIGH | No default arg (A1); grep test; assistant threaded in A. |
| Group gating wrong on reject/reissue | MED | MED | Positional (lower-group) check; explicit reissue test (A3). |
| WO→WO reversal after successor ran | MED | MED | Warn-not-cascade; re-check at complete (A5). |
| New table misses an RLS step | LOW | HIGH | Mirror compliance pair; `verify:tenant-isolation` fails closed. |
| Duplicating Location | LOW | MED | EXTEND existing model (B9) — verified it exists. |
| Scope creep (planning/equipment) | MED | MED | Columns + simple registry only; auto-scheduling/downtime/parts deferred. |
| dnd-kit ↔ React 19 | MED | LOW | Hand-rolled up/down fallback. |
| Bottling in-tx nesting | MED | MED | Export in-tx core; call inside WO tx; commandId idempotency; Phase E (deferrable). |

## Success Criteria
- [ ] Build a WO from a palette (no template lock); templates optional seed/save-as.
- [ ] Tasks group into sequential steps (parallel within a group); out-of-group completion is blocked.
- [ ] Per-task assignee; order-level assignee is the default.
- [ ] WO→WO dep warns at start, blocks completion until the predecessor is done (worker-completed).
- [ ] Planning fields (priority/duration/schedule/location) on orders + tasks; `EquipmentAsset` registry
      with advisory required-equipment; `Location` extended (not duplicated).
- [ ] Admins define record-only Custom Logs (stage-visible, unit'd numbers) + built-in field overlays;
      captured values never touch the ledger/cost/measurement store.
- [ ] AI accelerator drafts into the same builder model; assistant authors through the one shared core.
- [ ] All three new tables + Location extension RLS-isolated (`verify:tenant-isolation`).
- [ ] `verify:work-orders`, `-enhancements`, `naming`, `invariants`, `tripwires` green; golden evals green.
- [ ] No regressions in existing work-order / assistant tests.

## Confidence Check
| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | User + screenshot + code agree. |
| Scope Boundaries | HIGH | Deferrals explicit and reasoned. |
| Implementation Units | HIGH | Each maps to verified files; groups simplify deps; Location/roles verified. |
| Test Strategy | MEDIUM | UI manual-QA (no RTL); rests on pure tests + verify scripts + `/qa`. |
| Risk Assessment | HIGH | Council + code-verified; main risks have concrete mitigations. |

## Council Review
Cross-LLM review (Codex gpt-5.4 + Gemini 3.1 Pro) recorded in `council-feedback.md`. This rewrite folds
all CRITICAL/SHOULD-FIX findings and resolves the earlier draft's internal contradictions. Key resolutions:
sequential groups (kills the reject/reissue ambiguity + a table), vocab plumbing in Phase A (closes the
assistant safety window), payload class-split (A2), warn-start/block-complete WO deps (A5), and Location
extension instead of a duplicate.
