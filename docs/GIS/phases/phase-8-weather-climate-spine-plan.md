---
title: Release 4A — Weather & Climate spine (Vineyard Intelligence phase P8)
type: feat
status: planning (council-revised + units reconciled 2026-07-25)
date: 2026-07-25
branch: (unset — plan only)
depth: deep
units: 12
supersedes: none
design: docs/GIS/vineyard-weather-climate-design.md
council: docs/GIS/phases/phase-8-council-feedback.md
---

> **Council-revised + owner-decided + units reconciled.** Codex + Gemini review
> ([phase-8-council-feedback.md](phase-8-council-feedback.md)) surfaced a schema-authority tension, an
> observation-time timezone hole, a gap-fill/spread contradiction, and several agronomic bugs. All folded as
> **Council revisions R1–R16** below, and — as of the 2026-07-25 reconciliation pass — **folded DOWN into the
> Implementation Units themselves**, so the units no longer describe the superseded mutable-snapshot schema.
> Units 1/2/4/5/6/7 and the Requirements/Success Criteria now match R1–R16; where a unit and a revision ever
> disagree, **the revision still wins.** The three product questions (primary-source model, frost framing,
> card placement) are decided: R14/R15/R16. **Execution-ready for `/work`** (build after or in parallel with P3).

## Overview

