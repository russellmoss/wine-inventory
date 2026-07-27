# ADR 0009 — Vineyard Intelligence runs without a geospatial worker

- **Date:** 2026-07-24
- **Status:** accepted
- **Plan:** `docs/plans/2026-07-24-094-spike-vineyard-intelligence-p0-plan.md` · **Council:** `docs/plans/council-feedback-094-vineyard-intelligence-p0.md`
- **Evidence:** `docs/GIS/phases/p0-*.md` (tolerance decision, coverage validation, statistics validation, live round-trip, measurements)

## Context

Every phase of Vineyard Intelligence (P1–P7) sits downstream of one bet: that a vineyard is small
enough that we never need a geospatial worker. A 50 ha vineyard at Sentinel-2's 10 m resolution is
~5,000 pixels. If true, the provider does the raster work, the math is pure TypeScript over a small
in-memory array, and there is no queue, no GDAL, no COG pyramid, no tile server, no PostGIS. If false,
we need the brief §13 worker stack, and P1's planting geometry — the parent analysis mask everything
else references — should be shaped differently from day one.

The runbook made P0 a solo gate for exactly that reason, and flagged that the real risk was **geometry
robustness, not the serverless budget**. That framing was correct.

## Decision

**GO on the no-worker architecture.** Three sub-decisions come with it.

**1. Clipping: hand-rolled Sutherland–Hodgman, zero new runtime dependencies.**

Fractional coverage is not general polygon–polygon boolean. It is polygon ∩ axis-aligned rectangle,
once per pixel — a *convex* clip window, which is Sutherland–Hodgman's exact precondition, with no
ring-reassembly step. The `Unable to complete output ring` failure class that dogs the
martinez-lineage libraries therefore has no analogue. Both council reviewers confirmed this
independently, including the re-entrant case.

Two preconditions make it true, and both are enforced:
- **ULP:** the clip must *assign* the exact edge scalar, never interpolate it. Otherwise a U-shaped
  polygon's zero-width bridges stop being collinear and area leaks **silently**.
- **Validity:** self-touching and self-intersecting rings are refused upstream, because signed area is
  algebraic rather than geometric for them and cancels to a confident wrong answer.

**2. Working CRS: the scene's UTM zone, recentred on the AOI. ε_geom = 1 µm.**

Coverage is a ratio of *areas* and Sentinel-2 pixels are square only in UTM, so degrees are not merely
imprecise, they are wrong. Recentring buys a measured **8,190×** of float64 headroom for one
subtraction.

**3. `proj4` is added, scoped to the spike.** 22 → 23 runtime dependencies.

## Why (and what we rejected)

**Rejected: `polyclip-ts` / `polygon-clipping` / `@turf/intersect`.** A general boolean engine is the
wrong shape for per-pixel coverage: one library call per pixel, ~5,000 per block, each allocating.
Worse, `polyclip-ts`'s `setPrecision` is process-global with snap trees that are never reset, is 3–5×
slower when set, and a *larger* epsilon can make failures worse because an absolute-tolerance
comparator is not a valid total order yet is used to order a splay tree. `jsts` is the named fallback
if the hand-rolled clipper ever fails, since it has a real `PrecisionModel` and no WASM cold start.

**Rejected: hand-rolling UTM.** Both reviewers called it a false economy *for this phase*: the spike's
entire output is a correctness verdict, and two unproven things in one measurement means a projection
bug at the validation gate is indistinguishable from a clipper bug. **P1 may remove `proj4`** once the
clipper is proven; that option is recorded here so it is not lost.

**Rejected: the first draft's tolerance design.** It used one epsilon for both the clipper's internal
snapping and the agreement threshold against the oracle, which made validation circular. They are now
separate: ε_geom fixed a priori, ε_agree derived from observation.

## Consequences / at scale

**What this makes easy.** No queue, no worker deployment, no COG tooling, no tile server. The math
modules are pure and node-testable, and they survive a future flip to the worker architecture
unchanged — which is why rule §2.4 exists.

**Measured, at realistic scale (~50 ha estate, 20 blocks):**

| criterion | measured | limit |
|---|---|---|
| compute excl. provider | **390 ms** | 5,000 ms |
| total incl. provider | **2,543 ms** | 10,000 ms |
| peak RSS | **451 MB** | 512 MB |
| 10× vertices cost | **5.3×** | 20× |
| 10× blocks cost | **1.5×** | 15× |
| stored raster | **0.73 MB** | 50 MB |

Independently validated: **292 cells cell-by-cell against `exactextract`**, max disagreement 2.95e-8,
of which **every single non-zero difference is the oracle's own float32 quantisation** — our float64
clipper is more precise than the tool checking it.

**What this makes hard, and the tripwire.** Peak RSS at **451 MB against a 512 MB limit** is the
tightest number in the set, and it is driven by the 500 ha stress case rather than realistic scale.
**Memory, not time, is what will kill this architecture.** See [[scale-register]].

**Fetch shape is part of the decision.** One estate-wide raster per date, clipped N ways in memory,
not one request per block. The free tier binds on **requests** (10,000/month), not processing units —
a 50 ha 3-band FLOAT32 request costs ~0.038 PU, so requests bind ~26× sooner. The measurements
confirm the shape is also cheap: 10× the blocks against one raster costs 1.5×.

## Verification

- `npm run verify:gis-coverage` — per-cell coverage vs `exactextract` (Unit 5 gate)
- `npm run verify:gis-stats` — weighted mean / count / min / max vs `exactextract` (Unit 9 gate)
- `npm run verify:gis-live` — live estate-wide round-trip with full provenance (Unit 11)
- `npm run verify:gis-measure` — blob behaviour + the runtime sweep against pre-committed kill criteria
- `npm test` — the pure-math goldens (geometry, projection, coverage, zonal, NDVI, colour, render)

`exactextract` is a dev-only tool: `python3 -m pip install --only-binary :all: exactextract numpy tifffile`.
