---
title: Clear, edit-gated work-order execution view — SO₂ additions tell "do X to Y with Z"
type: feat
status: completed
date: 2026-07-14
branch: claude/addition-execution-view-clarity
depth: deep
units: 5
---

## Overview

A cellarhand opening an SO₂ addition work order today sees a material-selection panel and a
bare "14" with no units, no total, no story. It should read like an instruction: **"Add 14 ppm
SO₂ to Tank 4 (Lot X) — ≈ 2.1 L of 10% KMBS solution."** And it should be a clean read-only
summary until they click **Edit**, not a live form they can fat-finger. This plan makes the
execution view summary-first and edit-gated for every task, and makes SO₂ additions compute and
show the real solution volume.

## Problem Frame

Reported from the app (a real bug/feedback item): the SO₂ addition WO execution view "is really
unclear — it just says 14 in amount at the bottom field," shows "the big material selection
panel" at execution when the material is already decided, never states units, and never says the
**total** to add. The user authored it via the assistant ("add 14 ppm SO₂ as a 10% KMBS solution
to T4") and expected the view to compute the liters of solution to pour. It didn't — because the
"10% KMBS" is dropped at authoring and there's no dosing math wired to the view.

Broader principle the user stated: **execution views must always tell a very clear story — "do
this to this with this amount"** — and must not be directly editable until you click Edit.

Who/why: the cellarhand on the floor executing the task. If the view is ambiguous, they under- or
over-dose SO₂ (a real wine-safety + compliance risk), or they accidentally edit a planned value.
Doing nothing keeps a core daily flow confusing and error-prone.

Note (scope honesty): #143 already made the addition material picker full-width on execute — that
fixed the "scrunched table" layout complaint, but not the clarity/edit-gate/computed-total core.

## Requirements

- MUST: the execute view for an ADDITION renders a **read-only summary** first — "Add {rate}
  {unit} {material} to {vessel} ({lot})" — with the material/amount/units clearly labeled, no
  raw picker visible until Edit.
- MUST: for an SO₂ addition dosed as a KMBS solution, the summary shows the **computed total
  solution volume** (e.g. "≈ 2.1 L of 10% KMBS solution") AND the SO₂/KMBS grams, computed from
  the vessel's **current** volume at render time (per the A3 "never frozen at issue" rule).
- MUST: the computed volume uses the **correct KMBS active-fraction (×0.576)** math, not the raw
  `so2AsLiquidSolution` %SO₂ basis (the ~1.74× under-dose trap).
- MUST: nothing is directly editable until the user clicks **Edit**; Edit reveals the existing
  editable inputs (material picker, amount, units, solution %), and Save/Complete works as today.
- MUST: solution strength ("10% KMBS") is **captured and stored** on the task when authored (WO
  builder + assistant), so it survives to execution.
- SHOULD: the same summary-first + edit-gate treatment applies to **all** op tasks (rack, fining,
  topping, cap-mgmt…), reusing the existing print-view row story, so every execution view is clear.
- SHOULD: the assistant free-text parser understands "as a N% KMBS solution".
- NICE: units stated everywhere (ppm shown as "ppm (mg/L)"); barrel vs tank context in the total.

## Scope Boundaries

**In scope:**
- Land the pure SO₂ solution-dose resolver (`resolveSo2Dose`) on `main` (from the
  `claude/so2-solution-dosing` branch — Plan 062 Unit 1; pure + golden-tested, currently unwired).
- Capture + store `solutionPercentKmbs` on SO₂ additions (WO builder, NL, assistant tools).
- Execute view: summary-first + edit-gate wrapper for op tasks; rich addition/SO₂ summary.
- A shared pure summary builder so execute and print tell the same story.

**Out of scope:**
- Plan 062 Units 2–9 (the rest of SO₂-solution dosing beyond the resolver) — separate.
- Molecular-SO₂ targeting / free-SO₂-from-lab-reading dosing (that's `so2AdditionPlan`, a
  different entry point) — this plan handles the "add N ppm as X% KMBS" case the user described.
- Redesigning the bespoke CRUSH/PRESS/BOTTLE/HARVEST/GROUP sub-forms' internals (they already have
  purpose-built forms); they only inherit the outer summary-first/edit-gate wrapper if cheap.
- No DB migration — `solutionPercentKmbs` rides the existing `plannedPayload` JSON.

## Research Summary

### Codebase Patterns
- **Execute view:** `src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx` — additions fall
  through to the generic `TaskExecutor` (~L34–174); fields come from `TASK_VOCABULARY.ADDITION`
  in `src/lib/work-orders/template-vocabulary.ts` (L108–117: `vesselId, lotId, materialId, amount,
  doseUnit, note`). `renderField` shows `MaterialFilterPicker` (L56–72) + Amount (L96–109) +
  doseUnit `<select>` (L84–95, options `DOSE_UNIT_LABELS`). State seeded from `plannedPayload`
  (L36, 43). No summary, no edit-gate — inputs are live immediately.
