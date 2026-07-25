---
title: P2 — NDVI core (Vineyard Intelligence, brief Release 1B data half)
type: feat
status: council-reviewed
date: 2026-07-25
branch: feat/vi-p2-ndvi-core
depth: deep
units: 11
---

## Overview

Turn the P0 spike into a durable product capability: fetch a Sentinel-2 scene from Copernicus for a
vineyard "around a date", compute masked NDVI once over the whole estate, and persist per-block NDVI
statistics with full radiometric provenance — all behind the no-worker architecture (ADR 0009). This is
the **data half** of brief Release 1B. No display, no scale-modes, no map legend — that is P3.

The adapter and the pure math already exist and were proven live in P0 (`src/lib/gis/satellite/*`,
`ndvi.ts`, `zonal.ts`, `coverage.ts`, `projection.ts`). P2 adds the two things P0 deliberately left out:
a **runtime GeoTIFF decoder** (P0 decoded with dev-only Python `tifffile`) and a **persistence + job
layer** (P0 wrote zero DB rows). It also wires the first real consumer of P1's geometry-version stale hook.

## Problem Frame

The user is a vineyard manager who wants to see where vigor differs inside a vineyard and how it changes.
P0 proved the pipeline works on real data (live scene: 342×342 px, 0.892 PU, 80.8% valid after SCL mask,
block means 0.281–0.709 across one scene — exactly the within-vineyard variation the map exists to show).
But P0 is a bench rig: it fetches, decodes in Python, computes in memory, and writes a markdown report.
Nothing is persisted, nothing is reproducible from the app, and the assistant can't touch it.

**Do nothing?** Then P3 (display) has no data to render and the whole NDVI story stalls. P2 is the load-
bearing middle.

**Product pressure test.** The right problem is "persist a reproducible, provenance-complete NDVI scene +
per-block stats, cheaply and exactly once." The trap to avoid is over-building: no tile server, no COG
pyramid, no GDAL worker (ADR 0009 killed those). The simplest framing that delivers the value: one
estate-wide raster per date in blob, per-block stat rows in Postgres, a cron-driven outbox for
idempotency. That is 80% of the value at 20% of a "real GIS backend."

## Requirements

- **MUST** add a **runtime GeoTIFF decoder** (`bytes → {red, nir, scl}` typed arrays + grid/geotransform)
  — the one genuinely unbuilt piece. Validate against the P0 `tifffile` output.
- **MUST** fetch **one estate-wide scene per date** (ADR 0009 + P0: free tier binds on *requests* ~26× before
  PU; per-block fetching burns ~50 requests/look), clip N ways in memory.
- **MUST** reuse the pinned radiometric contract as-is (`harmonizeValues: false`, SCL `DN`, NEAREST
  resampling, metric CRS) and record all of it + the **ESA processing baseline (from the CDSE STAC call, not
  the Process API)** + Copernicus attribution in every scene's provenance (runbook §2.13).
- **MUST** persist `SpatialScene` (immutable), `SpatialDataset` (the raster: blob key + metadata),
  `SpatialAnalysisJob` (the outbox lifecycle), `BlockSpatialMetric` (per-block stats), `CdseUsageCounter`
  (quota telemetry) — all per the AGENTS.md Phase-12 tenant/RLS checklist.
- **MUST** store raster bytes in `@vercel/blob` (tenant-namespaced, sha256, private), never in Postgres.
- **MUST** run scene processing as a **cron-driven, claim-first idempotent outbox** (mirror
  `AccountingDelivery`), NOT a background worker (ADR 0009). Exactly-once across crashes.
- **MUST** re-validate the analysis mask (`reviewTopology`) and **refuse `MASK_BREAKING` geometry before
  computing stats** — the deferred enforcement P1's warn-only topology punted (P1 hand-off).
- **MUST** record on every `BlockSpatialMetric` the `geometryVersion` + `geometryFingerprint` it was
  computed from, and register NDVI as a **stale dependent** so a boundary edit invalidates it (P1 §6 hand-off;
  P2 is the first real consumer of `geometry-version.markStaleFor`).
