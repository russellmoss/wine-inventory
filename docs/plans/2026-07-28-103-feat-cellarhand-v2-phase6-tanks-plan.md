# Plan 103 · Cellarhand UI/UX v2 — Phase 6: Tanks

**Type:** feat · **Depth:** Deep · **Date:** 2026-07-28
**Base:** current `main` (`338eb661`) · **Branch:** `claude/cellarhand-v2-phase6-tanks`
**Handoff sources:** `11-implementation-sequence.md` §"Phase 6 · Tanks", `02-screen-inventory.md`
SC-10/SC-11, `04-responsive-spec.md` §7/§8/§9, `05-design-system-v2.md` §B21/§B22,
`08-data-dependency-matrix.md` §6 (DM-38–DM-48), `10-accessibility-spec.md` §9,
`12-acceptance-criteria.md` AC-S22–S27, `03-interaction-spec.md` §14, `09-content-terminology.md` §6.
**Predecessor:** plan 102 (Phases 2/3, merged as #557); Phases 4/5 merged as #561 (`043fe931`).

---

## Overview

`/bulk` is the cellar's primary screen and it currently shows **no wine**. Two accordions,
both **defaulting to closed** ([BulkClient.tsx:193](src/app/(app)/bulk/BulkClient.tsx:193)),
with `Export CSV` as the most prominent control on the page. Audit finding S15. A cellar hand
who opens the cellar screen to answer "where is the Syrah" gets two grey bars that say
`▸ Barrels (0)` and `▸ Tanks (0)` until they click.

Phase 6 replaces that with a board: one tile per tank, **lot code on every tile**, fill height
encoding volume, state as glyph + text, and filters. Plus a tank detail carrying the Brix and
temperature chart, analyses, tasting notes, history and additions.

This is the last phase before the ⛔ domain gate. All four RFCs are still `status: proposed`
(verified in `rfc/RFC-001`…`RFC-004` front-matter), so Phase 7+ stays blocked and **Phase 6
ships with zero schema changes** — which `08-data-dependency-matrix.md:143` already concluded:
*"the entire shell, the queue, the brief, the tank board and the tank detail are A/B/C and can
ship without a single migration."*

---

## Problem Frame

**Job to be done:** "Where is everything, and what needs me?" — answered by looking, not by
clicking. And then: "What's in this tank, how is it going, and what do I do to it?"

**What happens if we do nothing:** the cellar's primary screen stays a filing cabinet. Every
"where is the Syrah" question costs two clicks and a scan of an unsorted list, or gets answered
by walking the cellar. The Phase 4 palette partly papers over this (you can search for a lot),
but search answers "where is X", not "what is the state of everything".

**Is there a simpler framing?** Yes, and it is worth saying out loud: **most of the value is in
the board, not the detail.** The board fixes S15. The detail is a better version of a modal that
already exists and already works. If this has to be cut in half, ship the board.

**Who is the user:** the cellar hand on the floor (glance, wet hands, phone at 390px) and the
winemaker at a desk (1440px, 40 tanks at once). Doc 04 §7 sizes for both.

---

## Requirements

| # | Requirement | Source |
|---|---|---|
| R1 | Tank board replaces the collapsed accordions on `/bulk` | doc 11 |
| R2 | Every tile shows its **lot code**, not just the tank code | AC-S22, B21 |
| R3 | Fill height proportional to `volumeL / capacityL` within 1px | AC-S23 |
| R4 | Tank state distinguishable in a greyscale screenshot | AC-S24 |
| R5 | Board filters: Fermenting / Aging / Empty / Needs attention | DM-41 |
| R6 | Tank detail with Tabs: Fermentation · Analyses · Tasting notes · History · Additions | doc 11, SC-11 |
| R7 | Fermentation chart followed by a **complete data table** of every plotted point | AC-S25, doc 10 §9 |
| R8 | Chart series distinguishable by dash + marker with colour removed | AC-S26 |
| R9 | Chart annotations agree with the numeric facts stated elsewhere on the page | **AC-S27** |
| R10 | Vessel-scoped history union | doc 11, DM-47 |
| R11 | Export demoted out of the page's most prominent position | doc 02 SC-10 |
| R12 | Zero schema changes; no `AssistantDock` diff; no URL removals or renames | owner |
| R13 | Behind `NAV_V2_ENABLED`; accordions kept verbatim in the else arm | owner |
| R14 | Keyboard hints say `Ctrl`, never `⌘⌥⌃⇧` | owner |

---

## Scope Boundaries

**In scope:** the tank board on `/bulk`, the tank detail surface, the two missing design-system
components (`FillIndicator`, `VesselIdentityBlock`), four new pure logic modules, one additive
prop on `TimeSeriesChart`, and the `/bulk` `PageHeader` migration.

**Out of scope:**
- **Barrels.** Doc 11 scopes Phase 6 to tanks. The board renders tanks; the Barrels accordion
  stays exactly as it is, in both flag arms. Barrel groups are Phase 7, behind the gate.
- **Any schema change.** Including `Vessel.location` (see Conflict #1) and the yeast temperature
  floor line (DM-44, class D — *"omit the line until then"*).
- **Generalising Phase 5's `narrow.ts` out of `work-orders/`.** See Decision D3.
- **A new `Menu`/overflow primitive.** See OD-P6-2.
- **`/bulk/[vesselId]` as a route.** See OD-P6-1.
- The 61-heading `PageHeader` migration at large — Phase 6 migrates `/bulk` only, because it is
  rewriting that header anyway.

---

## Reconciliation Conflicts (handoff claim vs verified repo state)

Ten. Each checked by reading source, not inferred. The Phase 0/1 pass found 8 and the Phase 2/3
pass found 8; this is the same discipline and it again found real problems.

**1. `Vessel` has no location, and B21 says the identity block shows one.**
`05-design-system-v2.md` §B21 anatomy: *"code · lot code and wine name · **group and location** ·
for barrels: cooperage…"*. `prisma/schema.prisma:1377-1416` has **no `location` and no
`locationId`** on `Vessel`. There is a `/locations` route, but nothing on `Vessel` points at it.
Meanwhile DM-38 classes the tile as **A** ("nothing missing"), so the matrix and the component
spec disagree with each other.
**Resolution:** the identity block shows **`VesselGroup`** (via `VesselGroupMember`,
`schema.prisma:3078-3091`) where a vessel has one, and omits location. Adding a location field is
a schema change and therefore gated. Recorded as **OD-P6-4** so the omission is a decision, not
an oversight.

**2. `Vessel` has no `volumeL` and no `status`.**
Only `capacityL Decimal(10,2)` and `isActive Boolean`. AC-S23's phrasing `volumeL / capacityL`
reads as if both are columns. Current volume is **derived** from `VesselLot.volumeL`, which
`schema.prisma:2683-2686` calls *"the materialized current-state projection… always equals the
fold of the ledger (INVARIANT #7)"*.
**Resolution:** the board sources fill from `vesselLots`, exactly as
[bulk/page.tsx:53](src/app/(app)/bulk/page.tsx:53) already does. Never from `VesselComponent` —
that is composition, and a lot with no recorded origin has zero component rows, so a full tank
would render empty. Both existing call sites already carry that warning in a comment; the tank
board inherits it as a test.

**3. `TimeSeriesChart`'s data table is `sr-only` with no prop to reveal it — so AC-S25 is not
met by the component as shipped.**
[TimeSeriesChart.tsx:278](src/components/ui/TimeSeriesChart.tsx:278) renders a complete
`<table className="sr-only" data-rt="scroll">` of every plotted point, wired via
`aria-describedby`. That satisfies a screen reader. But AC-S25 says the chart *"is followed by a
complete data table"* and doc 10 §9 says it lives *"in a disclosure titled 'Readings as a
table'"* and is *"the authoritative representation"*. A sighted user with a colour-vision
deficiency, or anyone who wants the number rather than the curve, cannot reach it today.
**Resolution:** Unit 10 adds an **additive, defaulted** prop so the existing table node can be
rendered inside a visible `<details>` disclosure instead of `sr-only`. Default unchanged, so
`AnalyteTrendChart` and `BrixChart` are untouched. One table node either way — never two, which
would duplicate the `id` the `aria-describedby` points at.

**4. `FillIndicator` and `VesselIdentityBlock` do not exist, and the fill bar is duplicated
twice, not once.**
`06-component-migration-map.md:65` says *"A bar exists inline in `VesselsClient`; not a
component"*. True, and incomplete: there is a **second** copy, the private `FillBar` at
[BulkClient.tsx:54-65](src/app/(app)/bulk/BulkClient.tsx:54), unexported. Two hand-rolled fill
bars with different markup.
**Resolution:** Unit 3 extracts one `FillIndicator` and both call sites adopt it.

**5. `StageIndicator` is not reusable for tank state.**
Phase 5 shipped a *derived* `StageIndicator`, and it is tempting to reuse. It takes
`states: StageState[]` from `@/lib/work-orders/stage` and renders **six work-order segments**
([StageIndicator.tsx:19](src/components/ui/StageIndicator.tsx:19)). It is not a generic vessel
widget.
**Resolution:** tank state uses `StatusChip` (`variant` + mandatory text + `aria-hidden` glyph),
which is the component §B18 and doc 03 §14 actually specify for status. New derivation lives in
a new pure module.

**6. SC-10's "Partial" state describes a failure mode this data path cannot produce.**
*"A tank whose lot lookup fails shows the code plus 'Wine unknown — retry'."* The lot is joined
in the **same** query as the vessel ([page.tsx:12-25](src/app/(app)/bulk/page.tsx:12)) — there is
no separate lookup to fail, and nothing to retry.
**Resolution:** the real partial case is a vessel with `VesselComponent` rows but **no**
`VesselLot` row — composition recorded, occupancy not. That renders as "Wine unknown" with a
link to the vessel, and **no retry affordance**, because a retry would re-run a query that
already succeeded. Copy adjusted; the state is kept because the case is real.

**7. `TimeSeriesChart` has zero direct consumers today.**
Doc 11 lists Phase 6 as *"Depends on: Phase 2 (`TimeSeriesChart`, `ResponsiveTable`)"*. Both
exist, but `TimeSeriesChart` is reached only through two thin wrappers,
`AnalyteTrendChart.tsx:49` and `BrixChart.tsx:35`. Phase 6 is its **first direct use**.
**Resolution:** treat the dependency as satisfied but unexercised. Unit 10's tests are the first
real workout, and the two-axis Brix/temp case (`axis: "left" | "right"`) has never run in
production.

**8. Two different panel-sourcing rules already exist, and putting both on one page is exactly
how AC-S27 breaks.**
`ferment/worksheet-data.ts:118-125` filters `{ lotId: { in: lotIds }, voidedAt: null }`.
`chemistry/data.ts:87-99` (`listVesselAnalyses`) filters `voidedAt: null` **AND**
`OR: [{ vesselId }, { vesselId: null, lotId: { in: residentLotIds } }]` — a panel snapshotted
against a *different* vessel is excluded, but a panel with *no* snapshot belonging to a resident
lot is included. The Analyses tab renders `AnalyteTrends`, which uses the second rule. If the
Fermentation tab used the first, **the same page would state two different "latest Brix"**.
**Resolution:** one rule for the whole detail surface. **OD-P6-3**, recommendation in Decision D2.

**9. Legacy fan-out panels must be deduped or the chart double-plots.**
`AnalysisPanel.vesselReadingGroupId` (`schema.prisma:3152-3159`): plan 060 wrote **one panel per
co-resident lot** for a single physical reading. `LEDGER-12`'s
`@@unique([tenantId, vesselId])` means new readings write one panel, but the legacy rows still
exist. `getVesselTimeline` already handles this — `dedupeByPhysicalReading(panels)` at
[timeline-data.ts:235](src/lib/vessel/timeline-data.ts:235), rationale at `:231`: *"History shows
one 'recorded on the tank' row, never one row per lot."*
**Resolution:** the chart read applies the same dedupe. Not doing so plots the same reading two
or three times and drags the mean.

**10. `computeFill`'s JSDoc is stale in a way that points at the wrong table.**
[fill.ts](src/lib/vessels/fill.ts) says *"Current fill of a vessel from its **component**
volumes vs capacity"*, but both real call sites pass `vesselLot.volumeL`. Anyone following the
comment reintroduces Conflict #2's bug.
**Resolution:** fix the comment in Unit 3. One line, and it is the exact line that would mislead
the next person.

**Claims that verified TRUE** (recorded so nobody re-checks): `/bulk` really does render two
default-closed accordions with Export above them; `Export CSV` really is the most prominent
control; `TimeSeriesChart` really does encode by dash + marker, not colour
([:73-81](src/components/ui/TimeSeriesChart.tsx:73)), which satisfies AC-S26 as-is; `Tabs` keeps
all panels mounted (`Tabs.tsx:34-36`); `ResponsiveTable` stamps `data-rt` to opt out of the
global mobile rule; there is **no** `FermentReading` model — Brix and temp are `AnalysisReading`
rows with `analyte` `"BRIX"` / `"TEMP"`; `getVesselTimeline` already unions
`LotOperation` + `LotTreatment` + `VesselActivityEvent` + `AnalysisPanel` + `WorkOrderTask`;
doc 04 §7's "40 tanks fit in 7 rows at 6 columns" is arithmetically right; the `/ferment`
worksheet is deliberately not a board and says so in its own docblock
(`FermentWorksheetClient.tsx:27-30`); all four RFCs are `status: proposed`.

---

## Decision Log

**D1 — AC-S27 is satisfied structurally, not by inspection.**
AC-S27 says *"chart annotations agree with the numeric facts stated elsewhere on the page (no
contradiction between a stated delta and the plotted series)"*. That is a **consistency
invariant between two independently-computed numbers**, and the only durable way to hold it is
to make them not independent.

So: one pure module, `src/lib/vessels/tank-detail-facts.ts`, takes the deduped reading set and
returns **one object** that is the sole source for all three of:
1. the `series` handed to `TimeSeriesChart`,
2. every stated fact rendered as text (latest Brix, latest temp, delta since the previous
   reading, days fermenting, "dropped 3.2 °Bx in 2 days"),
3. the chart's `role="img"` `aria-label` sentence that doc 10 §9 mandates
   (*"Brix falling from 24.0 to 4.8 … between 16 and 27 July"*).

Nothing on the page may compute a Brix number any other way. The test then asserts the invariant
directly over generated series: `facts.latestBrix === last(facts.series.brix).value`,
`facts.delta === last - previous`, and every numeral appearing in `facts.ariaSentence` appears in
`facts` as a field. That last one is the trick — parse the numbers out of the generated sentence
and assert set-membership, so a hand-written sentence can never drift from the data.

A rendering test cannot prove this. A shared-derivation test can.

**D2 — one panel-sourcing rule for the whole detail surface: `listVesselAnalyses`'s.**
Recommendation for OD-P6-3. Reasons: it is already the rule the Analyses tab uses, so adopting
it means changing zero existing behaviour; it is the more *correct* rule, because a panel
recorded against a resident lot with no vessel snapshot is genuinely a reading of what is in
that tank; and picking the stricter `vesselId`-only rule would make the Fermentation tab show
*fewer* readings than the Analyses tab on the same page, which is AC-S27 failing in the most
confusing possible direction.

**D3 — Phase 6 does not generalise `narrow.ts`.**
`SavedViewsBar` lives in `src/app/(app)/work-orders/`, is not in the ui barrel, and its
`NarrowKind` union is work-order-specific (`status|assignee|location|template|from|to|q`).
Generalising a module that is one release old, to serve its second consumer, is the same mistake
doc 13 §88 warns about for the rail ("build it after the nav settles"). Phase 6 ships its own
small `board-filters.ts`. If Phase 12 wants one narrowing model, it will then have two real call
sites to generalise from instead of one and a guess.

**D4 — the board renders tanks; barrels keep their accordion.**
Doc 11 says "Phase 6 · Tanks". 8,142 barrels do not belong in a 6-column tile grid, and barrel
grouping is RFC-001, behind the gate. The Barrels card is untouched in both arms.

**D5 — AC-S23's 1px tolerance is met by `computeFill`'s existing rounding, provably.**
`computeFill` rounds `pct` to 1 decimal ([fill.ts](src/lib/vessels/fill.ts)), so the worst-case
error is ±0.05%. On a tile of height `H`, that is `H × 0.0005` px — at doc 04 §7's minimum tile
of 86px, **0.043px**; it stays under 1px for any `H` below 2000px. So we can use the existing
rounded `pct` rather than re-deriving a float, and a unit test pins the bound rather than
trusting the arithmetic. Over-full (`over: true`, `pct > 100`) clamps the bar at 100% and shows
the overflow as text plus an `attention` `StatusChip` — clamping is a rendering choice, not a
proportionality failure, and it is stated in the test.

**D6 — additive routes only.**
`test/route-stability.test.ts:50-60` fails on a **removed or renamed** route; `:62-69` merely
`console.log`s additions. So `/bulk` and `/vessels` are frozen, and nothing in this plan renames
them. See OD-P6-1 on whether we add one at all.

---

## Incumbent parity check

Vintrace and InnoVint both separate the **tank map** (spatial, glanceable, one tile per vessel)
from the **ferment worksheet** (dense, actionable, one row per active ferment). We already have
the worksheet — `/ferment`, shipped in Phase 3, whose own docblock says *"Deliberately NOT a
tank board… The board is Phase 6."* Phase 6 builds the other half. They stay separate surfaces,
which is where the incumbents coalesce, and coalescence is load-bearing per
`docs/architecture/data_model_coalescence.md`.

Where we do **not** align: neither incumbent derives vessel state from an append-only ledger
fold. Ours does, and the tank state is computed at read time from `Lot.afState`/`mlfState` plus
event recency — never stored. A stored `state` column would be a second source of truth that
drifts the first time anything is corrected, which is the same argument Phase 5 made for the
derived `StageIndicator` and it holds here.

---

# PART A — THE BOARD

## Unit 1: `tank-state.ts` — derived vessel state

**Goal:** one pure function that turns a vessel's ledger facts into a displayable state.
**Files:** `src/lib/vessels/tank-state.ts`, `test/tank-state.test.ts`
**Approach:** `TankState = "fermenting" | "aging" | "empty" | "attention"`. Derive from
`Lot.afState` / `Lot.mlfState` (`"ACTIVE"` ⇒ fermenting), occupancy (`VesselLot` absent ⇒ empty),
and attention signals (cap-work recency, over-capacity from `computeFill().over`, a reading
overdue). Export `tankState(input): TankState`, `TANK_STATE_LABEL`, `TANK_STATE_GLYPH` and the
`StatusChip` variant map. Pure — no prisma, no React, so it runs under `environment: "node"`.
Mirror the shape of `src/lib/work-orders/stage.ts`.
**Tests:** each state from its minimal input; precedence when two signals fire at once
(attention beats fermenting); empty vessel with stale components (Conflict #6); every state has a
distinct glyph **and** distinct text — the AC-S24 greyscale guarantee asserted as data, not
pixels.
**Depends on:** none.
**Patterns to follow:** `src/lib/work-orders/stage.ts`, `src/components/ui/status-variants.ts:13`.
**Verification:** `npm test -- tank-state`.

## Unit 2: `board-filters.ts` — the filter model

**Goal:** URL-synced board filtering without dragging in Phase 5's work-order narrowing.
**Files:** `src/lib/vessels/board-filters.ts`, `test/board-filters.test.ts`
**Approach:** pure functions over `Record<string, string|undefined>`: `parseBoardFilters`,
`applyBoardFilters(tiles, filters)`, `toQueryString`, `filterChips`, `resultSummary(count)`.
Filters: state (Unit 1's four), plus a free-text lot/tank match. No new component vocabulary —
render with existing `StatusChip` + `Button`.
**Tests:** each filter alone and combined; empty result summary copy; round-trip
`parse(toQueryString(x)) === x`; unknown params ignored rather than throwing.
**Depends on:** Unit 1.
**Verification:** `npm test -- board-filters`.

## Unit 3: `FillIndicator` — one fill bar, two call sites retired

**Goal:** the §B22 component, extracted from the two hand-rolled copies.
**Files:** `src/components/ui/FillIndicator.tsx`, `src/components/ui/index.ts`,
`src/lib/vessels/fill.ts` (comment fix only), `test/fill-indicator.test.ts`
**Approach:** props `{ fill: Fill; orientation?: "vertical"|"horizontal"; height?: number;
showText?: boolean }`. Vertical for tiles (height encodes volume, per §B22), horizontal for the
existing list rows. Volume text **always** accompanies it (§B22 is explicit). `over` renders the
danger treatment already used at `VesselsClient.tsx:95`. Fix `fill.ts`'s stale "component
volumes" JSDoc (Conflict #10).
**Tests:** node-env, so test the **geometry function**, not the render — extract
`fillHeightPx(pct, trackPx)` and assert AC-S23's bound: for `pct` from `computeFill` and any
track height ≤ 2000px, `|rendered − ideal| < 1px` (D5). Plus the clamp at `over`.
**Depends on:** none.
**Verification:** `npm test -- fill-indicator fill`.

## Unit 4: `VesselIdentityBlock` — "am I at the right vessel?"

**Goal:** the §B21 component. The AC-S22 guarantee lives here.
**Files:** `src/components/ui/VesselIdentityBlock.tsx`, `src/components/ui/index.ts`,
`test/vessel-identity.test.ts`
**Approach:** props `{ code, lotCode, wineName, groupName?, size: "tile"|"detail", barrel?: {…} }`.
`tile` = mono 14px code + lot code; `detail` = `--font-display` 32–36px. **Location is omitted**
(Conflict #1). Lot codes are never truncated below 8 characters (doc 04:164) — truncate the wine
name instead, with `title` and full accessible name.
**Tests:** a static source guard asserting the component cannot render without `lotCode` in the
output path (this is AC-S22 mechanically), plus the truncation rule as a pure
`truncateWineName(name, budget)` function.
**Depends on:** none.
**Verification:** `npm test -- vessel-identity`.

## Unit 5: `TankBoard` — the grid

**Goal:** the board itself.
**Files:** `src/app/(app)/bulk/TankBoard.tsx`, `src/app/(app)/bulk/TankTile.tsx`
**Approach:** CSS grid at doc 04 §7's breakpoints — 2 cols ≤430px, 4 at 768, 6 at 1024+. Tile
minimum 132×86px. Each tile: `VesselIdentityBlock size="tile"` + `FillIndicator orientation=
"vertical"` + `StatusChip` from Unit 1 + volume text. Loading renders **tiles as outlines at the
real size in the real grid** (SC-10: *"never a spinner over an empty page"*) using `Skeleton
variant="block"`. Empty tenant → `EmptyState title="No tanks set up yet."`. The whole tile is the
click target and it opens the detail — note `DataRow.tsx:30-32`'s "the whole row is never a link"
rule applies to table rows, not tiles, but the tile still gets one accessible name, not four.
**Tests:** grid geometry as a pure `boardColumns(width)` function; tile-count and column
arithmetic including doc 04's "40 tanks in 7 rows at 1440".
**Depends on:** Units 1, 3, 4.
**Verification:** `npm test -- tank-board`.

## Unit 6: `/bulk` wiring behind the flag

**Goal:** the board replaces the accordions, with the accordions intact in the else arm.
**Files:** `src/app/(app)/bulk/BulkClient.tsx`, `src/app/(app)/bulk/page.tsx`
**Approach:** `import { NAV_V2_ENABLED } from "@/lib/nav/flag"`. Follow the Phase 5 shape at
[WorkOrdersClient.tsx:84-96](src/app/(app)/work-orders/WorkOrdersClient.tsx:84) exactly —
`{NAV_V2_ENABLED ? <TankBoard …/> : renderTypeCard("Tanks", tanks)}`, with the comment block
explaining the rollback story. **Barrels render identically in both arms** (D4). Replace the
hand-rolled `Eyebrow` + 36px `h1` + `<p>` ([BulkClient.tsx:243-247](src/app/(app)/bulk/BulkClient.tsx:243))
with `PageHeader`, and move `ExportCsvButton` into its `actions` slot (R11, and OD-P6-2).
`page.tsx` gains the group membership needed by Unit 4 and the state inputs needed by Unit 1 —
extend the existing `Promise.all`, do not add a waterfall.
**Tests:** static source guards in the `shell-nav.test.ts` style — `BulkClient` source contains
`NAV_V2_ENABLED ? (`; contains `PageHeader`; the `ExportCsvButton` `rows=` expression is
**byte-identical** to today's, so the CSV contract (one row per vessel *component*,
[:264](src/app/(app)/bulk/BulkClient.tsx:264)) cannot silently change while being moved.
**Depends on:** Units 1–5.
**Verification:** `npm test -- bulk shell-nav`, then `npm run test`.

## Unit 7: Board gates

**Goal:** prove nothing broke.
**Files:** `test/route-stability.test.ts` (run, not edited), `test/search-palette.test.ts` (run),
`test/e2e/`, `TODOS.md`
**Approach:** run `route-stability` (no route removed or renamed), run `search-palette` (the
`⌘⌥⌃⇧` ban is a whole-`src/` scan and any new keyboard hint must say `Ctrl` — R14), run
`npm run qa:a11y` and `npm run qa:visual` on both flag paths, and assert the `AssistantDock` diff
is empty. Anything the axe sweep surfaces that is **pre-existing** goes to `TODOS.md` rather than
scope-creeping this PR — the Phase 2/3 mitigation, which worked.
**Depends on:** Unit 6.
**Verification:** `npm test && npm run qa:a11y && npm run qa:visual`.

---

# PART B — TANK DETAIL

## Unit 8: `tank-detail-facts.ts` — the AC-S27 mechanism

**Goal:** one derivation feeding the chart, the stated facts, and the aria sentence (D1).
**Files:** `src/lib/vessels/tank-detail-facts.ts`, `test/tank-detail-facts.test.ts`
**Approach:** input is the deduped, void-excluded reading set. Output is one object carrying
`series` (in `ChartSeries` shape, `date` as **epoch ms** — confirmed at
`AnalyteTrendChart.tsx:11`), `latestBrix`, `latestTemp`, `delta`, `spanStart`, `spanEnd`,
`daysFermenting`, and `ariaSentence`. Every consumer reads from this object. Pure.
**Tests:** the invariants from D1 — latest matches the last plotted point; delta equals
last − previous; **every numeral parsed out of `ariaSentence` exists as a field on the object**;
single-reading and zero-reading cases produce no delta rather than `NaN` or `0`; a voided panel
in the input changes the answer (proving exclusion is upstream, not assumed).
**Depends on:** none.
**Verification:** `npm test -- tank-detail-facts`.

## Unit 9: `loadTankDetail` — the server read

**Goal:** one read, one sourcing rule.
**Files:** `src/lib/vessels/tank-detail-data.ts`
**Approach:** `import "server-only"`; tenant-extended `prisma` from `@/lib/prisma` (never
`$queryRaw` — the Phase 4 tenancy rule, guarded by `search-palette.test.ts:164-194` for search
and applied here by the same reasoning). Apply **D2**'s sourcing rule and
`dedupeByPhysicalReading` from `@/lib/chemistry/fanout-plan` (Conflict #9). Bound the read with
`take`. Follow the `worksheet-data.ts:99-141` shape: bounded scalar-ordered panels first, then
readings by indexed FK — that file records why the relation-ordered version was replaced.
**Tests:** covered through Unit 8's pure tests plus a static guard that the module contains
`from "@/lib/prisma"` and contains no `$queryRaw`/`$executeRaw`.
**Depends on:** Unit 8, OD-P6-3.

## Unit 10: `TimeSeriesChart` visible data table (Conflict #3)

**Goal:** make AC-S25 true for sighted users without touching existing consumers.
**Files:** `src/components/ui/TimeSeriesChart.tsx`, `test/time-series-chart.test.ts`
**Approach:** add `tableVisibility?: "sr-only" | "disclosure"`, defaulting to `"sr-only"`. In
`"disclosure"` the **same** table node renders inside `<details><summary>Readings as a
table</summary>` (doc 10 §9's exact title) without the `sr-only` class. One node, one id, so
`aria-describedby` stays valid.
**Tests:** default is unchanged (source guard: `AnalyteTrendChart` and `BrixChart` pass no new
prop); exactly one `<table` in the output in both modes; the disclosure summary string matches
doc 10 §9.
**Depends on:** none. **Execution note:** test-first — this edits a Phase 2 component that two
wrappers already depend on.

## Unit 11: Fermentation tab

**Goal:** the chart, the facts, and the sentence — all from Unit 8.
**Files:** `src/app/(app)/bulk/TankFermentPanel.tsx`
**Approach:** `TimeSeriesChart` with Brix on the left axis and temp on the right,
`tableVisibility="disclosure"`, `caption` and the `role="img"` `aria-label` both taken from
`facts.ariaSentence`. Stated facts rendered with `Metric`, sourced from the same object. **No
yeast temperature floor line** (DM-44 is class D — *"omit the line until then"*). Empty state
uses doc 09's exact copy: *"No readings yet for this tank"* / *"Record one and the curve appears
here."* + `Record a reading`. Loading reserves the chart's exact height (SC-11).
**Depends on:** Units 8, 9, 10.

## Unit 12: The remaining tabs

**Goal:** Analyses · Tasting notes · History · Additions, inside the existing surface.
**Files:** `src/app/(app)/bulk/CellarActions.tsx`
**Approach:** the vessel detail **already** is a `Modal` with `Tabs` at
[CellarActions.tsx:304-324](src/app/(app)/bulk/CellarActions.tsx:304), holding
`actions | analyses | history`. Extend to five: **Fermentation** (Unit 11, default),
**Analyses** (existing `FermentMonitor` + `AnalyteTrends`, unchanged), **Tasting notes** (new,
`LotTastingNote`, DM-46 class A), **History** (existing — `getVesselTimeline` already unions
`LotOperation` + `LotTreatment` + `VesselActivityEvent` + `AnalysisPanel` + `WorkOrderTask`, so
R10 is **already built**; reuse verbatim), **Additions** (the existing `ADD`/`FINE` action modes,
surfaced as their own tab). `Tabs` keeps all panels mounted, which SC-11 requires.
⚠️ `getVesselTimeline` is **occupancy-window-scoped** ([timeline-data.ts:24-26](src/lib/vessel/timeline-data.ts:24))
and returns `{ items: [], windowStartAt: null }` for an empty vessel. That is correct behaviour,
not a bug, but the History tab needs copy for it rather than an empty list.
**Depends on:** Unit 11.

## Unit 13: Detail gates

**Goal:** same discipline as Unit 7, for the detail.
**Approach:** `qa:a11y` on the detail at 390 and 1440; assert the AC-S27 invariant end-to-end by
reading the rendered facts and the disclosure table in Playwright and comparing them; confirm
`AssistantDock` diff still empty; confirm zero migration files in the diff.
**Depends on:** Unit 12.

---

## Recommended PR split

| PR | Contents | Risk | Why separate |
|---|---|---|---|
| **#6a** | Units 1–4 (tank-state, board-filters, `FillIndicator`, `VesselIdentityBlock`) | **L** | Pure logic + two additive components. Nothing renders differently yet. Fully unit-testable, mergeable alone. |
| **#6b** | Units 5–7 (board, `/bulk` wiring, gates) | **H** | This is the visible change to the cellar's primary screen. Wants its own visual diff and its own rollback. |
| **#6c** | Units 8–10 (facts module, server read, `TimeSeriesChart` prop) | **M** | Unit 10 edits a Phase 2 component with two existing consumers — separate blast radius from the board. |
| **#6d** | Units 11–13 (the five tabs, gates) | **M** | The detail. Depends on #6c; independent of #6b's grid. |

`#6a` blocks `#6b`. `#6c` blocks `#6d`. **`#6b` and `#6c` are independent and can run in
parallel.** If the phase has to be cut, `#6a` + `#6b` alone fix audit S15 and are worth shipping
on their own.

---

## Test Strategy

**Unit (vitest, `environment: "node"`, `test/**/*.test.ts` only).** No jsdom, no Testing Library
— components are not renderable here, which is why every unit above puts its logic in a pure
module and tests that. Note `.test.tsx` files are **not collected** by
`vitest.config.ts`'s `include`.

**Static source guards** (the Phase 1–3 pattern that keeps catching real defects): `/bulk`
contains `NAV_V2_ENABLED ? (`; `VesselIdentityBlock` cannot render without `lotCode`; the
`ExportCsvButton` rows expression is unchanged; `tank-detail-data.ts` has no raw SQL. Use
`code(src)` from `test/helpers/code.ts` for `not.toContain` assertions — it strips comments, and
it exists because guards kept failing on their own documentation four separate times.

**Pre-existing suites that must stay green and must be run:**
`test/route-stability.test.ts` (D6), `test/search-palette.test.ts` (the `⌘⌥⌃⇧` whole-`src/` scan,
R14), `test/shell-nav.test.ts`, `test/fill.test.ts`.

**Playwright:** `npm run qa:a11y` and `npm run qa:visual` on **both** flag paths — the flag-off
path is a genuine before-baseline, the thing Phase 0/1 could not produce.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The two tabs disagree on "latest Brix" (AC-S27 fails in production) | MED | **HIGH** | D1's single derivation + D2's single sourcing rule; the invariant is a unit test, not a review item |
| Legacy fan-out panels double-plot the chart | MED | HIGH | `dedupeByPhysicalReading`, reused from `getVesselTimeline` |
| Fill sourced from `VesselComponent` instead of `VesselLot`, rendering full tanks as empty | LOW | **HIGH** | Both existing call sites already do it right; a test pins the source |
| `TimeSeriesChart`'s two-axis mode has never run in production (Conflict #7) | MED | MED | Unit 10 is test-first; Brix/temp dual-axis is its first real exercise |
| Editing a Phase 2 component breaks `AnalyteTrendChart`/`BrixChart` | LOW | MED | The new prop is additive and defaulted; a source guard asserts neither wrapper passes it |
| Board scope creeps into barrels | MED | MED | D4, stated in the PR body |
| The axe sweep surfaces a pre-existing backlog | HIGH | MED | Scope the gate to AC-S22–S27; log the rest to `TODOS.md` |
| A new keyboard hint ships a Mac glyph | LOW | MED | `search-palette.test.ts:56-78` scans every `.ts`/`.tsx`/`.css` under `src/` |

---

## Success Criteria

- [ ] `/bulk` with the flag on shows every tank as a tile, each carrying its **lot code** (AC-S22).
- [ ] Fill height is within 1px of `volumeL / capacityL`, asserted by test (AC-S23).
- [ ] Every tank state is distinguishable with colour removed — glyph + text (AC-S24).
- [ ] The fermentation chart is followed by a **visible** complete data table (AC-S25).
- [ ] Chart series are distinguishable by dash + marker with colour removed (AC-S26).
- [ ] Every stated number on the detail page derives from `tank-detail-facts.ts`, asserted by test (AC-S27).
- [ ] `Export CSV` is no longer the most prominent control, and its rows expression is unchanged.
- [ ] Zero Prisma schema, migration, ledger, tenancy/RLS or assistant-behaviour changes.
- [ ] `AssistantDock` diff is empty.
- [ ] `test/route-stability.test.ts` green — no route removed or renamed.
- [ ] `test/search-palette.test.ts` green — no `⌘⌥⌃⇧` anywhere in `src/`.
- [ ] `npm run qa:a11y` run and green on both flag paths at 390px and 1440px.
- [ ] The flag-off path renders today's accordions byte-for-byte.

---

## Confidence Check

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | S15 verified by reading `BulkClient.tsx:193` — the accordions really do default closed |
| Reconciliation Conflicts | HIGH | All ten checked against source with file:line |
| Part A units | HIGH | Every component to reuse was located and its prop interface read |
| Part B units | MEDIUM-HIGH | The tabs and the history union already exist; the unknown is whichever sourcing rule OD-P6-3 picks |
| AC-S27 mechanism | HIGH | D1 converts a judgment call into a testable invariant |
| Test Strategy | HIGH | Reuses the harness and static-guard pattern from Phases 1–3 |
| Risk Assessment | MEDIUM-HIGH | The data risks are well understood; the "does the board feel right on a phone" risk is a product judgment |

---

## Owner decisions — ALL FOUR RATIFIED 2026-07-28

✅ **Owner took every recommendation below, and approved building all four PRs in one pass.**
Nothing blocks implementation. The recommendations stand as written; the reasoning is kept
because it is what a reviewer needs in order to disagree later.

**OD-P6-1 — modal or route for tank detail?** → **RATIFIED: modal only, route deferred.** Doc 02 SC-11 says *"`/bulk/[vesselId]` or modal
over the board (both acceptable; modal preferred on desktop, route on mobile)"*; doc 04 §8 says
at 390px *"Full route, not a modal."* Building both is two surfaces.
**Recommendation: modal only, defer the route.** The existing vessel `Modal` already uses
`fullScreenOnMobile`, so at 390px it looks like a route already; it already contains the eleven
cellar action modes and the editing forms, which a new route would have to re-host; and
`route-stability` makes adding `/bulk/[vesselId]` later free (D6). The one real thing we give up
is deep-linking, and its main consumer is tag scanning, which is RFC-004 behind the gate.
*Blocks Unit 12.*

**OD-P6-2 — where does Export go?** → **RATIFIED: PageHeader actions slot.** Doc 02 SC-10 says *"export moves into an overflow menu."*
There is no overflow/menu primitive in the design system, and inventing one is an unspecified
component in a phase that has no spec for it.
**Recommendation: `PageHeader`'s `actions` slot as a secondary control.** That satisfies R11
("out of the most prominent position") without shipping an unspecified primitive. A real
overflow menu belongs to whichever phase specs it. *Blocks Unit 6.*

**OD-P6-3 — which panel-sourcing rule is canonical for a vessel?** → **RATIFIED: listVesselAnalyses' rule.** See Conflict #8 and D2.
**Recommendation: `listVesselAnalyses`'s rule** (`vesselId` match **OR** null-snapshot panel on a
resident lot), because it is what the Analyses tab already does and disagreeing with it on the
same page is exactly the AC-S27 failure. *Blocks Unit 9.*

**OD-P6-4 — confirm location is omitted from the identity block.** → **RATIFIED: show VesselGroup, omit location.** See Conflict #1. `Vessel` has
no location field; adding one is a schema change and therefore gated.
**Recommendation: show `VesselGroup`, omit location, say so in the PR body.** *Blocks Unit 4.*

**Nothing blocks any PR.** All four decisions are ratified; build order is #6a → (#6b ∥ #6c) → #6d.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** NO REVIEWS YET — run `/autoplan` for the full review pipeline, or the individual
reviews above. `/council` is worth it here for the AC-S27 mechanism (D1) specifically.
