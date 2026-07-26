# P3 — NDVI display and comparison — build report

**Status: COMPLETE (2026-07-25).** Branch `feat/vi-p3-ndvi-display`. The viz half of brief Release 1B: the
stored NDVI raster (P2) now renders as a registered map overlay with six scale modes, palettes, a legend +
value histogram, honesty badges, saved styles, and locked-domain date comparison, plus a `compare_ndvi_dates`
assistant tool.

> **Provenance note:** the original P3 plan + council-feedback files were written + council-hardened on
> 2026-07-25 but never persisted (data loss found at build time). The plan was **reconstructed** from project
> memory (the 7 applied council fixes + Q1–Q4) + the runbook + a fresh map of the shipped P2 code, then built.

## What shipped (11 units)

1. **Schema** — `SpatialDatasetDerivative` (cached warped/quantized display raster) + `SpatialStyle` (saved
   palettes/domains). Both tenant-scoped (Phase-12 checklist), applied to the live DB via `migrate deploy`.
   council fix #2: `SpatialStyle` uses **two partial unique indexes** (`WHERE vineyardId IS NULL` / `IS NOT NULL`)
   + a `CHECK ((scope='VINEYARD') = (vineyardId IS NOT NULL))`. RLS proven — `verify:tenant-isolation` 141 tables.
2. **Read-back** — `getPrivateRasterBytes` + `readNdviGridFromDataset` (decode-from-blob reusing P2 math).
3. **`warp.ts`** — the load-bearing unit. Resamples the UTM raster onto a **north-up EPSG:3857 display grid**
   (nearest, display-only) via direct proj4 EPSG transforms (council #1 + #7), so a flat `L.imageOverlay`
   registers instead of rotating ~10 m off block boundaries. **Sub-pixel registration test is the merge gate.**
4. **`domain.ts`** — `resolveDomain` mode dispatch + the **min-spread clamp** (council #4: pad a <0.15 relative
   domain to 0.15, flag `clamped`).
5. **`histogram.ts`** — NDVI **value**-axis histogram (coverage-weighted) for the legend.
6. **Display-derivative core** — `ensureDisplayDerivative`: read-back → warp → **Int16×10000 / −32768** quantize
   (council #6) → blob → row, idempotent claim-first (P2 C1), egress metered. Source Float32 stays authoritative.
7. **Serving route** — `GET /api/spatial/ndvi/[datasetId]/display` → overlay PNG (zero-dep `node:zlib` encoder)
   or `?meta=1` legend JSON. **ETag on recipeVersion + all style params, `must-revalidate`** (council #7).
8. **`SatelliteMap` raster arm** — paints the warped PNG over its exact WGS84 bbox; nearest→`pixelated`,
   bilinear→`auto` (Q1).
9. **Map UI** — scale-mode selector (3 prominent + Advanced, Q2), palette + reverse + opacity + raw/nearest,
   legend (domain + histogram + spread + source-res/acquired/clamped/narrow badges).
10. **Comparison + styles** — side-by-side two dates on **one locked domain** (Q4/council #5); saved styles
    (SYSTEM presets + per-vineyard save/apply, Q3).
11. **Assistant + verify** — `compare_ndvi_dates` read tool + goldens (`verify:ai-native` green);
    `verify:ndvi-display` (hermetic render chain + live derivative/serve, incl. a real-data registration check).

## Proof

- **Registration gate** (the invisible-to-eyeballing risk): synthetic sub-pixel test + a real-fixture
  spot-check (peak-NDVI pixel lands in its true 3857 cell, residual < 1 px). `test/gis-warp.test.ts`.
- `verify:ndvi-display` — 20/20 checks (warp, Int16 round-trip ≤1e-4, all 6 modes, clamp, PNG, live
  derivative materialize+adopt+serve). `verify:ndvi` (P2) still green. `verify:ai-native` green.
- 103 gis unit tests green; tsc + eslint clean; `verify:tenant-isolation` 141 tables + both new tables.
- **Browser QA (Demo Winery `qa_ndvi_display_vy`)**: overlay 58×69 registers over the block outlines;
  Absolute mode → domain −0.2…0.9; nearest → `image-rendering: pixelated`; SYSTEM preset applies mode+palette;
  side-by-side comparison paints two dates on one locked domain 0.20–0.86.

## Deliberately deferred (documented, not silently dropped)

- **Pixel B−A diff MAP** (Q4's second half) — needs cross-date shared-grid alignment; the **per-block numeric
  delta** ships now via `compare_ndvi_dates`. Follow-on.
- **Analytical 3×3 stored smoothing** — `SMOOTHED_NDVI` derivative kind reserved; P3 ships appearance-only
  resampling (the honesty contract).
- **Polygon-exact display clip** — v1 paints the estate AOI masked to valid pixels (cloud/shadow removed);
  block outlines frame the vineyard. Legend says so. A coverage-alpha clip to block polygons is a follow-on.
- **TENANT-scope styles** (Q3) — SYSTEM + VINEYARD only.

## Notable fix surfaced

`putPrivateRaster`/`putPrivateDerivative` now pass `allowOverwrite: true` — newer `@vercel/blob` rejects the
deterministic-key idempotent overwrite these writers were built to do (a latent P2 bug that would break any
scene re-fetch/retry).

## QA fixtures

`scripts/seed-ndvi-display-qa.ts` seeds a persistent `QA NDVI Display` vineyard in Demo Winery (two scenes +
SYSTEM style presets) for the map. Remove with `... seed-ndvi-display-qa.ts --clean`.
