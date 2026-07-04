---
title: De-stem/Crush + Press/Saignée as Work-Order Blocks
type: feat
status: draft
date: 2026-07-03
branch: feat/work-order-transform-blocks
depth: deep
units: 8
---

## Overview

Let a work-order template include **De-stem / crush** and **Press / saignée** blocks, and let the crew
record them ON the work order with the same inputs they use in the standalone screens today (crush:
which harvest picks + kg, destination, measured output volume, crusher on / crush %, must temp; press:
the fraction cuts to their vessels, lees loss, press cycle, PRESS vs SAIGNEE). The blocks reuse the
existing, proven `crushLotCore` / `pressLotCore` transform engines and their reversal — the work is
wiring those into the work-order execution lane plus building the two run-time entry forms.

## Problem Frame

The template builder (plan 034) lets tenants compose work orders from the simple cellar ops (rack,
addition, fining, topping, filtration) + maintenance/observation + checklist. But harvest/crush-pad
work — de-stemming/crushing fruit into must, and pressing must into wine fractions — is the busiest,
most error-prone part of the season and can't be put on a work order yet. Crush and press were left out
of the work-order engine's v1 because they're **transforms**: a crush consumes harvest *picks* and
originates a must lot; a press splits a lot into multiple *fractions* across vessels. Both produce new
lots + lineage, and both take list-shaped inputs that don't fit a flat task.

If we do nothing, the crush pad runs off paper or the standalone `/ferment` screens while everything
else moves to work orders — the one place a printed, assignable, reviewable sheet matters most is the
gap. The user is the winemaker/cellar lead who wants "crush block 12 into T-4, press lot X into these
cuts" as a real, trackable work order with the same fidelity as the standalone tools.

## Requirements

- MUST: A `CRUSH` ("De-stem / crush") and a `PRESS` ("Press / saignée") block selectable in the
  template builder (they are `kind: OPERATION`, so they land in the existing Operations group).
- MUST: At **run time on the work order** (the execute screen), the crew enters the full inputs:
  - Crush: select ≥1 harvest pick with per-pick kg, destination vessel(s), measured output volume (L),
    crusher on?, crush %, must temp, NEW-vs-ADD target, note.
  - Press: define ≥1 fraction (label / vessel / volume / estimated / merge-into), lees loss, press
    cycle, PRESS vs SAIGNEE, note.
- MUST: Completing the block does the **real transform** (must lot originated with yield; fractions →
  child lots + lineage) via the existing cores, inside the work-order's one ledger transaction.
- MUST: Rejecting the task reverses the transform (reuses the existing `reverseOperationCore` →
  `reverseTransformCore` path; a merged-fraction press is refused with a clear message).
- MUST: Template-settable defaults are the "what" only (destemmed, crusher on, crush %, must temp,
  press cycle, op) — never the picks/fractions/volumes (those are measured at run time).
- SHOULD: Detail + print surfaces render the blocks sensibly (picks/output for crush; fractions for
  press).
- MUST: No regression to the standalone `/ferment/crush` + `/ferment/press` screens or
  `verify:reverse-transform`.

## Scope Boundaries

**In scope:** wiring CRUSH + PRESS into the template vocabulary + the work-order execution lane; the two
native run-time sub-forms; dispatch; display surfaces; e2e proof. Reuse the existing transform cores +
reversal verbatim (behavior-preserving refactor only).

