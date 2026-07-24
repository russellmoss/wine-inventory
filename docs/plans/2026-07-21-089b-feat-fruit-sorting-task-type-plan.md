---
title: Fruit sorting as a first-class work-order task type
type: feat
status: draft
date: 2026-07-21
branch: claude/fruit-intake-sorting-category-9eb129
depth: standard
units: 8
note: renumbered from 090 -> 089b on rescue; 090 was reused by the KB-RAG retrieval plan
status_note: RESCUED from an orphaned worktree 2026-07-24, never merged, never reviewed
---

## Overview

Add a `SORTING` task type to the work-order vocabulary so a winery can plan and record a fruit-sorting
step during harvest intake: who sorted, how (hand table vs optical sorter), on which block's fruit, with
which equipment. It is a RECORD-ONLY observation — no ledger op, no weight change, no cost effect.

This comes from Demo Winery `BUG_REPORT cmrqr0h2d0003kz04prhpu9d2`: *"we should add a work order category
under fruit intake that is sorting."* An `AGENTIC_FIX` run correctly declined it as a minimal bug fix.

## Problem Frame

Sorting is a real, universal, planned harvest operation and today it is invisible in the app. A cellar
crew that hand-sorts on a table, or runs a Pellenc optical sorter, has nowhere to say so. Their only
option is a free-text `NOTE` checklist item, which records nothing structured — you cannot later ask
"which blocks did we optically sort in 2026?" or "how much crew did sorting take last harvest?"

Doing nothing costs credibility with the reporter (a real winemaker asking for a table-stakes harvest
step) more than it costs data. The cost of inaction is low-severity but it is a visible gap in the
fruit-intake lane, which is otherwise well covered (weigh-in, crush, press).

**Pressure test:** the winemaker was asked directly whether sorting should change the weight on the
books (sorting discards rot, raisins, jacks, MOG) and said no — the discarded fraction is immaterial,
and `CRUSH` already captures a MEASURED output volume at run time, so the loss is absorbed implicitly.
That answer is what makes this small. If it had been yes, this would be a governed ledger operation and
a much larger plan.

## Requirements

- MUST: `SORTING` exists as an `OBSERVATION`-kind task type in `TASK_VOCABULARY`, record-only.
- MUST: no ledger operation, no `StockMovement`, no weight/volume change, no cost or yield effect.
- MUST: a `method` select (hand table / optical / both) that drives which fields are relevant.
- MUST: equipment comes from the EXISTING generic per-task equipment picker (`equipmentIds`).
- MUST: the task targets a vineyard BLOCK (matching `HARVEST_WEIGH_IN`), not a lot or vessel.
- MUST: appear in the builder palette under the existing "Fruit & press" category.
- MUST: a block-carrying `SORTING` task is subject to the same manager-vineyard access guard as a weigh-in.
- SHOULD: a system template that includes a sorting task, and that actually reaches a live tenant.
- SHOULD: authorable from natural language / the assistant, like every other task type.
- NICE: a `sorter` equipment kind so a Pellenc or sorting table is first-class rather than "other".

## Scope Boundaries

**In scope:**
- The `SORTING` task type end-to-end: vocabulary → builder → execute → completion → print/detail.
- Making `block` a renderable field type in the GENERIC execute renderer.
- Widening the vineyard-access guard to any block-targeted observation.
- A `SYS-FRUIT-SORTING` system template + generalizing the seed script beyond Demo Winery.

**Out of scope:**
- **Fruit contracts / purchased fruit.** A known-unbuilt gap. Sorting targets a `VineyardBlock` today;
  keep the targeting seam clean so a future contracted-fruit target can join it, but build nothing.
- **Any ledger/cost effect from sorting.** Explicitly decided against.
- **A `stage` field** (cluster / berry / pre-press / pre-tank). Expressed by task title + position and
  dependencies within the work order, which the WO engine already handles.
- **A toggle on the fruit-intake flow.** The palette task + template are the surfacing.
- **Backfilling the existing `SYS-HARVEST-WEIGH-IN` template.** See Decision D5 — a new template code is
  used precisely because the seeder cannot version-bump an existing one.

## Research Summary

### Codebase Patterns

