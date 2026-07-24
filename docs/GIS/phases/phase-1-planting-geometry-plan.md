---
title: P1 — Planting geometry foundation (Vineyard Intelligence, brief Release 1A)
type: feat
status: council-reviewed
date: 2026-07-24
branch: feat/vi-p1-planting-geometry
depth: deep
units: 12
---

## Overview

Add the missing parent in the vineyard spatial hierarchy — `VineyardPlantingArea` — between `Vineyard`
and `VineyardBlock`, with day-one geometry versioning, topology validation, and a reviewable migration
that unions existing block polygons into proposed parents without touching the originals. This is Wave 1
lane A of the Vineyard Intelligence program (runbook §5 "P1"), and it also lands the governed map
**layer-stack contract** (`MapOverlay`) early in the wave so P2/P3 raster layers and P4's soil overlay
extend one contract instead of forking `SatelliteMap`.

The user outcome: a vineyard manager can outline (or review) each continuous planting, partition it into
labeled blocks with no overlaps or gaps, and trust that a later boundary correction never silently
rewrites the analysis it fed. No NDVI, no soil, no satellite in this phase — this is the geometry spine
everything else hangs on.

## Problem Frame

Today the schema has **no planting-area geometry at all** — only `VineyardBlock.polygon Json?`, explicitly
commented "illustrative, not the area source" (`prisma/schema.prisma:445`), with each block drawn
independently. That independent-draw model is exactly the failure the brief warns about (§2.2): touching
blocks drawn separately create slivers and gaps that later double-count or omit area in zonal statistics.
There is no parent analysis mask, no topology check, and no geometry versioning — so the moment P2 starts
computing NDVI stats against these polygons, a boundary edit would silently corrupt historical numbers.

**Product pressure test.** Is a parent layer the right problem, or a proxy? It is the right problem: the
brief's whole statistical contract (fractional boundary-pixel coverage, planting-wide p5–p95 calibration,
"planting totals reconcile with non-overlapping block coverage") is defined against a *continuous planting
mask* that does not exist yet. Doing nothing means P2/P3/P4 each invent their own ad-hoc parent, and the
"never silently rewrite historical analysis" guarantee (brief §2.3) becomes unenforceable after the fact.
The cost of inaction is high and compounds every downstream phase.

Simpler framing that still delivers 80%? Yes, and we take it: **read-only assistant + no NDVI**, and
`plantingAreaId` stays **nullable** this phase (backfill-then-enforce) so the live Bhutan tenant is never
broken by a bare NOT NULL. The parent exists, migration is reviewable, versioning is wired — enforcement
of "every block has a parent" is a follow-up once real tenants have reviewed their migration.

## Requirements

- **MUST** add `VineyardPlantingArea` (brief §14): tenant + vineyard, stable name/code + sort order,
  canonical `Polygon`/`MultiPolygon`, geometry version + effective dates, source (`DRAW`/`IMPORT`/
  `DERIVED`), excluded-hole metadata, review/confirmation status, projected + geodesic area summaries,
  creator/audit — following the AGENTS.md Phase-12 tenant/RLS checklist verbatim.
- **MUST** add a `VineyardBlock.plantingAreaId` reference via a **composite** `(tenantId, plantingAreaId)`
  FK to `planting_area(tenantId, id)` `ON DELETE RESTRICT` (K11), **nullable this phase**
  (backfill-then-enforce; live tenant safe).
- **MUST** promote `VineyardBlock.polygon` from "illustrative" to a **canonical block analysis boundary**
  (semantics + versioning columns), without changing stored bytes or the spacing-based acreage invariant.
- **MUST** version geometry from day one (runbook rule §6): an append-only supersede mechanism with a
  canonical polygon **fingerprint**; a boundary edit closes the current version and appends a new one,
  never rewrites/deletes; the stale-marking hook exists even with zero derived consumers yet.
- **MUST** support the map-first setup workflow (brief §2.2): draw/import a continuous planting with holes;
  then one of `one-block-from-planting`, `split-into-blocks` (shared-boundary split), or
  `draw-blocks-inside` (snap to planting + sibling edges).
- **MUST** run a topology review (brief §2.2 step 6, §19 fixtures): overlaps, gaps, slivers, blocks outside
  the parent, and explicit unassigned planting area — over exact projected geometry.
- **MUST** provide reviewable **migration-by-union** (brief §2.2): union existing block polygons, group by
  spatial continuity into proposed parents, present for naming/hole-correction/confirm, record provenance
  `source = DERIVED`, leave original block geometry and metadata untouched.
- **MUST** report geodesic/projected polygon area **alongside** (never replacing) spacing-based planted
  acreage (brief §11.2, §17 "do not shoelace lat/lng").
- **MUST** land the `MapOverlay` layer-stack contract (brief §13.1) as an additive `SatelliteMap` prop,
  not a rewrite; planting boundaries become a distinct layer.
- **MUST** ship read-only assistant tool(s) for planting/block structure Q&A + goldens (runbook §2.5,
  `verify:ai-native`), and keep `verify:naming` green.
- **MUST** pass RLS/isolation for both new tables; `verify:tenant-isolation` coverage guard stays green.
- **SHOULD** provide a `verify:planting-geometry` e2e proof script on Demo Winery (mirrors `verify:ttb`/
  `verify:soil` style).
- **NICE:** silhouette of "unassigned planting area" surfaced visually in the topology panel.

## Scope Boundaries

**In scope:** everything in the runbook P1 gate — schema + RLS, geometry versioning, draw/import/split/snap,
topology review, migration-by-union, block→planting nullable reference, area summaries, the `MapOverlay`
contract, read-only assistant + goldens, isolation tests.

**Out of scope (and why):**
- NDVI / satellite / scenes / raster overlays → **P2/P3** (this phase renders vector overlays only, but the
  contract is raster-ready via the existing `render.ts` `leafletBounds`/`rasterToRgba`).
- Soil cards / SDA → **P4** (parallel lane, cards-only, deliberately touches no map component so the lanes
  stay file-disjoint).
- Offline outbox → **POF** (parallel lane; P1 write paths take an idempotency key so they're
  outbox-compatible later, but P1 does not build the outbox).
