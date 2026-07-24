# Vineyard Intelligence — Build Runbook

**Status:** master runbook (stable). Phase plans are generated fresh per phase and live in `docs/plans/`.
**Owner:** Russell Moss
**Started:** 2026-07-24
**Contract document:** [vineyard-intelligence-discovery-brief.md](./vineyard-intelligence-discovery-brief.md)
(the "brief" — product principles, NDVI/color/smoothing contracts, observation model, test strategy).
**External research note (out-of-repo, name-bearing):**
`C:\Users\russe\.rstack\projects\wine-inventory\vineyard-intelligence-reference-research-20260723.md`
**Soil design (out-of-repo, authoritative for Phase 4):**
`C:\Users\russe\.rstack\projects\wine-inventory\russe-claude-usgs-soil-maps-vineyard-eabe6c-design-20260720-005928.md`

The product job (brief §1):

> Show a vineyard manager where conditions differ inside a vineyard, how those patterns are changing,
> how satellite patterns compare with field measurements, and where someone should scout or act.

## 1. How to use this runbook

Hybrid planning model, same as prior large programs:

1. **This runbook stays stable.** It owns phase order, parallel lanes, standing rules, acceptance
   gates, and the status ledger. The brief owns the detailed product/math contracts.
2. **At the start of each phase**, run `/plan` against the repo *as it exists then* to generate that
   phase's implementation plan (→ `docs/plans/`), then `/council` review it.
3. **Execute only that phase** with `/work`, then `/qa`, then `/ship`. Never ask an agent to build
   the whole program from the brief in one pass.
4. **End every phase** with: gates verified, a phase report in `docs/GIS/phases/`, the status ledger
   (§7) updated, and `NOW.md` updated.
5. If the codebase contradicts an example in the brief or this runbook, **preserve the product rule
   and adapt the implementation** to the codebase.

## 2. Standing rules (non-negotiable, every phase)

1. **Never name the reference product** — not in code, comments, docs, plans, commit messages, PR
   text, tickets, tests, or fixtures. Say "the reference product" and cite the brief. Identity,
   URLs, and access details live only in the external research note. Never copy its source bodies,
   tokens, or identifiers; never call its production services.
2. **Tenant isolation is absolute.** Every new table follows the `AGENTS.md` Phase-12 checklist
   (tenantId, FK, backfill, per-tenant uniques, composite FKs where cross-tenant risk, forced RLS,
   app_rls grants, isolation test). On the live tenant, anything with FK/RLS/uniqueness/event-writes
   is **backfill-then-enforce**, never a bare additive migration.
3. **Demo Winery only** for dev/QA/fixtures (`org_demo_winery`), `QA-*` prefixes, clean up after.
4. **Pure modules + goldens for all math** (brief §17, §19): fractional coverage, percentile
   domains, classification, stats, IDW, K-means, unit conversion. No React/Leaflet imports in math
   modules. Deterministic tests never call live providers.
5. **Assistant coverage is part of the definition of done** (`verify:ai-native`): each phase ships
   its assistant tools + golden evals per the wet-hands/desk rule (domain-composite tools, not one
   per micro-core). This is a differentiator — no incumbent has a conversational vineyard GIS.
6. **Geometry is versioned from day one.** Every derived product (NDVI stats, soil snapshots,
   sampling plans, zones) records the geometry version/fingerprint it was computed from; a boundary
   edit marks dependents stale, never silently rewrites or deletes them.
7. **Raw data is never discarded** (brief §2). Smoothed/interpolated/derived products record their
   parameters and are stored as derivatives. Provenance on every map and export.
8. **Provider + storage economics:** CDSE free tier for now. Quota/processing-unit telemetry ships
   with the first integration (Phase 2), scenes are cached per tenant as immutable records, and
   nothing re-calls the provider on map open. **Blob egress gets the same telemetry treatment** —
   map opens re-read stored rasters, so cache/CDN accordingly. Copernicus attribution requirements
   ride along the provenance/export path. Revisit paid tiers only when telemetry shows a wall.
9. **Offline-first is an app capability, not a GIS feature.** The sync/outbox layer (Phase OF) is
   built generic and reusable; field collection is its first consumer. New Vineyard Intelligence
   write paths should be outbox-compatible (idempotency keys) from the start.
10. **Keep Leaflet.** No Mapbox migration. No PostGIS and no external geospatial worker unless a
    phase proves the need against the Phase 0 decision (see §3).
11. **Design/UX:** DESIGN.md tokens + `docs/architecture/ux-principles.md`; map layers get the
    governed layer-stack treatment (brief §13.1), not one-off screens.
