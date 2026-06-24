---
title: Vineyard Details, Blocks & Interactive Satellite Map
type: feat
status: draft
date: 2026-06-24
branch: feat/vineyard-details-blocks
depth: deep
units: 12
---

## Overview

Turn a vineyard from a bare name in the Varieties & Vineyards registry into a real,
mapped place. Click a vineyard and a modal summarizes it: total planted acres,
varieties broken down by acres, a satellite map of the site with color-coded block
polygons, soil type, elevation, and vineyard manager. A "Setup" button opens an
editor for per-vineyard metadata and a list of **blocks** (block #, # of rows, row
spacing, vine spacing, variety, clone, rootstock, vine count, year planted,
irrigation). Acres per block are **calculated, never typed**. Units default to
imperial (feet/acres) and toggle to metric (meters/hectares).

On the satellite map the user can **draw block polygons with snapping**, save them,
and associate each with a block. Polygons are **color-coded by variety**, with the
color owned by the variety so it's consistent everywhere (all Pinot Noir is the same
purple, in every vineyard). Clicking a polygon shows that block's details. The map
auto-zooms to fit the whole vineyard.

This gives the winery a single, visual source of truth for what is planted where,
wired into the varieties used across vessels and bottling.

## Problem Frame

Today a "Vineyard" is just `{ id, name, isActive }` (`prisma/schema.prisma:146`). The
app knows vineyard names but nothing physical about them. The user wants to record
blocks, plantings, location, soil, elevation, manager, and an actual drawn map of the
site, with planted acreage computed from spacing + vine counts. Doing nothing leaves
this in disconnected spreadsheets and paper maps. Planted acreage, variety mix, and a
block map are the backbone of a vineyard operation.

Product note: blocks reference the existing managed `Variety` list (confirmed) so
"varieties by acres" and polygon coloring tie to the canonical registry and avoid
name drift, consistent with the recent CSV category-drift work.

## Requirements

- MUST: Clicking a vineyard in the Vineyards list opens a **summary** modal.
- MUST: Summary shows total planted acres, per-variety acreage breakdown, a satellite
  map with color-coded block polygons + legend, soil type, elevation, manager.
- MUST: A "Setup" button switches to an **editor** for vineyard metadata (GPS lat/lng,
  elevation, soil type, vineyard manager) and blocks.
- MUST: "Add block" appends an editable block row with: block #, **# of rows**, row
  spacing, vine spacing, variety (dropdown from Variety registry), clone, rootstock,
  # of vines, year planted, irrigation (yes/no).
- MUST: Acres/hectares per block are computed, not entered:
  `area = rowSpacing * vineSpacing * vineCount`; acres = area_ft2 / 43,560;
  hectares = area_m2 / 10,000. This is **labeled "Planted area (spacing-based)"** in the
  UI — it is the standard grower spacing estimate, NOT surveyed acreage, and the drawn
  polygon is illustrative (not the area source). `# of rows` is informational (drives an
  optional "vines/row" readout), not the acreage math.
- MUST: Units default to imperial (feet + acres); a live toggle switches the whole
  editor + summary to metric (meters + hectares) and back.
