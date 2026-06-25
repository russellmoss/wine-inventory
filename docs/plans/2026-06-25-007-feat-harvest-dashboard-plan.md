---
title: Admin per-vineyard harvest dashboard (Brix curve + yield + picks)
type: feat
status: draft
date: 2026-06-25
branch: feat/harvest-dashboard
depth: standard
units: 6
---

## Overview

Replace the backward-looking "Yields by vintage" admin view with an in-season
operational dashboard. For each vineyard, an admin sees a Brix-over-time chart
(one line per block, a dot per reading), and per-block: current Brix, pre-harvest
yield estimate, and every pick (weight + date + the Brix it came off at). The
existing historic yields table is kept as a secondary section so nothing is lost.

## Problem Frame

The current admin harvest view (`HarvestYieldsView`) answers "how did past
vintages finish" — historic totals grouped by vintage year. The user's actual job
during harvest is operational: "where is each block on the ripening curve, what do
I expect off it, and what's already come off, at what sugar." That's a different
question. Nothing today plots Brix over time, and picks don't record the Brix they
were harvested at. Doing nothing means admins keep eyeballing raw numbers across
blocks with no ripening trend and no harvest-readiness signal.

Concrete target (user's words): "Block 1 of Bajo — 20 Brix, yield estimate 700 lb,
300 harvested today."

## Requirements

- MUST: Admin selects a vineyard (reuse the existing `?view=admin` picker pattern).
- MUST: "Brix over time" chart for the selected vineyard — each `BrixLog` plotted
  as a dot at its `recordedAt` date, dots connected by lines; one line per block.
- MUST: Per-block panel showing current Brix, yield estimate (if any), and the
  list of picks. Each pick shows weight, date, and the Brix it was harvested at.
- MUST: Support multiple picks per block; show picked-total and remaining-vs-estimate.
- MUST: kg/lb unit toggle, default kg (reuse `src/lib/harvest/units.ts`; same
  toggle pattern just added to the manager view). Storage stays canonical kg.
- MUST: Replace the incorrect copy ("Yields by vintage / Historic harvest yields …
  Weights shown in metric") with copy describing the dashboard.
- MUST: All colors/fonts/spacing via design tokens (DESIGN.md) — no hardcoded values.
- SHOULD: Per-block line color = the variety's canonical color (`effectiveColor`).
- SHOULD: Capture Brix-at-pick going forward in the manager pick form (optional).
- NICE: Keep the historic "Yields by vintage" table as a collapsible/secondary
  section below the dashboard.
- NICE: Empty/skeleton states (no blocks, no readings, no picks).

## Scope Boundaries

**In scope:**
- New admin dashboard component + data aggregator for the selected vineyard.
- New hand-rolled SVG `BrixChart` component (first chart in the app).
- Schema: add optional `brixAtPick` to `HarvestPick`; thread through entry + reads.
- Manager pick form: optional Brix-at-pick field.
- Copy fix on the admin view.

**Out of scope:**
- Manager (role "user") view changes beyond the optional Brix-at-pick field.
- Multi-vintage Brix history / cross-season comparison (chart is current season).
- Export of the chart (PNG/CSV) — can follow later.
- Any charting library dependency.
- Real-time/streaming updates.

## Research Summary

### Codebase Patterns
- **Brix model is `BrixLog`** (`prisma/schema.prisma:275`): `brixValue Decimal(4,1)`,
  `recordedAt DateTime @default(now())` (a real capture timestamp, backdatable via
  `logBrix(blockId, value, recordedAt?)`), denormalized `vineyardId`, indexed
  `@@index([blockId, recordedAt])` and `@@index([vineyardId])`.
- **`HarvestRecord`** (`schema.prisma:294`): one per `(blockId, vintageYear)`,
  `yieldEstimateKg Decimal(12,3)?`, has `picks HarvestPick[]`.
- **`HarvestPick`** (`schema.prisma:317`): `pickDate @db.Date`, `weightKg Decimal(12,3)`,
  **no brix field**. Cascade-deletes with its record.
- **Data layer** `src/lib/harvest/actions.ts`: `getBlockBrixHistory(blockId)` →
  `BrixLogDTO[]` (all readings, newest-first); `getLatestBrixByBlock(vineyardId)` →
  `Record<blockId,{brixValue,recordedAt}>` (one `DISTINCT ON` query, no N+1);
  `getVineyardHarvest(vineyardId)` → `{records: HarvestBlockDTO[], groups: VintageGroup[]}`.
  **No vineyard-wide Brix time-series query exists** — must add one.
- DTOs (`actions.ts:23-38`): `BrixLogDTO {id,blockId,brixValue,recordedAt,createdByEmail,note}`,
  `PickDTO {id,pickDate,weightKg,createdByEmail}`, `HarvestBlockDTO {blockId,vintageYear,yieldEstimateKg,picks}`.
- Mutations use the `action()` wrapper + `prisma.$transaction()` + `writeAudit()`
  (`actions.ts:60-207`); reads use `requireVineyardScope` / `requireBlockAccess`.
  Decimals converted to numbers at the edge.
- **Admin view is client-fetched**: `HarvestYieldsView.tsx` receives only
  `{vineyards:{id,name}[]}` and calls `getVineyardHarvest(selectedId)` in a
  `useEffect` keyed on selection (lines 142-161). Header/intro copy at lines 165-172.
- **Admin dashboard precedent**: `src/app/(app)/vineyards/field-notes/admin/AdminDashboard.tsx`
  (client component, vineyard cards, detail modal) — closest structural model.
- **Variety colors**: `src/lib/vineyard/colors.ts` — `effectiveColor({varietyColor,varietyId})`,
  `defaultColorFor(varietyId)`, `withAlpha(hex,alpha)` (just added). Deterministic,
  on-brand (8-token PALETTE matching DESIGN.md).
- **Unit conversion**: `src/lib/harvest/units.ts` — `toKg`/`fromKg`/`formatWeightFromKg`/
  `weightUnitLabel`, canonical kg. Manager view toggle pattern in
  `HarvestManagerView.tsx` (state `useState<Unit>("metric")`, kg default).
- **No chart library** anywhere (no recharts/visx/d3/chart.js). Only existing SVG is
  the satellite map polygons. This is the first data-viz chart.
- **Tokens** (`src/styles/tokens/*.css`): colors `--text-primary/secondary/muted`,
  `--accent` (wine), `--border-subtle/default/strong`, `--surface-raised/sunken`,
  `--positive` (deep-green), `--danger` (red), `--warning` (golden); spacing
  `--space-*`, radii `--radius-*`, motion `--ease-standard`/`--duration-normal`,
  type `--font-display/heading/body`, `--text-caption` (13px) for axis labels.
- **Tests**: Vitest, specs in `test/*.test.ts`; harvest math already covered (e.g.
  `test/blend.test.ts`, aggregate logic). Pure transforms are the testable seam.

### Prior Learnings
No relevant prior learnings found (learnings store empty for this project).

### External Research
Not needed — no new external tech; hand-rolled SVG uses only React + tokens.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Charting approach | **Hand-rolled SVG** `BrixChart` component, token-driven | Recharts / visx / chart.js | The chart is simple (multi-series line + dots + a few pick markers). A lib adds a sizable dep, fights the strict DESIGN.md token system (no hardcoded colors, warm shadows, light-only), and needs SSR/client-boundary care under React 19/Next 16. SVG is zero-dep, fully on-brand, and small (~150 lines). |
| Brix-at-pick storage | **Hybrid: add optional `brixAtPick` to `HarvestPick`; derive from nearest `BrixLog` (by `recordedAt` vs `pickDate`) when null** | (B) derive-only, no schema change; (A) required column | "At what Brix" is a property of the pick and the user wants it correct. Explicit capture is accurate; the nearest-reading fallback means historic picks (and picks where the manager skipped the field) still show a sensible Brix. Optional field keeps the manager flow frictionless. |
| Where the dashboard lives | Rework `HarvestYieldsView` into a dashboard (rename to `HarvestDashboard`), keep the historic yields table as a lower "Past vintages" section | New separate route/view | Keeps one admin "Admin view" surface and the existing `?view=admin` picker; avoids a second toggle. No functionality lost. |
| Data fetching | Server-side aggregator `getVineyardHarvestDashboard(vineyardId)` called from the client view's existing selection `useEffect` (same pattern as today) | Server-component fetch | Matches the current `HarvestYieldsView` client-selection model with least churn; one round trip per vineyard switch. |
| Chart scope | Current season (latest `vintageYear`), all blocks | All-time | Operational view is about the season in progress; multi-season is a later enhancement. |

## Implementation Units

### Unit 1: Add optional Brix-at-pick to the schema

**Goal:** `HarvestPick` can store the Brix the fruit was harvested at.
**Files:** `prisma/schema.prisma`, new migration under `prisma/migrations/`.
**Approach:** Add `brixAtPick Decimal? @db.Decimal(4,1)` to `HarvestPick` (mirrors
`BrixLog.brixValue` precision). Generate a migration via `prisma migrate dev`.
Nullable so existing rows are valid and the field stays optional.
**Tests:** None (schema). Verify client regenerates.
**Depends on:** none
**Verification:** `npm run db:generate` clean; `npx prisma validate`; migration
file present and applies.

### Unit 2: Vineyard Brix time-series + dashboard aggregator (data layer)

**Goal:** One server function returns everything the dashboard renders.
**Files:** `src/lib/harvest/actions.ts`, new pure helper `src/lib/harvest/dashboard.ts`,
`test/harvest-dashboard.test.ts`.
**Approach:** Add `PickDTO.brixAtPick: number | null` (read from the new column).
Add a vineyard-wide series query (raw SQL or `findMany`) returning per reading
`{blockId, brixValue, recordedAt}` ordered by `recordedAt`. Add
`getVineyardHarvestDashboard(vineyardId)` (guarded by `requireVineyardScope`) that
returns, for the current season: `blocks: [{ blockId, label, varietyName,
varietyId, varietyColor, latestBrix, yieldEstimateKg, picks: PickDTO[],
series: {recordedAt, brixValue}[] }]`. Put the pure shaping in `dashboard.ts`:
(a) group readings into per-block series, (b) `deriveBrixAtPick(pick, series)` =
explicit `brixAtPick` else nearest reading by `|recordedAt - pickDate|` (null if
no readings). Convert Decimals→numbers at the edge.
**Tests:** `deriveBrixAtPick` (explicit wins; nearest chosen; tie-break; empty
series → null), and series grouping (multiple blocks, ordering).
**Depends on:** Unit 1
**Verification:** `npm test` green for the new spec; type-check passes.

### Unit 3: Capture Brix-at-pick in the manager pick form

**Goal:** Managers can (optionally) record the Brix when adding a pick.
**Files:** `src/lib/harvest/actions.ts` (`addHarvestPick`),
`src/app/(app)/vineyards/harvest/manager/HarvestRecordForm.tsx`.
**Approach:** Extend `addHarvestPick(blockId, weight, unit, pickDate, vintageYear?,
brixAtPick?)` — validate optional Brix 0–35 (reuse the `logBrix` bound), write to
the new column inside the existing transaction + audit summary. Add an optional
"Brix at pick" number input to the pick form next to weight; submit it when set.
Keep the kg-default + live unit conversion already in place.
**Tests:** Optional — extend pure validation if extracted; otherwise manual.
**Depends on:** Unit 1
**Verification:** Add a pick with and without Brix in the manager view; both persist;
audit log entry written.

### Unit 4: `BrixChart` SVG component

**Goal:** A reusable, token-driven line chart of Brix over time, one line per block.
**Files:** `src/components/ui/BrixChart.tsx` (+ barrel export in
`src/components/ui/index.ts`), pure scale helpers in `src/lib/harvest/chart.ts`,
`test/harvest-chart.test.ts`.
**Approach:** Props: `series: {blockId, label, color, points:{date:number,brix:number}[]}[]`,
plus optional `pickMarkers:{blockId,date:number,brix:number|null}[]`. Pure helpers
in `chart.ts`: domain from min/max date + Brix (pad Brix axis, e.g. 0/round-up),
`scaleX`/`scaleY` into a viewBox. Render `<svg viewBox>` responsive (width 100%),
hairline grid via `--border-subtle`, axis ticks/labels in `--text-caption`/
`--text-muted`, each series as `<polyline>` + `<circle>` dots in its block color
(`effectiveColor`), pick markers as a distinct glyph (e.g. hollow square). Tooltip
on hover (date + Brix + block) using a simple absolutely-positioned div or
`<title>` for v1. No hardcoded colors/sizes — all tokens. Legend = block label +
color swatch (reuse the `VarietyChip`/legend pattern).
**Tests:** Scale math (point maps to expected x/y given a domain; empty series safe;
single-point series doesn't divide-by-zero).
**Depends on:** none (consumes the shape Unit 2 produces)
**Verification:** Renders in `/styleguide` or the dashboard with sample data;
visually matches tokens; no console warnings.

### Unit 5: HarvestDashboard admin view (replaces HarvestYieldsView body) + copy fix

**Goal:** The admin "Admin view" becomes the per-vineyard dashboard.
**Files:** rename/rework `src/app/(app)/vineyards/harvest/admin/HarvestYieldsView.tsx`
→ `HarvestDashboard.tsx` (update `HarvestRouter.tsx` import),
`src/app/(app)/vineyards/harvest/HarvestRouter.tsx`.
**Approach:** Keep the vineyard `<select>` + client-selection `useEffect`, but call
`getVineyardHarvestDashboard`. New header copy (e.g. eyebrow "Admin · Harvest",
H1 "Harvest dashboard", intro: "Live ripening and harvest status by block —
Brix readings over time, yield estimates, and picks for the selected vineyard.").
Add a kg/lb `UnitToggle` (lift the small component from the manager view or share
it). Layout: `<BrixChart>` up top (series built with `effectiveColor` per block),
then a per-block grid of `Card`s — each with a colored `VarietyChip`, a `Metric`
for current Brix, estimate vs picked-total (via `formatWeightFromKg`/`fromKg` in the
active unit), remaining-vs-estimate, and a picks list (date · weight · "@ N °Bx").
Keep the historic yields table from the old component as a lower "Past vintages"
section (reuse its `VintageTable`, fed by the dashboard's groups or a kept call).
Empty states for no blocks / no readings / no picks.
**Tests:** None (view). Covered by manual + the pure helpers above.
**Depends on:** Unit 2, Unit 4
**Verification:** `/vineyards/harvest?view=admin`, pick Bajo → chart shows block
lines with dots; Block 1 shows current Brix, estimate, and a pick with its Brix;
toggle flips weights kg↔lb; old copy gone.

### Unit 6: Polish, tokens audit, regression check

**Goal:** Ship-quality: tokens-only, no regressions, lints clean.
**Files:** touched files from Units 2-5.
**Approach:** Grep the new/changed files for hardcoded hex/px that should be tokens
(allow chart geometry numbers in viewBox space). Verify manager view + harvest
manager flows still work (kg default intact). Run lint + type-check + tests.
**Tests:** Full `npm test`.
**Depends on:** Unit 5
**Verification:** `npm run lint`, `npx tsc --noEmit`, `npm test` all green; manual
pass of both admin and manager harvest views.

## Test Strategy

**Unit tests (Vitest, `test/`):**
- `deriveBrixAtPick`: explicit value wins; nearest-by-date chosen; tie-break is
  deterministic; empty series → null.
- Brix series grouping: readings split per block, ordered by date.
- Chart scale math: known domain → expected coords; single-point and empty inputs
  don't throw / divide-by-zero.

**Integration:** None automated (no e2e harness); covered by manual.

**Manual verification:**
1. `/vineyards/harvest?view=manager&vineyard=<Bajo>` → log a Brix reading and a pick
   (with and without Brix-at-pick). Confirm kg default.
2. `/vineyards/harvest?view=admin` → select Bajo. Chart shows a line per block with
   a dot per reading. Block 1 panel: current Brix, estimate, pick list with "@ Brix".
3. Toggle kg/lb → all weights reconvert; storage unchanged.
4. Switch vineyards → data reloads for the new vineyard.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SVG chart edge cases (1 reading, no readings, same-day cluster) | MED | MED | Pure scale helpers with tests for degenerate domains; render guards/empty states. |
| Migration on a shared Neon DB | LOW | MED | Nullable column only; additive, no backfill; `migrate dev` then commit migration. |
| Derived Brix-at-pick misleading when no nearby reading | MED | LOW | Show "—" when null; never fabricate. Explicit capture is the accurate path. |
| Hardcoded values creeping into the new chart (DESIGN.md) | MED | LOW | Unit 6 token audit; viewBox-space geometry is allowed, visual styling must be tokens. |
| Scope creep (export, multi-season, tooltips) | MED | LOW | Explicitly out of scope; `<title>`/simple tooltip for v1. |

## Success Criteria

- [ ] Admin picks a vineyard and sees a Brix-over-time chart, one line per block,
      a dot per reading, dots connected.
- [ ] Each block shows current Brix, yield estimate, and picks (weight + date +
      Brix harvested at), supporting multiple picks.
- [ ] kg/lb toggle works and defaults to kg; storage stays canonical kg.
- [ ] Manager pick form can optionally record Brix-at-pick; it persists + audits.
- [ ] Incorrect "Yields by vintage … Weights shown in metric" copy is replaced.
- [ ] No hardcoded colors/fonts/spacing in new UI (DESIGN.md tokens only).
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` all pass; no regressions.
