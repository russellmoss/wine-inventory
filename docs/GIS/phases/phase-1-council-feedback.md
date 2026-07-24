# Council Feedback — P1 Planting Geometry Foundation

**Date:** 2026-07-24
**Plan:** [phase-1-planting-geometry-plan.md](phase-1-planting-geometry-plan.md)
**Reviewers:** Codex `gpt-5.4-mini` (correctness + data layer), Gemini `gemini-3.1-pro-preview` (product + geometry edge cases)

The two reviewers converged independently on the same three load-bearing problems. That convergence is
the signal: this plan's math is fine; its **geometry-operation choices and its migration/versioning
product semantics** need rework before `/work`.

## Critical issues (both reviewers, high confidence)

### C1 — `polyclip-ts` does not fix the robustness failure P0 rejected (Unit 2)
Working in recentred UTM metres fixes *our* arithmetic; it does **not** change the library's internal
failure mode, which is coincident / near-coincident edges + precision reduction in the overlay kernel —
independent of coordinate magnitude. Codex: "snapping externally before the call does not make the kernel
robust." **A martinez-family library will still emit the same `Unable to complete output ring` class.**
→ Fix: use a kernel with a real precision/snap-rounding model. Gemini names **JSTS** (the JTS TopologySuite
port) explicitly — it has robust overlay **and** a native line-splitter. Alternative: keep boolean ops
extremely narrow and hand-roll only what's needed. Either way, the wrapper interface (`boolean.ts`) stays,
so the kernel is swappable.

### C2 — Split-by-corridor is a geospatial anti-pattern (Units 2/9/10)
Buffering the split line into a corridor and differencing it **destroys area** and leaves a permanent gap
equal to the corridor width — which the topology check (U4) then correctly reports as `UNASSIGNED_AREA`.
It violates the product's own "sibling blocks share exact snapped edges, gaps only as explicit unassigned
area" invariant (brief §2.3). Real blocks share a row-middle boundary with **no gap**.
→ Fix: a true **line-split ("blade")** primitive — extend the drawn line to the planting boundary, split
into adjacent polygons that share a **mathematically identical edge**. No corridor, no lost acreage.
JSTS `polygonize`/`LineString` split does this. Corridor stays only as a UI hit-target if at all.

### C3 — Migration-by-union is garbage-in-garbage-out without a pre-flight (Units 9/4)
Unioning independently-drawn blocks "repairs" exactly the defects the topology layer exists to surface:
- **Overlaps** get absorbed into the parent, but the children still overlap → U4 immediately screams
  `SIBLING_OVERLAP` on freshly-migrated data.
- **Too-wide continuity grouping bridges a road/creek** → the parent mask averages asphalt/water into NDVI,
  permanently skewing the analysis the whole program is built to produce (brief explicitly forbids bridging
  non-vine land).
→ Fix: run topology **before** proposing; flag overlapping blocks and force snap/correct first; require
strict touching (edge-touch or <1 m snap) for grouping so it can't bridge gaps; the review UI (U10) must
render the proposed parent as a bright outline over satellite imagery and ask "did we bridge a road?"
Proposals must carry defects **alongside** the derived polygon, never silently normalize them.

### C4 — Three area numbers will alarm growers (Unit 5)
Projected area, geodesic area, and spacing-based acreage shown as peers. A drawn polygon includes headlands
and margins; spacing acreage is productive canopy only — they can disagree 15%, reading as "corrupted data"
or "I've been over-buying spray."
→ Fix: hide projected-vs-geodesic (GIS noise; pick geodesic internally). UI hierarchy: **"Productive area"**
(spacing) = primary, drives management/chemicals; **"Boundary footprint"** (polygon) = secondary, explicitly
labeled "includes turn rows / unplanted margins, used for satellite analysis."

## Design questions (need a human decision)

