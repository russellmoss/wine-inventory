# Council Feedback — P2 NDVI Core

**Date:** 2026-07-25
**Plan:** [phase-2-ndvi-core-plan.md](phase-2-ndvi-core-plan.md)
**Reviewers:** Codex `gpt-5.4` (correctness + exactly-once + schema; `gpt-5.4-pro` crashed, retried on `gpt-5.4`), Gemini `gemini-3.1-pro-preview` (remote-sensing correctness + product)

The two converged on three things independently: the **schema doesn't encode the immutability model**, the
**memory budget is too close to the wall to leave implicit**, and the **job is not actually exactly-once for
the expensive side effects**. Those plus the scene-selection UX are the load-bearing changes.

## Critical issues (both reviewers)

### C1 — The job is at-least-once fetch, not exactly-once (Codex #2, Units 4/6)
"Query-before-write: a dataset already exists ⇒ adopt" only dedupes **after** a second sweep has already
done the external fetch (double request-spend in a request-bound quota model) and is racing a blob PUT;
`blobSha256` dedup is post-hoc and racy (both learn the hash only after download). CDSE took 135 s live and
`maxDuration` is 300 s, so a lease expiring mid-fetch is a real double-claim.
→ Fix: define a **dataset identity key up front** = `tenantId + vineyardId + providerSceneId + recipeHash`
(recipeHash = harmonizeValues + mask policy + resampling + algorithm version), UNIQUE-constrained. Create an
**in-flight placeholder dataset row before** the external fetch; a second claimant that sees an active row
backs off. Use a **deterministic blob key** derived from that identity, not the sha256. Call it honestly:
"at-least-once fetch, idempotent materialization." Also (Codex Q10): set the **lease > 300 s + finalize
slack** (or heartbeat-renew) so a healthy long fetch isn't reclaimed mid-run.

### C2 — Schema doesn't encode immutability / can't hold two geometry versions (Codex #4)
`SpatialDataset` has no identity unique key even though the schema already admits recipe variation
(harmonizeValues, resampling, mask, future algo). `BlockSpatialMetric`'s unique
(`tenantId,blockId,datasetId,metric`) **omits geometryVersion/fingerprint**, so a boundary change cannot
coexist with a recompute against the same immutable dataset — a conflict. `geotransform Json` is too weak for
a safety-critical spatial contract.
→ Fix: add the dataset identity unique key (above); **include `geometryFingerprint` in the
`BlockSpatialMetric` uniqueness** (or a current/superseded model); store **typed geotransform fields** (or a
versioned+validated JSON shape). This dovetails with C3.

### C3 — "Stale" is the wrong semantics for a time series; never hide history (Gemini C3, Unit 5)
The whole product is the trend ("how are patterns changing"). Marking 5 years of NDVI "stale" when a manager
nudges a boundary 3 m to exclude a road destroys the value prop, and recomputing 100 scenes on a nudge is
infeasible. Remote-sensing metrics are **immutable snapshots in time**.
→ Fix: a `BlockSpatialMetric` is permanently bound to the `geometryVersion` it was computed against and stays
valid **for what the block was then**. `markStaleFor` becomes an **annotation event, not a hide/delete** —
old metrics are still served; P3 draws a "boundary change" marker on the time-series axis. (Compatible with
runbook §6 "never silently rewrite" — it just clarifies stale ≠ invalid.) Combined with C2, geometryVersion in
the metric key lets v3 and v4 metrics coexist.

### C4 — Scene-selection whack-a-mole wastes the manager's time (Gemini C1 + Codex #5/Q9, Units 3/4)
Ranking by tile-level `eo:cloud_cover` (a 100×100 km tile at "12%" can be 100% cloudy over a 50 ha vineyard —
clouds cluster) and only checking real per-block coverage after the async job = "pick → wait → WITHHELD → pick
#2 → wait" infuriating loop.
→ Fix: **auto-advance the top-N candidates within one logical attempt** before surfacing failure. Do the
**free checks first** (footprint containment of the AOI in the scene, edge-of-tile risk, provider nodata
metadata). Reserve the **1-band SCL-over-the-tiny-AOI preflight** for the ambiguous band — Codex's caution:
running SCL preflight for *every* scene doubles request count in a request-bound quota, so gate it (ambiguous
cloud% or auto-add mode), don't run it blanket.