- **Payload:** `prisma/schema.prisma` `WorkOrderTask.plannedPayload Json` (L3527) + canonical
  mirror cols; the schema comment (L3493–3498) says the payload snapshots the **rate + basis**,
  total is recomputed at open/complete from current volume. Addition payload keys today:
  `vesselId, lotId, materialId, amount, doseUnit, note` (+ advisory `plannedAmount/plannedUnit`
  on the NL path). **No** solution-concentration key. Payload allowlist enforced by
  `sanitizeTaskPayload` (`src/lib/work-orders/payload-guard.ts`) against `def.fields`.
- **"Do X to Y with Z" row model already exists:** `getWorkOrderPrintView` in
  `src/lib/work-orders/data.ts` (L270–417) → `rows: {label,value}[]`: vessel via `vLabel`
  ("Tank 4", L311), Lot, Material, `Dose = "{amount} {doseUnit}"` (L344), `Total to weigh out ≈
  {est}` (L346) via `computeDoseTotal`. Consumed only by the print page today.
- **Read-only-until-Edit pattern:** `src/app/(app)/lots/[id]/LotDetailClient.tsx` — `editMode`
  state (L951), toggle button (L1071–1075), rows reveal edit controls only when `editMode`
  (`OpRow` L554, `MeasurementRow` L698…). Best mirror for the execute gate.
- **Dose math:** `src/lib/cellar/additions-math.ts` (`computeDoseTotal`, `convertDoseToStock`,
  `DOSE_UNIT_LABELS`, `resolveDoseUnit`); `%` deliberately excluded as a dose basis (L17–18).
- **Assistant/NL authoring drops the solution:** `nl-proposal.ts` intent (L23) has only
  `material, amount, unit` — no concentration; free-text regex (L579–586) captures
  `add N unit material to vessel` only. `nl-resolve.ts` (L498–519) stores `amount`+`doseUnit`
  (+advisory stock qty). `propose-work-order.ts` / `add-addition.ts` schemas: `material/amount/unit`
  only. So "10% KMBS solution" is parsed away.

### The SO₂ resolver we need (dependency)
- `src/lib/winemaking-calc/so2.ts` (main): `KMBS_SO2_FRACTION = 0.576`, `so2AsLiquidSolution({…
  concentrationPct …})` where `concentrationPct` is **%SO₂**, not %KMBS (the 1.74× trap). Also
  `so2AdditionPlan` (molecular-target driven — out of scope here).
- Branch `claude/so2-solution-dosing` commit `99d91dc` adds `src/lib/cellar/so2-dose.ts`:
  `resolveSo2Dose({ ppm, volumeL, solutionPercentKmbs }) → { so2Grams, kmbsGrams, solutionMl }`.
  It correctly does `concentrationPctSO2 = pct × 0.576` before calling `so2AsLiquidSolution`, and
  is locked by `test/so2-dose.test.ts` (golden vs the winery's 10% KMBS PDF, guards the 1.74×
  trap). **Pure, tested, and referenced nowhere** — it just needs landing + wiring.

### Prior Learnings
- `[[plan062-so2-solution-dosing]]` — Unit 1 (`resolveSo2Dose`) is exactly this dependency; the
  ×0.576 gotcha is the whole point. `[[feedback-html-entity-garbling-fix]]` logged this exec-view
  report as needing its own plan. `[[build-in-main-checkout-not-worktrees]]` — build in the main
  checkout. `[[assistant-dock-history-shipped]]` — repo has NO jsdom/RTL → execute-view UI is
  manual-QA-only; unit-test the pure summary builder + resolver, not the component.
- `[[plan053-work-order-builder-drafted]]` — `check` CI does NOT run `next build`; run `npx next
  build` before merging a UI PR. `review` bot flakes "max turns" on big diffs (benign).

### External Research
None — no new framework. All internal.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Where solution strength lives | New optional `solutionPercentKmbs` key in the ADDITION `plannedPayload` (allowlisted in `TASK_VOCABULARY.ADDITION.fields`) | New Prisma column | JSON payload already carries planned inputs; no migration; matches how `doseUnit`/`amount` ride the payload. |
| When solution volume is computed | At **render** time from the vessel's current volume via `resolveSo2Dose` | Freeze mL at authoring | Honors the existing A3 rule (total recomputed from then-current volume, never frozen). Volumes change between issue and execution. |
| The dosing math | Land + wire the branch's `resolveSo2Dose` (handles ×0.576) | Call `so2AsLiquidSolution` directly | Direct call is the 1.74× under-dose trap. The resolver is purpose-built and golden-tested. |
| Summary story source | Extract a shared pure builder reused by both print (`getWorkOrderPrintView`) and execute | Duplicate row logic in the execute view | One source of truth → print and execute never drift. |
| Edit-gate | Summary-first; `editMode` toggle reveals the existing inputs unchanged (mirror `LotDetailClient`) | Rewrite the executor inputs | Lowest-risk: the proven editable form is untouched, just gated behind a clear summary. |
| SO₂ detection | Show the solution line only when material kind is `SO2` AND a `solutionPercentKmbs` is present (rate unit ppm/mg/L) | Show for all additions | Only SO₂-as-KMBS-solution has this computation; other additions keep the generic total. |

