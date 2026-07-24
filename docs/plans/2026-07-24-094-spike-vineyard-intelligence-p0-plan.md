---
title: Vineyard Intelligence P0 — spike: prove or kill the no-worker architecture
type: spike
status: council-revised
date: 2026-07-24
branch: spike/vi-p0-no-worker
depth: deep
units: 16
roadmap: Vineyard Intelligence Wave 0 (solo gate) — `docs/GIS/VINEYARD_INTELLIGENCE_RUNBOOK.md` §5 P0
contract: docs/GIS/vineyard-intelligence-discovery-brief.md
enables: P1 (planting geometry), P2 (NDVI core), P4 (soil cards), POF (offline foundation)
reviews: [council (codex gpt-5.4-mini + gemini-3.1-pro)]
council: docs/plans/council-feedback-094-vineyard-intelligence-p0.md
honors: [runbook §2.1 never-name-the-reference-product, §2.2 tenancy, §2.3 Demo Winery, §2.4 pure math + goldens, §2.7 raw data never discarded, §2.10 keep Leaflet, §2.12 security, §2.13 radiometric honesty (SEE CORRECTION — Unit 15)]
---

## Overview

Every phase of Vineyard Intelligence (P1–P7) sits downstream of one unproven bet: that a vineyard is
small enough that we never need a geospatial worker. A 50 ha vineyard at Sentinel-2's 10 m resolution
is ~5,000 pixels. If that is true, the provider does the raster heavy lifting, the math is pure
TypeScript over a small in-memory array, and there is no queue, no GDAL, no COG pyramid, no tile
server, no PostGIS. If it is false, we need the brief §13 worker stack and P1's geometry work should
be shaped differently from day one.

P0 answers that question with measurements, and it answers a second question the runbook flags as the
*actual* technical risk: exact polygon–pixel intersection is a numerical-robustness minefield, and the
clipping foundation plus the coordinate tolerance must be chosen **before** the goldens are written.

This is a spike. It ships no UI and writes no production rows. What it does ship — the pure
fractional-coverage and statistics modules and their goldens — is built to keep, because both
architectures reuse them unchanged. That reuse is the entire reason runbook rule §2.4 exists.

**Status: revised after council review.** Both reviewers confirmed the core geometric claim and both
said the *instrument* would have blessed a wrong architecture. Six structural changes came out of
that review; they are marked **⚠️ COUNCIL** at the point where they bite. Full findings:
[council-feedback-094](council-feedback-094-vineyard-intelligence-p0.md).

## Problem Frame

**Who has the problem.** Russell, right now, choosing what to build next. Downstream: a vineyard
manager who needs to see where conditions differ inside a planting, and a custom-crush grower who
gets that view on their own blocks from the winery that processes their fruit — a thing no incumbent
offers (runbook §8 GTM note).

**What happens if we do nothing.** We start P1 and discover the architecture in P2. P1's planting
geometry is the parent analysis mask; if statistics must move to a worker, the geometry contract, the
storage shape, and the job model all change under it. The cost of finding out late is not "add a
worker" — it is re-cutting the phase that everything else references.

