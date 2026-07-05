---
title: Cap management work orders (pumpover / punchdown / pulse-air / rack-and-return)
type: feat
status: completed
date: 2026-07-05
branch: claude/cap-management-work-orders
depth: deep
units: 9
---

## Overview

Wire cap management into the work-orders engine so a winemaker can issue "punch down tanks
3, 4, 5" or "pump over tank 11" as a real work order, and a cellar hand can complete it (one
tank or many at once) with the completion writing the immutable ledger op. Today cap
management (`CAP_MGMT`: pumpover / punchdown / cold-soak / maceration) exists ONLY as an
ad-hoc cellar action on `/bulk` and lot-detail; it is invisible to the WO issue → execute →
approve → finalize loop that cellar hands actually work from. This plan brings it in, adds
batch completion, and covers the two remaining red-ferment techniques (pulse-air,
rack-and-return / délestage).

## Problem Frame

Red-ferment cap management is the highest-frequency cellar task during harvest — multiple
punchdowns/pumpovers per day across every fermenter. A cellar hand's whole day is a
checklist of "which tanks, which technique, done." That is exactly what the WO engine is
for (issue → execute → auto-log → approve), yet cap management is the one core cellar op
NOT wired into it. So during the busiest weeks of the year, the most-repeated task falls
back to manual `/bulk` clicks with no assignment, no due dates, no approval trail, and no
per-tank record of who did what when.

Doing nothing means harvest ops stay off-system precisely when volume and traceability
matter most. The job to be done: hand a cellar hand a list ("punch down 3,4,5 twice today")
and have completing it BE the record.

## Requirements

- MUST: A `CAP_MGMT` OPERATION task type in the WO vocabulary with a technique select
  (pumpover / punchdown / cold-soak / maceration) + optional `durationMin`.
- MUST: Completing the task writes the real `CAP_MGMT` ledger op inside ONE `runLedgerWrite`
  via a `capManagementTx` form (WORKORDER-1: state changes on completion, not approval).
- MUST: A seeded default **ferment**-category template for cap management.
- MUST: Multi-select on vessels at issue time (already fans out to one task per vessel) works
  for the new task type.
- MUST: Batch/multi-select COMPLETION — complete the same technique across N tanks in one
  action, each as its own tx, with per-tank pass/fail results.
- MUST: Pulse-air is available as a cap-management technique.
- MUST: Rack-and-return / délestage is issuable as a WO and requires a destination (holding)
  vessel.
- MUST: Reject path honors WORKORDER-1 (reject = `reverseOperationCore`); approve = finalize,
  no op mutation.