- **Enforcing `plantingAreaId` NOT NULL** → follow-up after real tenants migrate (protects live Bhutan).
- Subblock geometry → later; subblocks stay code/label only (brief §2.1 "if subblocks later participate in
  spatial analysis they also need governed geometry").
- Write-capable assistant tools for geometry → later (P1 assistant is read-only per the gate).

## Research Summary

### Codebase Patterns

**Schema / tenancy (Phase-12 checklist).** Freshest single-table exemplar is `Grower`
(`prisma/schema.prisma:360-376` + migration `prisma/migrations/20260723160000_grower_entity/migration.sql`)
— the whole 9-step checklist in one file: `tenantId String @default("")`, `@@unique([tenantId, name])`,
`@@unique([tenantId, id])` (composite-FK target), `tenantId→organization` FK `ON DELETE RESTRICT`, composite
referencing FKs `(tenantId, growerId) → grower(tenantId, id)`, `ENABLE` + `FORCE ROW LEVEL SECURITY` + one
`tenant_isolation` policy `USING (...) WITH CHECK (...)` on `current_setting('app.tenant_id', true)`, app_rls
grant, and a fail-closed self-check. Copy this file structure. Enum ordering rule (Windows): any new enum's
`CREATE TYPE` migration lands before any column defaults to it (isolated migration).

**Extension auto-inject.** The extended `prisma` (`src/lib/prisma.ts:53-88`) fills `tenantId` on
create/upsert (`injectTenantId`, `src/lib/tenant/models.ts:51-82`) and sets `app.tenant_id`/`app.user_id`
GUCs. `GLOBAL_MODELS` (`models.ts:22-39`) is the denylist — **do not** add the new tables to it.

**Domain-write pattern to copy** (`src/lib/vineyard/actions.ts`): read `before` outside the tx →
`runInTenantTx(async (tx) => { mutate; writeAudit(tx, {...actor, action, entityType, entityId,
changes: diff(before, after), summary: summarize(...)}) })` → `revalidatePath` outside. `writeAudit`/`diff`/
`summarize` from `@/lib/audit` (`audit.ts:163-178`, `:39-56`, `:59-81`). `runInTenantTx` at `tx.ts:17-31`.
Scripts/verify harnesses wrap in `runAsTenant("org_demo_winery", fn)` (`context.ts:39-42`); cross-tenant
maintenance uses `runAsSystem` (`system.ts:23-25`).

**Existing geometry validation is already centralized and reusable.** `saveBlockPolygon`
(`actions.ts:318`) delegates to `validatePolygon` → `validateVineyardPolygon` from `@/lib/gis/geometry`
(64 KiB / 2000-vertex / closure / winding / self-touch / self-intersect / hole-containment; returns
canonically-wound geometry, 13 `RejectionCode`s). **Reuse it unchanged** at every new write boundary.
Serializers in `src/lib/vineyard/data.ts` pass `polygon` through verbatim (`serializeBlock:97`) — no Decimal
crosses the client boundary; follow the same shape for planting areas.

**P0 GIS pure modules already on disk** (`src/lib/gis/`, all pure, no React/Leaflet):
`geometry.ts` (`validateVineyardPolygon`, `signedArea`, `pointInRing`, `segmentsProperlyIntersect`, `bbox`,
`eachRing`, `MAX_POLYGON_*`), `projection.ts` (`GEOM_EPSILON_M = 1e-6`, `Projector`, `createProjector*`,
`projectRings`, `utmBboxFor`), `coverage.ts` (Sutherland–Hodgman `clipRingToRect`, `shoelace`,
`pixelCoverageFraction`, `coverageOverGrid`), `zonal.ts`, `ndvi.ts`, `color.ts`, `render.ts`
(`rasterToRgba`, **`leafletBounds`** — the raster→map bridge, not yet wired), `smooth.ts`, plus the
`satellite/` CDSE adapter (server-only). **P1 builds new pure modules beside these and reuses
`geometry.ts` + `projection.ts` as the clipping/CRS foundation.**

**Map surface.** `SatelliteMap.tsx` (`src/components/ui/`, vanilla Leaflet, `next/dynamic ssr:false`) takes a
flat `SatelliteMapProps` (`:125-168`): `blocks: SerializedBlock[]`, `editable`, `activeBlockId`,
`onPolygonSaved(blockId, geometry|null)` (the only commit callback), `onBlockClick`. Block overlays render via
`L.geoJSON` in the polygon effect (`:471-521`); Geoman draw/edit/snap is wired in three effects
(`:530-600`, `snapDistance:20`, `allowSelfIntersection:false`). **The editable/draw surface today lives in
`src/app/(app)/reference/VineyardModal.tsx` + `VineyardSetup.tsx`**, not `/vineyards/maps` (that route is
read-only). **There is no `MapOverlay`/layer-stack abstraction anywhere** (confirmed by grep) — the only hit
is a doc comment in `render.ts:107`. P4 is cards-only precisely so P1 owns the map components without
collision.

**Assistant / verify.** Tools are static-registered in `src/lib/assistant/registry.ts` (`AssistantTool`
`:31-39`, `ALL_TOOLS` `:127-216`); representative read tool `tools/query-cellar-contents.ts` wrapping a core.
Goldens in `test/evals/*.golden.ts`, gated by `test/evals/assistant-tools.eval.test.ts` (structural D26
coverage guard). `verify:ai-native` (`scripts/verify-ai-native.mjs`) builds a TS import graph rooted at
`tools/**` + `registry.ts`; **any `src/lib/**/*-core.ts` exporting a `*Core` symbol must be reachable from a
tool** or be allowlisted (`scripts/ai-native-allowlist.mjs`, ratcheted). `verify:naming`
(`scripts/verify-naming.ts`) is the **lot-code identity** proof, *not* a generic naming linter — a plain
per-tenant unique `name` (like `Grower`) needs nothing extra; it only bites if PlantingArea gets a
user-renameable code with immutable snapshots (we will not give it one).

**Isolation.** `scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts` auto-enumerate
`Prisma.dmmf` minus `GLOBAL_MODELS` and assert RLS `ENABLED`+`FORCED`+policy on every table — so a missing
RLS migration fails automatically. Per-table hand cases (seed A+B, assert A-sees-own / A-can't-see-B /
foreign-INSERT-rejects / composite-FK-reject) copy the `compliance`/`bond` templates
(`test/tenant-isolation.test.ts:362-368`, `:433-445`).

### Prior Learnings

- **P0 tolerance decision** (`docs/GIS/phases/p0-tolerance-decision.md`): all intersection/area math happens
  in the scene's **UTM CRS recentred on the AOI**, never WGS84 degrees (degree² area is latitude-biased; the
  `polygon-clipping` family's `Unable to complete output ring` failures cluster at the 6th decimal of a
  degree ≈ 0.11 m — *exactly* vineyard-boundary scale). `GEOM_EPSILON_M = 1e-6` is the input-side snap
  tolerance. **This is the decisive input for P1's boolean-op decision below**: working in recentred metres
  moves us out of the documented failure regime, which is what makes a boolean library usable.