12. **Security:** SSRF allowlist for any raster fetch, strict upload validation, short-lived
    authorized asset access, provider tokens server-side only, no signed URLs or farm geometry in
    logs (brief §18).
13. **Radiometric honesty across time and terrain.** Sentinel-2 processing baseline 04.00
    (Jan 2022) introduced a BOA_ADD_OFFSET of −1000; every Process API request **pins
    `harmonizeValues`** and records it plus the scene's processing baseline in provenance —
    otherwise cross-date NDVI drifts for non-physical reasons, corrupting the "trends beat
    snapshots" promise. SCL is 20 m while B04/B08 are 10 m: the SCL **resampling method is pinned
    (nearest) and recorded**, or masks won't reproduce at planting edges. On steep terrain (the
    live Bhutan tenant is the most exposed user), slope/aspect illumination differences show up as
    fake within-planting "patterns" under relative scaling — the display layer must be able to say
    so (P3 advisory); actual terrain correction stays in the Later bucket until validated.

## 3. Architecture posture

**Working hypothesis (to be proven or killed in Phase 0): the no-worker architecture.**

Vineyards are tiny AOIs — a 50 ha vineyard at 10 m Sentinel resolution is ~5,000 pixels. Therefore:

- **Processing:** CDSE Sentinel Hub **Process API** returns B04/B08/SCL (or NDVI) as a small GeoTIFF
  over the exact AOI, mosaicked across tile boundaries — the provider does the heavy lifting.
- **Math:** fractional boundary-pixel coverage (brief §2.4) and zonal statistics in **pure
  TypeScript** over the small in-memory raster.
- **Display:** Leaflet canvas/`ImageOverlay` rendered client-side from the stored raster, alpha-
  clipped to the vector boundary. No tile server, no COG pyramid.
- **Storage:** raw masked NDVI arrays + provenance in `@vercel/blob` (KB–low-MB per scene) with
  metadata rows in Postgres. No GeoTIFF bytes in Postgres.
- **Jobs:** scene processing behind the existing durable-job/idempotency patterns; runtime should
  fit a normal serverless request budget at vineyard scale (Phase 0 measures this).

**Fallback if killed:** durable queue + geospatial worker (GDAL/Rasterio) + object-storage COGs +
authorized tile endpoint, per brief §13. The pure-TS math modules and goldens move unchanged — that
is why rule §2.4 exists. Record the Phase 0 verdict here and as an ADR.

**Decisions already made (2026-07-24, Russell):**

- Runbook + per-phase plans model: **approved**.
- Reference product never named in-repo: **approved** (brief scrubbed, verbatim original moved to
  the external research note).
- Soil (Phase 4) runs as a **parallel lane**, cards-first.
- **Offline-first is v1** for phone field collection, built as an app-wide reusable foundation.
- Sentinel: **free tier** is fine until tenant count says otherwise.
- Brief §21 recommended defaults stand unless a phase plan surfaces a reason to revisit.

## 4. Phase map and parallel lanes

```text
Wave 0   P0  Spike: no-worker go/no-go, storage, layer-contract sketch   (solo gate)
Wave 1   P1  Planting geometry (1A)            ⚡ P4  Soil cards (1C)    ⚡ POF Offline foundation
Wave 2   P2  NDVI core (1B-data)               ⚡ P5  Observations + sampling plans (R2a)
Wave 3   P3  NDVI display (1B-viz)             ⚡ P6  Field collection (R2b; needs P5 + POF)
Wave 4   P7  Derived analysis (R3)             ⚡ (optional) soil map-unit overlay spike
Later    Additional indices, Sentinel-1, temporal composites, multiyear stability, kriging,
         hyperspectral, variable-rate export. Hardware/device control is out of scope entirely.
```

Dependency edges: P1←P0; P2←P0+P1; P3←P2; P4←(nothing but existing block polygons); P5←P1;
P6←P5+POF; P7←P2+P5.

### Parallel-build mechanics (velocity without quality loss)

- Lanes marked ⚡ in the same wave are **file-disjoint by design** and can run as simultaneous
  branches/PRs (separate sessions/worktrees). Verify disjointness at `/plan` time: if two lane
  plans touch the same file, either re-slice or serialize that file's change.