- MUST: Every field is **optional**; nothing is required to save.
- MUST: Block rows are editable and deletable; delete uses a confirmation step.
- MUST: Free satellite imagery, no API key (Leaflet + Esri World Imagery).
- MUST: On the map the user can **draw a polygon per block** (via a per-block "Draw /
  edit shape" button), with **vertex + edge snapping** for clean shapes, then save it.
- MUST: Drawn polygons persist (GeoJSON) and associate with their block.
- MUST: Polygons are **color-coded by variety**, color owned by the `Variety` row so it
  is consistent across all vineyards; a deterministic default color is auto-assigned
  per variety until the user picks one; a block may override its own polygon color.
- MUST: Clicking a polygon shows that block's details (variety, acres, clone, etc.).
- MUST: Map auto-zooms to fit all of a vineyard's polygons (fit-bounds); falls back to
  centering on the GPS pin when there are no polygons.
- MUST: All mutations write an audit log entry, matching existing reference actions.
- SHOULD: Graceful empty states (no coords -> no map / prompt; no blocks -> "No blocks yet").
- SHOULD: Reuse existing `Modal`, `ConfirmButton`, `Input`, `Button`, `Card`, `Badge`.
- NICE: "Open in Google Maps" link-out as a fallback to the embedded map.
- NICE: derived "vines per row" shown when both # of rows and # of vines are present.

## Scope Boundaries

**In scope:**
- New Prisma models `VineyardDetail` (1:1 with `Vineyard`) and `VineyardBlock` (many),
  with polygon geometry + per-block color override.
- A `color` field added to `Variety` (canonical per-variety map color).
- Summary + setup modal wired into the existing Vineyards list.
- Server actions: upsert detail, block CRUD, save polygon, set variety color.
- Pure unit-conversion + acreage helpers and a deterministic color helper, unit-tested.
- Leaflet satellite map: read-only colored polygons + interactive draw/edit/snap via
  Leaflet-Geoman, fit-bounds, click-for-details popups.

**Out of scope:**
- Adding details/blocks to varieties beyond the new `color` field.
- Migrating existing `VesselComponent`/`BottlingSource` to reference blocks.
- Multi-polygon / hole geometries, GPS import (KML/shapefile), area-from-polygon
  (acres still come from spacing × vines, not from the drawn shape).
- Offline tiles, custom basemap hosting.
- Mobile-specific layout beyond the modal already being responsive.

## Design Specifications (from /plan-design-review)

Calibrated against the existing token system (no DESIGN.md): Inter / Inter Tight,
`--wine-primary`/`--cream`/`--paper-100`/`--sand`/`--ink-*` colors, spacing/typography
token files, and the responsive shell in `globals.css` (mobile bar / desktop sidebar at
768px; `.app-main table` scrolls horizontally on mobile).

**Summary modal — information hierarchy (top → bottom):**
1. Stat line: vineyard name + **total planted area (spacing-based)** + block count.
2. Satellite map with color-coded, **labeled** polygons + `MapLegend`.
3. Per-variety acreage breakdown (variety name, color swatch, acres/ha, % of planted).
4. Block list (compact rows).
5. Secondary metadata: vineyard manager, soil type, elevation, coords.

**Block editor — compact row + expand-to-edit (chosen):** the table shows only key
columns (block #, variety, # vines, computed planted area, color swatch, "Draw"); a row
expands to an inline edit panel laying out ALL fields in a comfortable **2-column form**
(block #, # rows, row spacing, vine spacing, variety, clone, rootstock, # vines, year
planted, irrigation, color override). Collapses to a single column under 768px. This
replaces the cramped 10-column inline row.

**Interaction states:**

| Surface | Loading | Empty | Error | Success/Active |
|---------|---------|-------|-------|----------------|
| Modal open (lazy `loadVineyardDetail`) | skeleton rows + map placeholder | — | inline error + retry | content renders |
| Map | tiles loading (Leaflet default) | no coords → "Add a location in Setup"; coords but no polygons → centered pin | tile fail → Google link-out | fit-bounds to polygons |
| Block list | — | "No blocks yet" + Add block CTA | — | rows render |
| Draw mode | — | — | invalid polygon → toast/inline error | persistent banner "Drawing block N — click to add points, double-click to finish, Esc to cancel" + crosshair cursor |
| Save (any mutation) | `useTransition` pending (disabled control) | — | local error string (like `RefList`) | optimistic re-render |

**Accessibility:**
- Variety is NEVER conveyed by color alone: every polygon carries a permanent text
  label (block # / variety), the legend lists variety **names**, and the breakdown is
  text. Colorblind-safe by construction.
- Touch targets ≥44px for row expand, Add block, Draw, color swatch, delete.
- Leaflet/Geoman drawing is pointer-driven (keyboard drawing is a known limitation →
  TODO for manual lat/lng vertex entry as the accessible fallback).
- Restyle Leaflet controls, popups, and the Geoman toolbar to the token palette + Inter
  so the map doesn't ship default-blue/system-font chrome that clashes with wine/cream.

**Responsive:** under 768px the vineyard modal goes full-width/height; map sits above a
single-column block list (expanded editor is one column); legend wraps. Reuse the
existing mobile patterns rather than inventing new ones.

**Variety color palette (DESIGN.md-aligned):** DESIGN.md mandates one wine accent with
secondary hues used ONLY as category signals, and defines an **editorial set** of 8
category hues in `colors.css`: maroon `#6B484D`, deep-green `#175242`, deep-blue
`#095972`, golden-yellow `#D79F32`, lavender `#A98EB1`, red `#B63D35`, orange `#F19E70`,
bright-mauve `#C06F74`. The variety palette (Unit 3) is **built from these 8 tokens**
(with derived tints/shades for >8 varieties), NOT a new invented palette. This keeps the
map on-brand and resolves DESIGN.md drift item #3 (varieties give `--lavender`/`--orange`/
`--bright-mauve` a real domain use). Legend is a labeled list, not decorative colored
circles (avoids AI-slop look). Note: avoid `Badge tone="gold"` (known drift — renders
wine, not gold).

**Other DESIGN.md alignments:** sentence-case labels ("Set up", "Add block", "Draw /
edit shape"); warm low shadows only (`rgba(43,42,38,*)`, NEVER Leaflet's default
blue-gray); controls + map container at `--radius-md` (10px); wine focus ring
(`--shadow-focus`) on map controls; reference `/styleguide` for live component/token
truth. Per CLAUDE.md, read DESIGN.md before any visual decision; reference tokens, never
hardcode color/font/spacing.

## Research Summary

### Codebase Patterns
- **Reference page**: `src/app/(app)/reference/page.tsx` (server) renders
  `ReferenceClient.tsx`. The Vineyards list is `RefList kind="vineyard"`
  (`ReferenceClient.tsx:95`); rows render name + Deactivate (`:51-74`) — where the
  clickable "Details" affordance and the variety color swatch hook in.
- **Modal**: custom `src/components/ui/Modal.tsx` (`open`/`onClose`/`title`/`subtitle`/
  `children`/`maxWidth`). Open state is local `useState` (see `VesselsClient.tsx`).
- **Server actions**: `src/lib/reference/actions.ts` is the template — `action()`
  wrapper (`src/lib/actions.ts`) injects `{ actor }`, runs in `prisma.$transaction`,
  writes audit via `writeAudit`/`summarize`/`diff` (`src/lib/audit.ts`), then
  `revalidatePath("/reference")`. `ActionError` is the user-facing error. In-use guard:
  `referenceCount()` at `actions.ts:36`.
- **Editable rows + add-row**: inline-edit/draft pattern in
  `src/app/(app)/inventory/InventoryClient.tsx:53-79,212-262`; add-row form in
  `ReferenceClient.tsx:29-45`.
- **Delete confirmation**: `src/components/ui/ConfirmButton.tsx` (two-step, auto-disarm).
- **Styling**: inline styles with CSS custom properties (`--space-*`, `--text-*`,
  `--danger`, `--radius-*`, fonts). No Tailwind utility classes.
- **Tests**: Vitest, node env, `test/**/*.test.ts`, pure-function focus
  (`test/audit.test.ts`, `test/inventory-csv.test.ts`). No component/action tests.
- **Design system**: `DESIGN.md` (source of truth, added 2026-06-24) + tokens in
  `src/styles/tokens/*.css`; live preview at the `/styleguide` route. CLAUDE.md requires
  reading DESIGN.md before any visual change and referencing tokens (no hardcoded
  color/font/spacing). Warm editorial: cream/ink neutrals, one wine accent, 8 editorial
  category hues, warm low shadows, Inter/Inter Tight, light-only (no dark mode).

### Prior Learnings
No relevant prior learnings found (store empty). Adjacent: CSV category-drift work
(`aae9b41`, `c7f4e92`) established preference for canonical managed values over free
text — reinforces variety-owned color + variety dropdown on blocks.

### External Research
- **DECISION (eng review): use vanilla Leaflet 1.9.x, NOT react-leaflet.** Verified at
  review time: react-leaflet v5 (the only version supporting React 19) declares a peer
  dependency of `leaflet ^2.0.0-alpha`, while `@geoman-io/leaflet-geoman-free` targets
  stable Leaflet 1.9. That three-way conflict (React 19 ↔ react-leaflet v5 ↔ Leaflet
  2.0-alpha ↔ Geoman 1.x) is avoided entirely by skipping the React wrapper. Our map is
  mostly imperative anyway (init, draw, snap, fit-bounds, recolor), which react-leaflet
  would only hide.
- **Leaflet 1.9 in Next 16 / React 19**: mount in a single client component via
  `useEffect` + a container `ref`; call `L.map(el)` on mount and `map.remove()` on
  cleanup. Load the whole component with `next/dynamic({ ssr: false })` (Leaflet touches
  `window`). Import `leaflet/dist/leaflet.css`. Default marker icon assets need explicit
  `L.Icon.Default` URLs or a `divIcon` (known bundler gotcha). Guard against React
  StrictMode double-invoke of effects (init-once via ref; full teardown in cleanup).
- **Drawing + snapping**: `@geoman-io/leaflet-geoman-free` (Leaflet-Geoman, MIT) on
  Leaflet 1.9. Built-in global snapping (`map.pm.setGlobalOptions({ snappable: true,
  snapDistance: 20 })`), vertex/edge snapping, drawing, editing, dragging, removal.
  `map.pm.enableDraw('Polygon', {...})`; read geometry on `pm:create` via
  `layer.toGeoJSON().geometry`; restore existing polygons with `L.geoJSON`. Import
  `@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css`. Sync React block state →
  Leaflet layers inside `useEffect`.
- **Free satellite tiles**: Esri World Imagery —
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`
  — no key, free with attribution ("Esri, Maxar, Earthstar Geographics").
- Per AGENTS.md, check `node_modules/next/dist/docs/` for Next 16 dynamic-import specifics before wiring.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Satellite map | **Vanilla Leaflet 1.9** + Esri World Imagery (no react-leaflet) | react-leaflet v5; keyless Google embed; Maps JS API; link-out | react-leaflet v5 needs Leaflet 2.0-alpha (conflicts with Geoman 1.x); free, no key, stable, imperative needs anyway (eng-review decision) |
| Drawing + snapping | Leaflet-Geoman (`-free`) on Leaflet 1.9, attached via `useEffect`+ref | leaflet-draw; react wrappers | Built-in snapping/editing; vanilla avoids the React-19 wrapper/alpha-Leaflet conflict |
| Polygon storage | GeoJSON geometry in `VineyardBlock.polygon Json?` | PostGIS geometry column | No PostGIS on Neon by default; GeoJSON is enough for draw/render/fit-bounds |
| Block variety | Nullable FK to `Variety` (dropdown) | Free text | Ties acreage + color to canonical registry (user confirmed) |
| Variety color | `Variety.color String?`; block override `VineyardBlock.color`; deterministic default | Per-polygon-only color | Consistency across all vineyards; one place to set "Pinot = purple" (user confirmed) |
| Polygon→block link | Draw-per-block button enters draw mode for that block | Free-draw then assign | Unambiguous association, no mis-assignment (user confirmed) |
| Default zoom | Auto fit-bounds of polygons; fallback center on pin | Stored zoom level | "Show the whole vineyard" without manual tuning |
| Unit storage | Canonical metric in DB; convert for display | Store-as-entered + flag | Single source of truth; consistent totals (user confirmed) |
| Detail ↔ Vineyard | Separate `VineyardDetail` 1:1, created lazily | Columns on `Vineyard` | Keeps lean registry clean; details are sparse/optional |
| Acreage | Derived in a pure helper, never stored | Persist computed acres | No stale values when spacing/vines edited |

## Delivery Phases (3 PRs)

Ship incrementally to keep blast radius small and land value early. Units are ordered to
support this:

- **PR1 — Data + blocks + summary (no map):** Units 1, 2, 3, 4, 5, 8, 10 (legend without
  map), 9 (block table + metadata, draw buttons disabled), 11 (summary without map).
  Delivers blocks, spacing-based acreage, variety colors, per-variety breakdown.
  **STATUS: built on branch `feat/vineyard-details-blocks` (2026-06-24).** Migration
  `20260624084219_add_vineyard_detail_blocks_variety_color` committed + applied. 32 new
  unit tests pass; `npm run lint` (new files clean), `npm test`, and `npm run build` all
  green. Loader `loadVineyardDetail` lives in `src/lib/vineyard/actions.ts` (a "use
  server" module), NOT `data.ts` — a client component importing a loader from a module
  with server-only deps breaks the build. Awaiting review before PR.
- **PR2 — Read-only map:** Unit 6 (vanilla Leaflet + Esri, colored polygons, fit-bounds,
  popups) wired into the summary + legend on the map.
- **PR3 — Interactive drawing:** Unit 7 (Geoman draw/edit/snap, commit-on-end, per-block
  draw buttons enabled). The highest-UX-risk piece, isolated so the rest is already live.

## Implementation Units

### Unit 1: Prisma models + Variety.color

**Goal:** Persist vineyard detail, blocks (incl. # of rows + polygon + color), and a
canonical per-variety color.
**Files:** `prisma/schema.prisma`
**Approach:** Add `VineyardDetail` (1:1 with `Vineyard`, `vineyardId @unique`,
`onDelete: Cascade`): `gpsLat Decimal? @db.Decimal(9,6)`, `gpsLng Decimal? @db.Decimal(9,6)`,
`elevationM Decimal? @db.Decimal(8,2)`, `soilType String?`, `manager String?`,
`defaultUnit String @default("imperial")`, timestamps. Add `VineyardBlock`
(FK ->Vineyard Cascade): `blockLabel String?`, `numRows Int?`,
`rowSpacingM Decimal? @db.Decimal(10,4)`, `vineSpacingM Decimal? @db.Decimal(10,4)`,
`varietyId String?` (FK ->Variety `onDelete: SetNull`), `clone String?`,
`rootstock String?`, `vineCount Int?`, `yearPlanted Int?`, `irrigated Boolean?`,
`polygon Json?`, `color String?`, `sortOrder Int @default(0)`, timestamps, index on
`vineyardId`. Add `color String?` to `Variety`. Add back-relations: `Vineyard.detail`,
`Vineyard.blocks`, `Variety.vineyardBlocks`. snake_case `@@map` names. All
spacing/elevation stored metric.
**Tests:** none (schema).
**Depends on:** none
**Verification:** `npm run db:migrate` (prisma migrate dev — **not** `db:push`; the
deploy pipeline is `prisma migrate deploy`, so a committed migration file under
`prisma/migrations/` is required) creates the migration cleanly; `npm run db:generate`
regenerates the client exposing `vineyardDetail`, `vineyardBlock`, and `variety.color`.

### Unit 2: Unit-conversion + acreage helpers (pure, tested)

**Goal:** Single source of truth for unit conversion + acre/hectare math.
**Files:** `src/lib/vineyard/units.ts`, `test/vineyard-units.test.ts`
**Approach:** Pure, no Prisma. `ftToM`/`mToFt`, `acresToHa`/`haToAcres`;
`blockAreaSqM(rowSpacingM, vineSpacingM, vineCount)`; `blockAcres(...)` /
`blockHectares(...)`; `formatSpacing`/`formatArea` for display;
`toCanonicalSpacing(value, unit)` / `fromCanonicalSpacing(valueM, unit)`. Constants
`SQ_FT_PER_ACRE=43560`, `SQ_M_PER_HECTARE=10000`, `FT_PER_M=3.280839895`. Return
`null` for missing inputs; guard NaN/non-positive. Optional `vinesPerRow(vineCount, numRows)`.
**Tests:** 7ft × 5ft × 1245 vines ≈ 1.00 acre (within tolerance, document rounding);
metric 2m × 1.5m × 1245 = 0.3735 ha; ft↔m round-trip within tolerance; null/zero/neg
-> null; acres↔hectares.
**Depends on:** none
**Verification:** `npx vitest run test/vineyard-units.test.ts` green.

### Unit 3: Variety color helper (pure, tested)

**Goal:** Resolve a consistent color for any variety, with deterministic defaults.
**Files:** `src/lib/vineyard/colors.ts`, `test/vineyard-colors.test.ts`
**Approach:** The palette is the **8 editorial category tokens from `colors.css`**
(maroon, deep-green, deep-blue, golden-yellow, lavender, red, orange, bright-mauve) per
DESIGN.md, with deterministic derived tints/shades when a vineyard has >8 varieties — NOT
a new invented palette. `defaultColorFor
(varietyId)` hashes the **stable variety id** (NOT the name) to a palette index, so
renaming a variety never shifts its color (outside-voice fix). `effectiveColor({
blockColor, varietyColor, varietyId })` = `blockColor ?? varietyColor ??
defaultColorFor(varietyId)`. `isValidHex(s)` validator (used server-side too). Export
the palette for the picker.
**Tests:** same id -> same default across calls; explicit block/variety colors win in
the right order; rename (same id) keeps color; `isValidHex` accepts `#rrggbb`, rejects
junk; output is a valid hex string.
**Depends on:** none
**Verification:** `npx vitest run test/vineyard-colors.test.ts` green.

### Unit 4: Data loader + pure serializer

**Goal:** One server round-trip for everything the modal needs, with a tested serializer.
**Files:** `src/lib/vineyard/data.ts`, `test/vineyard-data.test.ts`
**Approach:** `loadVineyardDetail(vineyardId)` returns `{ detail|null, blocks }` where
blocks include `variety { id, name, color }`, ordered by `sortOrder`. Extract a **pure**
`serializeBlock(row)` (and `serializeDetail`) that converts every Prisma `Decimal` to a
`number` and passes polygon Json through as-is — used by the loader so no `Decimal` ever
crosses the client boundary, and unit-testable without a DB. Add active varieties
(`id, name, color`) to `reference/page.tsx`'s `Promise.all` for the dropdown + legend.
Expose loader as a server action callable on modal open (lazy load per vineyard).
**Tests:** `test/vineyard-data.test.ts` — `serializeBlock` maps Decimal→number for
spacing/elevation, leaves GeoJSON geometry intact, handles nulls; precision preserved.
**Depends on:** Unit 1
**Verification:** `npx vitest run test/vineyard-data.test.ts` green; loader returns
serialized `{ detail, blocks }` with numeric spacing and intact polygon geometry.

### Unit 5: Server actions — detail upsert, block CRUD, polygon save, variety color

**Goal:** Persist all edits with audit logging.
**Files:** `src/lib/vineyard/actions.ts`, `src/lib/reference/actions.ts` (add `setVarietyColor`)
**Approach:** Mirror reference-actions. `upsertVineyardDetail(vineyardId, formData)`
(convert elevation→m; create-or-update 1:1). `createBlock` / `updateBlock` /
`deleteBlock`. Extract a shared **`parseBlockForm(formData, unit)`** helper (parse all
fields incl. numRows; convert spacing to canonical meters via Unit 2; everything
optional; validate positives when present) so create and update can't drift apart.
`saveBlockPolygon(blockId, geojson | null)` (store/replace/clear `polygon`).
`setBlockColor(blockId, color | null)`. In `reference/actions.ts`, add
`setVarietyColor(id, color | null)`. **Server-side validation (outside-voice fixes, do
not trust client):** colors must pass `isValidHex` (Unit 3) or be null; `saveBlockPolygon`
must validate the payload is a GeoJSON `Polygon` with a numeric coordinate ring (≥4
positions, lng/lat in range) and reject anything over a size cap (e.g. ~64KB / ~2k
vertices) — `ActionError` otherwise. Each wrapped in `action()` + `$transaction` +
`writeAudit` (`entityType` `"VineyardDetail"`/`"VineyardBlock"`/`"Variety"`,
`diff(before, after)`, `summarize`). Polygon saves write **one** audit row per
committed shape (not per vertex). `revalidatePath("/reference")`.
**Tests:** conversion/validation covered by Units 2-3; actions verified manually
(project has no action harness — do not invent one).
**Depends on:** Units 1, 2, 3
**Verification:** Create/edit/delete block, save a polygon, set a variety color → all
persist with `audit_log` rows.

### Unit 6: Base satellite map component (read-only, vanilla Leaflet)

**Goal:** Render satellite imagery, marker, colored block polygons, fit-bounds, popups.
**Files:** `src/components/ui/SatelliteMap.tsx`, a `dynamic`-import wrapper (e.g.
`SatelliteMap.client.tsx` + the `next/dynamic({ ssr:false })` export), `package.json`
(add `leaflet@^1.9`, `@types/leaflet`). **Leaflet/Geoman CSS imported in the root layout
or `globals.css`** — Next App Router only allows global CSS at the root, not from an
arbitrary component (outside-voice fix).
**Approach:** No react-leaflet. A `"use client"` component holds a container `ref` and a
`mapRef` (the `L.Map`). In `useEffect` (init-once guarded against StrictMode
double-invoke): `L.map(el)`, add Esri `L.tileLayer(url, { attribution })`, add an
`L.marker([lat,lng])` and an `L.featureGroup` for polygons; cleanup `map.remove()`.
**Call `map.invalidateSize()` after the modal opens / mode switches** (Leaflet-in-modal
renders blank/offset otherwise — outside-voice fix); the consumer passes a signal or the
component observes container resize. A second `useEffect` keyed on `blocks`/`unit`
rebuilds the polygon layers: each block's
`polygon` → `L.geoJSON` styled with `effectiveColor` (Unit 3), a **permanent text label
(block # / variety) via tooltip/`divIcon`** so varieties are not color-only
(accessibility), and `bindPopup` showing block details (label, variety, computed
planted-area per `unit`, clone, rootstock, vines, rows, year, irrigation). **Restyle
Leaflet controls + popups to the token palette + Inter** — warm low shadows
(`rgba(43,42,38,*)`, no default blue-gray), `--radius-md`, wine focus ring; see
DESIGN.md / `/styleguide`. Fit
to the feature group's bounds; fall back to
`setView([lat,lng], 16)` when no polygons. Fix default marker icon asset URLs. Render a
placeholder when lat/lng missing. "Open in Google Maps" link-out beneath. The whole
component is loaded via `next/dynamic({ ssr:false })` from its consumers.
**Tests:** none (visual); manual QA.
**Depends on:** Units 2, 3
**Verification:** `npm run dev`: known coords render satellite + pin; existing polygons
draw in variety colors; clicking a polygon shows details; map fits the vineyard; no SSR
`window` error; no double-init under StrictMode; `npm run build` succeeds.

### Unit 7: Interactive drawing/editing (Leaflet-Geoman, per block)

**Goal:** Draw/edit a polygon for a chosen block, with snapping, and persist it.
**Files:** `src/components/ui/SatelliteMap.tsx` (extend the same component with an
editable mode), `package.json` (add `@geoman-io/leaflet-geoman-free`), Geoman CSS import.
**Approach:** Add props `editable?: boolean`, `activeBlockId?: string | null`,
`onPolygonSaved(blockId, geometry | null)`. In a `useEffect` after map init (when
`editable`): `map.pm.setGlobalOptions({ snappable: true, snapDistance: 20 })`. When
`activeBlockId` is set, `map.pm.enableDraw('Polygon', {...})`; on `map.on('pm:create')`
read `e.layer.toGeoJSON().geometry`, call `onPolygonSaved(activeBlockId, geometry)`
(→ Unit 5 `saveBlockPolygon`), remove the temp layer, and `disableDraw()` (the saved
geometry re-renders via Unit 6's polygon effect). Make existing block polygons
`pm`-editable; **persist only on edit COMMIT** (`pm:update` / drag-end), not on every
`pm:edit`/vertex move — one save + one audit row per finished shape, avoiding rapid
writes and races (outside-voice fix). Remove via the block's polygon delete (ConfirmButton
→ `saveBlockPolygon(id, null)`).
Snapping applies to vertices/edges of other blocks' polygons for clean shared
boundaries. All Geoman handlers registered/cleaned up inside the effect.
**Tests:** none (browser); manual QA.
**Depends on:** Units 5, 6
**Verification:** Click "Draw" on a block, draw a polygon snapping to an adjacent
block's edge, it saves and re-renders in the variety color; editing a vertex persists;
toggling editable off (summary view) disables Geoman controls.

### Unit 8: Variety color UI in the Varieties list

**Goal:** Let the user set each variety's canonical map color, applied everywhere.
**Files:** `src/app/(app)/reference/ReferenceClient.tsx`
**Approach:** In `RefList` for `kind="variety"`, add a small color swatch per row
(seeded with `effectiveColor`/default) that opens a color input; on change call
`setVarietyColor` (Unit 5) via the existing `run()`/`useTransition` pattern. Pass
`variety.color` into the rows (extend the page query). Keep Deactivate as-is.
**Tests:** none; manual QA.
**Depends on:** Units 3, 5
**Verification:** Set Pinot Noir to a purple in the Varieties list; every Pinot Noir
polygon in every vineyard renders that purple.

### Unit 9: Setup (editor) modal — detail fields + block table + draw buttons

**Goal:** Enter/edit vineyard metadata and blocks, with live unit toggle and per-block draw.
**Files:** `src/app/(app)/reference/VineyardSetup.tsx`
**Approach:** Client component inside the vineyard modal (mode = "setup"). Top: GPS
lat/lng, elevation, soil type, manager + imperial/metric toggle (default from
`detail.defaultUnit`). Block table using the inline-edit/draft pattern from
`InventoryClient.tsx`, but in the **compact-row + expand-to-edit** form (see Design
Specifications): the collapsed row shows only block #, variety, # vines, computed
planted area, color swatch, and "Draw"; expanding a row reveals a 2-column edit panel
with ALL fields — block #, # of rows, row spacing, vine spacing, variety (`<select>` of
options), clone, rootstock, # vines, year planted, irrigation (yes/no) — plus a
**read-only computed planted-area (spacing-based)** value updating live via Unit 2, the
effective polygon color swatch (with optional block override -> `setBlockColor`), a
"Draw / edit shape" button that sets `activeBlockId` on the shared map (Unit 7) with a
persistent draw-mode banner, and a `ConfirmButton` to clear the polygon. Collapses to one
column under 768px. "Add block" appends a blank row (`createBlock`);
row delete via `ConfirmButton` (`deleteBlock`). Spacing inputs show ft/m per toggle;
computed area shows acres/hectares. `useTransition` + local error like `RefList`. All
fields optional. The imperial/metric toggle state is owned by `VineyardModal` (Unit 11)
and passed in as a prop (shared with the summary view) — never duplicated — so the two
views can't disagree. Toggle re-renders displayed values via conversion, never rewriting stored data.
**Tests:** math covered by Unit 2; UI manual.
**Depends on:** Units 2, 3, 4, 5, 6, 7
**Verification:** Add/edit/delete blocks; 7×5×1245 ≈ 1 acre; toggling units updates
spacing + area consistently; "Draw" enters draw mode and saves to the right block.

### Unit 10: Map legend component

**Goal:** Show which color means which variety.
**Files:** `src/components/ui/MapLegend.tsx`
**Approach:** Given the vineyard's blocks (or all varieties present), render a compact
**labeled** legend (swatch + variety NAME + that variety's acres in the current unit) —
a text list, not decorative colored circles, so it doubles as the colorblind-safe key.
Used in both summary and editor map views. Pure presentational, inline-styled, wraps on
mobile.
**Tests:** none.
**Depends on:** Units 2, 3
**Verification:** Legend lists each planted variety with its color and acreage.

### Unit 11: Vineyard summary modal + wire into Vineyards list

**Goal:** Click a vineyard → summary; "Setup" → editor.
**Files:** `src/app/(app)/reference/ReferenceClient.tsx`, new
`src/app/(app)/reference/VineyardModal.tsx`, `src/app/(app)/reference/page.tsx`
**Approach:** Make each vineyard row open `VineyardModal` (clickable name / "Details";
keep Deactivate). `VineyardModal` holds modes summary | setup and **owns the
imperial/metric toggle state** (passed to both views). Use a **wide modal (`maxWidth`
~960px) with a tall map (~70vh)** so polygon drawing has room (outside-voice fix); call
the map's `invalidateSize()` on open and on summary↔setup switch. **While `loadVineyardDetail` runs, show a
skeleton (placeholder rows + map placeholder), not a blank modal.** Follow the summary
information hierarchy from Design Specifications (stat line → map+legend → breakdown →
block list → secondary metadata); under 768px the modal is full-width/height in a
single-column stack. Summary computes from
blocks: total **planted area (spacing-based)** acres/hectares labeled as such,
per-variety breakdown, `SatelliteMap`
(read-only, Unit 6) + `MapLegend`, soil, elevation, manager. "Setup" button → editor
(Unit 9) sharing one map instance (editable mode). Back/close returns to summary and
refetches via `loadVineyardDetail` (Unit 4). `page.tsx` passes `varietyOptions`
(id, name, color). Empty states: no coords → "Add a location in Setup"; no blocks →
"No blocks yet". Summary respects the unit toggle.
**Tests:** none direct; manual end-to-end.
**Depends on:** Units 4, 6, 9, 10
**Verification:** Click vineyard → summary; "Setup" → editor; save a block + draw a
polygon, return → updated totals, breakdown, and map.

### Unit 12: Docs + dependency note

**Goal:** Keep AGENTS.md / stack notes honest.
**Files:** `AGENTS.md`, `package.json` (touched in Units 6-7)
**Approach:** Note new deps (`leaflet@^1.9`, `@types/leaflet`,
`@geoman-io/leaflet-geoman-free` — **no react-leaflet**) and CSS imports; satellite
imagery uses keyless Esri tiles (no env var); two new tables + `Variety.color`. No new
secrets. Note the new migration under `prisma/migrations/` must be committed.
**Tests:** none.
**Depends on:** Units 6, 7
**Verification:** `npm run lint` + `npm run build` pass; notes accurate.

## Test Strategy

**Unit tests:** `test/vineyard-units.test.ts` (acreage + conversions + round-trip +
null handling), `test/vineyard-colors.test.ts` (deterministic, consistent, precedence),
and `test/vineyard-data.test.ts` (pure `serializeBlock`: Decimal→number, GeoJSON
passthrough, nulls) are the core safety net — the "is the acre right?", "is Pinot always
the same purple?", and "does data survive the server→client boundary?" guarantees.
**Integration tests:** none added (no action/DB harness today; out of scope).
**Manual verification (end-to-end):**
1. `npm run db:migrate` creates + applies the migration for the new tables + `Variety.color` (commit `prisma/migrations/*`).
2. `npm run dev`; click a vineyard → summary modal opens.
3. "Setup"; enter GPS coords → satellite map renders with a pin, fit to view.
4. Add a block: 7 / 5 / Merlot / 1245 vines (imperial) + # of rows → computed ~1.00 acre.
5. Toggle metric → spacing ~2.13m/1.52m, area in hectares, consistent.
6. Click "Draw" on the block, draw a polygon with snapping → saves, renders in Merlot color.
7. Add a 2nd block (different variety), draw its polygon snapped to the first.
8. Set that variety's color in the Varieties list → its polygon recolors everywhere.
9. Click a polygon → block details popup; legend lists varieties + acres.
10. Return to summary → total acres + per-variety breakdown + map correct.
11. Delete a block → confirm → row + polygon removed, totals update.
12. Reload → all persists; `audit_log` has entries. `npm run build` + `npm run lint` clean.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Leaflet/Geoman version conflict (was: react-leaflet v5 ↔ Leaflet 2.0-alpha ↔ Geoman 1.x) | LOW (resolved) | MED | RESOLVED in plan: vanilla Leaflet 1.9 + Geoman free, no react-leaflet |
| Leaflet SSR `window` crash in Next 16 | MED | MED | `next/dynamic({ ssr:false })`; check `node_modules/next/dist/docs/` |
| Map init/teardown in React StrictMode (double effects) | MED | MED | Init-once via `mapRef`; `map.remove()` + handler cleanup in effect return |
| Migration not committed (deploy runs `migrate deploy`) | MED | HIGH | Unit 1 uses `npm run db:migrate`; commit `prisma/migrations/*` |
| Leaflet default marker icons 404 under bundler | MED | LOW | Explicit `L.Icon.Default` URLs or `divIcon` |
| GeoJSON ↔ Prisma `Json` serialization across server boundary | MED | LOW | Store plain geometry object; serialize Decimals to numbers in loader |
| Snapping/precise-draw UX is hard (highest-risk part of feature) | MED | MED | Tune `snapDistance`; vertex edit after draw; commit-on-end; budget QA iteration; map split (U7) lands after value already shipped |
| Unit round-trip rounding (7.00ft) confuses | LOW | LOW | Store canonical; explicit display precision (2 dp spacing, 2 dp area) defined in Unit 2 |
| Esri tiles not contractually production-grade (rate limit/terms/availability) | LOW | MED | Attribution included; Google link-out fallback; revisit a paid/keyed basemap if it becomes load-bearing |
| Drawn polygon area disagrees with spacing-based acreage | MED | LOW | Acreage is explicitly spacing-based, labeled as such; polygon is illustrative, not the area source (documented in UI copy) |
| Scope is Deep (12 units) | MED | MED | Ordered by dependency; map split into read-only (U6) then interactive (U7) so value lands incrementally |

## Success Criteria

- [ ] Clicking a vineyard opens a summary (acres, varieties-by-acres, map+legend, location, soil, elevation, manager)
- [ ] "Setup" opens an editor for detail fields + blocks
- [ ] Blocks include # of rows; add/edit/delete (with confirmation); all fields optional
- [ ] Acres computed (not entered); 7ft×5ft×1245 ≈ 1.00 acre
- [ ] Imperial default; live toggle to metric (m + hectares) and back
- [ ] Free satellite map (Leaflet + Esri) renders at coords with a pin, no API key
- [ ] Per-block polygon drawing with snapping; polygons persist + associate with blocks
- [ ] Polygons color-coded by variety; color owned by Variety so it's consistent everywhere; block override works
- [ ] Clicking a polygon shows block details; map auto-fits the vineyard
- [ ] Block variety picks from the managed Varieties registry
- [ ] Mutations write audit log entries
- [ ] `test/vineyard-units.test.ts` + `test/vineyard-colors.test.ts` + `test/vineyard-data.test.ts` pass; no regressions
- [ ] Schema shipped via committed `prisma/migrations/*` (db:migrate), not db:push
- [ ] `npm run build` and `npm run lint` clean

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found (all addressed) | 19 raised; 7 folded as fixes, 4 surfaced as user decisions, rest resolved |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 6 issues (2 arch, 3 quality, 1 test); 0 critical gaps; 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | score 5/10 → 9/10; 1 decision (compact-row editor); a11y/states/hierarchy fixed |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** Independent challenge caught the db:push/db:migrate contradiction, name-hashed color rename bug, missing `invalidateSize()`, Geoman per-vertex write storm, unvalidated polygon/color payloads, and CSS-import location. All folded into the plan.
- **CROSS-MODEL:** Eng review + Codex agree on incremental delivery (→ 3-PR phasing) and on validating untrusted client input. No unresolved tension.
- **UNRESOLVED:** 0.
- **VERDICT:** ENG + DESIGN CLEARED (with Codex outside voice). Ready to implement. CEO review optional (not needed — scope already driven by user).

## Approved Mockups

None — the rstack designer binary was not available, so this was a text-only design review. Visual mockups can be generated later with `$D` if desired.