## Implementation Units

### Unit 1: Land the SO₂ solution-dose resolver on main

**Goal:** `resolveSo2Dose` (correct ×0.576 ppm→solution-mL math) lives on `main`, tested.
**Files:** `src/lib/cellar/so2-dose.ts`, `test/so2-dose.test.ts` (both from branch commit `99d91dc`).
**Approach:** Bring the two files from `claude/so2-solution-dosing` onto this branch (cherry-pick
the commit or copy the files). Pure function, imports `KMBS_SO2_FRACTION`, `so2AsKmbs`,
`so2AsLiquidSolution` from `@/lib/winemaking-calc/so2`. No other branch changes come with it.
**Tests:** the branch's `test/so2-dose.test.ts` golden cases (10% KMBS PDF table; guards the 1.74×
trap). Confirm they pass on main.
**Depends on:** none
**Verification:** `npx vitest run test/so2-dose.test.ts` green.

### Unit 2: Capture + store `solutionPercentKmbs` on SO₂ additions

**Goal:** When an SO₂ addition is authored, its KMBS solution strength is stored on the task.
**Files:** `src/lib/work-orders/template-vocabulary.ts` (add optional `solutionPercentKmbs:
"number"` to `ADDITION.fields` so `sanitizeTaskPayload` keeps it; guard it as SO₂-only in the
hint), `src/lib/work-orders/nl-proposal.ts` (intent + canonicalize: accept `solutionPercentKmbs`;
free-text regex for "as a N% KMBS/metabisulfite solution"), `src/lib/work-orders/nl-resolve.ts`
(pass it into `values`), `src/lib/assistant/tools/propose-work-order.ts` +
`src/lib/assistant/tools/add-addition.ts` (add optional `solutionPercentKmbs` param, SO₂-only).
**Approach:** Additive, optional field end-to-end. Only meaningful when material kind is `SO2`;
otherwise ignored. Do not change the recompute-at-complete behavior — this is just a stored input.
**Tests:** `nl-proposal` parses "add 14 ppm SO2 as a 10% KMBS solution to T4" → intent carries
`solutionPercentKmbs: 10`; `nl-resolve` writes it into the task `values`; a non-SO₂ addition is
unaffected.
**Depends on:** none (data plumbing; independent of Unit 1)
**Patterns to follow:** `nl-resolve.ts` L498–519; `payload-guard.ts` allowlist; `add-addition.ts`
schema L47–58.
**Verification:** unit tests green; `npx tsc --noEmit`.

### Unit 3: Shared summary builder + summary-first, edit-gated execute wrapper (all op tasks)

**Goal:** Every op task's execute view opens as a clear read-only "do X to Y with Z" summary; Edit
reveals the current inputs.
**Files:** new `src/lib/work-orders/task-summary.ts` (pure: task + pickers → `{label,value}[]`
story, factored out of / shared with `getWorkOrderPrintView` in `data.ts`), refactor
`getWorkOrderPrintView` to reuse it, `src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx`
(wrap `TaskExecutor` in a summary-first shell with an `editMode` toggle mirroring
`LotDetailClient`; summary from `task-summary.ts`; inputs unchanged, just gated).
**Approach:** Extract the row logic so print + execute agree. Default view = summary + "Edit"
button; `editMode` reveals today's `renderField` inputs verbatim; Save/Complete unchanged. Keep
the bespoke sub-forms (crush/press/bottle/harvest/group) as-is inside the wrapper.
**Tests:** pure `task-summary.ts` unit tests (addition/rack/fining/topping → expected rows,
vessel+lot+dose lines).
**Depends on:** none (but reads better after Unit 2 for the addition rows)
**Execution note:** test-first for `task-summary.ts`.
**Patterns to follow:** `getWorkOrderPrintView` `data.ts` L270–417 (`vLabel`, dose rows);
`LotDetailClient.tsx` `editMode` L951/L1071–1075.
**Verification:** `npx next build`; manual QA — a RACK task shows a clear summary, Edit reveals
inputs, Save works.

### Unit 4: Rich SO₂ addition summary — computed solution volume