### Q1 — Boolean-geometry kernel: JSTS, hand-roll, or stay with a martinez lib and accept the risk?
JSTS is the robust industry-standard choice (fixes C1 + C2 in one dep) but is heavier (~and brings its own
API surface). Hand-rolling a line-split is narrower but is the false economy P0 already warned about for
projection. This is the top decision.

### Q2 — Correction vs. boundary-change: should a small vertex nudge invalidate history? (Units 1/6)
The fingerprint is exact — a 1 mm move mints a new immutable version and (later) marks NDVI history stale.
Gemini's proposal: compute **IoU(old, new)**; if > ~98% treat as a trace correction (update in place / minor
version, no stale cascade); if < 98% prompt "fix a sloppy drawing, or a real physical change?" and let intent
drive the cascade. Do we adopt an IoU threshold, or keep every edit = new version (simpler, more honest, more
trigger-happy)?

### Q3 — Migration: all-or-nothing per vineyard, or allow a half-migrated state? (Units 1/10/12)
Nullable `plantingAreaId` permits "5 blocks parented, 8 orphaned." Gemini: don't build a half-migrated UI —
make "Migrate site" assign **all** blocks atomically or save nothing, then require `plantingAreaId` in all
block-creation flows for that vineyard. This is cleaner UX but changes U10's flow and U1's enforcement story
(a per-vineyard "migrated" flag rather than a global NOT NULL).

### Q4 — Topology errors: blockers or warnings? (Units 4/10)
Gemini's recommendation: **block saves** on `SIBLING_OVERLAP` and `BLOCK_OUTSIDE_PARENT` (they break the mask
math); **warn only** on `UNASSIGNED_AREA` (growers legitimately leave rocky outcrops / ponds unplanted). Do we
adopt that split?

## Suggested improvements (fold in; no decision needed)

- **S1 — Pin the canonicalization frame (Units 5/6, Codex + Gemini).** The recenter anchor must be fixed and
  **persisted in the version row + hashed**, or the same shape hashes differently across edits and no-op
  detection / idempotency break. Non-negotiable for the fingerprint to mean anything.
- **S2 — Version-bump concurrency (Unit 6/8, Codex).** `@@unique([tenantId,subjectType,subjectId,version])`
  is not enough — racing edits can lose an `effectiveTo` close or a pointer update. Do the close+append+pointer
  update in one tx with a **row lock on the subject** (or optimistic compare-and-swap on the version pointer,
  abort on zero rows), and add a **partial unique on the open row** (`effectiveTo IS NULL`).
- **S3 — Stale-write guard on every geometry write (Units 7/8, Codex).** Concurrent tabs / assistant retries /
  back-button resubmits: check current version/fingerprint in the `WHERE` and fail fast on stale state.