**The observation lane already does what we need, for free.** `completeObservationTaskCore`
(`src/lib/work-orders/observations.ts:20`) writes an `AnalysisPanel` only when `readings.length > 0 &&
lotId`. With zero readings it falls through to: create a `WorkOrderTaskAttempt` with `status: "APPROVED"`,
`operationId: null`, `actualPayload: merged`, compare-and-swap the task to `DONE`, bump the WO rollup,
write audit. That is exactly a record-only sorting completion.

**Consequence: `SORTING` needs NO new completion core.** This matters beyond code size —
`scripts/verify-ai-native.mjs` only flags `src/lib/**/*-core.ts` files exporting a `*Core` symbol, so by
reusing the existing core we incur no new `core → assistant tool` coverage obligation. Do NOT create a
`sorting-core.ts`.

- `HARVEST_WEIGH_IN` def: `src/lib/work-orders/template-vocabulary.ts:292` — the shape to mirror
  (`kind: "OBSERVATION"`, `observationType`, a `blockId: "block"` field, a `hint` explaining run-time entry).
- Its dedicated core (`src/lib/work-orders/harvest-observations.ts:27`) exists ONLY because a weigh-in
  writes a `HarvestPick`. Sorting writes nothing, so it needs no equivalent.
- Palette grouping: `categoryFor()` at `src/app/(app)/work-orders/new/WorkOrderBuilderClient.tsx:83`
  already returns "Fruit & press" for `HARVEST_WEIGH_IN | CRUSH | PRESS`.
- Per-task equipment is already generic: `equipmentIds` on `BuilderTask`
  (`src/app/(app)/work-orders/new/WorkOrderBuilderClient.tsx:121`), with the tenant equipment list already
  passed into the builder. No bespoke equipment field is needed.
- Payload safety: `sanitizeTaskPayload` (`src/lib/work-orders/payload-guard.ts:34`) strips
  `RESERVED_PAYLOAD_KEYS`. Built-ins keep non-reserved keys, so `method`/`crewSize`/etc. flow through.
- Display overlays: `HIDEABLE_FIELDS_BY_TASK_TYPE` (`src/lib/work-orders/overlays.ts:12`) needs a
  `SORTING` entry or nothing is hideable (safe default, but we want `note` and the optional fields hideable).
- Print/detail rows: `src/lib/work-orders/data.ts:374` shows the `{...planned, ...actual}` merge pattern
  to copy for sorting's rows.
- Readiness: `proposal-readiness.ts:95` — `HARVEST_WEIGH_IN` is `state: "runtime"` with `runtimeFields`.
  Sorting is the same shape (block chosen on the floor).

### Two blocking gaps found during research

**1. The generic execute renderer cannot draw a block field.** `renderField` returns `null` for
`type === "block"` (`src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx:72`), with a comment saying
a block field "only appears on HARVEST_WEIGH_IN, which is dispatched to its own sub-form". A `SORTING`
task with a `blockId: "block"` field would render nothing on the execute screen. This is the single
largest piece of real work in the plan (Unit 2).

**2. The vineyard-access guard is keyed to `HARVEST_WEIGH_IN` by name.**
`src/lib/work-orders/actions.ts:390` runs `canManagerAccessVineyard` only when
`task.observationType === "HARVEST_WEIGH_IN"`. A block-carrying `SORTING` task would bypass it, letting a
manager pinned to Vineyard A record a sorting task against Vineyard B's block. Severity is low (sorting
writes no data of consequence) but the guard should be about *block-targeting*, not about one type name.

### Prior Learnings

- **`SYSTEM_TEMPLATES` do not reach live tenants.** Confirmed and worse than remembered:
  `scripts/seed-work-order-templates.ts` is hardcoded to `const DEMO_ORG_ID = "org_demo_winery"` (line 17)
  AND skips any template whose `code` already exists (lines 25-29). So editing the existing
  `SYS-HARVEST-WEIGH-IN` spec in place would be a **silent no-op** even after re-running the seeder.