**Out of scope:**
- Any change to crush/press ledger math, yield, lineage, or cost logic (reuse as-is).
- The whole-cluster `FruitPressForm` direct-press path as a *separate* work-order block (crush already
  supports `outputForm: JUICE` + `opType: PRESS`; a dedicated whole-cluster WO block can come later if
  wanted — note it, don't build it).
- Multi-vessel crush *destinations[]* split in the WO sub-form v1 — support ONE destination in the WO
  form (the core supports multi-dest; the WO sub-form can add it later). Flag in the form.
- Schema changes — none. `CRUSH`/`PRESS`/`SAIGNEE` already exist in `OperationType`; no new tables.
- Staged crush-pad additions (the standalone crush form chains SO₂/enzyme) — out of v1; a separate
  ADDITION block on the same work order covers this.

## Research Summary

### Codebase Patterns

**Transform cores (reuse):**
- `crushLotCore(actor, input)` — [crush-core.ts](src/lib/transform/crush-core.ts); `CrushLotInput` =
  `picks[]` + destVesselId + outputVolumeL + optional `destinations[]` + target(NEW|ADD) +
  destemmed/crusherOn/crushedPct/mustTempC/pressCycle/note (+ Phase-8 fruit cost). Opens its own
  `runLedgerWrite` internally (~line 221).
- `pressLotCore(actor, input)` — [press-core.ts](src/lib/transform/press-core.ts); `PressLotInput` =
  parentLotId + sourceVesselId + `fractions[]` (destVesselId/volumeL/label/estimated?/mergeIntoLotId?/
  form?) + lossL + op(PRESS|SAIGNEE) + pressCycle + note. Opens its own `runLedgerWrite` (~line 171).
- Both are idempotent on `commandId` (unique on `LotOperation`).

**Work-order dispatch (the seam):** `dispatchOperationTx(tx, actor, task, payload, resolvedMaterial)`
in [execute.ts:60-126](src/lib/work-orders/execute.ts) is a `switch(task.opType)` that calls each
family's **tx-form** (`rackWineTx`/`recordNeutralDoseTx`/`topVesselTx`/`filterVesselTx`) inside the
work-order's pre-opened `runLedgerWrite`. CRUSH/PRESS need matching tx-forms.

**Reversal (already wired — verified):** `rejectTaskCore` calls `reverseOperationCore`
([approval.ts:89](src/lib/work-orders/approval.ts)); `reverseOperationCore`
([ledger/reverse.ts:62-63,145-146](src/lib/ledger/reverse.ts)) already dispatches
`CRUSH`/`PRESS`/`SAIGNEE` → `reverseTransformCore` ([transform/reverse.ts](src/lib/transform/reverse.ts),
which frees picks / returns drawn volume / voids new child lots and refuses merged-fraction undo). **No
new reject wiring needed — just an e2e test.**

**Vocabulary + run-time forms:** `TASK_VOCABULARY` + `canonicalColumns` + `instantiate*` in
[template-vocabulary.ts](src/lib/work-orders/template-vocabulary.ts). The generic run-time renderer is
`renderField` in [ExecuteClient.tsx](src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx) and
[NewWorkOrderClient.tsx](src/app/(app)/work-orders/new/NewWorkOrderClient.tsx) — flat fields only, so
CRUSH/PRESS need custom sub-forms that branch on `task.opType`.

**Standalone UIs to mirror:** [CrushClient.tsx](src/app/(app)/ferment/crush/CrushClient.tsx) (block/pick
selection, per-pick kg, NEW|ADD, dest vessel, output L, crusher on, crush %, must temp, note) and
[PressClient.tsx](src/app/(app)/ferment/press/PressClient.tsx) (lot picker, PRESS|SAIGNEE, cycle,
fractions table, lees loss, note). Copy their field logic + data reads (harvest picks list; parent lot +
its vessel/volume).

### Prior Learnings

- `LEARNINGS: 0` in the rstack store. Relevant auto-memory: [[phase6-ferment-complete]] (de-stem+press
  combined module, whole-cluster press, additions on all surfaces, **deleting a Neon lot = sequential
  non-tx FK-safe deletes** — matters for the e2e scrub), [[universal-timeline-undo-024a]] (024b
  reverseOperationCore dispatches CRUSH/PRESS/SAIGNEE; `verify:reverse-transform`; merged-fraction press
  refused), [[bulk-reads-vessel-component-not-ledger]] (blend lots skip the component projection),
  [[measurements-attach-to-one-lot]], [[demo-winery-testing-convention]], [[prisma-neon-migrations-windows]]
  (no migration expected here).

### External Research

None — no new libraries, no external APIs. Reuses in-repo transform engines.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Run-time entry | **Native** crush/press sub-forms in the WO execute screen | Deep-link to `/ferment` | User decision: full parity, the whole op recorded on the work order. |
| Block grouping | Fold into the existing **Operations** group (they're `kind: OPERATION`) | New "Harvest/transform" group | User decision. No picker change needed — kind-grouping already puts them there. |
| SAIGNEE | An `op` select (PRESS \| SAIGNEE) on the Press block | Separate SAIGNEE block | Matches `pressLotCore.op`; one block, one dispatch. |
| Enabling the cores | Extract `crushLotTx`/`pressLotTx` tx-forms; keep `*Core` as thin `runLedgerWrite` wrappers | Nest `runLedgerWrite` (would double-open a tx) | tx-forms compose into the WO's single ledger tx; standalone UIs unchanged. |
| List inputs (picks/fractions) | Live in the task `plannedPayload`/`actualPayload` JSON; canonical columns mirror only the primary dest / parent lot | Add columns/tables | The values are measured at run time; JSON is the right home; no schema change. |
| Template defaults | "What" only (destemmed/crusher/crush %/temp/cycle/op) | Also bake picks/fractions | Picks/fractions are run-time measurements — never a blueprint default. |
| Multi-dest crush in the WO form | v1 = single destination | Full `destinations[]` split | Keep the sub-form simple; the core keeps the capability for later. |

## Implementation Units

### Unit 1: Extract `crushLotTx` (behavior-preserving)

**Goal:** A `crushLotTx(tx, actor, input)` tx-form that runs the crush inside a caller's transaction; the
existing `crushLotCore` becomes a thin `runLedgerWrite(tx => crushLotTx(...))` wrapper.
**Files:** [crush-core.ts](src/lib/transform/crush-core.ts).
**Approach:** Move the body currently inside `runLedgerWrite(async (tx) => {…})` into `crushLotTx`; leave
input validation/idempotency resolution that must run before the tx where it is (mirror how
`recordNeutralDoseTx` splits pre-resolve vs tx-body). No logic change. `src/lib/transform` is governed
code — the PreToolUse hook will inject ledger/transform invariants; honor them.
**Tests:** none new; **characterization-first** — run `npm run verify:reverse-transform` and any crush
unit tests BEFORE and AFTER; outputs must match.
**Depends on:** none
**Execution note:** characterization-first (capture current behavior before refactor).
**Patterns to follow:** the tx-form/wrapper split in `rackWineTx` / `recordNeutralDoseTx`.
**Verification:** `verify:reverse-transform` green; standalone `/ferment/crush` still works.

### Unit 2: Extract `pressLotTx` (behavior-preserving)

**Goal:** Same refactor for press: `pressLotTx(tx, actor, input)` + `pressLotCore` wrapper.
**Files:** [press-core.ts](src/lib/transform/press-core.ts).
**Approach:** Identical pattern to Unit 1. Preserve the optimistic-lock (`expectedRevision`) + fraction
handling exactly.
**Tests:** characterization-first — `verify:reverse-transform` before/after.
**Depends on:** none
**Execution note:** characterization-first.
**Verification:** `verify:reverse-transform` green; standalone `/ferment/press` still works.

### Unit 3: Vocabulary entries for CRUSH + PRESS

**Goal:** Add the two blocks + their template-settable "what" defaults to the vocabulary.
**Files:** [template-vocabulary.ts](src/lib/work-orders/template-vocabulary.ts).
**Approach:** Add `CRUSH` (`kind:"OPERATION"`, `opType:"CRUSH"`, label "De-stem / crush", fields:
`destemmed`(select true|false), `crusherOn`(select), `crushedPct`(number), `mustTempC`(number),
`pressCycle`(text), `note`) and `PRESS` (`opType:"PRESS"`, label "Press / saignée", fields:
`op`(select PRESS|SAIGNEE), `pressCycle`(text), `note`). These are the only fields a template can
default; the picks/fractions/vessels/volumes are entered at run time (NOT vocabulary defaults). Extend
`canonicalColumns` so CRUSH maps `destVesselId` and PRESS maps `lotId`(parent)+`sourceVesselId` when
present in the payload (null at issue is fine — filled at execute). Add a `hint` on each noting
"picks/fractions are entered when the work order is run."
**Tests:** extend `test/work-order-templates.test.ts` — `validateTemplateSpec` accepts CRUSH/PRESS with
their defaults + rejects an out-of-vocab default; `instantiate*` maps them to `kind:"OPERATION"` with the
right `opType`.
**Depends on:** none
**Patterns to follow:** the existing FILTRATION/ADDITION vocabulary entries + `fieldOptions`.
**Verification:** `npm test -- work-order-templates` green.

### Unit 4: Dispatch CRUSH + PRESS in the work-order lane

**Goal:** `dispatchOperationTx` executes a crush/press task by calling the new tx-forms.
**Files:** [execute.ts](src/lib/work-orders/execute.ts).
**Approach:** Add `case "CRUSH"` and `case "PRESS"` that read the merged `actualPayload` (over planned):
crush → `{ picks[], destVesselId, outputVolumeL, target, destemmed, crusherOn, crushedPct, mustTempC,
pressCycle, note }`; press → `{ parentLotId, sourceVesselId, fractions[], lossL, op, pressCycle, note }`;
call `crushLotTx`/`pressLotTx`; return `{ operationId, message }`. **Validate at execution** (crush needs
≥1 pick + a positive output volume + a dest; press needs a parent lot + ≥1 fraction) with clear
`ActionError`s. The `commandId` flows through for idempotency (same as other ops).
**Tests:** covered by the Unit 8 e2e.
**Depends on:** Units 1, 2, 3
**Patterns to follow:** the RACK/ADDITION cases already in `dispatchOperationTx`.
**Verification:** a crush/press task completes and writes the real op (Unit 8).

### Unit 5: Native run-time sub-forms (the meat)

**Goal:** The execute screen renders a real crush form and a real press form for those tasks.
**Files:** [ExecuteClient.tsx](src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx) +
new `CrushTaskForm.tsx` / `PressTaskForm.tsx` in the same dir; the execute server page
[execute/page.tsx](src/app/(app)/work-orders/[id]/execute/page.tsx) to fetch the extra data.
**Approach:** In `TaskExecutor`, branch: `task.opType === "CRUSH"` → `CrushTaskForm`; `=== "PRESS"` →
`PressTaskForm`; else the existing generic renderer. **CrushTaskForm** mirrors CrushClient: a pick
multi-select (available harvest picks with per-pick kg, default remaining), destination vessel, measured
output L, crusher-on toggle, crush %, must temp, NEW-vs-ADD (+ target lot when ADD), note; prefilled from
the template's "what" defaults. **PressTaskForm** mirrors PressClient: a fractions table
(label/vessel/volume/estimated/merge-into), lees loss (auto = available − Σ), press cycle, PRESS|SAIGNEE,
note; the parent lot + its current vessel/volume come from the task (lotId/sourceVesselId) or a picker.
On submit, pack picks/fractions into `actualPayload` and call the existing `completeTaskAction` (unchanged).
The server page fetches: available picks (mirror CrushClient's source), the parent lot + vessel/volume
for press, and vessel/lot pickers. Single-destination crush in v1 (note the multi-dest deferral).
**Tests:** none (interaction) — verified by the Unit 8 e2e (core path) + manual/QA + design review.
**Depends on:** Unit 4
**Patterns to follow:** CrushClient.tsx / PressClient.tsx field logic; the existing `TaskExecutor` shape.
**Verification:** issue a WO with a crush + a press block, complete both from the execute screen against
Demo Winery data.

### Unit 6: New-WO issue form tolerates CRUSH/PRESS blocks

**Goal:** Issuing a template that contains a crush/press block doesn't break the new-WO form.
**Files:** [NewWorkOrderClient.tsx](src/app/(app)/work-orders/new/NewWorkOrderClient.tsx).
**Approach:** The generic per-task renderer + multi-vessel fan-out (`buildsForTask`) must not mis-handle
CRUSH/PRESS. For these blocks at ISSUE, render only the "what" defaults (read-only or editable) + a clear
"picks and fractions are entered when the crew runs this" note; do NOT run the addition/vessel fan-out.
The block still becomes a task carrying its planned defaults.
**Tests:** none (thin) — manual.
**Depends on:** Unit 3
**Patterns to follow:** the existing task-loop + `buildsForTask` in NewWorkOrderClient.
**Verification:** a template with a crush block issues a WO with a CRUSH task in PENDING.

### Unit 7: Display surfaces (detail + print)

**Goal:** Detail, execute-recorded, and print views render crush/press tasks with human labels.
**Files:** [WorkOrderDetailClient.tsx](src/app/(app)/work-orders/[id]/WorkOrderDetailClient.tsx),
[PrintClient.tsx](src/app/(app)/work-orders/[id]/print/PrintClient.tsx), and the print builder in
[data.ts](src/lib/work-orders/data.ts) (`typeLabel`/`rows`).
**Approach:** These already switch on `kind`/`opType`; CRUSH/PRESS are OPERATION so they inherit the
generic label. Add opType-specific print rows: crush → picks summary + output volume + dest; press →
fractions (label → vessel, volume) + loss + op. Resolve ids to codes (reuse the print resolver).
**Tests:** the Unit 8 e2e asserts the print view has no raw cuids + shows the fractions/output.
**Depends on:** Unit 4
**Patterns to follow:** the ADDITION dose-row logic already in the print builder.
**Verification:** print a completed crush + press WO; rows are human-readable.

### Unit 8: e2e guard + reject/reverse proof

**Goal:** Prove the whole loop against Demo Winery, including reversal.
**Files:** `scripts/verify-work-orders-transform.ts` (new) + a `verify:work-orders-transform` npm script;
extend `test/work-order-templates.test.ts` if needed.
**Approach:** Under `runAsTenant("org_demo_winery", …)`, seed a harvest pick + fruit, then: (1) issue a WO
with a CRUSH block, complete it via `completeTaskCore` with picks + output volume → assert a real must
lot + yield + the op; (2) issue a WO with a PRESS block on that lot, complete with 2 fractions → assert
2 child lots + lineage + drawn/loss; (3) **reject** a transform task → assert `reverseTransformCore` ran
(must lot corrected / fractions voided); (4) assert a merged-fraction press refuses undo with the clear
message. Scrub sequentially (FK-safe, per [[phase6-ferment-complete]]). Keep `verify:reverse-transform`
+ `verify:work-orders` + `verify:work-orders-enhancements` green.
**Tests:** the script is the test.
**Depends on:** Units 4, 5
**Patterns to follow:** `scripts/verify-work-orders-enhancements.ts` structure + the crush/press verify
scripts.
**Verification:** `npm run verify:work-orders-transform` green (run `npm run seed:demo-tenant` first).

## Test Strategy

**Unit (Vitest):** extend `test/work-order-templates.test.ts` for CRUSH/PRESS validate + instantiate.
**Characterization:** `verify:reverse-transform` before/after the Unit 1–2 refactors (behavior-preserving
proof for the standalone paths).
**E2E (Demo Winery):** new `verify:work-orders-transform` covering crush → press → reject/reverse +
merged-fraction refusal + print resolution.
**Manual/QA + design review:** the two run-time sub-forms on the execute screen (mobile/floor-first).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| tx-form extraction changes crush/press behavior | MED | HIGH | Characterization-first: `verify:reverse-transform` + standalone screens before/after (Units 1-2). |
| Nested transaction (core opening a 2nd `runLedgerWrite` inside the WO tx) | MED | HIGH | The whole point of Units 1-2: dispatch calls the tx-form, never the `runLedgerWrite` wrapper. |
| Picks/fractions data absent or malformed in payload at execute | MED | MED | Validate at execution (≥1 pick + output for crush; ≥1 fraction for press) with clear ActionErrors (Unit 4). |
| Canonical columns null for transform tasks confuses reservations/dashboard | LOW | LOW | Transforms don't reserve like simple ops; JSON is authoritative; note it. |
| Sub-form complexity (pick multi-select, fractions table) on mobile | MED | MED | Mirror the proven CrushClient/PressClient UX; desktop/tablet-first for the crush pad; design review. |
| Merged-fraction press can't be rejected | LOW | LOW | Already refused by reverseTransformCore with a message; surface it (Unit 8 asserts it). |
| Whole-cluster direct press expectation | LOW | MED | Out of scope v1 (crush supports JUICE output); note it so it isn't a silent gap. |

## Success Criteria

- [ ] A template can include De-stem/crush and Press/saignée blocks (builder, Operations group).
- [ ] The crew completes a crush on the work order (picks + kg + output) → real must lot + yield.
- [ ] The crew completes a press on the work order (fractions) → child lots + lineage.
- [ ] Rejecting a crush/press task reverses it; a merged-fraction press refuses undo with a clear message.
- [ ] Template "what" defaults prefill; picks/fractions are run-time only.
- [ ] Detail + print render crush/press with human labels, no raw ids.
- [ ] `verify:work-orders-transform` green; `verify:reverse-transform` / `verify:work-orders` /
      `verify:work-orders-enhancements` still green; standalone `/ferment/crush` + `/ferment/press`
      unchanged; `npm run build` + full suite green; no schema migration.
