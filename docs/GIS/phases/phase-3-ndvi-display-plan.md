---
title: P3 — NDVI display and comparison (Vineyard Intelligence, brief Release 1B viz half)
type: feat
status: draft
date: 2026-07-25
branch: feat/vi-p3-ndvi-display
depth: deep
units: 11
---

> **PROVENANCE NOTE (2026-07-25):** The original P3 plan + `phase-3-council-feedback.md` were
> written and council-hardened on 2026-07-25 but **were never persisted to disk** (data loss —
> discovered at `/work` time). This file is a **faithful reconstruction** from the project-memory
> record (the seven applied council fixes + Russell's Q1–Q4 resolutions), the runbook §P3 scope,
> and a fresh, quote-backed map of the actual P2 shipped code. Where the reconstruction states a
> "council fix," that fix is recovered from memory, not from the lost verbatim council transcript.

## Overview

The **viz half** of brief Release 1B. P2 shipped the data half: for a vineyard "around a date" we
fetch one estate-wide Sentinel-2 scene, compute masked NDVI once, and persist the raster (Vercel
Blob) + per-block stats (`BlockSpatialMetric`) with full radiometric provenance. P3 **renders** that
stored data as a map: an NDVI overlay on the satellite basemap, six color-scale modes, palettes +
legend + value histogram, raw/bilinear/nearest display, locked-domain date comparison (side-by-side +
diff), saveable styles, a steep-terrain advisory, and a per-block stats panel — plus a `compare_ndvi_dates`
assistant read tool.

**The pure render math already exists and is unit-tested — do NOT rebuild it.** `color.ts` (six
`ColorScaleMode`, `percentileDomain`/`fixedDomain`/`lockedDomain`, three palettes incl. viridis
color-vision-safe, `reversePalette`, `legendStops`, `buildPaletteLut`), `render.ts` (`rasterToRgba`
LUT + coverage-alpha + no-data, `leafletBounds`), `smooth.ts` (`resampleNearest`/`resampleBilinear`,
`focalMedian3x3`), `overlay.ts` (the `MapOverlay` `kind:"raster"` arm, defined with a "wired in P3"
marker). P3 is **browser-wiring + raster read-back + a warp step + schema + histogram + a serving
route + domain-mode glue**, NOT new render math.

## Problem Frame

The vineyard manager can already queue an NDVI look and read a per-block table (`/vineyards/ndvi`,
P2's thin console). What they cannot do is **see** it — the within-vineyard vigor pattern that the
whole program exists to reveal. P3 turns the stored raster into the map.

**The one trap that is invisible to eyeballing it:** the stored raster is on a **UTM (metric) grid**;
the Leaflet basemap is **EPSG:3857 web-mercator**. Painting a UTM raster as a flat `L.imageOverlay`
over a WGS84 bbox is **misregistered**. Mercator scale curvature is negligible at ~50 ha, but the
**UTM-grid-vs-true-north convergence/rotation term is ~10 m ≈ one Sentinel pixel** — enough to walk
the raster off block boundaries. A gorgeous NDVI map that is 10 m wrong looks perfect and lies. Only a
**registration test to sub-pixel residual** catches it; histogram/palette/orientation goldens all pass
while the raster is misplaced. This is the load-bearing correctness requirement of P3.

## Scope Boundaries

**In:** raster read-back from blob; warp UTM→3857 display grid; `SpatialDatasetDerivative` (cached
display raster) + `SpatialStyle` (saved palettes/domains); domain-mode dispatch + min-spread clamp;
NDVI value histogram; serving route (rendered PNG + ETag); `SatelliteMap` raster arm; NDVI display UI
(scale modes w/ progressive disclosure, palette, legend, source-res + raw/smooth badges, steep-terrain
advisory); locked-domain date comparison (side-by-side + diff); saved styles (system + one-off URL +
vineyard); `compare_ndvi_dates` assistant tool + goldens; registration + color/palette goldens; a
`verify:ndvi-display` e2e proof.

**Out (deferred, reserved):** analytical 3×3 smoothing as a stored derivative (`SMOOTHED_NDVI` kind is
reserved; P3 ships appearance-only resampling only); tenant-scoped styles (SYSTEM + VINEYARD only);
DEM/solar terrain correction (advisory flag + `acquiredAt` badge only — P2 stored no solar angles);
tile pyramids / COG / GDAL worker (ADR 0009 stands); CSV/provenance export UI polish beyond recording
the scale mode; field-note follow-up wiring (existing flow, thin).

## Research Summary — P2 shipped-state (verified this session, quote-backed)

### Already built (reuse verbatim)
- `src/lib/gis/color.ts` — `ColorScaleMode = VINEYARD_SCENE|BLOCK_SCENE|COMPARISON_LOCKED|VINEYARD_BASELINE|ABSOLUTE|CUSTOM`; `percentileDomain(samples,{low,high,mode})` (p5–p95 default, coverage-weighted); `fixedDomain`; `lockedDomain(domains[])`; `VIGOR_CLASSIC`/`PURPLE_GREEN`/`COLOR_VISION_SAFE`(viridis) + `PALETTES`; `reversePalette`; `normalize`; `colorAt`; `legendStops`; `buildPaletteLut`. **No `resolveDomain`/mode-dispatch exists — P3 authors it.**
- `src/lib/gis/render.ts` — `rasterToRgba(values,w,h,domain,palette,{coverage,opacity,lut})→{width,height,data:Uint8ClampedArray}`; `paintablePixelCount`; `leafletBounds([minLon,minLat,maxLon,maxLat])→[[minLat,minLon],[maxLat,maxLon]]`.
- `src/lib/gis/smooth.ts` — `Grid={width,height,values:Float64Array}`; `resampleNearest`/`resampleBilinear` (no-data contagious); `focalMedian3x3` (default minValidFraction 5/9).
- `src/lib/gis/overlay.ts` — `MapOverlay` raster arm: `{kind:"raster";id;tileUrl?;imageUrl?;bounds:[minLon,minLat,maxLon,maxLat];opacity;resampling;legend?}`.
- `src/lib/gis/satellite/decode.ts` — `decodeNdviScene(bytes)→DecodedNdviScene{red,nir,scl,width,height,originX,originY,pixelSizeM,axisYSign,crsEpsg,bbox}` (inline, no worker). Guards: `MAX_SCENE_PIXELS=4_000_000`.
- `src/lib/gis/ndvi.ts` — `computeNdvi(red,nir,scl,w,h,opts)→NdviRaster{width,height,values:Float64Array,validCount,...}`; `NO_DATA=NaN`; `isNoData`.
- `src/lib/gis/projection.ts` — `Projector` is **RECENTRED** (origin subtracted in `forward`, re-added in `inverse`) → feeding raw absolute UTM E/N to `inverse` is wrong. `utmBboxFor`/`utmEpsg` are the proj4 EPSG helpers. proj4 is the runtime dep.
- `src/lib/spatial/block-metrics-core.ts` — stores `min,p10,p25,median,mean,p75,p90,max,stdDev` + coverage counts + `qualityFlags`. **Percentiles are p10/p25/p75/p90, NOT p5/p95; no histogram.** Y-flip: `rasterRowFor(gridRow)=axisYSign===-1 ? H-1-gridRow : gridRow`.
- `prisma/schema.prisma` — `SpatialDataset` (schema.prisma:677) carries blob refs (`blobUrl/blobKey/blobSha256/byteSize`) + typed geotransform (`crsEpsg,originX,originY,pixelSizeM,gridWidth,gridHeight,axisYSign`) + radiometric provenance. Enums: `SpatialDatasetKind{RASTER}` (reserved for the derivative story), `SpatialMetric{NDVI}`. `Vineyard.ndviAutoAdd`.
- `src/app/(app)/vineyards/ndvi/{page.tsx,NdviConsole.tsx}` — the thin data console (vineyard chips, queue/sweep, per-block table, jobs list). **No map/legend/scale UI** — P3's shell.
- `src/components/ui/SatelliteMap.tsx` — `overlays?:MapOverlay[]` prop; the overlay `useEffect` at ~L535 paints only `kind:"vector"` and `continue`s on raster (~L545). **That `continue` is the raster insertion point; `L.imageOverlay` is not yet used.**

### Absent (P3 builds)
1. Raster **read-back** — `raster-store.ts` is write-only (`putPrivateRaster` only); no getter/decode-from-blob.
2. `SpatialStyle` model, `SpatialDatasetDerivative` model — neither exists.
3. `warp.ts` — does not exist.
4. NDVI value **histogram** — no export, no field.
5. **Serving route** — nothing under `src/app/api` serves raster/dataset/PNG (only the cron poll route).
6. `resolveDomain` **mode-dispatch** + min-spread clamp — unbuilt.

### Prior learnings (do not re-derive)
- Scripts need `tsx --conditions=react-server`. `next dev` regenerates a STALE prisma client — stop the dev server before `db:generate`. Local `.env` **is production**; all test data → **Demo Winery** (`org_demo_winery`), never Bhutan. Build/verify/dev-server run from the **MAIN checkout** (worktrees lack `.env`). Console all-access gate = `isTenantAdminLike`, not `role==="admin"`.

## Applied council fixes (recovered from memory — the load-bearing seven)

1. **Warp before paint (both models agreed, #1).** UTM raster on a 3857 basemap is misregistered by
   the ~10 m grid-convergence term. Warp NDVI to a **north-up EPSG:3857 display grid (nearest-neighbor)**
   in `warp.ts` (Unit 3); then the WGS84 bbox is exact. **A sub-pixel registration test is the gate (Unit 11).**
2. **`SpatialStyle` NULL-in-unique bug.** Postgres allows multiple NULLs, so a plain
   `@@unique([tenantId,scope,vineyardId,metric,name])` does **not** enforce uniqueness for SYSTEM/TENANT
   (null `vineyardId`). Use **two partial unique indexes** (`WHERE vineyardId IS NULL` / `IS NOT NULL`) +
   a `CHECK ((scope='VINEYARD') = (vineyardId IS NOT NULL))`.
3. **First-class `SpatialDatasetDerivative` table** (kind `DISPLAY_NDVI`/`SMOOTHED_NDVI`, `recipeVersion`),
   NOT a single pointer column — one column can't carry display + smoothed + versions.
4. **Min-domain-spread clamp** in `resolveDomain`: if `p95−p5 < 0.15`, pad median ±0.075. Stops the
   false-vigor rainbow + divide-by-near-zero on uniform blocks. A clamp, not a dismissible warning.
5. **Comparison mask-intersection** — the locked domain is computed over the **AND** of both dates'
   valid pixels, else clear-vs-cloudy skews it.
6. **Int16 ×10000 quantization + `-32768` no-data sentinel** for the stored display derivative (NaN
   doesn't fit Int16). **The source Float32 stays authoritative** — never the quantized derivative.
7. **Recentred-projector trap** — use a **direct proj4 EPSG transform** for warp, not `Projector.inverse`.
   Cache: `recipeVersion` in the key + `ETag`/`must-revalidate`, NOT bare `immutable`. **Y-flip paint
   exception CONFIRMED:** paint decode order directly (row-0-north = ImageData top-left); only
   `coverageOverGrid` (y-up) alpha needs flipping before `rasterToRgba`.

## Russell's Q1–Q4 resolutions (brief-vs-council tensions)

- **Q1 — bilinear display default** (brief §7.1); nearest = an inspect toggle; a source-resolution badge
  is the honesty guardrail.
- **Q2 — all six scale modes ship, progressive disclosure:** 3 prominent (`VINEYARD_SCENE`, `ABSOLUTE`,
  `COMPARISON_LOCKED`) + `BLOCK_SCENE`/`VINEYARD_BASELINE`/`CUSTOM` under "Advanced".
- **Q3 — styles = SYSTEM + one-off(URL) + VINEYARD; tenant scope deferred.**
- **Q4 — comparison = side-by-side (synced, locked domain) + a diff map** (B−A, diverging Red-White-Green).
- Unit-9 analytical 3×3 smoothing **deferred** (`SMOOTHED_NDVI` reserved); only appearance-only resampling
  ships. Steep-terrain = per-vineyard flag + badge showing `acquiredAt` (solar angles deferred).
- Assistant: one new **read** tool `compare_ndvi_dates` (anchors comparison for `verify:ai-native`);
  display-only render cores are INTERNAL-allowlisted.

## Key Decisions

- **Render path = single `L.imageOverlay` PNG (no-worker, ADR 0009).** No tile server. Rasters are ≤4 M px
  (decoder guard); one PNG per (dataset, style) is fine. `imageUrl` on the raster overlay arm.
- **The display derivative is materialized + cached** (warped + Int16-quantized) so the serving route is a
  cheap blob read, not a re-warp per map open. Keyed by `recipeVersion`. Blob-egress already metered (P2 Unit 7).
- **Domain dispatch lives in a new `resolveDomain(mode, {pixels, blockStats, lockedInputs, fixed})`** over
  `color.ts` primitives; min-spread clamp inside it.
- **Serving route renders server-side** (`rasterToRgba` → PNG via a zero-dep PNG encoder or `sharp` if
  already present) so the client just drops an `imageUrl`. Falls back to client canvas paint if needed.

## Implementation Units

### Unit 1: Schema slice — `SpatialDatasetDerivative` + `SpatialStyle` (own PR)
`prisma/schema.prisma` + migration. Both **tenant-scoped per the AGENTS.md Phase-12 checklist** (tenantId
`@default("")` + index + FK→organization ON DELETE RESTRICT; RLS ENABLE+FORCE + `tenant_isolation`
USING+WITH CHECK; app_rls grants; add to `scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts`;
NOT in `GLOBAL_MODELS`). New enums `SpatialDerivativeKind{DISPLAY_NDVI,SMOOTHED_NDVI}`, `SpatialStyleScope{SYSTEM,VINEYARD}`.
`SpatialDatasetDerivative`: `datasetId` FK (composite `(tenantId,id)` per checklist step 5), `kind`, `recipeVersion Int`,
blob refs, warped geotransform (`crsEpsg=3857`, origin/pixel/dims/axisYSign), `@@unique([tenantId,datasetId,kind,recipeVersion])`.
`SpatialStyle`: `scope`, `vineyardId?`, `metric`, `name`, `mode ColorScaleMode`(as String or new enum), `paletteId`, `reverse`,
`customStops Json?`, `percentileLow/High`, **two partial unique indexes + the CHECK** (fix #2). Isolated `ALTER TYPE` for enums
committed before any column defaults to them (Windows enum rule). **Depends on:** nothing. Ships first.

### Unit 2: Raster read-back (`src/lib/gis/satellite/raster-store.ts` + a reader core)
Add `getPrivateRaster(blobUrl|key)→Uint8Array` (authenticated blob fetch, range-capable) + a
`readNdviRasterFromDataset(dataset)` core that fetches bytes → `decodeNdviScene` → `computeNdvi` → returns the
Float32 NDVI grid + geotransform + coverage. Reuses P2 math verbatim. Meter blob-egress (P2 Unit 7). **Depends on:** —.

### Unit 3: Warp UTM→3857 display grid (`src/lib/gis/warp.ts`) — the load-bearing unit
`warpToDisplayGrid(ndviGrid, srcGeotransform)→{grid, epsg:3857, bbox3857, wgs84Bbox, originX,originY,pixelSizeM,axisYSign}`.
North-up 3857 output grid sized to preserve source resolution; **nearest-neighbor** sampling; per output cell,
inverse-transform 3857→UTM via a **direct proj4 EPSG transform** (fix #7, NOT `Projector.inverse`), sample source
(no-data contagious). Emits an exact WGS84 bbox for `leafletBounds`. Pure, dependency-injected proj4. **Depends on:** —.

### Unit 4: Domain-mode dispatch + min-spread clamp (`src/lib/gis/domain.ts`)
`resolveDomain(mode, inputs)` → picks `percentileDomain`/`fixedDomain`/`lockedDomain` per `ColorScaleMode`; applies the
**min-spread clamp** (fix #4: p95−p5<0.15 → median±0.075); `ABSOLUTE` uses fixed [-0.2,0.9] (or brief value); `VINEYARD_BASELINE`
resolves against a stored baseline dataset; `COMPARISON_LOCKED` over the mask-intersection (fix #5). Pure. **Depends on:** —.

### Unit 5: NDVI value histogram (`src/lib/gis/ndvi.ts` or `histogram.ts`)
`ndviHistogram(values, {bins=32, domain})` over **valid pixels on the value axis** (not coverage-weighted — coverageHistogram
is the wrong axis). Returns bin edges + counts + spread. Feeds the legend. Pure + tested. **Depends on:** —.

### Unit 6: Display-derivative materialization (`src/lib/spatial/display-derivative-core.ts`)
Given a dataset + recipe (warp + Int16×10000 + `-32768`), produce/adopt a `SpatialDatasetDerivative(DISPLAY_NDVI, recipeVersion)`:
read-back (U2) → warp (U3) → quantize Int16 → store to blob → upsert derivative row (idempotent, claim-first, mirror the P2 C1
outbox pattern). Source Float32 stays authoritative (fix #6). **Depends on:** 1,2,3.

### Unit 7: Serving route (`src/app/api/spatial/ndvi/[datasetId]/display/route.ts`)
Auth-gated, tenant-scoped GET. Query: `mode`, `paletteId`, `reverse`, `styleId?`, `opacity`, `resampling`, `recipeVersion`. Loads
dataset (RLS) → ensures derivative (U6) → resolves domain (U4) → `rasterToRgba` (with coverage alpha, Y-flip only for coverage) →
encodes PNG → responds with `ETag`(recipeVersion+style hash) + `Cache-Control: private, must-revalidate` (fix #7). Also a small
`/meta` sibling returning `wgs84Bbox`, domain, histogram, legend, badges. **Depends on:** 4,5,6.

### Unit 8: `SatelliteMap` raster arm (`src/components/ui/SatelliteMap.tsx`)
At the `kind:"raster"` branch (the `continue` at ~L545): build `L.imageOverlay(ov.imageUrl, leafletBounds(ov.bounds), {opacity, interactive:false})`,
add to the layer-stack group, honor z-order + `bringToFront`, `image-rendering:pixelated` when `resampling==="nearest"`. Remove/replace on
overlay change. No new deps. **Depends on:** 7 (for a real imageUrl; can stub with a fixture PNG first).

### Unit 9: NDVI display UI (`src/app/(app)/vineyards/ndvi/` — new `NdviMap*` client components)
Add the map surface to the console: `SatelliteMap` with the NDVI raster overlay; **scale-mode selector** (3 prominent + Advanced disclosure, Q2);
palette picker (+ reverse, color-vision-safe default option); **legend** (numeric domain + histogram + spread + **narrow-domain badge** when clamp fired);
**source-resolution badge** + **raw/bilinear/nearest** toggle (bilinear default, Q1); **steep-terrain advisory** (per-vineyard flag → badge with `acquiredAt`);
per-block stats panel (reuse P2 metric rows). Tokens only (DESIGN.md), no hardcoded colors. **Depends on:** 7,8.

### Unit 10: Date comparison + saved styles (`NdviCompare*` + style CRUD)
**Side-by-side** two dates, panning/zoom synced, **locked domain over the mask-intersection** (Q4, fix #5) + a **diff map** (B−A, diverging R-W-G).
**Saved styles:** SYSTEM (seeded) + one-off via URL params + VINEYARD (CRUD against `SpatialStyle`, U1); "save as vineyard default"; round-trips (persist → reload → identical). **Depends on:** 1,7,9.

### Unit 11: Assistant tool + goldens + `verify:ndvi-display` + registration test
`compare_ndvi_dates` **read** tool (two dates for a vineyard → per-block deltas + domain summary) + a golden (anchors `verify:ai-native`); display render cores INTERNAL-allowlisted.
**Goldens:** color-domain (each mode), palette, **the registration test to sub-pixel residual (fix #1 — the gate)**, histogram, comparison-no-drift, raw/smooth + source-res badges.
`scripts/verify-ndvi-display.ts` (`verify:ndvi-display` in package.json): Demo Winery, from the committed fixture — read-back → warp → derivative(READY) → serve PNG → assert bbox/domain/histogram + ETag + registration residual. **Depends on:** all.

## Test Strategy
- **Pure units first (3,4,5) — test-first.** Registration (U3) is the gate: build a synthetic UTM grid with a
  known feature at a known lat/lon, warp, assert the feature lands within sub-pixel of its true 3857 location.
- Reuse `test/fixtures/gis/*` rasters; add a warped-display fixture.
- Schema: extend `test/tenant-isolation.test.ts` + `scripts/verify-tenant-isolation.ts` for both new tables.
- e2e: `verify:ndvi-display` proves the whole chain on Demo Winery without a live provider.
- Assistant: `compare_ndvi_dates` golden (selection, not commit).
- **Browser QA (Demo Winery):** overlay registers on block boundaries; scale-mode switch re-domains without reload;
  comparison holds a locked domain; raw/smooth + source-res badges honest; narrow-domain badge fires on a uniform block;
  legend histogram matches; saved style round-trips.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Raster misregistered (~10 m) but looks perfect | MED | HIGH | Warp (U3) + sub-pixel registration test is the merge gate (U11, fix #1). |
| Domain rainbow on uniform blocks | MED | MED | Min-spread clamp in `resolveDomain` (U4, fix #4). |
| Comparison domain skewed by cloud | MED | MED | Locked domain over mask-intersection (U10, fix #5). |
| `SpatialStyle` dup rows for SYSTEM (null vineyardId) | MED | MED | Partial unique indexes + CHECK (U1, fix #2). |
| Blob egress cost on every map open | LOW | MED | Cached display derivative + ETag/must-revalidate (U6/U7, fix #7); metered (P2 U7). |
| Prod schema migration on the live tenant | LOW | HIGH | Two brand-new tables (additive, no backfill of existing rows), full Phase-12 RLS from creation; run from MAIN checkout. |

## Success Criteria
- NDVI overlay renders on the basemap and **registers on block boundaries to sub-pixel** (test-proven).
- All six scale modes selectable (3 + Advanced); switching re-domains live; min-spread clamp fires + badges.
- Legend shows domain + value histogram + spread; narrow-domain badge honest.
- Bilinear default + nearest inspect toggle + source-resolution badge.
- Date comparison: synced side-by-side on a locked (mask-intersection) domain + a B−A diff map.
- Styles: SYSTEM + URL one-off + VINEYARD save/round-trip.
- `compare_ndvi_dates` tool + golden green; `verify:ai-native` green; `verify:ndvi` still green; new `verify:ndvi-display` green.
- Browser QA on Demo Winery passes the brief §19 NDVI-display E2E list.

## Sequencing & parallelism
- **Unit 1 ships as its own schema-slice PR first** (mirrors P2's #495).
- Pure units **3, 4, 5** are independent → parallel-safe, test-first.
- Unit 2 independent. Then 6 (needs 1,2,3) → 7 (needs 4,5,6) → 8 → 9 → 10 → 11.