- **New `*-core.ts` files fail `verify:ai-native` until wired to an assistant tool.** Avoided here by design.
- **`npm run` up-resolves out of a worktree.** Run verification from the main checkout, which has `.env`.
- Naming: `NAMING-2` / the `verify:naming` gate must stay green before and after.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| D1. Governance | Record-only `OBSERVATION`, no ledger op | Governed `OPERATION` with a sorted-out weight | Winemaker: discard is immaterial; `CRUSH` already measures actual output, so the loss is absorbed. Keeps this out of the ledger/cost blast radius entirely. |
| D2. Completion core | Reuse `completeObservationTaskCore` unchanged | A dedicated `completeSortingTaskCore` | The generic path already handles a readings-less observation. No new core = no new `verify:ai-native` obligation. |
| D3. Block rendering | Make `block` a first-class type in the GENERIC renderer | Give `SORTING` its own sub-form like `HarvestWeighInTaskForm` | Less code, and it makes every future block-targeted observation work for free — including contracted fruit later. A sub-form would duplicate the weigh-in form for no gain. |
| D4. Sorted-out weight | Omit entirely | Record `sortedOutKg` as a non-governed number | D1 says it has no economic effect; a number that looks like inventory but isn't is a trap. Can be added later if asked. |
| D5. Template | NEW code `SYS-FRUIT-SORTING` | Add a sorting task to the existing `SYS-HARVEST-WEIGH-IN` | The seeder skips existing codes and cannot version-bump, so editing in place lands nowhere. A new code seeds cleanly. |
| D6. Stage field | None | `stage` select (cluster/berry/pre-press/pre-tank) | Winemaker: task title + WO position/dependencies already express it. Sorting before the destemmer vs before the press are separate tasks in sequence. |
| D7. Equipment | Reuse generic `equipmentIds` | A bespoke `sorterId` field | Already built and already on every task. |

## Implementation Units

### Unit 1: Add the `SORTING` task type to the vocabulary

**Goal:** `SORTING` exists as a validated, record-only observation task type.
**Files:** `src/lib/work-orders/template-vocabulary.ts`, `src/lib/work-orders/overlays.ts`,
`src/lib/work-orders/proposal-readiness.ts`
**Approach:** Add a `SORTING` entry to `TASK_VOCABULARY` beside `HARVEST_WEIGH_IN`
(`template-vocabulary.ts:292`): `kind: "OBSERVATION"`, `observationType: "SORTING"`, label "Sorting",
fields `{ blockId: "block", method: "select", crewSize: "number", passRate: "text", note: "text" }` plus
whichever optical-specific keys the form needs (e.g. a machine program/preset as `text`). `fieldOptions.method`
comes from a new exported `SORT_METHODS` constant — put it in a client-safe vocab module (follow how
`CAP_KINDS` / `RACK_TYPES` are imported at the top of the file), not inline, so the execute form and tests
share one source. Add `FIELD_LABELS` entries for the new keys. Add a `hint` saying the block and readings
are entered when the work order is run. Add `SORTING: ["crewSize", "passRate", "note", ...]` to
`HIDEABLE_FIELDS_BY_TASK_TYPE` — deliberately leave `blockId` and `method` OFF the hideable list. Add a
`SORTING` entry to the readiness map as `state: "runtime"` with `runtimeFields: ["blockId"]`.
**Tests:** Extend `test/work-order-templates.test.ts` — `SORTING` validates; an unknown `method` value is
rejected by `validateTemplateSpec`; `sanitizeTaskPayload` strips reserved keys but keeps `method`;
`assertOverlaySafe` refuses to hide `blockId` and `method`.
**Depends on:** none
**Patterns to follow:** `template-vocabulary.ts:292` (`HARVEST_WEIGH_IN`), `overlays.ts:33`,
`proposal-readiness.ts:95`
**Verification:** `npx tsc --noEmit` and the templates test suite pass.

### Unit 2: Render `block` fields in the generic execute renderer

