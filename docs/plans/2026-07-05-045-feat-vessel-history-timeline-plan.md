---
title: Vessel workspace (tanks + barrels) — Actions / Analyses / History tabs, WO issue + status, occupancy-scoped editable timeline, interactive charts
type: feat
status: completed
date: 2026-07-05
branch: claude/vessel-history-timeline
depth: deep
units: 12
---

## Overview

Turn the vessel popover's "Fermentation" modal into the vessel's full **workspace** — for **tanks AND
barrels alike** (both already open the same `CellarActions` modal). A three-tab modal titled
"History · {code}": **Actions** is the do-everything surface — log Brix/pH/temperature, log every cellar
action (additions, pump-overs / punch-downs / pulse-air and all cap management, racks, topping, fining,
filtration, dump, analysis, tasting, sample), AND **issue a work order** against this vessel right there
(the existing WO flow, vessel pre-selected). **Analyses** is the fermentation graphs (Brix + temperature
+ pH over time), now interactive. **History** is a chronological, occupancy-scoped timeline of everything
done to this vessel's current fill — including **when a work order was issued and its live status shown
as a colored badge** ("issued" blue, "complete" green, …). Every timeline entry is clickable into a
detail modal with full provenance (who/when, WO issuer + completer), notes, and edit/undo.

## Problem Frame

Today the vessel popover's "Fermentation" modal only logs readings + additions and shows a HISTORY table
of chemistry readings. Everything else a cellar hand does to a tank OR barrel — the 9am pump-over, the
noon bentonite addition, the 4pm rack-and-return, the 7pm gelatin fining, the cap-management work orders,
the temperature setpoint — is invisible here; you leave for the lot-detail page, which is lot-scoped (a
blended vessel holds several lots) and never resets when the vessel is reused. You also can't issue a
work order from the vessel you're looking at, and you can't see whether a WO you issued against this tank
is still open or done. The label "Fermentation" undersells all of it.

Doing nothing keeps the cellar's real questions — "what's been done to this vessel, what work is
outstanding on it, and can I fix that entry?" — a multi-page hunt with no provenance, no correction path,
and no work-order visibility. The job: open a vessel (tank or barrel), DO the work (including issuing a
WO), WATCH the ferment, and SEE/CORRECT its history — all in one place, scoped to the wine in it now.

## Requirements

- MUST: Works identically for **tanks and barrels** — the workspace is vessel-generic (`vessel.type` ∈
  `TANK|BARREL`); nothing is gated to `TANK`. Labels already render "Barrel 14" / "Tank 1"
  (`timeline.ts` `vesselLabel`).
- MUST: Rename the popover control "Fermentation" → **"History"** (`CellarActions.tsx:220`) and the modal
  title → **"History · {code}"** (`:289`).
