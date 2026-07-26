---
title: Weather & Climate — 7-day forecast + rainfall time-series
type: feat
status: draft (rev 2 — council findings folded; see docs/plans/council-feedback-096-weather-forecast-rainfall.md)
date: 2026-07-26
branch: feat/weather-p0-foundations (one branch/PR per phase; see Phase map)
depth: deep
units: 25
---

## Overview

Two grower-facing additions to `/vineyards/weather`: a **rainfall-over-time chart** (daily bars +
cumulative line, 30d/7d/custom range) and a **7-day forecast strip** (hi/lo, condition icon,
expected rainfall, frost/heat warning badges) with **inbox notifications** for forecast frost/heat
events. NWS for US vineyards, Open-Meteo (free tier) for the rest of the world — today that means
Bhutan Wine Co's 8 vineyards run on Open-Meteo while the NWS path is built to production quality
for the US-first strategy. Everything reuses the shipped P8 spine: provider registry, SSRF-guarded
fetch edge, never-blend contract, pure-core/tested-core split, hand-rolled SVG charts, the RLS
migration template.

**Ground truth documents (read before building):**
- The user's build spec (in-conversation, 2026-07-26) — phases, contracts, acceptance criteria.
- `docs/audits/weather-climate-current-state.md` (branch `claude/weather-climate-audit-a10b25`) —
  the authoritative inventory of what exists. Where this plan and the audit disagree, the audit
  wins about what exists; flag the conflict, don't silently reconcile.

## Problem Frame

The current page is entirely retrospective (audit §1). A grower deciding **tonight's frost
protection** or **this week's spray window** gets nothing from it — they open Windy or
wunderground instead, and the app's weather section stays a reference card instead of a daily
tool. Worse, the code already *promises* alerts it never sends: `sweep.ts` detects frost/heat
crossings and throws them away; `alertMessage()` has zero callers (audit §13). Rainfall exists
only as a season-total scalar even though daily `precipMm` for ~20 years sits in the fact table.

Do nothing → the highest-frequency grower question ("do I need to do something *tomorrow*?")
stays unanswered, and the dead alert wiring keeps rotting as claim-vs-behavior debt.

Pressure-test note: the spec is well-framed; no simpler framing delivers the frost-warning job.
The one scope challenge worth recording: **NWS is strategic, not operational today** (zero US
vineyards on the live tenant) — but the spec explicitly orders it built to production quality
anyway, and the fixture-first test culture makes that provable without a live US site.

## Requirements

- MUST: Rainfall chart — daily bars + cumulative overlay, last-30d default / last-7d / custom
  (native inputs, 24-month cap), site-local range math, inches/mm per `unitSystem`.
- MUST: Year-round ingest so a 30-day rainfall window works in January — WITHOUT changing GDD /
  Winkler / GST / frost / heat outputs (existing tests pass unmodified).
- MUST: 7-day forecast strip — per day: hi/lo, condition icon, expected rainfall amount
  (probability secondary), frost/heat badges; days 6–7 visually reduced-confidence.
- MUST: NWS for US (CONUS+AK+HI+territories), Open-Meteo elsewhere; never blend; one primary
  displayed, disagreement in the existing compare-sources disclosure.
- MUST: Forecast frost/heat notifications to **all active tenant members** via the existing inbox
  (`emitNotificationTx`), escalation-only dedup keyed `(vineyardId, targetDate, alertType)`,
  72-hour horizon, using `alertMessage()` copy.
- MUST: Official NWS active alerts rendered verbatim as a banner, visually distinct from computed
  badges.
- MUST: Per-vineyard timezone + ONE definition of "today" across card/actions/sweep/assistant.
- MUST: One conversion module (`units-core`); no inline `×1.8` / `/25.4` anywhere in the section.
- MUST: `User-Agent` on every outbound weather request (NWS 403s without it — live-verified).
- MUST: No new runtime dependencies (no chart/date/tz/icon libraries).
- MUST: Assistant coverage for the new capability (repo definition of done — `verify:ai-native`).
- SHOULD: Surface the already-computed rainfall stats (wet days, wettest day, longest dry streak).
- SHOULD: Retention prune on forecast rows (no unbounded growth).
- SHOULD: Structured logging + retry/backoff on the forecast fetch path.
- NICE: Forecast-vs-actual accuracy scoring — **explicitly deferred** (separate append-only table;
  noted as Later, not built).

## Scope Boundaries

**In scope:** the five phases below, one PR each.

**Out of scope** (spec §Out-of-scope, plus repo decisions):
- Hourly forecasts, radar, satellite, storm tracking, spray-window calc, soil moisture,
  ET0/Penman-Monteith, manual rain-gauge entry, MeteoAlarm/non-US official alerts.
- Forecast accuracy scoring (Later; needs its own append-only table).
- Threshold **editing UI** — thresholds land as config columns with defaults only (user decision
  2026-07-26).
- Open-Meteo **paid** plan — user confirmed no paying clients today; free tier is compliant.
  Host + `apikey` stay config-swappable so the paid swap (`customer-api.open-meteo.com`) is a
  one-line change.
- Fixing unrelated audit findings: `stationElevationDeltaM` never populated, unenforced CDO cap,
  dormant `daymet`/`noaa_cdo`. Noted, left alone.
- Per-user notification mute/preferences (none exist repo-wide; all-members was the user's pick —
  revisit if fatigue appears).

## Research Summary

### Codebase Patterns (verified against main, 2026-07-26)