**Goal:** A `SORTING` task shows a working vineyard-block picker on the execute screen.
**Files:** `src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx`,
`src/app/(app)/work-orders/[id]/execute/page.tsx`, `src/lib/work-orders/harvest-weigh-in-data.ts`
**Approach:** This is the core of the plan. Replace the `if (type === "block") return null` guard at
`ExecuteClient.tsx:72` with a real `<select>` over accessible blocks, following the `vessel`/`lot` branch
immediately below it (`:90`). The options already exist: `loadHarvestWeighInFormData()` returns
access-scoped `WeighInBlockOption[]`. Rename nothing in that module for now, but widen the load condition
in `execute/page.tsx:23` — currently `hasWeighIn` — so blocks are also loaded when any task is a
block-targeted observation. Thread the block options into `TaskExecutor` the same way `pickers` is. Keep
the safety intent of the original comment: if no block options are available, render a disabled control
with an explanatory message rather than a raw text input.
**Tests:** The execute components are not unit-testable in this repo (no jsdom/RTL — see the assistant-dock
learning). Cover the pure part instead: a small pure helper that decides whether the execute page needs
block options given a task list, unit-tested under `environment: "node"`. The rendering itself is
manual-QA'd in Unit 8.
**Depends on:** Unit 1
**Patterns to follow:** `ExecuteClient.tsx:90` (the vessel/lot select), `harvest-weigh-in-data.ts:18`
**Verification:** `npx tsc --noEmit`; a `SORTING` task on the execute screen shows a populated block picker.

### Unit 3: Widen the vineyard-access guard to any block-targeted observation

**Goal:** A manager cannot record a sorting task against a block outside their vineyard membership.
**Files:** `src/lib/work-orders/actions.ts`
**Approach:** At `actions.ts:390` the guard is gated on `task.observationType === "HARVEST_WEIGH_IN"`.
Change the condition to fire whenever the task is block-targeted — i.e. it has a `blockId` column value or
an `actualPayload.blockId` — regardless of which observation type it is. Keep the existing error copy for
the weigh-in case and use neutral copy otherwise. This is a security-relevant edit to a governed path:
widen the guard, do not narrow or restructure the surrounding checks.
**Tests:** Unit-test the extracted predicate (which tasks require a block-access check) for: weigh-in with
block, sorting with block, sorting without block, a non-block observation. Assert the sorting-with-block
case returns true.
**Depends on:** Unit 1
**Patterns to follow:** `actions.ts:388-398`
**Verification:** `npx tsc --noEmit`; the new predicate test passes.

### Unit 4: Palette, builder, and template-editor surfacing

**Goal:** "Sorting" appears in the builder palette under "Fruit & press" and authors sensibly.
**Files:** `src/app/(app)/work-orders/new/WorkOrderBuilderClient.tsx`,
`src/app/(app)/work-orders/new/NewWorkOrderClient.tsx`,
`src/app/(app)/work-orders/templates/TemplateEditorClient.tsx`
**Approach:** Extend the `categoryFor()` predicate at `WorkOrderBuilderClient.tsx:85` to return
"Fruit & press" for `observationType === "SORTING"`. In `NewWorkOrderClient.tsx:384` and
`TemplateEditorClient.tsx:147` there is an `isWeighIn` flag that suppresses the field grid and shows a
"entered when the crew runs this" banner; generalize that flag to cover block-targeted run-time
observations so sorting gets the same treatment rather than rendering a dead block field at author time.
**Tests:** Unit-test `categoryFor` if it is exported; if not, export it (it is display-only) and test that
`SORTING` maps to "Fruit & press" and that the category ordering is unchanged.
**Depends on:** Unit 1
**Patterns to follow:** `WorkOrderBuilderClient.tsx:83-91`
**Verification:** `npx tsc --noEmit`; "Sorting" is visible in the palette under Fruit & press.

### Unit 5: Detail, print, and task-summary rendering

**Goal:** A sorting task reads as a real record on the WO detail page and the printed work order.
**Files:** `src/lib/work-orders/data.ts`, `src/lib/work-orders/task-summary.ts`,
`src/app/(app)/work-orders/[id]/WorkOrderDetailClient.tsx`
**Approach:** Add a `SORTING` branch to the print-row builder in `data.ts` following the
`HARVEST_WEIGH_IN` branch at `data.ts:374`: merge `{...planned, ...actualOf(t)}`, then push Block, Method,
and any populated optional rows. Add "Sorting" to the `typeLabel` chain at `data.ts:324` and the
equivalent badge chain in `WorkOrderDetailClient.tsx:113`. Give `buildTaskSummary` a sorting case so the
execute screen's read-only "do X to Y" line is truthful.
**Tests:** Extend the existing `buildTaskSummary` test file with a sorting case (block + method →
expected sentence), including the no-block-yet case.
**Depends on:** Unit 1
**Patterns to follow:** `data.ts:374-382`
**Verification:** Task-summary tests pass; a completed sorting task prints its block and method.