- **S4 — Define `groupByContinuity` precisely (Unit 2, Codex).** Edge-touch vs point-touch vs epsilon-near-touch
  are distinct cases; specify the adjacency rule (ties to C3's "strict touching").
- **S5 — Resolve geometry authority (Units 1/9, Codex).** State clearly: block polygon is canonical for the
  block; planting geometry is canonical for the parent; migration derives the parent FROM blocks (one-time),
  and one-block-from-planting derives a block FROM the parent — but after creation each shape has exactly one
  author. Avoid dual-authority drift.
- **S6 — Brand the geometry type at the edge (Unit 7, Codex).** Convert raw GeoJSON `Json` into a validated
  branded canonical type immediately, so no caller can bypass project→snap→validate before boolean/area/version
  logic runs.
- **S7 — Server-side self-intersection rejection (Units 2/10, Gemini).** Geoman's `allowSelfIntersection:false`
  is a buggy UI restriction under fast drawing; `validateVineyardPolygon` must be the real gate with a clear
  UI error (it already checks this — make sure the split outputs run through it too).
- **S8 — Split → batch-edit (Unit 10, Gemini).** After a split mints N geometrically-valid blocks, dump the
  user straight into a batch table for variety/clone/rootstock/spacing, else they're "agriculturally useless."
- **S9 — Migration ordering discipline (Unit 1, Codex).** Keep enum `CREATE TYPE` → table create → (backfill)
  → RLS as **distinct** migrations, not one bundle.
- **S10 — Add the failure-case goldens (Unit 2, Codex).** Split line ending inside the polygon; line grazing a
  vertex; corridor/blade smaller than `GEOM_EPSILON_M`; repeated edit cycles round-tripping through WGS84;
  concurrent version bumps.

---

## Raw response — Codex (gpt-5.4-mini, fallback from gpt-5.4-pro)

CRITICAL: (1) polyclip-ts is still the martinez failure class in a new wrapper; recentred UTM helps your
arithmetic but not the library's internal coincident/near-coincident-edge + precision-reduction failure;
snapping externally doesn't make the kernel robust; use a kernel with a real precision/snap-rounding model or
keep scope narrow enough to hand-roll. (2) corridor-difference is not a true split — guarantees a gap = corridor
width (→ topology reports unassigned area even for intentional splits), fails when the line doesn't fully cross,
leaves slivers grazing vertices; fix = intersect line with boundary and polygonize the edge graph; keep corridor
as UI affordance only. (3) versioning concurrency underspecified; `@@unique` only rejects duplicate inserts after
both writers read the same current version — doesn't serialize close→append→pointer; racing edits → stale
effectiveTo / lost pointer; fix = single tx with row lock or optimistic CAS + partial unique on the open row.
(4) nullable plantingAreaId is safe from cross-tenant leak (tenantId non-null) but is an orphan channel by design
(MATCH SIMPLE skips FK when null); treat null as temporary, add backfill deadline + SET NOT NULL, or model
assignment status explicitly.
SHOULD FIX: fingerprint on "projected+rounded in recentred metres" is unstable unless the recenter anchor is
fixed and part of the hash contract; explicit stale-write protection (WHERE current version); U9 proposal
silently normalizes bad topology (run checks first / emit defects alongside); nail topology semantics before UI;
tighten types at the geometry boundary (branded canonical types); stricter migration ordering (split enum/table/
backfill/NOT NULL/RLS); add failure-case validation (line ends inside, grazes vertex, corridor < epsilon,
WGS84 round-trips, concurrent bumps).
DESIGN QUESTIONS: groupByContinuity under-defined (edge vs point vs epsilon touch); block polygon
illustrative-vs-canonical dual-authority; pin the canonical coordinate frame and write it into the version row.

## Raw response — Gemini (gemini-3.1-pro-preview)

CRITICAL: (1) "Tractor Row Sliver" — buffer-and-difference split destroys the shared row-middle boundary and
creates a permanent unassigned gap; violates "blocks share snapped edges"; use a true blade/line-split (JSTS)
producing an exact identical shared edge, no corridor. (2) "Chemical ordering panic" — three area numbers as
peers; hide projected-vs-geodesic; "Productive area" (spacing) primary drives chemicals, "Boundary footprint"
(polygon) secondary labeled includes turn rows/margins for satellite. (3) "Asphalt bridging / GIGO" — union of
independently-drawn blocks absorbs overlaps (children still overlap → SIBLING_OVERLAP) and can bridge a
road/creek (mask averages asphalt/water into NDVI); pre-flight topology, flag overlaps before union, require
strict touching/<1m snap, review UI shows proposed parent over imagery asking "did we bridge a road?".
SHOULD FIX: (4) "1mm nudge" staleness — IoU(old,new) > 98% = correction (update in place, don't invalidate),
else prompt intent. (5) "Orphanage UI" — enforce all-or-nothing migration per vineyard; don't build empty states
for a transitional schema.
DESIGN QUESTIONS: topology errors blockers vs warnings (block OVERLAP/OUTSIDE_PARENT, warn UNASSIGNED_AREA);
where does spacing/variety data entry happen after a split (batch table); robust server-side self-intersection
rejection rather than relying on Geoman UI.