- **Inbox**: `emitNotificationTx(tx, input)` at `src/lib/inbox/notifications.ts:31` is the single
  choke point — **tx-only** (no non-tx wrapper), reads tenant from ALS (`requireTenantId`), writes
  via `createMany` (deliberate: `create`'s RETURNING trips per-user SELECT RLS). A cron must nest
  `runAsTenant(tenantId, () => runInTenantTx(tx => emitNotificationTx(tx, …)))`.
  **`InboxKind` and `InboxCategory` are Postgres ENUMS** (`schema.prisma:5183-5196`) — a new
  `WEATHER_ALERT` kind needs an **isolated `ALTER TYPE … ADD VALUE` migration committed before any
  code references it** (the Windows enum rule that bit Phase 14's `SEMIMONTHLY`). `SYSTEM`
  category already exists, currently unused. Payload builders live in `src/lib/inbox/payloads.ts`;
  href mapping in `src/lib/inbox/routes.ts` — both need a weather case.
- **All active members** = `prisma.member.findMany({ where: { organizationId: tenantId } })` ∩
  `user.banned != true` — the exact pattern at `src/lib/compliance/reminder-sweep.ts:28-34`
  (Member/User are GLOBAL tables; scope at app layer).
- **No persisted alert log exists** — `alert-core.ts:1-3` says dedup is the caller's job via an
  `alreadyAlerted` set. Escalation-only dedup across 6-hourly cron runs therefore needs a state
  table; `ComplianceReminderPreference`+`ComplianceReminderLog` are the precedent pair.
- **Timezone helpers already exist, pure and tested**: `resolveOperatingTimeZone`
  (`src/lib/work-orders/due-at.ts:239`), `zonedDateKey` (`due-at.ts:153`, Intl `en-CA` →
  `YYYY-MM-DD`, bad-zone → UTC, never throws), `getWineryTimeZone` (`src/lib/settings/data.ts:68`).
  `AppSettings.timeZone` is `String?`, no default. `site-time-core` **composes** these; it does
  not reinvent date math.
- **Sentry**: `src/instrumentation.ts:14` `onRequestError = Sentry.captureRequestError` — route
  handlers/server actions/RSCs are auto-captured. The repo's structured-log idiom is ONE JSON line
  `console.info(JSON.stringify({ evt: "inbox.emit", … }))` (`notifications.ts:52-62`). No shared
  logger module; don't invent one.
- **Cron pattern**: `src/app/api/cron/weather-poll/route.ts` — constant-time bearer check on
  `CRON_SECRET`, `runtime nodejs`, `maxDuration 300`, GET+POST. `vercel.json` crons are staggered;
  `40 15 * * *` is double-booked (weather-poll + soil-sweep) — a new forecast cron must pick a
  free slot.
- **Config model** (`schema.prisma:906-928`): `coverageState` is a **String union, not an enum** —
  `unitSystem` follows that precedent (avoids enum-migration hazard entirely).
- **`user.vineyardIds`**: `UserVineyard` join table (`schema.prisma:2721`), read via `dal.ts`
  `toAppUser`; `canAccessVineyard` at `src/lib/access.ts:140`.
- **P8 build lessons that apply verbatim** (memory): bulk raw upsert chunked ≤1000 rows inside
  `runInTenantTx`, fetch NEVER inside a tx (R8); `"use server"` actions must wrap ingest in
  `runAsTenant`; worktree Prisma client goes stale when a parallel lane merges → `prisma generate`
  before tsc; `verify:ai-native` has a **hardcoded mirror in `test/verify-ai-native.test.ts`**
  that must be updated alongside `scripts/ai-native-allowlist.mjs`; run `npm run lint` before
  pushing UI changes (CI caught eslint twice on P8).

### Prior Learnings

- Migration timestamps must sort AFTER anything already applied to the shared prod DB
  (`migrate status` shows DB-only entries) — P8 collided once already.
- `.env` lives only in the MAIN checkout; worktrees are `.env`-less; local `.env` IS prod (one
  Neon DB). DB-touching verify scripts run from the main checkout.
- On the live tenant, anything with an FK/RLS/uniqueness is backfill-then-enforce (CLAUDE.md).

### External Research (live-verified 2026-07-26, agent report)

**NWS (api.weather.gov)** — all spec assumptions CONFIRMED live, with corrections:
- `/points/{lat},{lon}` → `properties.{timeZone, gridId, gridX, gridY, forecast}`. **UA required
  and enforced: 403 without one.** Recommended format `(app-identifier, contact-email)` →
  ours: `(cellarhand, russellmoss87@gmail.com)`.
- `/gridpoints/{o}/{x},{y}/forecast` → exactly 14 half-day periods (`isDaytime`, `temperature`,
  `temperatureUnit`, `probabilityOfPrecipitation.value`, `shortForecast`, `icon`, `windSpeed`,
  `startTime/endTime`). **`?units=si` works live** (returns °C) but is OpenAPI-only, not on the
  human docs page → use it, but the adapter must defensively check `temperatureUnit` and convert
  F→C if it ever arrives imperial.
- QPF: raw `/gridpoints/{o}/{x},{y}` → `properties.quantitativePrecipitation`
  (`uom: wmoUnit:mm`, `values: [{validTime: "ISO8601/duration", value}]`). **Buckets are usually
  PT6H but NOT always** (live sample had a PT1H first bucket) — parse the duration, never assume.
  Response is large (hundreds of KB) — within the existing 8 MB cap.
- `/alerts/active?point=` → `features[].properties.{event, headline, severity, description,
  ends, expires, instruction}`. **`ends` can be null → fall back to `expires`.**
- Coverage live-tested: Anchorage/Honolulu/San Juan/Guam all 200; **Thimphu → 404
  `InvalidPoint`** — the runtime-404-fallback design is correct.
- Rate limits exist but are unpublished; on 429/limit, retry after ~5 s.

**Open-Meteo** — all CONFIRMED live:
- `/v1/forecast` with `daily=weather_code,temperature_2m_max,temperature_2m_min,
  precipitation_sum,precipitation_probability_max,wind_speed_10m_max&forecast_days=7&
  timezone=auto&elevation={m}` returns all six arrays, `timezone` + `utc_offset_seconds`, echoes
  `elevation`. Docs: elevation is "used for statistical downscaling… manually set… to correctly
  match mountain peaks" — exactly the Bhutan-at-2,300 m case.
- `/v1/elevation` keyless, `{elevation:[n]}`, Copernicus GLO-90.
- Default units °C/mm/km-h confirmed via `daily_units`.
- Free tier: non-commercial, 10k/day **plus 5k/hr, 600/min, and 300k/month** (spec omitted the
  monthly cap — irrelevant at our volume: ~13 vineyards × 4 fetches/day ≈ 52 calls/day).
- Paid host `customer-api.open-meteo.com` + `&apikey=` confirmed. Attribution mandatory even
  paid: `Weather data by Open-Meteo.com` linked — note the licence URL is `/en/licence`
  (UK spelling; `/en/license` is dead).
- WMO `weather_code` table: complete 28-code list confirmed (0,1,2,3,45,48,51,53,55,56,57,61,63,
  65,66,67,71,73,75,77,80,81,82,85,86,95,96,99).

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Forecast contract | New parallel `ForecastProvider` (`forecast-types.ts`), NOT extending `ClimateProvider` | Extend `ClimateProvider` | Spec-mandated; forecast is future-dated, replaced-not-accumulated, carries condition/probability/wind that no observation record has |
| Forecast storage | New `vineyard_forecast_daily`, upsert on `(tenantId,vineyardId,providerKey,targetDate)`, `issuedAt` as column | Append-only issuance history | Replace-not-accumulate is the display model; accuracy history deferred to a Later append-only table |
| Timezone source | Provider-reported tz (NWS `points.timeZone` / OM `timezone=auto`), persisted on config; fallback config→AppSettings→UTC | tz library (banned); IANA lookup table | Zero deps; the providers already know; composes existing `due-at.ts` helpers |
| `unitSystem` column type | String union `"METRIC" \| "IMPERIAL"` on config | Prisma enum | Follows `coverageState` precedent; avoids the Postgres enum-migration hazard entirely |
| Unit default | Coverage-based: `US_HIGH_RES`→IMPERIAL else METRIC (user decision 2026-07-26) | Imperial everywhere | User chose spec rule; per-vineyard override action included |
| `InboxKind` addition | `WEATHER_ALERT` via **isolated ALTER TYPE migration**, committed before any referencing code | String column refactor | `kind` IS a Postgres enum; the isolated-migration rule is a hard repo lesson (SEMIMONTHLY) |
| Alert recipients | ALL active tenant members (member ∩ `banned != true`) — user decision | Vineyard-assigned + admins; admins only | User chose; reminder-sweep pattern reused verbatim |
| Escalation dedup state | New RLS table `vineyard_weather_alert_state`, unique `(tenantId,vineyardId,targetDate,alertType)`, stores highest notified tier | Dedup by querying inbox_notification | No persisted alert log exists; querying notifications couples dedup to display; state table matches `ComplianceReminderLog` precedent |
| Year-round volume bound | `FULL_YEAR_WINDOW_YEARS = 3` full-year; season-only beyond | Full-year × 20 yr | Normals only need season months; bounds the row delta (~9k rows across ~13 populated vineyards — trivial, stated in PR) |
| Rainfall range persistence | `localStorage` per browser | New DB column/table | "Per user" satisfied without schema; no cross-device requirement stated |
| NWS temps | Request `?units=si`, defensively convert if `temperatureUnit==="F"` | Parse °F and always convert | Metric-at-the-edge with a belt: `units=si` is live-verified but lightly documented |
| Open-Meteo tier | Free (user: no paying clients); base URL + optional `OPEN_METEO_API_KEY` in config from day one | Paid Standard now | User decision; swap to `customer-api` host is one line when needed |
| Forecast cron | New `/api/cron/forecast-poll` at `10 */6 * * *` + refresh-on-view when `issuedAt` > 6 h | Reuse daily sweep | Daily is too slow for forecasts; `40 15` slot is already double-booked |
| Observability | `evt:` JSON lines + retry/backoff; rely on `onRequestError` auto-capture, manual `captureException` only at cron top-level | New logger module | Repo has no logger; `inbox.emit` line is the established idiom |
| Assistant coverage | Forecast branch in `query_climate` + goldens + allowlist entries (incl. the meta-test mirror) | Skip (spec silent) | Repo definition of done: `verify:ai-native` fails on unwired cores; P8 lesson says update BOTH allowlist and `test/verify-ai-native.test.ts` |
| Forecast replace semantics (council C1) | Delete forward horizon per `(vineyard,provider)` then bulk-insert, one tx | Upsert-only | Upsert alone leaves stale future rows when a horizon shortens |
| Emit idempotency (council C2) | Claim-first conditional state upsert (`WHERE notifiedTier < new` RETURNING); emit only won claims | Read-then-write in tx | Cron × on-view refresh race double-sends otherwise; NDVI claim-first idiom |
| Alert input series (council C3) | One `selectPrimaryForecastSeries`, consumed by display/badges/notify/assistant | Per-consumer selection | Never-blend: alerts must not fire off the secondary provider |
| QPF day assignment (council S6) | Whole interval → civil day where the interval ENDS | Pro-rata midnight split | Pro-rata assumes uniform rain — invented precision vs the honesty rules |
| Sustained-heat detection (council C5) | Classify over full 7 days; 72 h notify horizon applies to single-day tiers only | 72 h for everything | A 3-day run is invisible inside a 72 h window until it has begun |
| De-escalation (council C6) | "All clear" emit when a WARNING+ alert drops below WATCH; `clearedAt` state | Silent clearing | A grower who mobilized frost crews must hear the stand-down |
| History upkeep (council S3) | Monthly idempotent 3-yr full-year top-up in the sweep (`lastHistoryTopUpAt`) | One-time script only | Rolling 400-day window decays the 13–24-month rainfall coverage over time |

## Phase map (one PR per phase, in order)

| Phase | Branch | Units | Gate to next |
|---|---|---|---|
| 0 Foundations | `feat/weather-p0-foundations` | U1–U5 ✅ **BUILT 2026-07-26** (gates: tsc 0, vitest 4146/0, lint 0 err, verify:weather + verify:ai-native green; live proof: Paro siteElevationM null→2302 m via Open-Meteo, unitSystem METRIC default) | merged; blocks everything |
| 1 Rainfall | `feat/weather-p1-rainfall` | U6–U9 | independent of Phase 2 after 0 |
| 2 Forecast | `feat/weather-p2-forecast` | U10–U17 | independent of Phase 1 after 0 |
| 3 Warnings | `feat/weather-p3-alerts` | U18–U23 | needs Phase 2 |
| 4 Observability + assistant | `feat/weather-p4-observability` | U24–U25 | needs Phase 2 (U25 also 3) |

## Implementation Units

### Unit 1: Config schema — `timeZone` + `unitSystem`

**Goal:** Per-vineyard timezone and unit-system columns exist and are backfilled.
**Files:** `prisma/schema.prisma` (VineyardWeatherConfig), new migration
`prisma/migrations/<ts>_weather_config_tz_units/migration.sql`
**Approach:** Add `timeZone String?` (IANA, provider-reported, null = unresolved) and
`unitSystem String @default("METRIC")` to `VineyardWeatherConfig`. **Council S2:** the IMPERIAL
default/backfill derives from a small `isUsForecastCoverage(lat, lon)` helper (the Unit-10 NWS
bboxes — CONUS+AK+HI+territories), NOT the legacy CONUS-only `coverageState` (AK/HI vineyards
are `GLOBAL_COARSE` yet US users). Backfill computes per-vineyard via its centroid.
Also add `lastHistoryTopUpAt DateTime?` (used by the Unit-6 monthly history top-up).
Existing table already has RLS — no policy change. Timestamp must sort after everything
`migrate status` shows as applied (P8 lesson). **Council S7:** each phase branch rebases onto
current main before merge and re-runs `prisma migrate status` there — hand-sorted timestamps
alone don't prove clean application when parallel lanes are merging.
**Tests:** none new (columns only); `verify:tenant-isolation` still green.
**Depends on:** none
**Patterns to follow:** `coverageState` String-union comment style at `schema.prisma:919`.
**Verification:** `npx prisma migrate status` clean; `npm run verify:tenant-isolation`.

### Unit 2: `site-time-core` — the ONE "today"

**Goal:** Exactly one definition of site-local "today"/"now" used by card, actions, sweep, and
assistant.
**Files:** new `src/lib/weather/site-time-core.ts`, new `test/weather-site-time.test.ts`;
modify `src/lib/weather/actions.ts` (lines ~74,142,221), `src/lib/weather/sweep.ts` (~46),
`src/lib/assistant/tools/query-climate.ts` (~46-49).
**Approach:** Pure core: `resolveSiteTimeZone(configTz, appSettingsTz): string` (chain
config → AppSettings → `"UTC"`, validated via `due-at.ts` `normalizeTimeZone`/`isRealTimeZone`)
and `siteTodayIso(tz, now?: Date): string` composing `zonedDateKey`. Server-side helper in
`actions.ts` loads config + `getWineryTimeZone()` and threads the result; `query-climate` keeps
its viewer-tz fallback as the LAST link (config tz now wins when present). Grep the weather tree
for `toISOString().slice(0, 10)` afterward — zero survivors on "today" paths (`addDaysIso`
arithmetic is fine).
**Tests:** fallback chain (3 cases); UTC-boundary day-flip for Asia/Thimphu (+6) and
America/Los_Angeles (−8) with fixed `now` instants; invalid tz → UTC.
**Depends on:** Unit 1
**Patterns to follow:** `query-climate.ts:46-49` (the existing composition to generalize);
`due-at.ts:153,239`.
**Verification:** new tests pass; `test/weather-*.test.ts` all green; grep shows one "today"
definition.

### Unit 3: `units-core` — one conversion surface

**Goal:** Every grower-visible number routes through one module; the hardcoded `1.8` dies.
**Files:** new `src/lib/weather/units-core.ts`, new `test/weather-units.test.ts`; modify
`src/app/(app)/vineyards/weather/WeatherCard.tsx`, `GddChart.tsx` (axis labels only — series
stay °C-computed), `src/lib/assistant/tools/query-climate.ts:111`,
`src/lib/weather/normals-core.ts` call sites, `src/lib/weather/actions.ts` (new
`setVineyardUnitSystem` action), `src/lib/weather/ingest-core.ts` (default `unitSystem` at
config-create per coverage).
**Approach:** `formatTemp/formatPrecip/formatSpeed/formatGdd(valueMetric, unitSystem)` → formatted
string with unit; expose raw converters for chart scales. Reuse `C_TO_F_GDD`. The °C frost/heat
panels and the °F GDD headline both move onto it. Server action mirrors the
`setVineyardPrimarySource` idiom (`actions.ts:147`) including `runAsTenant` + revalidate.
**Council S8:** a minimal °F/°C toggle in the existing "Where this estimate comes from" panel
(same idiom as the provider-override selector) — an override action with no UI is a dead end
(the "defaults only" user decision was about ALERT THRESHOLDS, not units).
**Tests:** each formatter both systems, null-handling, rounding; assert `query-climate` output
matches `C_TO_F_GDD` (no literal 1.8).
**Depends on:** Unit 1
**Patterns to follow:** `normals-core.ts:12` constant; `actions.ts:147-176` action shape.
**Verification:** grep for `1.8`/`25.4` inline in the weather tree → only `units-core` +
`C_TO_F_GDD`; `npm run lint` (P8 lesson: eslint before push).

### Unit 4: User-Agent + host allowlist

**Goal:** Every outbound weather request carries a UA; new hosts are allowlisted.
**Files:** `src/lib/weather/config.ts`, `src/lib/weather/providers/fetch-util.ts`,
`test/weather-providers.test.ts` (extend).
**Approach:** `export const WEATHER_USER_AGENT = "(cellarhand, russellmoss87@gmail.com)"` in
config (NWS-recommended format, live-verified 403-without). `fetch-util` sets it as a default
header on all three helpers (caller `init` may extend, not remove). Allowlist +=
`api.weather.gov`, `api.open-meteo.com`, `archive-api.open-meteo.com`,
`customer-api.open-meteo.com`. Keep host-pin + `redirect:"manual"` untouched.
**Tests:** header present on fetchJson/postJson (mock fetch); new hosts pass
`assertAllowedHost`, unknown host still throws.
**Depends on:** none
**Patterns to follow:** `fetch-util.ts:16-27`, `config.ts:10-19`.
**Verification:** extended provider tests green.

### Unit 5: Global elevation fallback

**Goal:** Non-US vineyards get a real `siteElevationM` (Bhutan at ~2,300 m is a multi-degree
temperature error if left on the gridcell mean).
**Files:** new `src/lib/weather/providers/open-meteo-elevation.ts`,
`src/lib/weather/ingest-core.ts` (elevation step), `test/weather-providers.test.ts`.
**Approach:** Keyless `GET api.open-meteo.com/v1/elevation?latitude&longitude` →
`{elevation:[n]}` (Copernicus GLO-90, live-verified). In ingest's elevation resolution: EPQS
where it covers, else Open-Meteo; persist to `siteElevationM`. The value is later passed as
`elevation=` on Open-Meteo forecast calls (Unit 13).
**Tests:** normalizer fixture; fallback-ordering unit test (EPQS UNAVAILABLE → OM value).
**Depends on:** Unit 4
**Patterns to follow:** `usgs-epqs.ts` (a non-series point provider).
**Verification:** provider tests green; a Bhutan `runAsTenant` read shows `siteElevationM`
populated after next refresh (main-checkout script, prod-safe read).

### Unit 6: Year-round ingest (bounded)

**Goal:** "Last 30 days" rainfall works in January; climate math is byte-identical.
**Files:** `src/lib/weather/backfill-core.ts`, `src/lib/weather/actions.ts` (ingest window),
`src/lib/weather/sweep.ts` (same window).
**Approach:** Backfill keeps ALL months for the most recent `FULL_YEAR_WINDOW_YEARS = 3` complete
years and season-only beyond (named constant, single filter site). Current-season ingest window
widens from season-start→today to a rolling **last-400-days**→today. `filterToSeason` call sites
in the math cores are UNTOUCHED — storage changes, computation doesn't.
**Tests:** REGRESSION GATE: `weather-climate-math.test.ts` + `weather-normals.test.ts` pass
**unmodified** — if they need edits, the change is wrong (spec hard rule). New backfill-core
test: month-retention boundary (recent-3 full-year vs older season-only), both hemispheres.
**Council R1 belt:** one new test asserting season GDD computed over a rows-set CONTAINING winter
days equals the same computation over season-only rows (proves `filterToSeason` at compute time
keeps off-season storage out of the math — refutes the contamination scenario mechanically).
**Council S3:** ongoing coverage decays without upkeep (rolling 400-day window + one-time script
leaves a growing 13–24-month hole as the calendar advances) → the daily sweep re-runs the
idempotent 3-year full-year backfill **monthly per vineyard** (`lastHistoryTopUpAt` stamp on
config; run when > 30 days old; one request per provider — cheap).
**Depends on:** Unit 2 (window arithmetic is site-local)
**Patterns to follow:** `backfill-core.ts:35-37` (the filter being scoped, not deleted).
**Verification:** full `npx vitest run test/weather-*` green with zero edits to the two gate
files; PR description states the estimated row delta (~9k rows: ~13 vineyards × ~151 off-season
days × 3 yr ÷ provider mix).

### Unit 7: Off-season re-backfill script

**Goal:** Existing season-only rows get their off-season neighbors for the recent-3-year window.
**Files:** new `scripts/backfill-weather-offseason.ts`, `package.json` (script entry).
**Approach:** Enumerate tenants (`listAllOrgIds`) → `runAsTenant` → for each vineyard with any
weather rows, call the widened backfill for the 3-year window. Idempotent — the
`(tenantId,vineyardId,localDate,providerKey)` upsert absorbs re-runs. Run from the MAIN checkout
(worktrees have no `.env`).
**Tests:** none (script); its effect is proven by Unit 9's January acceptance query.
**Depends on:** Unit 6
**Patterns to follow:** `scripts/verify-weather.ts` structure; sweep's tenant loop.
**Verification:** run prints per-vineyard row counts; spot-check a January date exists via a
`runAsTenant` read.

### Unit 8: Rainfall read path

**Goal:** A range-scoped daily rainfall series + the four existing stats reach the UI layer.
**Files:** new `src/lib/weather/rainfall-range-core.ts`, new
`test/weather-rainfall-range.test.ts`; `src/lib/weather/actions.ts` (new
`loadVineyardRainfallRange(vineyardId, startIso, endIso)`).
**Approach:** Pure core takes stored rows (primary provider, gap-fill labeling reused from
`gapFillCore`) + range → `{ days: [{localDate, precipMm, filledFrom?}], cumulative, stats }`,
where stats reuses `rainfall-core.ts` (already computes totalMm/wetDays/wettestDayMm/
longestDryStreakDays/lowConfidence — audit §9a). Range arithmetic via `addDaysIso` +
`site-time-core`; 24-month cap enforced server-side. Action mirrors
`loadVineyardClimateSummary` (Decimal coercion, no live fetch).
**Tests:** range clipping, empty range, cumulative monotonicity, stats pass-through, cap
rejection, never-blend (series is single-provider + labeled fills).
**Depends on:** Units 2, 6
**Patterns to follow:** `actions.ts:110-144`; `read-core.ts` DTO style; add core to ai-native
allowlist **and** the `test/verify-ai-native.test.ts` mirror (INTERNAL — UI-feeding).
**Verification:** new tests + `npm run verify:ai-native`.

### Unit 9: Rainfall chart + range control

**Goal:** The grower sees daily bars, a cumulative line, period stats, and a working range picker.
**Files:** new `src/app/(app)/vineyards/weather/RainfallChart.tsx`, new
`RainfallSection.tsx` (client wrapper: range state, localStorage, action call);
`WeatherCard.tsx` (mount the section).
**Approach:** Read `GddChart.tsx` first; same idiom — hand-rolled SVG, design tokens, crosshair
readout (bar + cumulative value + date), no zoom needed v1. Bars on primary axis, cumulative line
on secondary. Presets Last-30 (default) / Last-7 / Custom (two native `<input type="date">`,
mirroring the native-select idiom at `WeatherCard.tsx:154-163`); last-used range in
`localStorage`. Stats row above the chart: period total (large, `units-core`), rain days,
wettest day, longest dry streak, days since measurable rain. Keep the honesty label
("Regional Rainfall Estimate (≈4 km average, not your rain gauge)"). Empty state names the empty
range and offers widening — never a bare axis.
**Tests:** none (component); extract any non-trivial scale/tick math into
`rainfall-range-core` where it's tested.
**Depends on:** Units 3, 8
**Patterns to follow:** `GddChart.tsx` structure/props/interaction; DESIGN.md tokens (real ones —
`--accent`, `--surface-raised`, `--text-muted`… the P8 invisible-button lesson).
**Verification:** `npm run lint`; browser QA on Demo Winery (in-app pane): 30d default renders,
7d switches, custom range works, empty-winter-range shows the honest empty state; a January
window returns data (proves Units 6–7).

### Unit 10: Forecast contract + registry

**Goal:** The `ForecastProvider` seam exists with correct US coverage.
**Files:** new `src/lib/weather/providers/forecast-types.ts`, new
`src/lib/weather/providers/forecast-registry.ts`, new `test/weather-forecast-registry.test.ts`.
**Approach:** Types exactly per spec (`ConditionCode` 13-value union, `ForecastDailyRecord`,
`ForecastSeries`, `ForecastProvider` with `coverageFor` + `fetchForecast({lat, lon, elevationM})`).
Registry mirrors `registry.ts:27-43`. NWS `coverageFor` gets its OWN bboxes (CONUS + AK + HI +
PR/VI + Guam/AS/MP — do NOT reuse `coverageStateFor`, which is CONUS-only), AND the ingest treats
a live `/points` 404 (`InvalidPoint`, live-verified) as fallback-to-Open-Meteo. Open-Meteo covers
globally.
**Tests:** coverage table — Anchorage/Honolulu/San Juan/Guam → NWS; Thimphu → Open-Meteo only;
Napa → both, NWS first.
**Depends on:** none (parallel to Phase 1)
**Patterns to follow:** `providers/types.ts`, `registry.ts`.
**Verification:** registry tests green.

### Unit 11: Forecast storage schema

**Goal:** `vineyard_forecast_daily` exists, RLS-isolated, plus NWS grid cache columns.
**Files:** `prisma/schema.prisma`, new migration
`prisma/migrations/<ts>_forecast_schema/migration.sql`,
`scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts` (new case).
**Approach:** Table per spec: `tenantId, id, vineyardId, providerKey, targetDate(date),
issuedAt(timestamptz), tmaxC, tminC, precipMm, precipProbabilityPct, conditionCode, windMaxKph,
provenance jsonb, createdAt, updatedAt`; UNIQUE `(tenantId,vineyardId,providerKey,targetDate)`;
INDEX `(tenantId,vineyardId,targetDate)`; CHECKs `tminC<=tmaxC` (null-tolerant — the NWS
afternoon-fetch day-1 has a low and NO high), `precipMm>=0`, probability 0–100. **Council C7: all five value columns
(`tmaxC,tminC,precipMm,precipProbabilityPct,windMaxKph`) are NULLABLE end-to-end** — DB nullable,
TS `number | null`, no sentinels — the NWS afternoon-fetch day-1 (low, no high) is a first-class
row. Full RLS per the U7 checklist (ENABLE+FORCE+`tenant_isolation` USING+WITH CHECK, composite
FK → `vineyard(tenantId,id)` ON DELETE CASCADE, app_rls grants). Also add
`nwsGridId String?`, `nwsGridX Int?`, `nwsGridY Int?` to `VineyardWeatherConfig` (the /points
mapping never changes for a fixed coordinate — cache it, audit §14 station-meta instinct).
**Tests:** tenant-isolation case (cross-tenant read blocked).
**Depends on:** Unit 10
**Patterns to follow:** `20260725150000_weather_schema/migration.sql` verbatim; AGENTS.md
tenant-table checklist steps 1–9.
**Verification:** `npm run verify:tenant-isolation` (row-count +1 table); `migrate status` clean.

### Unit 12: NWS forecast adapter

**Goal:** A production-quality NWS adapter: grid caching, day/night pairing, QPF summing.
**Files:** new `src/lib/weather/providers/forecast-nws.ts`, new
`test/weather-forecast-nws.test.ts` (+ fixtures).
**Approach:** (1) Resolve grid via `/points/{lat},{lon}` unless config already carries
`nwsGridId/X/Y`; capture `properties.timeZone` for Unit 1's column. (2) Fetch
`/gridpoints/{o}/{x},{y}/forecast?units=si` — pair each `isDaytime:true` period (high) with the
following night (low); an evening fetch whose `periods[0]` is a night period yields day-1 with
`tminC` set and `tmaxC: null` — emit it honestly (never 0, never dropped). Defensive: check
`temperatureUnit`, convert F→C if the si param regresses. (3) Fetch raw `/gridpoints/{o}/{x},{y}`
and sum `quantitativePrecipitation.values` (`wmoUnit:mm`) into vineyard-local civil days —
**parse each `validTime` ISO8601 start/duration; buckets are usually PT6H but a PT1H first bucket
occurs live**. **Council S6: NO pro-rata midnight split** — assign each interval to the civil day
in which the interval ENDS (climatological norm); splitting assumes uniform rain and invents
precision the honesty rules forbid. (4) Wind: parse `windSpeed` max; condition via Unit 14.
**Council S5 (convention, documented in-code):** the card keeps the consumer-forecast pairing
(day + FOLLOWING night — "Mon 24°/−2°" where the low is Monday night, physically Tue ~5 a.m.);
`targetDate` = the card date. Alert COPY must therefore name the night unambiguously
("night of Mon Apr 3 → Tue Apr 4") — see Units 20–21.
**Tests:** fixture-driven — afternoon-fetch edge (day-1 null high), full-day pairing (7 days from
14 periods), QPF interval straddling local midnight (the spec's named fiddliest case), non-PT6H
bucket, °F-arriving defense, 404 `InvalidPoint` → typed coverage error.
**Depends on:** Units 4, 10, 11
**Patterns to follow:** `rcc-acis.ts` (multi-endpoint adapter shape), `fetch-util` helpers.
**Verification:** `npx vitest run test/weather-forecast-nws.test.ts`.

### Unit 13: Open-Meteo forecast adapter

**Goal:** The globally-covering adapter that actually runs for Bhutan today.
**Files:** new `src/lib/weather/providers/forecast-open-meteo.ts`, `src/lib/weather/config.ts`
(base URL + optional key), new `test/weather-forecast-open-meteo.test.ts`.
**Approach:** GET `/v1/forecast` with the six live-verified daily vars, `forecast_days=7`,
`timezone=auto`, `elevation={siteElevationM}` when known (downscaling to true site elevation —
docs-quoted behavior). Capture response `timezone` → persist to config `timeZone`. Base URL from
config: `OPEN_METEO_BASE_URL` default `https://api.open-meteo.com`, optional `OPEN_METEO_API_KEY`
appended as `apikey` — the paid swap is a one-line env change (user decision: free tier now).
Map `weather_code` via Unit 14.
**Tests:** fixture normalization (7 days, units, nulls), timezone capture, elevation param
presence, apikey append when set.
**Depends on:** Units 4, 5, 10, 11
**Patterns to follow:** `nasa-power.ts` (GET adapter shape).
**Verification:** adapter tests green.

### Unit 14: Condition codes + icons

**Goal:** Complete, honest condition mapping and dependency-free icons.
**Files:** new `src/lib/weather/condition-core.ts`, new `test/weather-condition.test.ts`, new
`src/app/(app)/vineyards/weather/ConditionIcon.tsx`.
**Approach:** Two pure tables: (a) WMO → `ConditionCode` covering ALL 28 documented codes
(list live-verified in Research); (b) NWS icon-URL token parse primary (`/icons/land/{day|night}/
{token}`), `shortForecast` text fallback. Unmapped input → structured `evt:"weather.condition.unmapped"`
log line + `UNKNOWN` (never silent). Icons: one small inline-SVG component per `ConditionCode`,
sized by prop, colored from design tokens — consistent with `card-core.sparklinePoints` idiom;
no lucide.
**Tests:** every one of the 28 WMO codes asserts a non-UNKNOWN mapping; NWS token cases
(skc/few/sct/bkn/ovc/rain/tsra/snow/fog/wind variants); fallback path; unmapped logs.
**Depends on:** Unit 10
**Patterns to follow:** `card-core.ts` (pure presentation helpers + untested thin component).
**Verification:** condition tests green; allowlist + meta-test mirror updated for the new core.

### Unit 15: Forecast ingest + cadence + retention

**Goal:** Forecasts land in the table on a 6-hour cadence and never grow unbounded.
**Files:** new `src/lib/weather/forecast-ingest-core.ts`, new
`src/app/api/cron/forecast-poll/route.ts`, `vercel.json` (cron `10 */6 * * *`),
`src/lib/weather/sweep.ts` (retention prune), `src/lib/weather/actions.ts`
(`refreshVineyardForecast` for on-view), `WeatherCard.tsx` (stale-trigger),
new `test/weather-forecast-ingest.test.ts`.
**Approach:** Core fetches covering forecast providers (registry, best-first; NWS 404 → next)
OUTSIDE any tx (R8), normalizes, then ONE `runInTenantTx` that — **Council C1** — first DELETEs
the managed forward horizon for that `(vineyard, provider)` (`targetDate >= siteToday`) and then
bulk-inserts the fresh rows (a shortened/omitted horizon can never leave a stale future row).
1,000-row chunks — P8 idiom; 7 days × ≤2 providers is tiny but keep the pattern. **Council S4:**
persisting the config cache (`timeZone`, `nwsGridId/X/Y`, OM-captured tz) is an EXPLICIT step
inside this same tx, with a first-ingest persistence test — otherwise `siteToday` silently falls
back to AppSettings/UTC and the one-today guarantee dies. Store every covering provider's rows;
display picks primary via ONE shared `selectPrimaryForecastSeries` in `forecast-read-core`
(**Council C3** — Units 16, 21, 23, 25 all consume this exact selector; alerts must never read
the secondary provider). Usage metering via the existing `weather_provider_usage` counter. Cron route copies `weather-poll/route.ts` auth verbatim; loops
tenants via `listAllOrgIds` + `runAsTenant`; per-vineyard try/catch into a summary. Prune
`targetDate < siteToday(tz) − 1 day` inside the daily sweep. On-view: card triggers
`refreshVineyardForecast` when stored `issuedAt` older than 6 h (mirror the auto-fetch idiom
`WeatherCard.tsx:61-88`); stale data still renders with its `issuedAt` — a 6-hour-old forecast
beats a spinner.
**Tests:** replace semantics (same key overwritten, `issuedAt` advances, AND a shortened horizon
deletes the orphaned future day — C1), never-blend (rows single-provider), provider-failure
isolation (one fails → other lands), prune boundary, config-cache persistence on first ingest (S4).
**Depends on:** Units 11, 12, 13
**Patterns to follow:** `ingest-core.ts` (fetch-outside-tx + bulk upsert), `sweep.ts`,
`weather-poll/route.ts`.
**Verification:** ingest tests; a Demo-tenant `runAsTenant` script writes + reads back 7×2 rows
(main checkout).

### Unit 16: Forecast strip UI

**Goal:** Seven honest cards at the top of the weather card.
**Files:** new `src/app/(app)/vineyards/weather/ForecastStrip.tsx`, `WeatherCard.tsx` (mount
above headline), `src/lib/weather/read-core.ts` or a new `forecast-read-core.ts` (compose DTO:
pick primary forecast provider = NWS where present else Open-Meteo; spread vs secondary).
**Approach:** Per card: day name + date (site-local), `ConditionIcon`, high dominant / low
secondary (units-core), expected rainfall AMOUNT with probability as secondary text, badge slot
(Phase 3). Horizontal scroll on mobile, grid on desktop (Tailwind v4). Days 6–7: reduced emphasis
+ explicit "lower confidence" label — the section's voice never overstates. Day-1-no-high renders
"—" with the low, honestly. Both-provider disagreement surfaces in the existing
"Compare sources / data trust" disclosure via `computeSpreadCore` idiom — never averaged.
Attribution: render Open-Meteo's required link (`Weather data by Open-Meteo.com` →
`https://open-meteo.com/`) through the existing attribution path (`WeatherCard.tsx:259-325`).
**Tests:** DTO composition in the core (primary pick, spread, day ordering, null-high card);
component untested (repo convention).
**Depends on:** Units 14, 15
**Patterns to follow:** `WeatherCard.tsx` panel structure; DESIGN.md tokens.
**Verification:** `npm run lint`; browser QA Demo: strip renders 7 days for a US-fixture and the
real Bhutan vineyards (Open-Meteo, UTC+6, elevation-corrected).

### Unit 17: E2E verify extension

**Goal:** `verify:weather` proves the forecast loop offline.
**Files:** `scripts/verify-weather.ts` (+ fixture forecast providers).
**Approach:** Committed fixture `ForecastProvider`s (one NWS-shaped incl. the afternoon edge +
QPF buckets, one OM-shaped) drive `forecast-ingest-core` against the Demo tenant: assert 7-day
rows per provider, replace-on-reingest, provenance, prune behavior, cleanup. Same
fixture-provider style the script already uses.
**Tests:** the script IS the test.
**Depends on:** Unit 15
**Patterns to follow:** existing `verify-weather.ts` fixtures.
**Verification:** `npm run verify:weather` green from the main checkout.

### Unit 18: `InboxKind` enum migration (isolated)

**Goal:** `WEATHER_ALERT` exists as an enum value BEFORE any code references it.
**Files:** `prisma/schema.prisma` (enum), new migration
`prisma/migrations/<ts>_inbox_kind_weather_alert/migration.sql` — containing ONLY
`ALTER TYPE "InboxKind" ADD VALUE 'WEATHER_ALERT';`
**Approach:** The Windows/Postgres enum rule (Phase 14 SEMIMONTHLY lesson): the ALTER TYPE ships
in its own migration, committed and applied before any column default or code path uses the
value. Nothing else in this migration. **Council S1 (adjudicated):** it stays in the Phase 3 PR
but MUST be the FIRST migration of the phase — Prisma runs each migration in its own transaction,
so later migrations in the same deploy may use the value (the proven Phase 14 pattern; a separate
deploy is not required). State the ordering in the PR description; if deploy tooling ever batches
migrations differently, escalate before merging.
**Tests:** none.
**Depends on:** none (can land first in Phase 3)
**Patterns to follow:** the SEMIMONTHLY isolated-ALTER-TYPE migration (Phase 14 v1.1).
**Verification:** `migrate status` clean; `npx prisma generate` picks up the value.

### Unit 19: Alert thresholds + escalation state table

**Goal:** Per-vineyard threshold columns (defaults only) + persisted escalation state.
**Files:** `prisma/schema.prisma`, new migration `prisma/migrations/<ts>_weather_alert_state/`,
tenant-isolation case.
**Approach:** On `VineyardWeatherConfig`: `frostWatchC Decimal @default(2)`,
`frostWarnC @default(0)`, `hardFreezeC @default(-2)`, `heatWatchC @default(35)`,
`extremeHeatC @default(38)` (metric storage; 36/32/28/95/100 °F equivalents — display converts).
NO editing UI (user decision). New RLS table `vineyard_weather_alert_state`: `tenantId, id,
vineyardId, targetDate(date), alertType, notifiedTier, lastNotifiedAt, clearedAt DateTime?`
(**Council C6** — de-escalation state), UNIQUE `(tenantId,vineyardId,targetDate,alertType)` —
full U7 RLS checklist. This is what makes "notify once, escalate once, never repeat on the
6-hourly cron" survive process restarts. **Council C4:** this migration ALSO adds
`activeAlertsJson Json?` + `activeAlertsFetchedAt DateTime?` to `VineyardWeatherConfig` — the
persisted storage the U22 banner renders between refreshes (bounded array of
`{event, headline, severity, endsAt, url}`).
**Tests:** tenant-isolation case for the new table.
**Depends on:** Unit 11 (schema ordering)
**Patterns to follow:** `ComplianceReminderLog` precedent; weather-schema migration template.
**Verification:** `verify:tenant-isolation`; `migrate status`.

### Unit 20: Tiered alert classification (pure)

**Goal:** One detector handles observed AND forecast rows with tiers, sustained heat, and the
dormant-season modifier.
**Files:** `src/lib/weather/alert-core.ts` (extend — do NOT write a second detector),
`test/weather-alert.test.ts` (extend), `test/weather-forecast-alert.test.ts` (new).
**Approach:** Extend `detectWeatherAlertsCore` input to accept forecast-shaped rows and
per-vineyard thresholds (from Unit 19 columns; function defaults stay as fallbacks). Tiers:
FROST_WATCH ≤2 °C, FROST_WARNING ≤0, HARD_FREEZE ≤−2, HEAT_WATCH ≥35, EXTREME_HEAT ≥38, plus
SUSTAINED_HEAT for ≥3 consecutive forecast days ≥35 °C. **Council C5: classification always runs
over the FULL 7-day primary series** (a 72 h window structurally cannot see a 3-day run before it
starts); the 72 h notification horizon applies to single-day frost/heat tiers only —
SUSTAINED_HEAT notifies as soon as the run is detected anywhere in the 7 days (heat prep is
multi-day planning). **SUSTAINED_HEAT identity (Codex DQ1): `targetDate` = first day of the
consecutive run**; a shifted run start is a new event key (documented — re-notify is correct
there). `frost-core`'s hemisphere-mirrored vulnerable window is a **severity modifier, not a
gate**: out-of-window frost still badges, never notifies (a 28 °F November night is information,
not an emergency). Escalation logic pure: `(currentTier, previouslyNotifiedTier | cleared) →
notify?` — re-notify only on watch→warning→freeze escalation, never repetition; **Council C6:
de-escalation is a first-class transition** — previously-notified-at-WARNING-or-worse dropping
below WATCH emits one "forecast improved / alert cleared"; a re-crossing after a clear escalates
fresh from cleared state (no flapping). Alert copy names the night unambiguously
("night of Mon Apr 3 → Tue Apr 4" — Council S5).
**Tests:** every tier boundary, sustained-heat window (2 days no / 3 days yes / gap resets /
run-start shift = new key), full-7-day detection with day-5 run start, in/out-of-window notify
gating, escalation matrix incl. cleared-state transitions (12 cases), custom thresholds override
defaults, two-date night phrasing.
**Depends on:** Unit 19 (threshold shape), Unit 15 (row shape)
**Patterns to follow:** existing `alert-core.ts` purity + `alreadyAlerted` caller-dedup comment.
**Verification:** alert tests green; existing 28 `weather-alert` tests still pass.

### Unit 21: Notification emit

**Goal:** A frost-warning-or-worse or heat-watch-or-worse within 72 h reaches every active
member's inbox, exactly once per tier.
**Files:** `src/app/api/cron/forecast-poll` path (post-ingest hook in the sweep logic),
`src/lib/inbox/payloads.ts` (builder), `src/lib/inbox/routes.ts` (href case →
`/vineyards/weather?vineyard={id}`), new `src/lib/weather/alert-emit.ts`,
`test/weather-alert-emit.test.ts` (pure parts).
**Approach:** After each vineyard's forecast ingest: run Unit 20 over the PRIMARY series
(`selectPrimaryForecastSeries` — Council C3) → candidate alerts → inside `runAsTenant` +
`runInTenantTx`: **claim-first (Council C2)** — advance state via a single
`INSERT … ON CONFLICT … DO UPDATE SET "notifiedTier" = EXCLUDED."notifiedTier" WHERE
vineyard_weather_alert_state."notifiedTier" < EXCLUDED."notifiedTier" RETURNING id` and emit
notifications ONLY for keys the claim WON (cron and on-view refresh can race; the loser emits
nothing — same claim-first idiom as the NDVI derivative cache). **Digest grouping (Gemini S2, user-confirmed
2026-07-26):** group won claims per `(targetDate, tier)` across the tenant's
vineyards into ONE notification listing affected vineyards ("Hard Freeze warning, night of
Tue→Wed — 8 vineyards: …") — per-vineyard dedup state unchanged underneath. Recipients:
`prisma.member.findMany({organizationId})` ∩ `user.banned != true` (reminder-sweep pattern, user
chose all-members), `emitNotificationTx` per recipient with `category: "SYSTEM"`,
`kind: "WEATHER_ALERT"`, title/snippet from `alertMessage()` (risk-framed, tested), no actor
(system emit). De-escalation emits the "all clear" through the same claim-first path
(`clearedAt` claim — Council C6). State write and notification write share the tx — atomic.
**Tests:** pure: recipient-set derivation (banned excluded), payload shape, state-transition
table incl. race (two concurrent claims → one winner), digest grouping shape. The tx loop is
covered by Unit 17's verify extension (add an alert fixture day).
**Depends on:** Units 18, 19, 20
**Patterns to follow:** `reminder-sweep.ts:28-34`; `lifecycle.ts:242-248` emit shape;
`notifications.ts` `evt:` log.
**Verification:** `verify:weather` alert leg (fixture forecast with a 3-day frost ramp → exactly
one notification per member per tier, second run emits nothing, escalated run emits once);
inbox row visible in Demo browser QA.

### Unit 22: NWS active-alerts banner

**Goal:** Official alerts render verbatim above the strip, visually distinct from our badges.
**Files:** new `src/lib/weather/providers/nws-alerts.ts`, `forecast-ingest-core.ts` or the read
path (fetch at forecast-refresh time, store in forecast provenance or a small config JSON —
NOT a new table), `ForecastStrip.tsx` (banner slot), `test/weather-forecast-nws.test.ts` (extend).
**Approach:** `GET /alerts/active?point={lat},{lon}` (US coverage only). Render `headline`
verbatim + link to the product page; **never paraphrase or re-threshold**; `ends ?? expires`
for the validity window (live-verified nullable `ends`). **Council C4:** fetched alongside the
6-hourly refresh and PERSISTED to `VineyardWeatherConfig.activeAlertsJson` (+`activeAlertsFetchedAt`,
Unit 19 migration) — that's what renders between refreshes. **Multiple simultaneous alerts
(Codex DQ2): render ALL, ordered severity-desc, each verbatim.** Distinct visual treatment
(official-source framing) vs computed badges; **no suppression in either direction (Gemini DQ3
adjudicated)** — the badge legend carries one microcopy line ("Cellarhand computed — official
advisories shown above when issued") so a 37 °F NWS Frost Advisory beside a silent computed badge
reads as two labeled instruments, not a bug.
**Tests:** normalizer fixture (headline/severity/ends-null fallback); empty-features case.
**Depends on:** Units 12, 16
**Patterns to follow:** fetch-util + allowlist (host already added in U4).
**Verification:** fixture tests; visual check via a fixture-injected story in Demo QA.

### Unit 23: Warning badges on the strip

**Goal:** The strip's badge slot shows the computed tier per day.
**Files:** `ForecastStrip.tsx`, `forecast-read-core.ts` (badge derivation via Unit 20 on the
displayed primary series).
**Approach:** Badge per card from the tier classification (watch amber, warning/freeze danger
tokens; heat likewise). Out-of-window frost badges render with the dormant-season modifier
styling. Badges derive from the SAME pure core as notifications — one truth.
**Tests:** badge derivation cases in the read core.
**Depends on:** Units 16, 20
**Patterns to follow:** DESIGN.md `--warning`/`--danger` tokens.
**Verification:** browser QA: a fixture frost day shows the badge; lint green.

### Unit 24: Observability + retry

**Goal:** A silently failing forecast is impossible; transient 503s don't blank the strip.
**Files:** `src/lib/weather/providers/fetch-util.ts` (opt-in retry wrapper),
`forecast-ingest-core.ts`, `forecast-poll/route.ts`, `test/weather-fetch-retry.test.ts`.
**Approach:** Structured `evt:` JSON lines (the `inbox.emit` idiom — repo has no logger module,
don't invent one): `weather.forecast.attempt|success|failure` with provider/tenant/vineyard ids
+ duration; unmapped-condition logging already lands in U14. Retry: opt-in
`{retries: 2, backoffMs: 1000, jitter}` on the FORECAST fetch path only (observation ingest
unchanged), honoring NWS's ~5 s retry guidance on 429/503. Cron top-level catch calls
`Sentry.captureException` before returning 500 (route errors are auto-captured via
`onRequestError` — the manual call covers swallowed per-vineyard errors surfaced only in the
summary). `weather_provider_usage.lastError` keeps recording as today.
**Tests:** retry sequencing (fail-fail-succeed), no-retry-on-4xx (except 429), backoff bounds;
log-line shape.
**Depends on:** Unit 15
**Patterns to follow:** `notifications.ts:52-62` log shape; `fetch-util.ts` structure.
**Verification:** retry tests green; a forced-failure fixture run shows the evt lines + summary.

### Unit 25: Assistant coverage + ai-native reconciliation

**Goal:** The assistant answers forecast questions; `verify:ai-native` is green for every new core.
**Files:** `src/lib/assistant/tools/query-climate.ts` (forecast branch — "will it frost this
week?", "what's the 7-day outlook?", "any weather warnings?"), `test/evals/` (new goldens),
`scripts/ai-native-allowlist.mjs` + `test/verify-ai-native.test.ts` (the hardcoded mirror —
BOTH, the P8 lesson).
**Approach:** Extend `query_climate` (not a new tool — forecast is the same domain composite)
to read `vineyard_forecast_daily` + alert tiers; answers carry `issuedAt` freshness and the R11
no-fabrication stance (no rows → "no forecast yet", never inferred weather). Site-local dates via
Unit 2. Allowlist: `site-time-core`, `units-core`, `condition-core`, `rainfall-range-core`,
`forecast-ingest-core`, `alert-emit` classified (tool-reachable vs INTERNAL) in the script AND
its test mirror.
**Tests:** goldens — frost-this-week (selection + tier-correct phrasing), outlook, no-forecast
honesty; `verify:ai-native` green.
**Depends on:** Units 15, 20 (data + tiers)
**Patterns to follow:** `query-climate.ts` existing branches + golden cases at
`test/evals/assistant-read-tools.golden.ts:166-187`.
**Verification:** `npm run verify:ai-native`; golden evals pass.

## Test Strategy

**Unit tests:** every new pure core gets a `test/weather-*.test.ts` following the existing heavy-
core/thin-component culture (audit §12): `weather-site-time`, `weather-units`,
`weather-rainfall-range`, `weather-forecast-registry`, `weather-forecast-nws` (day/night pairing,
afternoon edge, QPF midnight-straddle, non-PT6H buckets), `weather-forecast-open-meteo`,
`weather-condition` (all 28 WMO codes), `weather-forecast-ingest`, `weather-forecast-alert`
(tiers/sustained/escalation), `weather-alert-emit`, `weather-fetch-retry`.

**Regression gates (hard):** `weather-climate-math.test.ts` and `weather-normals.test.ts` pass
**unmodified** after Unit 6. `weather-contract.test.ts` (never-blend) extended to forecast rows,
existing assertions untouched.

**Integration:** `scripts/verify-weather.ts` extended with fixture forecast providers (Unit 17)
+ the alert-emit leg (Unit 21). `verify:tenant-isolation` +2 tables. `verify:ai-native` green
each phase (allowlist + mirror updated in the same PR that adds a core — else CI fails the phase).

**Manual verification:** browser QA on Demo Winery per the repo's QA rules (in-app pane, user
logs in, `get_page_text`/`read_page` over screenshots, `QA-*` fixtures cleaned up): rainfall
range control + January window; forecast strip for real Bhutan vineyards (Open-Meteo, UTC+6,
elevation-corrected) and a US fixture; alert badge + inbox row. DB proof via `runAsTenant` reads
from the MAIN checkout (worktrees have no `.env`).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Postgres enum migration breaks on the live DB if referenced in the same deploy | MED | HIGH | Unit 18 is an ISOLATED `ALTER TYPE` migration, committed/applied before any referencing code (SEMIMONTHLY rule) |
| Year-round ingest silently changes climate math | LOW | HIGH | Unit 6 regression gate: the two math test files must pass byte-unmodified; season filters in math cores untouched |
| NWS QPF parsing wrong at local midnight / odd buckets | MED | MED | Duration-parsed (never assume PT6H), pro-rata midnight split, dedicated fixtures incl. the live-observed PT1H case |
| Notification fatigue (all-members, 6-hourly cron) | MED | MED | Escalation-only dedup persisted in `vineyard_weather_alert_state`; 72 h horizon; dormant-window suppression; revisit recipients if it annoys |
| `units=si` regresses (lightly documented) | LOW | LOW | Adapter checks `temperatureUnit` and converts defensively |
| Migration timestamp collision with parallel lanes on the shared prod DB | MED | MED | Check `migrate status` for DB-only entries before naming each migration (P8 lesson) |
| Worktree Prisma client staleness vs parallel merges | HIGH | LOW | `npx prisma generate` before any tsc/verify/dev run (standing rule) |
| Open-Meteo free-tier limits | LOW | LOW | ~52 calls/day vs 10k/day + 300k/mo; usage metered in `weather_provider_usage`; attribution rendered |
| `verify:ai-native` fails mid-phase on new cores | HIGH | LOW | Allowlist + `test/verify-ai-native.test.ts` mirror updated in the SAME PR as each new core |
| Forecast blank-strip failures invisible | MED | MED | Phase 4 evt logging + retry + Sentry capture; stale-renders-with-issuedAt instead of spinner |

## Success Criteria

- [ ] Exactly one "today" definition in the weather tree — site-local, used by card, actions,
      sweep, and assistant (grep-provable)
- [ ] Forecast strip renders for a Bhutan vineyard (Open-Meteo, UTC+6, elevation-corrected) and a
      US fixture (NWS) with no provider branching above the data layer
- [ ] NWS afternoon-fetch edge: day-1 card shows low + honest missing high (no zero, no drop)
- [ ] NWS QPF summed into vineyard-local days, duration-parsed, midnight-straddle test passes
- [ ] `User-Agent` on every outbound weather request; NWS returns 200 (403 without — verified)
- [ ] Alaska/Hawaii coordinates resolve to NWS, not Open-Meteo; Thimphu 404 falls back cleanly
- [ ] Rainfall chart returns data for "last 30 days" in January (year-round ingest proven)
- [ ] GDD/Winkler/GST/frost/heat outputs unchanged — the two math test files pass UNMODIFIED
- [ ] Every displayed number routes through `units-core`; no inline conversion factors (grep)
- [ ] Frost notification: once per event per member, escalates once, silent on repeat cron runs,
      concurrent cron/on-view race produces exactly one send, "all clear" emitted when a WARNING+
      forecast improves (verify:weather fixture leg proves all five)
- [ ] Official NWS alerts verbatim, visually distinct from computed badges
- [ ] Forecast rows pruned daily; no unbounded growth
- [ ] Open-Meteo attribution link rendered; free-tier use documented (user-confirmed non-commercial)
- [ ] `verify:tenant-isolation` green with +2 tables; `verify:ai-native` green; `verify:weather`
      extended and green
- [ ] All five PRs individually revertible; each phase's CI (lint + tsc + full vitest) green