### Unit 6: Natural-language / assistant authoring

**Goal:** "sort the Block 3 fruit on the table before crush" drafts a sorting task.
**Files:** `src/lib/work-orders/nl-proposal.ts`, `src/lib/work-orders/nl-resolve.ts`,
`src/lib/assistant/tools/propose-work-order.ts`
**Approach:** Add `SORTING` to the intent union (`nl-proposal.ts:49`), to the kind list at
`nl-proposal.ts:197`, and to `NL_RUNTIME_KINDS` (`nl-proposal.ts:66`) since the block is a run-time input.
Add a parse branch alongside the `HARVEST_WEIGH_IN` branch at `nl-proposal.ts:572` and a resolve branch at
`nl-resolve.ts:734` that emits a `SORTING` taskBuild. Add `"SORTING"` to the tool's enum at
`propose-work-order.ts:349` and extend the `block` parameter description (`:385`) to mention sorting. Reuse
the existing block-name resolution at `propose-work-order.ts:157-166` — it already resolves a named block
to a real `VineyardBlock` id for weigh-ins; widen it to sorting rather than writing a second resolver.
**Tests:** Add NL-proposal cases: a sorting phrase yields a `SORTING` intent; a named block resolves; an
ambiguous block name still yields a task with the block unresolved (picker on the floor).
**Depends on:** Unit 1
**Patterns to follow:** `nl-resolve.ts:734-743`, `propose-work-order.ts:157-166`
**Verification:** NL proposal tests pass.

### Unit 7: System template + make the seeder able to reach a real tenant

**Goal:** A shipped "Fruit sorting" template that can actually land in a live tenant.
**Files:** `src/lib/work-orders/system-templates.ts`, `scripts/seed-work-order-templates.ts`
**Approach:** Add a `SYS-FRUIT-SORTING` entry to `SYSTEM_TEMPLATES` in category "Vineyard", next to
`SYS-HARVEST-WEIGH-IN` (`system-templates.ts:195`), whose spec is a single `SORTING` task with
instructions covering both hand and optical sorting. Use a NEW code rather than editing
`SYS-HARVEST-WEIGH-IN` (D5) — the seeder skips existing codes, so an in-place edit would silently do
nothing. Then generalize `scripts/seed-work-order-templates.ts`: replace the hardcoded
`DEMO_ORG_ID` (line 17) with a tenant id read from `process.argv`, defaulting to `org_demo_winery` so
existing usage and `npm run seed:work-order-templates` are unchanged. Keep the skip-if-exists behavior;
do NOT attempt a version-bump path in this plan (call it out in the PR as a known follow-up).
**Tests:** Extend `test/work-order-templates.test.ts` — every `SYSTEM_TEMPLATES` spec validates against
the resolved vocabulary (the existing loop at `:332` covers this automatically once the entry is added),
and template codes stay unique (`:346`).
**Depends on:** Unit 1
**Patterns to follow:** `system-templates.ts:195-206`
**Verification:** Templates test passes; seeding the Demo tenant creates `SYS-FRUIT-SORTING`.

### Unit 8 (optional): A `sorter` equipment kind

**Goal:** A Pellenc optical sorter or sorting table is first-class in the equipment registry.
**Files:** `src/lib/equipment/vocab.ts`
**Approach:** Add `"sorter"` to `EQUIPMENT_KINDS` (`vocab.ts:5`). `equipmentKindLabel` already
title-cases generically so it needs no change. Check for any exhaustive switch over `EquipmentKind`
before adding. This is genuinely optional — sorting works with equipment typed "other" — so build it
last and drop it if it turns out to touch a filter/migration surface.
**Tests:** Whatever equipment-vocab test exists; assert the new kind is present and labels correctly.
**Depends on:** none
**Verification:** `npx tsc --noEmit`; "Sorter" is selectable when creating equipment.

## Test Strategy