- **P0 render** (`p0-render.md`): `percentileDomain` object-per-sample is the known scale cost; irrelevant to
  P1 (no rasters) but the typed-array lesson carries to P2. Use `toBlob`+`createObjectURL` when rasters come.
- **Memory (auto):** shared git index across worktrees → stage with `git commit --only <paths>`; DB-backed
  `verify:*` runs from the MAIN checkout (worktrees have no `.env`). Prisma/Neon on Windows: stop the dev
  server before `db:generate`; `migrate diff → deploy`, phantom `search_vector` diffs are benign.
- **Memory (auto):** owner-fold and Phase-12 checklist; `runAsTenant` needs `async () => await …`; Turbopack
  rejects junctioned `node_modules`.
- Context-ledger: no prior precedent on planting-area geometry or the layer-stack contract; the P0
  architecture decision is [ADR 0009](../../architecture/decisions/0009-vineyard-intelligence-no-worker-architecture.md).

### External Research

Boolean polygon ops (union for migration, difference/split for partitioning) are **not** covered by P0's
Sutherland–Hodgman clipper (that only clips against a convex rectangle). `@turf/*` internally delegates
boolean ops to `polygon-clipping` (martinez). `polyclip-ts` is a maintained TypeScript rewrite of
`polygon-clipping` with types and the same algorithm. Either is viable **provided we feed it recentred UTM
coordinates** (per the P0 tolerance finding), not WGS84 degrees.

## Council revisions (2026-07-24)

Cross-LLM review ([phase-1-council-feedback.md](phase-1-council-feedback.md), Codex + Gemini) changed two
architecture choices and settled four product decisions. All are folded into the units below.

- **Boolean kernel → `jsts`** (not `polyclip-ts`): recentring to UTM does **not** fix the martinez-family
  coincident-edge failure P0 rejected; JSTS has a real snap-rounding precision model + a native line-splitter.
- **Split → true line-split ("blade")** (not buffer-and-corridor): the corridor approach destroyed the shared
  boundary and minted a permanent gap. JSTS split produces adjacent blocks sharing a mathematically identical edge.
- **Versioning → IoU-gated**: a trace-correction (IoU(old,new) > 0.98) updates in place with no stale cascade;
  a real boundary change (IoU ≤ 0.98) mints a new version and (later) marks dependents stale — grower confirms intent.
- **Migration → all-or-nothing per vineyard**: "Migrate site" assigns every block atomically or saves nothing.
- **Area → hierarchy, not three peers**: "Productive area" (spacing acreage) primary; "Boundary footprint"
  (geodesic polygon area) secondary and explicitly labeled; projected-vs-geodesic hidden from users.
- **Topology → warn-only (user decision, against council rec)**: findings never block a save. Consequence
  accepted and recorded: provably-broken mask geometry (overlaps, block-outside-parent) can persist, so **P2
  must re-validate the mask before computing stats rather than trusting stored geometry** — a note is carried
  forward to the P2 plan and the scale/security register.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Boolean polygon ops (union/difference/split) | **`jsts`** as one scoped dep, wrapped in `src/lib/gis/boolean.ts`, on **recentred UTM** coords, using JSTS's snap-rounding `GeometryPrecisionReducer` + `OverlayNG` and its line-splitter | `polyclip-ts`/martinez (council: still the failure class P0 rejected regardless of scale); hand-roll (P0's own "false economy" argument); turf (whole tree, martinez underneath) | Council C1/C2: the `polygon-clipping` family's failures are internal coincident/near-coincident-edge + precision issues, **not** coordinate-magnitude — recentring doesn't cure them. JSTS is the robust JTS port with a real precision model and a native split. Wrapper keeps the kernel swappable. |