- **`prisma/schema.prisma` is the shared choke point.** Within a wave, land each lane's schema +
  migration as a small *schema-first slice PR* before the lane's feature PRs, and serialize those
  slice PRs across lanes (they're small; conflicts stay trivial). Windows enum rule: isolated
  `ALTER TYPE` migrations committed before any dependent default.
- Worktrees share ONE `.git` index — stage with `git commit --only <paths>`; run `gh pr list`
  before starting; DB-backed `verify:*` runs from the MAIN checkout (worktrees have no `.env`).
- The **map layer-stack contract** (brief §13.1 `MapOverlay`) is a P1 deliverable landed *early in
  the wave* so P4's later overlay work and P2/P3 raster layers extend it instead of forking
  `SatelliteMap`. P4 stays cards-only precisely so Wave 1 lanes never touch the same components.
- Each lane keeps its own plan doc, PR chain, QA pass, and ledger row. A lane is not "shipped"
  until its gate (below) is green — parallelism never waives a gate.

## 5. Phases: scope and acceptance gates

### P0 — Spike: prove the architecture (Wave 0, solo)

Scope (brief §20 Spike, both fixtures; Demo Winery only, no live DB writes):
synthetic planting crossing pixels at known 0.10/0.25/0.50/0.90 coverage split into two blocks;
fixture + one live Process API scene (pinning `harmonizeValues` + SCL resampling per rule §2.13
from the very first request); pure-TS fractional planting/block stats; p5–p95 domain;
two palettes; nearest vs bilinear rendering; one 3×3 derivative; independent validation of the
fractional stats against `exactextract`/GDAL/QGIS; runtime/memory/output-size measurements; storage
spike (`@vercel/blob` range/egress/authorization behavior); OAuth2 client-credential token caching.

**The real technical risk here is geometry robustness, not the serverless budget.** Exact
polygon–pixel intersection with holes, multipolygons, and shared sibling boundaries is a
robustness minefield. P0 therefore **decides the polygon-clipping foundation** (martinez-based
`polygon-clipping` / `polyclip-ts` vs turf wrappers — note recent turf delegates its boolean ops
to polygon-clipping, so the decision is about which layer we depend on directly) and **fixes the
coordinate tolerance BEFORE the goldens are written**, not after the first flaky test. Fixture set
adds degenerate geometry: a sliver, a self-touching ring, and a hole tangent to the boundary.

**Gate:** fractional stats match the independent tool within the documented tolerance;
shared-boundary blocks don't double-count; degenerate-geometry fixtures pass (or their defined
rejection behavior is documented); clipping-library + tolerance decision recorded in the ADR;
live round-trip measured; a written **go/no-go on the no-worker architecture** recorded in §3 +
an ADR; layer-stack contract sketched. No production code required.

### P1 — Planting geometry foundation (Wave 1, lane A — brief Release 1A)

Scope: `VineyardPlantingArea` (brief §14) with geometry versioning + effective dates; draw/import
planting areas with holes; one-block-from-planting, split-into-blocks, draw-inside-with-snap
(brief §2.2); topology review (overlaps, gaps, slivers, outside-parent, unassigned area);
**migration by union** of existing block polygons into proposed parents with review/confirm and
provenance, originals untouched (§2.2); block→planting required reference after backfill review;
geodesic/projected area alongside spacing-based planted acreage (never replacing it, §11.2);
the governed layer-stack contract in the map client.

**Gate:** topology fixtures from brief §19 pass; migration flow reviewed end-to-end on Demo Winery;
RLS/isolation tests for new tables; geometry-version invalidation wired (even with no consumers
yet); assistant read tools (planting/block structure Q&A) + goldens; `verify:naming` green.

### P4 — Soil documentation layer (Wave 1, lane B — brief Release 1C; cards-first)