### C5 — Missing validity floor → statistically biased means (Gemini C2, Unit 5)
An 85%-shadowed block computes its mean from the 15% visible pixels (maybe just the hilltop) — mathematically
correct, agronomically misleading, and irrigation decisions ride on it. "A biased mean is worse than no data."
→ Fix: a hard **`minValidFraction` floor** (default ~0.5). Below it, `BlockSpatialMetric` yields `null` for
mean/median/quantiles and sets a quality flag `INSUFFICIENT_VALID_COVERAGE` — never let a 15%-coverage mean
masquerade as a block mean.

### C6 — geotiff.js value-equality gate is insufficient (Codex #1/#6, Unit 2)
Matching decoded values vs Python `tifffile` proves pixels, not the **geospatial contract** the clipper needs
(affine/origin/resolution/axis-sign/EPSG). And geotiff.js defaults are traps.
→ Fix: the decoder contract must be explicit and fully tested: assert `width/height`, band order, **each band
is a `Float32Array`**, **non-interleaved reads** (`readRasters` interleave), the **georeferencing** (origin,
resolution, axis sign, `crsEpsg`, bbox) against the fixture, **`samplesPerPixel === 3` from our own evalscript
provenance** (don't infer from photometric tags), an explicit **BigTIFF policy** (reject or test), a
**tiled-vs-stripped** policy, and **prove no decode worker-pool** spins up in serverless Node.

## Design questions (need your decision)

### Q1 — Scene-selection failure contract: how many candidates auto-tried, and is SCL preflight worth the request?
Auto-advance the top-N candidates before surfacing WITHHELD (recommend **N=3**), with free footprint checks
first and a **gated** 1-band SCL preflight (only when tile cloud% is in an ambiguous band, e.g. 10–40%, or in
auto-add). Or: cheapest possible — no SCL preflight, just footprint + rank, and accept the occasional
after-fetch WITHHELD. Your call on how much request budget to spend to make selection feel instant vs honest.

### Q2 — Immutable metrics + geometryVersion in the key (C2+C3 combined)
Adopt the "metrics are immutable snapshots, never hidden on a boundary edit; geometryVersion in the uniqueness
so versions coexist; markStaleFor annotates rather than invalidates"? This is the recommended remote-sensing-
correct model and it revises the P1 hand-off's "mark dependents stale" toward "annotate, keep serving."

### Q3 — minValidFraction floor value
Default **0.5** (withhold block stats below half-valid, flag it)? Or stricter (0.75 — high-end growers) / looser
(0.3)? Configurable per tenant later either way.

### Q4 — Compute block metrics inline in the job, or as a separate reload stage? (Codex #8)
The plan reloads the raster from blob for U5. Codex: you already hold the decoded raster in U4's request and
already paid the memory, so **compute metrics inline** (same pass, before releasing arrays) — avoids a second
blob read. Recommended. Tradeoff: U5 stops being an independently-replayable stage (you'd re-fetch/re-decode to
recompute). Keep the block-metrics *core* separate for testing either way.

## Suggested improvements (fold in; no decision needed)

- **S1 — Memory as a first-class acceptance criterion (Codex #3).** Decode banded, **release the source TIFF
  bytes immediately**, compute NDVI in place, **drop red/nir once NDVI exists**, run block stats
  **sequentially with accumulator reducers** (never 20 sample arrays at once). Tripwire on **measured peak
  bytes**, not raw pixel count (hidden copies are the danger).
- **S2 — Date-drift honesty (Gemini S4).** Schema separates **`requestedDateTarget` vs `actualAcquiredAt`**;
  U10 shows the offset ("Acquired Jun 5, target Jun 15, −10 d"); the time axis is always `actualAcquiredAt`.
- **S3 — Mask-dilation provenance (Gemini S5).** SCL misses thin cloud "halo" edges; standard practice dilates
  the cloud/shadow mask. P2 won't (complexity), so **declare `maskDilation: 0` in the `SpatialDataset`
  provenance** explicitly (a Later improvement), so the number is reproducible/explainable.
- **S4 — Store the weighted-mean denominator (Gemini Q7).** `effectivePixelCount` = Σcoverage is a **float**
  (e.g. 42.6 px) — store it as Decimal, not Int, so the coverage-weighted mean is reproducible; clearly label
  stored stats as coverage-weighted, not naive pixel means.
- **S5 — WITHHELD needs a typed reason (Codex #7).** Persist a `withheldReason`/fault class (quota-exhausted vs
  selection-miss vs low-coverage); the sweeper must **not reclaim a quota-withheld job until the next billing
  window**. `CdseUsageCounter` gets non-null zero defaults; PU-unknown-on-failure nullability lives at the
  attempt/event level, not the month aggregate.
- **S6 — Counter accounts billable attempts (Codex #11).** `CdseUsageCounter` counts **billable provider
  attempts** (quota protection), not successful datasets — write the rule in the schema comment.
- **S7 — Composite-parent uniques explicit (Codex #12).** `SpatialDataset` and `SpatialScene` (as FK targets
  for metrics/datasets) need `@@unique([tenantId, id])`; keep enum `CREATE TYPE` isolated before dependents.
- **S8 — Topographic-shadow watch (Gemini Q6).** SCL mislabels steep-terrain shadow as cloud shadow → permanent
  data loss on hilly blocks (the live **Bhutan** tenant). Keep the SCL mask policy in provenance and track
  `effective` vs `valid` so an always-failing block is detectable; an estate-level override is a Later item.

---

## Raw response — Gemini (gemini-3.1-pro-preview)
CRITICAL: (1) scene-selection whack-a-mole — tile eo:cloud_cover ≠ AOI cloud; the async job should SCL-prefetch
the estate bbox (1 tiny band) and auto-advance candidates, logging selectionReason. (2) missing validity floor —
an 85%-shadowed block's 15%-pixel mean is biased; add minValidFraction (~0.5) → null stats +
INSUFFICIENT_VALID_COVERAGE. (3) boundary tweaks must NOT stale historical metrics — immutable snapshots bound to
geometryVersion, served as-is, P3 marks the boundary change on the trend. SHOULD FIX: (4) separate
requestedDateTarget vs actualAcquiredAt, show the offset, X-axis = actual. (5) record maskDilation (SCL halo
effect; P2=0, declare it). DESIGN Q: (6) topographic shadow false-positives on hilly sites; (7) store Σweights /
effectiveCount as float so the weighted mean is reproducible.

## Raw response — Codex (gpt-5.4; gpt-5.4-pro crashed)
CRITICAL: (1) tifffile value-equality insufficient — test georeferencing/affine/axis/EPSG, assert Float32Array +
non-interleaved, no worker pool, tiled-vs-stripped policy. (2) NOT exactly-once — adopt a dataset identity key
(tenant+vineyard+scene+recipeHash) + in-flight placeholder before fetch + deterministic blob key; "at-least-once
fetch, idempotent materialization"; lease > 300 s or heartbeat. (3) memory too close to the wall — banded decode,
release source bytes, NDVI in place, drop red/nir, sequential block reducers, tripwire on peak bytes. (4) schema
doesn't encode immutability — dataset identity unique key; geometryFingerprint in BlockSpatialMetric uniqueness;
typed geotransform. SHOULD FIX: (5) selection failure surfaced too late — auto-advance top-N, free checks first,
gate the SCL preflight (blanket doubles requests). (6) assert band contract from own provenance +
samplesPerPixel==3, explicit BigTIFF policy. (7) typed WITHHELD reason; sweeper doesn't reclaim quota-withheld
till next window; non-null counter defaults. (8) compute block metrics inline (raster already in memory) instead
of reloading from blob. DESIGN Q: (9) define N for auto-exhaust; (10) lease vs 300 s ceiling (heartbeat or
lease > timeout+slack); (11) counter = billable attempts vs successful datasets (pick one); (12) composite-parent
uniques for K11 spelled out.