**Goal:** An SO₂-as-KMBS-solution addition reads "Add 14 ppm SO₂ to Tank 4 (Lot X) — ≈ 2.1 L of
10% KMBS solution (≈ 210 g SO₂ / 365 g KMBS)", computed from current vessel volume.
**Files:** `src/lib/work-orders/task-summary.ts` (SO₂ branch: when material kind `SO2` + rate unit
ppm/mg/L + `solutionPercentKmbs` present, call `resolveSo2Dose({ ppm, volumeL: currentVesselVolume,
solutionPercentKmbs })` and render solution-volume + grams rows, mL→L for readability),
`src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx` (surface those rows; in Edit mode show a
`solutionPercentKmbs` input for SO₂ additions).
**Approach:** Reuse Unit 1's `resolveSo2Dose`. Pull current vessel volume from the pickers bundle
(`getWorkOrderPickers` returns vessel volumeL). Only render for SO₂; other additions keep the
generic "total to weigh out". State units on every line.
**Tests:** `task-summary.ts` SO₂ cases — 14 ppm @ known volume @ 10% KMBS → expected solution mL/L
+ grams (mirror `test/so2-dose.test.ts` goldens); a non-SO₂ addition still shows the generic total;
missing `solutionPercentKmbs` degrades gracefully (grams only, no solution line).
**Depends on:** Unit 1 (resolver), Unit 2 (stored strength), Unit 3 (summary builder + wrapper)
**Verification:** `npx vitest run test/task-summary.test.ts`; `npx next build`; manual QA on Demo
Winery — author "14 ppm SO₂ as 10% KMBS to a QA tank", open execute, confirm the computed liters.

### Unit 5: End-to-end verification + docs

**Goal:** Prove the whole path (author → store → execute summary → edit → complete) and record it.
**Files:** `NOW.md`, memory; no product code.
**Approach:** Manual QA in the Demo Winery sandbox (QA-prefixed tank/lot): author an SO₂ addition
via the assistant with "10% KMBS solution", open the execute view, verify the read-only story +
computed volume + units, click Edit, tweak, Save, Complete; confirm the booked op matches. Verify a
non-SO₂ addition and a RACK still read clearly and complete. Update the SO₂-dosing memory that the
resolver is now landed + wired.
**Depends on:** Units 1–4
**Verification:** manual QA pass; `verify:naming` green before/after; `npx next build`; full vitest.

## Test Strategy

**Unit tests (pure, node-env vitest — repo has no RTL/jsdom):** `test/so2-dose.test.ts` (landed),
`test/task-summary.test.ts` (rows for addition/rack/fining/topping + SO₂ computed volume + graceful
degrade), NL parsing tests for `solutionPercentKmbs`.
**Integration:** none automated for the UI; covered by manual QA.
**Manual verification (Demo Winery sandbox only, QA-prefixed fixtures, cleaned up):** author →
execute → edit → complete for an SO₂ KMBS addition, a plain addition, and a rack. Confirm the
computed solution volume matches `resolveSo2Dose` for the tank's current volume.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Using `so2AsLiquidSolution` directly → 1.74× SO₂ under-dose (wine-safety) | MED | HIGH | Route ALL solution math through `resolveSo2Dose` (Unit 1), which applies ×0.576; golden test guards it. Never call the raw fn from the view. |
| Edit-gate wrapper regresses an existing execute flow (crush/press/bottle) | MED | MED | Wrapper only adds a summary + gate around the UNCHANGED inputs; bespoke sub-forms rendered verbatim inside. Manual QA each task family in Unit 5. |
| Refactoring `getWorkOrderPrintView` to share the builder breaks the print page | LOW | MED | Extract pure fn, keep print output byte-identical; print page is manual-QA'd in Unit 3. |
| `solutionPercentKmbs` not captured on older/edge authoring paths | MED | LOW | Field is optional; summary degrades to grams-only when absent. Edit mode lets the cellarhand enter it. |
| Volume unknown (vessel empty / multi-lot) at render | LOW | MED | Fall back to the rate line without a computed total; never show a wrong number. |
| Big diff → `review` bot "max turns" flake | MED | LOW | Benign per learnings; land units incrementally, run `npx next build` locally before merge. |

## Success Criteria

- [ ] `resolveSo2Dose` on main, `test/so2-dose.test.ts` green (Unit 1).
- [ ] `solutionPercentKmbs` captured by builder + assistant + NL and stored on the task (Unit 2).
- [ ] Execute view is summary-first + edit-gated for op tasks; Edit reveals current inputs, Save/
      Complete unchanged (Unit 3).
- [ ] SO₂ KMBS addition shows computed solution volume + grams with units, from current vessel
      volume, using the ×0.576-correct math (Unit 4).
- [ ] `task-summary.ts` unit tests green; print + execute tell the same story.
- [ ] Manual QA: author→execute→edit→complete passes for SO₂ addition, plain addition, rack (Unit 5).
- [ ] `npx next build` clean; `verify:naming` green; full vitest green; no DB migration.