- MUST: Any new assistant WRITE tool ships with a golden eval case (D26/H8 HARD CI gate).
- SHOULD: An assistant write tool to ISSUE a cap-management WO by chat ("punch down tanks
  3, 4, 5 this afternoon"), following the signed-proposal confirm pattern.
- SHOULD: `verify:work-orders` covers the new completion path.
- NICE: Batch completion allows a per-tank actuals override (e.g. one tank got a longer
  punchdown) rather than one shared value.

## Scope Boundaries

**In scope:**
- New WO task type + template + completion dispatch for cap management.
- `capManagementTx` extraction (mirrors the existing `filterVesselTx` split).
- Batch completion core + action + UI (mirrors `bulkApproveTasksCore`).
- Pulse-air as a new `CapKind` (validated string, NOT a DB enum — no migration).
- Rack-and-return via a two-task "out + return" RACK template (reuses the existing `RACK`
  task type + `rackWineTx` — no new op type).
- One assistant write tool to issue cap-management WOs + its golden/fleet eval cases.
- Brain refresh (system-map + WORKORDER invariant notes) since governed WO code is touched.

**Out of scope (and why):**
- A brand-new `PULSE_AIR` or `DELESTAGE` `OperationType`. The recommended designs (pulse-air
  = a `CapKind`; délestage = two linked RACKs) deliver the full feature with zero enum
  migration and zero new reverse/correct/edit/timeline wiring. The heavier "true single-op"
  variants are documented as alternatives in Key Decisions but are explicitly deferred.
- Changing `/bulk` cellar cap-management (it already works; this plan only adds the WO lane).
- Phase-23 RBAC for who may issue/approve (stays on `authority.ts` `canApprove` as-is).
- Auto-scheduling recurring daily punchdowns beyond the existing template `recurrence` field.

## Research Summary

### Codebase Patterns

- **`…Core` / `…Tx` split** — `src/lib/cellar/treatments.ts`: `filterVesselTx(tx, actor, input)`
  holds all guards + writes through the caller's `tx`; `filterVesselCore` is just
  `runLedgerWrite((tx) => filterVesselTx(...))`. `capManagementCore` (treatments.ts:55) is the
  one cellar core NOT yet split — it owns `runLedgerWrite` inline (treatments.ts:74) and reads
  residents via the module `prisma` (`residentBalances`). Extraction = read residents via
  `tx.vesselLot.findMany`, move the body into `capManagementTx`, shrink the core to the wrapper.
  Writes a `LotOperation` `type:"CAP_MGMT"` with **empty `lines`** (volume-neutral) + one
  `LotTreatment` per resident lot carrying `kind` (a validated `CapKind` string, treatments.ts:30)
  + `durationMin`.
- **WO OPERATION dispatch** — `src/lib/work-orders/execute.ts` `dispatchOperationTx` switch on
  `task.opType` (execute.ts:74-194) calls the family tx-forms (`rackWineTx`, `recordNeutralDoseTx`,
  `topVesselTx`, `filterVesselTx`, `crushLotTx`, `pressLotTx`); `default` (execute.ts:189) throws
  "can't yet auto-log a … operation." `completeTaskCore` (execute.ts:199) wraps the whole thing
  (dispatch + attempt + CAS task claim + reservation release + rollup + audit) in ONE
  `runLedgerWrite` (execute.ts:277-332). `commandId` idempotency: pre-check
  `WorkOrderTaskAttempt.findUnique` (execute.ts:204) + P2002 catch (execute.ts:335).
- **Template vocabulary** — `src/lib/work-orders/template-vocabulary.ts` `TASK_VOCABULARY`
  (RACK at :67, FILTRATION at :98). Each `TaskTypeDef`: `{ kind, opType?, label, fields, fieldOptions?, hint? }`;
  `FieldType = "vessel"|"lot"|"material"|"block"|"number"|"text"|"rateBasis"|"select"`; `select`
  fields are constrained by `fieldOptions` (never free-form). System templates: `src/lib/work-orders/system-templates.ts`
  (`SYS-FERMENT-MONITOR` is the only current ferment-category one); seeded via
  `scripts/seed-work-order-templates.ts` (`npm run seed:work-order-templates`).
- **Multi-select on vessels (issue)** — already exists: `src/app/(app)/work-orders/new/VesselMultiSelect.tsx`
  + `NewWorkOrderClient.tsx:199` `buildsForTask` fans an array `vesselId` into one `TaskBuild`
  per vessel → N single-vessel `WorkOrderTask` rows. Works for any OPERATION task type.
- **Batch precedent** — `src/lib/work-orders/approval.ts:144` `bulkApproveTasksCore` loops the
  single-item core, catches per-item, returns `{ taskId, ok, error? }[]` without aborting on
  partial failure. Batch completion should mirror this exactly: loop `completeTaskCore`, **N
  independent `runLedgerWrite` txs** (completeTaskCore owns its own tx and has no `…Tx` variant),
  one `commandId` per task.
- **RACK core** — `src/lib/vessels/rack-core.ts:83` `rackWineTx(tx, actor, {fromVesselId,
  toVesselId, drawL?, lossL?, note?})`; rejects `from===to` (rack-core.ts:90); dest needs
  `isActive` + headroom (`toCurrent+addedL ≤ capacity`), NOT empty. RACK already supports a
  "délestage" label via `RACK_TYPES` (filtration-vocab.ts:23) folded into the op note
  (execute.ts:76). Each `rackWineTx` writes its own `RACK` op + `VesselTransfer` row → each is
  independently revertable via `revertTransferCore`.
- **Assistant write tools** — `src/lib/assistant/registry.ts` (`AssistantTool { name, description,
  kind:"read"|"write", adminOnly?, inputSchema, run }`); write tools return a signed proposal, do
  NOT mutate (run.ts:91-103). Confirm path: `signProposal` (confirm.ts:29, HMAC + single-use
  nonce) → `POST /api/assistant/confirm` → `commitProposal` (commit.ts:66, burns nonce before
  committer runs) → paired `Committer` in `COMMITTERS` (commit.ts:41) calls the real server action.
  Model to copy: plan-038's `create_template` in `src/lib/assistant/tools/templates-write.ts:82`.
  **No assistant tool issues WOs today** — `createWorkOrderCore`/`issueWorkOrderCore`
  (lifecycle.ts:62,144) + actions (`createWorkOrderAction`/`issueWorkOrderAction`, actions.ts:85,91,
  plain `action()` not `adminAction()`) are UI-only.
- **Eval golden gate (D26/H8)** — `test/evals/assistant-write-tools.golden.ts` (`GoldenCase {
  utterance, tool, args, note? }`); coverage guard in `test/evals/assistant-tools.eval.test.ts:76`
  fails if any `kind:"write"` tool is neither in the golden set nor in `UNCOVERED_OK`. Fleet
  confusability case optional in `test/evals/assistant-fleet.golden.ts`.

### Prior Learnings

- **Windows enum-migration rule** (`prisma-neon-migrations-windows`, and schema.prisma:884): a new
  `OperationType` value MUST be an isolated `ALTER TYPE … ADD VALUE IF NOT EXISTS` migration that
  commits before any code writes it. **This plan's recommended designs avoid new op types entirely**,
  so this rule is dodged — a major risk reduction. (Documented in Key Decisions in case we later opt
  into the heavy variants.)
- **D26/H8 eval-coverage HARD gate** (`plan038-wo-assistant-template-authoring`): every new assistant
  write tool needs a golden case or the CI eval fails. Covered by Unit 8.
- **WORKORDER-1/2/3** (`phase9-1-work-orders-enhancements-shipped`): completion writes the immutable
  op via `…Tx` inside one `runLedgerWrite`; pending-approval is attempt state, not op state; reject =
  `reverseOperationCore`; reservations are advisory (warn, never block). MAINTENANCE supply drains as
  OVERHEAD (not relevant here — cap management is an OPERATION on wine).
- **`invariant-drift.test.ts` is pre-broken** (SyntaxError since the rebrand) — ignore it in `vitest run`.

### External Research

None needed — this is entirely internal pattern reuse. Cap management (pumpover/punchdown/pulse-air)
is volume-neutral; délestage is a drain-and-return that the existing RACK core already models.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Cap-mgmt WO plumbing | Extract `capManagementTx`, dispatch in `execute.ts`, reuse `CAP_MGMT` op | New WO-only op | Reuses the proven volume-neutral op + reversal/correct/edit already wired for CAP_MGMT; mirrors `filterVesselTx` split verbatim |
| **Pulse-air modeling** | New `CapKind` string `"PULSE_AIR"` on `CAP_MGMT` | New `PULSE_AIR` `OperationType` | Pulse-air IS a cap-management aeration technique, volume-neutral like the others. `CapKind` is a validated string, not a DB enum → **no migration, no reverse/correct/edit/timeline wiring**. The op-type variant would touch ~8 files + an enum migration for zero added value |
| **Rack-and-return modeling** | Two linked `RACK` tasks (out: origin→holding; return: holding→origin) via one "Délestage" template, reusing `rackWineTx` | New single-op `DELESTAGE` `OperationType` | Keeps the single-`operationId`-per-attempt WO contract intact (a single completion writing TWO ops would break the attempt's `operationId`). Reuses RACK's capacity guards + `revertTransferCore` reversal. Each leg is one clean RACK op. The single-op variant needs an enum migration + a new reverse family — deferred |
| Batch completion shape | New `completeTasksBatchCore` looping `completeTaskCore`, N txs, per-item results | One giant tx for N tasks | `completeTaskCore` owns its own `runLedgerWrite` and has no `…Tx` variant; per-task isolation gives partial-failure tolerance (matches `bulkApproveTasksCore` UX). Client mints one `commandId` per task |
| Assistant issues cap-mgmt WOs | Add ONE focused `issue_cap_management_wo` write tool (SHOULD) | General `issue_work_order` tool; no tool | A focused tool is the highest-value, lowest-surface answer to "punch down 3,4,5"; a general WO-issuer is a larger design left for later. Non-admin (issuing is open in the UI); approval stays admin-gated |
| Batch actuals | Shared technique + duration for the batch, optional per-tank override | Per-tank only | Cap management is usually identical across the batch ("punch down all of them 2 min"); shared default with override is the fast path |

## Implementation Units

### Unit 1: Extract `capManagementTx` (the WO seam)

**Goal:** A `capManagementTx(tx, actor, input)` form that writes the `CAP_MGMT` op through a
caller-supplied transaction, so WO completion can compose it into its single `runLedgerWrite`.
**Files:** `src/lib/cellar/treatments.ts`
**Approach:** Mirror the existing `filterVesselTx` / `filterVesselCore` split in the same file.
Move `capManagementCore`'s guards (treatments.ts:57-65) and `runLedgerWrite` body (treatments.ts:74-108)
into `capManagementTx(tx, actor, input)`, reading residents via `tx.vesselLot.findMany` (or the
tx-aware balance helper) instead of the module-`prisma` `residentBalances`. Return `{ operationId,
treatmentIds, summary }`. Shrink `capManagementCore` to `runLedgerWrite((tx) => capManagementTx(...))`
so all existing `/bulk` + lot-detail callers keep working unchanged.
**Tests:** Unit test `capManagementTx` composes inside an outer `runLedgerWrite` and produces the same
op shape (empty lines, one LotTreatment per resident) as `capManagementCore`. Keep existing
cap-management tests green.
**Depends on:** none
**Patterns to follow:** `src/lib/cellar/treatments.ts` `filterVesselTx` (:137) / `filterVesselCore` (:221).
**Verification:** `npm run verify:cellar-ops` (asserts CAP_MGMT shape at verify-cellar-ops.ts:145); `vitest run`.

### Unit 2: `CAP_MGMT` WO task type + completion dispatch

**Goal:** A cap-management OPERATION task type that a completion routes into `capManagementTx`.
**Files:** `src/lib/work-orders/template-vocabulary.ts`, `src/lib/work-orders/execute.ts`,
`src/lib/work-orders/reservations.ts` (review only)
**Approach:** Add a `CAP_MGMT` entry to `TASK_VOCABULARY` with `kind:"OPERATION"`, `opType:"CAP_MGMT"`,
a `select` field `technique` constrained by `fieldOptions` (pumpover / punchdown / cold-soak /
maceration) + a `number` field `durationMin`, targeting one `vessel`. Add a `case "CAP_MGMT":` to
`dispatchOperationTx` (execute.ts:74) that pulls `technique`+`durationMin` from `actualPayload` (with
`task` column fallback), maps `technique`→`CapKind`, and calls `capManagementTx(tx, actor, {vesselId:
sourceVesselId, kind, durationMin, note})`, returning `{ operationId }` for the attempt. Cap management
is volume-neutral and consumes nothing → no reservation branch needed (confirm in `reservations.ts`).
**Tests:** WO completion of a CAP_MGMT task writes the CAP_MGMT op + attempt; PENDING_APPROVAL when not
auto-finalized; reject reverses via `reverseOperationCore` (CAP_MGMT is in `CELLAR_TYPES` / `CORRECTABLE`
already). Idempotent re-submit with same `commandId` is a no-op.
**Depends on:** Unit 1
**Patterns to follow:** `execute.ts:108` (`recordNeutralDoseTx` ADDITION/FINING case — nearest neutral
analog); `template-vocabulary.ts:98` (FILTRATION entry).
**Verification:** `npm run verify:work-orders`; `vitest run` work-orders tests.

### Unit 3: Default ferment "Cap management" template

**Goal:** A seeded system template so cap-management WOs are one click to issue.
**Files:** `src/lib/work-orders/system-templates.ts`, (re-run) `scripts/seed-work-order-templates.ts`
**Approach:** Add `SYS-CAP-MGMT` · "Cap management (pumpover / punchdown)" · category `Ferment`, one
`CAP_MGMT` task with a default `technique` and empty vessel (filled at issue). Optionally a second
recurring variant or rely on the `recurrence` field. Validate via `validateTemplateSpec` (the seed
script already does).
**Tests:** `validateTemplateSpec` accepts the new spec; seed upserts idempotently by `(tenantId, code)`.
**Depends on:** Unit 2
**Patterns to follow:** `system-templates.ts:18-121` (`SYS-FERMENT-MONITOR` ferment-category entry).
**Verification:** `npm run seed:work-order-templates` (Demo Winery) prints the new template; issue it in the UI.

### Unit 4: Batch-completion core + action

**Goal:** Complete the same technique across N tanks in one call, per-tank results, N txs.
**Files:** `src/lib/work-orders/execute.ts` (or a new `batch-complete.ts`), `src/lib/work-orders/actions.ts`
**Approach:** Add `completeTasksBatchCore(actor, { items: { taskId, commandId, actualPayload?,
completionNote? }[] })` that loops `completeTaskCore` (each in its own `runLedgerWrite`), catching
per-item and returning `{ taskId, ok, error? }[]` — no abort on partial failure. Add
`completeTasksBatchAction` computing `autoFinalize` server-side per task (as `completeTaskAction` does)
and revalidating once at the end. Reuse the existing HARVEST_WEIGH_IN block-access guard per item.
**Tests:** Batch of 3 CAP_MGMT tasks → 3 ops + 3 attempts; one bad task (e.g. inactive vessel) returns
`ok:false` for that item and `ok:true` for the rest; duplicate `commandId` in the batch is an idempotent
no-op for that item.
**Depends on:** Unit 2
**Patterns to follow:** `src/lib/work-orders/approval.ts:144` `bulkApproveTasksCore` (loop + per-item
catch + aggregate result); `actions.ts:149` `completeTaskAction` (server-side `autoFinalize`).
**Verification:** `vitest run` batch tests; `npm run verify:work-orders`.

### Unit 5: Batch-completion UI (multi-select on completion)

**Goal:** On the execute screen, select N open tasks of the same op type and complete them together.
**Files:** `src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx` (+ a small batch bar/sub-form)
**Approach:** Add a selection mode grouping open tasks by `opType`; when ≥2 of the same type are
selected, show a shared actuals form (for CAP_MGMT: technique + durationMin + note). Mint ONE
`commandId` per selected task (never reuse — a shared id would dedupe to a single write), call
`completeTasksBatchAction`, then surface per-tank pass/fail from the result. NICE: allow a per-tank
duration override before submit. Default falls back to today's single-task flow when only one is selected.
**Tests:** Component/integration: selecting 3 tanks + "punch down 2 min" issues 3 completions with 3
distinct commandIds; a partial failure renders which tank failed and why.
**Depends on:** Unit 4
**Patterns to follow:** `ExecuteClient.tsx:103` `complete()` (payload build + `crypto.randomUUID()`
commandId at :29); `VesselMultiSelect.tsx` for the multi-select affordance.
**Verification:** Run the app, issue a 3-vessel cap-management WO, batch-complete it; confirm 3 ledger ops.

### Unit 6: Pulse-air as a cap-management technique

**Goal:** Pulse-air selectable wherever cap technique is chosen (WO + `/bulk`), volume-neutral.
**Files:** `src/lib/cellar/treatments.ts` (`CapKind` + `CAP_KINDS`), `src/lib/lot/timeline.ts`
(`CAP_LABEL`), `src/lib/work-orders/template-vocabulary.ts` (add to the `technique` `fieldOptions`)
**Approach:** Add `"PULSE_AIR"` to the `CapKind` union + `CAP_KINDS` array (treatments.ts:30-36) and a
human label to `CAP_LABEL` (timeline.ts:10-15). Add it to the CAP_MGMT task's `fieldOptions` from Unit 2.
No migration (CapKind is a validated string, not a DB enum), no reverse/correct/edit changes (it rides
the existing `CAP_MGMT` op).
**Tests:** `capManagementTx` accepts `kind:"PULSE_AIR"` and writes a LotTreatment with that kind; timeline
renders the pulse-air label; `isCapKind("PULSE_AIR")` is true.
**Depends on:** Unit 1 (Unit 2 for the vocabulary option)
**Patterns to follow:** treatments.ts:30 (`CapKind`), timeline.ts:10 (`CAP_LABEL`).
**Verification:** `vitest run`; issue a pulse-air WO and complete it; check the lot timeline label.

### Unit 7: Rack-and-return (délestage) WO template

**Goal:** Issue "délestage tank 11 (rack to holding, return)" as a WO requiring a destination vessel.
**Files:** `src/lib/work-orders/system-templates.ts`, `src/lib/work-orders/template-vocabulary.ts`
(review RACK entry — likely no change), optionally a small helper for the linked pair
**Approach:** Reuse the existing `RACK` task type (which already requires `sourceVessel` + `destVessel`
and supports the "délestage" rack-type note). Add a `SYS-DELESTAGE` · "Délestage (rack & return)" ·
`Ferment` template with TWO RACK tasks: task 1 origin→holding (rackType "délestage"), task 2
holding→origin. Each completes as one clean RACK op (single `operationId` per attempt, reversal via
`revertTransferCore` already works). The destination requirement is inherent to RACK — no new op type,
no new core. Document the ordering expectation (complete "out" before "return"; reservations are
advisory so order is not hard-enforced — acceptable for v1).
**Tests:** `validateTemplateSpec` accepts the two-task spec; issuing it with origin+holding creates two
RACK tasks; completing both yields origin→holding then holding→origin ops; capacity guard fires if the
holding vessel lacks headroom.
**Depends on:** none (independent of Units 1–6)
**Patterns to follow:** `template-vocabulary.ts:67` (RACK entry), `execute.ts:75` (RACK dispatch, already
present), `system-templates.ts` two-task `SYS-HARVEST-WEIGH-IN`.
**Verification:** `npm run verify:work-orders`; issue + complete a délestage WO in the app.

### Unit 8: Assistant `issue_cap_management_wo` write tool + eval golden (D26/H8 gate)

**Goal:** "Punch down tanks 3, 4, 5 this afternoon" issues a cap-management WO by chat, with confirmation.
**Files:** `src/lib/assistant/tools/work-orders-write.ts` (new), `src/lib/assistant/registry.ts`,
`src/lib/assistant/commit.ts`, `test/evals/assistant-write-tools.golden.ts`,
`test/evals/assistant-fleet.golden.ts`
**Approach:** New `kind:"write"` tool `issue_cap_management_wo` whose `run()` resolves vessel NAMES→ids
(reuse `resolveVessel`/`listMaterials` helpers as `add-addition.ts` does), builds a
`CreateWorkOrderInput` with one CAP_MGMT `CreateTaskInput` per vessel (technique + optional duration +
due date), `signProposal("issue_cap_management_wo", resolvedArgs)`, returns `{ needsConfirmation, preview,
token }`. Paired `commitIssueCapManagementWo` Committer in `COMMITTERS` calls `createWorkOrderAction`
then `issueWorkOrderAction`. Non-admin (issuing is open in the UI; approval stays admin-gated via
`canApprove`). Add a golden case (satisfies the coverage guard) + a fleet confusability case
(issue-a-WO vs. record-a-single-cap-op).
**Tests:** Golden case `{ utterance:"punch down tanks 3, 4, 5 this afternoon", tool:"issue_cap_management_wo",
args:{ technique:"punchdown", vessels:["tank 3","tank 4","tank 5"] } }` passes the structural + coverage
guard; committer creates + issues a WO with 3 tasks; nonce is single-use.
**Depends on:** Unit 2
**Patterns to follow:** `src/lib/assistant/tools/templates-write.ts:82` (`create_template` run+committer),
`confirm.ts:29` (`signProposal`), `commit.ts:66` (`commitProposal` nonce burn),
`assistant-write-tools.golden.ts:107` (`add_addition` golden case).
**Verification:** `vitest run test/evals/assistant-tools.eval.test.ts` (coverage guard green);
optional gated LLM eval `ASSISTANT_EVAL=1`.

### Unit 9: Verify + brain refresh (governed WO code touched)

**Goal:** End-to-end proof + keep the living docs / invariant register honest (ship-phase requirement).
**Files:** `scripts/verify-work-orders.ts` (extend), `docs/architecture/system-map.md`,
`docs/architecture/invariants/` (WORKORDER-1/2/3 notes — verify their `verify:` guards still hold),
`docs/.brain-refresh-marker`
**Approach:** Extend `verify:work-orders` with a cap-management completion + reject-reverse case and a
batch-completion case. Since `src/lib/work-orders/*` and a cellar core were touched, refresh the
system-map §10 (work orders) to list the CAP_MGMT task type + batch completion + délestage template,
and update the brain-refresh marker (the `/ship` phase-boundary loop). Confirm `npm run verify:invariants`
+ `verify:tripwires` stay green (both are HARD PR gates).
**Tests:** `npm run verify:work-orders` covers cap-mgmt complete + reject; batch path exercised.
**Depends on:** Units 2, 4, 6, 7
**Patterns to follow:** existing `scripts/verify-work-orders.ts` cases; `docs/architecture/system-map.md` §10.
**Verification:** `npm run verify:work-orders`, `npm run verify:invariants`, `npm run verify:tripwires`,
`npm run build`, `vitest run`.

## Test Strategy

**Unit tests:** `capManagementTx` composition (Unit 1); WO CAP_MGMT complete/reject/idempotency (Unit 2);
batch partial-failure + distinct-commandId (Unit 4); pulse-air CapKind (Unit 6); délestage two-task spec
(Unit 7); assistant golden coverage guard + committer (Unit 8). Framework: vitest (`vitest run`).
**Integration / verify scripts:** `npm run verify:work-orders` (cap-mgmt + batch + reject-reverse),
`npm run verify:cellar-ops` (CAP_MGMT op shape unchanged), `npm run verify:reverse` (CAP_MGMT reversal).
**Manual verification (end-to-end):** In Demo Winery — (1) seed templates; (2) issue a cap-management WO
across tanks 3/4/5 (multi-select), batch-complete "punchdown 2 min", confirm 3 ledger ops + timeline
labels; (3) issue + complete a pulse-air WO; (4) issue a délestage WO (origin + holding), complete both
legs, confirm two RACK ops; (5) chat "punch down tanks 3, 4, 5 this afternoon" → confirm the proposal →
WO issued; (6) reject a completed cap-mgmt task → op reversed.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `capManagementTx` extraction subtly changes the `/bulk` cap-mgmt behavior | LOW | MED | Keep `capManagementCore` as a thin wrapper; existing cap-mgmt tests + `verify:cellar-ops` must stay green |
| Batch completion reuses one `commandId` → silent single write | MED | HIGH | Mint one `commandId` per task client-side (Unit 5); test asserts N distinct ids → N ops |
| Délestage two-task ordering (return before out) confuses users | MED | LOW | Reservations are advisory (warn); template orders out→return; document the expectation; v1 does not hard-enforce order |
| Assistant WO-issue tool ships without a golden → CI eval fails | LOW | MED | Unit 8 adds the golden case in the same unit; coverage guard is deterministic and runs in `vitest run` |
| Someone later opts into a real `PULSE_AIR`/`DELESTAGE` op type and skips the enum-migration isolation rule | LOW | HIGH | Explicitly out of scope here; Key Decisions records the rule if revisited |
| Governed WO code touched without brain refresh (ship gate) | MED | LOW | Unit 9 refreshes system-map + marker; `verify:invariants`/`verify:tripwires` are HARD gates |

## Success Criteria

- [ ] A cap-management WO can be issued across multiple vessels and completed (single or batch),
      each writing a `CAP_MGMT` ledger op via `capManagementTx` inside one `runLedgerWrite`.
- [ ] Reject of a completed cap-mgmt task reverses the op via `reverseOperationCore`.
- [ ] Pulse-air is selectable as a technique and records a `CAP_MGMT` op.
- [ ] Délestage is issuable as a WO requiring a destination vessel; both legs complete as RACK ops.
- [ ] Batch completion returns per-tank pass/fail and mints one `commandId` per task.
- [ ] `issue_cap_management_wo` assistant tool issues a WO via the signed-proposal confirm path and
      has a passing golden eval case (D26/H8 gate green).
- [ ] No new `OperationType` and no enum migration.
- [ ] `verify:work-orders`, `verify:cellar-ops`, `verify:invariants`, `verify:tripwires`, `build`,
      and `vitest run` all green (ignoring the pre-broken `invariant-drift.test.ts`).
- [ ] system-map §10 + brain-refresh marker updated.