**Unit tests:** `test/work-order-templates.test.ts` for vocabulary/overlay/template validation, the
task-summary suite for rendering, an NL-proposal suite for authoring, and a new predicate test for the
block-access guard. All pure, all under the existing Vitest setup.

**What is NOT unit-testable:** the execute/builder React components — this repo has no jsdom/RTL, so
those are manual-QA only. That is a known constraint, not an omission. Push logic into pure helpers
(the block-options predicate in Unit 2, `categoryFor` in Unit 4) so the testable part is tested.

**Manual verification** (Demo Winery sandbox only, `QA-`-prefixed fixtures, in-app browser against
`localhost:3000` from the main checkout):
1. Builder palette shows "Sorting" under "Fruit & press".
2. Author a WO with a sorting task + attached equipment; issue it.
3. On the execute screen the block picker is populated; pick a block, pick a method, complete it.
4. Task goes straight to DONE with no approval gate and no ledger op.
5. WO detail and print show Block + Method.
6. Confirm no `Operation` / `StockMovement` row was written — verify with a short
   `runAsTenant("org_demo_winery", …)` script reading the attempt back, per the repo's DB-proof rule.

**Regression gates:** `npm run verify:naming`, `verify:invariants`, `verify:ai-native`, `verify:parity`
green before and after. Full `npx tsc --noEmit`, eslint, the test suite, and `npx next build` before merge.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| The `block` renderer change (Unit 2) regresses the weigh-in path | LOW | MED | `HARVEST_WEIGH_IN` is dispatched to its own sub-form BEFORE the generic renderer, so it never hits the changed branch. Verify weigh-in still works during manual QA anyway. |
| Widening the access guard (Unit 3) breaks weigh-in completion | LOW | HIGH | Widen the condition only; keep the existing weigh-in branch behavior and copy intact. Governed path — this edit will trip the brain-context PreToolUse hook; read the injected invariants. |
| `SORTING` payload keys are stripped somewhere unexamined | LOW | MED | `sanitizeTaskPayload` keeps non-reserved keys on built-ins (`payload-guard.ts:34`). Assert it explicitly in the Unit 1 test. |
| A future decision reverses D1 and sorting must affect weight | LOW | HIGH | Record D1 in the context-ledger with its rationale. Because sorting writes only an attempt payload, converting it later is additive, not a migration. |
| Scope creep into fruit contracts | MED | MED | Explicitly out of scope. Target `VineyardBlock` only; do not generalize the target column now. |

## Success Criteria

- [ ] "Sorting" is selectable in the work-order builder palette under "Fruit & press".
- [ ] A sorting task can be authored with a method and attached equipment from the equipment registry.
- [ ] On the execute screen the vineyard-block picker renders and is access-scoped.
- [ ] Completing a sorting task goes straight to DONE, writes an attempt, and writes NO ledger operation,
      NO `StockMovement`, and no cost/yield effect (proven by a `runAsTenant` read-back script).
- [ ] A manager cannot complete a sorting task against a block outside their vineyard membership.
- [ ] `SYS-FRUIT-SORTING` seeds into a tenant, and the seeder accepts a tenant id argument.
- [ ] The assistant can draft a sorting task from a natural-language request.
- [ ] `verify:naming`, `verify:invariants`, `verify:ai-native`, `verify:parity` green; tsc, eslint, tests,
      and `next build` pass.
- [ ] No new `*-core.ts` file was created.

## Confidence

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Direct from the reporter, with the governance question answered explicitly by the winemaker. |
| Scope Boundaries | HIGH | All five design forks were decided before planning. |
| Implementation Units | MEDIUM-HIGH | Units 1, 3-8 are well-understood small edits against read code. Unit 2 (block in the generic renderer) is the one place with real unknowns — the `TaskExecutor` prop threading was not read line-by-line. |
| Test Strategy | MEDIUM | Pure logic is well covered, but the two highest-risk changes are both in untestable React components. Manual QA carries real weight here, which is a standing repo constraint, not a plan defect. |
| Risk Assessment | HIGH | The dominant risk (ledger/cost blast radius) was designed out by D1/D2. |

**What would raise Unit 2's confidence:** reading `TaskExecutor`'s prop signature and the
`execute/page.tsx` loader end-to-end before writing code. `/work` should do that first.
