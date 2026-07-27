# Council Feedback — Vineyard Intelligence P0 spike (plan 094)

**Date:** 2026-07-24
**Plan:** `docs/plans/2026-07-24-094-spike-vineyard-intelligence-p0-plan.md`
**Reviewers:** Codex (`gpt-5.4-mini` — ⚠️ fallback; `gpt-5.4-pro` failed), Gemini (`gemini-3.1-pro-preview`)
**Plus:** an external research pass (CDSE / clipping libraries / exactextract / Vercel Blob / Sentinel-2)
that landed *after* the plan was written and contradicts several of its premises.

**Verdict:** both reviewers independently say **do not run this plan as written** — it could bless a
wrong architecture. Neither attacks the core idea; both attack the *instrument*. Six changes fix it.

---

## The headline result: the Unit 3 reframe is CORRECT — and both models found the precondition it omits

Both reviewers independently confirm that Sutherland–Hodgman against a convex pixel rectangle,
followed by signed shoelace, gives **exact** fractional coverage. That was the load-bearing claim, and
it survives. But each found a different precondition the plan failed to state, and **both are
required**:

**Gemini — the ULP proof (the sharpest finding in either review).** The U-shape case (a polygon that
enters, leaves, and re-enters one pixel) produces a single ring with zero-width bridges walking the
pixel edge. Shoelace cancels those bridges *exactly* — traversing A→B and later B→A are anti-parallel
vectors on the same mathematical line, so ∫y·dx sums to zero. **But only if the two traversals use
bit-identical coordinates.** If the clipper computes the boundary intersection with a lerp
(`x = x1 + (x2-x1)*t`), the forward and return bridges differ by ±1 ULP, cancellation fails, and area
leaks. **Fix:** when clipping against the right edge, `intersect.x` must be *assigned* `pixel_max_x`
exactly — no arithmetic — and only the other coordinate is computed. Same for all four edges.

**Codex — validity preconditions.** For *valid* (simple, OGC-conformant) rings, signed-area hole
subtraction is correct in all three configurations probed — hole inside the pixel, hole straddling a
pixel edge, hole whose clipped remnant is empty. Holes are not the problem. The problem is that the
plan **does not reject the invalid inputs that make the signed-area model meaningless**:
self-intersecting rings, self-touching rings, and holes touching or extending outside the shell. For
those, signed area is *algebraic, not geometric*, and can cancel to a confidently wrong answer.
"Pass the degenerate fixtures **or** document rejection behavior" is too loose — it leaves room for
quiet wrongness.

**Consequence for the dependency decision:** both reviewers say drop `polyclip-ts`. Gemini is blunt —
general boolean is the wrong algorithm and allocates heavy garbage (~5,000 BigNumber-allocating
library calls per block). The external researcher's own B7 note concedes the same point even while its
B8 recommends the library. Adjudicated: **zero-dep S-H stands**, with the two preconditions enforced.

### A deeper library pass strengthened this considerably

A second research pass read the actual source of every candidate and surfaced three facts that make
the library route worse than it looked, and one technique that makes ours better:

- **`polyclip-ts`'s `setPrecision` is process-global mutable state, and its snap trees are never
  reset.** `Operation.run()` has no equivalent of `polygon-clipping`'s `rounder.reset()`, so every
  coordinate ever passed in accumulates in two splay trees for the process lifetime — and coordinates
  from an earlier `intersection()` can snap coordinates in a later one. In a per-pixel loop over
  thousands of calls that is both a memory leak and a **correctness coupling across calls**. It is also
  shared with Turf in the same module instance.
- **Setting *any* precision takes a much slower path** — a Turf issue reports 2–3 s → 10 s, *"it didn't
  matter what precision I set."*
- **A larger epsilon can make things worse, not better.** An absolute-tolerance comparator is not a
  valid total order (a≈b, b≈c, but a≢c), and it is used as the ordering function for a splay tree —
  so widening the tolerance widens the non-transitive band and can corrupt tree ordering. One report
  needed `1e-13` where `1e-8` still failed. This inverts the intuition that a forgiving epsilon is
  the safe default, and it is a strong argument against betting a correctness verdict on a tunable
  library epsilon at all.
- **Recentre coordinates near the origin before clipping** — the single cheapest numerical win
  available, and neither council model mentioned it. Translating so the block centroid sits near
  `(0,0)` collapses coordinate magnitude from ~1e6 to ~1e2 and buys **~4 decimal digits of float64
  headroom for free**. This belongs in Unit 2 alongside the UTM projection.