Give a grape grower the environmental-driver layer that sits under NDVI vigor and Brix: **Growing
Degree Days, Winkler/GST region, frost, heat, and rainfall — mapped to _their_ vineyard**, not just the
nearest airport. The estimate comes from terrain-aware gridded products (gridMET live, Daymet history,
NASA POWER global), shown beside the grower's own trusted NOAA station with the elevation delta that
explains any gap. Everything a grower needs is answerable in one glance and through the assistant ("how
do our GDDs compare to last year?", "was last night a frost?").

This is **Release 4A, the climate spine** — the honest, temperature-driven metrics. Disease models
(Release 4B / phase P9) are the follow-on and are explicitly out of scope here, but 4A stores humidity
so 4B has its inputs.

Architecturally this is the **lightest** Vineyard Intelligence lane yet: the "at your site" value is a
gridded **point** value, so unlike NDVI there is **no raster, no blob, no geospatial worker** — a daily
JSON fetch into a dated snapshot, rendered offline. It reuses the P2 `spatial` table+RLS shape, the
`usage-core` quota counter, the claim-first cron sweep, and the pure-`*-core.ts`-reachable-from-a-tool
discipline verbatim.

## Problem Frame

The user is a grape grower who already trusts a nearby NOAA station for GDD and rainfall but knows it is
kilometers away and at a different elevation. The job: show the station number **and** an
elevation-corrected site estimate side by side, turn it into the season metrics they actually decide on
(GDD vs their own history, Winkler region, frost/heat/rain), and let them ask the assistant in plain
English. Simple on the surface, robust underneath (progressive disclosure): a one-glance card, with the
full multi-source breakdown a click away.

**Do nothing?** The grower keeps eyeballing a distant station and mentally correcting for elevation, and
the app's vigor/ripeness story has no climate spine to explain _why_ a season ran hot or a block lagged.

**Product pressure test.** The trap is building a spatial-interpolation engine. We don't: the gridded
products already interpolate station data with terrain (design P1). The second trap is over-promising:
grids resolve _site vs region_, not _block vs block_ (design P2) — so 4A gives **one climate estimate per
vineyard**, and says so. The third trap is a blended "one number": we **show sources side by side and the
spread, never an average** (design §4.2). The 80/20 is a daily point-fetch snapshot + pure season math +
one assistant tool + one grower card.

## Requirements

- **MUST** produce the site estimate from **terrain-aware gridded point APIs**, never hand-rolled
  interpolation (design P1): **gridMET** (live/in-season CONUS, ~14 h latency, carries RH), **Daymet**
  (1 km historical/baseline NA), **NASA POWER** (global fallback, e.g. Bhutan). Show the nearest station
  (**RCC-ACIS** live daily, **NOAA CDO** history/normals) + the **USGS EPQS** elevation delta beside it.
- **MUST** implement the sources as a **tiered `ClimateProvider` registry selected by vineyard location +
  completeness** (design §4.1/§6.1). 4A ships ACIS/CDO stations + gridMET + Daymet + POWER + EPQS.
  CIMIS/AgriMet/NEWA are **later plug-ins** (design §6.1) — the abstraction must make adding one a
  plug-in, not a rewrite. Build the abstraction, do NOT integrate all seven networks now.
- **MUST** honor the **multi-source model** (design §4.2): one grower-selectable **primary** per vineyard
  (default = best available station by distance/elevation-delta/completeness), others shown as comparison,
  **gap-fill from the live grid when the primary misses days (stamped)**, **per-metric sourcing** (RH must
  come from a grid because COOP stations don't measure it), **provenance on every value**, and — a hard
  contract test — **never emit a blended average; if an ensemble is shown, show the spread**.
- **MUST** keep all metric math as **pure `src/lib/weather/*-core.ts` modules** (GDD base 10 + optional
  30 °C cap, Winkler regions I–V, GST + Jones grouping, frost last-spring/first-fall + sub-threshold
  events, heat days over thresholds, rainfall accumulation, season-to-date + year-over-year comparison),
  unit-tested, **reachable from an assistant tool so `verify:ai-native` passes**.
- **MUST** be **timezone-correct** for daily buckets and "last night" (design honesty + tickets #472/#473):
  the operating timezone beats the viewer, is resolved **route-side** (never a DB read inside
  `runAssistant`), and tool handlers use `ctx.timeZone` + `zonedDateKey`. `"EST"` fixed-offset is a trap —
  reuse `resolveOperatingTimeZone`/`zonedDateKey` from `src/lib/work-orders/due-at.ts`.
- **MUST** persist three tenant-scoped tables per the AGENTS.md Phase-12 checklist (R1 — fact-table
  authoritative, no mutable-snapshot machine): **`VineyardClimateDaily`** (the authoritative daily series —
  one row per `(tenant, vineyard, localDate, providerKey)`, tmax/tmin/precip/RH per source, `PROVISIONAL`/
  `FINAL`, gap-fill stamp, provenance), **`VineyardWeatherConfig`** (1:1 per vineyard — resolved/overridden
  primary provider + station/elevation delta + coverage state + attribution; replaces the snapshot's
  mutable status, so the "one current" invariant is structural), **`WeatherProviderUsage`** (per-tenant/**day**
  per-provider request counter for the CDO 10k/day, 5 req/s cap). Prefer **String-union status fields over
  enums** (Windows enum-ordering trap; mirror the P2 `withheldReason`/`faultClass` pattern).
- **MUST** ingest via a **cron-driven, claim-first, idempotent job** (mirror the P2 `SpatialAnalysisJob`
  sweep + `AccountingDelivery`), NOT a worker. Daily rows are **upserted** on
  `(tenant, vineyard, localDate, providerKey)` (recent days `PROVISIONAL`→`FINAL`); enqueue-idempotency is
  separate from data identity (R1). A daily append; **season aggregates are computed on read** (R10), NOT a
  weekly recompute job.
- **MUST** render **offline from the stored daily rows** (no live provider call on page open), with a
  **coherent coverage state** for non-US (Bhutan → `GLOBAL_COARSE` via POWER, never a blank).
- **MUST** surface the whole thing to the grower on the **existing vineyard surface** (design §8) — a
  climate card with a GDD-vs-prior-years chart (reuse `src/lib/harvest/chart.ts` + `BrixChart` pattern),
  Winkler/GST, frost/heat/rain counts, and the station-vs-estimate + elevation-delta + provider/resolution
  panel — plus **one** `VINEYARDS` nav entry (design "no sprawl"). Progressive disclosure: summary first,
  full multi-source breakdown + spread + daily table behind a toggle.
- **MUST** ship a **read-only `query_climate` assistant tool + goldens** answering the grower's questions
  ("GDD vs last year", "warmer than last year", "frost last night", "Winkler region", current-season
  summary). Read tool → no confirmation-card/committer wiring. Add to `REQUIRED_READ_TOOL_NAMES` so the
  gate forces the golden.
- **MUST** render the **honesty lines** (design §4.3): Winkler shows the number at region-class
  boundaries; frost is always "elevated risk → check", never "safe"; daily precip flagged low-confidence.
- **SHOULD** ship a thin **frost/heat alert** to the existing inbox/notification surface on a threshold
  crossing during the sweep (reuse the existing notification core; confirm its API at build).
- **SHOULD** ship `verify:weather` e2e on a **committed fixture daily series** (no live provider in tests)
  + a by-hand live smoke hitting the real APIs from the main checkout with `.env` (the design's spike).
- **MUST NOT** fabricate weather (contract test): a failed provider fetch never yields a snapshot/daily row.

## Scope Boundaries

**In scope (4A / P8):** provider registry + the 6 launch providers, source-selection/gap-fill/spread pure
logic, GDD/Winkler/GST/frost/heat/rain pure math, the 3 tables + RLS, the claim-first ingest job + cron
sweep + quota counter, the grower climate card on the existing vineyard surface + one nav entry, the
`query_climate` read tool + goldens (timezone-correct), a thin frost/heat inbox alert, `verify:weather`,
and the canonical-doc weave (brief Release 4 + runbook P8/P9 + registers).

**Out of scope (and why):**
- **Disease models (powdery/downy/botrytis) → Release 4B / phase P9.** 4A stores RH so 4B has inputs, but
  the diurnal reconstruction + Gubler-Thomas/3-10/botrytis indices + the NEWA "don't-reinvent" path are 4B.
- **CIMIS / AgriMet / NEWA network integrations → later plug-ins** (design §6.1). 4A builds the abstraction
  and ships ACIS/CDO + gridMET + Daymet + POWER + EPQS; regional networks land as `ClimateProvider` plug-ins
  prioritized by where tenants actually are.
- **On-site sensor / rain-gauge ingestion → Later** (design §9) — the real fix for the precip weak link.
- **Sub-km physical downscaling (frost pockets, cold-air drainage, aspect) → Later research** (design P2).
  4A is one climate estimate per vineyard; blocks share it.
- **Forecast (NWS api.weather.gov) → Later** — 4A is historical/estimate, not forward-looking.
- **ET / irrigation scheduling → Later** (gridMET/CIMIS ref-ET already available when we want it).

## Research Summary

### Codebase patterns (verified this session — reuse, don't reinvent)

**Tenant table + RLS shape:** the P2 five-table slice (`prisma/schema.prisma` `SpatialScene`…`CdseUsageCounter`,
migrations `..._ndvi_schema` + RLS ENABLE+FORCE+`tenant_isolation` policy + app_rls grant + fail-closed
`DO $$` guard). Copy the migration structure; every table leads with `tenantId String @default("")`,
`@@index([tenantId])`, per-tenant uniques, `@@unique([tenantId, id])` FK targets, composite FKs.

**Quota counter:** `src/lib/spatial/usage-core.ts` — `usageYearMonth` pure bucket + atomic
`INSERT … ON CONFLICT DO UPDATE` via `runInTenantRawTx` + `@@id([tenantId, yearMonth])` (`CdseUsageCounter`).
Mirror as `WeatherProviderUsage` (add a `provider` dimension to the key).

**Claim-first outbox + cron:** `src/lib/spatial/job-sweep.ts` (`claimBatch` = `FOR UPDATE SKIP LOCKED` +
lease; `runNdviJobSweep` enumerates tenants via `listAllOrgIds()` + `runAsTenant`; DARK auto-add gated on
quota headroom) and `src/app/api/cron/ndvi-poll/route.ts` (constant-time `Bearer $CRON_SECRET`,
`maxDuration=300`) + the `vercel.json` cron entry. Idempotent materialization pattern:
`src/lib/gis/satellite/process-scene-core.ts` (claim an INFLIGHT row on the identity unique BEFORE the
external call). Weather is lighter — JSON, no blob.

**Pure math + verify:ai-native:** pure modules live under `src/lib/gis/*` (`color.ts`, `zonal.ts`, no
React/Prisma). `scripts/verify-ai-native.mjs` fails any `src/lib/**/*-core.ts` exporting a `*Core` symbol
that isn't reachable from `src/lib/assistant/tools/**` or `registry.ts`. `src/lib/spatial/actions.ts`
deliberately imports the cores to anchor them in the import graph — do the same for `src/lib/weather/*`.

**Assistant read tool:** `src/lib/assistant/tools/query-ndvi-stats.ts` is the template — `{ name,
description, kind:"read", inputSchema, run(ctx,input) }`, registered in `src/lib/assistant/registry.ts`
`ALL_TOOLS`. Read tools return a plain object straight to `tool_result` (`run.ts:265-269`); only
`kind:"write"` hits `asProposal` (`run.ts:181`) — so **zero committer/confirm/token wiring**. Goldens:
`test/evals/assistant-read-tools.golden.ts` (`{ utterance, tool, args }`), gated by
`test/evals/assistant-tools.eval.test.ts`; `REQUIRED_READ_TOOL_NAMES` (line 26) forces a golden per named tool.

**Timezone (load-bearing for "last night"):** `src/lib/work-orders/due-at.ts` —
`resolveOperatingTimeZone(winery, viewer)` (winery beats viewer), `zonedDateKey(at, tz)` (zone-local
`YYYY-MM-DD`), `isCanonicalTimeZone` (rejects the `"EST"` fixed-offset trap). The route
(`src/app/api/assistant/route.ts:126-134`) reads `AppSettings.timeZone` via `getWineryTimeZone()`,
resolves, and passes `timeZone` into `runAssistant` — which forwards it to every `tool.run({…,timeZone})`
(`run.ts:179`). **No DB read inside `runAssistant`.** A weather handler computes "last night" from
`zonedDateKey(now, ctx.timeZone)`.

**Season / year-over-year:** no existing multi-season query tool; building blocks are the NDVI
latest-per-key reduce (`query-ndvi-stats.ts:33-60`) and `HarvestRecord.vintageYear` as the season key
(`query-recent-harvests.ts`, `src/lib/harvest/pick-core.ts`). Charts: `src/lib/harvest/chart.ts` (pure
scale math), `BrixChart.tsx` / `AnalyteTrendChart.tsx` (pure-SVG, token-driven).

**Map overlay + nav:** extend `src/lib/gis/overlay.ts` `MapOverlay` (don't fork `SatelliteMap`); one new
`VINEYARDS` entry in `src/components/AppShell.tsx` (lines 40-46).

**Scope helper:** `src/lib/assistant/scope.ts` `resolveVineyards(user, name?)` for per-vineyard tool scope.

### Prior learnings (memory + design doc — do not re-derive)

- **gridMET is the live/in-season source (14 h latency, has RH); Daymet lags ~3 months → history only**
  (verified via web search this session). POWER is the ~50 km global fallback.
- **Temp MAE ~1.2–1.8 °C (good); daily precip is the weak variable** — screening-grade, not block-exact.
- **Spread, never blend** (four reasons: sources aren't independent, point-vs-area, drags good precip
  toward bad, GDD accumulator un-reproducible under a day-varying blend).
- **CDO caps at 10k/day, 5 req/s** — the `WeatherProviderUsage` counter enforces headroom across tenants.
- **`.env` IS prod; worktrees have no `.env`; DB-backed `verify:*` run from MAIN checkout.** Stop `next dev`
  before `prisma generate` (stale client). Windows: isolated enum `CREATE TYPE` before any dependent
  default — **avoid enums entirely here, use String unions.**
- **verify:ai-native fails a new `*-core.ts` until a tool imports it** — anchor the weather cores via an action.

### External research (verified this session)

- **gridMET**: daily 4 km CONUS, ~14 h latency, keyless (Climatology Lab / ClimateEngine THREDDS + subset
  APIs). **Daymet**: 1 km NA single-pixel API, annual release (~end-Mar for prior year) + monthly-latency
  product. **NASA POWER**: global agroclimate point API, ~0.5°, keyless. **RCC-ACIS**: keyless station
  daily. **NOAA CDO v2**: free token, history + 1991–2020 normals. **USGS EPQS**: keyless point elevation.
- **CIMIS** (REST + free AppKey + 2 km Spatial CIMIS), **AgriMet** (URL/CSV, keyless), **NEWA** (Cornell,
  ships grape disease models; data via NRCC/ACIS) — all real APIs, deferred to plug-ins / 4B.

## Council revisions (2026-07-25) — authoritative over the original units

**R1 — Schema restructure (supersedes Unit 1): daily fact table is authoritative; no mutable-snapshot machine.**
- `VineyardClimateDaily` = **one row per `(tenantId, vineyardId, localDate, providerKey)`** — a raw
  per-provider daily observation, metrics wide (`tmaxC`/`tminC`/`precipMm`/`rhMaxPct`/`rhMinPct`, Decimal
  nullable), `dataStatus` String union (`PROVISIONAL`|`FINAL` — recent days are legitimately mutable as
  gridMET/CFSv2 finalizes), `provenance Json`. `localDate DateTime @db.Date` (canonical vineyard-local civil
  day — see R2). **Upsert on the unique key** on each refresh; no CURRENT/SUPERSEDED flag, so **no supersede
  race** (Codex #3/#6). Spread = compare provider rows for a date; per-metric sourcing = read RH from the grid
  provider's row while temp comes from the station's row; gap-fill = select another provider's row, stamped.
- `VineyardWeatherConfig` (replaces the snapshot's mutable status) = **one row per vineyard**: resolved
  primary provider + grower override, chosen station id/name/distance, station-vs-site elevation delta, site
  elevation, coverage state (`US_HIGH_RES`|`GLOBAL_COARSE`|`UNAVAILABLE`), attribution, last-refresh. 1:1 with
  vineyard → the "one current" invariant is structural, no partial index needed.
- `VineyardWeatherPull` (optional pull-log for provenance/debugging) OR fold pull metadata into
  `WeatherProviderUsage`. Not authoritative for data.
- `WeatherProviderUsage`: gate CDO's **daily** cap on a **daily key** — `@@id([tenantId, dayKey, provider])`
  with `dayKey DateTime @db.Date`; keep a monthly rollup for telemetry only (Codex #4).
- Read index matches the real path: `@@index([tenantId, vineyardId, localDate])` plus provider where needed.
- Numeric-sanity CHECKs / validators: `tminC ≤ tmaxC`, `rh 0..100`, `precipMm ≥ 0` (Codex #7).

**R2 — Observation-time timezone, normalized AT INGEST (both reviewers).** Map each provider's source day into
the vineyard-local civil day **before storage** as `localDate`. Apply the met shift for AM-obs stations
(ACIS/COOP report ~7–8 am LST for the prior 24 h → `Tmax`→date−1, `Tmin`→date); grids are midnight-local/UTC →
convert. Query-side `zonedDateKey(now, ctx.timeZone)` stays, but is not sufficient alone. New pure module
`src/lib/weather/obs-time-core.ts` + tests. This is the single most error-prone piece — treat like the NDVI Y-FLIP.

**R3 — Aggregate strictly per-source with completeness %; never cross-pollinate (Gemini #10, resolves the
gap-fill/spread contradiction).** GDD/rain/frost are computed **per provider over the days that provider has**,
carrying a completeness % (`Station GDD 1450 (92% complete)` vs `Grid GDD 1520 (100%)`). Gap-fill produces a
**separately labeled "continuous (grid-filled)" series**, never the headline aggregate. **This gap-filled
series is composed ON READ (U3 `gapFillCore`) from the pure per-provider stored rows — it is NEVER persisted
as a DB row and never carries a DB `filledFromProvider` column** (council confirmatory gate: every stored
`VineyardClimateDaily` row is strictly single-provider). `season-core` returns per-source aggregates +
completeness, not one blended number. `assertNeverBlended` (U3) covers this too.

**R4 — Hemisphere-aware seasons + SeasonYear (Gemini #9).** Derive the growing-season window from latitude
(NH Apr 1–Oct 31; SH Oct 1–Apr 30, which crosses the calendar year; document the equatorial/continuous case as
a known gap). **Group YoY by `SeasonYear`, not calendar year.** `src/lib/weather/season-core.ts` owns the
window + SeasonYear derivation; every Winkler/GST/YoY read keys off it. Bhutan ≈ 27°N (NH) but build it right.

**R5 — GDD formula pinned + documented (Gemini SF#1).** Daily GDD = `MAX(0, MIN(capC, (Tmax+Tmin)/2) − baseC)`
with `baseC=10`, `capC` optional (30 default when on) — **cap the average, not Tmax**. Document the exact
formula in the card + a golden; note Baskerville-Emin sine method as a Later option (growers comparing to UC
Davis will ask).

**R6 — Frost as vulnerable-window events, not raw dates (Gemini #13 — pending owner Q2).** Without phenology,
`frost-core` reports **sub-threshold events within a lat-derived vulnerable window** (e.g. NH Apr 1–Jun 15),
distinguishing 0 °C (light) vs −2 °C (killing), framed "risk → check". Raw "last spring/first fall frost"
becomes a secondary stat. Real phenology-gated frost is 4B.

**R7 — Daymet 365-day leap-year calendar (Gemini #11).** The Daymet provider (U2) must handle Daymet dropping
Dec 31 in leap years — null-pad or interpolate Dec 31 at ingest so cross-provider daily joins don't skew. Add a
fixture test.

**R8 — No outbound fetch inside the tx (Codex #5).** U5: fetch + normalize + validate + decide **outside** any
tx; open the short `runInTenantTx` only for the write set (daily-row upserts, config upsert, usage increment).

**R9 — "Frost last night" freshness fallback (Gemini SF#4).** `query_climate`: if the prior-night `localDate`
`tminC` is absent (latency — gridMET 14 h, ACIS not yet ingested at 6:30 am), the tool returns a typed
"data-not-in-yet, latest is [date]" result and the prompt instructs the assistant to say so and point to
physical gauges — never infer a frost from missing data.

**R10 — Remove the weekly recompute; the tool does the math, not the LLM (Codex #8, Gemini DQ3).** Season
aggregates are computed **on read** by the pure cores (deterministic code the tool calls), not by the LLM and
not by a weekly job (delete that line from U5/U6). On-read is fine at vineyard scale; revisit a materialized
summary only if org-wide dashboards arrive.

**R11 — Explicit "no fabricated weather" semantics (Codex DQ2).** A **primary** fetch failure writes no daily
rows for that provider/date. A **comparison/gap-fill** provider failure is non-fatal — the primary rows still
land; the missing source is simply absent from the spread (recorded, not fabricated).

**R12 — Precip UI framing (Gemini SF#3).** Label gridded precip "Regional Rainfall Estimate (4 km average, not
your rain gauge)"; keep the low-confidence flag. Card copy (U10).

**R13 — Added validation gates (Codex SF/DQ).** U11 adds: concurrent-duplicate-ingest (two sweeps, one row),
numeric-sanity rejection, SSRF redirect/allowlist, and the obs-time-shift correctness test — not just the happy-path e2e.

**R14 — Primary-source model (owner-decided).** The grower selects ONE **primary climate source** per
vineyard (default = nearest quality station by distance/elevation-delta/completeness; grid if no station
within ~10 mi). The **summary card + the `query_climate` assistant answer in the primary's numbers only** —
one number, not a spread. The multi-source comparison + spread live behind a **"Compare sources / data trust"**
tab (progressive disclosure). This is how "as simple as possible" and "spread not blend" coexist: the grower
sees one honest number; the spread is a validation view, never a blended average. `VineyardWeatherConfig`
stores the choice (default resolved at first ingest; grower-overridable). Affects U3 (selection default), U8
(tool answers in primary + names it), U10 (summary = primary, spread behind tab).

**R15 — Frost framing (owner-decided, confirms R6).** Ship the **vulnerable-window sub-0 events** model:
lat-derived window (NH Apr 1–Jun 15), 0 °C light vs −2 °C killing, "risk → check". Raw last-spring/first-fall
dates are a secondary stat. Phenology-gated frost is 4B.

**R16 — Card placement (owner-decided).** The climate card lives on the **vineyard root page only** in 4A —
no per-block climate card (blocks share the vineyard climate; grids can't resolve block-vs-block). The one
`VINEYARDS` nav entry points at the vineyard-level surface. This is the cleanest expression of the
one-estimate-per-vineyard honesty boundary. Affects U10.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Site estimate | **Gridded terrain-aware point value** (gridMET live / Daymet history / POWER global) | Hand-rolled station IDW + DEM | Grids already interpolate with terrain; ours would be worse science (design P1). |
| Live CONUS source | **gridMET primary**; Daymet historical/baseline only | Daymet primary | Daymet's ~3-month release lag can't drive in-season GDD/frost; gridMET is ~14 h + carries RH. |
| Sources model | **Primary + comparison + gap-fill, per metric, show spread** | Single blended average | Sources aren't independent (station feeds the grids); GDD accumulator un-reproducible under a blend (design §4.2). |
| Providers now | **ACIS/CDO + gridMET + Daymet + POWER + EPQS**; CIMIS/AgriMet/NEWA later | Integrate all 7 now | 7 live integrations before shipping is an ocean; the abstraction is the lake (design §6.1). |
| Architecture | **JSON point-fetch → dated snapshot, cron claim-first outbox, NO worker/blob** | Worker + raster | Point value is tiny JSON; preserves the VI no-worker posture (ADR 0009) even more cleanly than NDVI. |
| Status fields | **String unions in code, no DB enums** | Postgres enums | Windows enum-ordering trap; mirror P2 `withheldReason`/`faultClass`. |
| Resolution honesty | **One climate estimate per vineyard**; blocks share it | Per-block microclimate | Grids resolve site-vs-region only; sub-km needs a physical model (design P2, Later). |
| Season aggregates | **Compute on read from stored daily rows** (a season ≈ 200 rows) — no recompute job (R10) | Materialize now / weekly recompute | Keeps 4A to 3 tables; deterministic code (the tool's cores) does the math, not the LLM/a job. Revisit a materialized summary only if org-wide dashboards arrive. |
| Timezone | **Operating-tz-beats-viewer, resolved route-side, `zonedDateKey` in handlers** | Viewer tz / fixed offset | "Frost last night" and daily buckets are tz-sensitive; #472/#473; `"EST"` fixed-offset is a trap. |
| Disease | **Deferred to 4B/P9**; 4A only stores RH | Build disease in 4A | Disease needs diurnal reconstruction + heavy honesty copy; ship the clean climate spine first (design Approach A). |

## Implementation Units

### Unit 1: Schema-first slice — daily climate fact table, weather config, provider usage (own PR)
> **Reconciled to R1/R2 (authoritative).** The daily fact table is the authoritative artifact; there is
> **no mutable `VineyardWeatherSnapshot` / CURRENT-SUPERSEDED-STALE machine** (Codex #3/#6 killed it). The
> "snapshot" collapses to a 1:1 `VineyardWeatherConfig`. Build the tables exactly as below.

**Goal:** Land the three tenant-scoped tables + RLS as one schema+migration PR ahead of the feature units.
**Files:** `prisma/schema.prisma`; new migrations under `prisma/migrations/` (`_weather_schema` + `_weather_rls`); `test/tenant-isolation.test.ts`; `scripts/verify-tenant-isolation.ts`.
**Approach:** Copy the P2 slice + RLS migration structure (Phase-12 checklist verbatim). Tables:
- `VineyardClimateDaily` — **the authoritative daily series; one row per `(tenantId, vineyardId, localDate, providerKey)`** (a raw per-provider daily observation, metrics wide): `id String @id @default(cuid())`, `vineyardId`, `providerKey` (String), `localDate DateTime @db.Date` (canonical **vineyard-local civil day** — normalized at ingest per R2, NOT a raw provider date), `tmaxC?`/`tminC?`/`precipMm?`/`rhMaxPct?`/`rhMinPct?` (Decimal, nullable), `dataStatus` (String union: `PROVISIONAL`|`FINAL` — recent days are legitimately mutable as gridMET/CFSv2 finalizes), `provenance Json`, `createdAt`/`updatedAt`. **Upserted on the unique key** each refresh — no CURRENT flag, so no supersede race. `@@unique([tenantId, vineyardId, localDate, providerKey])`, `@@index([tenantId, vineyardId, localDate])`, `@@unique([tenantId, id])`. **Numeric-sanity CHECKs** in the migration (R1/Codex #7): `tminC ≤ tmaxC`, `rhMaxPct`/`rhMinPct` in `0..100`, `precipMm ≥ 0`.
  - **Every stored row is strictly single-provider — the DB is never blended and never carries a gap-fill stamp** (council confirmatory gate, both reviewers). `providerKey` **is** the per-row source (no `metricSource` column). **Gap-fill is a READ-TIME composition, not a stored row** (see R3-clarification below + U3/U5): the read core composes the primary series in memory, falling back to another provider's row for a missing `localDate`, and attaches a `filledFromProvider` stamp **to the returned DTO, never to a DB column.** This keeps each provider's stored series pure and is the same on-read discipline as R10.
  - **Per-metric sourcing is provenance, not a blended headline** (R14 clarification): the primary summary's temperature/GDD/frost/Winkler numbers come from **one** primary provider. RH is the one metric a COOP station can't measure, so when needed (it is stored for 4B, not shown as a headline) it is read from a grid row and **labeled as a distinct per-metric source** — this is provenance-tagged composition for the compare view, never averaged into the primary's temperature or GDD number.
- `VineyardWeatherConfig` — **replaces the mutable snapshot; exactly one row per vineyard** (1:1, so the "one current" invariant is structural — no partial index): `id String @id @default(cuid())`, `vineyardId` (`@@unique([tenantId, vineyardId])`), `primaryProviderKey` (resolved default), `primaryProviderOverride?` (grower choice, R14). **Effective primary = `primaryProviderOverride ?? primaryProviderKey`** — one helper (`effectivePrimary(config)`) used by BOTH ingest and every read path so they can't diverge (council confirmatory gate, Codex #3). Also: `stationId?`/`stationName?`/`stationDistanceM?`/`stationElevationDeltaM?`, `siteElevationM?`, `coverageState` (String union: `US_HIGH_RES`|`GLOBAL_COARSE`|`UNAVAILABLE`), `attribution`, `lastRefreshAt?`; `@@unique([tenantId, id])`.
- `WeatherProviderUsage` — quota; **gated on a DAILY key** for the CDO 10k/day cap (R1/Codex #4): `@@id([tenantId, dayKey, provider])` with `dayKey DateTime @db.Date`, `requestCount Int @default(0)`, `lastError?`, `updatedAt`. (Keep a monthly rollup for telemetry only — not the enforcement path.)
- (Optional) `VineyardWeatherPull` pull-log for provenance/debugging, OR fold pull metadata into `WeatherProviderUsage` — **not authoritative for data** (R1). Defer unless a unit needs it.
- `Vineyard.weatherAutoRefresh Boolean @default(false)` (the DARK sweep opt-in, mirrors `ndviAutoAdd`).
**Tests:** per-table isolation for all three tables (A-sees-own / A-can't-see-B / foreign-INSERT reject); FK → `organization` reject; RLS-coverage guard; a migration test that the numeric-sanity CHECKs reject `tminC > tmaxC` / RH out of range / negative precip.
**Depends on:** none (P1 #494 planting geometry already merged; vineyard exists).
**Execution note:** no enums (String unions) — sidesteps the Windows enum rule.
**Verification:** `npm run db:migrate` (owner) clean; `verify:tenant-isolation`; `npx prisma validate`.

### Unit 2: Provider registry + point-extraction clients (`src/lib/weather/providers/*`)
**Goal:** A `ClimateProvider` interface + the six launch providers, each a thin adapter returning a normalized daily series.
**Files:** `src/lib/weather/providers/types.ts` (interface), `gridmet.ts`, `daymet.ts`, `nasa-power.ts`, `rcc-acis.ts`, `noaa-cdo.ts` (history/normals), `usgs-epqs.ts` (elevation); `src/lib/weather/obs-time-core.ts` (pure obs-time → `localDate` mapping, R2); `src/lib/weather/config.ts` (env gates); `test/weather-providers.test.ts`; `test/weather-obs-time.test.ts`.
**Approach:** `ClimateProvider = { key, kind:"grid"|"station", obsConvention:"AM_LST"|"MIDNIGHT_LOCAL"|"UTC", capabilities: Metric[], coverageFor(lat,lon): CoverageState, fetchDailySeries(lat,lon,startIso,endIso): Promise<DailyRecord[]> }`. Keep the **impure fetch edge** separate from **pure normalization** (parse provider JSON/CSV → `DailyRecord` = `{ sourceDate, tmaxC?, tminC?, precipMm?, rhMaxPct?, rhMinPct?, source, obsConvention }`). **R2 — obs-time is the "Y-FLIP" of weather:** `obs-time-core.ts` maps each record's `sourceDate` into the canonical **vineyard-local civil day** `localDate` given the vineyard tz + the provider's `obsConvention` — applying the met shift for AM-obs stations (ACIS/COOP report ~7–8 am LST for the prior 24 h → `Tmax`→date−1, `Tmin`→date) and the UTC/midnight-local conversion for grids. This mapping is **pure** (tz + convention in, `localDate` out) and is invoked at ingest (U5) where the vineyard tz is known; providers themselves stay tz-agnostic. **R7 — Daymet 365-day calendar:** `daymet.ts` null-pads/interpolates Dec 31 in leap years so cross-provider daily joins don't skew. gridMET/Daymet/POWER/ACIS/EPQS keyless; NOAA CDO reads `NOAA_CDO_TOKEN` (env-gated, hidden when unset). SSRF: fixed provider allowlist (brief §18), redirect rejection, bounded response size, generous timeout, never on a render path. Never fabricate — a failed fetch throws a typed fault, no partial record.
**Tests:** per-provider **fixture-response normalization** (committed sample JSON/CSV → expected `DailyRecord[]`); **obs-time shift** (AM-obs station Tmax→date−1 / Tmin→date; grid midnight/UTC → correct `localDate`; a frost that would land on the wrong day under a naïve join lands right); Daymet Dec-31 leap-year null-pad; coverage classification (CONUS→gridMET, NA→Daymet, Bhutan→POWER `GLOBAL_COARSE`); CDO hidden without token; malformed/oversized/redirected response rejected. No live calls in CI.
**Depends on:** none.
**Patterns to follow:** `src/lib/gis/satellite/client.ts` (impure adapter), `config.ts`/`token.ts` env gating, `work-orders/due-at.ts` tz helpers.
**Verification:** `npx vitest run test/weather-providers.test.ts test/weather-obs-time.test.ts`.

### Unit 3: Source selection + gap-fill + spread (`src/lib/weather/source-selection-core.ts`, pure)
**Goal:** Pick the primary, fill gaps from the grid, compute spread — never blend.
**Files:** `src/lib/weather/source-selection-core.ts`; `test/weather-source-selection.test.ts`.
**Approach:** `selectPrimaryCore(vineyard, candidates)` ranks by station distance, elevation delta, and daily-completeness → chosen primary; the grower override is applied via `effectivePrimary(config)` = `primaryProviderOverride ?? primaryProviderKey` (U1). `resolvePerMetricSourceCore` tags RH to a grid source as **provenance** (not a blend). `gapFillCore(primarySeries, fallbackSeries)` is a **pure read-time composition**: it returns an **in-memory DTO series** where a `localDate` missing from the primary is filled from the fallback provider's stored row and the filled entry carries a `filledFromProvider` stamp **on the DTO** — it writes **nothing to the DB** (the stored per-provider rows stay pure; council confirmatory gate). `computeSpreadCore(perSourceValues)` returns `{min,max,range,agreement}` — **and a guard export `assertNeverBlended` used by the contract test.** All pure.
**Tests:** primary selection prefers the closer/lower-delta/more-complete station; `effectivePrimary` honors override then default; `gapFillCore` returns a DTO that fills only missing dates, stamps the filled entries, and **never mutates/returns a DB-shaped write**; spread computed, and a **contract test asserts no code path emits an averaged value**.
**Depends on:** Unit 2 (types).
**Verification:** `npx vitest run test/weather-source-selection.test.ts`.

### Unit 4: Pure climate math (`src/lib/weather/*-core.ts`)
**Goal:** GDD, Winkler, GST, frost, heat, rainfall, season-to-date + year-over-year — pure and tested.
**Files:** `src/lib/weather/gdd-core.ts`, `winkler-core.ts`, `gst-core.ts`, `frost-core.ts`, `heat-core.ts`, `rainfall-core.ts`, `season-core.ts`; `test/weather-climate-math.test.ts`.
**Approach:** `gddCore(daily, {baseC:10, capC?:30})` = Σ `max(0, min(capC,(tmax+tmin)/2) − baseC)` — **cap the AVERAGE, not Tmax** (R5); `capC` optional (30 when on). `winklerCore(seasonGdd)` → region I–V + the boundary-proximity flag (design honesty). `gstCore(daily)` = growing-season mean → Jones grouping (season window from `seasonCore`, R4). `frostCore(daily, thresholds, window)` → **primary output = sub-threshold events within the lat-derived vulnerable window** (R6/R15: NH Apr 1–Jun 15), distinguishing 0 °C (light) vs −2 °C (killing), framed "risk → check"; **raw last-spring/first-fall dates are a SECONDARY stat**, not the headline. `heatCore(daily, thresholds)` → day counts. `rainfallCore(daily)` → accumulation + dry/wet spells (flagged low-confidence). `seasonCore` → **hemisphere-aware season window + `SeasonYear` derivation** (R4: NH Apr 1–Oct 31; SH Oct 1–Apr 30 crossing the calendar year; equatorial/continuous documented as a known gap) → season-to-date accumulation + prior-year comparison **keyed by `SeasonYear`, never calendar year**. **Aggregates are computed strictly per-source with a completeness %** (R3) — `gddCore`/`rainfallCore`/`frostCore` operate over one provider's days and return the completeness fraction; never cross-pollinate providers into one total. All pure `*Core`, node-testable.
**Tests:** GDD against a hand-computed fixture (with/without cap, asserting the AVERAGE is capped); Winkler region boundaries + the boundary flag; **frost vulnerable-window event detection** at 0/−2 °C thresholds (primary) + secondary last/first-frost dates; heat-day counts; **SH `SeasonYear` grouping crosses the calendar year** (R4 fixture); per-source completeness % returned; season-to-date vs prior-year delta; empty/partial-season handled.
**Depends on:** Unit 2 (`DailyRecord`).
**Verification:** `npx vitest run test/weather-climate-math.test.ts`.

### Unit 5: Ingest job — fetch → normalize → upsert daily rows + config (`src/lib/weather/ingest-core.ts`)
> **Reconciled to R1/R8/R10/R11.** No snapshot to supersede (fact-table upsert), no season recompute here
> (aggregates are computed on read, R10), and **no outbound fetch inside the tx** (R8).

**Goal:** Turn a pending refresh into upserted daily rows + a refreshed vineyard config, idempotently, no worker/blob.
**Files:** `src/lib/weather/ingest-core.ts`; `src/lib/weather/actions.ts` (`"use server"` — anchors the cores for verify:ai-native); `test/weather-ingest.test.ts`.
**Approach:** `ingestVineyardWeatherCore(vineyardId, window, deps)`: resolve lat/lon (planting-area centroid) + EPQS elevation → choose providers by coverage (U2) → **fetch + normalize + obs-time-map (U2/R2) + validate + decide gap-fill/selection (U3) ALL OUTSIDE any tx** (R8) → then open **one short `runInTenantTx`** for the write set only: **upsert `VineyardClimateDaily` rows on `(tenantId, vineyardId, localDate, providerKey)`** (recent days re-upsert `PROVISIONAL`→`FINAL`; **no CURRENT flag to flip, so no supersede race**, R1/Codex #6), upsert the 1:1 `VineyardWeatherConfig` (resolved primary, station distance/elevation delta, coverage state, attribution, `lastRefreshAt`), and increment `WeatherProviderUsage` (U7) per provider call. Enqueue-idempotency is separate from data identity (R1/Codex #6): a same-window re-run re-upserts the same rows, never duplicates. **R11 — no fabricated weather:** a **primary** fetch failure writes **no** daily rows for that provider/date; a **comparison** provider failure is non-fatal — the primary rows still land and the missing source is simply absent from the spread (recorded, not fabricated). **Ingest writes only strictly single-provider rows** — it does NOT write gap-filled/synthesized rows; gap-fill is composed on read (U3 `gapFillCore`), so there is no `filledFromProvider` write here at all (council confirmatory gate).
**Tests:** fixture-provider path (no live call): fetch→normalize→daily-row upserts + config with full provenance; a same-window re-run is idempotent (no dup rows); `PROVISIONAL`→`FINAL` re-upsert updates in place; a failed **primary** → typed fault + no rows for that provider; a failed **comparison** provider → the other providers' rows still land; **every stored row is single-provider (no synthesized/gap-filled row ever persisted)**; **no fetch occurs inside the tx** (assert via a deps seam).
**Depends on:** Units 1, 2, 3, 4, 7.
**Patterns to follow:** `process-scene-core.ts` claim/adopt; `runInTenantTx` (writes only).
**Verification:** `npx vitest run test/weather-ingest.test.ts`.

### Unit 6: Sweep + Vercel cron (`src/lib/weather/sweep.ts` + `src/app/api/cron/weather-poll/route.ts`)
**Goal:** Refresh weather daily per tenant/vineyard on a schedule; DARK auto-refresh opt-in.
**Files:** `src/lib/weather/sweep.ts`; `src/app/api/cron/weather-poll/route.ts`; `vercel.json` (+cron entry); `test/weather-sweep.test.ts`.
**Approach:** `runWeatherSweep()` mirrors `runNdviJobSweep`: enumerate tenants (`listAllOrgIds` + `runAsTenant`), for each `Vineyard.weatherAutoRefresh=true` append/refresh the latest daily data via ingest (U5); claim-first lease so two crons don't double-refresh; quota-headroom gated (U7 — respect CDO 10k/day). **No season-aggregate recompute here** (R10 — season math is computed on read by the U4 cores when the tool/card asks, not by a job and not by the LLM). Cron route: `runtime="nodejs"`, `maxDuration=300`, constant-time `Bearer $CRON_SECRET`, enumerates tenants. Daily schedule in `vercel.json`.
**Tests:** claim/lease/idempotency (a stuck lease self-heals; two sweeps don't double-write a day); auto-refresh skips `weatherAutoRefresh=false`; quota-exhausted provider is skipped, not retried to the cap.
**Depends on:** Units 5, 7.
**Patterns to follow:** `spatial/job-sweep.ts`, `api/cron/ndvi-poll/route.ts`.
**Verification:** `npx vitest run test/weather-sweep.test.ts`; `npm run build`.

### Unit 7: Provider usage/quota telemetry (`src/lib/weather/usage-core.ts`)
**Goal:** Meter per-tenant/day per-provider requests; enforce the CDO **daily** cap; visible counter.
**Files:** `src/lib/weather/usage-core.ts`; `test/weather-usage.test.ts`.
**Approach:** Mirror `spatial/usage-core.ts` — `recordWeatherUsage(provider, {requests})` atomic `INSERT … ON CONFLICT DO UPDATE` on **`@@id([tenantId, dayKey, provider])`** (`dayKey DateTime @db.Date`, R1/Codex #4 — CDO's cap is 10k/**day**, so the enforcement key is daily, not monthly); `readWeatherUsage()` for the visible counter + the sweep headroom gate; `CDO_DAILY_CAP`/`CDO_RATE_LIMIT` pure gates. Keep an optional monthly rollup for telemetry only (not the enforcement path). Called by U5 on each provider call.
**Tests:** increments accumulate within a day/provider; **day rollover starts fresh** (the CDO daily cap resets); concurrent increments don't lose counts; the headroom gate blocks once `CDO_DAILY_CAP` is reached.
**Depends on:** Unit 1.
**Patterns to follow:** `spatial/usage-core.ts`.
**Verification:** `npx vitest run test/weather-usage.test.ts`.

### Unit 8: `query_climate` assistant tool + goldens (timezone-correct)
**Goal:** The grower asks weather questions in plain English and gets stored data, correct for their timezone.
**Files:** `src/lib/assistant/tools/query-climate.ts`; `src/lib/assistant/registry.ts`; `test/evals/assistant-read-tools.golden.ts`; `test/evals/assistant-tools.eval.test.ts` (`REQUIRED_READ_TOOL_NAMES`).
**Approach:** `query_climate` (`kind:"read"`) resolves scope via `resolveVineyards(ctx.user, input.vineyard)`, reads `VineyardClimateDaily` + `VineyardWeatherConfig` for the vineyard, composes the primary series on read (`effectivePrimary(config)` + U3 `gapFillCore` for provenance-stamped fill — never a blend, R14), and via the U4 cores answers **in the primary's numbers**: **GDD vs last year** (season-to-date + prior-year by `SeasonYear`), **"warmer than last year"** (GST/GDD delta), **"frost last night"** (`zonedDateKey(now, ctx.timeZone)` → prior zone-local date's `tminC` vs threshold; **R9 freshness fallback** — if that `localDate`'s `tminC` is absent, return a typed "data-not-in-yet, latest is [date]" result, never infer a frost from missing data), **Winkler region**, current-season summary. Returns a plain object with numbers + the source/station/elevation-delta provenance + the honesty flags (boundary/precip). It **imports the U4 cores** so `verify:ai-native` sees them. Domain-composite (one tool, several intents), not one tool per metric. No committer/confirm (read).
**Tests:** golden cases for each utterance shape (design examples verbatim) in `assistant-read-tools.golden.ts`; add `query_climate` to `REQUIRED_READ_TOOL_NAMES`; `verify:ai-native` green (cores reachable); a "frost last night" handler test asserts the **operating** timezone (not the viewer) drives the date bucket.
**Depends on:** Units 1, 4 (and 5 for data in the e2e).
**Patterns to follow:** `tools/query-ndvi-stats.ts`, `scope.resolveVineyards`, `work-orders/due-at.zonedDateKey`.
**Verification:** `npm run verify:ai-native`; `npx vitest run test/evals/assistant-tools.eval.test.ts`.

### Unit 9: Frost/heat alert to inbox (thin)
**Goal:** On a threshold crossing during the sweep, notify the grower via the existing inbox/notification surface.
**Files:** `src/lib/weather/alert-core.ts` (pure crossing detection); a call site in `src/lib/weather/sweep.ts`; `test/weather-alert.test.ts`.
**Approach:** `detectAlertsCore(prevDaily, newDaily, thresholds)` pure → `{ kind:"FROST"|"HEAT", date, valueC }[]`; the sweep emits each through the **existing notification/inbox core** (confirm its exact API at build — reuse the WO-assignment/DM emit path, `runAsTenant(..., {userId})`). Idempotent (don't re-alert the same date). Framed "elevated risk → check", never "damage occurred".
**Tests:** crossing detected once per new date; no re-alert on re-run; frost/heat thresholds honored. (Emit is integration-tested against the existing notification core's test seam.)
**Depends on:** Units 4, 6; the existing notification core.
**Verification:** `npx vitest run test/weather-alert.test.ts`.

### Unit 10: Grower climate card on the existing vineyard surface + one nav entry (thin)
**Goal:** Simple-on-top, robust-underneath climate view that reuses the vineyard surface, no sprawl.
**Files:** a client under `src/app/(app)/vineyards/` (e.g. `weather/` route + `WeatherCard.tsx`) + a loader in `src/lib/weather/actions.ts`; one `VINEYARDS` entry in `src/components/AppShell.tsx`; reuse `src/lib/harvest/chart.ts` + `BrixChart` pattern; optional `overlay.ts` site/station markers.
**Approach:** **Summary first** (design "as simple as possible"): current-season GDD vs prior years (line chart), Winkler/GST region, frost/heat/rain counts, and the **station-vs-estimate + elevation-delta + provider/resolution** panel with the honesty lines. **Progressive disclosure** (design "robust enough"): a toggle reveals the full multi-source comparison, the **spread** (never a blend), and the daily table. Renders **offline from the stored snapshot**. DESIGN.md tokens; non-US → coherent `GLOBAL_COARSE` state. Extract pure label/summary helpers (`src/lib/weather/card-core.ts`) so they're unit-testable and reachable.
**Tests:** pure card/summary/label helpers unit-tested (repo has no jsdom); manual QA on Demo Winery.
**Depends on:** Units 4, 5.
**Patterns to follow:** `BrixChart.tsx`, `AnalyteTrendChart.tsx`, `vineyards/ndvi/NdviConsole.tsx`, `AppShell.tsx` `VINEYARDS`.
**Verification:** `/qa` on Demo (browser); `npm run build`.

### Unit 11: `verify:weather` e2e + contract tests
**Goal:** Deterministic end-to-end proof on a committed fixture series (no live provider) + the honesty contracts.
**Files:** `scripts/verify-weather.ts`; `package.json` (`verify:weather`); `test/weather-contract.test.ts`.
**Approach:** `verify:weather` on Demo Winery via `runAsTenant`: seed a QA vineyard → feed **committed fixture provider responses** through ingest (U5) → compute GDD/frost/heat/Winkler (U4) → read back and assert known values. Contract tests: **no-fabricated-weather** (a failed fetch yields no snapshot/daily row), **spread-not-blend** (`assertNeverBlended`), **timezone-correct daily bucketing** ("last night" resolves by operating tz), provenance present on every value, non-US → `GLOBAL_COARSE`, RLS/isolation for the three tables. A **by-hand live smoke** (Russian River Ranch + Bhutan, real APIs, main checkout with `.env`) documented, not in CI.
**Depends on:** all prior units.
**Patterns to follow:** `verify:ndvi`/`verify:tenant-isolation` style.
**Verification:** `npm run verify:weather`; full `npx vitest run`.

### Unit 12: Fold weather into the canonical VI docs + report + registers
**Goal:** Weather is a first-class part of the whole GIS/vineyard-intel build, not a side doc.
**Files:** `docs/GIS/vineyard-intelligence-discovery-brief.md` (Release 4 scope, §13 layer + external-API section, §14 domain concepts); `docs/GIS/VINEYARD_INTELLIGENCE_RUNBOOK.md` (phase map P8/P9, §5 phase blocks, §7 ledger); `docs/GIS/phases/phase-8-report.md`; `NOW.md`; `docs/architecture/scale-register.md` + `security-register.md` (provider allowlist, quota); ADR if the provider-registry/no-worker-for-point-data warrants one.
**Approach:** Additive weave (much is done at plan time — see below); the report follows the P2 template (gate table + measurements); flip the ledger; carry the 4B/P9 hand-off (4A stores RH; 4B adds diurnal reconstruction + Gubler-Thomas/3-10/botrytis + the NEWA don't-reinvent path).
**Depends on:** all prior units.
**Verification:** all `verify:*` green; `npx vitest run`.

## Test Strategy
**Unit (pure, deterministic, no provider/DB):** `weather-providers` (fixture normalization), `weather-source-selection` (primary/gap-fill/spread + never-blend), `weather-climate-math` (GDD/Winkler/GST/frost/heat/season fixtures), `weather-usage` (counter atomicity), `weather-alert` (crossing dedupe), `weather-contract` (no-fabrication, spread-not-blend, tz-bucketing, provenance).
**Integration/DB (gated):** isolation for the 3 tables; `weather-ingest` idempotency; `weather-sweep` claim/lease; `verify:weather` e2e on Demo with a committed fixture series.
**Assistant:** `query_climate` golden (read) + D26 guard + `verify:ai-native`; a timezone unit test for "last night".
**Manual/live:** by-hand `verify:weather --live` against the real APIs (Russian River + Bhutan) from the main checkout — never in CI.

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Grower reads two identical block numbers as "measured the same" | MED | HIGH | P2 honesty: one estimate per vineyard, blocks share it, UI says so; card copy is explicit. |
| Daily precip is wrong for a block (convective miss) | HIGH | MED | Flag precip low-confidence; show station beside estimate; on-site gauge is the Later fix. |
| gridMET/ACIS latency or an API shape change breaks the sweep | MED | MED | Provider adapters isolate parsing; a failed provider degrades to comparison/gap-fill, never a blank; snapshots render offline. |
| CDO 10k/day cap tripped across many tenants | MED | MED | `WeatherProviderUsage` headroom gate in the sweep; CDO used only for history/normals, not the daily hot path. |
| "Last night" answered in the wrong timezone | MED | HIGH | Operating-tz-beats-viewer resolved route-side; `zonedDateKey` in the handler; a dedicated tz unit test. |
| A blended average sneaks in "to be helpful" | LOW | HIGH | `assertNeverBlended` guard + a contract test; spread is the only ensemble output. |
| Bhutan (non-US) gets a blank | LOW | MED | POWER global fallback → `GLOBAL_COARSE` coverage state, never unavailable. |

## Success Criteria
- [ ] Three tenant-scoped tables pass the Phase-12 checklist + isolation tests; migrated (owner) cleanly; no enums.
- [ ] Provider registry + 6 launch providers; each normalizes a committed fixture response; CDO hidden without token; coverage classification correct (CONUS/NA/Bhutan).
- [ ] Primary + comparison + **gap-fill (stamped)** + **spread**; a contract test proves **no blended value** is ever emitted.
- [ ] GDD/Winkler/GST/frost/heat/rain/season-comparison pure math matches hand-computed fixtures; Winkler boundary flag present.
- [ ] Ingest is idempotent per window (daily rows upsert on `(tenant, vineyard, localDate, providerKey)`, `PROVISIONAL`→`FINAL` in place, no supersede race); a failed **primary** fetch yields **no** daily row; usage recorded per provider on a **daily** key; no fetch inside the tx (R8).
- [ ] Daily cron sweep + DARK `weatherAutoRefresh` (default off); quota-headroom gated; two sweeps don't double-write.
- [ ] `query_climate` answers GDD-vs-last-year / warmer-than-last-year / **frost-last-night (operating tz)** / Winkler / summary; golden + `REQUIRED_READ_TOOL_NAMES`; `verify:ai-native` green.
- [ ] Grower card on the existing vineyard surface + **one** nav entry; summary-first with progressive disclosure; renders offline; honesty lines visible; non-US coherent state.
- [ ] Thin frost/heat inbox alert on a crossing (idempotent, "elevated risk" framing).
- [ ] `verify:weather` e2e green on Demo (fixture series); tz-bucketing + no-fabrication + spread-not-blend contracts pass; RLS for all three tables; `verify:naming` green.
- [ ] Canonical docs woven (brief Release 4 + runbook P8/P9 + ledger); NOW updated; 4B/P9 hand-off recorded; `tsc` clean; full suite green.

## Sequencing & parallelism
- **Unit 1 ships as its own schema-slice PR first** (serialize against any sibling schema-slice on `prisma/schema.prisma`).
- Units **2 (providers)**, **3 (selection)**, **4 (math)**, **7 (usage)** are independent after U1.
- **5 (ingest)** needs 2+3+4+7; **6 (sweep)** needs 5+7; **8 (tool)** needs 4 (+5 for e2e data); **9 (alert)** needs 4+6; **10 (card)** needs 4+5; **11 (verify)** needs all; **12 (docs)** last.
- File-disjoint from other VI lanes except `prisma/schema.prisma` (serialize the slice PR) and `AppShell.tsx` (one line) and `vercel.json` (one cron entry) and the assistant `registry.ts` (one entry) — all trivial-merge single-line touches.
- No dependency on unshipped VI phases: only needs `Vineyard` + planting-area centroid (P1, merged). Independent of P3 (NDVI display) — **can build in parallel with or after P3**, per the user's "after P3 ships" preference in NOW.md.