| Split-into-blocks | **True line-split ("blade")**: extend the drawn line to the planting boundary, split into adjacent polygons sharing a mathematically identical edge (JSTS `polygonize`), re-validate each | Buffer polyline → corridor → difference (the original plan) | Council C2 (both reviewers, CRITICAL): corridor-difference destroys the shared row-middle boundary and creates a permanent gap = corridor width, violating "sibling blocks share snapped edges" (brief §2.3). |
| Geometry versioning shape | **Append-only `VineyardGeometryVersion` table** (subjectType, subjectId, version, geometry snapshot, fingerprint, **canonicalization anchor**, effectiveFrom/To, reason, iouFromPrev) + `geometryVersion`/`geometryFingerprint` pointer on the subject | Columns-only (loses old geometry) | House moat (append-only, immutable lineage). "Never silently rewrite historical analysis" (brief §2.3) needs the old geometry retrievable. One table covers blocks + planting areas. |
| Correction vs. boundary-change | **IoU-gated**: `IoU(old,new) > 0.98` → update current version in place, no stale cascade; `≤ 0.98` → prompt intent, mint new version, mark dependents stale | Every edit mints a version (trigger-happy — nukes NDVI history on a 2 m trace fix) | Council Q2/Gemini: distinguishes fixing a sloppy trace from mapping a real physical change; protects downstream analysis history. |
| Fingerprint algorithm + frame | Canonical-form hash (winding-normalized rings, vertices projected + rounded in recentred metres, rings sorted, SHA-256) **with the recenter anchor pinned, persisted in the version row, and included in the hash** | Hash raw GeoJSON; recompute anchor per edit (council S1: unstable — same shape hashes differently) | Council S1 (both): the fingerprint only means something if the frame is fixed. P4 also keys soil staleness on this fingerprint, so define it once, deterministically, frame-stable. |
| Version-bump concurrency | **Single tx**: row-lock the subject (`SELECT … FOR UPDATE`) or optimistic CAS on the version pointer (abort on 0 rows) + **partial unique on the open row** (`effectiveTo IS NULL`) + stale-write guard (`WHERE geometryVersion = expected`) | `@@unique([tenantId,subjectType,subjectId,version])` alone | Council C3/S2/S3: the unique constraint only rejects duplicate inserts after both writers read the same version; racing edits still lose an `effectiveTo` close or a pointer update. |
| `plantingAreaId` nullability + migration | **Nullable at DB level**; a per-vineyard `plantingMigratedAt` flag gates the UI so migration is **all-or-nothing per vineyard**; after migration, block-creation requires a planting in that vineyard | NOT NULL now (breaks live tenant); long-lived half-migrated state (council Q3: permanent UX tax) | Live Bhutan tenant has parent-less blocks; a bare NOT NULL breaks it. All-or-nothing avoids a confusing orphan UI without a risky global backfill. |
| Block `polygon` promotion + authority | Change **semantics + add version/fingerprint columns**; stored bytes unchanged. **Authority rule:** block polygon is canonical for the block, planting geometry canonical for the parent; migration derives parent FROM blocks once, one-block derives a block FROM the parent once — after creation each shape has exactly one author | Migrate polygon into the version table; dual-authority | Council S5: zero-risk to existing readers; explicit single-author rule prevents geometry drift. |
| Area presentation | **"Productive area"** (spacing acreage) = primary; **"Boundary footprint"** (geodesic polygon area) = secondary, labeled "includes headlands/margins, used for satellite analysis"; projected area internal-only | Three area numbers as peers | Council C4/Gemini: peers alarm growers (headlands make polygon ~15% > canopy → reads as corrupt data). |
| Layer-stack contract location | New pure `src/lib/gis/overlay.ts` (`MapOverlay` union + `LegendModel` + ordered `LayerStack`) + **additive** `overlays?: MapOverlay[]` prop on `SatelliteMap` | Rewrite `SatelliteMap` now | Additive keeps P4/P2/P3 from a destructive merge; contract is the shared surface, component migration incremental. |
| Topology enforcement | **Warn-only** — all findings surface, none block a save (**user decision, against council rec**) | Block on overlap/outside-parent, warn on gaps (council Q4 rec) | Grower's call: maximum permissiveness. Tradeoff recorded — broken mask geometry can persist, so **P2 re-validates the mask before stats**. |
| Geometry type safety | Convert raw GeoJSON `Json` into a **branded canonical `VineyardPolygon`** at the edge before any boolean/area/version logic | Plain interfaces (council S6: callers bypass project→snap→validate) | Council S6: makes the validate-first contract unbypassable. |

## Implementation Units

### Unit 1: Schema-first slice — tables, RLS, block reference (own PR)

**Goal:** Land `VineyardPlantingArea`, `VineyardGeometryVersion`, and the nullable `VineyardBlock`
reference + block versioning columns as one small schema+migration PR, ahead of feature units (runbook §4
choke-point rule).
**Files:** `prisma/schema.prisma`; new migrations under `prisma/migrations/` (an isolated `CREATE TYPE`
migration for the `PlantingAreaSource`/`GeometrySubjectType` enums first, then a `_planting_geometry_schema`
create, then a `_planting_geometry_rls` migration); `src/lib/tenant/models.ts` (confirm **not** adding to
`GLOBAL_MODELS`).
**Approach:** Copy the `Grower` migration file structure verbatim. `VineyardPlantingArea`: `tenantId
@default("")`, `id`, `vineyardId` + composite FK `(tenantId, vineyardId)→vineyard(tenantId, id)` RESTRICT,
`name`, `code String?`, `sortOrder Int @default(0)`, `geometry Json`, `geometryVersion Int @default(1)`,
`geometryFingerprint String`, `effectiveFrom DateTime @default(now())`, `source PlantingAreaSource`,
`excludedHoleNote String?`, `reviewStatus` (`PROPOSED`/`CONFIRMED`), `areaProjectedM2 Decimal?`,
`areaGeodesicM2 Decimal?`, audit fields; `@@unique([tenantId, vineyardId, name])`, `@@unique([tenantId, id])`,
`@@index([tenantId])`, `@@index([tenantId, vineyardId])`. `VineyardBlock`: add `plantingAreaId String?` +
composite FK `(tenantId, plantingAreaId)→planting_area(tenantId, id)` RESTRICT + `@@index([tenantId,
plantingAreaId])`; add `geometryVersion Int @default(1)`, `geometryFingerprint String?`; update the L445
"illustrative" comment to "canonical block analysis boundary (Phase VI-P1)". `VineyardGeometryVersion`: full
Phase-12 shape + `geometry Json`, `fingerprint`, `canonicalAnchor Json` (the pinned recenter origin +
EPSG, council S1), `effectiveFrom`/`effectiveTo DateTime?`, `reason`, `iouFromPrev Decimal?`;
`@@unique([tenantId, subjectType, subjectId, version])` **and a partial unique on the open row**
(`CREATE UNIQUE INDEX … WHERE "effectiveTo" IS NULL` — council C3/S2, one open version per subject).
Add `Vineyard.plantingMigratedAt DateTime?` (the all-or-nothing migration gate, council Q3). RLS
`ENABLE`+`FORCE`+`tenant_isolation` policy + app_rls grants + fail-closed self-check on both new tables.
**No backfill of `plantingAreaId` (stays null; MATCH SIMPLE means the composite FK is simply skipped when
null — safe, no cross-tenant leak since `tenantId` is non-null, per council C4).**
**Tests:** Extend `test/tenant-isolation.test.ts` + `scripts/verify-tenant-isolation.ts` with per-table cases
(seed A+B, A-sees-own / A-can't-see-B / foreign-INSERT-reject; composite-FK-reject for the block→planting and
vineyard→planting refs). The RLS-coverage guard picks up both tables automatically.
**Depends on:** none.
**Execution note:** keep the steps as **distinct** migrations (council S9) — enum `CREATE TYPE` first
(Windows rule), then table create, then RLS/grants — not one bundle.
**Patterns to follow:** `prisma/migrations/20260723160000_grower_entity/migration.sql`; `prisma/schema.prisma:360-376`, `:429-462`.
**Verification:** `npm run db:migrate` clean on Demo Winery; `npm run verify:tenant-isolation`; `TENANT_ISOLATION_DB=1` isolation test green; `npx prisma validate`.

