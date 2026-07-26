# Phase 4 — Soil documentation layer (NRCS SSURGO) — implementation plan

**Lane:** Vineyard Intelligence Wave 1, lane B (brief Release 1C). Cards-first, **no map
components** (map-unit overlay is an explicit Wave-4 spike, kept out so this lane never
touches `SatelliteMap`).
**Depth:** Deep — new tenant-scoped table + RLS, an external government API client, a pure
aggregation core with subtle correctness rules, 8 UI states, an assistant tool, and a
`verify:soil` e2e gate.
**Dependency:** only existing `VineyardBlock.polygon` (GeoJSON WGS84). No dependency on
P2/P3/P5. Runs in parallel with P3 (NDVI display) and P8 (weather).
**Status:** ✅ **BUILT + browser-QA'd on branch `feat/vi-p4-soil` (2026-07-25), not yet PR'd.**
All 9 units committed; migration applied to prod (additive). Gates green: tsc 0, full vitest
4024/0, `verify:soil` 23/23 (e2e DB, injected SDA), `verify:tenant-isolation` (+soil A/B RLS),
`verify:invariants` 39/39 (SOIL-1), `verify:ai-native`, `verify:naming` 25/25. Live browser QA
in Demo (in-app pane): pulled a real Finger Lakes block → 6 soil cards + "Other (4 slivers)" +
Water folded/retained, cited pH/drainage/depth, 100% covered, survey NY123; DB read-back matched.
Gating spike **COMPLETE 2026-07-20** (2 adversarial rounds, 6/10 → 8/10 → BUILD); re-verified live
2026-07-25. Spike results override three design-body decisions — already folded in, do not re-derive.

**Authoritative inputs (read before building):**
- Runbook §5 "P4 — Soil documentation layer" (`docs/GIS/VINEYARD_INTELLIGENCE_RUNBOOK.md`).
- Discovery brief §11.4, §13.6, §14 `BlockSoilSnapshot`, §19 fixtures
  (`docs/GIS/vineyard-intelligence-discovery-brief.md`).
- External design doc (out-of-repo, load-bearing):
  `~/.rstack/projects/wine-inventory/russe-claude-usgs-soil-maps-vineyard-eabe6c-design-20260720-005928.md`
  — read the "Spike Results" section first; it deletes turf/P2/P3 and adds NEW-1 (Water is a
  map unit) and NEW-2 (share floor).
- Auto-memory `nrcs-ssurgo-soil-api-spike`.

---

## Problem frame

Users with a block boundary already drawn in Cellarhand leave the product to get soil data:
they open USDA Web Soil Survey, **re-draw the same boundary by hand**, export a PDF, and file
it. Once per block, redone on every boundary change. This feature deletes that chore — one
button on the block panel pulls the composition from the polygon the user already drew, keeps
each soil's NRCS-published properties intact, and stores a dated, sourced snapshot on the block.

It is a **documentation / completeness** feature (Premise 1–3): a reference artifact filed and
referenced occasionally, not an input to a cellar or irrigation decision. That framing is
load-bearing — it is *why* we do not blend properties (see the invariant below).

**Reframe the pitch (spike Q1):** "which soils is this block on, and what are they" — not
"composition analysis." Real Finger Lakes blocks come back lopsided (92.5% / 7.5%) and Napa
valley floor returns a single map unit. Single-map-unit is the *normal* result on uniform
terrain, not an edge case.

---

## Load-bearing decisions (settled — do not re-open at build time)

1. **One SDA round trip, server-side clip (spike Q2 = P1 works).** T-SQL against `mupolygon`
   using `mupolygongeo.STIntersection(...)` joined to `mapunit` + `muaggatt`, 74–315 ms
   observed. **No turf, no PostGIS, no bbox fetch, no multi-call pipeline** — P2/P3 access
   branches from the design are deleted. **[council C2/C6]** Clip in a **CTE/subquery that
   returns exactly one row per `mukey`** *before* joining component/horizon summaries — a bare
   join to `component`×`chorizon` multiplies rows (one mukey × 4 comps × 6 horizons = 24 rows =
   24× the area) and silently inflates shares. Join only **aggregated** property summaries back
   onto the one-row-per-mukey clip. Append **`.MakeValid()`** to the WKT geometry before every
   spatial method (`geometry::STGeomFromText(@wkt,4326).MakeValid()…`) so an ordinary self-
   intersecting / bad-winding hand-drawn polygon does not throw a SQL-Server 500.