- **MUST** meter CDSE processing-units + request count + blob-egress bytes per tenant/month; surface a visible
  quota counter; map `402 → quota` (don't retry).
- **MUST** ship assistant tools ("process NDVI for vineyard X around date D" write; "NDVI stats for block B"
  read) + goldens (`verify:ai-native` — assistant coverage was deferred from P0 to here).
- **MUST** never fabricate a scene (contract test): no mock/placeholder result ever reaches persistence.
- **SHOULD** provide `verify:ndvi` e2e on a **committed fixture scene** (no live provider in tests) + a
  by-hand live smoke (mirror `scripts/gis-p0-live-scene.ts`).
- **SHOULD** ship **auto-add-best-new-scene DARK**: a per-tenant flag, default OFF, enabled only after quota
  telemetry shows headroom (rule §2.8 — the one feature that scales provider calls with tenant count).
- **NICE:** the typed-array `percentileDomain` fast-path (P0 flagged it as the cheapest win; but the vineyard
  domain is a P3 display concern — defer unless free here).

## Scope Boundaries

**In scope:** decoder, scene selection, the processing job/outbox, raster blob storage, per-block stats
persistence with provenance + mask re-validation + stale wiring, quota telemetry, cron auto-add (dark),
assistant data tools, `verify:ndvi`.

**Out of scope (and why):**
- **All display/viz → P3**: scale modes (vineyard-relative p5–p95, absolute, locked, baseline, custom),
  palettes, legend, histogram, raster canvas overlay, date comparison, smoothing toggles, the steep-terrain
  advisory. P2 computes and stores; P3 renders. (`render.ts`/`color.ts` already exist but P2 doesn't wire the map.)
- **Other indices (NDRE/EVI/SAVI/…) + Sentinel-1 + temporal composites → Later bucket.** P2 is NDVI only.
- **Soil → P4** (parallel lane).
- **Streaming/tiling for >2M-pixel estates → Later** (scale-register tripwire); P2 holds the raster whole
  (memory is the tightest number: 451/512 MB at estate scale) and documents the boundary.
- **Merge of P1** — P2 depends on P1's `VineyardPlantingArea` + geometry-version; P1 (#494) must land first.

## Research Summary

### Codebase Patterns (all verified this session)

**Adapter — DONE + live-verified** (`src/lib/gis/satellite/`): `fetchProcessedScene(req, deps)` →
`{ bytes: Uint8Array, processingUnits, contentType }` (raw TIFF, no decode), `searchStacScenes(req, deps)` →
`{id, datetime, processingVersion, cloudCover}[]`, `getAccessToken` (cached OAuth2 client-credentials, TTL
1800 s). `buildProcessRequest` already pins `harmonizeValues:false` + NEAREST + metric CRS via `utmBboxFor`;
`NDVI_EVALSCRIPT` requests B04/B08 REFLECTANCE + SCL `DN` as parallel `bands`/`units` arrays, one 3-band
FLOAT32 TIFF. `classifyFault`: `402→quota`, `429→rate_limit`, `400/422→validation`, `≥500→transient`.
`copernicusAttribution(year)`, `baselineFromProductId`, env `CDSE_CLIENT_ID`/`CDSE_CLIENT_SECRET`.

**Pure math — DONE + live-verified**: `ndvi.computeNdvi(red,nir,scl,w,h,opts) → NdviRaster`
(SCL mask, `NO_DATA=NaN`, no epsilon added, saturatedCount sentinel); `zonal.zonalStats(samples,
{intersectingPixelCount, pixelAreaM2}) → ZonalStats|null` + `weightedQuantile` (midpoint/type-5 — the fixed
estimator; do NOT let `exactextract` arbitrate quantiles); `coverage.coverageOverGrid(rings, PixelGrid) →
PixelCoverage[]` (`index = row*width+col`, the bridge to `ndvi.values[index]`), `PixelGrid` = lower-left
origin, y-up; `projection.utmBboxFor/createProjectorForBbox/projectRings`. The P0 harness
`scripts/gis-p0-live-scene.ts` is the exact call sequence to mirror for `verify:ndvi`.

**Outbox/job template** — `AccountingDelivery` (`prisma/schema.prisma:3715`, poster
`src/lib/accounting/post-sweep.ts:432`): status enum + `attemptCount`/`claimedAt`/`leaseExpiresAt`/`lastError`,
claim-first `UPDATE … SET status='IN_FLIGHT' … WHERE … FOR UPDATE SKIP LOCKED` (expired leases self-heal),
query-before-post idempotency, fault→status mapping, re-emit anti-join. `runLedgerWrite` (SERIALIZABLE +
`set_config('app.tenant_id')` first statement, 5 retries) for the stats write.

**Blob** — `src/lib/attachments/blob.ts`: `putPrivateDocument(prefix, tenantId, name, …)` →
tenant-namespaced private key + `{url}`; `getPrivateBlob(url)`; `hasBlobCredentials()` gate
(`BLOB_READ_WRITE_TOKEN`). Range reads on private blobs = HTTP 206 CONFIRMED (P0 `blobSpike`).
`IngestedInvoice` (`schema.prisma:3757`: `blobUrl`+`fileSha256`+`status`) is the "bytes in blob, metadata+key
in Postgres" precedent to mirror.

**Cron** — Vercel Cron route (`vercel.json` + `src/app/api/cron/commerce7-poll/route.ts`): `runtime="nodejs"`,
`maxDuration=300`, `authorized()` = `timingSafeEqual` vs `Bearer ${CRON_SECRET}`, enumerates tenants
internally. Sweep pattern `src/lib/commerce/poll.ts`: cursor + 5-min overlap, advance cursor only after a
fully-drained page — the DARK auto-add shape.

**Quota counter** — `WeighTagCounter` (`schema.prisma:616`, `tenantId @id` one-row-per-tenant) is the
per-tenant counter precedent; PU already returned by `fetchProcessedScene`.

**Tenancy** — copy the P1 `prisma/migrations/20260724120000_planting_geometry/migration.sql` RLS structure
(ENABLE+FORCE+`tenant_isolation` policy + app_rls grant + fail-closed `DO $$` check). Extended `prisma`
auto-injects `tenantId`; never add new tables to `GLOBAL_MODELS`.

### Prior Learnings (memory + P0 report — do not re-derive)

- **`harmonizeValues: false` + `units:"REFLECTANCE"`** is the guard; the flag only clamps negatives and
  clamping fabricates `NDVI=1.0`. Un-harmonized error is non-constant (−0.257 at vigorous canopy) → cannot be
  calibrated out. **SCL in `DN`**, NEAREST (20 m→10 m), **cloud shadow (SCL 3) is the most-forgotten, most-
  damaging class**. **Baseline from the CDSE STAC `processing:version`, not the Process API `serviceVersion`.**
- **CDSE STAC was 56–220 s / intermittently 500 in the live run** while Process API stayed ~2 s → scene
  selection must be async + generous-timeout, never a synchronous request that blocks a page.
- **Free tier binds on requests (10k/mo) ~26× before PU** → one estate-wide raster/date, clip N ways.
- **Memory, not time, is the constraint (451/512 MB).** >2M px = the streaming boundary (out of scope, note it).
- **GeoTIFF decode is unbuilt** — P0 used Python `tifffile`; P2 must add a JS decoder and validate against it.
- **`curl` fails CDSE on this Windows box (TLS exit 35); Node `fetch` works** — use fetch in scripts.
- **`verify:ai-native` fails on any new `*-core.ts` not reachable from a tool** (assistant coverage deferred
  P0→P2). **Stop `next dev` before `prisma generate`** (stale-client trap). **`.env` IS prod** — never
  `vercel env pull` into it.
- Context-ledger: no NDVI-specific precedent beyond ADR 0009; the radiometric decisions live in runbook §2.13.

### External Research

`geotiff` (geotiff.js) is the de-facto JS/TS GeoTIFF reader — reads multi-band FLOAT32 via
`fromArrayBuffer(...).getImage().readRasters()`, returns per-band typed arrays + `getBoundingBox()`/
`getOrigin()`/`getResolution()`. It is pure-JS (no native/WASM GDAL), works in Node. It is the intended
decoder for the single-tile, single-image FLOAT32 output the adapter already requests.

## Council revisions (2026-07-25)

Cross-LLM review ([phase-2-council-feedback.md](phase-2-council-feedback.md), Codex + Gemini) surfaced one
real exactly-once hole and a schema/immutability gap; four decisions were settled. All folded into the units.

- **Exactly-once → dataset-identity key + in-flight placeholder (C1).** "Adopt if exists" dedupes too late.
  Add a UNIQUE `datasetIdentity = hash(tenantId, vineyardId, providerSceneId, recipeHash)` where `recipeHash`
  = harmonizeValues + mask policy + resampling + algorithm version; **create an in-flight `SpatialDataset`
  placeholder BEFORE the external fetch**; a second claimant that sees an active row backs off; the **blob key
  is deterministic from the identity**, not the sha256. Honest name: "at-least-once fetch, idempotent
  materialization." **Lease > 300 s + finalize slack** (no heartbeat infra) so a healthy long fetch isn't reclaimed.
- **Immutable metrics, keep history (Q1 decision).** A `BlockSpatialMetric` is permanently bound to the
  `geometryVersion` it was computed against; a boundary edit **annotates, never hides/invalidates**.
  **`geometryVersion`/`geometryFingerprint` go INTO the `BlockSpatialMetric` uniqueness key** so v3 and v4
  readings coexist. `markStaleFor` becomes an annotation event (compatible with runbook §6 "never rewrite").
- **Scene selection: auto-advance top-3 + gated SCL preflight (Q2 decision).** Free checks first (footprint
  containment, edge-of-tile risk); auto-try the top **3** candidates within one attempt; a **1-band
  SCL-over-the-AOI preflight only in the ambiguous 10–40% tile-cloud band** (blanket SCL doubles request-spend);
  surface WITHHELD only after top-3 exhausted, with a typed reason.
- **minValidFraction = 0.5 (Q3 decision).** Below half-valid, a block's mean/median/quantiles are `null` +
  quality flag `INSUFFICIENT_VALID_COVERAGE` — never a biased 15%-coverage mean. Per-tenant configurable later.
- **Compute block metrics INLINE in the job (Q4 decision).** No blob reload — stats run in the same request
  right after NDVI while the raster is in memory; the block-metrics core stays separately testable.
- **Memory is a first-class acceptance criterion (S1).** Decode banded, release source TIFF bytes immediately,
  NDVI in place, drop red/nir after, **sequential accumulator block reducers** (never 20 sample arrays at once);
  tripwire on **measured peak bytes**, not pixel count.
- Folded, no decision: **`requestedDateTarget` vs `actualAcquiredAt`** + shown offset (S2); **`maskDilation: 0`
  in provenance** (S3, SCL-halo honesty); **`effectivePixelCount` as Decimal** (Σweights, weighted-mean
  denominator — S4); **typed geotransform** (not loose JSON); **typed `withheldReason`/fault class**, sweeper
  never reclaims a quota-withheld job until the next billing window (S5); **counter = billable provider
  attempts** (S6); **composite-parent `@@unique([tenantId, id])`** on scene+dataset (S7); decoder asserts the
  full georeferencing + `Float32Array` + non-interleaved + `samplesPerPixel===3` + BigTIFF/tiled-vs-stripped
  policy + no worker pool (C6); **topographic-shadow watch** for the hilly Bhutan tenant (S8).

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| GeoTIFF decoder | Add **`geotiff` (geotiff.js)** as one runtime dep, wrapped in `src/lib/gis/satellite/decode.ts`; validate against the P0 `tifffile` output | Keep Python `tifffile` (cannot ship on Vercel); hand-roll a TIFF parser (false economy, P0's own rule); request PNG/JPEG (loses FLOAT32 precision) | The one genuinely-unbuilt piece. geotiff.js is pure-JS, reads the exact 3-band FLOAT32 single-tile output the adapter requests. **Council flag** — it's the phase's real unknown. |
| Job architecture | **Cron-driven claim-first outbox** (`SpatialAnalysisJob`, mirror `AccountingDelivery` + Vercel Cron route) | Background worker / durable queue (BullMQ, etc.) | ADR 0009 forbids a worker. A tiny AOI (~5k px) fits a serverless request; the cron sweep + `FOR UPDATE SKIP LOCKED` lease gives exactly-once without infra. |
| Fetch shape | **One estate-wide raster per date**, clipped N ways in memory; `SpatialScene` keys on (vineyard, date) | Per-block fetch | Free tier binds on requests ~26× before PU (P0); 10× blocks measured only 1.5× cost. |
| Scene selection cost | Rank/recommend by **STAC scene `eo:cloud_cover`** (free, in the search response); validate **real per-planting SCL valid-coverage only for the SELECTED scene at processing time** — if it fails the block bad-pixel threshold, mark the scene `WITHHELD` with a reason and offer the next candidate | Fetch SCL for every candidate to pre-score coverage | Per-candidate SCL fetch = N requests/look (blows the request budget the whole architecture optimizes for). Scene cloud% is a good coarse rank; the true test happens once, on the chosen scene. |
| Raster storage | **Blob (private, tenant-namespaced, sha256) + metadata in Postgres** (`SpatialDataset` mirrors `IngestedInvoice`) | GeoTIFF bytes in Postgres | ADR 0009; 0.73 MB/scene; range-read-capable (206 confirmed). |
| Mask before stats | **`reviewTopology` gate — refuse `MASK_BREAKING`** (overlaps, block-outside-parent) before computing; record the finding | Trust stored geometry (P1 is warn-only) | P1 hand-off: warn-only means broken masks can persist; NDVI stats over a double-counted mask are silently wrong. |
| Stale invalidation | `BlockSpatialMetric` records `geometryVersion`+`geometryFingerprint`; P2 registers NDVI in `geometry-version.markStaleFor` (its first real consumer) | Ignore (recompute-on-open) | Runbook §6; a boundary edit must mark NDVI stale, not silently serve numbers from the old shape. |
| Auto-add-best-new-scene | **Ships DARK**: per-tenant `ndviAutoAdd` flag default false; cron enqueues only for enabled tenants; enable only after quota telemetry shows headroom | On by default | Rule §2.8: it's the one feature that scales provider calls with tenant count rather than user action. |
| Weighted quantiles | Reuse `zonal.weightedQuantile` (midpoint/type-5); **analytic fixtures**, never `exactextract` for quantiles | exactextract oracle | The type-7 estimator ignored weights (P0); exactextract's quantile definition differs — only mean/count/min/max are oracle-checkable. |

## Implementation Units

### Unit 1: Schema-first slice — scenes, datasets, jobs, metrics, usage counter (own PR)

**Goal:** Land the five P2 tables + enums + RLS as one schema+migration PR ahead of the feature units.
**Files:** `prisma/schema.prisma`; new migrations under `prisma/migrations/` (isolated enum `CREATE TYPE`
first, then `_ndvi_schema`, then `_ndvi_rls`); `test/tenant-isolation.test.ts` + `scripts/verify-tenant-isolation.ts`.
**Approach:** Copy the P1 planting-geometry migration structure. Tables (all Phase-12: `tenantId @default("")`,
`@@index([tenantId])`, `@@unique([tenantId,id])` where an FK target, composite FKs, RLS ENABLE+FORCE+policy+
grant+fail-closed check):
- `SpatialScene` (immutable): `vineyardId`, `provider`, `collection`, `providerSceneId`, **`requestedDateTarget
  DateTime`** + **`acquiredAt DateTime`** (S2 date-drift honesty — the offset is derived, axis = acquiredAt),
  `bounds Json`, `sceneCloudCover Decimal`, `processingBaseline`, `processingLevel`, `selectionReason`,
  provenance fields; `@@unique([tenantId, vineyardId, providerSceneId])`, **`@@unique([tenantId, id])`** (FK target).
- `SpatialDataset` (the raster; mirrors `IngestedInvoice`): `vineyardId`, composite FK →`SpatialScene`,
  **`datasetIdentity String` `@@unique([tenantId, datasetIdentity])`** = `hash(vineyardId, providerSceneId,
  recipeHash)` where `recipeHash` = harmonizeValues+maskPolicy+resampling+`algorithmVersion` (C1 up-front
  idempotency), `kind` (RASTER), `metric` (NDVI), `blobUrl`, `blobSha256`, `byteSize Int`, `crsEpsg`,
  **typed geotransform: `originX`/`originY`/`pixelSizeM`/`gridWidth`/`gridHeight`/`axisYSign` (NOT loose Json)**,
  `harmonizeValues Boolean`, `sclResampling`, **`maskDilation Int @default(0)`** (S3), `processingUnits Decimal`,
  `attribution`, `status` (INFLIGHT/READY/FAILED — the in-flight placeholder lands here before the fetch),
  `@@unique([tenantId, id])` (FK target).
- `SpatialAnalysisJob` (outbox): `vineyardId`, `kind` (NDVI_SCENE), `status` enum (PENDING/IN_FLIGHT/
  PROCESSING/COMPLETED/FAILED/WITHHELD), `idempotencyKey` `@@unique`, **`withheldReason` / `faultClass`**
  (quota-exhausted | selection-miss | low-coverage — S5; sweeper never reclaims `quota-exhausted` until the next
  billing window), `sceneId?`, `datasetId?`, `params Json`, `attemptCount`, `claimedAt`, `leaseExpiresAt` (set
  **> 300 s + slack**), `lastError`, `processingVersion`.
- `BlockSpatialMetric` (**immutable snapshot** — Q1): composite FK →`VineyardBlock` + →`SpatialDataset`,
  `metric`, `acquiredAt`, the P0 `ZonalStats` fields (min/p10/p25/median/mean/p75/p90/max/stdDev **Decimal,
  nullable** — null below the valid floor, with `qualityFlags` carrying `INSUFFICIENT_VALID_COVERAGE`),
  `intersectingPixelCount Int`, `validPixelCount Int`, **`effectivePixelCount Decimal`** (Σcoverage, the
  weighted-mean denominator — S4), `validFraction Decimal`, `coveredAreaM2 Decimal`, `mixedPixelShare Decimal`,
  `qualityFlags Json`, `processingVersion`, **`geometryVersion Int` + `geometryFingerprint String`**;
  **`@@unique([tenantId, blockId, datasetId, metric, geometryVersion])`** (Q1/C2 — versions coexist, history
  never overwritten).
- `CdseUsageCounter` (mirror `WeighTagCounter`; **counts BILLABLE PROVIDER ATTEMPTS, not successful datasets** —
  S6): `@@id([tenantId, yearMonth])`, `requestCount Int @default(0)`, `processingUnits Decimal @default(0)`,
  `blobEgressBytes BigInt @default(0)`, `updatedAt` (all non-null zero defaults — S5).
- `Vineyard.ndviAutoAdd Boolean @default(false)` (the DARK flag).
**Tests:** per-table isolation cases (seed A+B, A-sees-own / A-can't-see-B / foreign-INSERT-reject +
composite-FK reject for block↔metric, scene↔dataset); RLS-coverage guard picks all up.
**Depends on:** none (but P1 #494 must be merged first — `VineyardBlock.geometryVersion`/`plantingAreaId` exist there).
**Execution note:** enum `CREATE TYPE` migration commits before any column defaults to it (Windows rule).
**Verification:** `npm run db:migrate` (owner) clean; `verify:tenant-isolation`; `npx prisma validate`.

### Unit 2: GeoTIFF decoder (`src/lib/gis/satellite/decode.ts`)

**Goal:** Decode the adapter's 3-band FLOAT32 GeoTIFF bytes into the arrays `computeNdvi`/`coverageOverGrid` need.
**Files:** `src/lib/gis/satellite/decode.ts` (new); `test/gis-decode.test.ts` (new); `test/fixtures/gis/`
(commit a small real scene TIFF + its expected bands, derived from the P0 `tifffile` output);
`package.json` (+`geotiff`).
**Approach:** `decodeNdviScene(bytes): { red, nir, scl: Float32Array; width; height; originX; originY;
pixelSizeM; axisYSign; crsEpsg }`. Use `geotiff.fromArrayBuffer` → `getImage()` → `readRasters({interleave:
false})` (band order [B04, B08, SCL] per `NDVI_EVALSCRIPT`), `getOrigin()`/`getResolution()`/`getBoundingBox()`
for the typed geotransform. **Council C6 contract (all asserted, not assumed):** each returned band **is a
`Float32Array`** (not `number[]` — memory), **non-interleaved**, `samplesPerPixel === 3` read from our own
evalscript provenance (NOT inferred from photometric tags), an explicit **BigTIFF policy** (reject with a clear
error class) and a **tiled-vs-stripped policy**, **prove no decode worker-pool** spins up in serverless Node
(configure geotiff.js to decode inline). Bound decompressed size + dimensions (SSRF/DoS, brief §18). Pure.
**Tests:** decode the committed fixture → assert band arrays **equal the P0 `tifffile` output** element-for-
element AND the **full georeferencing** (origin, pixelSize, axis-Y sign, crsEpsg, bbox) matches within tolerance
(value-equality alone is insufficient — the clipper needs the geotransform right); each band is a
`Float32Array`; a truncated/garbage buffer rejects; an oversized-dimension header rejects; a BigTIFF rejects
with the typed error.
**Depends on:** none.
**Patterns to follow:** `scripts/gis-p0-decode-tif.py` (the reference output to match); `attachments/blob.ts` size guards.
**Verification:** `npx vitest run test/gis-decode.test.ts`.

### Unit 3: Scene selection (`src/lib/gis/satellite/scene-selection-core.ts` + action)

**Goal:** "Around a date" scene search that recommends but lets the user inspect, and records an immutable
`SpatialScene` on selection.
**Files:** `src/lib/gis/satellite/scene-selection-core.ts` (new); `src/lib/spatial/actions.ts` (new, `"use server"`);
`test/scene-selection.test.ts`.
**Approach:** `searchScenesCore(vineyardId, aroundIso, opts)` builds the estate bbox (union of planting areas
via `boolean.unionPolygons`), expands the window ±7→14→30 days, `searchStacScenes`, and ranks candidates with
**free up-front checks first (C4)**: **footprint containment** (does the scene footprint actually cover the
estate AOI — reject partial/edge-of-tile), then `eo:cloud_cover` ascending. Returns the ranked candidate list
with cloud% + `requestedDateTarget` + `acquiredAt` (+ derived offset) + processingVersion + reason. **STAC-slow
contract:** generous timeout, never on a synchronous render path. `selectSceneCore` writes the immutable
`SpatialScene` (STAC baseline, requestedDateTarget) and enqueues a job carrying the **top-3 ranked candidates**
so the job can **auto-advance** (C4). A **gated 1-band SCL-over-AOI preflight** runs only when tile cloud% is in
the ambiguous **10–40%** band (blanket SCL doubles request-spend in a request-bound quota). Never fabricate:
zero candidates → explicit empty result.
**Tests:** mock STAC — footprint-containment rejects an edge-of-tile scene; ranking by cloud; window expansion;
zero-candidate empty result; baseline from STAC not Process API; date-offset (requested vs acquired) recorded;
SCL preflight fires only in the 10–40% band. Deterministic; no live provider.
**Depends on:** Units 1, (P1 boolean).
**Patterns to follow:** `commerce/*` STAC-mock style; brief §13.5, §15 scene selection.
**Verification:** `npx vitest run test/scene-selection.test.ts`.

### Unit 4: Scene processing job — fetch → decode → NDVI → blob (`src/lib/gis/satellite/process-scene-core.ts`)

**Goal:** The outbox core that turns a PENDING job into a stored NDVI raster + `SpatialDataset`, exactly once.
**Files:** `src/lib/gis/satellite/process-scene-core.ts` (new); `src/lib/gis/satellite/raster-store.ts` (new,
blob put/get for rasters); `test/process-scene.test.ts`.
**Approach:** `processSceneJobCore(job, deps)` — **idempotent materialization (C1), not exactly-once fetch.**
First compute `datasetIdentity = hash(vineyardId, providerSceneId, recipeHash)` and **upsert an INFLIGHT
`SpatialDataset` placeholder** on `@@unique([tenantId, datasetIdentity])`; if a READY/INFLIGHT row already
exists, **adopt/back off — never re-fetch** (this is what stops the double request-spend). Then: one
estate-wide `fetchProcessedScene` → `decodeNdviScene` → `computeNdvi` → **inline block metrics (Unit 5) in the
SAME pass while the raster is in memory (Q4)** → `putPrivateRaster` at a **deterministic blob key derived from
`datasetIdentity`** (not sha256) → flip the dataset to READY with full provenance (**harmonizeValues, baseline,
SCL resampling, maskDilation:0, attribution, PU, typed geotransform**) → job COMPLETED. **Memory discipline
(S1):** release the source TIFF bytes right after decode, compute NDVI in place, drop `red`/`nir` once NDVI
exists. **Auto-advance (C4):** if the scene fails the AOI SCL coverage, mark that candidate a
`selection-miss` and try the next of the top-3 before surfacing WITHHELD. Fault→status: `quota(402)→WITHHELD`
`faultClass=quota-exhausted` (sweeper won't reclaim till next billing window), `validation→FAILED`,
`transient/rate_limit→retry` via lease. Record the **billable attempt** (PU + request) in `CdseUsageCounter`
(Unit 7) on every provider call, success or fail. No fabricated scene ever persisted.
**Tests:** fixture-bytes path (no live provider): decode→ndvi→inline-metrics→blob(mock)→READY dataset with full
provenance; **a second concurrent claimant sees the INFLIGHT placeholder and does NOT re-fetch** (the C1
guarantee); quota fault → WITHHELD + faultClass + no READY dataset; the top-3 auto-advance skips a
selection-miss; provenance contains harmonizeValues=false + baseline + SCL resampling + maskDilation.
**Depends on:** Units 1, 2, 5 (the block-metrics core runs inline here).
**Patterns to follow:** `accounting/post-sweep.ts` claim/finalize; `attachments/blob.ts`; `IngestedInvoice` sha256.
**Verification:** `npx vitest run test/process-scene.test.ts`.

### Unit 5: Per-block stats + mask re-validation + stale wiring (`src/lib/spatial/block-metrics-core.ts`)

**Goal:** Compute and persist `BlockSpatialMetric` from a dataset, refusing broken masks and wiring staleness.
**Files:** `src/lib/spatial/block-metrics-core.ts` (new); `src/lib/gis/geometry-version.ts` (register the NDVI
dependent); `test/block-metrics.test.ts`.
**Approach:** `computeBlockMetricsCore(raster, planting, blocks, deps)` — **called INLINE by U4's job with the
raster already in memory (Q4), no blob reload.** Rebuild the `PixelGrid` from the dataset's typed geotransform;
run **`reviewTopology`** and **refuse a `MASK_BREAKING` mask** (record `withheldReason=mask-breaking`, write no
metrics). Otherwise iterate blocks **sequentially with accumulator-style reducers (S1 — never hold 20 sample
arrays at once)**: `coverageOverGrid` → samples from `ndvi.values[index]` → `zonalStats`. **Validity floor
(Q3):** if `validFraction < 0.5`, write the row with **null mean/median/quantiles + `INSUFFICIENT_VALID_COVERAGE`**
(counts + coverage still recorded). Each `BlockSpatialMetric` is an **immutable snapshot stamped with the block's
`geometryVersion` + `geometryFingerprint`** (Q1) and stored as coverage-weighted (with `effectivePixelCount` =
Σweights). **Staleness = annotation (Q1):** extend `markStaleFor` so a PLANTING_AREA/BLOCK version bump returns
the NDVI dependent as an ANNOTATION event — **old metrics are retained and served**, never hidden; the metric's
`geometryVersion` in its unique key lets the next version coexist. Write under `runLedgerWrite` (SERIALIZABLE).
`Σcoverage×pixelArea ≈ polygonArea` sanity assert (oracle-free dropped-ring check).
**Tests:** reuse P0 fixtures — reconcile block coverage to the parent; `MASK_BREAKING` fixture refused (no rows);
**a block below 0.5 valid → null stats + INSUFFICIENT_VALID_COVERAGE, counts still present**; metrics stamp the
right version/fingerprint and a **second version coexists** (no unique conflict); `markStaleFor` returns the
NDVI dependent as an annotation (old rows still readable); weighted-quantile values match analytic fixtures
(not exactextract); `effectivePixelCount` is the Σweights float.
**Depends on:** Units 1; P1 (`topology`, `geometry-version`, `geometry-meta`). (Invoked inline from U4.)
**Verification:** `npx vitest run test/block-metrics.test.ts`.

### Unit 6: Job sweep + Vercel cron route (poll ingest; DARK auto-add)

**Goal:** Drive PENDING jobs to completion on a schedule, and (dark) auto-enqueue the best new clear scene.
**Files:** `src/lib/spatial/job-sweep.ts` (new, the claim-first poster); `src/app/api/cron/ndvi-poll/route.ts`
(new); `vercel.json` (+cron entry); `test/job-sweep.test.ts`.
**Approach:** `runNdviJobSweep()` mirrors `runAccountingPostSweep`: `claimBatch` (`FOR UPDATE SKIP LOCKED` +
lease) → `processSceneJobCore` (U4, which runs metrics inline) → finalize; expired leases self-heal.
**Lease > 300 s + finalize slack** (CDSE took 135 s live; no heartbeat infra) so a healthy long fetch isn't
double-claimed (council Q10). The sweep **never reclaims a `faultClass=quota-exhausted` WITHHELD job** until the
next billing window (S5).
The cron route (`runtime="nodejs"`, `maxDuration=300`, `CRON_SECRET` `timingSafeEqual`) enumerates tenants and
runs the sweep. **Auto-add DARK:** only for vineyards with `ndviAutoAdd=true` (default false), a cursor+overlap
search for the newest clear scene since the last, advancing the cursor only after a drained run — enqueue a
job, never process synchronously.
**Tests:** claim/lease/retry/idempotency unit tests (a stuck IN_FLIGHT past its lease is reclaimed; two
concurrent sweeps don't double-process); auto-add skips `ndviAutoAdd=false` tenants (contract).
**Depends on:** Units 4, 5.
**Patterns to follow:** `accounting/post-sweep.ts`, `commerce/poll.ts`, `api/cron/commerce7-poll/route.ts`.
**Verification:** `npx vitest run test/job-sweep.test.ts`; `npm run build`.

### Unit 7: Quota + blob-egress telemetry (`src/lib/spatial/usage-core.ts`)

**Goal:** Meter CDSE PU + request count + blob-egress bytes per tenant/month; surface a visible counter.
**Files:** `src/lib/spatial/usage-core.ts` (new); `test/spatial-usage.test.ts`.
**Approach:** `recordCdseUsage(tenantId, {processingUnits, requests, blobBytes})` upserts the
`CdseUsageCounter` row for the current year-month (atomic increment). Called by U4 (PU + request on each fetch)
and U6/raster-store (blob egress on each raster read). `readCdseUsage(tenantId)` for the visible counter and
the auto-add headroom gate. Map `402→quota` surfaces as a WITHHELD job + a usage-at-cap signal.
**Tests:** increments accumulate within a month; month rollover starts fresh; concurrent increments don't lose
counts (upsert atomicity).
**Depends on:** Unit 1.
**Patterns to follow:** `WeighTagCounter`; rule §2.8.
**Verification:** `npx vitest run test/spatial-usage.test.ts`.

### Unit 8: Assistant tools + goldens (`ndvi` data capability)

**Goal:** The assistant can fetch/process NDVI and read block stats (satisfies `verify:ai-native` — deferred from P0).
**Files:** `src/lib/assistant/tools/process-ndvi.ts` (write) + `tools/query-ndvi-stats.ts` (read);
`src/lib/assistant/registry.ts`; `src/lib/assistant/commit.ts` (write committer); `test/evals/assistant-*.golden.ts`.
**Approach:** `process_ndvi` (write, confirmation-gated) → `selectSceneCore`/enqueue for "process NDVI for
vineyard X around date D" (returns the candidate list to confirm, then enqueues). `query_ndvi_stats` (read) →
latest `BlockSpatialMetric` for "NDVI stats for block B [on date]", naming the block + acquisition + valid%.
Domain-composite, not one-tool-per-core. The write tool wraps the U3/U6 cores so they're reachable in the
import graph.
**Tests:** golden read + write cases (D26 coverage guard); write committer present; `verify:ai-native` green.
**Depends on:** Units 3, 5, 6.
**Patterns to follow:** `tools/query-cellar-contents.ts` (read), `tools/*` write + `commit.ts`,
`test/evals/assistant-tools.eval.test.ts`.
**Verification:** `npm run verify:ai-native`; `npx vitest run test/evals/assistant-tools.eval.test.ts`.

### Unit 9: `verify:ndvi` e2e + contract tests + attribution

**Goal:** A deterministic end-to-end proof on a committed fixture scene (no live provider), plus the brief §19 contract tests.
**Files:** `scripts/verify-ndvi.ts` (new); `package.json` (`verify:ndvi`); `test/ndvi-contract.test.ts`.
**Approach:** `verify:ndvi` runs on Demo Winery via `runAsTenant`: seed a QA vineyard + planting + blocks →
feed the **committed fixture TIFF bytes** through decode→computeNdvi→raster-store(mock/local)→SpatialDataset→
computeBlockMetrics → read the metrics back and assert the P0-measured spread. Contract tests:
no-fabricated-scene (a failed fetch never yields a dataset), provenance contains
harmonizeValues+baseline+SCL-resampling, scene idempotency/retry, mask-revalidation refuses a broken mask,
Copernicus attribution present, quota counter visible after a run, RLS. A **by-hand live smoke** (mirrors
`scripts/gis-p0-live-scene.ts`) is documented but not in CI (no live provider in tests).
**Depends on:** all prior units.
**Patterns to follow:** `verify:ttb`/`verify:planting-geometry` e2e style; `gis-p0-live-scene.ts`.
**Verification:** `npm run verify:ndvi`; full `npx vitest run`.

### Unit 10: Vineyard-selection / trigger UI (thin — data only)

**Goal:** A minimal surface to trigger a scene fetch and see job status + that metrics landed (NOT the map — that's P3).
**Files:** a thin client under `src/app/(app)/vineyards/` (e.g. `ndvi/NdviJobsClient.tsx` + route) + a loader
in `src/lib/spatial/actions.ts`.
**Approach:** pick a vineyard → "Find scenes around [date]" (calls U3 search, shows candidates + cloud%) →
select → shows the `SpatialAnalysisJob` status (PENDING→COMPLETED/WITHHELD/FAILED) and, on completion, the
per-block NDVI means in a table (proof the data landed). No raster rendering, no scale modes, no legend — a
data console. DESIGN.md tokens.
**Tests:** manual QA on Demo (repo has no jsdom); pure status/label helpers unit-tested if extracted.
**Depends on:** Units 3, 5, 6.
**Verification:** `/qa` on Demo (browser via Claude-in-Chrome — in-app browser refuses localhost here);
`npm run build`.

### Unit 11: Report, ledger, NOW, registers

**Goal:** Close the P2 gate with evidence and update the living docs.
**Files:** `docs/GIS/phases/phase-2-report.md`; `docs/GIS/VINEYARD_INTELLIGENCE_RUNBOOK.md` (§7 ledger →
shipped/QA; fold the P3 hand-off — display inherits `render.ts`/`color.ts` + the stored datasets, and must
implement the scale modes P2 stored data for); `NOW.md`; scale-register (the >2M-px streaming tripwire is now
load-bearing); ADR if the geotiff.js decision warrants one.
**Approach:** gate table + measurements (mirror `phase-1-report.md`); record the geotiff.js dep + the STAC-slow
finding + the memory-tripwire; flip the ledger; carry the P3 hand-off (mask already validated by P2; P3
renders from `SpatialDataset` + `BlockSpatialMetric`; the typed-array `percentileDomain` fast-path is a P3 win).
**Depends on:** all prior units.
**Verification:** all `verify:*` green; `npx vitest run`.

## Test Strategy

**Unit (pure, deterministic, no provider/DB):** `gis-decode` (band arrays == P0 tifffile output),
`scene-selection` (mock STAC), `process-scene` (fixture bytes + mock blob), `block-metrics` (P0 fixtures +
mask-refusal + version stamping), `job-sweep` (claim/lease/idempotency), `spatial-usage` (counter atomicity),
`ndvi-contract` (no-fabricated-scene, provenance, attribution, idempotency).
**Integration/DB (gated):** isolation cases for the five new tables; `verify:ndvi` e2e on Demo with a committed
fixture scene.
**Assistant:** golden read+write + D26 guard + `verify:ai-native`.
**Manual/live:** a by-hand `verify:ndvi --live` smoke against CDSE (Node fetch, not curl; from the main
checkout with `.env`), mirroring the P0 live harness — never in CI.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| geotiff.js decodes the FLOAT32/band order wrong | MED | HIGH | Validate element-for-element against the P0 `tifffile` output on a committed fixture; **council-flag the dep**; the adapter already emits a single-tile single-image 3-band output (the simple case geotiff.js handles well). |
| CDSE STAC slow/flaky (56–220 s, 500s) blocks scene selection | HIGH | MED | Selection is async with generous timeout, never on a render path; retry/backoff already in the adapter; the job is a cron sweep, not a user-blocking request. |
| Estate > 2M px blows the 512 MB memory ceiling | LOW | HIGH | Hold-it-whole is fine at vineyard scale (451 MB at estate); document the streaming boundary as a scale-register tripwire; refuse/scale-down above the threshold rather than OOM. |
| Per-candidate SCL coverage would blow the request budget | MED | MED | Rank by STAC cloud%, validate real SCL coverage only on the SELECTED scene; a failed scene → WITHHELD + next candidate. |
| Auto-add scales provider calls with tenant count | MED | MED | Ships DARK (per-tenant flag default false); enabled only after `CdseUsageCounter` shows headroom. |
| A broken (P1 warn-only) mask silently corrupts NDVI stats | MED | HIGH | U5 `reviewTopology` gate refuses `MASK_BREAKING` before writing any metric. |
| Blob egress cost on map opens (P3) | LOW | MED | Metered now (Unit 7); range reads confirmed; P3 caches. |

## Success Criteria

- [ ] `geotiff` decoder produces band arrays identical to the P0 `tifffile` output on a committed fixture.
- [ ] One estate-wide fetch → decode → masked NDVI → raster in blob (sha256, private, tenant-namespaced) →
      `SpatialDataset` with full provenance (harmonizeValues=false, STAC baseline, SCL NEAREST, attribution, PU).
- [ ] Per-block `BlockSpatialMetric` rows match the P0-measured spread, stamped with geometryVersion+fingerprint;
      a `MASK_BREAKING` mask is refused; `markStaleFor` now returns the NDVI dependent.
- [ ] **Idempotent materialization (C1):** a second concurrent claimant sees the INFLIGHT dataset placeholder
      (keyed on `datasetIdentity`) and does NOT re-fetch (no double request-spend); deterministic blob key;
      lease > 300 s; `402→quota-exhausted→WITHHELD` not reclaimed till next billing window; no fabricated scene.
- [ ] **Immutable history (Q1/C2/C3):** a boundary edit annotates but never hides prior metrics; a v3 and a v4
      `BlockSpatialMetric` for the same block+dataset coexist (geometryVersion in the unique key).
- [ ] **Validity floor (Q3/C5):** a block below 0.5 valid stores null mean/quantiles + `INSUFFICIENT_VALID_COVERAGE`
      (never a biased partial-coverage mean); `effectivePixelCount` stored as the Σweights float.
- [ ] **Scene selection (C4):** footprint-containment rejects edge-of-tile scenes; the job auto-advances the
      top-3 candidates; SCL preflight fires only in the 10–40% band; `requestedDateTarget` vs `acquiredAt` recorded.
- [ ] **Decoder (C6):** band arrays == P0 `tifffile` AND georeferencing (origin/pixelSize/axis/EPSG/bbox) match;
      each band a `Float32Array`; BigTIFF rejected; no worker pool.
- [ ] **Memory (S1):** measured peak bytes under the acceptance threshold; source bytes released post-decode,
      red/nir dropped post-NDVI, block reducers sequential.
- [ ] Quota counter (PU + requests + blob bytes) accumulates per tenant/month and is visible; auto-add ships DARK.
- [ ] Assistant `process_ndvi` (write) + `query_ndvi_stats` (read) + goldens; `verify:ai-native` green.
- [ ] `verify:ndvi` e2e green on Demo (fixture scene); RLS/isolation for all five tables; `verify:naming` green.
- [ ] All five new tables pass the Phase-12 checklist; five new tables + enums migrated (owner) cleanly.
- [ ] `tsc` clean; full suite green; report + ledger + NOW + scale-register updated; P3 hand-off recorded.

## Sequencing & parallelism

- **Unit 1 ships as its own schema-slice PR first.**
- Units **2 (decoder)**, **3 (scene selection)**, and **5 (block-metrics core)** are independent of each other
  and can run right after U1. **U5's core is invoked inline by U4's job** (Q4 — no blob reload), so build U5
  before/with U4.
- 4 needs 1+2+5; 6 needs 4; 7 needs 1; 8 needs 3+4+6; 9 needs all; 10 (thin UI) needs 3+4+6; 11 last.
- **Depends on P1 (#494) being merged** — `VineyardBlock.geometryVersion`/`plantingAreaId` + `topology`/
  `geometry-version`/`geometry-meta` all come from P1. Do not start P2 `/work` until #494 lands.
- Wave-2 sibling **P5 (observations + sampling plans)** is file-disjoint (no `src/lib/gis` overlap); the only
  shared choke point is `prisma/schema.prisma` (serialize the schema-slice PRs).
