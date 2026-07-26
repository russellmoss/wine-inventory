# Phase 4 (Soil) — Council review + triage

Cross-LLM adversarial review of `phase-4-soil-documentation-plan.md` via `/council`
(Codex gpt-5.4 + Gemini 3.1-pro), 2026-07-25. Both models converged on the same critical
failure modes. Triage verdict per finding, and what was folded into the plan.

## ACCEPTED — folded into the plan

| # | Finding (source) | Why it ships a wrong report | Fold |
|---|---|---|---|
| C1 | **Geometry-change-mid-fetch race, not double-click** (Codex #1, Gemini #3). SDA is slow; block is edited `v4→v5` and re-pulled; the older `v4` response arrives last and supersedes the `v5` current row. Also: two concurrent inserts both pass `supersededAt IS NULL`, second hits the partial unique → P2025/unique-violation **500**, bypassing the "never 500s" rule. | Persists a snapshot for the *wrong polygon* and marks it current; or 500s the block page. | Decision #7 + Unit 4: capture `expectedGeometryVersion`+fingerprint **before** the network call; inside the write tx **row-lock the block** (`FOR UPDATE`) and **no-op unless the block still matches**; `UPDATE old→supersededAt=now()` first, catch P2025/unique-violation and degrade gracefully. This is a version CAS, not a double-click guard. |
| C2 | **SDA join multiplicity** (Codex #2). Clipping `mupolygon` then joining `component`×`chorizon` multiplies rows — one mukey with 4 components × 6 horizons = 24 rows, summed intersection area 24× too large. The `>1+ε` branch flags it but shares are already garbage. | Inflated shares / false over-coverage. | Decision #1 + Unit 1: clip in a **CTE/subquery with exactly one row per `mukey`**, then join only **aggregated** component/horizon summaries back. Fixture: one mukey, multiple components + horizons → one area contribution. |
| C3 | **Persisting `cos(lat)`-scaled m² is a durable false fact** (Codex #3, Gemini Risk 1). `STArea` square degrees → m² via a single-latitude scalar is wrong for AK / tall N-S blocks, and `areaSqM` is stored. | Durable wrong `areaSqM` / uncovered-area row. | Decision #2: SDA gives **unitless shares only**. Compute block **geodesic area locally** (reuse `geometry-meta.ts` `geodesicAreaM2`), then `areaSqM = normalizedShare × blockGeodesicAreaM2`. Never persist cos(lat)-scaled m². |
| C4 | **Coverage denominator must come from ONE geometry engine** (Gemini Risk 1). Mixing app-side DB block area (spherical) with SDA intersection area (square degrees) in the `<1−ε` branch yields nonsense (e.g. −999900% uncovered). | Broken uncovered % / normalization. | Decision #3: add `geometry::STGeomFromText(@wkt,4326).MakeValid().STArea()` as an **explicit SDA column** for the block-area denominator, so numerator and denominator are both SQL-Server planar. `covered` and shares stay same-engine. |
| C5 | **`cos(lat)` needs radians** (Gemini factual error). `Math.cos(38.5)` ≠ `Math.cos(38.5·π/180)`. | Wrong conversion factor everywhere it's used. | Decision #2: only used for *display* area now (not stored), and must be `Math.cos(lat*Math.PI/180)`. |
| C6 | **Invalid hand-drawn geometry → SQL Server 500** (Gemini Risk 2). Self-intersection / dup vertices / winding → `STIntersection` throws, SDA returns 500. | Feature breaks on ordinary messy polygons. | Decision #1 + Unit 2/3: append **`.MakeValid()`** before spatial methods; enforce a vertex cap (simplify to <500 pts) to dodge payload/timeout limits. |
| C7 | **Non-JSON gateway response bypasses fail-soft** (Gemini Risk 4). SDA 503 returns an HTML page at HTTP 200/503; `.json()` throws a generic syntax error that crashes `safeAction` instead of the timeout/last-good state. | Block page errors instead of degrading. | Unit 3: validate `content-type` contains `application/json` before `.json()`; map HTML/gateway bodies to the timeout/unreachable UI state. |
| C8 | **`other` line strips mukey → violates no-blend invariant** (Gemini contradiction). Folding sub-1% shares must not drop their mukeys/properties. | Loses cited provenance for minority soils. | Decision #6: **retain every mukey + properties in `components` JSON**; the <1% grouping is a **UI-layer** visual only. |
| C9 | **Non-soil mislabel of mixed map units** (Codex #4). A mukey with a major mineral component + minor water/misc component (no horizons) gets classified wholly non-soil, suppressing real soil. | Real soil reported as "Water/Not surveyed". | Decision #5: classify a map unit non-soil **only if its major-component set is exclusively misc/water/non-soil**; otherwise `mixed`, keep soil properties. |
| C10 | **Raw-SQL tx can drop RLS tenant context** (Gemini missing test). The composite-FK raw-SQL write must set `app.tenant_id`. | Silent RLS violation / empty write. | Unit 4/8: the raw path uses **`runInTenantRawTx`** (repo rule, see `raw-sql-tenant-scoping`); add a test asserting the write carries tenant context. |
| C11 | **Cache scope + survey-refresh invalidation** (Codex #5). Cache only the raw public SDA payload by geometry (+survey-version) fingerprint; scope snapshot selection by `tenant+block+geometryVersion`; add an explicit **force-refresh**. | Stale-forever after an annual SSURGO revision; cross-tenant metadata reuse. | Decision #7 + Unit 4: cache key = fingerprint **+ survey version**; force-refresh path; snapshot reads scoped by tenant+block. |

## NOTED — already addressed, reinforced

- **"`muaggatt.drclassdcd` is itself a blended aggregate"** (Gemini). Correct, and the design
  already accepts it: we invent no property, but we *inherit NRCS's* published dominant-condition
  roll-up and **label the basis** (`drainageBasis = "map-unit dominant condition"`). Reinforced in
  Unit 1: the basis label must state the NRCS level exactly, never implied as component-level.

## REJECTED / out of scope

- **Southern-hemisphere / equator sign-change math** (Gemini). US-only (decision #9); PR/Guam are
  N-hemisphere. The share ratio is sign-agnostic. Not worth a test branch. (The radians fix C5 covers
  the only real math bug.)