### Unit 2: Boolean-polygon foundation (`src/lib/gis/boolean.ts`) — JSTS

**Goal:** Robust union / difference / **true line-split** over vineyard polygons.
**Files:** `src/lib/gis/boolean.ts` (new); `test/gis-boolean.test.ts` (new); `package.json` (+`jsts`).
**Approach:** Wrap `jsts`. Every entry point takes a **branded** `VineyardPolygon` (council S6), projects to
recentred UTM via `createProjector*`/`projectRings` (`projection.ts`) recording the pinned anchor+EPSG, runs
JSTS `OverlayNG` under a `GeometryPrecisionReducer` snap-rounding model (council C1 — this, not coordinate
scale, is what makes it robust), inverse-projects, and re-runs `validateVineyardPolygon` on every output ring
(council S7 — the real self-intersection gate). Exports: `unionPolygons(polys)`, `differencePolygons(a, b)`,
**`splitPolygonByLine(poly, lineCoords)`** — a **true blade** (council C2): extend the line to the planting
boundary, node it with the polygon edges, `polygonize` into ≥2 parts that **share a mathematically identical
edge** (no corridor, no gap, no lost area); `groupByContinuity(polys, snapM)` — union-find with an **explicitly
defined** adjacency rule (council S4): edge-overlap OR vertex within `snapM` (default 1 m, council C3) counts
as adjacent; point-only touch does **not** bridge. Record EPSG + anchor for provenance.
**Tests:** hand-computed goldens — two adjacent squares union to one rectangle with no sliver; difference of
overlapping squares; **split a rectangle by a mid-line into two equal halves that share the exact cut edge and
lose zero area**; two disconnected squares → MultiPolygon, `groupByContinuity` = 2; a pair 0.5 m apart groups
as 1, a pair 3 m apart as 2. **Failure cases (council S10):** split line ending inside the polygon (reject with
a clear code); line grazing a vertex; a self-intersecting input rejected by `validateVineyardPolygon`; repeated
edit cycles round-tripping through WGS84 keep a stable fingerprint. Reuse P0 fixture coordinates.
**Depends on:** Unit 1 (types only; can start in parallel with U1's migration).
**Patterns to follow:** `src/lib/gis/projection.ts` recentring; `coverage.ts` header (why robustness matters);
`p0-tolerance-decision.md`; the swappable-kernel interface so a future kernel change touches only this file.
**Verification:** `npx vitest run test/gis-boolean.test.ts`.

### Unit 3: Map layer-stack contract (`src/lib/gis/overlay.ts`)

**Goal:** The governed `MapOverlay` contract (brief §13.1) other phases extend, landed early, additive to
`SatelliteMap`.
**Files:** `src/lib/gis/overlay.ts` (new, pure types + resolver); `test/gis-overlay.test.ts` (new);
`src/components/ui/SatelliteMap.tsx` (+ additive `overlays?` prop + a vector-overlay render effect);
`src/components/ui/SatelliteMap.client.tsx` (re-export the new prop type).
**Approach:** Define `MapOverlay` (the brief §13.1 vector|raster union), `LegendModel`, and a `LayerStack`
(ordered, each layer with `id`, `kind`, `visible`, `opacity?`, `zIndex`, `legend`, `provenance`,
`effectiveDate?`, `quality?`). Pure `resolveLayerStack(stack): MapOverlay[]` (filter visible, sort zIndex).
In `SatelliteMap`, add an `overlays?: MapOverlay[]` prop and a new effect that renders **vector** overlays via
`L.geoJSON` into a dedicated FeatureGroup ref (leave a documented seam for `kind:"raster"` → `render.ts`
`leafletBounds` + `L.imageOverlay`, implemented in P3). Do not disturb the existing `blocks`/`editable`
effects.
**Tests:** `resolveLayerStack` ordering/visibility/opacity goldens; `MapOverlay` discriminated-union
type-narrowing. (Component render is manual-QA per repo convention — no jsdom.)
**Depends on:** none (types only).
**Patterns to follow:** `render.ts:112` `leafletBounds`, `SatelliteMap.tsx:471-521` polygon effect.
**Verification:** `npx vitest run test/gis-overlay.test.ts`; `npm run build`.

### Unit 4: Topology review (`src/lib/gis/topology.ts`)

**Goal:** Pure topology findings over a planting + its blocks, in projected metres.
**Files:** `src/lib/gis/topology.ts` (new); `test/gis-topology.test.ts` (new).
**Approach:** `reviewTopology({ planting, blocks })` projects everything to one recentred UTM frame and
returns structured findings, each with a **severity** and area in m²: `BLOCK_OUTSIDE_PARENT`, `SIBLING_OVERLAP`
(block∩block area > sliver floor, via Unit 2 ops), `SLIVER` (component < recorded floor), `UNASSIGNED_AREA`
(planting minus union(blocks) > floor, reported explicitly, never dropped — brief §2.2), `SHARED_BOUNDARY_OK`.
**All findings are `WARN` this phase (user decision, warn-only) — none are save-blocking.** The severity field
still distinguishes mask-breaking findings (`SIBLING_OVERLAP`, `BLOCK_OUTSIDE_PARENT`) from benign ones
(`UNASSIGNED_AREA`) so the UI can style them and **P2 can refuse to compute stats over a mask with an
unresolved mask-breaking finding** (the deferred enforcement). Reuse `signedArea`/`bbox`/`pointInRing` from
`geometry.ts` and the Unit 2 ops.
**Tests:** Brief §19 fixtures — two blocks with an exactly shared boundary (no overlap, no gap); two
disconnected plantings; a planting with a non-vine hole (hole is not a gap); overlapping blocks; gapped
blocks; a narrow sliver. Assert exact finding sets and reconciled areas (planting = union(blocks) +
unassigned).
**Depends on:** Unit 2.
**Patterns to follow:** `coverage.ts` projected-area math; brief §2.3 geometry invariants.
**Verification:** `npx vitest run test/gis-topology.test.ts`.

### Unit 5: Fingerprint + area summaries (`src/lib/gis/geometry-meta.ts`)

**Goal:** Deterministic polygon fingerprint (staleness key, shared with P4) + geodesic/projected area.
**Files:** `src/lib/gis/geometry-meta.ts` (new); `test/gis-geometry-meta.test.ts` (new).
**Approach:** `geometryFingerprint(poly, anchor)`: canonical form (rings winding-normalized via `geometry.ts`,
vertices projected against the **pinned anchor** + rounded to a fixed decimal in recentred metres, rings sorted
by first-vertex) → stable JSON → SHA-256. **The anchor is an explicit argument, persisted in the version row
and folded into the hash** (council S1) so the same shape never hashes two ways. `iou(a, b)` — the
correction-vs-change gate (council Q2): intersection area / union area in projected metres.
`geodesicAreaM2(poly)` (spherical-excess on WGS84) is the **Boundary footprint** shown to users;
`projectedAreaM2(poly)` (`shoelace` over projected rings, holes subtracted) stays **internal** and only
cross-checks the geodesic number (council C4). Neither replaces spacing-based acreage (the **Productive area**).
**Tests:** fingerprint winding/whitespace-invariant, **stable across a WGS84 round-trip with the same anchor**,
changes on a real vertex move; `iou` = 1.0 for identical, ~0.98 for a 10 cm nudge on a 700 m block, low for a
real reshape; 100 m × 100 m square → 10,000 m² ± 0.5%; hole subtraction; geodesic vs projected agree within tolerance.
**Depends on:** Unit 1 (types).
**Patterns to follow:** `p0-tolerance-decision.md` (recentred metres), soil design fingerprint requirement (brief §11.4).
**Verification:** `npx vitest run test/gis-geometry-meta.test.ts`.

### Unit 6: Geometry-version transition (pure) (`src/lib/gis/geometry-version.ts`)

**Goal:** The pure append-only supersede transition + the stale-marking contract (no consumers yet).
**Files:** `src/lib/gis/geometry-version.ts` (new); `test/gis-geometry-version.test.ts` (new).
**Approach:** Pure `planNextVersion({ current, nextGeometry, anchor, reason })` returning one of three
transitions (council Q2): **(a) NO_OP** if the fingerprint is unchanged; **(b) CORRECT_IN_PLACE** if
`iou(old,new) > 0.98` — update the current version's geometry/fingerprint in place, **no** stale cascade, no
version bump; **(c) NEW_VERSION** if `iou ≤ 0.98` — `{ closeRow:{effectiveTo}, appendRow:{version+1, geometry,
fingerprint, anchor, iouFromPrev, effectiveFrom}, subjectUpdate:{geometryVersion, fingerprint} }` **plus**
`markStaleFor(subjectId)`. The IoU threshold is a named constant. Define `StaleDependent` + pure
`markStaleFor` returning dependent product kinds — **empty in P1**, seam + test present (runbook §6). The
persistence side (Unit 8) applies the transition under a subject row-lock + stale-write guard (council S2/S3);
this module is pure and just decides the transition.
**Tests:** unchanged fingerprint → NO_OP; 10 cm nudge (IoU > 0.98) → CORRECT_IN_PLACE, no new row, no stale;
real reshape (IoU ≤ 0.98) → NEW_VERSION with `effectiveTo(vN) == effectiveFrom(vN+1)`, `iouFromPrev` recorded,
`markStaleFor` called (returns `[]` today).
**Depends on:** Unit 5.
**Verification:** `npx vitest run test/gis-geometry-version.test.ts`.

### Unit 7: Planting-area cores (`src/lib/plantingArea/planting-area-core.ts`)

**Goal:** The `*Core` domain logic (reachable from the assistant tool for `verify:ai-native`) for
create / update-geometry / one-block-from-planting / split-into-blocks / assign-block.
**Files:** `src/lib/plantingArea/planting-area-core.ts` (new); `src/lib/plantingArea/data.ts` (serializers);
`test/planting-area-core.test.ts` (new).
**Approach:** Cores take a `tx` + **branded `VineyardPolygon`** inputs (council S6 — convert at the edge) and
orchestrate Units 2/4/5/6: `createPlantingAreaCore` (validate, fingerprint w/ pinned anchor, area, write v1),
`updatePlantingGeometryCore` (validate → `planNextVersion` → apply the CORRECT_IN_PLACE / NEW_VERSION
transition), `oneBlockFromPlantingCore` (block polygon = planting geometry, single-author rule: the block is
now the author — council S5), `splitIntoBlocksCore` (Unit 2 **blade** split → validate each part → create N
blocks sharing exact edges, linked to the planting), `assignBlockToPlantingCore`. Topology (Unit 4) runs to
**produce warnings**, never to reject (warn-only). Serializers mirror `vineyard/data.ts`. All geometry writes
reuse `validateVineyardPolygon`.
**Tests:** each core's happy path + rejection (outside-parent assign refused; split produces reconciling
areas; one-block copies geometry exactly; geometry update bumps version). Pure where possible; tx-touching
cores tested with a fake tx.
**Depends on:** Units 2, 4, 5, 6.
**Patterns to follow:** the `*Core` naming that `verify:ai-native` requires; `vineyard/data.ts` serializers.
**Verification:** `npx vitest run test/planting-area-core.test.ts`; `npm run verify:ai-native` (core reachable once Unit 11 lands, else allowlist temporarily).