Authoritative inputs: the external NRCS design (Spike Results section overrides earlier
alternatives) + brief §11.4/§13.6/§14 `BlockSoilSnapshot`. Scope: one-click server-side SDA pull
for a reviewed US block polygon; stored current + superseded snapshots; polygon-fingerprint
staleness; coverage tolerance fixed at 0.005; ~1% share floor; explicit non-soil classes (water,
pits, rock outcrop, urban, not-surveyed); per-map-unit property cards with `mukey` + basis —
**no blended block properties**; non-US → coherent unavailable state (note: the live Bhutan tenant
is non-US; this phase's beneficiaries are Demo Winery + future US growers). Map-unit *overlay* is
explicitly out (Wave 4 spike) so this lane never touches map components.

**Gate:** brief §19 soil fixtures (parser coercion, tolerance bands, non-soil, single-soil,
sub-floor slivers, unreadable-snapshot degrade, stale-on-edit supersede-not-delete); SQL-injection
+ outbound-allowlist tests; timeout keeps last good snapshot; RLS tests; a `verify:soil` e2e proof
script; assistant tool (block soil summary) + golden.

### POF — Offline foundation (Wave 1, lane C — app-wide capability)

Scope: a generic client-side **pending-writes outbox** (IndexedDB) with idempotency keys, replay
on reconnect, duplicate-safe server acceptance, and conflict surfacing (server wins + user notice
for v1); service-worker shell/data caching for designated routes; a small API feature teams adopt
("queue this mutation, cache these reads"); a pattern doc under `docs/architecture/`; ADR for the
sync model. Scope guard: this phase **establishes the layer**, it does not retrofit the whole app —
app-wide adoption is tracked in `ROADMAP.md`/`TODOS.md`. First consumer is P6.

**Abstraction forcing function (anti-schedule-bomb):** a generic layer designed two waves before
its first real consumer will get refactored in Wave 3 unless it is specced against concrete
demand. The POF plan therefore **writes P6's field-collection flows as pseudocode call sites
against the proposed API** (cache block + targets + form; queue observation; replay; conflict
notice) and treats them as the design's acceptance fixture — the designated pilot route alone is
not sufficient proof.

**Gate:** unit tests for queue/replay/dedupe/conflict; airplane-mode manual QA on one designated
route (queue offline → reconnect → exactly-once server effect); the P6 pseudocode call sites
type-check/design-check against the shipped API (recorded in the phase report); no auth/token
material persisted beyond existing session mechanisms; ADR recorded.

### P2 — NDVI core (Wave 2 — brief Release 1B, data half)

Scope: provider-neutral satellite adapter (CDSE STAC search + Process API behind one interface,
brief §13.4); OAuth2 client-credential caching; **date-window scene selection** UX contract
("around a date", ±7→14→30 days, per-planting SCL cloud/valid coverage, recommend-but-let-inspect,
immutable scene records with provider IDs + selection reason, §13.5); NDVI per §15 (masking,
no-data policy §5, fractional coverage stats, exact-clip display alpha); **radiometric contract
per rule §2.13**: `harmonizeValues` pinned and recorded with the processing baseline in every
scene's provenance, SCL 20 m→10 m resampling pinned (nearest) and recorded; schema: `SpatialScene`,
`SpatialDataset`, `SpatialAnalysisJob`, `BlockSpatialMetric` (§14) per the tenancy checklist;
blob storage of raw masked rasters + provenance; **quota + blob-egress telemetry** (rule §2.8);
Copernicus attribution wired into provenance and exports. **Auto-add-best-new-scene ships DARK**:
it is the one feature that scales provider calls with tenant count rather than user action, so it
is enabled (per tenant) only after quota telemetry demonstrates headroom — never simultaneously
with first ship.

**Gate:** `verify:ndvi` e2e on a fixture scene (no live provider in tests); stats goldens reuse P0
fixtures; no-fabricated-scene contract test; provenance contains harmonization setting, processing
baseline, and SCL resampling method (contract test); attribution present in exports; scene
idempotency/retry tests; RLS tests; quota counter visible; assistant tools ("process/fetch NDVI
for vineyard X around date D", "NDVI stats for block B") + goldens.

### P3 — NDVI display and comparison (Wave 3 — brief Release 1B, viz half)

Scope: all six scale modes with vineyard-relative p5–p95 default (brief §6.1–6.2); palettes incl.
color-vision-safe + custom stops/reverse/save with `SpatialStyle` scopes (§6.3); legend with
numeric domain, histogram, spread, narrow-domain warning (§6.4); raw/bilinear/nearest and labeled
3×3 analytical smoothing per the raw/smoothed contract (§7); locked-domain date comparison +
block time series (§8, §15 Comparison); a **steep-terrain illumination advisory** on relative
scale modes (rule §2.13 — v1 can be a per-vineyard flag, no DEM required); per-block stats panel;
CSV + provenance export; field follow-up action into existing field-notes/work-order flows.

**Gate:** color-domain and palette goldens; the brief §19 E2E list for NDVI display (scale switch,
comparison without domain drift, raw/smooth badges, source-resolution honesty); saved-style
round-trip; export records scale mode; assistant tools (compare dates, explain block stats) +
goldens; DESIGN.md review for the legend/scale editor.

### P5 — Observations and sampling plans (Wave 2 — brief Release 2, model half)

Scope: `VineyardObservation`/`VineyardObservationValue` (brief §9.2; decide reuse of existing
analyte/unit registries at `/plan` time); CSV + lab imports keyed by coordinates or saved sample
points with validation (units, duplicates, coordinate order, outside-block warning, §9.3);
**intent-first Good/Better/Best plan wizard** (§9.5–9.8) with metric-specific protocol presets
(§9.7, versionable); sampling-grid generation (even/random/stratified, UTM-aligned, edge rules,
box sampling); permanent sample points + stable IDs (`B12-2027-P07`); point mapping with
classification modes + per-metric map options (§9.9); plan acceptance-criteria screen and
post-collection completeness report (§9.8).

**Gate:** unit-conversion goldens (never join lb/vine with kg/vine); import validation fixtures;
wizard refuses interpolation for composite-only designs (contract test); grid goldens; RLS tests;
assistant tools (generate a sampling plan, summarize observations) + goldens.

### P6 — Phone-guided field collection (Wave 3 — brief Release 2, field half)

Scope: the §9.4 workflow end-to-end — route ordering with free point choice; target vs current
position, distance/bearing, accuracy good/okay/poor (device accuracy, not survey-grade); arrived /
collect / skip / reschedule; planned point + actual point + accuracy + offset + protocol + sample
code all persisted; explicit map-tap override with provenance; photos/notes; **offline-first via
POF** (cache block, targets, form; queue records; duplicate-safe sync); permanent reference
points/vines for season-over-season repeatability.

**Gate:** airplane-mode E2E (collect offline → sync → exactly-once observations); GPS-denied path
falls back to map-tap; accuracy/offset provenance visible on the saved record; mobile-viewport QA
pass; assistant tool (plan progress / what's left to collect) + golden.

### P7 — Derived spatial analysis (Wave 4 — brief Release 3)

Scope: raster-to-point sampling + neighborhood means; tolerance-based coordinate joins (never
exact-float equality, §10.1); IDW with all §16 parameters visible/recorded + leave-one-out
validation (MAE/RMSE, sparse-sample warning, points-over-surface); standardized deterministic
seeded K-means with silhouette-suggested k, original-unit centroids, neutral zone labels (§10.2);
zone polygon dissolve with recorded sliver rules (§10.3); cross-variable charts reusing existing
chart patterns; exports. Example workflows §10.4 as QA scripts.

**Gate:** IDW and K-means goldens (fixed seeds); validation metrics shown before a surface can be
saved; zone provenance (inputs, transforms, algorithm version); RLS tests; assistant tools (run
zoning, explain what drove a zone) + goldens.

### Later bucket (not scheduled)

NDRE/EVI/SAVI/GNDVI/NDWI/MSI + Sentinel-1 (formulas already in brief §5); temporal median
composites (§7.3); multiyear zone stability; kriging only if validated over IDW; soil map-unit
overlay (after the geometry/response-size spike); **topographic/illumination correction for steep
sites** (only if validated — see rule §2.13); hyperspectral; variable-rate prescription export.
Hardware/device control: **never** part of this program.

## 6. Definition of success (program level)

The brief §22 release definitions are the acceptance narrative: the NDVI story (P1+P2+P3), the
soil story (P4), and the spatial-observation story (P5+P6+P7's validation posture). A phase is not
done until its slice of the relevant §22 narrative can be demonstrated live on Demo Winery.

## 7. Status ledger

| Phase | Wave/Lane | Status | Plan | PRs | Report |
| --- | --- | --- | --- | --- | --- |
| P0 spike | 0 | ⬜ not started | — | — | — |
| P1 planting geometry | 1A | ⬜ not started | — | — | — |
| P4 soil cards | 1B | ⬜ not started | — | — | — |
| POF offline foundation | 1C | ⬜ not started | — | — | — |
| P2 NDVI core | 2 | ⬜ not started | — | — | — |
| P5 observations + plans | 2 | ⬜ not started | — | — | — |
| P3 NDVI display | 3 | ⬜ not started | — | — | — |
| P6 field collection | 3 | ⬜ not started | — | — | — |
| P7 derived analysis | 4 | ⬜ not started | — | — | — |

Statuses: ⬜ not started → 🟦 planning → 🟨 building → 🟪 QA → 🟩 shipped.
Update this table at every transition; link the plan doc, PR(s), and phase report.

## 8. Phase reports and decisions

- Reports: `docs/GIS/phases/phase-<id>-report.md` after each ship — what shipped, gate evidence,
  deviations from the plan, measurements, and lessons that change later phases (edit this runbook
  when they do).
- Big decisions (worker go/no-go, offline sync model, storage) → ADR under
  `docs/architecture/decisions/` + context-ledger entry; architecture/security register entries
  per the brain rules; invariant notes for anything that becomes a hard rule.
- GTM note: custom-crush growers (plan 092/093 Owner/Grower surfaces) are a first-class audience —
  "your winery gives you vineyard intelligence on your own blocks" is a differentiator no
  incumbent offers. Keep grower-visible read access in mind when scoping each phase's UI.
