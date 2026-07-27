# P2 — NDVI core: phase report

**Status:** BUILT + tested (all 11 plan units). Schema slice **LIVE IN PROD**; feature units on
`feat/vi-p2-ndvi-impl` (PR pending). **Plan:** [phase-2-ndvi-core-plan.md](phase-2-ndvi-core-plan.md).

The data half of brief Release 1B: fetch one estate-wide Sentinel-2 scene "around a date", compute masked NDVI
once, persist per-block statistics with full radiometric provenance — behind the no-worker outbox (ADR 0009).
No display (that's P3).

## Gate

| Success criterion | Status | Evidence |
|---|---|---|
| geotiff.js band arrays == P0 tifffile oracle | ✅ | `test/gis-decode.test.ts` — bit-exact on a committed REAL scene (56×67, EPSG 32617) |
| One estate fetch → decode → masked NDVI → raster in blob → `SpatialDataset` + full provenance | ✅ | `verify:ndvi` — READY dataset, harmonize=false, NEAREST, baseline 05.12, Copernicus attribution, typed geotransform |
| Per-block `BlockSpatialMetric` matches the P0 spread, stamped geometryVersion+fingerprint; MASK_BREAKING refused; `markStaleFor` returns NDVI | ✅ | `verify:ndvi` means **[0.597, 0.725]**; `test/block-metrics.test.ts`; `test/gis-geometry-version.test.ts` |
| C1 idempotent materialization: 2nd claimant sees INFLIGHT, no re-fetch; deterministic blob key; lease > 300 s; 402→quota-exhausted WITHHELD | ✅ | `verify:ndvi` (2nd job adopts, fetch stays 1); `test/process-scene.test.ts` fault map |
| Immutable history: geometryVersion in the metric unique key so versions coexist | ✅ | migration unique `@@unique([tenantId, blockId, datasetId, metric, geometryVersion])`; isolation case |
| Validity floor 0.5 → null mean/quantiles + INSUFFICIENT_VALID_COVERAGE, counts kept | ✅ | `test/block-metrics.test.ts` |
| Scene selection: footprint-containment first; auto-advance top-3; SCL preflight only 10–40%; requested vs acquired | ✅ | `test/scene-selection.test.ts` |
| Decoder C6: bands == oracle AND georef; Float32; BigTIFF rejected; no worker pool | ✅ | `test/gis-decode.test.ts` |
| Memory (S1): source bytes released post-decode, sequential block reducers | ✅ | `process-scene-core.ts` / `block-metrics-core.ts` (accumulator per block) |
| Quota counter (PU + requests + blob) per tenant/month, visible; auto-add DARK | ✅ | `usage-core.ts`; `verify:ndvi` counter check; `job-sweep.ts` `ndviAutoAdd` gate |
| Assistant `process_ndvi` (write) + `query_ndvi_stats` (read) + goldens; `verify:ai-native` green | ✅ | `tools/*`; read+write goldens; `verify:ai-native` ✓ |
| `verify:ndvi` e2e green on Demo (fixture); RLS/isolation for all five tables; `verify:naming` | ✅ | `verify:ndvi` 17/17; `verify:tenant-isolation` 139 tables; `verify:naming` 25/25 |
| tsc clean; five tables migrated (owner) cleanly | ✅ | `migrate deploy` clean; `tsc --noEmit` clean |

## Measurements / findings worth recording

- **NON-SQUARE PIXELS (new, load-bearing).** CDSE fits an integer pixel count across an arbitrary bbox, so the
  actual x/y pixel sizes drift apart (10.06 vs 9.98 m on the fixture) → a sub-pixel row/col misalignment that
  accumulates to ~3 px at estate scale and silently corrupts a square-grid clipper. **Fix:** `buildProcessRequest`
  now snaps the UTM bbox outward to whole 10 m multiples → Sentinel-2's true square grid. Grid geometry only; the
  radiometric contract is untouched. P0/P1 never hit this (synthetic grids). Regenerate the fixture if the AOI changes.
- **THE Y-FLIP.** A north-up GeoTIFF has row 0 at the NORTH; `coverage.PixelGrid` is y-up (row 0 SOUTH). Block
  metrics rebuild one y-up grid recentred to the raster's lower-left and flip the row on the NDVI lookup
  (`rasterRow = H-1-gridRow`). Proven by value: the north block reads 0.9, the south block 0.3.
- **STAC is slow (56–220 s, intermittent 500 in P0).** Selection runs in the cron sweep, never a render/chat turn.
- **Live fixture-gen PU** 0.0286 for a 56×67 scene; the committed fixture is 27 KB.
- **`geotiff` (geotiff.js)** added as one runtime dep — pure-JS, reads the single-image 3-band FLOAT32 output inline
  (no worker pool). Decode configured with no `pool` argument = the ADR-0009 no-worker guarantee.

## P3 hand-off (display)

P3 renders from `SpatialDataset` (raster blob + typed geotransform) + `BlockSpatialMetric` (per-block stats) — the
mask is ALREADY validated by P2, so P3 never re-validates. It inherits `render.ts`/`color.ts` and must implement the
scale modes (vineyard-relative p5–p95, absolute, locked, baseline, custom), palette, legend, histogram, and the raster
canvas overlay. The typed-array `percentileDomain` fast-path is a P3 win. **Scale-register tripwire is now load-bearing:**
P2 holds the raster whole (memory is the tightest number); estates > 2 M px need streaming/tiling (out of P2 scope, the
decoder refuses > 4 M px with a typed error).
