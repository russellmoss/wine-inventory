---
title: Cellarhand UI/UX v2 — Phase 2 (shared components) + Phase 3 (shell & IA)
type: feat
status: completed
date: 2026-07-28
branch: claude/cellarhand-v2-phase-2-3
depth: deep
units: 19 across 7 PRs
supersedes: none
follows: docs/plans/2026-07-28-101-feat-cellarhand-v2-phase0-1-reconciliation-plan.md
---

## Overview

Phase 0 + Phase 1 shipped as [#555](https://github.com/russellmoss/wine-inventory/pull/555)
(squash-merged to `main` as `ca65245d`). That pass was deliberately invisible: tokens,
a11y floor, one status language. **This plan covers the two phases where the redesign
becomes visible** — Phase 2 builds the shared component layer, Phase 3 replaces the
navigation model.

Research for this plan was done by direct inspection of the repo, not by trusting the
handoff. That matters: the Phase 0/1 pass found eight places the handoff was wrong about
this codebase, and this pass found **six more**, including one that would have shipped a
nav item pointing at a 404.

## Problem Frame

The app has 31 sidebar entries (verified, exactly the audit's count) ordered by nothing in
particular — `Help / feedback` sits third while every daily cellar workflow is two clicks
deep inside a collapsed group. Meanwhile the component layer has 9 distinct hand-set `h1`
sizes, 174 native `<select>` elements (31 of them with no label at all), 20 raw native date
inputs sitting beside design-system fields, 33 tables whose mobile rendering is driven by
one blunt global CSS rule, and exactly 1 `loading.tsx` across 65 routes.

Phase 2 is the prerequisite: Phase 3's shell needs `PageHeader`, `Breadcrumbs` and
`SectionNav` to exist. Doing Phase 3 first means building the shell twice.

**Doing nothing** leaves the IA inverted against frequency of use, which is the single
finding the design audit rated highest, and leaves every capture screen bypassing the
design system it nominally uses.

## Requirements

- MUST preserve every existing URL. The handoff states this three times; a route-stability
  regression test is a merge gate for Phase 3, not a nice-to-have.
- MUST NOT delete the global mobile `table` rule wholesale. Scope it to unmigrated tables
  and shrink the scope as each table moves behind `ResponsiveTable`.
- MUST NOT copy prototype markup from `docs/design/cellarhand-v2-handoff/prototype/*.dc.html`.
- MUST ship Phase 3's nav model behind a flag with a one-switch rollback (the handoff calls
  it "the most opinionated change" and recommends exactly this).
- MUST keep `AssistantDock` untouched — geometry, drag/resize, expand, Esc precedence,
  voice orb, FAB. Only the tool-result handler changes, and that is Phase 9.
- MUST NOT force-migrate all 174 `<select>` call sites (see Conflict #4 — that is an ocean).
- SHOULD flag every place the handoff disagrees with the repo rather than silently
  reconciling, per the standing instruction.

## Scope Boundaries

**In scope:** the Phase 2 component library and the Phase 3 shell/IA, as 19 units across 7 PRs.

**Out of scope, deferred to their own `/plan` passes:** Phase 4 (⌘K command palette — Phase 3
ships only a *disabled placeholder* search affordance), Phase 5 (queue + brief), Phase 6
(tank board), Phases 7–10 (behind the ⛔ domain gate, all four RFCs still `status: proposed`),
Phase 11 (lineage), Phase 12 (spillover). The ~69 ad-hoc success sites and ~108 ad-hoc empty
states still retire in Phase 5 and Phase 12 respectively — not here.

---

## Reconciliation Conflicts (handoff claim vs verified repo state)

Eight now. Each was checked by reading the source, not inferred.

1. **`/ferment` does not exist. Doc 01 lists it as one of the 13 destinations.**
   `src/app/(app)/ferment/` contains only `crush/`, `press/` and `process/` — there is no
   `ferment/page.tsx`. Shipping doc 01 §2 verbatim puts a nav item pointing at a 404.
   This also breaks doc 01's own "**Four new routes total**" claim (§87) and its
   "Nothing is deleted. Every destination that exists today still exists" claim (§38) —
   `Fermentations` is not a relocation, it is a **net-new index route**.
   **Resolution:** Unit 12 creates `/ferment` as a real Fermentations index. Counted as a
   fifth new route and called out in the PR. It is additive, so it breaks no URL.
   Related: doc 01 §4 says `/ferment/process` is "reached from Fermentations page primary
   action" — that page is what we are creating, so the two now agree.

2. **The `"Offline — will retry"` string is not in the shell.** Plan 101 Part A (Phase 3)
   and doc 06 both frame it as an `AppShell` change. It lives at
   `src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx:339`, inside an
   `aria-live="polite"` region that tells a cellar hand mid-capture that their work will
   retry. **Resolution:** do NOT touch it in Phase 3. Removing a live-region reassurance
   from a capture screen is a Phase-5 decision with its own replacement, not shell cleanup.
   The shell's *own* connection indicator (doc 05 §B1) is a separate, additive thing.

3. **`h1` is hand-set at 9 distinct sizes, not 4.** Doc 05 §A7 says "40/36/32/22px".
   Measured: 22, 24, 26, 30, 32, 34, 36, 40, 52 across 61 headings (36px is the plurality
   at 23 uses). **Resolution:** `PageHeader` still normalises to 34/30, but Unit 5's
   migration surface is ~3× what the doc implies, so it is split per route family rather
   than done in one sweep.

4. **`<select>` is an ocean, not a lake.** 174 occurrences across 63 files. Doc 06's
   sequencing step 3 lists "Select" as if it were one component swap. **Resolution:** build
   `Select`, then fix only the ones with no accessible name — those are the real WCAG 4.1.2
   failures. The rest are labelled and working; they migrate opportunistically as later
   phases touch their screens. Stated explicitly so the coverage number does not imply 174.

   ⚠️ **Correction, 2026-07-28: the count of unlabelled selects in this plan was wrong, twice.**
   A naive "is there a `<label>` within 400 chars" grep said 31/18 files. A stricter pass said
   71. A third, correct pass — one that scans the opening tag with brace depth (a `>` inside
   `(e) => …` is not the end of a JSX tag), skips comment mentions, and resolves
   `id`↔`htmlFor` including template-literal ids — says **34 unlabelled, 136 correctly
   labelled, 4 comment mentions**. Even that produced at least one false positive
   (`WeatherCard.tsx:167` already carries `aria-label="Vineyard"`).
   **Consequence for Unit 2:** do NOT bulk-edit call sites from an ad-hoc grep. The migration
   needs a committed, reviewable detector whose own correctness is testable, because three
   different greps gave three different answers and two of them would have produced wrong edits.

5. **`/ferment/process` has zero `<select>` elements.** Doc 05 §B10 names it as the flagship
   violation: "three unlabelled principal selects on a core harvest workflow". The file is a
   59-line router with two mode buttons (`ProcessClient.tsx:48-49`) that delegates to
   crush/press. The audit's snapshot is stale here. **Resolution:** the unlabelled-select
   work is retargeted at the 18 files that actually have the defect (Conflict #4).

6. **The hardcoded `(L)` is at the call sites, not in `ExportCsvButton`.** Doc 06 §29 says
   the component's "CSV headers must honour tenant unit preferences — currently hardcoded
   `(L)`". `ExportCsvButton.tsx` is unit-agnostic; the literals are in
   `reports/page.tsx:73`, `BulkClient.tsx:262` and `src/lib/work-orders/template-vocabulary.ts:66`.
   **Resolution:** Unit 9 fixes the call sites and the shared vocabulary. Editing the
   component would have been a no-op that looked like a fix.

8. **Some "unlabelled" controls have visible label text that is simply not associated.**
   `PressClient.tsx:125`, `BlockCard.tsx:209/228` and every control inside
   `TenantProductFactsForm`'s local `Field` wrapper render a styled `<label>` with **no
   `htmlFor`**. Sighted users see a perfectly good label; assistive tech gets nothing. This is
   a different defect from "no label at all" and it has a much better fix: associate the
   existing text rather than invent a new name. `Field` was the highest-leverage instance —
   one wrapper fix gave **12** controls their names at once (shipped in Unit 2).

**Claims that verified TRUE** (recorded so nobody re-checks them): 31 sidebar entries exactly;
`Tabs` is already correct (`role="tablist"`, roving `tabIndex={isActive ? 0 : -1}`,
`role="tabpanel"`, keyboard handler — `Tabs.tsx:84-147`); `Checkbox` is a 20px visual
(`Checkbox.tsx:49-50`) needing only a 44px target; 1 `loading.tsx` and 0 `not-found.tsx`;
`BrandEmblem` exists for the rail (`BrandMark.tsx:15`); the sidebar is 248px (doc says
change to 236); every other doc-01 destination route exists; `selectStyle` really is
copy-pasted — in **14** files, which is worse than the "ExecuteClient `big`/`lbl`" the doc
names.

---

## Decision Log

| ID | Decision | Recommended default | Blocks |
|---|---|---|---|
| OD-1 | Is `Setup` / `Audit log` visibility for role `user` intentional? | **Largely answered by doc 01 §3, which needs owner ratification, not fresh analysis:** `Records` (`/audit`) → visible to `user`; `Setup` (`/settings`) → admin+. Today `/audit` has no `admin` flag (visible to all) and `/settings` has `admin: true`, so **the handoff's table already matches the code**. Recommendation: ratify as-is, no code change. | Unit 12 |
| OD-2 | Disposition of the 11 orphaned routes | **Fully answered by doc 01 §4** — a complete route-by-route table, zero URL changes. Recommendation: adopt verbatim. | Unit 12 |
| OD-8 | *New.* `/ferment` index must be created (Conflict #1). What does it show? | **ANSWERED BY INCUMBENT RESEARCH 2026-07-28 — see §"Incumbent parity: the ferment console" below.** Build it as a **fermentation worksheet** (vessel rows), not a lot list and not a tank board. Both incumbents coalesce on this shape. | Unit 12 |
| OD-9 | *New.* Keep `Reports` reachable as a sidebar entry during the flag rollout? | Doc 01 moves `/reports` to an Accounting sub-tab. While the flag is off, the old sidebar stands, so no gap. Recommendation: no interim change. | Unit 12 |
| OD-10 | *New.* Rail mode (doc 13) in this PR set or deferred? | **Defer to PR #3c**, after the nav model has settled — doc 13 §88 says exactly this ("a rail built against an unstable nav gets rebuilt"). | Unit 17 |

None of OD-3/4/5/6/7 (from plan 101) gate anything here; they all gate Phases 7–10.

---

## Incumbent parity: the ferment console (resolves OD-8)

Researched 2026-07-28 against InnoVint and Vintrace documentation, per CLAUDE.md's rule that
where both incumbents coalesce on a shape, their convergence is load-bearing and we align.

**InnoVint — "Fermentation Worksheets" (Ferm Gen):**
- **Two** worksheets. Tanks-and-bins: **one row per vessel**. Barrels/small vessels
  (drums, kegs, carboys): **one row per lot**, because a barrel lot spans many vessels.
- Sortable columns: Vessel, Lot, Owners, Stage, Contents, Processed date, **Brix**, **Temperature**.
  "Contents" is vessel volume on the tanks sheet, total lot volume on the barrels sheet.
- **It is an action surface, not a report.** From each row you assign analysis tasks, additives and
  fermentation-management tasks, assign winery members to **create work orders**, and hover to see
  recent actions / work orders / additions.
- Default filter: lots in **Processed, Fermenting, Settling, Cold Soak** — ferment-active states, not
  all lots.

**Vintrace — "Ferments Console":** "view all of your ferments from the Ferments Console"; lab data
graphs from both the Vessels page and the Ferment Console; the wine-batch overview also carries a
Ferment tab.

### Where they coalesce (align to this)

1. **A dedicated ferment console is its own top-level destination in both products.** So doc 01 is
   right that Fermentations deserves a destination, even though it was wrong that the route exists.
2. **Row identity splits by vessel class, and the split is physical, not arbitrary:** vessel-rows for
   tanks (one tank holds one lot — the same physics our `LEDGER-12` one-lot-per-vessel invariant
   encodes), lot-rows for barrels (one lot spans many barrels).
3. **It is an assignment surface.** Ferment work is dispatched from these rows. This maps directly
   onto our existing work-order + task system; nothing new is needed underneath.
4. **Brix + temperature are the two at-a-glance columns.**

### Correction to this plan's own earlier reasoning

I previously argued a vessel-first `/ferment` would be "Phase 6's tank board arriving early". **That
was wrong.** In both products the ferment console and the tank map are *separate surfaces* — InnoVint
lists "Tank Maps" separately from "Fermentation Worksheets"; Vintrace has Tank Maps distinct from the
Ferments Console. A worksheet is a dense actionable table; a tank board is a spatial map. Building
`/ferment` as a worksheet does **not** collide with Phase 6.

### Where we deliberately do NOT align

InnoVint's `Stage` column is a **linear enum**. We keep the three-vector state
(`form` + `afState` + `mlfState`) that `data_model_coalescence.md` records as an intentional
divergence, because real ferment is not linear. Our state column renders the three vectors; it must
not be flattened into a fake linear stage to look like theirs.

### What Unit 12 therefore builds

**Minimum-honest worksheet**, reusing what exists rather than inventing:
- Vessel rows for tanks/bins, filtered to ferment-active state, with Lot, three-vector state,
  Contents, Brix, Temperature.
- Row drill-in to the **existing** `FermentMonitor` (`src/components/ferment/FermentMonitor.tsx`,
  already vessel-first from Phase 6, currently only reachable inside `/bulk` via
  `CellarActions.tsx:267`) for logging and the curve.
- Curves via `TimeSeriesChart` (Unit 7) once it lands.
- A primary "De-stem & press" action into `/ferment/process`, which makes doc 01 §4 true as written.

**Deferred, and named so it is not forgotten:** the row-level *task-assignment* layer (assign
analysis/additions/ferment-management, create a WO from a row) lands with **Phase 5**, where
work-order creation UX is already being reworked. Shipping assignment twice would be waste. The
**barrels/small-vessel worksheet** (lot-rows) is also deferred — barrel ferment is the rarer case,
and Phase 7's barrel-group work is the natural home.

This keeps PR #3a a shell PR while making the nav item truthful on day one.

---

# PART A — PHASE 2: SHARED COMPONENTS

## Unit 1: Input extension + Checkbox target + Textarea preview

**Goal:** the form primitives reach the v2 spec so every later capture screen has something correct to migrate onto.
**Files:** `src/components/ui/Input.tsx`, `src/components/ui/Checkbox.tsx`, `src/app/styleguide/page.tsx`, `DESIGN.md`
**Approach:** `Input` currently takes `sm|md|lg`; add `floor` (60px) per doc 05 §B8, leading/trailing adornment slots, and a visible required marker (not just the `required` attribute). Keep `label`/`hint`/`error` and the existing `aria-describedby` wiring — that part is already right. `Checkbox`'s 20px visual (`Checkbox.tsx:49-50`) gets wrapped in a ≥44px clickable target; the label stays clickable. `Textarea` needs no code change, only a styleguide entry.
**Tests:** size table pinned like `button-sizes.ts` (pure module + assertions); a static check that `Input` renders a visible marker when `required`; AC-C13-adjacent a11y assertions in the Playwright spec.
**Depends on:** none.
**Patterns to follow:** `src/components/ui/button-sizes.ts` for the pure-geometry split; `Input.tsx`'s existing label/hint/error structure.
**Verification:** `npx vitest run test/input-sizes.test.ts`; `/styleguide` shows every size and state.

## Unit 2: Select / Combobox, and the 31 unlabelled selects

**Goal:** one labelled select primitive, and close the 31 real WCAG violations — not all 174 call sites.
**Files:** new `src/components/ui/Select.tsx`, new `src/components/ui/Combobox.tsx`, the 18 files listed by the Unit-0 audit below, `src/components/ui/index.ts`, `/styleguide`
**Approach:** `MaterialFilterPicker` (`src/components/work-orders/MaterialFilterPicker.tsx`) already implements combobox-with-type-ahead correctly — extract its pattern rather than reinventing it. `Select` wraps the native element at `Input` metrics with a mandatory visible label. `Combobox` is for >10 options. Then migrate **only** the 31 unlabelled occurrences.
**Tests:** `role="combobox"` + `aria-expanded` + `aria-controls` + `aria-activedescendant`; keyboard `↑↓ Enter Esc`; a permanent static guard that no `<select>` ships without a `<label>` or `aria-label` (the same shape as the Phase-1 `tone="gold"` guard).
**Depends on:** Unit 1.
**Blast-radius note:** the other 143 selects are labelled and working. They are NOT migrated here. `selectStyle` is duplicated in 14 files; each migration deletes one copy, so the constant disappears gradually rather than in a risky sweep.

## Unit 3: NumericUnitInput

**Goal:** every measured quantity captured through one control, with the live derived readout that is already the best error-prevention device in the product.
**Files:** new `src/components/ui/NumericUnitInput.tsx`, `src/components/ui/index.ts`, `/styleguide`
**Approach:** doc 05 §B9. `DoseForm` (`src/components/cellar/forms/DoseForm.tsx`) has the model: a live `rate × volume = total` readout in an `aria-live="polite"` region. Generalise it into a `derived` slot. Unit box is a separate non-editable box at the same height, never inside the value. `inputMode="decimal"`, `step="any"`. Out-of-tolerance is a quiet note, never a block.
**Tests:** `inputMode`/`step`/`tabular-nums` present; the derived region is `aria-live`; out-of-tolerance does not disable submit; no spinner.
**Depends on:** Unit 1.
**Note:** wiring it into `/bulk` and Execute is **Phase 5+ screen work**, not this unit. This ships the component and its preview.

## Unit 4: DateTimeControl

**Goal:** native date inputs stop being a visible seam beside design-system fields.
**Files:** new `src/components/ui/DateTimeControl.tsx`, the 8 highest-traffic of the 20 native date inputs, `/styleguide`
**Approach:** doc 05 §B12. Wrap the native input so it matches `Input` metrics and hides the UA calendar glyph inconsistency; always accept typed input. Migrate the filter-row instances first (`/work-orders` From/To is the one the audit names).
**Tests:** typed input still parses; matches `Input`'s height; label association.
**Depends on:** Unit 1.

## Unit 5: PageHeader + Breadcrumbs

**Goal:** one header pattern, replacing 9 distinct hand-set `h1` sizes.
**Files:** new `src/components/ui/PageHeader.tsx`, new `src/components/ui/Breadcrumbs.tsx`, `/styleguide`, then route families in tranches
**Approach:** doc 05 §B4/§B5 and doc 01 §6. Slots: breadcrumb · eyebrow · `h1` · summary sentence · actions · meta row. `h1` is 34px ≥768 / 30px below, always `--font-display`. Exactly one `h1` per page; the summary is plain text, not a heading. Breadcrumbs are a `<nav aria-label="Breadcrumb">` with an ordered list, final crumb `aria-current="page"` and not a link, max 4 with middle collapse at ≤768px, **derived from route + object parentage, never from history**.
**Tests:** static check for exactly one `h1` per migrated page; breadcrumb final-crumb assertions; the `.app-main h1 { font-size: 30px !important }` override in `globals.css:106` must be removed as pages migrate, tracked per tranche.
**Depends on:** none (independent of Units 1–4).
**Blast-radius note:** 61 headings. Migrate by route family (work-orders, lots, vineyards, setup, …) so a bad tranche reverts alone.

## Unit 6: DataRow + ResponsiveTable, and scoping the global table rule

**Goal:** tables get real semantics at every width, without a flag-day deletion of the rule 33 tables currently depend on.
**Files:** new `src/components/ui/DataRow.tsx`, new `src/components/ui/ResponsiveTable.tsx`, `src/app/globals.css`, tables in tranches
**Approach:** doc 05 §B14/§B15 and doc 04 §4 (transforms A/B/C). **The migration mechanism is the whole point of this unit:** rename the global rule's selector to `.app-main table:not([data-rt])` and have `ResponsiveTable` stamp `data-rt` on tables it owns. Each migrated table opts itself out; the rule's blast radius shrinks monotonically; the rule is deleted only when the last table is migrated. No table is ever left with neither treatment.
**Tests:** AC-C13 (transform B keeps `<table>` semantics and `scope` at every width); AC-C14 (**no table uses `display:block` at any breakpoint** — this can only pass once a table is migrated, so it is asserted per-migrated-table, not globally, until the rule is gone); sticky identity column for transform C; scroll containers focusable and labelled.
**Depends on:** Unit 5 (`PageHeader` lands first so migrated screens have a header).
**Risk:** highest in Phase 2. 33 tables, 27 files. Gets its own PR.

## Unit 7: TimeSeriesChart consolidation

**Goal:** two chart components doing one job become one.
**Files:** new `src/components/ui/TimeSeriesChart.tsx`, `src/components/ui/BrixChart.tsx`, `src/components/ui/AnalyteTrendChart.tsx`, call sites, `/styleguide`
**Approach:** doc 06 §30/§31. Keep the pure-SVG approach (no new charting dep). Series config drives the `--viz-1..6` palette plus the **mandatory** dash pattern and marker shape per series — colour is never the only encoding. Second axis for temperature, labelled threshold lines, and the required data-table alternative.
**Tests:** every series gets a non-colour encoding; threshold lines carry a legend entry naming value and meaning; the data-table alternative exists and is reachable.
**Depends on:** Unit 1 tokens already shipped in Phase 0.
**Note:** keep `BrixChart`/`AnalyteTrendChart` as thin wrappers for one release so call sites migrate without a big-bang rename.

## Unit 8: loading.tsx and not-found.tsx, consuming Skeleton

**Goal:** the `Skeleton` shipped in Phase 1 gets used; heavy routes stop showing nothing.
**Files:** `loading.tsx` per heavy route, `not-found.tsx` per route family
**Approach:** doc 05 §B29 requires a `loading.tsx` for every heavy route. There is 1, in `/developer`. Add them for the routes whose server work is real (lots, work-orders, bulk, inventory, compliance, accounting, vineyards/*), each with a `Skeleton` matching the resolved layout's box so CLS stays 0. `not-found.tsx` per family, using `EmptyState`.
**Tests:** AC-C11 (Playwright CLS assert = 0 on each new loading state).
**Depends on:** none (`Skeleton`/`EmptyState` already on `main`).

## Unit 9: Eyebrow retarget, ExportCsvButton unit-aware headers, IconButton

**Goal:** three small corrections that each close a documented defect.
**Files:** `src/components/ui/Eyebrow.tsx`, `src/app/(app)/reports/page.tsx`, `src/app/(app)/bulk/BulkClient.tsx`, `src/lib/work-orders/template-vocabulary.ts`, new `src/components/ui/IconButton.tsx`
**Approach:** `Eyebrow` defaults to wine (`--text-accent`); retarget to `--text-meta` where it labels data rather than a brand moment (keep an explicit `tone="wine"` for brand use). Per **Conflict #6**, the hardcoded `(L)` is at call sites — thread the tenant unit preference through them and through `template-vocabulary.ts`. `IconButton`: 44×44 minimum, 20px icon, required `aria-label`, universal actions only (close/expand/more), never a domain action.
**Tests:** a static guard that `IconButton` always has `aria-label`; a unit test that CSV headers follow the tenant volume unit rather than a literal.
**Depends on:** none.

## Unit 10: Phase 2 styleguide, DESIGN.md, and the AC-C17 gate

**Goal:** every component Phase 2 ships has a preview and a documented line, and the gate that enforces it widens.
**Files:** `src/app/styleguide/page.tsx`, `DESIGN.md`, `test/ui-primitives.test.ts`
**Approach:** extend the existing AC-C17 test's `SHIPPED` list with the Phase-2 components so the gate grows with the library instead of being re-derived.
**Depends on:** Units 1–9.

---

# PART B — PHASE 3: SHELL AND IA

## Unit 11: The flag

**Goal:** Phase 3 is reversible with one switch, per the handoff's own recommendation.
**Files:** `src/lib/flags.ts` (or the repo's existing settings path — confirm at edit time), `src/components/AppShell.tsx`
**Approach:** a single boolean resolved server-side. Flag off = today's 4-group/31-entry sidebar, byte-identical. Flag on = the new model. Both paths ship in the same build so rollback needs no deploy.
**Tests:** both branches render; a route-stability test (Unit 13) runs against **both**.
**Depends on:** none. Lands first in PR #3a.

## Unit 12: The nav model — 3 groups, 13 destinations, and the new /ferment index

**Goal:** navigation ordered by frequency of use, with no URL broken and no nav item pointing at a 404.
**Files:** `src/components/AppShell.tsx`, new `src/app/(app)/ferment/page.tsx`
**Approach:** doc 01 §2 for the structure, §3 for role visibility (already matching the code — see OD-1), §4 for contextual destinations, §5 as the literal migration table. Four label renames: "Wine in-progress" → "Cellar floor", "Lot timeline" → "Lots", "Field notes" → "Vineyard rounds", "Harvest" → "Fruit intake"; keep the old labels as search aliases for one release. **Create `/ferment`** per Conflict #1 / OD-8. Remove from the sidebar (not from the app): Assistant, Help/feedback, Reports, De-stem & press, Calculator, Samples, En Tirage.
**Tests:** exactly 13 global destinations when the flag is on; every removed destination still reachable per doc 01 §4; `aria-current` still exactly one (already guarded by `test/appshell-a11y.test.ts` from Phase 1 — extend it to the new model).
**Depends on:** Unit 11.
**Risk:** the muscle-memory hit is real. The flag and the search aliases are the mitigation.

## Unit 13: Route-stability regression test

**Goal:** make "every URL keeps working" a mechanical gate rather than a promise repeated three times in a doc.
**Files:** new `test/route-stability.test.ts`, `test/e2e/routes.ts`
**Approach:** enumerate every `page.tsx` under `src/app` at test time and assert each resolves. Snapshot the **full route list including dynamic segments** (65 pages) into a committed fixture; the test fails if any path disappears or changes shape. Run against flag-on and flag-off.
**Tests:** the test IS the deliverable. Deleting or renaming a route fails CI with the specific path.
**Depends on:** none. **Recommend landing this FIRST**, in PR #3a before Unit 12, so the nav rewrite is done under the guard rather than before it.

## Unit 14: Top bar — search placeholder, scan placeholder, connection indicator

**Goal:** the shell's top bar exists so Phase 4 and Phase 10 have somewhere to land, without pretending to have shipped either.
**Files:** `src/components/AppShell.tsx`
**Approach:** doc 05 §B1. 58px top bar. A search field that is **visibly disabled** with honest copy ("Search is coming") — not a dead control that looks live. Same for the scan control (doc 01 §8 wants it visible ahead of Phase 10). One `aria-live` region for connection state, client-only via `navigator.onLine`. **Per Conflict #2, do NOT touch the execute screen's own offline string.**
**Tests:** the disabled controls are announced as disabled, not merely inert; the connection region is a single `aria-live`.
**Depends on:** Unit 12.

## Unit 15: SectionNav

**Goal:** sub-navigation within a destination, replacing the one-off work-order toggle.
**Files:** new `src/components/ui/SectionNav.tsx`, `src/app/(app)/work-orders/WorkOrdersTabs.tsx`, the sub-nav homes doc 01 §4 assigns
**Approach:** doc 05 §B2. 44px tall (36px today). Because these **navigate** rather than swap panels, it is a plain `<nav>` with `aria-current="page"` — explicitly **not** `role="tablist"`. Max 5 items; more than that means the destination should split.
**Tests:** `aria-current` on the active item; no `role="tab"` on a navigating control; 44px measured.
**Depends on:** Unit 12.

## Unit 16: MobileTabBar, and deleting the drawer

**Goal:** four labelled bottom tabs replace a 38×32px hamburger — the single most important mobile control, currently below minimum.
**Files:** new `src/components/ui/MobileTabBar.tsx`, `src/components/AppShell.tsx`, `src/app/globals.css`
**Approach:** doc 01 §9 and doc 05 §B3. Work / Cellar / Vineyard / Find. 56px + `env(safe-area-inset-bottom)`, 24px icon, label **always visible** (icon-only is prohibited), full-cell tap target. `Find` holds the complete destination directory so nothing becomes unreachable on a phone. The vineyard tab hides for users with no vineyard membership and no admin role; the grid becomes three columns. Then delete the drawer and its `.bw-mobile-bar` CSS.
**Tests:** AC-S36-adjacent (no drawer and no hamburger in the DOM below 1024px); every destination reachable from `Find`; tab targets ≥56px; the Phase-1 44px sweep still passes at 390px.
**Depends on:** Unit 12.
**Note:** Phase 1 deliberately under-invested in drawer a11y because of this deletion. That call now pays off.

## Unit 17: Collapsible rail (doc 13)

**Goal:** 236px → 64px icon rail, reclaiming 172px for the densest screens.
**Files:** `src/components/AppShell.tsx`, `src/styles/tokens/spacing.css`, new rail tokens
**Approach:** doc 13 in full. All four legitimacy conditions are **mandatory**: expanded is the default; the label is always the accessible name in both states (the tooltip is never the accessible name); tooltips answer to keyboard focus, not just hover, and are `Esc`-dismissible without moving focus; desktop only, no rail below 1024px. Preference in `localStorage` under a tenant+user-scoped key, never a server default and never set by an admin for someone else. `⌘\` toggles, announced once in an `aria-live` region.
**Tests:** AC-S31 through AC-S40 (doc 13 §7) — in particular AC-S33, comparing the accessibility tree in both states, and AC-S37, preference survives reload and is tenant+user scoped.
**Depends on:** Units 12, 14, 16. **Last**, per doc 13 §88.

## Unit 18: Breadcrumbs wired into the shell

**Goal:** breadcrumbs appear on every screen below a top-level destination.
**Files:** `src/components/AppShell.tsx`, route-level headers
**Approach:** derive from route + object parentage. Group / Destination / Object.
**Depends on:** Units 5, 12.

## Unit 19: Phase 3 a11y and visual gates

**Goal:** the Phase-1 harness is extended to the new shell rather than rewritten.
**Files:** `test/e2e/phase1-a11y.spec.ts` (rename to `shell-a11y.spec.ts`), `test/e2e/routes.ts`, `test/appshell-a11y.test.ts`
**Approach:** re-point the existing specs at the new nav model, add the doc-13 rail criteria, and **run the axe sweep this time** — the Phase 0/1 debt.
**Depends on:** all of Phase 3.

---

## Recommended PR split

| PR | Contents | Risk | Why separate |
|---|---|---|---|
| **#2a** | Units 1–4 (Input, Checkbox, Select/Combobox + 31 unlabelled, NumericUnitInput, DateTimeControl) | M | The form layer. Additive plus 31 targeted a11y fixes. |
| **#2b** | Units 5, 9 (PageHeader, Breadcrumbs, Eyebrow, ExportCsv headers, IconButton) | M | 61 heading migrations want their own visual diff. |
| **#2c** | Unit 6 (DataRow, ResponsiveTable, scoping the global rule) | **H** | 33 tables. The `:not([data-rt])` mechanism means this can land partially and stay correct. |
| **#2d** | Units 7, 8, 10 (TimeSeriesChart, loading/not-found, styleguide+DESIGN.md) | L–M | Independent of the table work. |
| **#3a** | Units 11, 13, 12 — **in that order** (flag, route-stability test, nav model) | **H** | The test lands before the rewrite it guards. |
| **#3b** | Units 14, 15, 16, 18 (top bar, SectionNav, MobileTabBar + drawer deletion, breadcrumbs) | **H** | The mobile IA change. |
| **#3c** | Units 17, 19 (rail, gates) | M | Rail last, against a settled nav. |

Phase 2's four PRs are independent of each other except #2c depending on #2b. #3a must precede #3b and #3c.

## Test Strategy

**Unit (vitest, `environment: "node"`):** this repo has no jsdom or Testing Library, so components are not renderable here. Continue the Phase-1 split that worked: pure geometry/logic in its own module (`button-sizes.ts` is the precedent) plus source-contract assertions, and put everything needing a real browser in Playwright. New pure modules: `input-sizes.ts`, `nav-model.ts` (the 3-group structure as data, so the 13-destination count and role matrix are unit-testable without a browser).

**Static guards (the Phase-1 pattern that already caught real defects):** no `<select>` without a label; no `IconButton` without `aria-label`; no `role="tab"` on a navigating control; no table using `display:block` once migrated; exactly one `h1` per migrated page; the route-list fixture.

**Playwright:** extend `test/e2e/routes.ts` and the a11y spec. Add the doc-13 rail criteria (AC-S31–S40). **Run `npm run qa:a11y` and `npm run qa:visual` this time** — with the flag, the flag-off path gives a genuine "before" baseline, which is exactly what Phase 0/1 could not produce.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Nav rewrite breaks a URL | MED | **HIGH** | Unit 13's route-stability test lands *before* Unit 12, and runs on both flag paths |
| Muscle-memory rejection of the new IA | HIGH | MED | The flag; search aliases for the 4 renames for one release; `Find` tab holds the full directory |
| `/ferment` index ships thin and feels like a stub | MED | LOW | OD-8 scopes it to a filtered lot list + the press action. Honest and small beats absent |
| Table migration leaves some tables with neither treatment | LOW | HIGH | The `:not([data-rt])` mechanism makes this structurally impossible — a table either has the rule or the component |
| 174-select scope creep swallows PR #2a | MED | MED | Explicitly capped at the 31 unlabelled; the number is stated in the PR body so the coverage claim cannot mislead |
| Rail reintroduces icon-only nav (the audit's own finding) | MED | HIGH | Doc 13's four conditions are mandatory, and AC-S33 mechanically compares the a11y tree in both states |
| The axe sweep surfaces a large pre-existing violation backlog | HIGH | MED | Scope the gate to the AC criteria these PRs target; log the rest to `TODOS.md` rather than scope-creeping |

## Success Criteria

- [ ] Every pre-existing URL still resolves, asserted mechanically on both flag paths.
- [ ] 13 global destinations with the flag on; 31 sidebar entries with it off; both render.
- [ ] Zero Prisma schema, migration, ledger, tenancy/RLS or assistant-behaviour changes.
- [ ] `/ferment` exists and its nav item resolves.
- [ ] The global mobile table rule is scoped, never bulk-deleted, and every table has exactly one treatment at all times.
- [ ] The 31 unlabelled selects are labelled; a guard prevents new ones.
- [ ] `npm run qa:a11y` **run and green** at 390px and 1440px on the audited routes.
- [ ] `AssistantDock` diff is empty.

## Confidence Check

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | Every number verified by direct inspection (31 entries, 174 selects, 33 tables, 9 h1 sizes, 1 loading.tsx) |
| Reconciliation Conflicts | HIGH | Each checked by reading source, with file:line |
| Phase 2 units | HIGH | The component specs are concrete in doc 05 Part B and the existing patterns to extend are identified |
| Phase 3 units | MEDIUM-HIGH | Structure is fully specified in doc 01; the flag mechanism needs the repo's existing settings path confirmed at edit time (Unit 11) |
| Test Strategy | HIGH | Reuses the Phase-1 harness and the static-guard pattern that demonstrably caught real defects |
| Risk Assessment | MEDIUM-HIGH | The table and nav risks are well understood; the IA-rejection risk is a product judgment, not an engineering one |

## Owner decisions required before implementation

**Blocking PR #3a only:** ratify OD-1 and OD-2 (both already answered by doc 01 — this is a
sign-off, not an analysis), and answer **OD-8** (what `/ferment` shows). OD-9 and OD-10 have
recommendations that need no decision unless you disagree.

**Nothing blocks Phase 2.** PRs #2a–#2d can start immediately.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT:** NO REVIEWS YET — run `/council` for cross-LLM adversarial review, or the individual reviews above.

---

## Execution record (2026-07-28)

Built on `claude/cellarhand-v2-phase-2-3`, 15 commits. All 19 units either shipped
or are explicitly recorded below as deferred with a reason.

### Defects found by BUILDING, that no plan could have predicted

- **`Input` had zero a11y wiring.** No `aria-describedby`, `aria-invalid`,
  `role="alert"` or required marker — all four required by §B8, all four absent. Across
  **165 call sites** the hint and error rendered on screen but were never associated
  with the field: a screen-reader user heard the label and nothing else, *including on
  validation failure*. One component change closed all 165.
- **`Field` in `TenantProductFactsForm` rendered `<label>` with no `htmlFor`** — 12
  controls with visible label text assistive tech never connected to anything. One
  wrapper fix, 12 controls named.
- **Three greps gave three different counts of unlabelled selects** (31, 71, 34) and the
  best still had a false positive. Root cause every time: a JSX opening tag does not end
  at the next `>`. Fixed by building a tokenising detector whose own correctness is
  pinned by 35 tests. Real answer: **32 across 15 files**, now zero.
- **10 Buttons were still under the 44px floor** via inline `style` overriding the size
  map (caught in PR #1's pre-landing review).
- **The axe gate found two defects I had introduced myself** (Unit 19, below).

### Deferred, with reasons

- **Units 14 (top bar) and 16's `Find` directory** — the tab bar ships and routes
  correctly, but `Find` points at `/inbox` rather than a destination directory, because
  the directory belongs with Phase 4's search. Recorded rather than faked.
- **The rail's UI (Unit 17)** — its logic, tokens and all four legitimacy conditions
  ship and are tested; the collapse/expand chrome itself is not wired into `AppShell`.
  doc 13 §88 says build the rail after the nav settles, and the nav settled in this same
  PR. Wiring it now would be building against a nav that is one release old.
- **The 61-heading `PageHeader` migration** — the component ships and `/samples` uses it.
  Migrating the rest is per-route-family work that belongs with the screens' own phases.
- **47 unlabelled `<input>`/`<textarea>`** remain; the guard prints the number every run
  rather than hiding it.
- **The authed 40-route axe sweep** — needs a Demo Winery credential. Seeding one writes
  to the production database, so it was not done unprompted. `public-a11y.spec.ts` covers
  what can run without a session and is green.

### Unit 19 — the gate earned its keep immediately

The axe gate had been committed-but-unrun since PR #1. Running it found two real
defects, **both mine**:

1. `aria-hidden-focus` — Unit 1 blanket-hid `Input`'s adornment slots, and the login page
   passes an interactive show/hide-password button through one. A focusable control
   inside an `aria-hidden` subtree, on the one page every user must get through.
2. `NumericUnitInput`'s unit box was `aria-hidden`, so a screen-reader user editing "218"
   never learned it was litres.

Plus, from the Playwright a11y snapshot: the required marker's sr-only "(required)" sat
inside the `<label>`, making the accessible name "Email (required)" and causing a double
announcement.

The structural fix that matters most: **public routes no longer depend on the auth setup
project.** They did, which is exactly why the gate went unrun for a whole phase — with no
seeded tenant, no a11y check could run at all.