**Fallback correction:** the plan named `polyclip-ts` as Unit 3's fallback. On this evidence it is the
wrong fallback. If S-H fails, the better escape is **`jsts`** — the only pure-JS option with a real
`PrecisionModel` + `GeometryPrecisionReducer` + snap-rounding overlay ("quantize to a grid, then
overlay" is the textbook answer to raster-cell clipping), and it has no WASM cold-start cost. Its
bundle size is unverified and its API is verbose, but as a *fallback* those matter less than having a
principled precision model.

**And a warning that reinforces the area-conservation check:** sliver and dropped-ring bugs in this
whole library family are frequently **silent** (`polygon-clipping` #94/#169/#57/#87, `polyclip-ts`
#22/#12 all report wrong geometry with no error). As the researcher puts it, a thrown error is the
*good* outcome. That is exactly why `Σ coverage × pixel_area ≈ polygon_area` must be an asserted
invariant and not merely a nice-to-have.

---

## Critical Issues

### C1 — `harmonizeValues` does the opposite of what the plan (and runbook rule §2.13) assumes
**Units 6, 9. This invalidates the plan's headline contract test.**

Confirmed against CDSE docs: in **REFLECTANCE** units, Sentinel Hub applies the BOA_ADD_OFFSET
**regardless** of `harmonizeValues`. The flag's only effect there is whether negative reflectance is
**clamped to zero**. Its offset-harmonisation role applies to **DN** units. Evalscripts default to
REFLECTANCE for S2 optical bands, so a default request is *already* baseline-safe.

Worse: `harmonizeValues: true` (the default) clamps negatives to zero, so a clamped `B04 = 0` drives
`NDVI = (B08−0)/(B08+0) = exactly 1.0`. As Gemini puts it, the plan currently proposes a contract test
that **guarantees corrupted data**.

**Fix:** the real baseline guard is pinning `units: "REFLECTANCE"`, not `harmonizeValues`. Pin
`harmonizeValues: false` so negatives are visible, and handle them explicitly in Unit 6 — which is
exactly what brief §5 already demands ("Do not silently add epsilon everywhere. Explicit no-data
behavior is easier to test and explain"). Treat `NDVI === 1.0` as a sentinel, not a measurement.
**This also means runbook rule §2.13 states a wrong reason and needs correcting** — its *intent*
(cross-date comparability) is right, its stated mechanism is not.

For scale, the un-harmonised error is catastrophic and **non-constant**, so it cannot be calibrated
out after the fact:

| Canopy | True NDVI | Un-harmonised | Error |
|---|---|---|---|
| Vigorous vine | 0.875 | 0.618 | **−0.257** |
| Mid canopy | 0.750 | 0.500 | −0.250 |
| Bare soil | 0.200 | 0.143 | −0.057 |

The error is largest exactly in the high-vigour range the product exists to measure.

### C2 — The free-tier ceiling is REQUESTS, not processing units, and it reshapes the architecture
**Units 9, 10, 12.**

Free tier: **10,000 requests/month** and 10,000 PU/month. A 50 ha 3-band FLOAT32 request costs
**≈0.038 PU** — so 10,000 requests would spend only ~380 of 10,000 PU. Requests bind first, by ~26×.

A per-block fetch pattern burns 50 requests per observation date on a 50-block estate — 0.5% of the
monthly quota for one look. One **estate-wide** 500×500 raster costs ~1.9 PU and **one** request.

**Fix:** the no-worker architecture should fetch **one estate-wide raster** and clip all N blocks
against it in memory. That is not a footnote — it changes what Unit 12 must measure. The real load is
"N blocks clipped against one in-memory raster," which is precisely the hypothesis under test.

### C3 — Unit 8 is too late; both reviewers flagged it independently
The plan stacks zonal stats (5), NDVI (6), and color (7) on a clipper that has not been independently
validated. **Fix:** split into **Unit 8a — coverage oracle**, run immediately after Units 3/4, gating
everything downstream; and **Unit 8b — statistics validation**, after Unit 5.

### C4 — The tolerance decision is circular (and the plan conflates two different epsilons)
Gemini: Unit 2 fixes an epsilon *before* Unit 8 runs, so if Unit 8 passes you cannot tell whether the
clipper is right or whether an over-wide tolerance hid algorithmic drift.

The underlying bug is that the plan uses one word for two things:
1. **Geometry epsilon** (input-side) — snapping and degenerate-edge rejection *inside* the clipper.
   This one genuinely must be fixed before goldens, per runbook §5.
2. **Agreement tolerance** (output-side) — how far our answer may sit from exactextract. This one
   **cannot** be principled a priori.

**Fix:** separate them explicitly. Fix (1) in Unit 2. Derive (2) empirically in Unit 8a by running the
clipper at maximum precision and observing the actual distribution of per-cell differences. This
satisfies the runbook rule *and* Gemini's objection — they were never actually in conflict.

Research-supplied starting gates for (2): per-cell coverage absolute tolerance **1e-9**; investigate
at 1e-6; hard fail at 1e-4. Plus a cheap oracle-free invariant that catches the whole
grid-alignment bug class on its own: **`Σ coverage × pixel_area ≈ polygon_area`** to ~1e-9 relative.
The realistic failure being hunted is a **half-pixel geotransform offset** (pixel-corner vs
pixel-centre origin), which shows up as a large systematic *edge-only* disagreement — not a tolerance
question at all.

### C5 — Kill criteria are not falsifiable, and the sweep measures the wrong axis
Both reviewers. "Exceeds the request budget with no headroom" and "approaches the function limit" are
rationalisations, not gates. And hectares are a weak proxy for runtime: S-H is **O(vertices × pixels)**,
so the real variables are **vertex count, hole count, multipolygon part count**, not acreage. Codex:
*"A 5 ha geometry with 20k vertices is a more meaningful stressor than a 500 ha rectangle."*

**Fix:** pre-commit hard numbers (wall-clock ceiling, peak RSS ceiling, max acceptable growth factor),
and parameterise the sweep by area **×** vertex count **×** hole count **×** part count. Also: pixels
must be pre-filtered by per-ring bounding box or high-vertex blocks blow the time budget outright.

### C6 — Provenance chain is broken: the processing baseline is not in the Process API response
**Unit 10.** Evalscript scene metadata exposes only `date`, `cloudCoverage`, `dataPath`, `shId`, and
`inputMetadata.serviceVersion` — and `serviceVersion` is **Sentinel Hub's service version, not the ESA
PDGS baseline**. Recording it as the baseline would be silently wrong.

**Fix:** Unit 10 needs a **second, out-of-band call to the CDSE STAC catalogue**
(`https://stac.dataspace.copernicus.eu/v1/`), reading the `processing:version` queryable (confirmed
live), with the `_N0511_` token in the SAFE product id as a cross-check.

---

## Should Fix

- **S1 — Drop hand-rolled UTM; use `proj4` for the spike (Units 2, 8).** Both reviewers call it a false
  economy. Gemini's framing is decisive: the spike's *entire output* is a correctness verdict, so you
  must not put two unproven things in one measurement. If Unit 8 disagrees by 0.05%, you cannot tell
  whether S-H is broken or the projection drifted. Add `proj4` to eliminate the CRS variable, making
  Unit 8 a pure test of the clipper; hand-roll it in P1 if the dependency still offends.
- **S2 — Guard the radiometric *response*, not just the request (Units 9, 10).** A request-body
  contract test is necessary but not sufficient. Assert on returned metadata: output CRS, grid
  transform, band resolutions, nodata values, resampling actually applied — plus a few sample pixel
  values so the contract is not purely syntactic.
- **S3 — Do not let exactextract arbitrate quantiles (Units 5, 8b).** Weighted quantiles are
  definition-dependent; exactextract is only an oracle where the estimator matches. Use it for
  **coverage fractions, weighted mean, counts, min/max, area**. Validate quantiles against **analytic
  fixtures** instead. Otherwise an estimator mismatch contaminates the clipper verdict.
- **S4 — Codify the Blob cache ceiling (Unit 11).** Range requests **are** documented and supported,
  and private stores now exist — two of the plan's open questions are already answered. The real
  constraint is the **512 MB per-blob cache ceiling**: above it, *every* access is a cache miss. An
  estate raster at 500 ha / 10 m / 3 bands float32 is well under 1 MB, so it passes easily — but the
  limit belongs in the doc as an asserted invariant, not an assumption.
- **S5 — `upsampling`/`downsampling` already default to NEAREST**, are per-`input.data[]` entry (not
  per band), and resampling runs *before* the evalscript, so SCL arrives already at 10 m. Per-band
  pinning would need a two-datasource Data Fusion trick that doubles input bands and PU cost for no
  analytical gain. Leave the default; record it.

---

## Design Questions

1. **Does the estate-wide fetch change P2's scene model?** One raster per estate per date, rather than
   per block, changes what `SpatialScene` keys on. Worth deciding in P0 since P2 inherits it.
2. **Is `proj4` an acceptable spike-scoped dependency**, given the repo's 22-dep hand-roll culture — on
   the explicit understanding that P1 may remove it?
3. **Should Unit 13 stop being a sketch?** Gemini argues the "final mile" — getting a computed raster
   from TS memory onto Leaflet *without a tile server* — is itself part of the no-worker hypothesis.
   If painting a canvas blocks the main thread, the architecture fails at the display end even with
   perfect math. Runbook §5 does list "nearest vs bilinear rendering" in P0 scope, so proving a canvas
   paint is arguably in-scope already, not scope creep.
4. **Runbook rule §2.13 needs an edit** given C1. Its intent is right; its stated mechanism is wrong.
   Who owns that correction, and does it happen in P0 or as a standalone docs fix?
5. **Are self-touching / self-intersecting rings rejected hard, or supported?** Codex: if the intent is
   to support them, the plan is unsafe. This must be an explicit Unit 1 decision.

---

## What the reviewers did NOT find

Worth recording, because it is the part of the plan that held up:

- The **convex-window reframe is correct** — independently confirmed by both, with proofs.
- **Holes via signed area are correct** for valid input — Codex probed three configurations and found
  no counterexample.
- **Disjoint-piece (U-shape) handling is correct** — Gemini proved the bridge cancellation.
- The **zero-DB-writes posture**, the **separate-area-authority decision**, the **collapsed token
  cache**, and the **analytic-not-recorded goldens** discipline drew no objections.

---

## Raw Response — Codex (`gpt-5.4-mini`, fallback)

> As written, this is **not** a trustworthy decision instrument. It can absolutely produce a confident
> wrong answer. The main reason is Unit 3: you have a mathematically valid idea, but you have not
> enforced the preconditions that make it valid, and you are relying on floating-point cancellation
> where the plan claims exactness.

Findings: (CRITICAL) Unit 3 clipped-area kernel underspecified — holes are fine for valid input, but
self-intersecting/self-touching rings and hole–shell touching are not rejected, and for those signed
area is algebraic not geometric; exact cancellation of degenerate backtracking edges is only
guaranteed if coordinates are reused bit-for-bit. (CRITICAL) Unit 8 too late — split into an early
coverage oracle and a later stats validation. (CRITICAL) Unit 12 kill criteria not falsifiable; sweep
should vary vertex/hole/part count, not hectares. (SHOULD) Unit 2 hand-rolled UTM is a false economy —
a projection bug looks exactly like a clipper bug. (SHOULD) Radiometric contract must assert response
metadata, not just request fields. (SHOULD) exactextract cannot arbitrate weighted quantiles unless the
estimator is pinned on both sides.

> Bottom line: Sutherland–Hodgman is acceptable here **only** as a clipped-area kernel over valid
> simple rings clipped by a convex rectangle. The plan does not currently enforce that contract, and
> because Unit 8 comes too late and Unit 12 is fuzzy, this spike can still bless a wrong architecture.

## Raw Response — Gemini (`gemini-3.1-pro-preview`)

> This plan proposes a bold, elegant architecture, but contains fatal sequence flaws and fundamentally
> misapprehends the radiometric APIs. As a decision-making instrument, running this plan as written
> would bless a broken architecture and cause false-negatives in validation.

Confirmed S-H exactness with proofs for holes and the U-shape bridge cancellation, then: (CRITICAL)
the ULP precondition — intersections must be assigned the exact axis-aligned boundary scalar, never
computed by lerp, or anti-parallel bridges fail to cancel; (CRITICAL) the 10k request ceiling forces
estate-wide fetching; (CRITICAL) `harmonizeValues` must be `false` or the contract test guarantees
corrupted data (clamped B04 = 0 → synthetic NDVI 1.0); (CRITICAL) baseline provenance needs a
secondary STAC call; (CRITICAL) the Unit 2 / Unit 8 tolerance ordering is circular — run Unit 8 at
`Number.EPSILON` first, then set tolerance from the empirical noise distribution; (SHOULD) `proj4` for
the spike; (SHOULD) numeric kill criteria, noting S-H is O(vertices × pixels) so pixels must be
bbox-prefiltered; (SHOULD) codify the 512 MB blob cache ceiling; (QUESTION) the map-overlay deferral is
precedent-eroding because the in-memory-array → Leaflet canvas paint is itself part of the hypothesis.

> **DO NOT PROCEED as written.** Rewrite to reflect an estate-wide fetching architecture, swap the
> testing sequence so Unit 8 precedes Unit 2's tolerance decision, enforce `harmonizeValues: false`,
> and lock S-H intersections to exact scalar boundaries. Once those four changes are made, the spike
> will produce a trustworthy verdict.