### Unit 8: Planting-area server actions (`src/lib/plantingArea/actions.ts`)

**Goal:** `"use server"` actions wrapping the cores in `runInTenantTx` + `writeAudit`, with idempotency keys.
**Files:** `src/lib/plantingArea/actions.ts` (new); `test/planting-area-actions.test.ts` (light, or fold into e2e).
**Approach:** One action per core, each: read `before` → `runInTenantTx((tx) => { core(tx, …);
writeAudit(tx, {...}) })` → `revalidatePath`. Geometry-write actions **row-lock the subject
(`SELECT … FOR UPDATE`) and carry a stale-write guard** (`WHERE geometryVersion = expected`, abort on
mismatch — council C3/S2/S3) before applying the Unit 6 transition, so concurrent tabs / assistant retries /
back-button resubmits can't lose an `effectiveTo` close or a pointer update. Accept an optional
`idempotencyKey` (POF-compatible), no-op on replay. Use the `action(...)` wrapper for actor/ALS like
`vineyard/actions.ts`.
**Tests:** covered by the Unit 12 e2e proof + isolation; a thin action-level test asserts audit rows + version
rows are written and replay is a no-op.
**Depends on:** Unit 7.
**Patterns to follow:** `src/lib/vineyard/actions.ts` (`saveBlockPolygon:318`, `createBlock:180`).
**Verification:** `npm run verify:planting-geometry` (Unit 12); `npm run build`.