**Pressure test (Russell, 2026-07-24).** Is proving the serverless budget the right problem? Mostly
no, and the runbook already says so: *"The real technical risk here is geometry robustness, not the
serverless budget."* 5,000 float32 pixels is 20 KB. It was never going to blow a request budget.
Research confirms the instinct with hard evidence: `polygon-clipping` carries a long-running class of
[`Unable to complete output ring`](https://github.com/mfogel/polygon-clipping/issues/91) failures
(issues #40, #49, #75, #83, #90, #91, #101, #105, #139, #140, #141, #172) triggered by rounding noise
around the 6th decimal of a WGS84 degree — ≈0.11 m, precisely where vineyard block boundaries live.
Worse, the same family produces **silent** wrong geometry (#94, #169, #57, #87; `polyclip-ts` #22,
#12) — a thrown error is the *good* outcome. So P0's weight sits on the clipping decision and the
independent validation; the runtime measurement is the cheap half.

**The reframe that collapses the dependency question.** The operation we need is **not** general
polygon–polygon boolean. It is *polygon ∩ axis-aligned rectangle*, once per intersecting pixel — a
convex clip window, the exact precondition for Sutherland–Hodgman, which has no ring-reassembly step
to fail. **Both council reviewers independently confirmed this is correct**, including the hard case
(a U-shaped polygon entering, leaving, and re-entering one pixel yields a single ring with zero-width
bridges whose contributions cancel exactly in the shoelace integral, because the two traversals are
anti-parallel vectors on the same line). It survives — under two preconditions the first draft
omitted, now Units 1 and 3.

## Requirements

- **MUST** produce a written go/no-go on the no-worker architecture, recorded in runbook §3 **and** an
  ADR. A spike that ends without a recorded verdict has failed regardless of what it built.
- **MUST** decide the polygon-clipping foundation and **fix the geometry epsilon before any golden is
  written**, stated as a number, in a named CRS, with reasoning.
- **MUST** compute fractional boundary-pixel coverage per brief §2.4: keep every positive
  intersection, weight by `area(pixel ∩ polygon) / area(pixel)`, never pixel-center-only, never
  all-touched-at-full-weight.
- **MUST** validate **per-cell coverage fractions** — not merely aggregates — against `exactextract`,
  before any statistics are built on top of the clipper.
- **MUST** assert the area-conservation invariant `Σ coverage × pixelArea ≈ polygonArea`. ⚠️ **COUNCIL:**
  this is the one check that catches the *silent* sliver/dropped-ring failure class without an oracle.
- **MUST** prove sibling blocks sharing a boundary do not double-count: per pixel,
  `Σ coverage(block_i) ≤ 1 + ε`, and block coverages sum to the parent planting's coverage.
- **MUST** reject invalid geometry rather than silently producing a number for it. ⚠️ **COUNCIL:** for
  self-intersecting or self-touching rings, signed area is *algebraic, not geometric*, and can cancel
  to a confidently wrong answer.
- **MUST** request bands in **REFLECTANCE** units with `harmonizeValues: false`, and record the
  scene's processing baseline from the CDSE **STAC** catalogue. ⚠️ **COUNCIL:** this inverts the first
  draft — see Unit 7 and the runbook correction in Unit 15.
- **MUST** keep all math modules free of React, Leaflet, `@vercel/blob`, and I/O, so they are
  node-testable and survive a flip to the worker architecture unchanged (rule §2.4).
- **MUST NOT** name the reference product in any artifact this phase produces (rule §2.1).
- **MUST NOT** write production DB rows, touch the Bhutan tenant, or call live providers from any
  deterministic test.
- **MUST NOT** introduce a second acreage authority silently.
- **SHOULD** land the canonical polygon type and validator as reusable production modules, since P1
  needs them on day one and today there is no canonical type at all.

## Scope Boundaries

**In scope:** the fixtures, the pure math (coverage, zonal stats, NDVI numeric policy, percentile
domain, two palettes, nearest/bilinear, one 3×3 derivative), the independent per-cell validation, one
live **estate-wide** Process API round-trip with the radiometric contract pinned, the blob storage
spike, OAuth2 client-credential token caching, the clipping/epsilon decisions, a **proven** canvas
render path, the measurements, and the verdict artifacts.

**Out of scope:**
- Any `VineyardPlantingArea` schema, migration, or RLS work — that is P1. P0 writes no Prisma models.
- The full `MapOverlay` contract implementation — P1. Unit 14 proves only the *render feasibility*
  half, which is part of the hypothesis under test.
- Scene selection UX, date-window search, `SpatialScene`/`SpatialDataset` tables — P2.
- Soil / SDA — P4, an independent lane with no P0 dependency.
- Assistant tools + goldens. Rule §2.5 makes assistant coverage part of definition-of-done, but P0
  ships no user-facing capability to talk to. Deferred to P2, named so the omission is a decision.
- The second brief §20 fixture (observations / IDW / K-means) — validates P5/P7 math, no bearing on
  the verdict.
- Terrain/illumination correction. Later bucket (rule §2.13).

## Research Summary

### Codebase Patterns

**There is no canonical polygon type, and that is the biggest gap.** Three unshared representations:
`RawBlock.polygon: unknown` (`src/lib/vineyard/data.ts:38`), `SerializedBlock.polygon: unknown`
(`data.ts:57`, `:111`), and a private structural type in the map (`SatelliteMap.tsx:170`) with a guard
(`:172-185`) that checks only the outer ring. The server validator (`src/lib/vineyard/actions.ts:107-133`)
is **file-private, untested, accepts only `type: "Polygon"`**, and does not check ring closure,
winding, self-intersection, or hole containment. Self-intersection is prevented only client-side by
Geoman (`SatelliteMap.tsx:541`). The `GeoJSON.*` global at `:247-253` arrives transitively via
`@types/leaflet` and is not a declared devDependency.

**`prisma/schema.prisma:445` calls the polygon "illustrative, not the area source."** Acreage comes
from `blockAreaSqM = rowSpacing × vineSpacing × vineCount` (`src/lib/vineyard/units.ts:45-55`). Zonal
statistics derive area from that same geometry — see Key Decisions for how we avoid a second authority.

**Pure-module discipline.** vitest ^4.1.8, `vitest.config.ts:14-17` pins `environment: "node"` and
`include: ["test/**/*.test.ts"]`; `resolve.alias` maps `server-only` → `test/stub-server-only.ts`.
`test/` is **flat**. **No jsdom, no RTL** — component tests are impossible. The template for testable
map logic is `src/lib/map/attribution-refresh.ts:28-34`, structurally typed so it runs under node with
no Leaflet and no DOM. For math voice: `src/lib/harvest/chart.ts` + `test/harvest-chart.test.ts`,
where every `it` names an invariant. Goldens are hand-written `.ts` modules, never `toMatchSnapshot()`.

**`verify:*` is the house proof format** — 68 of 125 npm scripts. Shape B: `runAsTenant`, prefixed
fixtures, `let passed = 0` + `assert()` printing `  ✓ <msg>`, terminal `ALL N ASSERTIONS PASSED`,
`finally` scrub. Import split is deliberate: `@/lib/prisma` but `../src/lib/tenant/context`.
`scripts/verify-commerce7.ts:11-15` stubs provider env before imports so it runs offline.

**⚠️ `verify:ai-native` will fail** on any new `src/lib/**/*-core.ts` exporting a `*Core` symbol not
reachable from `src/lib/assistant/tools/**`. **The GIS modules must not use the `-core.ts` suffix.**

**Provider-adapter shape is standardized** (`src/lib/commerce/`, `src/lib/accounting/`): `adapter.ts`,
`<provider>/config.ts` (env read, **hardcoded origins**, fail-closed), `client.ts`, `mock.ts`. Every
client does `deps?: { fetchImpl? }` injection (`commerce7/client.ts:25-30`), `redirect: "error"`
(`:183`), full-jitter backoff honoring `Retry-After` (`:155-159`), and a pure exported
`classifyFault` (`:44-51`). `qbo/config.ts:9-13`: origins are *"HARDCODED HTTPS constants here (never
derived from a request header)."*

**Token caching:** `src/lib/accounting/token.ts` keeps a module-level cache with
`ACCESS_SKEW_MS = 120_000` (`:16`, `:53-55`) and `_clearAccessCache()`/`_seedAccessCache()` seams
(`:35`, `:40`). Its heavy machinery (row lock, `tokenVersion` CAS, envelope encryption, `:76-112`)
exists solely because QBO's refresh token **rotates**. Client credentials has none of that.

**SSRF guard exists:** `src/lib/knowledge/crawl/ssrf.ts:36,43`, fails closed.

**Blob convention:** `@vercel/blob ^2.4.1` direct dep; `src/lib/attachments/blob.ts` keys are
`<pathPrefix>/<tenantId>/<Date.now()>-<safeName>.<ext>`, `access: "private"`, `addRandomSuffix: true`
(`:131-135`); `hasBlobCredentials()` gates on **both** `BLOB_READ_WRITE_TOKEN` and `VERCEL_OIDC_TOKEN`
(`:22-25`). SDK is **lazily imported inside the IO path** (`src/lib/ingest/document-blocks.ts:72-74`)
so pure logic stays test-importable. `putPrivateDocument` returns `{ url, sha256 }`. Existing
validators hard-reject anything not PNG/JPEG/PDF by magic bytes; caps are 5 MB / 10 MB.

**Dependency posture: 22 runtime deps, hand-rolled by default** — PNG parsing, SSRF classification,
frontmatter parsing, chart scales, jittered backoff. `@turf/*@7.3.5` and `polyclip-ts@0.16.8` are in
the lockfile but **only as transitive deps of client-only Geoman**; using them server-side without
promotion is phantom-dependency usage.

**⚠️ `node_modules` in this worktree is stale** — `leaflet`, `@geoman-io`, `@turf`, `polyclip-ts`,
`@types/geojson` are in the lock but absent from disk. `npm ci` before anything.

### Prior Learnings

Learnings store is empty for this project and the context-ledger returned **no active precedents** for
vineyard geometry, map layers, raster storage, or provider adapters — genuinely new ground. From
session memory and repo docs:

- **The main checkout has `.env`; worktrees do not.** DB, live provider, and blob work runs from
  `C:\Users\russe\Documents\Wine-inventory`.
- **Local `.env` *is* production** (no dev database) — hence zero DB writes this phase.
- Worktrees share one `.git` index — stage with `git commit --only <paths>`.
- ADR 0008 is the latest, so P0's is **0009**. Plan 093 is the highest, so this is **094**.

### External Research

**Confirmed against official sources (2026-07-24).** The findings that changed the plan:

- **`harmonizeValues` does not do what runbook §2.13 assumes.** In **REFLECTANCE** units Sentinel Hub
  applies the BOA_ADD_OFFSET *regardless* of the flag; the flag only controls whether negative
  reflectance is **clamped to zero**. Its offset-harmonisation role applies to **DN** units. Since
  evalscripts default to REFLECTANCE for S2 optical bands, a default request is already baseline-safe.
  And `harmonizeValues: true` clamping `B04 → 0` drives `NDVI` to exactly **1.0** — a fabricated value.
- **Un-harmonised error is catastrophic and non-constant**, so it cannot be calibrated out after the
  fact: vigorous canopy (B04 0.03 / B08 0.45) true NDVI 0.875 reads **0.618 (−0.257)**; bare soil errs
  only −0.057. A systematic step at 25 Jan 2022, largest exactly where the product's value lives.
- **The processing baseline is NOT in the Process API response.** Evalscript metadata exposes only
  `date`, `cloudCoverage`, `dataPath`, `shId`, and `inputMetadata.serviceVersion` — which is *Sentinel
  Hub's service version, not the ESA PDGS baseline*. The confirmed route is the separate CDSE STAC
  catalogue (`https://stac.dataspace.copernicus.eu/v1/`), queryable `processing:version`, cross-checked
  against the `_N0511_` token in the SAFE product id.
- **`upsampling`/`downsampling` already default to `NEAREST`**, are per-`input.data[]` entry (not per
  band), and resampling runs *before* the evalscript — so SCL arrives already at 10 m. Per-band pinning
  needs a two-datasource Data Fusion trick that doubles input bands and PU cost for no gain.
- **Free tier binds on requests, not PU:** 10,000 requests/month vs 10,000 PU/month, and a 50 ha 3-band
  FLOAT32 request is **≈0.038 PU**. Requests bind ~26× sooner. One estate-wide 500×500 raster costs
  ~1.9 PU and **one** request.
- **PU formula:** `max(px/262144, 0.01) × (bands/3) × samples × formatFactor`, FLOAT32 = ×2.
- **`exactextract` has official Windows wheels** (`pip install exactextract`, CPython 3.9–3.13) and
  emits per-cell **`coverage` / `cell_id` / `center_x` / `center_y`** arrays — a true cell-by-cell diff,
  not just aggregates. GDAL's `zonal-stats` (3.12+) and QGIS native give aggregates only; QGIS native
  is centroid-based and does not do fractional coverage at all.
- **Vercel Blob range requests are documented and supported**, and `access: 'private'` stores now exist.
  **CDN cache ceiling is 512 MB per blob** — above it, *every* access is a cache miss.
- **SCL classes:** keep `{4 vegetation, 5 bare soil}`; exclude `{0 no-data, 1 saturated, 2 dark, 3 cloud
  shadow, 6 water, 8/9 cloud, 10 cirrus, 11 snow}`; `{7}` marginal. Cloud **shadow (3)** is the class
  most often forgotten and the most damaging — it depresses NDVI without looking like cloud.
- **Clipping libraries.** `polyclip-ts`'s `setPrecision` is **process-global mutable state whose snap
  trees are never reset**, so per-pixel calls leak memory and couple across calls; setting *any*
  precision takes a 3–5× slower path; and a *larger* epsilon can make failures **worse**, because an
  absolute-tolerance comparator is not a valid total order and is used to order a splay tree. This is
  decisive against betting a correctness verdict on a tunable library epsilon.
- **Attribution (legally required):** derived products must carry
  **`Contains modified Copernicus Sentinel data [Year]`**.

## Key Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Clipping foundation | Hand-rolled Sutherland–Hodgman rectangle clip, zero new runtime deps (**gate: Unit 3**) | `polyclip-ts`; `polygon-clipping`; `@turf/intersect`; `jsts`; `geos-wasm` | The operation is polygon ∩ convex rect, not general boolean — **confirmed exact by both council reviewers**. Library route is worse than it looked: global mutable precision state, never-reset snap trees, slower with precision set, and non-monotone epsilon behavior |
| Clipping **fallback** | **`jsts`** — real `PrecisionModel` + `GeometryPrecisionReducer` + snap-rounding, no WASM cold start | ~~`polyclip-ts`~~ (first draft) | ⚠️ **COUNCIL/research:** "quantize to a grid, then overlay" is the textbook answer to raster-cell clipping. `polyclip-ts` was the wrong fallback |
| Working CRS | Project to the scene's UTM CRS **and recentre near the origin**; all math in metres (**gate: Unit 2**) | Clip in WGS84 degrees | Coverage is an *area ratio* and S2 pixels are square only in UTM — degrees are not merely imprecise, they are wrong. ⚠️ Recentring collapses magnitude ~1e6 → ~1e2, buying **~4 decimal digits of float64 headroom free** |
| Projection library | **`proj4`, added for the spike** (Russell, 2026-07-24) | Hand-roll ellipsoidal transverse Mercator | ⚠️ **COUNCIL (both):** the spike's entire output is a correctness verdict; two unproven things in one measurement means a projection bug is misattributed to the clipper. P1 may rip it out once clipping is proven |
| **Two** epsilons, not one | **ε_geom** (input-side, fixed a priori in Unit 2) and **ε_agree** (output-side, derived empirically in Unit 5) | One tolerance | ⚠️ **COUNCIL:** the first draft conflated them, making the tolerance decision circular. Separating them satisfies runbook §5 *and* the objection |
| Fetch shape | **One estate-wide raster per date**, clipped N ways in memory (Russell, 2026-07-24) | Per-block requests | Requests bind 26× sooner than PU. Per-block burns 50 requests per look; estate-wide costs 1. Also a *better* test — N blocks against one in-memory raster **is** the hypothesis |
| Radiometric contract | Pin `units: "REFLECTANCE"` + **`harmonizeValues: false`**; baseline from **STAC** | Pin `harmonizeValues: true` (first draft) | ⚠️ **COUNCIL:** the first draft's contract test would have *guaranteed* corrupted data (clamped B04 → synthetic NDVI 1.0) |
| Render proof | **Proven in P0**, not sketched (Russell, 2026-07-24) | Contract sketch only | The in-memory-array → Leaflet canvas paint is the display half of the same hypothesis. Runbook §5 already lists nearest-vs-bilinear rendering in P0 scope |
| Area authority | Polygon-derived area reported as a **separate, explicitly labeled** quantity; spacing-derived planted acreage stays authoritative | Replace spacing-derived acreage | `schema.prisma:445` and brief §11.2 both forbid silently replacing one with the other |
| DB writes | None. P0 is read-only against the DB | Demo-tenant fixture rows | Local `.env` is production. Zero writes costs nothing and removes the risk class |
| Token cache | Module-level, in-memory, skew guard + `_clearTokenCache()` seam; no persistence, no locking | Port `accounting/token.ts` wholesale | Client credentials has no rotating refresh token. Documented as deliberate |

## Implementation Units

### Unit 0: Prerequisites and credentials (BLOCKING — human) — ✅ MOSTLY CLEARED 2026-07-24
**Goal:** Land the inputs P0 cannot proceed without.
**Files:** `.env` (main checkout, not committed), `.env.example`, `docs/GIS/**` (still **untracked**)
**Status:**
- ✅ **CDSE credentials live and verified.** `CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET` are set locally
  *and* in the Vercel project across Production/Preview/Development, and the local and remote values
  hash-match. A live `client_credentials` grant against
  `identity.dataspace.copernicus.eu/…/openid-connect/token` returned a Bearer token in ~0.6–1.2 s.
  📌 **`expires_in = 1800 s` (30 min)**, confirmed against the JWT's own `exp − iat`. Research could
  only say "read the `exp` claim" because CDSE does not document a fixed lifetime — **now we have the
  number, and Unit 10's 120 s skew guard is 6.7% of it, which is comfortable.**
- ✅ **Blob token live and verified.** `BLOB_READ_WRITE_TOKEN` already existed in the Vercel project
  (blob store connected 9 days ago) and was pulled into local `.env` — append-only, after a
  `.env.bak-<ts>` backup, 47 → 48 vars. A private `put` → `head` → ranged `GET` → `del` round-trip
  passed (256 B put in 464 ms). **Store left clean.**
- ⬜ **`docs/GIS/` is still untracked** (`?? docs/GIS/`) — the runbook and brief exist only in the main
  working tree, so every artifact this plan produces cites a file not in git. **This is the one
  remaining blocker.**
- ⬜ `npm ci` (stale `node_modules` in worktrees) and add `proj4` + `@types/proj4`.
- ⬜ Add a `# --- Satellite imagery (Copernicus Data Space Ecosystem) ---` block to `.env.example`
  matching `.env.example:62-68`, documenting behavior when unset. (A
  `# --- Vercel Blob ---` comment block was already written into `.env` alongside the token.)
**Tests:** none (prerequisite).
**Depends on:** none
**Verification:** `git ls-files docs/GIS` non-empty; `npm ci` succeeds; `npx tsc --noEmit` clean.

### Unit 1: Canonical polygon type, validator, and **validity rejection**
**Goal:** One shared, exported, tested polygon type + a validator that **refuses** the inputs that make
the Unit 3 correctness proof false.
**Files:** `src/lib/gis/geometry.ts` (new), `test/gis-geometry.test.ts` (new),
`src/lib/vineyard/actions.ts` (refactor `:107-133`), `src/components/ui/SatelliteMap.tsx` (refactor `:170-185`)
**Approach:** Export a `VineyardPolygon` covering `Polygon` **and** `MultiPolygon` (brief §2.3 requires
both), plus an exported validator carrying the existing `MAX_POLYGON_BYTES = 64 * 1024` /
`MAX_POLYGON_VERTICES = 2000` limits. Add ring closure, minimum ring length, and **normalization** to
canonical winding (outer CCW, holes CW) so signed-area hole handling in Unit 3 is well-defined.
Define the type structurally — do not import the `GeoJSON.*` global — following
`attribution-refresh.ts:28-34`. Refactor both existing call sites; currently-valid polygons must not
change behavior. **Not** named `*-core.ts`.

⚠️ **COUNCIL CRITICAL (Codex).** The first draft said degenerate fixtures may "pass **or** document
rejection behavior." That is too loose and leaves room for quiet wrongness. For **self-intersecting,
self-touching, or hole-touching-shell** rings, signed area is *algebraic, not geometric* and can cancel
to a confidently wrong answer. This unit must **reject them hard**, with a typed reason code, and Unit 3's
correctness claim is then explicitly scoped to *valid simple rings*. Holes are fine and need no
rejection — Codex probed hole-inside-pixel, hole-straddling-edge, and empty-hole-remnant and found no
counterexample for valid input.
**Tests:** rejects an unclosed ring; rejects a ring < 4 positions; rejects out-of-range lon/lat; counts
vertices across holes against the cap; normalizes a CW outer ring to CCW; accepts MultiPolygon;
round-trips a canonical polygon unchanged; **rejects a self-intersecting ring, a self-touching ring, a
hole crossing its shell, and a hole extending outside its shell — each with a distinct reason code**.
**Depends on:** Unit 0
**Verification:** `npx vitest run test/gis-geometry.test.ts` green; `npm run build` clean; existing
`test/vineyard-*.test.ts` still green.

### Unit 2: Projection, recentring, and **ε_geom** — DECISION GATE
**Goal:** Fix the working CRS and the *input-side* epsilon, with numbers, before any golden exists.
**Files:** `src/lib/gis/projection.ts` (new), `test/gis-projection.test.ts` (new),
`docs/GIS/phases/p0-tolerance-decision.md` (new)
**Approach:** WGS84 → the scene's UTM zone via **`proj4`** (Russell's call — see Key Decisions), then
**recentre** so the working origin sits near the AOI centroid. ⚠️ Recentring is the cheapest numerical
win available: it collapses coordinate magnitude from ~1e6 m to ~1e2 m, and since float64 ULP scales
with magnitude, that is roughly **four decimal digits of headroom for free**. Neither council model
raised it; it came from the library research, where it is the technique JSCAD uses.

✅ **Both halves measured on 2026-07-24, `proj4@2.20.9` installed.** Round-trip WGS84 → UTM → WGS84 at
two real vineyard latitudes: **UTM 18N (Finger Lakes) error 0.00 mm; UTM 46N (Bhutan) error
1.46e-6 mm** — six orders inside the sub-millimetre requirement, so the projection is *not* a
meaningful error source and Unit 5 can attribute any disagreement to the clipper. Recentring headroom
confirmed: **ULP at a 705,000 m easting = 1.57e-10 m; at ~1e2 m recentred ≈ 2.2e-14 m** — the ~4
orders the plan claims. (A demo recentring all the way to 0.1 m showed ~6 orders, but ~1e2 m is the
realistic block-extent magnitude, so **4 is the number to quote.**)

Then fix **ε_geom** — an absolute epsilon in recentred projected metres, applied to vertex snapping and
degenerate-edge rejection **inside the clipper**. Proposed: **1e-6 m (1 µm)**, justified three ways —
ULP at recentred magnitude ~1e2 m is ≈1.4e-14 m, so 1 µm sits ~8 orders above round-off; it is 7 orders
below the 10 m pixel; and ~6 orders below any real block-boundary survey accuracy (~1 m). It cannot
alter a coverage fraction at any digit we will ever report.

⚠️ **COUNCIL CRITICAL (Gemini) — this unit no longer sets the agreement tolerance.** The first draft
used one epsilon for two jobs, which made the tolerance decision circular: if Unit 8 passed, you could
not tell whether the clipper was right or an over-wide tolerance hid the drift. **ε_agree** (how far we
may sit from `exactextract`) is now derived empirically in Unit 5. The runbook's "fix the tolerance
before the goldens" rule applies to ε_geom, and is satisfied here.
**Tests:** forward/inverse round-trip to sub-millimetre over a vineyard extent; published control points
within tolerance; a point near a zone boundary; **defined** behavior when a geometry spans two UTM zones
(reject, or pin one zone and record the distortion); recentring is exactly invertible.
**Depends on:** Unit 1
**Verification:** `npx vitest run test/gis-projection.test.ts` green; `p0-tolerance-decision.md` states
the CRS, the recentring rule, ε_geom as a number with units, and the reasoning — committed **before** Unit 4.

### Unit 3: Fractional coverage — the clipping foundation — DECISION GATE
**Goal:** Per-pixel `coverageFraction` by exact polygon ∩ rectangle intersection.
**Files:** `src/lib/gis/coverage.ts` (new), `test/gis-coverage.test.ts` (new)
**Approach:** Sutherland–Hodgman clip of each ring against the four half-planes of an axis-aligned pixel
rectangle, in recentred projected metres, then shoelace. Holes fall out of signed area given Unit 1's
canonical winding: `coverage = |Σ signedArea(clip(ring_i))| / pixelArea`. Iterate only candidate pixels
from each ring's bounding box in raster grid space — ⚠️ S-H is **O(vertices × pixels)**, so without
bbox prefiltering a high-vertex block blows the time budget outright (Gemini).

⚠️ **COUNCIL CRITICAL (Gemini) — the ULP precondition.** The exactness of this method depends on a
detail the first draft never stated. When a U-shaped polygon enters, leaves, and re-enters one pixel,
S-H returns a single ring with zero-width bridges along the pixel edge. Those bridges cancel in the
shoelace integral **only because the two traversals are anti-parallel vectors on the same mathematical
line**. If the intersection point is computed by a lerp (`x = x1 + (x2-x1)*t`), the forward and return
bridges differ by ±1 ULP, they are no longer collinear, cancellation fails, and **area leaks silently**.
**Therefore: when clipping against a vertical edge, `intersect.x` must be ASSIGNED the exact edge scalar
(`pixel_max_x`) with no arithmetic, and only `y` computed. Symmetrically for the other three edges.**
This must be enforced by a test with a U-shaped fixture, not by a comment.

Record the decision: this is a **convex** clip window, so the ring-reconstruction failure class in
`polygon-clipping` #91/#139/#172 has no analogue — there are no rings to reassemble. State the
falsifier: if Unit 5's per-cell validation disagrees beyond ε_agree and the cause is our clipper, fall
back to **`jsts`** (not `polyclip-ts` — see Key Decisions) and re-run. Clamp to `[0,1]`; treat
`< ε_geom` as zero coverage (dropped, not a phantom intersection).
**Tests:** the four known-coverage fixtures hit exact analytic values; fully-interior pixel returns
exactly 1; fully-exterior exactly 0; a pixel cut by a hole returns the complement; MultiPolygon parts on
one pixel sum; coverage never `>1` or `<0`; a wrongly-wound ring yields positive coverage after
normalization; **a U-shaped polygon crossing one pixel twice returns the exact two-component area** (the
ULP regression); **a pixel touching the polygon only at a corner returns 0, not a sliver**.
**Depends on:** Unit 2
**Verification:** `npx vitest run test/gis-coverage.test.ts` green with analytic expected values.

### Unit 4: The fixture set, including degenerate geometry
**Goal:** The brief §19 / runbook §5 fixtures, synthesized deterministically in code.
**Files:** `test/fixtures/gis/plantings.ts` (new), `test/fixtures/gis/rasters.ts` (new)
**Approach:** Generate in TypeScript rather than committing binaries — deterministic, diffable, and it
matches the repo's inline-golden convention. Build: a planting crossing pixels at exactly
0.10/0.25/0.50/0.90, **split into two blocks with a byte-identical shared boundary** (shared vertices,
not merely coincident-looking); a planting with a non-vine hole; a **U-shaped block re-entering one
pixel** (the ULP case); a narrow block dominated by boundary pixels; a **high-vertex block (~2000
vertices at small area)** for the Unit 15 sweep; two disconnected plantings; and the degenerate cases —
a sliver below ε_geom, a self-touching ring, a hole tangent to the outer boundary (each with its
**expected Unit 1 rejection code** as data). Plus a synthetic Red/NIR/SCL stack with known NDVI and a
known grid transform, including a deliberate **half-pixel-offset variant** — research names
pixel-corner-vs-pixel-centre geotransform confusion as *the* realistic failure, and it must be a fixture
we detect rather than a bug we ship.
**Tests:** a meta-test asserting the shared-boundary fixture's two blocks genuinely share identical
coordinates.
**Depends on:** Unit 2 (needs ε_geom to define "sliver")
**Verification:** fixtures import cleanly under node; meta-test green.

### Unit 5: Per-cell coverage validation vs `exactextract` — **EARLY DECISION GATE**
**Goal:** Prove the clipper against a tool we did not write, **before** anything is built on top of it,
and derive ε_agree empirically.
**Files:** `scripts/gis-p0-validate-coverage.ts` (new), `docs/GIS/phases/p0-validation-coverage.md` (new)
**Approach:** ⚠️ **COUNCIL CRITICAL (both reviewers) — this unit moved from #8 to #5.** The first draft
stacked zonal stats, NDVI, and color on a clipper that had not been independently validated. If the
clipper is wrong, the failure must stop the plan before it contaminates everything downstream.

Export the Unit 4 fixtures as a real GeoTIFF + GeoJSON pair. Install the oracle with
**`pip install exactextract`** — official `win_amd64` wheels exist for CPython 3.9–3.13, so no conda, no
OSGeo4W, no Docker, no WSL. Request the per-cell arrays, which only exactextract provides:
`["cell_id", "center_x", "center_y", "coverage", "values"]`. Diff **cell by cell**, joined on
`cell_id` — an aggregate can match while individual cells are wrong in compensating directions, which
is exactly the bug this gate exists to catch.

**Derive ε_agree here** by running our clipper at maximum precision and observing the empirical
distribution of per-cell differences, then classifying: float-ordering noise (~1e-15…1e-12),
algorithmic difference (~1e-12…1e-9), or **a bug** (≥1e-3). Starting gates: per-cell absolute **1e-9**;
investigate at 1e-6; **hard fail at 1e-4** (1e-4 on a 10 m pixel is 1 cm² — no double-precision path
produces that by accident). Also assert the oracle-free invariant **`Σ coverage × pixelArea ≈
polygonArea`** to ~1e-9 relative — ⚠️ this is the only check that catches the *silent* sliver /
dropped-ring class, which research shows is the dominant real-world failure in this library family.
Run it against the half-pixel-offset fixture too: that failure appears as a large, systematic,
**edge-only** disagreement, not a tolerance question.
**Kill criterion:** per-cell disagreement beyond 1e-4 attributable to our clipper → Unit 3's `jsts`
fallback fires, and Units 6+ do not start until this gate is green.
**Tests:** the script is the test.
**Depends on:** Units 3, 4
**Verification:** `p0-validation-coverage.md` records tool + version + install path, the per-cell
difference distribution, the derived ε_agree with its classification reasoning, the area-conservation
result, and an explicit pass/fail on shared-boundary no-double-count.

### Unit 6: Coverage-weighted zonal statistics
**Goal:** The brief §15 statistics block, coverage-weighted, with the quantile estimator pinned.
**Files:** `src/lib/gis/zonal.ts` (new), `test/gis-zonal.test.ts` (new)
**Approach:** Weighted mean `Σ(v·f)/Σf`; min/max over positive-coverage valid pixels; coverage-weighted
p10/p25/median/p75/p90 and standard deviation; effective pixel count `Σf`; physical covered area; valid
count and percentage; coverage-fraction distribution. Pin and document the weighted-quantile estimator
precisely. Return `null` rather than throwing when a zone has no valid coverage
(`units.ts:18-23` precedent). No I/O, no blob SDK, no React.
**Tests:** weighted mean of a hand-computable case; zero valid pixels returns `null` not `NaN`;
all-equal values give zero standard deviation; weighted median of a symmetric weighted set; **the
double-count invariant** — per pixel `Σ coverage(block_i) ≤ 1 + ε_geom`, and the two blocks' weighted
stats reconcile with the parent planting's.
**Depends on:** Unit 5 (gate)
**Verification:** `npx vitest run test/gis-zonal.test.ts` green.

### Unit 7: NDVI numeric policy, SCL masking, and the **real** radiometric guard
**Goal:** Brief §5's NDVI contract implemented exactly, with the radiometric failure mode pinned.
**Files:** `src/lib/gis/ndvi.ts` (new), `test/gis-ndvi.test.ts` (new)
**Approach:** Implement verbatim: if red or NIR is no-data or quality-masked, or
`abs(nir + red) < ε`, output no-data; otherwise `clamp((nir - red) / (nir + red), -1, 1)`. No-data must
be a distinct representable value — not `0`, not accidental `NaN`. Apply the SCL mask: keep `{4, 5}`,
flag `{7}`, exclude `{0,1,2,3,6,8,9,10,11}`. ⚠️ Cloud **shadow (3)** is the class most often forgotten
and the most damaging — it depresses NDVI without looking like cloud.

⚠️ **COUNCIL CRITICAL (Gemini) — the first draft's radiometric premise was backwards.** In REFLECTANCE
units the BOA offset is applied *regardless* of `harmonizeValues`; the flag only clamps negatives to
zero. So the real baseline guard is **`units: "REFLECTANCE"`**, and `harmonizeValues` must be **`false`**
— because clamping `B04 → 0` yields `NDVI = (B08−0)/(B08+0) = exactly 1.0`, a fabricated maximum.
Pinning it `true` would have built a contract test that *guarantees* corrupted data. This module must
therefore **accept negative reflectance natively** and treat `NDVI === 1.0` as a sentinel worth flagging,
consistent with brief §5's insistence on explicit no-data over silent epsilons.
**Tests:** known Red/NIR arrays produce known NDVI; zero denominator yields no-data, not Infinity; a
masked pixel yields no-data regardless of band values; clamping at both ends; **negative reflectance is
carried, not clamped**; **an un-harmonised (DN-style, offset-unapplied) input produces the documented
−0.257 error at vigorous-canopy values** — the regression pinned as a test, with the magnitude asserted
so a future refactor cannot quietly reintroduce it.
**Depends on:** Unit 4
**Verification:** `npx vitest run test/gis-ndvi.test.ts` green.

### Unit 8: Color domain, palettes, resampling, and one 3×3 derivative
**Goal:** The display math, kept pure and honest about resolution.
**Files:** `src/lib/gis/color.ts`, `src/lib/gis/smooth.ts` (new), `test/gis-color.test.ts`,
`test/gis-smooth.test.ts` (new)
**Approach:** Robust p5–p95 domain over **all valid pixels in the vineyard**, not per block (brief §6.1
— per-block rescaling makes two blocks of different vigour look equivalent), using the same coverage
weighting as Unit 6 so domain and statistics cannot disagree. Two palettes: vigor-classic and
purple→green, both reversible, both with numeric stop values. Nearest and bilinear **display** resampling
as functions separate from anything statistical, with the contract that display resampling never feeds
statistics (brief §7.1). One 3×3 analytical derivative with **edge-aware masking** so pixels outside the
planting cannot bleed inward, labeled with its kernel and method (brief §7.4).
**Tests:** percentile domain goldens; a degenerate all-equal distribution yields a non-zero-width domain
rather than divide-by-zero; palette stop goldens including reversed; values below p5 / above p95 clamp;
3×3 goldens including a boundary pixel and a no-data neighbour; smoothing an all-equal field is the
identity.
**Depends on:** Units 6, 7
**Verification:** both test files green.

### Unit 9: Statistics validation vs `exactextract` — DECISION GATE
**Goal:** Validate the aggregate statistics, having already validated the coverage fractions.
**Files:** `scripts/gis-p0-validate-stats.ts` (new), `docs/GIS/phases/p0-validation-stats.md` (new)
**Approach:** ⚠️ **COUNCIL (Codex) — scope this oracle carefully.** Weighted quantiles are
*definition-dependent*, and exactextract is only an oracle where the estimator matches. Use it for
**coverage-weighted mean, counts, min/max, and area** — quantities with one correct answer. Validate
**quantiles against analytic fixtures instead**, never against exactextract, or an estimator mismatch
contaminates the clipper verdict with a disagreement that is nobody's bug.
**Tests:** the script is the test.
**Depends on:** Units 5, 6
**Verification:** `p0-validation-stats.md` records the comparison table, states which statistics were
oracle-validated and which were analytically validated, and why.

### Unit 10: Provider adapter — config, token cache, offline mock
**Goal:** A provider-neutral satellite adapter with hardcoded egress and an in-memory token cache,
fully testable offline.
**Files:** `src/lib/gis/satellite/{config,token,client,mock}.ts` (new),
`test/gis-satellite-token.test.ts`, `test/gis-satellite-client.test.ts` (new)
**Approach:** Follow the four-file provider shape. `config.ts` mirrors `src/lib/voice/config.ts` with
`qbo/config.ts:9-13` security constants: `satelliteEnabled()`, a hardcoded `as const` origin object
(`https://sh.dataspace.copernicus.eu` for Process, `https://identity.dataspace.copernicus.eu` for OAuth,
`https://stac.dataspace.copernicus.eu` for provenance), and a throwing `loadSatelliteConfig()`.
`token.ts` is the collapsed client-credentials cache — module-level `{ token, expiresAtMs }`, skew
guard, `_clearTokenCache()` seam, `deps?: { fetchImpl? }` — with a header comment stating **why** the
QBO locking/CAS/encryption machinery is absent (no rotating refresh token). ⚠️ Read expiry from the
response's `expires_in` / the token's **`exp` claim** rather than hardcoding — CDSE does not document a
fixed lifetime, and the docs explicitly warn that token requests are rate-limited and must not be made
per API call. 📌 **Measured 2026-07-24: `expires_in = 1800 s` (30 min), matching `exp − iat`.** So the
120 s skew is 6.7% of the lifetime — comfortable, and worth a test that asserts we *read* the value
rather than assume 1800, since CDSE may change it. `client.ts` sets `redirect: "error"`,
classifies faults via a pure exported `classifyFault`, retries only rate-limit/transient with
full-jitter backoff honoring `Retry-After`, and **never logs tokens, signed URLs, or farm geometry**
(rule §2.12). Any raster URL arriving *in a provider response* is attacker-influenceable — apply
`assertPublicHost` (`src/lib/knowledge/crawl/ssrf.ts:43`) **and** an origin allowlist.
**Tests:** token reused inside the skew window, refetched outside; `_clearTokenCache()` forces refetch;
401 classifies as auth and is **not** retried; 429 honors `Retry-After`; a redirect is an error;
**contract test on the request body: `units: "REFLECTANCE"` and `harmonizeValues: false` — fails if
either is ever changed**, with a comment citing the −0.257 error it prevents. All with injected
`fetchImpl`; no network.
**Depends on:** Unit 0
**Verification:** both test files green with zero network; `grep` shows no token/URL logging.

### Unit 11: One live **estate-wide** round-trip + STAC provenance — MEASUREMENT
**Goal:** A real scene over a real estate, with radiometry pinned and provenance actually obtainable.
**Files:** `scripts/gis-p0-live-scene.ts` (new), `docs/GIS/phases/p0-live-roundtrip.md` (new)
**Approach:** Run once, by hand, from the **main checkout** (worktrees have no `.env`). ⚠️ **One
request for the whole estate**, not one per block (Russell's call — requests bind 26× sooner than PU).
B04/B08/SCL as FLOAT32, `resx/resy: 10` to pin the native grid, `units: "REFLECTANCE"`,
`harmonizeValues: false`, resampling left at the `NEAREST` default and **recorded**.

⚠️ **COUNCIL CRITICAL — provenance needs a second call.** The processing baseline is **not** in the
Process API response; `inputMetadata.serviceVersion` is Sentinel Hub's service version and recording it
as the baseline would be silently wrong. Make an out-of-band **CDSE STAC** call
(`https://stac.dataspace.copernicus.eu/v1/search`, collection `sentinel-2-l2a`) and read
`processing:version`, cross-checked against the `_N0511_` token in the SAFE product id.

Record: units + harmonizeValues, resampling method, **processing baseline (from STAC)**, provider scene
ID, acquisition time, output CRS + grid transform, byte size, PU consumed, request count. Then run the
Unit 3/6/7 math over the **real** raster — the fixtures prove correctness, this proves the pipeline
survives real no-data regions, real SCL classes, and a real UTM grid. Record the required attribution
string **`Contains modified Copernicus Sentinel data 2026`**. No DB writes; do not commit scene bytes.
**Tests:** none — a measured artifact; rule §2.4 forbids deterministic tests calling live providers.
**Depends on:** Units 7, 10, and Unit 0's credentials
**Verification:** `p0-live-roundtrip.md` contains the full provenance block including the STAC-sourced
baseline, PU + request cost, and statistics over the live scene, with the reference product named nowhere.

### Unit 12: Blob storage behavior — MEASUREMENT
**Goal:** Confirm the storage access patterns the no-worker design assumes.
**Files:** `scripts/gis-p0-blob-spike.ts` (new), `docs/GIS/phases/p0-storage.md` (new)
**Approach:** Store the Unit 11 raster as a **private** blob under the existing convention
(`<pathPrefix>/<tenantId>/…`, `access: "private"`, `addRandomSuffix: true`, sha256 for dedup).
✅ **All three of the first draft's storage unknowns are now closed**, so this unit shrinks to
measurement only: range requests are documented and supported; private stores exist; and the one item
research had to leave **UNVERIFIED** — **private blob + `Range` header → HTTP 206** — was **confirmed
live on 2026-07-24** (256 B private `put` 464 ms; `head` correct; ranged `GET` returned exactly 4 bytes
with HTTP 206 in 327 ms; probe deleted). That materially de-risks the storage half of the no-worker
design: a COG-style range-indexed layout on Blob is viable, not hoped-for. What remains is measuring
**cold vs warm read latency at real raster size** and repeated-read/egress behavior. ⚠️ **Codify the 512 MB per-blob CDN cache ceiling as an asserted
invariant**: above it every access is a cache miss plus a billed operation. An estate raster at 500 ha /
10 m / 3 bands FLOAT32 is well under 1 MB, so it passes comfortably — but the limit belongs in the doc,
not in someone's memory. Existing validators reject anything not PNG/JPEG/PDF by magic bytes and cap at
5–10 MB, so a raster needs its own validator and its own justified cap — propose the number.
**Tests:** none — measurement.
**Depends on:** Unit 11, and Unit 0's blob token
**Verification:** `p0-storage.md` records latencies, the private+Range 206 result, the asserted cache
ceiling, the proposed size cap, and the authorized-read path.

### Unit 13: Canvas render proof — MEASUREMENT
**Goal:** Prove the *display* half of the no-worker hypothesis: an in-memory raster reaches Leaflet
without a tile server, without blocking the main thread.
**Files:** `src/lib/gis/render.ts` (new), `test/gis-render.test.ts` (new),
`docs/GIS/phases/p0-render.md` (new)
**Approach:** ⚠️ **Promoted from a sketch to a proof (Russell, 2026-07-24, on Gemini's argument).** The
final mile of a no-worker architecture is getting a computed float32 array onto a Leaflet
`ImageOverlay`/canvas, alpha-clipped to the vector boundary, with no tile server. If painting that
blocks the main thread for seconds, the architecture fails at the display end even with perfect math —
and runbook §5 already lists nearest-vs-bilinear rendering in P0 scope, so this is not scope creep.

Keep the **pixels → RGBA** transform a pure function (`render.ts`, node-testable, no DOM), and put only
the `ImageData`/canvas handoff in the browser step. Measure main-thread block time at estate scale for
both nearest and bilinear, and for the 3×3 derivative layer. Record whether an `OffscreenCanvas` or a
chunked write is needed. Note the constraints the eventual P1 overlay must satisfy — discovered in
research and unchanged: the block-polygon effect at `SatelliteMap.tsx:478-528` **destroys and rebuilds
`overlayRef`** on every change to `[blocks, unit, lat, lng, editable]`, so a raster layer needs its own
ref and effect or it dies on the first block edit; it must stay out of `fitBounds` (`:523`); and it must
set `crossOrigin: true` to survive `html-to-image` PNG export.
**Tests:** `test/gis-render.test.ts` covers the pure transform — domain → RGBA mapping, no-data →
transparent, palette stops honored, alpha clipping at a fractional-coverage boundary pixel. The canvas
paint itself is manual QA (no jsdom).
**Depends on:** Units 8, 11
**Verification:** `p0-render.md` records main-thread block time at estate scale for both resampling
modes, with a screenshot, and a stated verdict on whether the paint is viable on the main thread.

### Unit 14: Runtime, memory, and scaling — MEASUREMENT, with **pre-committed** kill criteria
**Goal:** The numbers that decide the no-worker question.
**Files:** `scripts/gis-p0-measure.ts` (new), `docs/GIS/phases/p0-measurements.md` (new)
**Approach:** ⚠️ **COUNCIL CRITICAL (both) — the first draft measured the wrong axis and its criteria
were prose.** Hectares are a weak proxy for runtime: S-H is **O(vertices × pixels)**, so the variables
that actually break this are **vertex count, hole count, and multipolygon part count**. As Codex put it,
*"a 5 ha geometry with 20k vertices is a more meaningful stressor than a 500 ha rectangle."*

Sweep **area × vertex count × hole count × part count × block count** independently, over one
estate-wide raster clipped N ways (the real load). Measure end-to-end wall time and peak RSS for
fetch → decode → mask → NDVI → coverage over N blocks → stats → 3×3 derivative → blob write.

**Kill criteria, pre-committed before the first run** (falsifiable, at *realistic* scale — 50 ha estate,
20 blocks, ≤2000 vertices/block — not the stress case):

| # | Criterion | Kill if |
|---|---|---|
| K1 | End-to-end wall clock, excluding provider latency | **> 5 s** |
| K2 | End-to-end wall clock, including provider latency | **> 10 s** |
| K3 | Peak RSS | **> 512 MB** (2× headroom under a 1024 MB function) |
| K4 | Scaling in total vertex count | 10× vertices costs **> 20× time** (i.e. worse than sub-quadratic) |
| K5 | Scaling in block count against one raster | 10× blocks costs **> 15× time** |
| K6 | Stored raster size | **> 50 MB** (would approach the 512 MB cache ceiling as estates grow) |

Any single kill criterion met at realistic scale ⇒ **no-go**, and the brief §13 worker fallback is the
recorded verdict. Meeting one only in the 500 ha stress case is a **tripwire**, not a kill — record it
in the scale-register instead.
**Tests:** none — measurement.
**Depends on:** Units 8, 11, 12, 13
**Verification:** `p0-measurements.md` contains the sweep table across all five axes, the pre-committed
criteria above reproduced verbatim, and a plain statement of which were met.

### Unit 15: The verdict — ADR, registers, runbook correction, phase report — DECISION GATE
**Goal:** Record the go/no-go so P1 can start, and correct the runbook where P0 proved it wrong.
**Files:** `docs/architecture/decisions/0009-vineyard-intelligence-no-worker-architecture.md` (new),
`docs/architecture/decisions/README.md` (index line), `docs/architecture/scale-register.md`,
`docs/architecture/security-register.md`, `docs/GIS/VINEYARD_INTELLIGENCE_RUNBOOK.md` (§2.13 correction
+ §3 verdict + §7 ledger row), `docs/GIS/phases/phase-0-report.md` (new), `NOW.md`
**Approach:** ADR 0009 in the real house format — H1, then the bullet metadata block (**no YAML
frontmatter**; that is invariants), the `**Plan:** \`docs/plans/…\`` line recent ADRs carry, then
Context / Decision / What was rejected / Consequences / **Verification**. It records *three* decisions:
the no-worker go/no-go, the clipping foundation + ε_geom, and the `proj4` dependency with its
P1-removal condition. Show the work, including anything Unit 5 proved wrong. Add the hand-maintained
index line to `decisions/README.md` (nothing verifies this; it silently rots).

⚠️ **Correct runbook rule §2.13.** P0 proved its stated mechanism wrong: `harmonizeValues` does not
control offset harmonisation in REFLECTANCE units, and pinning it `true` fabricates `NDVI = 1.0`. The
rule's *intent* — radiometric honesty across time — is right and stays. Rewrite the mechanism to
"pin `units: REFLECTANCE`, set `harmonizeValues: false`, and record the processing baseline from the
STAC catalogue." Also correct §5's claim that the baseline is recordable from the Process response.

Scale-register entry in the `Choice / Fine until / What breaks / Mitigation / Tripwire / Status`
vocabulary, with the tripwire being whichever Unit 14 measurement sits closest to its kill threshold.
Security-register entry (H3 as an asserted fact, bullets, `- **Status:**`) covering the three new
outbound origins, the new secret, the private-blob write path, and the SSRF posture. Then the runbook
§3 verdict and the §7 ledger row → 🟩. Finally `docs/GIS/phases/phase-0-report.md` per runbook §8.
**Tests:** none.
**Depends on:** Units 5, 9, 13, 14
**Verification:** `npm run verify:invariants` green; every runbook §5 P0 gate item has a named artifact;
runbook §2.13 corrected; `NOW.md` `_Last updated_` stamped.

## Test Strategy

Units 1–3 and 6–8 are pure modules with node tests under `test/gis-*.test.ts`, flat, named as invariants
in the `harvest-chart.test.ts` voice. Expected values are **analytic**, not recorded output — a golden
that merely records what the code did on its first run proves nothing, and this phase's entire purpose
is correctness.

No component tests (no jsdom, no RTL). No deterministic test calls a live provider. Unit 10 proves the
client with an injected `fetchImpl`; Units 11–14 are hand-run measured artifacts.

**The three tests that matter most**, each pinning a failure that would otherwise ship silently:

1. **Unit 3's U-shape regression** — catches the ULP bridge-cancellation failure, where area leaks with
   no error raised.
2. **Unit 5's area-conservation assertion** (`Σ coverage × pixelArea ≈ polygonArea`) — the only
   oracle-free check for the silent sliver/dropped-ring class that dominates real failures in this
   algorithm family.
3. **Unit 10's request-body contract test** (`REFLECTANCE` + `harmonizeValues: false`) — pins the
   −0.257 NDVI error at vigorous canopy. That failure would appear as a real vineyard trend, which is
   the worst kind of bug this product can ship.

Optional: wire `scripts/gis-p0-validate-coverage.ts` as `verify:gis-coverage` so P1 inherits a working
proof harness. It does **not** need `runAsTenant` since P0 writes no rows — a deliberate deviation from
Shape B, and it should be commented as such.

## Rollout

One branch, one PR, no production surface, no migration, no feature flag. Run from the main checkout for
anything touching `.env`; the worktree is fine for pure math after `npm ci`.

Reviewable in three parts: Units 1–9 are code with tests; Units 11–14 are measurement artifacts whose
review question is "do these numbers support the verdict?"; Unit 15 is the verdict itself.

Done when runbook §7's P0 row is 🟩 and §5's gate list has an artifact against every item. Per runbook
§4, **P4 and POF have no dependency on P0's verdict** — so if P0 lands a no-go, those two lanes still
start on schedule while P1 is re-planned against the worker architecture.

## Open Questions

1. **Does the estate-wide fetch change P2's scene model?** One raster per estate per date rather than
   per block changes what `SpatialScene` keys on. P2 inherits whatever P0 establishes, so this is worth
   deciding here rather than there.
2. **Does steep terrain break the premise?** Bhutan is steep, and rule §2.13 warns slope/aspect
   illumination shows up as fake within-planting pattern under relative scaling. P0 need not solve it,
   but the live round-trip is the cheapest chance to *look*. One paragraph in the phase report.
3. **Does any real vineyard AOI span two UTM zones?** Unit 2 defines the behavior; whether real data
   hits it is unknown until we check.
4. **Does `proj4` survive into P1?** Added for the spike on the explicit understanding that P1 may
   remove it once the clipper is proven. Record the condition in ADR 0009 so the option is not lost.
5. **Should Unit 1's canonical geometry refactor ship in this PR or its own?** It touches production
   files in a phase that otherwise ships none. Recommend keeping it — P0's math needs to run against
   the real type — but it is the one piece with production blast radius.

## Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | Runbook states the gate and dependency edges; research independently confirmed the geometry-robustness risk with cited issues |
| Scope Boundaries | HIGH | Deliberate deferrals named rather than silent |
| Units 1–3 (geometry core) | **HIGH** | ⬆ from the first draft — the convex-window reframe was independently confirmed by both council reviewers, *and* both preconditions they surfaced (validity rejection, exact edge-scalar assignment) are now explicit units with regression tests |
| Unit 5 (validation gate) | **HIGH** | ⬆ — exactextract Windows wheels and per-cell `coverage` output are confirmed, so the cell-by-cell diff is known-possible rather than hoped-for. ε_agree is now derived rather than assumed |
| Units 6–9 | HIGH | Pure math against a well-specified contract, gated behind a validated clipper |
| Units 10–12 (provider + storage) | **HIGH** | ⬆⬆ — request shape, `harmonizeValues` semantics, PU formula, SCL classes, and the STAC provenance route are confirmed against official docs; and on 2026-07-24 the credentials were exercised live: **CDSE token grant works (`expires_in = 1800 s`)** and **private-blob `Range` → HTTP 206 is CONFIRMED**, closing the last UNVERIFIED item. Nothing in these units now rests on an assumption |
| Unit 13 (render) | **MEDIUM** | New unit, promoted from a sketch. The pure transform is straightforward; the main-thread cost at estate scale is a genuine unknown — which is exactly why it is being measured rather than assumed |
| Unit 14 (measurement) | **HIGH** | ⬆ — kill criteria are now six pre-committed numbers across the axes that actually drive cost, rather than prose about "headroom" |
| Risk Assessment | **MEDIUM-HIGH** | ⬆ — the clipping reframe survived adversarial review from two independent models with proofs. Residual risk sits in the two things still unmeasured: main-thread render cost (Unit 13) and real-data behavior (Unit 11) |

**What remains genuinely unknown after this revision:** the main-thread canvas cost at estate scale
(Unit 13), and how the math behaves on real rather than synthetic rasters (Unit 11). Both are measured
by units in this plan rather than assumed by it — which is the difference between a spike and a plan.
The third unknown, the private-blob range request, was **closed on 2026-07-24** by exercising it
directly against the live store.
