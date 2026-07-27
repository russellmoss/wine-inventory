# P0 — the working CRS and the geometry epsilon (DECISION GATE, Unit 2)

**Date:** 2026-07-24
**Status:** decided
**Plan:** `docs/plans/2026-07-24-094-spike-vineyard-intelligence-p0-plan.md` (Unit 2)
**Council:** `docs/plans/council-feedback-094-vineyard-intelligence-p0.md`
**Code:** `src/lib/gis/projection.ts` · **Tests:** `test/gis-projection.test.ts` (17 green)

Runbook §5 requires the clipping foundation and the coordinate tolerance to be fixed **before the
goldens are written**, not after the first flaky test. This is that record. Every number below was
measured on 2026-07-24, not asserted.

## Decision 1 — clip in the scene's UTM CRS, recentred on the AOI

**All intersection and area math happens in projected metres, recentred so the AOI sits near the
origin.** Never in WGS84 degrees.

Three independent reasons, in descending order of how badly degrees fail:

1. **Degrees are not merely imprecise, they are wrong.** A coverage fraction is a ratio of *areas*.
   Sentinel-2 pixels are square in UTM and never in degrees, so a "10 m pixel" in lon/lat is a
   non-square quadrilateral whose degree² area is not proportional to m². Fractions computed there
   would be systematically biased by latitude.
2. **An absolute epsilon in degrees is anisotropic on the ground.** A degree of longitude is
   cos(latitude) shorter than a degree of latitude, so one scalar tolerance means two different
   ground distances.
3. **The documented failure regime lives there.** The `polygon-clipping` family's
   `Unable to complete output ring` reports cluster around the 6th decimal of a WGS84 degree — about
   **0.11 m**, exactly the magnitude of a vineyard block boundary.

**Recentring is the cheap half of this and it is worth more than it looks.** Float64 spacing scales
with magnitude, so a raw UTM northing wastes precision that a translation recovers for free:

| Quantity | Measured |
|---|---|
| ULP at a raw UTM northing (4.21 × 10⁶ m) | **9.313 × 10⁻¹⁰ m** |
| ULP at recentred vineyard scale (5 × 10² m) | **1.137 × 10⁻¹³ m** |
| **Headroom gained by one subtraction** | **8,190×** |

The origin is the projected AOI centre **rounded to whole metres**, so it is stable across runs and
reconstructible from provenance alone. A worked example (a ~700 m block near Charlottesville):
CRS `EPSG:32617`, origin `719763, 4212436`, and the SW corner lands at `-342.189, -342.194` — hundreds
of metres from the origin rather than millions.

## Decision 2 — ε_geom = 1 × 10⁻⁶ m (1 µm)

**`GEOM_EPSILON_M = 1e-6`**, an absolute tolerance in *recentred projected metres*, used for vertex
snapping and degenerate-edge rejection inside the clipper.

| Check | Measured | Verdict |
|---|---|---|
| Above float64 noise at recentred scale | **8.80 × 10⁶ ×** the ULP | enormous margin |
| Below the Sentinel-2 pixel | **1.0 × 10⁻⁷** of 10 m | cannot move a reported digit |
| Below real boundary survey accuracy (~1 m) | 10⁻⁶ of it | far below what anyone can draw |

It sits nearly seven orders of magnitude above the noise floor and seven below anything agronomically
meaningful. There is no plausible input for which this epsilon changes a coverage fraction at a digit
we would ever report.

## Decision 3 — there are TWO epsilons, and conflating them was a real bug

The first draft of the plan used one tolerance for two unrelated jobs. Gemini caught the consequence:
if the epsilon is fixed a priori *and* is also the yardstick for agreement against `exactextract`,
then a passing validation proves nothing — you cannot tell a correct clipper from an over-wide
tolerance hiding drift.

| | ε_geom (this document) | ε_agree (Unit 5) |
|---|---|---|
| Side | **input** — inside the clipper | **output** — agreement vs the oracle |
| Units | recentred projected metres | dimensionless coverage fraction |
| When fixed | **a priori, here, before any golden** | **empirically, after measuring** |
| Value | `1e-6 m` | derived in Unit 5; opening gates 1e-9 / 1e-6 / 1e-4 |

Runbook §5's "fix the tolerance first" rule applies to ε_geom and is satisfied. Deriving ε_agree from
observation satisfies the council's objection. They were never actually in conflict.

## Decision 4 — `proj4`, scoped to the spike

One new runtime dependency (22 → 23), against a strong hand-roll culture. Both council reviewers
called hand-rolling ellipsoidal transverse Mercator a false economy *for this phase specifically*:
the spike's entire output is a correctness verdict, and putting two unproven things into one
measurement means a projection bug at the Unit 5 gate is indistinguishable from a clipper bug.

`proj4` removes the CRS as a variable, so Unit 5 tests the clipper and nothing else. P1 may replace it
with a hand-rolled transverse Mercator once the clipper is proven; that option is recorded in ADR 0009
so it is not lost. Verified live: `WGS84(-77, 38.9) → UTM 18N (326565.46, 4307580.85)`.

## Decision 5 — an AOI spanning two UTM zones is flagged, not refused

`Projector.spansMultipleZones` is set when the bounding box straddles a zone boundary. We pin the
centroid's zone and continue, because a real vineyard cannot span 6° of longitude (~500 km), but the
flag rides in provenance so a caller can warn or refuse rather than silently absorbing the extra
distortion. Tested against the zone 17/18 boundary at −78°.

## What was verified

- Round-trip to **sub-millimetre** across three hemispheres/zones: Virginia (17N), Bhutan (46N — the
  live tenant's zone), Marlborough NZ (59S).
- Projected distance checked against an **independent ellipsoidal formula** (radius of curvature in
  the prime vertical), not against proj4's own belief. The naive `111320·cos φ` spherical form is
  ~0.13% wrong at 38° latitude — enough to swamp the measurement, which is why the first version of
  that test failed and the *test* was corrected, not the code.
- A 100 m × 100 m square measures 10,000 m² ± 0.5%.
- Recentred coordinates stay within ~1 km of the origin for a vineyard-scale AOI.

## Tripwire

If Unit 5's per-cell comparison against `exactextract` shows a **systematic, edge-only** disagreement,
suspect the geotransform (pixel-corner vs pixel-centre origin) before suspecting this epsilon. That
failure mode is not a tolerance question and must not be absorbed by widening one.