### Unit 9: Migration-by-union (proposal + confirm)

**Goal:** Reviewable derivation of proposed parents from existing block polygons, originals untouched.
**Files:** `src/lib/plantingArea/migration-core.ts` (new); actions in `src/lib/plantingArea/actions.ts`;
`test/planting-area-migration.test.ts` (new).
**Approach:** `proposePlantingAreasFromBlocksCore(vineyardId)` — **pre-flight topology FIRST** (council C3):
run Unit 4 over the raw blocks and attach any `SIBLING_OVERLAP` / defects to the proposal so union never
silently "repairs" them. `groupByContinuity` uses the **strict <1 m adjacency rule** (Unit 2) so it **cannot
bridge a road/creek** into one mask; a group that would bridge non-vine land stays separate. `unionPolygons`
each group → proposed parent (meaningful holes preserved), returning proposals with member ids, provisional
names, areas, **and the pre-flight defects**. `confirmProposedPlantingAreasCore(vineyardId, proposals)` is
**all-or-nothing per vineyard** (council Q3): assign every block in the vineyard atomically or save nothing;
persist each parent `source = DERIVED`, `reviewStatus = CONFIRMED`, link `plantingAreaId`, write v1 version +
provenance, set `Vineyard.plantingMigratedAt`, **never mutate source block polygons**. Idempotent.
**Tests:** brief §19 "overlapping/gapped blocks" fixture → the proposal **carries the overlap defect**, not a
silently-healed parent; two blocks 50 m apart across a "road" → **two** proposals, never one bridged parent;
two disconnected plantings → two proposals; **source block polygons byte-identical before/after**; partial
confirm rejected (all-or-nothing); re-run no-op.
**Depends on:** Units 2, 7, 8.
**Patterns to follow:** brief §2.2 "existing users must not redraw everything".
**Verification:** `npx vitest run test/planting-area-migration.test.ts`; reviewed on Demo Winery in Unit 12.

### Unit 10: Map-first setup UI

**Goal:** The brief §2.2 hierarchical workflow surface: draw/import planting → one-block/split/draw-inside →
topology review → (for existing data) migration review/confirm.
**Files:** new client components under `src/app/(app)/vineyards/` (e.g. `planting-setup/PlantingSetupClient.tsx`,
`TopologyReviewPanel.tsx`, `MigrationReviewModal.tsx`) + a route `page.tsx`; wire `SatelliteMap editable` with
the new `overlays` prop for the planting layer. Reuse the existing draw/commit path
(`onPolygonSaved`→action).
**Approach:** Map-first flow (brief §2.2 steps 1–7): draw or import a continuous planting (holes allowed);
choose one-block / **split (draw the blade line → Unit 2 true split, adjacent blocks share the exact edge)** /
draw-inside (Geoman snap). **After a split mints N geometrically-valid blocks, drop the user straight into a
batch-edit table** for variety/clone/rootstock/spacing (council S8 — else the blocks are agriculturally
useless). A topology panel renders Unit 4 findings as **non-blocking warnings** (styled by severity; unassigned
area shown explicitly; saves never blocked — user decision). The **migration modal is all-or-nothing per
vineyard**: it renders each proposed parent as a **bright outline over the satellite basemap** and asks
"does this outline continuous vines, or did we bridge a road?" (council C3/Gemini), surfaces pre-flight overlap
defects, and commits every block or nothing. Planting boundaries render through the Unit 3 layer stack,
visually distinct from blocks. Area shown as **Productive area** (primary) + **Boundary footprint** (secondary,
labeled) per council C4. DESIGN.md tokens; `ux-principles.md` for the layer control.
**Tests:** manual QA on Demo Winery (repo has no jsdom/RTL — UI is manual-QA per convention); pure decision
helpers (e.g. which-workflow-enabled) unit-tested if extracted.
**Depends on:** Units 3, 7, 8, 9.
**Patterns to follow:** `src/app/(app)/reference/VineyardModal.tsx` (existing editable surface),
`MapsClient.tsx` modal pattern, DESIGN.md, `docs/architecture/ux-principles.md`.
**Verification:** `/qa` pass on Demo Winery; `npm run build`.

### Unit 11: Read-only assistant tool + goldens

**Goal:** Planting/block structure Q&A tool(s) satisfying the P1 gate + `verify:ai-native` (core reachable).
**Files:** `src/lib/assistant/tools/describe-planting-structure.ts` (new); `src/lib/assistant/registry.ts`
(import + `ALL_TOOLS` entry); `src/lib/plantingArea/planting-area-core.ts` (add
`describePlantingStructureCore`); `test/evals/assistant-read-tools.golden.ts` (+ cases).
**Approach:** A `kind:"read"` tool wrapping `describePlantingStructureCore(vineyardId)` → the vineyard's
planting areas, member blocks, unassigned blocks, review status, and any open topology findings. This is the
edge that makes the Unit 7 core reachable in `verify:ai-native`'s import graph. Domain-composite (one tool
answering structure questions), not one tool per micro-core (runbook §2.5).
**Tests:** golden read cases ("what planting areas does vineyard X have", "which blocks are unassigned",
"is any block outside its parent"); the structural D26 guard validates against the real registry schema.
**Depends on:** Unit 7.
**Patterns to follow:** `src/lib/assistant/tools/query-cellar-contents.ts`, `registry.ts:31-39,127-216`,
`test/evals/assistant-tools.eval.test.ts`.
**Verification:** `npm run verify:ai-native`; `npx vitest run test/evals/assistant-tools.eval.test.ts`.

### Unit 12: Isolation cases, e2e proof, gate evidence