2. **`STArea()` on WGS84 returns square degrees — good for *shares*, never for stored m².**
   The cos(lat) factor cancels in the ratio, so area *shares* are exact with no projection.
   **[council C3/C5]** Do **NOT** persist a cos(lat)-scaled m² — a single-latitude scalar is
   wrong for AK / tall N-S blocks and `areaSqM` is durable. Compute the block's **geodesic area
   locally** (`geometry-meta.ts` `geodesicAreaM2`) and derive `areaSqM = normalizedShare ×
   blockGeodesicAreaM2`. Any cos(lat) used for a *display-only* figure must be
   `Math.cos(lat*Math.PI/180)` (radians).
3. **Coverage ratio is the invariant, never "shares sum to 100%."** Compute
   `covered = Σ(intersection area) / area(block)` **with numerator and denominator from the SAME
   geometry engine**. **[council C4]** Add `geometry::STGeomFromText(@wkt,4326).MakeValid().STArea()`
   as an explicit SDA column for the block-area denominator, so both sides are SQL-Server planar —
   never mix app-side spherical block area with SDA square-degree intersection area (that yields
   nonsense like −999900% uncovered). **Three branches** (ε = 0.005, spike-calibrated, fixed):
   `>1+ε` → flag as anomaly, do NOT normalize away; within `1±ε` → normalize against intersection
   sum; `<1−ε` → normalize against **block area** and emit an explicit `uncovered: N%` row. Never
   normalize against the intersection sum unconditionally (it hides missing coverage).
4. **Do NOT blend block-level properties.** Area % is the only value we aggregate. Every
   property (drainage, pH, AWC, restrictive depth) stays per-map-unit, cited to a `mukey` at the
   level NRCS publishes it. Enforced as an invariant note (Unit 8), not a lint.
5. **Non-soil is a map unit, not a gap (NEW-1).** Water / Pits / Rock outcrop / Urban land / Area
   not surveyed come back at 100% coverage with a major component. Classify them explicitly and
   surface distinctly, never as a soil. **Detector decision:** primary = component-level test
   (miscellaneous-area / water components carry no horizons and no taxonomic class), secondary =
   `muname` denylist as a belt-and-suspenders. `mukind` does NOT distinguish them. **[council C9]**
   Classify a map unit as wholly non-soil **only if its major-component set is exclusively
   misc/water/non-soil**; a mukey with a major mineral component + a minor water/misc component is
   `mixed` — keep its soil properties, do not suppress them.
6. **~1% minimum-share floor (NEW-2).** Sub-floor slivers are grouped under an `other` line
   (do not silently drop). **[council C8]** The grouping is **UI-layer only** — **every mukey and
   its properties stay in the `components` JSON** so the no-blend / cited-provenance invariant holds
   for minority soils too. Real hand-drawn (irregular) blocks clip MORE neighbor delineations than
   the spike's synthetic squares, so the floor is more load-bearing in production.
7. **Snapshot storage: supersede-not-delete, guarded by a geometry-version CAS.** One current row
   via partial unique `(tenantId, blockId) WHERE supersededAt IS NULL`; superseded rows retained
   (correction-as-event posture — a sourced soil claim can end up on a label, so reproducibility
   matters). **[council C1/C11]** The real race is **geometry change during the slow SDA fetch**,
   not a double-click: capture `expectedGeometryVersion` + fingerprint *before* the network call,
   then inside the write tx **row-lock the block (`FOR UPDATE`) and no-op unless it still matches**
   — an older in-flight response must NOT supersede a newer snapshot. `UPDATE old→supersededAt` first
   and catch the unique-violation/P2025 to degrade gracefully (never 500). Cache key = polygon
   fingerprint **+ survey version** (so an annual SSURGO revision is not stale-forever); provide an
   explicit force-refresh; snapshot reads scoped by `tenant + block`.