- MUST: Three-tab workspace: **Actions**, **Analyses**, **History**.
- MUST — **Actions tab**: log readings (Brix / pH / temperature) AND log every action type (additions,
  cap management incl. pump-over/punch-down/cold-soak/maceration/**pulse-air**, racks, topping, fining,
  filtration, dump, analysis, tasting, sample), logged immediately (existing ad-hoc behavior).
- MUST — **Actions tab: issue a work order** against this vessel, reusing the existing WO creation flow
  (`NewWorkOrderClient`) with the vessel **pre-selected and locked**; create-from-template then issue.
- MUST — **Analyses tab**: interactive dual-axis Brix/Temp/pH chart + readings table + AF/MLF state, PLUS
  the folded-in multi-analyte `AnalyteTrends` view; the standalone "View analyses" button (`:222`) is
  removed. [gate 2026-07-05]
- MUST — chart is **interactive**: hover shows a crosshair + tooltip with Brix, Temp, pH at the nearest
  reading + its date/time. Touch = tap; `<title>` a11y fallback.
- MUST — **History tab**: a chronological (newest-first), time-stamped feed of ALL activity on the
  vessel's current fill — ledger ops (RACK, ADDITION, FINING, `CAP_MGMT`, FILTRATION, TOPPING, LOSS/dump,
  CRUSH/PRESS/SAIGNEE, BLEND legs, SEED, transitions), vessel-maintenance events (`VesselActivityEvent`),
  analysis panels, AND **work orders issued against the vessel**; each entry shows date **and** time.
- MUST — **work-order visibility on History**: when a WO is issued against the vessel, a "Work order #N
  issued" entry appears (at `issuedAt`) with a **colored status badge** reflecting live status, reusing
  the existing `STATUS_TONE` color language (ISSUED→blue, IN_PROGRESS→gold, PENDING_APPROVAL→maroon,
  APPROVED/DONE→green, REJECTED→red, DRAFT/CANCELLED/SKIPPED→neutral). Ops written by completing a WO
  task also carry a WO badge/link.
- MUST — **occupancy reset**: History (and the Analyses graphs) show only the vessel's **current
  occupancy window** (everything since the vessel was last empty). Empty + refill → fresh slate. The
  immutable ledger is NEVER deleted — the view is *scoped*. WO entries are likewise scoped to
  `issuedAt >= windowStart`.
- MUST — **click-through detail modal**: clicking an entry shows provenance (entered by/at, capture
  method, note) and — for WO-sourced ops — who issued the WO + when, who completed the task + when,
  assignee, approval status.
- MUST — **edit / undo** from the detail modal, reusing existing ledger-correct machinery: edit
  dose/kind/duration/note for ADDITION/FINING/CAP_MGMT; void+relog for readings; undo/reverse for
  structural ops where the dispatcher says it's reversible.
- SHOULD: History filter chips (All / Additions / Cap mgmt / Movements / Analyses / Maintenance / Work
  orders).
- SHOULD: History entries tied to a lot expose a "view lot" deep-link to `/lots/[id]`; WO entries link to
  `/work-orders/[id]`.
- NICE: Factor the crosshair interaction into a shared helper so `AnalyteTrendChart`/`BrixChart` can
  adopt it later.

## Scope Boundaries

**In scope:**
- Rename control + modal title; new `Tabs` primitive; applies to tanks + barrels (one component).
- Extract `CellarActions` sub-forms into reusable components; host them (+ readings + an "Issue WO"
  launcher) in an Actions tab.
- Embed `NewWorkOrderClient` in a "locked-vessel" mode; a composer-data action; create→issue.
- Occupancy-window computation; scope History + graphs + WO entries to it.
- Vessel-scoped timeline loader (reuse `src/lib/lot/timeline.ts`); WO issuance items + status badges via a
  shared `STATUS_TONE` helper; `VesselTimeline` feed; per-entry detail modal with provenance + edit/undo.
- Interactive `FermentChart`; fold `AnalyteTrends` into Analyses.

**Out of scope (and why):**
- Deleting ledger rows on empty — the ledger is append-only + immutable (cost/TTB/lineage/undo). "Reset"
  is a view scope; the lot's activity stays on `/lots/[id]`.
- New ledger op types / schema changes / migrations — reads + UI + reuse of existing write/issue actions.
- Building a NEW work-order engine or approval UI — we reuse `createWorkOrderFromTemplateAction` +
  `issueWorkOrderAction`; approval/execution stays on `/work-orders`. History only surfaces WO status.
- Turning the ad-hoc Actions (additions/cap-mgmt) INTO work orders — those still log directly; issuing a
  WO is a separate, explicit affordance.
- A charting library — pure-SVG/token-driven stays.
- Editing the ledger forbids (e.g. a rack's volume in place) — those are undo/reverse.
- Removing the popover's inline CELLAR ACTIONS quick-row — kept; Actions tab reuses the SAME extracted
  components (slimming the popover is a follow-on).

## Research Summary

### Codebase Patterns

- **Base state = `origin/main` @ `#73` (`5fa3374`).** This branch was fast-forwarded onto the shipped
  barrel-maintenance work (plan 044). That PR added `VesselActivityKind` values `OZONE`/`SO2`/`WET_STORAGE`
  (migration `20260705140000_barrel_activity_kinds`), a `BATONNAGE` `CapKind`, and barrel-maintenance SYS
  templates. Reconciliations below (Units 1, 5) reflect it. This feature adds NO new migration on top.
- **Barrel/tank parity** — `src/app/(app)/bulk/BulkClient.tsx:367` renders ONE `<CellarActions
  vessel={{type: selected.type …}}>` for both `renderTypeCard("Barrels", barrels)` and the tanks list.
  `vesselLabel` (`timeline.ts:128`) already does "Barrel 14"/"Tank 1". So the whole workspace is
  vessel-generic by construction — just don't gate anything to `TANK`.
- **Pure timeline engine (reuse)** — `src/lib/lot/timeline.ts`: `describeOperation()` (:180) renders a
  summary for every `OperationType` incl. `CAP_MGMT` (`CAP_LABEL` :10, has PULSE_AIR); `buildTimeline()`
  (:346); `mergeTimeline()` (:592) interleaves records by `observedAt`; `TimelineItem` union (:451). No
  prisma imports.
- **Lot loader to mirror** — `src/lib/lot/data.ts` `getLotDetail()` (:253): UNIONs `lotOperationLine`
  (:264) + `lotTreatment` (surfaces neutral additions/fining/cap-mgmt, comment :265) → group by
  `operation.id` → `buildTimeline` + `mergeTimeline`.
- **Occupancy (derive)** — no fill-cycle marker. `VesselLot` row deleted at ≤ `FUNCTIONAL_ZERO_L` (0.005 L,
  `src/lib/ledger/vocabulary.ts`); `foldLines` in `src/lib/ledger/math.ts:59`. `LotOperationLine.vesselId`
  (:1264) + signed `deltaL` (:1265); `LotOperation.id` (:1219) monotonic fold order, `observedAt` (:1221).
- **Edit/undo (reuse)** — `LotDetailClient.tsx`: `TimelineEditModal` (:784)/`EditPanel` (:794) edit
  ADDITION/FINING/CAP_MGMT via `editOperationAction`/`deleteOperationAction`; `UndoControl` (:211) →
  `reverseOperationAction({operationId, lotId})` gated by `event.reversible`/`reversalReason`;
  `RecordEditPanel` (:536) via `voidPanelAction`/`voidTastingNoteAction`/`cancelSampleAction`; editable set
  = `NEUTRAL_OPS` (:32).
- **WO ↔ op provenance (reuse)** — `WorkOrder.issuedByEmail/issuedAt` (:2658), `completedAt`, `approvedBy*`;
  `WorkOrderTaskAttempt.operationId` (:2743, the ledger op it wrote), `completedByEmail/completedAt`
  (:2748). Op→WO: `workOrderTaskAttempt.findMany({ where:{operationId:{in}}, include:{task:{include:
  {workOrder:true}}}})`.
- **WO ↔ vessel + status (new use)** — `WorkOrderTask.sourceVesselId`/`destVesselId` (:2704-ish, canonical
  cols extracted from `plannedPayload` by `canonicalColumns`, `template-vocabulary.ts:279`). Query WOs for
  a vessel: `workOrderTask.findMany({ where:{ OR:[{sourceVesselId},{destVesselId}] }, include:{ workOrder
  }})`. Enums: `WorkOrderStatus` = DRAFT/ISSUED/IN_PROGRESS/PENDING_APPROVAL/APPROVED/CANCELLED (:2559);
  `WorkOrderTaskStatus` = PENDING/IN_PROGRESS/PENDING_APPROVAL/APPROVED/REJECTED/DONE/SKIPPED (:2573).
- **WO creation flow (embed)** — `src/app/(app)/work-orders/new/NewWorkOrderClient.tsx:26`:
  `({templates, pickers:{vessels,materials,lots}, initialTemplateId})`; picks a template, builds tasks,
  `VesselMultiSelect.tsx` fans one vessel-array into N tasks. Loaders: `listTemplatesWithSpec(tenantId)` +
  `getWorkOrderPickers(tenantId)` (`src/lib/work-orders/data.ts:481,545`). Actions
  (`src/lib/work-orders/actions.ts`): `createWorkOrderFromTemplateAction` (:98, → DRAFT) then
  `issueWorkOrderAction` (:91, → ISSUED). Two steps.
- **Status badges (reuse the color language)** — `Badge.tsx` tones = neutral/gold/green/blue/maroon/red +
  variant soft/solid/outline. `STATUS_TONE` maps live in `WorkOrderDetailClient.tsx:10` and
  `WorkOrdersClient.tsx:18` (DRAFT→neutral, ISSUED→blue, IN_PROGRESS→gold, PENDING_APPROVAL→maroon,
  APPROVED→green, REJECTED→red, DONE→green). Extract to a shared client-safe helper so History reuses it.
- **Action sub-forms (extract)** — `CellarActions.tsx`: `DoseForm` (:322), `CapForm` techniques (:623/:627),
  `RackForm` (:524), `ToppingForm`/`FiltrationForm`/`DumpForm`/`AnalysisForm`/`TastingForm`/`SampleForm`.
  `FermentMonitor`/`ReadingRows`/`MaterialPicker` already decoupled; readings via `capture()`
  (`FermentMonitor.tsx:172`).
- **Charts** — `FermentChart.tsx` dual-Y + pH strip, pure SVG, scale math `src/lib/harvest/chart.ts`; no
  pointer handlers. `AnalyteTrends.tsx` fed by `vesselAnalysesAction` (`CellarActions.tsx:266`).
- **UI** — `Modal` (no tabs), `Collapsible`, `Button`, `Badge`, `Card`, `Eyebrow`. No `Tabs`.
- **Tenant reads** — extended `prisma` (auto-resolved); `vesselId` explicit (K12).

### Prior Learnings

- **`/bulk` reads `vessel_lot`, not the ledger** (`bulk-reads-vessel-component-not-ledger`): History + the
  occupancy fold source from the ledger by `vesselId`, not the projection (else blend activity vanishes).
- **Universal timeline undo via `reverseOperationCore`** (`universal-timeline-undo-024a`): reuse from the
  detail modal.
- **Measurements attach to one lot** (`measurements-attach-to-one-lot`): Analyses stays lot-scoped (keep
  the multi-lot picker `CellarActions.tsx:293`); History is vessel-scoped.
- **`invariant-drift.test.ts` pre-broken** — ignore in `vitest run`.

### External Research

None — internal reuse (pure-SVG charts, timeline engine, edit/undo, WO models + creation flow + badges).

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Tanks + barrels | One vessel-generic workspace; nothing gated to TANK | Tank-only, separate barrel UI | `/bulk` already renders one `CellarActions` for both; `vesselLabel` handles both. Free parity |
| "Reset on empty" | Scope the view to the current occupancy window; never delete ledger rows | Hard-delete on empty | Deleting corrupts cost/TTB/lineage/undo; scoping gives the same UX safely |
| Occupancy start | Fold the vessel's ledger `deltaL` per-vessel by op id; window = after summed volume last ≤ `FUNCTIONAL_ZERO_L` | `vessel_lot` residents; a materialized `vessel_occupancy_epoch` table (Codex #6) | Only blend-safe source; matches how the projection zeroes; no schema change. **Compute-on-read chosen at eng-review gate** — the epoch table (faster, edit-robust, single ordering domain) needs a migration + governed ledger-write changes; deferred as a future optimization, revisit if per-open fold is slow |
| Issue WO in-modal | Embed `NewWorkOrderClient` in a "locked-vessel" mode; create-from-template → issue | Link out to `/work-orders/new?vessel=`; rebuild a mini form | Reuses the whole proven flow (templates, task builds, reservations); locking the vessel is a small additive prop |
| WO on the timeline | A `WORK_ORDER` timeline item at `issuedAt` with a live status badge; op entries also get a WO badge via the attempt→WO join | Only show WO provenance in the op's detail modal | The user wants issuance + status visible at a glance; the item shows even for tasks that write no ledger op |
| Badge colors | Extract the existing `STATUS_TONE` into a shared client-safe helper; reuse verbatim | New color map | One color language across the app; ISSUED→blue, APPROVED/DONE→green already defined |
| Which status on a WO entry | Show the **task** status for THIS vessel's task (falls back to WO status), labeled ("issued"/"in progress"/"complete") | Whole-WO status only | Per-vessel task status is the precise truth for a multi-vessel WO |
| "Edit what was entered" | Reuse ledger-correct edit/undo: edit ADDITION/FINING/CAP_MGMT; void+relog readings; reverse volume ops | Free-form field edits | The ledger is immutable; corrections/reversals ARE the edit model |
| Analyses folds in "View analyses" | Yes — remove the standalone button [gate] | Keep separate | One coherent Analyses surface |

## Implementation Units

### Unit 1: Timeline engine — vessel-activity + work-order items, time labels, provenance/status fields

**Goal:** Extend the pure engine so maintenance events AND work orders are timeline items, entries carry a
time-of-day label, and events can hold optional WO provenance/status for display.
**Files:** `src/lib/lot/timeline.ts`, `src/lib/work-orders/status-badge.ts` (new, client-safe
`statusTone(status)` + label), `test/lot-timeline.test.ts`, `test/wo-status-badge.test.ts` (new)
**Approach:** Add `VesselActivityItem` (`kind:"VESSEL_ACTIVITY"`) + `WorkOrderItem`
(`kind:"WORK_ORDER"`, carrying `{ workOrderId, number, title, taskStatus, woStatus, tone, label,
issuedByEmail, issuedAt }`) to `TimelineItem`; pure `describeVesselActivity(raw)` + `describeWorkOrder
(raw)`. `describeVesselActivity` must label ALL current `VESSEL_ACTIVITY_KINDS` (post-#73): TEMP_SETPOINT,
CLEAN, SANITIZE, STEAM, GAS, **OZONE, SO2, WET_STORAGE**, OTHER — reading the delivery method/gas off
`targetUnit` (e.g. "SO₂ — burned sulfur strip", "Gas: Argon blanket", "Ozone treatment", "Wet storage")
via `SO2_METHODS`/`GAS_TYPES` from `vessel-activity-vocab.ts`. For cap-mgmt op labels, import the canonical
`CAP_LABELS` from `src/lib/cellar/cap-vocab.ts` (now includes PULSE_AIR + BATONNAGE) instead of the stale
local `CAP_LABEL` map in `timeline.ts` (which predates BATONNAGE) — replace that local map to kill the
drift. Extend `mergeTimeline` to accept both new item kinds alongside `RecordItem`s. Add `timeLabel`
(HH:MM) to
`TimelineMeta`/events. Add optional `provenance?` + `workOrder?` display fields to `TimelineEvent`
(populated by the loader). Move the `STATUS_TONE` map out of the two work-order client files into the new
`status-badge.ts` and re-import it there (keep behavior identical). Prisma-free + unit-tested.
**Tests:** `describeVesselActivity` labels for every `VESSEL_ACTIVITY_KINDS` value incl. OZONE/SO2/
WET_STORAGE (+ method/gas off `targetUnit`); cap-mgmt op summary uses `CAP_LABELS` incl. BATONNAGE;
`describeWorkOrder` summaries; `statusTone` for every enum value; `mergeTimeline` interleaves both new
kinds; time-label formatter; existing timeline tests green.
**Depends on:** none
**Patterns to follow:** `timeline.ts` `describeSample` (:555), `RecordItem` union (:450), `mergeTimeline`
(:592); `WorkOrderDetailClient.tsx:10` STATUS_TONE.
**Verification:** `vitest run` timeline + badge tests.

### Unit 2: Occupancy-window computation

**Goal:** Pure `currentOccupancyWindow(lines)` → `{ startOpId, startAt } | null`.
**Files:** `src/lib/vessel/occupancy.ts` (new), `test/vessel-occupancy.test.ts` (new)
**Approach:** Fold **per-vessel** — sum ONLY the lines whose `vesselId` is this vessel, per op (a rack
A→B contributes −δ to A and +δ to B separately, so a single vessel's running total is unambiguous; this
sidesteps Codex #3's within-op source/dest ordering concern). Given the vessel's `{ opId, observedAt,
deltaL }[]` ascending by op id, fold a running total; the window starts at the op that raised the total
above `FUNCTIONAL_ZERO_L` after the last time it was ≤ that epsilon (cleared to null whenever it drops
back), matching the projection's own sweep threshold (consistency with `vessel_lot`). Round with `round2`.
Return `{ startOpId, startAt }` where `startAt = that op's observedAt` (null if currently empty).
**Single ordering domain (Codex #1):** downstream, the loader uses `startOpId` for ledger ops (id is the
volume truth) AND `startAt` for non-ledger events, tie-broken by `(observedAt, id)`. A backdated non-ledger
event straddling a same-day empty+refill may land in the newer window — documented as an accepted v1 edge
(the epoch-table alternative in Key Decisions removes it entirely).
**Circuit-breaker reset (Gemini G1 — "dirty empty"):** volume alone misses a rack-out that leaves a lees
heel (never crosses `FUNCTIONAL_ZERO_L`) before a wash + refill, which would merge two vintages. So ALSO
treat the most recent `VesselActivityEvent` of kind `CLEAN`/`SANITIZE`/`STEAM` as a hard window boundary
(these happen only on an emptied vessel) — the window start is `max(volume-zero-crossing op, latest
clean/sanitize/steam event)`. Documented assumption: a clean/sanitize implies the vessel was empty; if a
winery ever cleans a partially-full vessel this would over-reset (acceptable, rare; revisit if reported).
**Bounded fold (Gemini G3):** do NOT load the vessel's entire ledger. Page lines **backward** (newest op
id first) in chunks via Prisma `findMany` (cursor/`take`), accumulating the backward running sum, and STOP
as soon as the sum reaches the vessel's current total (i.e. the zero-crossing) — so a 30-fill, 5-year tank
reads only back to its last empty, not 5000 rows. Prisma `findMany` keeps RLS via the tenant extension
(Gemini G4); if a raw window-function query is ever substituted, it MUST go through `runInTenantRawTx`
(guarded by `verify:raw-sql`) — never bare `$queryRaw`.
**Tests:** never-emptied (first op), emptied+refilled (refill op), heel/topped-up (continuous),
currently-empty (null), same-day multi-empty.
**Depends on:** none
**Patterns to follow:** `src/lib/ledger/math.ts` `foldLines` (:59); `FUNCTIONAL_ZERO_L`.
**Verification:** `vitest run`.

### Unit 3: Vessel-scoped timeline loader (occupancy scope + WO items + WO provenance)

**Goal:** `getVesselTimeline(vesselId)` → `{ vesselCode, vesselType, windowStartAt, items:
TimelineItem[] }`, occupancy-scoped, with WO issuance items + WO badges on WO-sourced ops.
**Files:** `src/lib/vessel/timeline-data.ts` (new), `src/lib/vessel/timeline-actions.ts` (new `"use
server"`), `test/vessel-timeline-data.test.ts` (new)
**Approach:** Mirror `getLotDetail` vessel-scoped: (1) fold occupancy (Unit 2) → `windowStartOpId/At`;
(2) ops touching the vessel via `lotOperationLine` UNION `lotTreatment` where `vesselId`, filtered to
`op.id >= windowStartOpId`; load full lines+treatments, filter treatments to `vesselId`, `buildTimeline`;
(3) `vesselActivityEvent` where `vesselId` + `observedAt >= windowStartAt` → `describeVesselActivity`; (4)
`analysisPanel` where `vesselId, voidedAt:null, observedAt>=windowStartAt` → `describeMeasurementPanel`;
(5) **work orders**: `workOrderTask.findMany({ where:{ OR:[{sourceVesselId:vesselId},{destVesselId:
vesselId}] }, include:{ workOrder:true, attempts:true }})`, → `describeWorkOrder` items (task status →
tone/label via Unit 1's helper). **Inclusion rule (Gemini G2 — the "clean & fill" WO issued before the
fill must still show):** include a WO if ANY of: its `issuedAt >= windowStartAt`, OR it has an
attempt/op within the window, OR it is still active (`WorkOrder.status` ∈ ISSUED/IN_PROGRESS/
PENDING_APPROVAL). Do NOT filter on `issuedAt` alone. (6) batch WO provenance for op entries:
`workOrderTaskAttempt.findMany({ where:{ operationId:{in:opIds}}, include:{task:{include:{workOrder}}}})`
→ attach `workOrder`+`provenance` to those events; (7) **resolve reversibility per op (Gemini G5):** as
`getLotDetail` does, ask the reverse dispatcher for each op's `reversible`+`reversalReason` verdict and
stamp it on the event, so the detail modal can disable Edit/Undo up-front (no click-then-error); (8)
`mergeTimeline`. Extended `prisma` (RLS via the tenant extension); `vesselId` explicit (K12).
**Tests:** seeded blended vessel (2 lots, rack, addition on lot A, cap-mgmt WO completion, temp setpoint,
analysis panel, one issued WO): all events newest-first w/ correct summaries; a pre-empty op excluded
after a refill; a different-vessel addition absent; the WO shows as an item with a status badge; the
cap-mgmt op carries issuer+completer.
**Depends on:** Units 1, 2
**Patterns to follow:** `getLotDetail` (`data.ts:253`), UNION comment (:265); WO queries from research.
**Verification:** `vitest run`; manual: call the action for a tank AND a barrel in Demo Winery.

### Unit 4: `Tabs` UI primitive

**Goal:** Accessible, token-driven tabs; panels mounted-but-hidden.
**Files:** `src/components/ui/Tabs.tsx` (new), `src/components/ui/index.ts`
**Approach:** `role="tablist"/"tab"/"tabpanel"`, `aria-selected`, arrow-key nav, wine-accent active
underline from tokens (no hardcoded colors). Panels stay mounted (hidden) so the chart keeps interactive
state. `tabs={[{id,label,content}]}` API.
**Tests:** click/arrow changes panel; `aria-selected` tracks.
**Depends on:** none
**Patterns to follow:** `Collapsible.tsx`, `Button.tsx`/`Eyebrow.tsx` tokens.
**Verification:** render in the modal; `npm run build`.

### Unit 5: Extract cellar action sub-forms into reusable components

**Goal:** `DoseForm`, `CapForm`, `RackForm`, `ToppingForm`, `FiltrationForm`, `DumpForm`, `AnalysisForm`,
`TastingForm`, `SampleForm` as standalone components importable by the popover AND the Actions tab.
**Files:** `src/components/cellar/forms/*.tsx` (new), `src/app/(app)/bulk/CellarActions.tsx` (import them)
**Approach:** Behavior-preserving move with explicit props (`vessel`, `materials`, `pending`, `onDone`);
`CellarActions` renders them via its existing mode switch (:229). **Drift fix:** the current `CapForm`
(`:627`) still hardcodes only the original four techniques — source its list from the canonical
`CAP_KINDS`/`CAP_LABELS` in `src/lib/cellar/cap-vocab.ts` so it offers PULSE_AIR **and BATONNAGE** (bâtonnage
is the classic barrel move — important now that barrels are first-class). `capManagementAction` already
accepts any `CapKind`. No migration.
**Tests:** each extracted form submits via the same action with the same payload as before
(characterization); the cap form now offers all `CAP_KINDS` (incl. bâtonnage); `/bulk` popover logs a
cap-mgmt/addition/rack identically for a tank AND a barrel (e.g. a bâtonnage on a barrel).
**Depends on:** none
**Patterns to follow:** current in-file forms (`CellarActions.tsx:322–902`); behavior-preserving extraction.
**Verification:** run the app; log an addition + pump-over from the popover as today; `vitest run`.

### Unit 6: Interactive `FermentChart` (crosshair + tooltip)

**Goal:** Hover shows a crosshair + tooltip with Brix/Temp/pH at the nearest reading + its date/time.
**Files:** `src/components/ferment/FermentChart.tsx`, `src/lib/harvest/chart.ts` (`nearestByX`),
`test/harvest-chart.test.ts`
**Approach:** Transparent full-plot `<rect>` capturing `pointermove`/`leave` (+ `pointerdown` touch-pin);
client X → time via inverse `scaleLinear`; pure `nearestByX(sortedTimes, t)` (bisect) picks the index;
render crosshair + emphasized dots + an absolutely-positioned token-styled HTML tooltip (`tabular-nums`).
`prefers-reduced-motion` respected; `<title>` fallback kept; empty/1-point guarded. No new deps.
**Tests:** `nearestByX` (exact/between/before/after); pointermove sets tooltip to the nearest point.
**Depends on:** none
**Patterns to follow:** `FermentChart.tsx` scale usage; `AnalyteTrendChart.tsx:151`; `chart.ts` `scaleLinear`.
**Verification:** app: open a vessel w/ ≥3 readings, hover; `vitest run`.

### Unit 7: `VesselTimeline` feed component (with WO status badges)

**Goal:** Render `getVesselTimeline` items as a scannable, day-grouped, filterable, clickable feed with
colored WO status badges.
**Files:** `src/components/vessel/VesselTimeline.tsx` (new)
**Approach:** Client component over `items: TimelineItem[]`. Reuse read rendering from `LotDetailClient`
(`TimelineRow` :509, `LegLine` :173, `<time>` :295); each row is a **button** opening the detail modal
(Unit 8). Show `timeLabel`, a per-kind chip, and for `WORK_ORDER` items (and WO-sourced ops) a
`<Badge tone={statusTone(status)}>` using Unit 1's shared helper. Day grouping, filter chips (incl. Work
orders), empty state ("No activity since this vessel was filled."), header "Filled {date}". WO items link
to `/work-orders/[id]`; lot-linked entries to `/lots/[id]`.
**Tests:** renders each kind incl. WORK_ORDER; the status badge tone matches the map; filter narrows;
clicking a row invokes open-detail; a WO-sourced op shows a WO badge.
**Depends on:** Units 1, 3
**Patterns to follow:** `LotDetailClient.tsx` `TimelineRow`/`LegLine`; `WorkOrdersClient.tsx` badge usage.
**Verification:** render with fixtures; visual check in the modal.

### Unit 8: Timeline entry detail modal (provenance + edit/undo)

**Goal:** Clicking an entry opens a modal with full provenance, WO issuer/completer, notes, edit/undo.
**Files:** `src/components/vessel/TimelineEntryDetail.tsx` (new); extract reusable bits from
`LotDetailClient.tsx` into `src/components/cellar/timeline/*` if cleaner
**Approach:** A `Modal` branching on `item.kind`/op type: header shows entered-by/at + capture method +
note; a **Work order** block when the event has `workOrder` provenance (issued by/at, completed by/at,
assignee, status badge) — for a `WORK_ORDER` item, link to `/work-orders/[id]`; edit/undo reuses the
lot-detail machinery (`editOperationAction`, `reverseOperationAction` gated by `reversible`/
`reversalReason`, `voidPanelAction` etc.; readings via void+relog). Refresh the vessel timeline after a
successful mutation. **Pre-computed lock state (Gemini G5):** Edit/Undo render **disabled up-front** with a
lock icon + the `reversalReason` tooltip (e.g. "Downstream operations exist"), using the verdict the loader
resolved in Unit 3 step 7 — the user never clicks into a guaranteed rejection.
**Tests:** ADDITION opens editable (dose/note) → `editOperationAction`; RACK shows undo →
`reverseOperationAction`; a WO-sourced op shows issuer+completer; a reading edits via void+relog; a
non-reversible op shows the muted reason.
**Depends on:** Units 3, 7
**Patterns to follow:** `TimelineEditModal` (:784)/`EditPanel` (:794)/`UndoControl` (:211)/
`RecordEditPanel` (:536); WO render in `work-orders/review/ReviewClient.tsx:50`.
**Window-invalidation (Codex #4):** an edit/undo can retroactively change the occupancy window (e.g.
undoing the rack that emptied the tank reopens the prior fill). After ANY successful mutation, refetch
`getVesselTimeline` (which recomputes occupancy) — never optimistically patch the feed. If `windowStartAt`
changed, re-render from the fresh window (the reopened/rescoped history), so the user never edits against a
window that no longer exists.
**Verification:** app: edit an addition, undo a rack, open a WO-sourced cap-mgmt entry and see who
completed it.

### Unit 9: Issue-a-work-order composer (locked vessel)

**Goal:** From the Actions tab, issue a WO against THIS vessel using the existing creation flow, vessel
pre-selected + locked.
**Files:** `src/app/(app)/work-orders/new/NewWorkOrderClient.tsx` (add a `lockedVessel?: {id,label}` prop),
`src/lib/work-orders/composer-actions.ts` (new `"use server"` `getVesselWorkOrderComposerData(vesselId)` +
a `createAndIssueWorkOrderAction` wrapper), `src/components/vessel/IssueWorkOrderPanel.tsx` (new)
**Approach:** Add a **discriminated** `mode` prop to `NewWorkOrderClient` — `{ mode?: "standalone" }`
(default, `/work-orders/new` unchanged) vs `{ mode: "lockedVessel"; vesselId; vesselLabel; onCreated }`
(Codex #5: standalone stays the default so the page can't regress; the locked path never assumes parent
context in its submit payload). In locked mode, pre-fill every single-vessel task field with that id and
render a locked `Badge` instead of `VesselMultiSelect` (leave transform from/to-vessel selects as-is;
pre-fill the source vessel where the template has one). `getVesselWorkOrderComposerData` returns `{templates, pickers}` from
`listTemplatesWithSpec` + `getWorkOrderPickers` (vessels list may stay full so transform destinations
work, but the primary vessel is locked). `createAndIssueWorkOrderAction` calls
`createWorkOrderFromTemplateAction` then `issueWorkOrderAction` in sequence, returning
`{workOrderId, number, status, reservationWarnings}`. `IssueWorkOrderPanel` wraps it for the tab (loads
data on open, shows reservation warnings, on success closes + refreshes the History timeline). The shipped
barrel-maintenance SYS templates (ozone / SO₂ / wet-storage / bâtonnage, plan 044) come back from
`listTemplatesWithSpec` automatically, so issuing them against a barrel needs no extra work here.
**Tests:** with a locked vessel, submitting a cap-management template creates a WO whose task targets that
vessel and issues it (status ISSUED); reservation warnings surface; the new WO appears on the vessel's
History via `getVesselTimeline`.
**Depends on:** Unit 3 (to show the issued WO on History)
**Patterns to follow:** `NewWorkOrderClient.tsx:26` + `VesselMultiSelect.tsx`; actions
(`actions.ts:91,98`); loaders (`data.ts:481,545`).
**Verification:** app: from a tank AND a barrel, issue a "Cap management" WO; confirm it lands on
`/work-orders` and on the vessel's History with an "issued" badge.

### Unit 10: Rename control + assemble the three-tab workspace

**Goal:** "Fermentation" → "History"; modal becomes Actions / Analyses / History; wire everything.
**Files:** `src/app/(app)/bulk/CellarActions.tsx`, `src/components/ferment/FermentMonitor.tsx` (light),
`src/components/ui/Modal.tsx` (add `fullScreenOnMobile` prop per the design review)
**Approach:** Rename button (:220) + state (`fermentOpen`→`historyOpen`) + title (:289) + subtitle. Open
the workspace `Modal` with `fullScreenOnMobile` (full-screen <768px, centered card ≥768px). The Actions
tab uses the mode-switch hierarchy from the Design decisions section (reading entry on top, grouped action
picker).
Render `<Tabs>`:
- **Actions** → readings entry (`FermentMonitor` readings) + the extracted sub-forms (Unit 5) as an action
  launcher + an **"Issue work order"** button opening `IssueWorkOrderPanel` (Unit 9);
- **Analyses** → interactive `FermentChart` + AF/MLF state + readings table + folded-in `AnalyteTrends`
  (via `vesselAnalysesAction`), multi-lot lot picker (:293) scoped here; remove the "View analyses" button
  (:222);
- **History** → `<VesselTimeline>` (Unit 7) fed by `getVesselTimelineAction(vessel.id)` + the detail modal
  (Unit 8).
Default tab: History. Everything reads `vessel.type` so tanks + barrels both work; do not gate to TANK.
**Tests:** opening a tank AND a barrel shows "History" with three tabs; Actions logs a reading + a
pump-over + issues a WO; Analyses renders chart + chips; History lists the just-logged actions + the
issued WO with a badge; "Fermentation" and the standalone "View analyses" button are gone.
**Depends on:** Units 4, 5, 6, 7, 8, 9
**Patterns to follow:** `CellarActions.tsx:286–316` modal shell + lot picker; `Modal.tsx`.
**Verification:** Demo Winery: full walkthrough on a tank and a barrel.

### Unit 11: Simplify pass

**Goal:** Consolidate duplication introduced across Units 5–10 before verification.
**Files:** whatever emerged (shared row/badge/detail bits, form prop contracts)
**Approach:** After the UI units land, extract any duplicated rendering (timeline row, status badge usage,
detail sections shared between lot-detail and vessel-timeline), align prop contracts, delete dead code.
Keep behavior identical; no new features.
**Tests:** existing tests stay green.
**Depends on:** Units 1–10
**Verification:** `vitest run`; `npm run lint`.

### Unit 12: End-to-end verification on real data (tank + barrel)

**Goal:** Prove the whole flow on seeded Demo Winery data for BOTH a tank and a barrel; suite/build green.
**Files:** (tests per unit) — integration pass; maybe extend a demo seed for a full day of activity.
**Approach:** In **Demo Winery** (never Bhutan Wine Co.): for a tank AND a barrel — seed a blend + a day of
activity (pump-over → bentonite → rack-and-return → gelatin fining → analysis → temp setpoint; for the
barrel, log a **bâtonnage** and issue a **barrel-maintenance** WO — SO₂/wet-storage), issue a WO from the
Actions tab, then fully rack out + refill. Confirm: History lists the day's
activity + the issued WO (with an "issued" badge that turns "complete"/green after approval) newest-first,
composed across both resident lots; after empty+refill the vessel shows ONLY the new fill (old activity
still on the old lot's `/lots/[id]`); the chart is interactive; clicking an entry shows provenance +
edits/undoes correctly; a WO-completed cap-mgmt entry shows who completed it. Run `npm run build`,
`npm run lint`, `vitest run` (ignore `invariant-drift.test.ts`). No governed code touched → no migration/
brain-refresh; confirm the diff is UI + read-loaders + behavior-preserving extraction + reuse of existing
write/issue actions.
**Tests:** aggregate of Units 1–11; a smoke assertion that `getVesselTimeline` for the refilled vessel
returns only the new occupancy's events and includes the issued WO with the right status tone.
**Depends on:** Units 1–11
**Patterns to follow:** `npm run seed:demo-tenant`; AGENTS.md testing-tenant rule.
**Verification:** `npm run build`, `npm run lint`, `vitest run`; manual walkthrough above.

## Test Strategy

**Unit (vitest):** `describeVesselActivity`/`describeWorkOrder` + `statusTone` + time label + `mergeTimeline`
(U1); `currentOccupancyWindow` scenarios (U2); `nearestByX` (U6); `Tabs` (U4); extracted-form
characterization (U5); `VesselTimeline` render/filter/click + badge tone (U7); detail-modal edit/undo/
provenance (U8); locked-vessel WO create+issue (U9). **Integration:** `getVesselTimeline` on a seeded
blended + refilled vessel — composition, occupancy exclusion, no cross-vessel leak, WO item + provenance
(U3); modal three tabs + rename (U10). **Manual e2e (Demo Winery, tank + barrel):** day-of-activity +
issue-WO + empty/refill + edit + WO-provenance + badge transition (U12). Framework: `vitest run` (ignore
pre-broken `invariant-drift.test.ts`).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Occupancy fold wrong (heel, partial rack, same-day empties) | MED | HIGH | Pure `currentOccupancyWindow` unit-tested across all scenarios; fold per-vessel by op id; epsilon = `FUNCTIONAL_ZERO_L` |
| Ordering-domain mismatch: ops windowed by op.id, events by observedAt (Codex #1) | MED | MED | Single boundary: `startAt` = window-start op's `observedAt`; non-ledger events filtered by `startAt`, tie-break `(observedAt,id)`; backdated-straddle documented as accepted v1 edge |
| Correcting a near-empty rack fragments the window (Codex #2) | LOW | MED | Fold the complete ordered ledger; corrections are inverse lines that fold in id order; reopening at the correction op is acceptable v1 (rare); hysteresis noted as a refinement |
| Undo/edit from the modal retroactively changes the window (Codex #4) | MED | MED | After any mutation, refetch `getVesselTimeline` (recomputes occupancy); re-render from the fresh window; never optimistic-patch |
| `lockedVessel` regresses `/work-orders/new` (Codex #5) | MED | MED | Discriminated `mode` prop, standalone default unchanged; test render+submit on both paths |
| "Dirty empty": heel left after rack merges two vintages (Gemini G1) | MED | HIGH | Circuit-breaker: CLEAN/SANITIZE/STEAM event forces a window boundary; test the heel+wash+refill scenario |
| Pre-fill "clean & fill" WO filtered out by `issuedAt` (Gemini G2) | MED | MED | Include WOs that are active or have an attempt/op in the window, not just `issuedAt`; test the Mon-issue/Tue-fill case |
| Full per-vessel ledger fold on every open bloats Node (Gemini G3) | MED | MED | Page lines backward, early-stop at the zero-crossing; Prisma `findMany` keeps RLS (G4); raw SQL only via `runInTenantRawTx` |
| User clicks Undo then eats a generic rejection (Gemini G5) | MED | LOW | Loader resolves `reversible`/`reversalReason`; Edit/Undo disabled up-front with the reason |
| Sourcing from `vessel_lot` misses blend activity | MED | HIGH | Source from the ledger by `vesselId`; U3 test asserts blend composition |
| WO task→vessel link missed (payload-only, no canonical column) | MED | MED | Query `sourceVesselId` OR `destVesselId` (canonicalized at create); note the JSON fallback if a template skips canonicalization; U3 test covers a cap-mgmt WO |
| Embedding `NewWorkOrderClient` regresses the standalone page | MED | MED | `lockedVessel` is an additive optional prop; the `/work-orders/new` path passes it undefined → unchanged; test both paths |
| WO status badge drift from the rest of the app | LOW | MED | Extract ONE shared `statusTone` helper; the two WO client files import it (no divergent maps) |
| "Edit" promises more than the ledger allows | MED | MED | Detail modal mirrors the proven edit/undo split; disabled reasons shown |
| Form extraction changes `/bulk` behavior | MED | MED | Behavior-preserving move + characterization tests on tank AND barrel |
| Crosshair math on the dual-Y chart | MED | MED | `nearestByX` keys on shared X; unit-test + visual check |
| Scope creep (Actions-as-WO, approval UI in-modal, popover removal) | MED | MED | Explicit out-of-scope; ad-hoc Actions stay ad-hoc; approval stays on `/work-orders` |

## Success Criteria

- [ ] The workspace opens for BOTH tanks and barrels; control reads **"History"**, modal is
      **"History · {code}"** with **Actions / Analyses / History** tabs.
- [ ] **Actions** logs Brix/pH/temp + all action types (incl. pulse-air) AND can **issue a work order**
      against the vessel (vessel pre-selected + locked; created + issued).
- [ ] **Analyses** shows the interactive Brix/Temp/pH chart (crosshair reads all three) + the folded-in
      multi-analyte view; the standalone "View analyses" button is gone.
- [ ] **History** shows the current-fill activity (ops + maintenance + analyses + **work orders**)
      newest-first with date **and** time, across the fill's lots; **resets to a fresh slate after
      empty+refill** (old activity stays on `/lots/[id]`).
- [ ] A work order issued against the vessel appears on History with a **colored status badge** (issued→
      blue, complete→green) matching the app's existing color language.
- [ ] Clicking a History entry opens a detail modal with entered-by/at + notes, **WO issuer + completer**
      when applicable, and working **edit/undo**.
- [ ] No schema/migration/governed-code change; `npm run build`, `npm run lint`, `vitest run` (ignoring
      `invariant-drift.test.ts`) green; `/bulk` popover + `/work-orders/new` behave exactly as before.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Screenshots + confirmed data model; gaps (no vessel history/provenance/correction/reset/WO visibility) are real |
| Scope Boundaries | HIGH | Reads + UI + reuse of existing write/issue actions; "scope-not-delete" protects ledger invariants |
| Implementation Units | MEDIUM-HIGH | Reuses timeline engine + edit/undo + WO models + WO creation flow + badges; new bits (occupancy fold, form extraction, locked-vessel prop) are isolated + tested |
| Test Strategy | MEDIUM | Needs seeded blended+refilled fixtures + a WO; occupancy edges + WO-status transitions are the riskiest, get dedicated tests |
| Risk Assessment | HIGH | Top risks (occupancy, blend sourcing, WO link, embed regression) each have concrete mitigations |

## Open Questions (resolved at the 2026-07-05 gate)

1. Label "History" ✓; three tabs Actions/Analyses/History ✓; reset = occupancy view-scope (no delete) ✓;
   editable timeline via ledger-correct edit/undo ✓; Analyses folds in "View analyses" ✓.
2. **Barrels + tanks both** ✓ (vessel-generic; one component).
3. **Issue a WO from the Actions tab** ✓ (embed `NewWorkOrderClient`, vessel locked).
4. **WO issuance + status badges on History** ✓ (shared `STATUS_TONE`; issued→blue, complete→green).
5. Still open (low-stakes, decide during work): default tab; whether to slim the popover's inline action
   row later; whether a WO entry shows whole-WO vs. this-vessel-task status when they differ (plan =
   per-vessel task status, fall back to WO status).

## Design decisions (from /plan-design-review)

Calibrated against DESIGN.md (warm-paper, light-only, tokens only, sentence-case, tabular-nums, 768px
breakpoint). All new UI reuses `Modal`/`Badge`/`Tabs`/tokens — no new visual language, no card-grid slop.

**Actions-tab hierarchy (Info Arch 6→9).** Don't render ~10 action buttons + readings + issue-WO as a
flat wall. Reuse the popover's proven **mode-switch** pattern (`CellarActions.tsx:229`): the tab shows the
Brix/pH/temp reading entry at top (the most frequent action), then a compact action picker grouped as
**Additions & cap** (Add / Fine / Cap incl. bâtonnage) · **Movements** (Rack / Top / Filter / Dump) ·
**Records** (Analysis / Tasting / Sample) · **Work order** (Issue WO); picking one reveals its form
inline. Same components as Unit 5, one selection at a time — consistent with the existing popover.

**Interaction states (States 5→9)** — specify what the user SEES, not backend:

| Surface | Loading | Empty | Error |
|---------|---------|-------|-------|
| History feed | skeleton rows (3–4) while `getVesselTimeline` resolves | "No activity since this vessel was filled." + hint to log an action | inline "Couldn't load history — retry" (retry button); never a blank tab |
| Analyses chart | reuse `FermentChart` empty copy ("No readings yet…") | same | reading log still usable |
| Actions tab (empty vessel) | — | when the vessel holds no wine: reading/addition entry is disabled with "Add wine to this vessel first" (racks/receive still available); mirrors today's guard | validation inline per form |
| Issue-WO panel | template list spinner | "No templates yet — create one in Work orders" | reservation warnings shown inline (existing) |

**Responsive (a11y/Responsive 5→9).** [DECIDED at gate] Below 768px the workspace modal goes
**full-screen** — add a `fullScreenOnMobile` prop to `src/components/ui/Modal.tsx` (inset:0, no centered
padding, its own scroll) gated on the 768px breakpoint; desktop is unchanged (centered card). Wire it in
Unit 10. Tab bar is **horizontal-scroll** (Actions/Analyses/History); the timeline is single-column
with date+time on their own line; the interactive chart uses **tap-to-pin** (already planned) since hover
doesn't exist on touch. Wide content never forces the page to scroll horizontally (DESIGN.md rule).

**A11y.** `Tabs` = `role="tablist"`/`tab`/`tabpanel` + arrow-key nav + `aria-selected` (Unit 4); every
action button ≥44px touch target (CapForm already does `minHeight:44`); the crosshair keeps per-dot
`<title>` for screen readers and respects `prefers-reduced-motion`; status badges pair color with a text
label (never color alone) so they're legible to color-blind users; timeline rows are real `<button>`s
(keyboard-focusable) with `<time dateTime>` for the timestamp.

**Badge color language.** Reuse the app's existing `STATUS_TONE` verbatim (extracted to a shared helper):
ISSUED→blue, IN_PROGRESS→gold (renders wine-burgundy per DESIGN.md known-drift #1 — accepted, matches the
WO pages), PENDING_APPROVAL→maroon, APPROVED/DONE→green, REJECTED→red, DRAFT/CANCELLED/SKIPPED→neutral.
Label always shown beside the dot; sentence-case.

## Build status (2026-07-05)

All 12 units implemented + committed on `claude/compassionate-dijkstra-b479ad` (rebased onto `origin/main`
@ #73). Units 1/2/6 (pure) + 3 (loader) + 4 (Tabs) + 5 (form extraction) + 7/8 (feed + detail) + 9 (WO
composer) + 10 (assembly). Green here: `tsc --noEmit` (0 errors), `eslint` (0 errors; only pre-existing
warnings + one intentional unused-arg), `vitest run` (1466 passed / 112 skipped; the sole failure is the
**pre-existing** `invariant-drift.test.ts` SyntaxError, unrelated). New pure tests: occupancy (13),
timeline engine + status-badge (49), nearestByX (+7), timeline-view helpers (12).

**Deferred to a `.env` environment (this worktree has none — known limitation):** `npm run build`
(`prisma migrate deploy` needs `DATABASE_URL`), the DB-backed `getVesselTimeline` integration test, and
the Unit 12 manual Demo-Winery walkthrough (tank + barrel; day-of-activity → issue WO → empty+refill →
edit/undo → badge transitions). No new migration is introduced, so build should be clean once env is
present. Recommend running these in CI / the main checkout before merge.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` (outside voice) | Independent 2nd opinion | 1 | issues_found | 6 raised; 4 folded in, 1 dismissed w/ reason, 1 → user decision |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 6 issues, 0 critical gaps; occupancy compute-on-read locked |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score 6→9/10, 6 decisions; full-screen-on-mobile locked |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CODEX:** ordering-domain mismatch (op.id vs observedAt), false-empty on corrections, undo rewrites window,
lockedVessel regression, per-vessel-fold sidesteps within-op ordering, epoch-table alternative. Fixes 1–4
folded into Units 2/3/8/9 + Risks; #3 dismissed (per-vessel fold); #6 (epoch table) weighed + deferred at gate.
**DESIGN:** Actions-tab mode-switch hierarchy, interaction-state table, responsive (full-screen mobile modal
+ tap-pin chart), a11y (tab roles, 44px targets, color+label badges), badge color language — all folded in.
**COUNCIL (Gemini, gemini-3.1-pro):** GO-WITH-CHANGES. 5 findings, ALL folded in — G1 dirty-empty
circuit-breaker (CLEAN/SANITIZE resets window), G2 pre-fill WO inclusion rule, G3 backward-paged bounded
fold, G4 RLS-safe reads (Prisma/`runInTenantRawTx`), G5 pre-computed lock state on Edit/Undo.
**CROSS-MODEL:** Codex + Gemini + eng-review all flag the occupancy fold as the crux (perf + correctness);
Gemini's dirty-empty + pre-fill-WO cases are new and now covered. Consensus: foundation solid, read-path
was the risk — hardened.
**UNRESOLVED:** none blocking (3 low-stakes items deferred to work-time).
**VERDICT:** ENG CLEARED + DESIGN CLEARED + COUNCIL GO-WITH-CHANGES (changes applied). Occupancy =
compute-on-read (backward-paged + circuit-breaker); mobile = full-screen. Ready to implement.