**Goal:** Close the runbook P1 gate with green proof.
**Files:** `test/tenant-isolation.test.ts` + `scripts/verify-tenant-isolation.ts` (finalize per-table cases
from Unit 1); `scripts/verify-planting-geometry.ts` (new e2e); `package.json` (`verify:planting-geometry`);
`docs/GIS/phases/phase-1-report.md` (new); `docs/GIS/VINEYARD_INTELLIGENCE_RUNBOOK.md` (§7 ledger);
`NOW.md`; a register/ADR note if the boolean-lib decision warrants one.
**Approach:** `verify:planting-geometry` runs on Demo Winery via `runAsTenant("org_demo_winery", …)` with
`QA-*` fixtures: create a planting with a hole → **blade-split into two blocks sharing the exact edge**
(assert zero lost area) → topology shows reconciled area, no overlap → **nudge a vertex 10 cm (IoU > 0.98) and
assert CORRECT_IN_PLACE (no new version, no stale)** → **reshape a boundary (IoU ≤ 0.98) and assert a new
version appended, old retained, stale hook fired** → run **all-or-nothing migration** on a second fixture
vineyard, assert overlap defect surfaced + no road-bridging + source polygons byte-identical → clean up; keep
`verify:naming` green throughout. Write the phase
report (gate table + evidence), flip the ledger row to 🟩, update `NOW.md`.
**Depends on:** all prior units.
**Patterns to follow:** `verify:ttb`/`verify:soil`/`verify:excise` e2e style; `phase-0-report.md` format.
**Verification:** `npm run verify:planting-geometry`; `npm run verify:tenant-isolation`; `npm run verify:naming`;
`npm run verify:ai-native`; full `npx vitest run`.

## Test Strategy

**Unit tests (pure, deterministic, no DB/provider):** `test/gis-boolean.test.ts`, `gis-topology.test.ts`,
`gis-geometry-meta.test.ts`, `gis-geometry-version.test.ts`, `gis-overlay.test.ts`, `planting-area-core.test.ts`,
`planting-area-migration.test.ts` — all keyed on the brief §19 fixtures, hand-computed expected areas within
`ε_agree`. Reuse P0 fixture coordinates where they exist.
**Integration / DB (gated):** `TENANT_ISOLATION_DB=1` isolation cases for both new tables; the
`verify:planting-geometry` e2e proof on Demo Winery.
**Assistant:** golden read cases + the structural D26/coverage guard (`verify:ai-native` + the eval test).
**Manual verification (Demo Winery, `QA-*` only):** the brief §19 E2E slice for this phase — open a vineyard,
create/review multiple continuous plantings, split one into adjacent blocks passing topology, confirm planting
totals reconcile with non-overlapping block coverage, run migration-by-union and confirm originals untouched,
edit a boundary and see the version supersede (not rewrite). Clean up; `verify:naming` green before and after.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| JSTS geometry robustness / API learning curve on real vineyard geometry | LOW | HIGH | JSTS's `GeometryPrecisionReducer` + `OverlayNG` is the robust JTS model (council C1); still feed recentred UTM + re-validate every output ring; heavy goldens on shared-boundary/sliver + the council S10 failure cases; kernel isolated behind `boolean.ts` so a swap touches one file. |
| `jsts` dependency weight / supply-chain surface | LOW | MED | One scoped dep behind `boolean.ts`; record in ADR; tree-shake / dynamic-import on the client. |
| Warn-only topology lets broken mask geometry reach P2 (user decision) | MED | MED | **Accepted tradeoff.** Findings carry severity; P2 re-validates the mask and refuses stats over an unresolved mask-breaking finding; recorded in the phase report + carried to the P2 plan + security/scale register. |
| `plantingAreaId` nullable leaves "orphan blocks" ambiguous | LOW | LOW | All-or-nothing per-vineyard migration + `plantingMigratedAt` gate; MATCH SIMPLE null-skip is leak-safe (council C4); global NOT-NULL enforcement tracked as a follow-up. |
| True line-split fails when the blade doesn't fully cross | LOW | MED | Extend the line to the boundary before noding; reject a non-crossing blade with a clear code (council S10 golden); no corridor means no gap by construction. |
| Promoting block `polygon` to "canonical" changes a consumer's assumption | LOW | MED | Grep confirms only `serializeBlock` + `SatelliteMap` read it and both pass it through; change is semantic + additive columns, stored bytes unchanged. |
| Schema slice PR conflicts with parallel P4/POF schema slices | LOW | MED | Serialize the schema-slice PRs across Wave-1 lanes (runbook §4); P1's tables are net-new + one nullable column, so conflicts stay trivial. |
| UI scope creep into P2/P4 territory | MED | MED | Hard scope boundary above; P1 renders vector overlays only; the raster seam in `SatelliteMap` is documented but unimplemented. |

## Success Criteria

- [ ] `VineyardPlantingArea` + `VineyardGeometryVersion` land with the full Phase-12 checklist; both new
      tables pass the RLS-coverage guard and per-table isolation cases.
- [ ] JSTS union/difference + **true line-split** (shared exact edge, zero lost area) + topology review pass
      the brief §19 fixtures and the council S10 failure cases within `ε_agree`.
- [ ] Migration is all-or-nothing per vineyard, surfaces pre-flight overlap defects, never bridges a >1 m gap,
      and leaves source block polygons byte-identical.
- [ ] A real boundary edit (IoU ≤ 0.98) appends a new version and retains the prior one; a trace correction
      (IoU > 0.98) updates in place with no stale cascade; the stale hook fires on the former (returns `[]` this phase).
- [ ] "Productive area" (spacing) is primary and "Boundary footprint" (geodesic) secondary; projected area stays internal.
- [ ] `MapOverlay` layer-stack contract lands additively; planting boundaries render as a distinct layer.
- [ ] Read-only planting-structure assistant tool + goldens; `verify:ai-native` green.
- [ ] `verify:planting-geometry` e2e green on Demo Winery; `verify:naming` and `verify:tenant-isolation` green.
- [ ] Migration flow reviewed end-to-end on Demo Winery (`/qa`); no Bhutan data touched.
- [ ] All tests pass; no regressions; runbook §7 ledger + phase report + `NOW.md` updated.

## Sequencing & parallelism

- **Unit 1 ships as its own PR first** (schema-first slice; serialize against parallel P4/POF slices).
- Units **2 and 3** are independent pure modules and can run in parallel right after (or alongside) Unit 1.
- Units 4→5→6 chain on the geometry foundation; 7→8→9 chain on those; 10 needs 3/7/8/9; 11 needs 7; 12 last.
- Lane disjointness holds: P4 is cards-only (no map components), POF is app-wide/generic; the only shared
  file is `prisma/schema.prisma`, handled by the schema-slice ordering.