8. **Injection invariant (stated, not accidental).** WKT sent to SDA is assembled *exclusively*
   from `Number`-typed finite coordinates that passed `validatePolygon`. No string from any
   source is ever concatenated into the T-SQL. Reviewable, matches `verify:raw-sql` culture.
9. **US-only.** Coarse static CONUS+AK+HI+PR+territories bbox test on the vineyard's
   `gpsLat`/`gpsLng` disables the control **before any network call**. In-bbox but empty response
   (Bhutan returns 0 rows cleanly in 74 ms) → "no survey coverage", not an error.
10. **`VineyardBlock.polygon` stays illustrative, not the area source.** Planted acreage remains
    `rowSpacing × vineSpacing × vineCount` (`src/lib/vineyard/units.ts`). Every soil area is
    labelled *polygon-derived*; the snapshot stores `areaSqM`, never acres. A disagreement between
    the two is real signal about drawing accuracy, surfaced, not papered over.

---

## Structural precedent

Mirror **P2 NDVI core** (shipped #495/#496) minus the cron/outbox — P4 is a synchronous
one-click pull, so it skips `SpatialAnalysisJob` / `job-sweep` / cron entirely and keeps only
the pure-core → server-action → immutable-snapshot layers.

| Layer | P2 file to mirror | P4 target |
|---|---|---|
| Schema slice | `prisma/schema.prisma` (`BlockSpatialMetric`) | `BlockSoilSnapshot` |
| RLS migration + self-guard | `prisma/migrations/20260725120100_ndvi_schema/migration.sql` | new `soil_*` migration |
| Pure compute core | `src/lib/spatial/block-metrics-core.ts` | `src/lib/soil/*-core.ts` |
| Outbound client + allowlist | `src/lib/gis/satellite/client.ts` + `config.ts` | `src/lib/soil/sda-*.ts` |
| Server action | `src/lib/spatial/actions.ts` | `pullBlockSoilAction` |
| Assistant tool + golden | `src/lib/assistant/tools/query-ndvi-stats.ts` + `test/evals/*.golden.ts` | soil summary tool |
| Console page / cards | `src/app/(app)/vineyards/ndvi/{page,NdviConsole}.tsx` | block-panel soil section |
| verify script | `scripts/verify-ndvi.ts` | `scripts/verify-soil.ts` |
| Staleness hook | `src/lib/gis/geometry-version.ts:33` (`markStaleFor`) | add `SOIL` dependent kind |

---

## Implementation units

### Unit 0 — Schema-first slice PR (`BlockSoilSnapshot` + RLS)

**Goal:** Land the tenant-scoped table, RLS, and isolation proof as a small standalone PR
*before* any feature code, so the shared `prisma/schema.prisma` choke point serializes cleanly
against the parallel P3/P8 lanes.
**Files:** `prisma/schema.prisma`; new `prisma/migrations/<ts>_soil_snapshot/migration.sql`;
`scripts/verify-tenant-isolation.ts` (add A/B fixture pair); `src/lib/tenant/models.ts` (confirm
NOT added to `GLOBAL_MODELS`).
**Approach:** Follow the AGENTS.md Phase-12 checklist verbatim (steps 1–9). Model per brief §14:
`tenantId String @default("")` + `@@index([tenantId])`; `id`, `blockId`; `pulledAt`,
`supersededAt DateTime?`; `surveyAreaSymbol`, `surveyAreaVersion` (from `sacatalog.saverest`);
`polygonFingerprint` (the normalized fingerprint from `geometry-meta.ts`, also the cache key);
`coveredPct Float`; `coverageState` (covered/partial/over/none); `components Json` (Zod-validated
on read); `processing/query version` + creator/audit metadata. Partial unique
`(tenantId, blockId) WHERE supersededAt IS NULL`. Cross-tenant FK to `organization(id)` ON DELETE
RESTRICT; block FK as raw-SQL composite `(tenantId, blockId) → (tenantId, id)` per the K11 rule,
no Prisma `@relation`. Migration: ENABLE + FORCE ROW LEVEL SECURITY + `tenant_isolation` policy
(USING **and** WITH CHECK on `current_setting('app.tenant_id', true)`), app_rls DML grant, and the
`DO $$ … RAISE EXCEPTION` self-guard copied from the NDVI migration.
**Tests:** `scripts/verify-tenant-isolation.ts` — seed a `blockSoilSnapshot` for tenants A and B,
assert cross-tenant SELECT→null / UPDATE→0 / INSERT→raise. The coverage guard (enumerates all
non-global models) fails automatically if RLS is missing — that is the backstop.
**Depends on:** none.
**Verification:** `npm run verify:tenant-isolation` green; `npm run verify:naming` green.
**Execution note:** land + merge this PR before Units 1–8; it is the serialization point.

### Unit 1 — Pure soil aggregation core

**Goal:** Turn a recorded SDA response into a validated, coverage-correct, per-map-unit
component set — no DB, no network.
**Files:** `src/lib/soil/parse-sda-core.ts`, `src/lib/soil/composition-core.ts`,
`src/lib/soil/classify-core.ts`, `src/lib/soil/schema.ts` (Zod component shape).
**Approach:** (a) Parser: `JSON+COLUMNNAME` is an **array of arrays, row 0 = column names, every
value a string**. Coerce explicitly with Zod (numeric/null), never assume objects. (b) Coverage:
the three-branch ratio from decision #3, ε = 0.005. (c) Share floor: fold sub-1% into `other`
(decision #6). (d) Classification: component-level non-soil test + `muname` denylist (decision #5),
emitting class ∈ `soil | water | non-soil | uncovered | other`. (e) Component assembly per brief
§14: `{ mukey, muname, class, areaPct, areaSqM, comppct, drainageClass, drainageBasis, awc,
awcUnit, ph, phBasis, restrictiveDepthCm }`. Properties: prefer `muaggatt` pre-aggregated columns
(`drclassdcd`), else topmost mineral horizon; **label the basis** either way. AWC: do not conflate
`muaggatt.aws025wta` (mm storage 0–25cm) with `chorizon.awc_r` (cm/cm fraction) — pick one slot,
label the unit. Major components only by default (`majcompflag='Yes'`); minors behind an expander.
**Tests (brief §19 soil fixtures, recorded responses only — never live NRCS):** array-of-arrays
parser with numeric/null coercion; coverage below/within/above 0.005; water/non-soil
classification; **mixed map unit (major mineral + minor water) keeps soil, not suppressed [C9]**;
single-soil result; sub-1% sliver → `other` **while its mukey+properties stay in the JSON [C8]**;
uncovered-area row; over-coverage anomaly flag; **one-mukey-multiple-components/horizons → a single
area contribution, not multiplied [C2]**; multi-ring donut area net of holes; **`areaSqM` derived
from local geodesic block area, verified against an AK/tall-N-S block [C3]**.
**Depends on:** none (parallel with Unit 0).
**Verification:** `npm test test/soil-*.test.ts` (new vitest files).

### Unit 2 — Block polygon → validated WKT

**Goal:** Serialize `VineyardBlock.polygon` to WKT safely, all rings, injection-proof.
**Files:** `src/lib/soil/wkt-core.ts`; reuse `src/lib/vineyard/actions.ts` `validatePolygon`
(64 KB / 2000-vertex cap) and `src/lib/gis/geometry-meta.ts` `geometryFingerprint`.
**Approach:** Emit `POLYGON((...),(...))` with **every ring** (holes included — sending only ring 0
overstates a donut block's area). GeoJSON is `[lng, lat]`; WKT here is `lng lat` — same order, but
**assert it in a test, do not assume**. Every emitted coordinate is a finite `Number` that passed
`validatePolygon` (decision #8). Compute the normalized `polygonFingerprint` here (7-decimal round,
canonical winding + start vertex) so a geometrically identical redraw does not pin a false stale badge.
**Tests:** multi-ring block WKT round-trip; axis-order assertion; fingerprint stable under
winding/start-vertex permutation; rejects non-finite / oversized geometry.
**Depends on:** none.
**Verification:** `npm test test/soil-wkt.test.ts`.

### Unit 3 — SDA client (allowlisted, timed, fail-soft)

**Goal:** Server-side POST to SDA with a hardcoded host allowlist, explicit timeout, and last-good
semantics.
**Files:** `src/lib/soil/sda-config.ts` (allowlist), `src/lib/soil/sda-client.ts`.
**Approach:** Mirror `satellite/config.ts` — `SDA_HOST = "https://sdmdataaccess.nrcs.usda.gov"` as a
**hardcoded HTTPS constant**, `isAllowedOrigin()` guard, `redirect: "error"`. POST
`{format:"JSON+COLUMNNAME", query}` to `/Tabular/post.rest`. **Add an `AbortController` timeout the
NDVI client does not model** (runbook: "timeout keeps last good snapshot"); borrow the abort idiom
from `src/lib/accounting/qbo/client.ts`. Return a typed result the orchestrator maps to fail-soft.
**[council C7]** Before calling `.json()`, assert `content-type` contains `application/json` — SDA
gateway/503 errors return an **HTML body at HTTP 200/503**, and a raw `.json()` throws a generic
syntax error that crashes `safeAction` instead of hitting the timeout/last-good state. Map
HTML/gateway bodies explicitly to the unreachable state. Logs/errors carry no credentials or URLs
(keyless — but keep the discipline).
**Tests:** contract tests with **recorded SDA fixtures only** — deterministic, never live; timeout →
signals last-good; **HTML/503 body → unreachable state (not a parse crash)**; arbitrary/redirected
host rejected; malformed/oversized response rejected.
**Depends on:** Unit 1 (parses the response).
**Verification:** `npm test test/soil-sda-client.test.ts`.

### Unit 4 — Orchestrator + `pullBlockSoilAction`

**Goal:** The one-click server path: gate → build WKT → call SDA → run core → persist → audit.
**Files:** `src/lib/soil/pull-core.ts` (orchestrator), `src/lib/soil/actions.ts`
(`pullBlockSoilAction` via the `safeAction` pattern). Route handler with explicit `maxDuration` if
a server action's budget is too tight.
**Approach:** Resolve the block via extended `prisma` (tenant auto-scoped) / `requireTenantId`.
US-bbox gate (decision #9) **before** any network call. **[council C1]** Capture the block's
`expectedGeometryVersion` + fingerprint *before* building WKT. Build WKT (Unit 2), call SDA (Unit 3),
run the core (Unit 1). Persist via `runInTenantRawTx` **([council C10]** the composite-FK write is
raw SQL and must carry `app.tenant_id` or RLS silently drops the write): **row-lock the block
`FOR UPDATE`** and **no-op unless `geometryVersion` still equals `expectedGeometryVersion`** — an
older in-flight SDA response must not supersede a newer snapshot. Then `UPDATE` the prior current
row → `supersededAt = now()` and insert the new one; **catch the partial-unique violation / P2025**
and degrade gracefully rather than 500. **Cache by `polygonFingerprint` + survey version** — an
unchanged polygon short-circuits before hitting SDA; provide a force-refresh path. `writeAudit` on
every pull (mirrors `saveBlockPolygon`). On SDA failure/timeout: keep the last good snapshot, return
a refresh-failure state, never destroy data. Return typed states, `safeAction`-wrapped so prod does
not redact the message.
**Tests:** covered in the Unit 8 `verify:soil` e2e (drives the real orchestrator with injected
transport). Unit-level: non-US gate blocks pre-network; **stale-write CAS** (pull on `vN`, edit to
`vN+1`, the `vN` response must not supersede); concurrent-insert unique-violation degrades not 500s;
cache hit skips SDA.
**Depends on:** Units 0, 1, 2, 3.
**Verification:** `npm run verify:soil` (Unit 8).

### Unit 5 — Geometry-version staleness wiring

**Goal:** A boundary edit marks the current soil snapshot stale (badge + re-pull), never deletes it.
**Files:** `src/lib/gis/geometry-version.ts` (add a `SOIL` dependent kind at the `NDVI_DEPENDENT_KIND`
site; `markStaleFor` returns `SOIL` alongside `NDVI`). The snapshot already carries
`polygonFingerprint`/`geometryVersion` from Units 0/2.
**Approach:** The header comment already reserves this ("P4 plugs in here the same way"). Staleness is
computed by comparing the block's current fingerprint to the snapshot's — the badge is a UI read
(Unit 6), the `markStaleFor` wiring makes the boundary-edit path aware of soil dependents for future
invalidation bookkeeping.
**Tests:** `markStaleFor` returns a `SOIL` entry; re-pull after edit supersedes rather than deletes
(asserted in `verify:soil`).
**Depends on:** Unit 0.
**Verification:** `npm test test/gis-geometry-version.test.ts` (extend existing).

### Unit 6 — Block-panel soil cards (all 8 states)

**Goal:** A cards-only soil section on the block panel — every soil its own property card, no map.
**Files:** soil section in `src/app/(app)/.../BlockDetails.tsx` / `VineyardSetup.tsx` (locate the
current block panel) + a client `SoilCards.tsx`; reuse `Card`/`Badge`/`Metric`/`Eyebrow`/`Collapsible`
from `src/components/ui`. **Do not import** `SatelliteMap`/`MapLegend` (lane stays cards-only).
**Approach:** Server component reads the current snapshot through extended `prisma`. Header line:
`NRCS SSURGO · pulled <date> · N% of drawn boundary covered`, plus the *polygon-derived vs planted
acreage* disclaimer. One card per meaningful map unit: share %, polygon-derived area (unit from
`VineyardDetail.defaultUnit`), drainage + basis, pH + basis, restrictive depth. Minors behind a
`Collapsible`. **8 states** (design doc §UI): no-polygon (link to draw); stale (badge + re-pull);
partial (`uncovered: N%` row); over-coverage (anomaly, not "healthy"); out-of-SSURGO (disabled control,
explained); in-bbox-empty ("no survey coverage"); SDA-timeout (last snapshot + refresh-failed);
single-map-unit ("100% X" stated as valid). **Unreadable snapshot degrades to a badge + re-pull,
never 500s the block page** (Zod-validate `components` on read). All colors/spacing from
`src/styles/tokens/*.css` per DESIGN.md. Call `router.refresh()` after a successful pull.
**Tests:** manual QA in the Demo Winery pane (repo has no jsdom/RTL); the state logic that is pure
(coverage → state label, unreadable-degrade) is unit-tested in Unit 1.
**Depends on:** Units 4, 5.
**Verification:** in-app browser QA against localhost:3000 (Demo Winery, `QA-Soil-*` block).

### Unit 7 — Assistant read tool + golden

**Goal:** A "block soil summary" read tool so `verify:ai-native` sees the soil core reachable.
**Files:** `src/lib/assistant/tools/soil-summary.ts`; register in `src/lib/assistant/registry.ts`;
add a case to `test/evals/assistant-read-tools.golden.ts`; anchor the core in the import graph
(mirror `src/lib/spatial/actions.ts:6-7`) if the tool does not import it directly.
**Approach:** Read tool (`kind: "read"`) — resolve block via `resolveVineyards(ctx.user, …)`, return
the current snapshot's per-map-unit summary (shares + soils + coverage state). No write, no
confirmation. Because `verify:ai-native` asserts every `*Core` is transitively reachable from a tool,
the soil `*-core.ts` files must be reachable through this tool or the anchor.
**Tests:** golden entry `{ utterance, tool, args }` validated against the registry schema (default,
deterministic mode). `verify:ai-native` passes with no new allowlist ratchet entry.
**Depends on:** Unit 4.
**Verification:** `npm run verify:ai-native`; `npm test test/evals/assistant-tools.eval.test.ts`.

### Unit 8 — `verify:soil` e2e + invariant note

**Goal:** One e2e proof script + the no-blended-property invariant, as the phase gate.
**Files:** `scripts/verify-soil.ts`; `package.json` (`"verify:soil": "tsx --conditions=react-server
--env-file=.env scripts/verify-soil.ts"`); `test/fixtures/soil/*` (recorded SDA responses);
`docs/architecture/invariants/soil-no-blended-properties.md` (+ `INVARIANTS.md` mirror row).
**Approach:** Mirror `scripts/verify-ndvi.ts`: `TENANT = "org_demo_winery"`, `QA-Soil-*` fixtures,
wrap in `runAsTenant`, drive the **real orchestrator** with an **injected SDA transport** (recorded
fixture bytes — no live NRCS), then read snapshot rows **back from the DB** to prove persistence.
Assert: pull + retain a snapshot; coverage states (partial/over/single/non-soil/uncovered) resolve
correctly; SQL-injection attempt is impossible (WKT is numeric-only); outbound-host allowlist rejects
a non-SDA host; timeout preserves last good; boundary edit supersedes (not deletes); RLS denies
cross-tenant read; unreadable-snapshot degrades without throwing. **Council regressions:
stale-write CAS (older in-flight response must not supersede a newer geometry version) [C1]; the
raw-SQL write carries tenant context via `runInTenantRawTx` [C10]; identical polygon in tenants A/B
yields separate tenant-owned rows with no shared metadata [C11]; HTML/503 SDA body degrades to the
unreachable state, not a parse crash [C7].** Cleanup at end. The invariant note
(typed: severity / enforcedBy / verify / appliesTo) records "no block-level averaged pH, AWC, drainage,
or restrictive depth exists" — enforced by review checklist + this note, not a lint (it is not
lintable). Keep `verify:naming`, `verify:raw-sql`, `verify:invariants` green.
**Depends on:** Units 0–7.
**Verification:** `npm run verify:soil` exits 0; `npm run verify:invariants` green.

---

## Scope boundaries (explicitly OUT)

- **Map-unit overlay / clipped soil-boundary rendering** — Wave-4 spike (needs a geometry/response-
  size spike first). This lane stays cards-only so it never touches map components.
- **Full agronomic roll-up** (block-level blended properties) — rejected by Premise 1 (Approach B).
- **Live WFS/WMS overlay** (Approach C) — was the P3-branch contingency; the spike proved P1, so it
  is not built.
- **Deprecating `VineyardDetail.soilType` free-text** — keep it, retitle as narrative/editorial soil
  notes; do not treat it as data (open Q1). No schema change here.
- **Fruit-source provenance on lots** — out of scope, likely a follow-on (open Q3).
- **turf / PostGIS** — not added (spike Q2). Tripwire logged in the scale register: revisit only if a
  feature needs cross-block spatial queries.

---

## Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem frame | HIGH | Deleting an observed manual chore; demand is revealed preference. |
| Scope boundaries | HIGH | Spike deleted the ambiguous branches (turf/P2/P3/overlay). |
| Implementation units | HIGH | P2 NDVI is a direct structural precedent; access pattern spike-proven. |
| Test strategy | HIGH | Brief §19 fixtures enumerated; recorded-response-only, deterministic. |
| Risk assessment | MEDIUM | Council pass (Codex+Gemini) hardened 11 findings into the plan
(`phase-4-council-feedback.md`): the stale-write CAS, SDA join multiplicity, and geodesic `areaSqM`
were the ones that would have shipped a wrong report. Only open runtime risk is SDA's no-SLA
availability — mitigated by timeout + last-good + fingerprint cache; not a build risk. |

**Residual open item for build:** the non-soil detector (decision #5) — component-level test is the
primary, `muname` denylist secondary. If a recorded fixture surfaces a non-soil unit the
component-level test misses, widen the denylist; do not let a mis-drawn-over-water block report
"Water" as soil.

---

## Parallel-lane hygiene (runbook §4)

- **Unit 0 is the serialization point.** Land + merge the schema slice PR before the feature units,
  and serialize it against P3/P8 schema slices (they are small; conflicts stay trivial).
- Worktrees share one `.git` index → stage with `git commit --only <paths>`; run `gh pr list` before
  starting; DB-backed `verify:*` runs from the MAIN checkout (worktrees have no `.env`).
- File-disjoint from P3 by design: P4 touches `src/lib/soil/**`, the block panel, and assistant/verify
  wiring; P3 touches `src/lib/gis/{render,color}` + the NDVI map layer. No shared feature file except
  `prisma/schema.prisma` (handled by Unit 0) and `registry.ts`/`geometry-version.ts` (append-only edits).
