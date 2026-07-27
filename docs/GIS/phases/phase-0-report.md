# Phase 0 report — prove or kill the no-worker architecture

**Date:** 2026-07-24 · **Branch:** `spike/vi-p0-no-worker` · **Plan:** [094](../../plans/2026-07-24-094-spike-vineyard-intelligence-p0-plan.md)
**Council:** [feedback](../../plans/council-feedback-094-vineyard-intelligence-p0.md) · **ADR:** [0009](../../architecture/decisions/0009-vineyard-intelligence-no-worker-architecture.md)

## Verdict: GO

The no-worker architecture is proven and adopted. Wave 1 (P1 ⚡ P4 ⚡ POF) is unblocked.

## Gate evidence

Runbook §5 lists seven gate items. Each has an artifact.

| gate item | evidence |
|---|---|
| fractional stats match an independent tool within a documented tolerance | [p0-validation-coverage](p0-validation-coverage.md) — 292 cells, max 2.95e-8 |
| shared-boundary blocks don't double-count | same, plus `test/gis-fixtures.test.ts` reconciling children to parent pixel-by-pixel |
| degenerate fixtures pass or their rejection is documented | `test/gis-fixtures.test.ts` — five refused with distinct codes, one accepted with reasoning |
| clipping library + tolerance recorded in an ADR | [ADR 0009](../../architecture/decisions/0009-vineyard-intelligence-no-worker-architecture.md) + [p0-tolerance-decision](p0-tolerance-decision.md) |
| live round-trip measured | [p0-live-roundtrip](p0-live-roundtrip.md) — real scene, full provenance |
| written go/no-go in runbook §3 + an ADR | runbook §3 and ADR 0009, both updated |
| layer-stack contract sketched | promoted to a working transform AND proven in a real browser: `src/lib/gis/render.ts`, 12 tests, [p0-render](p0-render.md) |

## What shipped

Sixteen units across 13 commits. Pure math modules under `src/lib/gis/` (geometry, projection,
coverage, zonal, ndvi, color, smooth, render) plus the CDSE adapter, ~190 tests, four verify scripts
and five measurement reports. One runtime dependency added (`proj4`), scoped to the spike.

## Measurements

At realistic scale — ~50 ha estate, 20 blocks, all six kill criteria pre-committed in code before any
number was taken:

| criterion | measured | limit |
|---|---|---|
| compute excl. provider | **390 ms** | 5,000 |
| total incl. provider | **2,543 ms** | 10,000 |
| peak RSS | **451 MB** | 512 |
| 10× vertices cost | **5.3×** | 20× |
| 10× blocks cost | **1.5×** | 15× |
| stored raster | **0.73 MB** | 50 |

Live scene: 342×342 px, 767 KB in 2,153 ms, 0.892 PU, 80.8% valid after SCL masking, block NDVI means
spanning 0.281–0.709.

## The five things that would have gone wrong

1. **`harmonizeValues` does the opposite of what runbook §2.13 said.** The rule's intent was right and
   its mechanism wrong. The first draft of the plan would have shipped a contract test that
   *guaranteed* corrupted data. Rule §2.13 is now corrected in place.
2. **The processing baseline is not in the Process API.** Recording `serviceVersion` as the baseline
   would have been silently wrong. It needs a second STAC call.
3. **The free tier binds on requests, not processing units** — by ~26×. That reshaped the fetch into
   one estate-wide raster, which the measurements then showed is also the cheap shape (10× blocks
   costs 1.5×).
4. **The weighted type-7 quantile estimator ignores its weights.** It reduces beautifully to type-7 at
   equal weights and returns a median of 50.5 for `[value 1 weight 9, value 100 weight 1]`. Replaced
   with the midpoint form, at the documented cost of being type-5 rather than type-7 at equal weights.
5. **`resx: 10` under CRS84 asks for 10 degrees.** Found only by making the call. Pinning the native
   10 m grid requires a metric CRS, now correct by construction.

## Deviations from the plan

- **Unit 13 was promoted from a sketch to working code AND proven in a real browser**, on Gemini's
  council argument that the display half is part of the hypothesis. Running it in a real browser
  (jsdom cannot answer this - no rasteriser, no compositor) found a genuine performance bug worth
  ~6x: `colorAtNormalized` allocated an array per pixel, costing **910.9 ms** of main-thread block
  at estate scale. Fixed with a palette LUT; now **151.1 ms**. See [p0-render](p0-render.md).
- **`exactextract` and `tifffile` are dev-only Python tools**, not npm dependencies. Runtime
  dependency count went 22 → 23 (`proj4` only).
- **Assistant coverage remains deferred to P2**, as planned. P0 exposes no user-facing capability.

## Lessons that change later phases

- **The display half has its own ceiling.** A 500 ha estate blocks the main thread for ~2.1 s, of
  which ~60% is `percentileDomain` materialising one object per sample. The typed-array quantile path
  is the cheapest P1/P2 win. Use `toBlob` + `createObjectURL`, never `toDataURL`, which blocks
  synchronously for its whole encode.
- **Memory, not time, is the constraint.** 451 MB against a 512 MB limit is the tightest number in the
  set. P2 should treat any estate above ~2M pixels as the point where streaming replaces
  hold-it-whole. Tripwire recorded in the scale-register.
- **P2 inherits the estate-wide fetch shape.** `SpatialScene` should key on estate + date, not block +
  date.
- **The oracle is coarser than we are.** `exactextract` computes coverage in float32; our float64
  clipper is more precise than the tool validating it. Any future tolerance against it is bounded
  below by ~1.2e-7, and the 1e-9 gate the research proposed is unreachable in principle.
- **CDSE STAC was intermittently 500ing** during the live run (56–220 s with retries) while the
  Process API stayed at ~2 s. P2's scene-selection UX should not assume STAC is fast.

## Follow-ups

- `test/compliance-fill-pdf.test.ts` is a pre-existing flake (4.19 s against a 5 s timeout), unrelated
  to this work, being fixed separately.
- P1 may remove `proj4` once the clipper is proven in production use; the option is recorded in ADR 0009.
