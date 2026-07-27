# Weather & Climate — Current-State Inventory

> Read-only inventory of the Weather & Climate section as it exists on branch
> `claude/weather-climate-audit-a10b25` (worktree of `main`). Every claim is cited as
> `path:line`. Where the code could not answer a question it is marked
> `UNKNOWN — [what to inspect]`. Nothing was modified. This is an inventory, not a review;
> it contains no recommendations.

Internal shorthand seen throughout the code: this feature is "VI-P8" / "Vineyard
Intelligence, Release 4A weather/climate." "R1…R15" and "Codex#n" are council-review rule
numbers referenced in comments.

---

## 1. Overview

The section renders **one climate estimate per vineyard**, derived from stored daily weather
rows pulled from public weather APIs. It is **entirely retrospective/current-season**: growing
degree days (GDD), Winkler region, growing-season temperature, frost-window event counts, heat-day
counts, and a seasonal rainfall total. There is **no forecast** anywhere in the code (§9b).

| Item | Value | Citation |
|---|---|---|
| User-facing route | `/vineyards/weather` | [page.tsx:11](src/app/(app)/vineyards/weather/page.tsx#L11), [AppShell.tsx:45](src/components/AppShell.tsx#L45) |
| Nav label | "Weather & climate", under the **Vineyards** nav group | [AppShell.tsx:40-46](src/components/AppShell.tsx#L40-L46) |
| Query param | `?vineyard=<id>` selects which vineyard | [page.tsx:11-22](src/app/(app)/vineyards/weather/page.tsx#L11-L22) |
| Auth gate | `requireReadyUser()` + `requireActiveTenant()` | [page.tsx:12-13](src/app/(app)/vineyards/weather/page.tsx#L12-L13) |
| Visibility | Tenant-admin-like users see **all active vineyards**; other users see only their `user.vineyardIds`; none → "No vineyards you can access." | [page.tsx:16-33](src/app/(app)/vineyards/weather/page.tsx#L16-L33) |
| Assistant surface | `query_climate` tool (natural-language Q&A over the same stored data) | [query-climate.ts:19](src/lib/assistant/tools/query-climate.ts#L19), registered [registry.ts:150](src/lib/assistant/registry.ts#L150) |
| Background job | `/api/cron/weather-poll` daily sweep | [route.ts](src/app/api/cron/weather-poll/route.ts), scheduled [vercel.json:50-53](vercel.json#L50-L53) |

The page is a **server component** that loads a pre-composed summary from the DB, then hands it
to a client `WeatherCard`. On first view for a vineyard with no data, the card **auto-fetches**
the current season and then **auto-backfills** 20 years of history — no button click required
([WeatherCard.tsx:61-88](src/app/(app)/vineyards/weather/WeatherCard.tsx#L61-L88)).

---

## 2. File inventory

All files last modified `2026-07-26` (git `%cs`); the section landed across PRs #500, #504–#511
(§13). LOC = `wc -l`.

### Application code

| path | role | LOC |
|---|---|---|
| [src/app/(app)/vineyards/weather/page.tsx](src/app/(app)/vineyards/weather/page.tsx) | Server route; loads summary, resolves vineyard list + auth | 39 |
| [src/app/(app)/vineyards/weather/WeatherCard.tsx](src/app/(app)/vineyards/weather/WeatherCard.tsx) | Client card: headline, panels, source selector, disclosures, auto-fetch | 374 |
| [src/app/(app)/vineyards/weather/GddChart.tsx](src/app/(app)/vineyards/weather/GddChart.tsx) | Pure-SVG cumulative-GDD chart (crosshair, zoom, pan) | 224 |
| [src/app/(app)/vineyards/weather/StationMap.tsx](src/app/(app)/vineyards/weather/StationMap.tsx) | Leaflet station-picker map | 79 |
| [src/app/(app)/vineyards/weather/StationMap.client.tsx](src/app/(app)/vineyards/weather/StationMap.client.tsx) | `next/dynamic({ssr:false})` wrapper for the map | 11 |
| [src/app/api/cron/weather-poll/route.ts](src/app/api/cron/weather-poll/route.ts) | Cron endpoint; bearer-auth gate → `runWeatherSweep()` | 30 |
| [src/lib/weather/actions.ts](src/lib/weather/actions.ts) | `"use server"` entry points (refresh, backfill, station pick, source override, summary load) | 236 |
| [src/lib/weather/read-core.ts](src/lib/weather/read-core.ts) | Pure `composeClimateSummaryCore` — builds the whole DTO from stored rows | 246 |
| [src/lib/weather/ingest-core.ts](src/lib/weather/ingest-core.ts) | Fetch→normalize→obs-time-map→bulk-upsert; writes daily rows + 1:1 config | 203 |
| [src/lib/weather/sweep.ts](src/lib/weather/sweep.ts) | Daily sweep: prime new vineyards, refresh opted-in ones, detect alerts | 98 |
| [src/lib/weather/backfill-core.ts](src/lib/weather/backfill-core.ts) | Multi-year historical backfill (gridMET in US, NASA POWER elsewhere) | 76 |
| [src/lib/weather/source-selection-core.ts](src/lib/weather/source-selection-core.ts) | `effectivePrimary`, `selectPrimaryCore`, `gapFillCore`, `computeSpreadCore` | 117 |
| [src/lib/weather/normals-core.ts](src/lib/weather/normals-core.ts) | Per-year GDD, Winkler normals, cumulative + comparison curves | 188 |
| [src/lib/weather/season-core.ts](src/lib/weather/season-core.ts) | Hemisphere-aware season window / SeasonYear / completeness | 74 |
| [src/lib/weather/obs-time-core.ts](src/lib/weather/obs-time-core.ts) | Observation-time → local-civil-day mapping | 79 |
| [src/lib/weather/gdd-core.ts](src/lib/weather/gdd-core.ts) | Daily + accumulated GDD | 39 |
| [src/lib/weather/winkler-core.ts](src/lib/weather/winkler-core.ts) | Winkler region I–V classification | 39 |
| [src/lib/weather/gst-core.ts](src/lib/weather/gst-core.ts) | Growing-season temperature (Jones) | 38 |
| [src/lib/weather/frost-core.ts](src/lib/weather/frost-core.ts) | Vulnerable-window frost events | 80 |
| [src/lib/weather/heat-core.ts](src/lib/weather/heat-core.ts) | Heat-day counts over thresholds | 25 |
| [src/lib/weather/rainfall-core.ts](src/lib/weather/rainfall-core.ts) | Rainfall total + dry/wet spells | 46 |
| [src/lib/weather/alert-core.ts](src/lib/weather/alert-core.ts) | Pure frost/heat crossing detection + message copy | 50 |
| [src/lib/weather/card-core.ts](src/lib/weather/card-core.ts) | Presentation helpers (sparkline, trust/coverage/provider labels) | 65 |
| [src/lib/weather/location.ts](src/lib/weather/location.ts) | `resolveVineyardCentroid` (planting-area → block → GPS pin) | 69 |
| [src/lib/weather/config.ts](src/lib/weather/config.ts) | Env gates + SSRF host allowlist + caps | 34 |
| [src/lib/weather/usage-core.ts](src/lib/weather/usage-core.ts) | Per-tenant/day/provider request counter + CDO cap check | 53 |
| [src/lib/weather/providers/types.ts](src/lib/weather/providers/types.ts) | `ClimateProvider` contract, record shapes, `ProviderFetchError` | 90 |
| [src/lib/weather/providers/registry.ts](src/lib/weather/providers/registry.ts) | Provider registry + `providersForLocation` / `coverageStateFor` | 43 |
| [src/lib/weather/providers/fetch-util.ts](src/lib/weather/providers/fetch-util.ts) | SSRF-guarded fetch edge (timeout, size cap, no redirects) | 57 |
| [src/lib/weather/providers/gridmet.ts](src/lib/weather/providers/gridmet.ts) | gridMET adapter (via RCC-ACIS GridData grid 21) | 81 |
| [src/lib/weather/providers/rcc-acis.ts](src/lib/weather/providers/rcc-acis.ts) | RCC-ACIS station adapter + station search | 138 |
| [src/lib/weather/providers/nasa-power.ts](src/lib/weather/providers/nasa-power.ts) | NASA POWER adapter (global fallback) | 63 |
| [src/lib/weather/providers/daymet.ts](src/lib/weather/providers/daymet.ts) | Daymet adapter (history only) | 98 |
| [src/lib/weather/providers/noaa-cdo.ts](src/lib/weather/providers/noaa-cdo.ts) | NOAA CDO adapter (token-gated, history/normals) | 59 |
| [src/lib/weather/providers/usgs-epqs.ts](src/lib/weather/providers/usgs-epqs.ts) | USGS EPQS point-elevation (not a daily series) | 31 |
| [src/lib/assistant/tools/query-climate.ts](src/lib/assistant/tools/query-climate.ts) | Assistant read tool over stored climate data | 123 |

### Schema / migrations / verify

| path | role | LOC |
|---|---|---|
| [prisma/schema.prisma:877-944](prisma/schema.prisma#L877-L944) | `VineyardClimateDaily`, `VineyardWeatherConfig`, `WeatherProviderUsage` models | — |
| [prisma/schema.prisma:440](prisma/schema.prisma#L440) | `Vineyard.weatherAutoRefresh` flag | — |
| [prisma/migrations/20260725150000_weather_schema/migration.sql](prisma/migrations/20260725150000_weather_schema/migration.sql) | 3 tables + RLS + flag column | 118 |
| [prisma/migrations/20260725160000_weather_station_override/migration.sql](prisma/migrations/20260725160000_weather_station_override/migration.sql) | `stationOverrideId` column | 4 |
| [scripts/verify-weather.ts](scripts/verify-weather.ts) | E2E ingest/read proof on Demo tenant w/ fixtures | 130 |

### Tests (§12)

`test/weather-alert.test.ts` (28), `weather-card-core.test.ts` (30), `weather-climate-math.test.ts`
(121), `weather-contract.test.ts` (71), `weather-normals.test.ts` (50), `weather-obs-time.test.ts`
(49), `weather-providers.test.ts` (123), `weather-source-selection.test.ts` (69). Golden assistant
cases in [test/evals/assistant-read-tools.golden.ts:166-187](test/evals/assistant-read-tools.golden.ts#L166-L187).

---

## 3. External data sources

Six providers are defined. Five carry daily weather; one (USGS EPQS) is elevation-only. Provider
identity keys: `gridmet | daymet | nasa_power | rcc_acis | noaa_cdo | usgs_epqs`
([types.ts:20-26](src/lib/weather/providers/types.ts#L20-L26)).

### 3.1 Endpoints, params, auth, headers

| Provider | Endpoint (method) | Query/body params | Auth | Coverage rule |
|---|---|---|---|---|
| **gridmet** | `https://data.rcc-acis.org/GridData` (POST JSON) | `{loc:"lon,lat", grid:"21", sdate, edate, elems:[maxt°C, mint°C, pcpn mm]}` | keyless | CONUS bbox 24–50N, −125…−66 → `US_HIGH_RES` [gridmet.ts:43-54](src/lib/weather/providers/gridmet.ts#L43-L54) |
| **rcc_acis** | `https://data.rcc-acis.org/StnMeta` + `.../StnData` (POST JSON) | StnMeta: `{bbox, meta:[name,ll,sids,elev], elems:"maxt"}`; StnData: `{sid, sdate, edate, elems:[maxt,mint,pcpn]}` | keyless | same CONUS bbox → `US_HIGH_RES` [rcc-acis.ts:78-137](src/lib/weather/providers/rcc-acis.ts#L78-L137) |
| **nasa_power** | `https://power.larc.nasa.gov/api/temporal/daily/point` (GET) | `parameters=T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG&latitude&longitude&start&end&format=JSON` | keyless | `GLOBAL_COARSE` everywhere [nasa-power.ts:45-49](src/lib/weather/providers/nasa-power.ts#L45-L49) |
| **daymet** | `https://daymet.ornl.gov/single-pixel/api/data` (GET) | `lat&lon&vars=tmax,tmin,prcp&start&end` | keyless | 14–72N, −145…−52 → `US_HIGH_RES` [daymet.ts:78-82](src/lib/weather/providers/daymet.ts#L78-L82) |
| **noaa_cdo** | `https://www.ncdc.noaa.gov/cdo-web/api/v2/data` (GET) | `datasetid=GHCND&datatypeid=TMAX&TMIN&PRCP&units=metric&extent&startdate&enddate&limit=1000` | **token** header `token: NOAA_CDO_TOKEN` [noaa-cdo.ts:46](src/lib/weather/providers/noaa-cdo.ts#L46) | CONUS bbox **and** token set, else `UNAVAILABLE` [noaa-cdo.ts:39](src/lib/weather/providers/noaa-cdo.ts#L39) |
| **usgs_epqs** | `https://epqs.nationalmap.gov/v1/json` (GET) | `x=lon&y=lat&units=Meters&wkid=4326&includeDate=false` | keyless | elevation only, not in daily registry [usgs-epqs.ts:22](src/lib/weather/providers/usgs-epqs.ts#L22) |

**Credential storage / committed?** Only NOAA CDO needs a key. It is read from
`process.env.NOAA_CDO_TOKEN` at [config.ts:6](src/lib/weather/config.ts#L6), defaults to `""`.
It is **not** present in `.env.example` (grep found no `NOAA_CDO`/`CDO_TOKEN` entry). No credential
is committed. `CRON_SECRET` (for the cron endpoint) **is** in `.env.example`
([.env.example:59-60](.env.example#L60)).

**Request headers actually sent:** For JSON POSTs, only `Content-Type: application/json`
([fetch-util.ts:46-51](src/lib/weather/providers/fetch-util.ts#L46-L51)). For NOAA CDO, a `token`
header ([noaa-cdo.ts:46](src/lib/weather/providers/noaa-cdo.ts#L46)). **No `User-Agent` header is
set on any request** — `fetch-util.ts` passes only the caller's `init` plus an abort signal and
`redirect:"manual"` ([fetch-util.ts:16-27](src/lib/weather/providers/fetch-util.ts#L16-L27)); no
adapter adds `User-Agent`. (Note: RCC-ACIS and USGS have historically requested a UA / rejected
some UA-less clients — not enforced or set here.)

### 3.2 Provider selection logic (quoted)

Selection is **hardcoded by lat/lon coverage tier**, not env or per-site config. `providersForLocation`
returns covering providers, best tier first, and — crucially — **defaults to `role:"live"` providers
only**:

```ts
// registry.ts:27-35
export function providersForLocation(lat, lon, opts = {}) {
  return ALL_PROVIDERS.filter(
    (p) => p.coverageFor(lat, lon) !== "UNAVAILABLE" && (opts.includeHistory || p.role === "live"),
  ).sort((a, b) => TIER_RANK[a.coverageFor(lat, lon)] - TIER_RANK[b.coverageFor(lat, lon)]);
}
```

`ALL_PROVIDERS` order: `[gridmet, rcc_acis, noaa_cdo, daymet, nasa_power]`
([registry.ts:12-18](src/lib/weather/providers/registry.ts#L12-L18)). Roles: `gridmet`, `rcc_acis`,
`nasa_power` are `live`; `daymet`, `noaa_cdo` are `history`
([daymet.ts:74](src/lib/weather/providers/daymet.ts#L74), [noaa-cdo.ts:35](src/lib/weather/providers/noaa-cdo.ts#L35)).
So a normal in-season ingest (US) hits **gridmet + rcc_acis** (both live, US); a non-US site (e.g.
Bhutan) hits **nasa_power** only.

Among the succeeded providers, the **default primary** is chosen by `selectPrimaryCore`: prefer the
closest station within ~10 mi (`STATION_MAX_DISTANCE_M = 16093`), tie-break by elevation delta then
completeness; else the most-complete grid; sources with completeness 0 are demoted
([source-selection-core.ts:10,36-56](src/lib/weather/source-selection-core.ts#L36-L56)). A grower can
override the primary per-vineyard (`primaryProviderOverride`); `effectivePrimary = override ?? default`
([source-selection-core.ts:27-29](src/lib/weather/source-selection-core.ts#L27-L29)). Selectable
override set: `gridmet, rcc_acis, nasa_power, daymet, noaa_cdo`
([actions.ts:147](src/lib/weather/actions.ts#L147)).

### 3.3 Rate limiting, retry, backoff, timeout

- **Timeout:** every fetch is aborted after `FETCH_TIMEOUT_MS = 30_000` ms
  ([config.ts:34](src/lib/weather/config.ts#L34), [fetch-util.ts:18-27](src/lib/weather/providers/fetch-util.ts#L18-L27)).
- **Retry / backoff:** **none.** No adapter or `fetch-util` retries; a failure throws
  `ProviderFetchError` and that provider simply contributes no rows
  ([ingest-core.ts:83-97](src/lib/weather/ingest-core.ts#L83-L97)).
- **Size cap:** responses > `MAX_RESPONSE_BYTES = 8 MB` throw `oversized`
  ([config.ts:33](src/lib/weather/config.ts#L33), [fetch-util.ts:36-38](src/lib/weather/providers/fetch-util.ts#L36-L38)).
- **SSRF guard:** each request URL host must equal the provider's allowlisted host, and any 3xx
  redirect is refused ([config.ts:26-31](src/lib/weather/config.ts#L26-L31), [fetch-util.ts:28-31](src/lib/weather/providers/fetch-util.ts#L28-L31)).
- **Usage metering:** each provider attempt (success or fail) increments a per-tenant/day/provider
  counter ([ingest-core.ts:91,95](src/lib/weather/ingest-core.ts#L91-L95), [usage-core.ts:21-38](src/lib/weather/usage-core.ts#L21-L38)).
- **Declared caps:** `CDO_DAILY_CAP = 10_000`, `CDO_RATE_LIMIT_PER_SEC = 5`
  ([config.ts:22-23](src/lib/weather/config.ts#L22-L23)). **Claim vs behavior:** the headroom check
  `isProviderDailyExhausted` and `readWeatherUsage` have **no callers** anywhere in `src/`
  (grep) — the counter is written but never read to actually gate a fetch, so the CDO cap is
  recorded, not enforced ([usage-core.ts:43-53](src/lib/weather/usage-core.ts#L43-L53)).

### 3.4 Providers not obviously in use (dead / dark integrations)

- **noaa_cdo** — token-gated; with `NOAA_CDO_TOKEN` unset (default, and absent from `.env.example`)
  it always reports `UNAVAILABLE` and is filtered out. It is also `role:"history"`, so even with a
  token it is excluded from the default in-season ingest and from backfill (backfill uses only
  gridMET/NASA POWER, [backfill-core.ts:26](src/lib/weather/backfill-core.ts#L26)). Effectively
  dormant. UNKNOWN — whether `NOAA_CDO_TOKEN` is set in the deployed Vercel env (would need env access).
- **daymet** — `role:"history"`, excluded from the default ingest (`includeHistory` is never passed
  `true` by any caller — grep). Its adapter and leap-day logic are wired and tested but not reached
  by the live paths. UNKNOWN — confirm no caller passes `includeHistory:true` (none found).
- **usgs_epqs** — used, but only for site elevation, not weather ([ingest-core.ts:79](src/lib/weather/ingest-core.ts#L79)).

---

## 4. Data flow (one page load, end to end)

**Fetching is server-side + background-job.** The page render reads only the DB; a *refresh*
(button or first-view auto-fetch) is a server action that calls providers.

1. **Request** → `GET /vineyards/weather?vineyard=<id>` hits the server component
   [page.tsx:11](src/app/(app)/vineyards/weather/page.tsx#L11).
2. **Auth + vineyard list** → `requireReadyUser` + `requireActiveTenant`; vineyard list scoped by
   admin-vs-membership [page.tsx:12-20](src/app/(app)/vineyards/weather/page.tsx#L12-L20).
3. **Load summary (no live fetch)** → `loadVineyardClimateSummary(vineyardId)`
   [actions.ts:110-144](src/lib/weather/actions.ts#L110-L144):
   - resolve centroid (`resolveVineyardCentroid`, [location.ts:45-69](src/lib/weather/location.ts#L45-L69));
   - read `vineyard_weather_config` (1:1) and **all** `vineyard_climate_daily` rows for the vineyard;
   - coerce Prisma `Decimal` → `number|null` ([actions.ts:107,121-129](src/lib/weather/actions.ts#L107-L129));
   - **`composeClimateSummaryCore`** — the single transform that produces the entire DTO
     ([read-core.ts:105-246](src/lib/weather/read-core.ts#L105-L246)): group rows by provider →
     per-source season GDD + completeness → headline aggregates from the primary series
     (GDD/Winkler/GST/frost/heat/rainfall/prior-year/cumulative) → read-time gap-filled series →
     long-term normals + graph curves from gridMET history → spread across sources.
4. **Render** → `WeatherCard` (client) receives the summary and renders headline + panels
   ([page.tsx:35](src/app/(app)/vineyards/weather/page.tsx#L35), [WeatherCard.tsx:38-46](src/app/(app)/vineyards/weather/WeatherCard.tsx#L38-L46)).
5. **First-view auto-fetch** → if `summary == null`, the card calls
   `refreshVineyardWeatherCurrentSeason` then `router.refresh()`; if a summary exists but has no
   history, it calls `backfillVineyardWeatherHistory(id, 20)`
   ([WeatherCard.tsx:61-88](src/app/(app)/vineyards/weather/WeatherCard.tsx#L61-L88)).

**The write path** (server action or cron): `ingestVineyardWeatherCore`
([ingest-core.ts:71-203](src/lib/weather/ingest-core.ts#L71-L203)):
fetch elevation + every covering provider **outside any tx** → `mapSeriesToLocalDaily` (obs-time) →
`selectPrimaryCore` → build one `Prisma.sql` VALUES tuple per non-empty local day → **one tx**:
bulk `INSERT … ON CONFLICT (tenantId,vineyardId,localDate,providerKey) DO UPDATE` in 1,000-row
batches + upsert the 1:1 config. Rows are stored **per single provider**; gap-fill/spread are never
stored, only computed on read ([ingest-core.ts:126-192](src/lib/weather/ingest-core.ts#L126-L192)).

**Transformation layers the data passes through:** provider adapter normalizer (→ `DailyRecord`,
source day, °C/mm) → `obs-time-core` (`mapRecordsToLocalDaily`, → `LocalDailyRecord` on vineyard-local
day) → bulk-upsert to `vineyard_climate_daily` → read-side `Decimal→number` coercion → `DailyRow` →
`composeClimateSummaryCore` (→ `ClimateSummary`) → React render (+ °C→°F for display).

---

## 5. Data model

### 5.1 Types / interfaces

| Type | Where | Meaning |
|---|---|---|
| `DailyRecord` | [types.ts:33-40](src/lib/weather/providers/types.ts#L33-L40) | one provider-native day: `sourceDate`, `tmaxC/tminC/precipMm/rhMaxPct/rhMinPct` (all `number|null`) |
| `ProviderSeries` | [types.ts:43-56](src/lib/weather/providers/types.ts#L43-L56) | records + `providerKey/kind/obsConvention/resolutionM/attribution/sourceUrl` + station meta |
| `LocalDailyRecord` | [obs-time-core.ts:14-21](src/lib/weather/obs-time-core.ts#L14-L21) | day re-keyed to `localDate` (vineyard-local civil day) |
| `DailyRow` | [read-core.ts:20-28](src/lib/weather/read-core.ts#L20-L28) | stored row (Decimals coerced), read-side |
| `ClimateSummary` | [read-core.ts:48-96](src/lib/weather/read-core.ts#L48-L96) | the full render DTO (headline, normals, spread, perSource, honesty) |
| `ProviderKey` / `ObsConvention` / `CoverageState` | [types.ts:11-26](src/lib/weather/providers/types.ts#L11-L26) | string unions |

### 5.2 Units — where stored, where converted

**Storage is metric throughout**: temps **°C**, precip **mm**, RH **%**
([types.ts:31-32](src/lib/weather/providers/types.ts#L31), schema `tmaxC/tminC` `Decimal(6,3)`,
`precipMm Decimal(8,3)`, `rhMaxPct/rhMinPct Decimal(6,3)`
[schema.prisma:883-887](prisma/schema.prisma#L883-L887)). Providers request metric units so no
inbound conversion is needed except:

- **NOAA CDO** GHCND arrives in tenths — divided by 10 in the normalizer (`value/10`)
  ([noaa-cdo.ts:25-27](src/lib/weather/providers/noaa-cdo.ts#L25-L27)).
- **RCC-ACIS `elev`** is feet → meters (`× 0.3048`) ([rcc-acis.ts:40,66](src/lib/weather/providers/rcc-acis.ts#L40)).

**GDD is computed in °C-days** (base 10 °C) everywhere in the math layer
([gdd-core.ts:14-20](src/lib/weather/gdd-core.ts#L14-L20), [winkler-core.ts](src/lib/weather/winkler-core.ts)).
**°C→°F conversion happens only at the display edge**, via `C_TO_F_GDD = 1.8`:

- normals-core computes both `gddC` and `gddF` for display ([normals-core.ts:12,51-52](src/lib/weather/normals-core.ts#L12-L52));
- the card's headline converts with `gddF = round(gddC × 1.8)` ([WeatherCard.tsx:16,195](src/app/(app)/vineyards/weather/WeatherCard.tsx#L16));
- the chart shows °F left axis, °C right axis via `/1.8` ([GddChart.tsx:172,181-182,207](src/app/(app)/vineyards/weather/GddChart.tsx#L172));
- the assistant tool converts with a **hardcoded `1.8`** at [query-climate.ts:111](src/lib/assistant/tools/query-climate.ts#L111) (not the `C_TO_F_GDD` constant).

**Distances**: haversine in meters ([ingest-core.ts:52-59](src/lib/weather/ingest-core.ts#L52-L59)),
displayed as km (`/1000` or `/100/10`). Temps in the panels are shown in **°C** (frost `≤0/≤−2 °C`,
heat `≥35 °C`) ([WeatherCard.tsx:247,252](src/app/(app)/vineyards/weather/WeatherCard.tsx#L247-L252));
GDD headline in **°F** ([WeatherCard.tsx:193-196](src/app/(app)/vineyards/weather/WeatherCard.tsx#L193-L196)).
Consistency: storage is uniformly metric; the display layer converts GDD to °F ad hoc at four call
sites (one using a literal `1.8`, three using `C_TO_F_GDD`).

### 5.3 Database tables

Three tenant-scoped, RLS-isolated tables (migration `20260725150000_weather_schema`):

**`vineyard_climate_daily`** — authoritative per-provider daily series
([schema.prisma:877-898](prisma/schema.prisma#L877-L898), [migration.sql:11-39](prisma/migrations/20260725150000_weather_schema/migration.sql#L11-L39)):
- cols: `tenantId, id, vineyardId, providerKey, localDate(date), tmaxC, tminC, precipMm, rhMaxPct, rhMinPct, dataStatus('PROVISIONAL'|'FINAL'), provenance(jsonb), createdAt, updatedAt`
- unique `(tenantId, vineyardId, localDate, providerKey)` (the upsert identity) + `(tenantId, id)`;
  indexes on `(tenantId)` and `(tenantId, vineyardId, localDate)` (the read path)
- CHECKs: `tminC ≤ tmaxC`, RH 0–100, `precipMm ≥ 0` ([migration.sql:36-39](prisma/migrations/20260725150000_weather_schema/migration.sql#L36-L39))
- FK `(tenantId, vineyardId) → vineyard(tenantId, id)` ON DELETE CASCADE

**`vineyard_weather_config`** — exactly one row per vineyard (1:1)
([schema.prisma:906-928](prisma/schema.prisma#L906-L928)):
- `primaryProviderKey, primaryProviderOverride, stationOverrideId, stationId, stationName,
  stationDistanceM, stationElevationDeltaM, siteElevationM, coverageState, attribution, lastRefreshAt`
- unique `(tenantId, vineyardId)` — the structural "one config" invariant

**`weather_provider_usage`** — per-tenant/day/provider counter
([schema.prisma:933-944](prisma/schema.prisma#L933-L944)): PK `(tenantId, dayKey, provider)`,
`requestCount, lastError`.

**`dataStatus`** = `PROVISIONAL` for days within `PROVISIONAL_WINDOW_DAYS = 10` of now, else `FINAL`
([ingest-core.ts:23,132](src/lib/weather/ingest-core.ts#L23)); backfilled history is written `FINAL`
([backfill-core.ts:55](src/lib/weather/backfill-core.ts#L55)).

**Retention policy:** none — no TTL, no pruning job (grep found no delete-by-age anywhere). Rows are
only deleted on a station change (season-scoped, [actions.ts:94](src/lib/weather/actions.ts#L94)) or
QA cleanup ([verify-weather.ts](scripts/verify-weather.ts)).

**Row counts:** UNKNOWN — the app DB is production (per project notes the worktree has no `.env`);
would need a `runAsTenant` `count()` against the live DB to answer.

---

## 6. Caching and persistence

- **Persistence** = the three Postgres tables above. The card renders **offline from stored rows**;
  a page load performs no provider fetch ([actions.ts:109-110](src/lib/weather/actions.ts#L109-L110),
  [WeatherCard.tsx:3-5](src/app/(app)/vineyards/weather/WeatherCard.tsx#L3-L5)).
- **HTTP / CDN caching:** the cron route is `dynamic = "force-dynamic"`
  ([route.ts:9](src/app/api/cron/weather-poll/route.ts#L9)). Server actions use Next `revalidatePath("/vineyards/weather")`
  after every write ([actions.ts:99,176,206,230](src/lib/weather/actions.ts#L99)). No `Cache-Control`
  headers, no Redis, no service worker, no client store (grep: none in the weather tree).
- **In-memory cache:** none. `composeClimateSummaryCore` recomputes on every render.
- **TTL / freshness model:** implicit only. Providers are re-fetched by the **daily sweep** for
  opted-in vineyards; the card shows `lastRefreshAt` ("Updated …")
  ([WeatherCard.tsx:171-173](src/app/(app)/vineyards/weather/WeatherCard.tsx#L171-L173)). No explicit
  staleness gate — a stale summary just renders whatever is stored.
- **Idempotency / invalidation:** ingest is an upsert on the natural key, so a re-run overwrites the
  same day in place ([ingest-core.ts:161-164](src/lib/weather/ingest-core.ts#L161-L164)); a station
  change first deletes that season's `rcc_acis` rows so the new station fully replaces the old
  ([actions.ts:91-98](src/lib/weather/actions.ts#L91-L98)).
- **Offline / provider failure:** if a provider throws, it contributes no rows and the failure is
  recorded in `IngestResult.providersFailed` + `weather_provider_usage.lastError`; **as long as one
  provider succeeds, others still land** ([ingest-core.ts:83-101](src/lib/weather/ingest-core.ts#L83-L101)).
  If **all** providers fail, ingest throws and nothing is written
  ([ingest-core.ts:98-101](src/lib/weather/ingest-core.ts#L98-L101)); the card surfaces the error string
  ([WeatherCard.tsx:74,176](src/app/(app)/vineyards/weather/WeatherCard.tsx#L74)). The assistant tool
  returns a "no weather set up" note when config/centroid is missing
  ([query-climate.ts:55-57](src/lib/assistant/tools/query-climate.ts#L55-L57)).

---

## 7. Timezone and date handling

**A "day" is defined as the vineyard-local civil day (`localDate`).** The pivotal transform is
`obs-time-core`:

- Providers stay tz-agnostic and return `sourceDate` (their own calendar day)
  ([types.ts:28-40](src/lib/weather/providers/types.ts#L28-L40)).
- At ingest, `mapRecordsToLocalDaily` maps `sourceDate → localDate` per `obsConvention`
  ([obs-time-core.ts:43-74](src/lib/weather/obs-time-core.ts#L43-L74)):
  - `AM_LST` (COOP/ACIS stations): the "met shift" — Tmax + prior-24h precip → **date−1**, Tmin → obs
    date ([obs-time-core.ts:55-61](src/lib/weather/obs-time-core.ts#L55-L61));
  - `MIDNIGHT_LOCAL` / `UTC` (grids): **pass through** — the source day is treated as the local civil
    day ([obs-time-core.ts:62-70](src/lib/weather/obs-time-core.ts#L62-L70)).

```ts
// obs-time-core.ts:36-39 (comment) — the known simplification:
// MIDNIGHT_LOCAL / UTC → the source day already IS the local civil day (screening-grade;
// sub-daily reconstruction for large UTC offsets is a documented Later item). Pass through 1:1.
```

- ISO day arithmetic is **UTC-anchored** to avoid DST drift in the day index
  ([obs-time-core.ts:24-28](src/lib/weather/obs-time-core.ts#L24-L28)); the season window and
  SeasonYear are computed purely from ISO strings ([season-core.ts:17-47](src/lib/weather/season-core.ts#L17-L47)).

**Inconsistency to flag — two different "today" definitions:**

1. The **card / server actions / sweep** compute "today" as **UTC**:
   `new Date().toISOString().slice(0,10)` ([actions.ts:74,142,221](src/lib/weather/actions.ts#L142),
   [sweep.ts:46](src/lib/weather/sweep.ts#L46)). This is the value passed to
   `composeClimateSummaryCore` for season-to-date completeness.
2. The **assistant tool** resolves "today" and "last night" in the **winery operating timezone**
   (`resolveOperatingTimeZone(wineryTz, ctx.timeZone)` → `zonedDateKey`)
   ([query-climate.ts:46-49](src/lib/assistant/tools/query-climate.ts#L46-L49)).

So the same vineyard's "season to date" / "was last night a frost" boundary is **UTC on the web card
but site-local in the assistant** — for a US-Pacific site near a UTC midnight this can differ by a
day. The provider `UTC` obs-convention pass-through ([obs-time-core.ts:62-70](src/lib/weather/obs-time-core.ts#L62-L70))
also means NASA POWER's UTC-bucketed days are stored as if they were local days regardless of the
vineyard's real offset (called out in-code as a "documented Later item").

`GddChart` labels day indices in **UTC** (`timeZone:"UTC"`, [GddChart.tsx:28-32](src/app/(app)/vineyards/weather/GddChart.tsx#L28-L32));
the "Updated …" timestamp uses **browser-local** `toLocaleString()`
([WeatherCard.tsx:172](src/app/(app)/vineyards/weather/WeatherCard.tsx#L172)).

---

## 8. UI inventory

### 8.1 Components

| Component | Displays | Key props | States handled |
|---|---|---|---|
| `WeatherPage` (server) | shell, title, vineyard existence | `searchParams` | empty ("No vineyards you can access") [page.tsx:32-36](src/app/(app)/vineyards/weather/page.tsx#L32-L36) |
| `WeatherCard` (client) | vineyard `<select>`, Refresh button, headline GDD, 4 panels, source selector, station map, compare-sources table | `vineyards, selectedId, summary` [WeatherCard.tsx:38-46](src/app/(app)/vineyards/weather/WeatherCard.tsx#L38-L46) | loading (`busy`, "Fetching…"), empty ("No weather… yet"), error banner, backfilling ("Loading history…"), no-history CTA, pending transitions [WeatherCard.tsx:48-56,176-211](src/app/(app)/vineyards/weather/WeatherCard.tsx#L48-L56) |
| `GddChart` (client) | accumulated-GDD lines: current vs coolest/hottest/long-term-avg/last year; crosshair readout; zoom/pan | `series: NamedCurve[]` [GddChart.tsx:46](src/app/(app)/vineyards/weather/GddChart.tsx#L46) | empty (`all.length===0 → null`) [GddChart.tsx:59](src/app/(app)/vineyards/weather/GddChart.tsx#L59); dragging vs hover [GddChart.tsx:50,187-198](src/app/(app)/vineyards/weather/GddChart.tsx#L50) |
| `StationMapClient` | `ssr:false` wrapper w/ "Loading map…" | — [StationMap.client.tsx:8-11](src/app/(app)/vineyards/weather/StationMap.client.tsx#L8-L11) | loading placeholder |
| `StationMap` | Leaflet map: vineyard centroid + nearby ACIS station dots; click to select | `center, stations, activeSid, onSelect, busy` [StationMap.tsx:15-27](src/app/(app)/vineyards/weather/StationMap.tsx#L15-L27) | busy (cursor wait, click disabled) [StationMap.tsx:70,78](src/app/(app)/vineyards/weather/StationMap.tsx#L70); "No stations found" handled by caller [WeatherCard.tsx:316-317](src/app/(app)/vineyards/weather/WeatherCard.tsx#L316-L317) |

Panels rendered in the card ([WeatherCard.tsx:214-256](src/app/(app)/vineyards/weather/WeatherCard.tsx#L214-L256)):
Winkler region (10/20-yr toggle), Growing-season temp (Jones), Frost vulnerable window (light/killing
counts), Heat & rain (days ≥35 °C + seasonal mm). A "Where this estimate comes from" panel
(source override selector, coverage, active station, map toggle, attribution
[WeatherCard.tsx:259-325](src/app/(app)/vineyards/weather/WeatherCard.tsx#L259-L325)) and a
"Compare sources / data trust" disclosure (spread + per-source GDD/completeness table
[WeatherCard.tsx:328-369](src/app/(app)/vineyards/weather/WeatherCard.tsx#L328-L369)).

### 8.2 Libraries / tokens

- **Charting library:** **none** — `GddChart` is hand-rolled inline SVG
  ([GddChart.tsx:1-9,159-196](src/app/(app)/vineyards/weather/GddChart.tsx#L1-L9)); the sparkline
  helper is also raw SVG ([card-core.ts:10-22](src/lib/weather/card-core.ts#L10-L22)). No Recharts/
  D3/Chart.js in `package.json` (grep found none).
- **Map library:** vanilla **Leaflet `^1.9.4`** (no react-leaflet); `@geoman-io/leaflet-geoman-free ^2.20.0`
  is present for other map surfaces but not used here ([package.json](package.json), [StationMap.tsx:9](src/app/(app)/vineyards/weather/StationMap.tsx#L9)).
  Basemap tiles: **Esri World Imagery** (`server.arcgisonline.com/.../World_Imagery`) keyless
  ([StationMap.tsx:12-13,36](src/app/(app)/vineyards/weather/StationMap.tsx#L12-L13)).
- **Date picker:** **none.** Date/vineyard selection is a native `<select>` for the vineyard
  ([WeatherCard.tsx:154-163](src/app/(app)/vineyards/weather/WeatherCard.tsx#L154-L163)) and a
  10/20-yr toggle ([WeatherCard.tsx:225-234](src/app/(app)/vineyards/weather/WeatherCard.tsx#L225-L234)).
  No calendar/date-range control; no date library (`date-fns`/`luxon`/`dayjs` — none in the weather
  tree, all date math is native `Date` + ISO strings).
- **Weather icon set / condition-code mapping:** **none.** No condition/weather-code field is fetched
  or stored (providers carry only tmax/tmin/precip/RH). No icon assets; state is conveyed by numbers +
  text. Map markers are plain colored `circleMarker`s ([StationMap.tsx:54-69](src/app/(app)/vineyards/weather/StationMap.tsx#L54-L69)).
- **Styling / design tokens:** inline styles referencing DESIGN.md CSS variables — `--font-display`,
  `--text-muted/secondary/primary`, `--surface-raised/muted`, `--border-default/subtle`,
  `--accent/--accent-on`, `--danger` ([WeatherCard.tsx:20-27,157,167](src/app/(app)/vineyards/weather/WeatherCard.tsx#L20-L27),
  [GddChart.tsx:145,170-171](src/app/(app)/vineyards/weather/GddChart.tsx#L145)). The chart's series
  colors are **hardcoded hex** (semantic: cool `#2b6cb0`, hot `#c0392b`, avg `#1f7a6b`, last `#dd8452`,
  current `#111111`) — a documented data-viz exception to tokens
  ([normals-core.ts:146-171](src/lib/weather/normals-core.ts#L146-L171)). Map marker colors are also
  hardcoded hex ([StationMap.tsx:54-66](src/app/(app)/vineyards/weather/StationMap.tsx#L54-L66)).

---

## 9. Current state of the two target features

### (a) Rainfall over time — **no time-series exists**

- There is **no rainfall chart**. Rainfall is surfaced as a **single scalar**: the season total in mm
  in the "Heat & rain" panel (`{h.rainfall.totalMm} mm rain`)
  ([WeatherCard.tsx:251-255](src/app/(app)/vineyards/weather/WeatherCard.tsx#L251-L255)), labeled
  "Regional Rainfall Estimate (≈4 km average, not your rain gauge)".
- `rainfall-core` **computes** more than is shown — `totalMm`, `wetDays`, `wettestDayMm`,
  `longestDryStreakDays`, `lowConfidence:true` — but only `totalMm` reaches the UI
  ([rainfall-core.ts:7-46](src/lib/weather/rainfall-core.ts#L7-L46), [read-core.ts:170,231](src/lib/weather/read-core.ts#L170)).
  No cumulative curve, no daily bars, no per-day precip series is rendered.
- **Underlying daily precip data exists** at daily granularity (`precipMm` per `localDate` per provider)
  and reaches back as far as history is backfilled: **20 years** by default via
  `backfillVineyardWeatherHistory(id, 20)` ([WeatherCard.tsx:81,94](src/app/(app)/vineyards/weather/WeatherCard.tsx#L81),
  [actions.ts:191-208](src/lib/weather/actions.ts#L191-L208)). **However**, backfill keeps only
  **growing-season months** (NH Apr–Oct, SH Oct–Apr) — non-season precip is discarded
  ([backfill-core.ts:35-37](src/lib/weather/backfill-core.ts#L35-L37)). Historical source: **gridMET
  (US)** else **NASA POWER (global)** ([backfill-core.ts:26](src/lib/weather/backfill-core.ts#L26)).
  So the raw data to build a rainfall-over-time chart is present (season-only, daily, ~20 yr) but no
  chart consumes it.

### (b) 7-day forecast — **does not exist**

- **No forecast of any kind.** grep for `forecast | 7-day | open-meteo | openweather` across the
  weather tree returns nothing. Every provider returns **historical/observed** daily data over a past
  `[startIso, endIso]` window ([types.ts:89](src/lib/weather/providers/types.ts#L89)); ingest windows
  run season-start → **today**, never into the future ([actions.ts:221-226](src/lib/weather/actions.ts#L221-L226)).
- No provider carries future/predicted fields, precip probability, or wind — the record shape is only
  `tmax/tmin/precip/rhMax/rhMin` ([types.ts:33-40](src/lib/weather/providers/types.ts#L33-L40)).
- **Frost / freeze / heat detection exists but is retrospective and not a "warning" UI:**
  - `alert-core.detectWeatherAlertsCore` flags a day as **FROST** when `tminC ≤ frostC` (default **0 °C**)
    and **HEAT** when `tmaxC ≥ heatC` (default **38 °C**) — over **already-observed** rows
    ([alert-core.ts:15-41](src/lib/weather/alert-core.ts#L15-L41)). Thresholds are function-default
    constants, not configurable, hardcoded in [alert-core.ts:29-30](src/lib/weather/alert-core.ts#L29-L30).
  - **Claim vs behavior:** the sweep calls `detectWeatherAlertsCore` on the last ~5 days but only
    **counts** the results (`summary.alerts += alerts.length`) — it **does not persist an alert or send
    any notification**. `alertMessage()` (the grower-facing copy) has **no callers** anywhere (grep).
    Comments in [alert-core.ts:1](src/lib/weather/alert-core.ts#L1) ("the sweep's thin inbox alert")
    and [sweep.ts:11](src/lib/weather/sweep.ts#L11) describe an inbox alert that the code does not emit
    ([sweep.ts:78-90](src/lib/weather/sweep.ts#L78-L90)).
  - The **frost card panel** shows counts of sub-0 nights **inside a vulnerable window** (NH Apr 1–Jun 15),
    split light (`≤0 °C`) vs killing (`≤−2 °C`), thresholds defaulted in
    [frost-core.ts:48-49,35-40](src/lib/weather/frost-core.ts#L35-L49) and rendered at
    [WeatherCard.tsx:244-250](src/app/(app)/vineyards/weather/WeatherCard.tsx#L244-L250). It is framed
    "elevated risk → check the vines… not a damage report," never a forward-looking warning.
  - Heat panel shows the count of days `≥ 35 °C` (thresholds `[30,35,38]` in
    [heat-core.ts:13](src/lib/weather/heat-core.ts#L13); only 35 is displayed
    [WeatherCard.tsx:252](src/app/(app)/vineyards/weather/WeatherCard.tsx#L252)).

---

## 10. Configuration

| Name | Type | Read at | Absent behavior |
|---|---|---|---|
| `NOAA_CDO_TOKEN` | env var | [config.ts:6-7](src/lib/weather/config.ts#L6-L7) | `""` → `isCdoConfigured()` false → NOAA CDO provider `UNAVAILABLE`/hidden ([noaa-cdo.ts:39,41](src/lib/weather/providers/noaa-cdo.ts#L39)). **Not in `.env.example`.** |
| `CRON_SECRET` | env var | [route.ts:12](src/app/api/cron/weather-poll/route.ts#L12) | unset → every cron request returns 401 (`authorized()` false) ([route.ts:12-16](src/app/api/cron/weather-poll/route.ts#L12-L16)). In `.env.example`. |
| `Vineyard.weatherAutoRefresh` | per-vineyard DB flag (default `false`) | [sweep.ts:45,69](src/lib/weather/sweep.ts#L45), [schema.prisma:440](prisma/schema.prisma#L440) | false → sweep won't auto-refresh that vineyard (but still primes it if empty). Flipped `true` after the first manual/auto refresh ([actions.ts:229](src/lib/weather/actions.ts#L229), [sweep.ts:61](src/lib/weather/sweep.ts#L61)). |
| `VineyardWeatherConfig.primaryProviderOverride` | per-vineyard DB | [read-core.ts:130-131](src/lib/weather/read-core.ts#L130), [source-selection-core.ts:27](src/lib/weather/source-selection-core.ts#L27) | null → auto-resolved primary. |
| `VineyardWeatherConfig.stationOverrideId` | per-vineyard DB | [actions.ts:42-45](src/lib/weather/actions.ts#L42-L45) | null → auto-nearest ACIS station. |

**Hardcoded defaults / constants** (all in code, no config surface):
`PROVISIONAL_WINDOW_DAYS=10` ([ingest-core.ts:23](src/lib/weather/ingest-core.ts#L23)),
`STATION_MAX_DISTANCE_M=16093` (~10 mi) ([source-selection-core.ts:10](src/lib/weather/source-selection-core.ts#L10)),
`PRIME_CAP_PER_RUN=30` ([sweep.ts:26](src/lib/weather/sweep.ts#L26)),
backfill default `years=20` ([actions.ts:192](src/lib/weather/actions.ts#L192), [sweep.ts:60](src/lib/weather/sweep.ts#L60)),
`FETCH_TIMEOUT_MS=30000`, `MAX_RESPONSE_BYTES=8MB`, `CDO_DAILY_CAP=10000`, `CDO_RATE_LIMIT_PER_SEC=5`
([config.ts:22-34](src/lib/weather/config.ts#L22-L34)),
GDD `baseC=10`, optional `capC` ([gdd-core.ts:14-19](src/lib/weather/gdd-core.ts#L14-L19)),
Winkler `boundaryBandC=50` ([winkler-core.ts:27](src/lib/weather/winkler-core.ts#L27)),
frost/heat thresholds ([frost-core.ts:48-49](src/lib/weather/frost-core.ts#L48-L49), [alert-core.ts:29-30](src/lib/weather/alert-core.ts#L29-L30), [heat-core.ts:13](src/lib/weather/heat-core.ts#L13)),
season windows Apr 1–Oct 31 (NH) / Oct 1–Apr 30 (SH) ([season-core.ts:28-34](src/lib/weather/season-core.ts#L28-L34)),
provider host allowlist ([config.ts:10-19](src/lib/weather/config.ts#L10-L19)).

No feature-flag system gates the section (no LaunchDarkly-style flag; the nav entry is unconditional,
[AppShell.tsx:45](src/components/AppShell.tsx#L45)).

**Cron schedule:** `40 15 * * *` (15:40 UTC daily) ([vercel.json:50-53](vercel.json#L50-L53)),
`maxDuration=300`s, `runtime="nodejs"` ([route.ts:7-8](src/app/api/cron/weather-poll/route.ts#L7-L8)).

---

## 11. Sites and locations model

"Sites" = **`Vineyard`** rows ([schema.prisma:431-460](prisma/schema.prisma#L431-L460)), tenant-scoped.
A vineyard has **no lat/lon/timezone column of its own**; its representative point is resolved on
demand by `resolveVineyardCentroid` via a **3-step fallback**
([location.ts:45-69](src/lib/weather/location.ts#L45-L69)):

1. `VineyardPlantingArea.geometry` centroid (drawn analysis boundary);
2. else average of `VineyardBlock.polygon` centroids;
3. else the **GPS pin** `VineyardDetail.gpsLat/gpsLng` (`Decimal(9,6)`, [schema.prisma:528-529](prisma/schema.prisma#L528-L529)).

If none exist → `null` → no weather ("draw its boundary first" / the sweep skips it,
[sweep.ts:56](src/lib/weather/sweep.ts#L56), [actions.ts:185](src/lib/weather/actions.ts#L185)).

**Timezone:** there is **no per-vineyard timezone**. The only timezone is the tenant-wide
`AppSettings.timeZone` ([schema.prisma:2205](prisma/schema.prisma#L2205)), used only by the assistant
tool ([query-climate.ts:46-48](src/lib/assistant/tools/query-climate.ts#L46-L48)). The web card uses
UTC (§7). **Latitude drives hemisphere** (season windows, frost mirroring): `hemisphereFor(lat) = lat<0?"S":"N"`
([season-core.ts:12-14](src/lib/weather/season-core.ts#L12-L14)).

**US vs non-US determinability:** derivable from the resolved centroid via `coverageStateFor(lat,lon)`:
CONUS bbox (24–50N, −125…−66W) → `US_HIGH_RES`; otherwise → `GLOBAL_COARSE` (NASA POWER)
([registry.ts:38-43](src/lib/weather/providers/registry.ts#L38-L43), [gridmet.ts:43-45](src/lib/weather/providers/gridmet.ts#L43-L45)).
Stored on the config row as `coverageState` ([ingest-core.ts:117,175](src/lib/weather/ingest-core.ts#L117)).
It is bbox-based, not a country field — Alaska/Hawaii/territories fall outside the CONUS box and get
`GLOBAL_COARSE`. Non-US example wired end-to-end: **Bhutan** (GPS-pin + NASA POWER)
([location.ts:5-7](src/lib/weather/location.ts#L5-L7), [nasa-power.ts:1-2](src/lib/weather/providers/nasa-power.ts#L1-L2)).

**Number of sites:** UNKNOWN — requires a `count()` on `vineyard` per tenant against the live DB
(worktree has no `.env`). Two tenants exist by convention: `org_bhutan_wine_co` (real) and
`org_demo_winery` (sandbox) — see AGENTS.md.

---

## 12. Tests and observability

### Tests (all under `test/`, Vitest)

| File | Covers |
|---|---|
| `weather-climate-math.test.ts` (121) | GDD (cap-the-mean), Winkler + boundary honesty, GST/Jones, frost vulnerable-window, heat days, rainfall, season window/SeasonYear, completeness [weather-climate-math.test.ts](test/weather-climate-math.test.ts) |
| `weather-providers.test.ts` (123) | NASA POWER/ACIS/Daymet(leap-day)/CDO(tenths)/EPQS normalizers, nearest-station, coverage classification, SSRF host guard |
| `weather-obs-time.test.ts` (49) | `addDaysIso`, AM_LST met shift ("frost lands on the right local day"), grid pass-through |
| `weather-source-selection.test.ts` (69) | `effectivePrimary`, `selectPrimaryCore`, `gapFillCore` (no overwrite, stamps fill), spread (range not mean) |
| `weather-normals.test.ts` (50) | per-year GDD, Winkler normal (excludes current season), cumulative/average curves |
| `weather-contract.test.ts` (71) | contracts: never-blend, gap-fill on read, obs-time bucketing, provenance/primary always named |
| `weather-alert.test.ts` (28) | crossing detection, dedup idempotency, risk-framed copy |
| `weather-card-core.test.ts` (30) | sparkline scaling, trust/coverage/provider labels |
| `scripts/verify-weather.ts` (130) | **E2E on Demo tenant** with committed fixture providers: known GDD, obs-time shift (5 records → 6 local days), no-fabrication on provider failure, spread present, provenance on every row; cleans up. Run `npm run verify:weather` ([package.json:140](package.json#L140)) |
| `test/evals/assistant-read-tools.golden.ts:166-187` | golden `query_climate` selection cases (GDD-vs-last-year, frost-last-night, Winkler, default-vineyard) |

Coverage is **heavy on the pure math/normalizer cores** (unit) plus one DB-backed E2E. The React
components (`WeatherCard`, `GddChart`, `StationMap`) have **no component tests** — the repo has no
jsdom/RTL (per project notes) and the cores are explicitly split out as "the component is not tested"
([card-core.ts:1](src/lib/weather/card-core.ts#L1)). No test exercises the cron `route.ts`, the sweep's
prime/refresh loop, or the server actions directly.

### Observability

- **Logging:** **none in the weather feature** — grep for `console.`/`logger`/Sentry/`captureException`
  across `src/lib/weather`, the cron route, and the UI returns nothing. `verify-weather.ts` uses
  `console.log` but that is a CI script.
- **Error surfacing:** the cron endpoint returns the sweep summary or `{ok:false,error}` with HTTP 500
  ([route.ts:22-26](src/app/api/cron/weather-poll/route.ts#L22-L26)); per-vineyard sweep errors are
  collected into `summary.errors[]` and returned in the cron response body only
  ([sweep.ts:34,91-93](src/lib/weather/sweep.ts#L91-L93)) — not logged or alerted.
- **Provider-failure observability:** a failed provider fetch writes its message to
  `weather_provider_usage.lastError` ([usage-core.ts:33-36](src/lib/weather/usage-core.ts#L33-L36))
  and appears in `IngestResult.providersFailed`, but there is **no dashboard, log line, or alert** that
  reads either — the only way to see a failure today is to query the usage table or inspect the cron
  HTTP response. (Repo-wide Sentry exists per project notes, but nothing in the weather tree calls it.)

---

## 13. Known problems

- **`git log`** shows a run of fixes on this surface in a single day (2026-07-26), i.e. repeated
  iteration right after landing:
  `#509 fix … weather refresh broke with "No tenant context" + auto-fetch + dataless-primary fallback`,
  `#510 fix … non-US vineyards (Bhutan) get weather via GPS pin + NASA POWER`,
  `#504 fix … use the real design tokens on the weather card (button was invisible)`
  (`git log --oneline -- src/lib/weather`).
- **No `TODO`/`FIXME`/`HACK`/`XXX` comments** in the weather tree (grep). Deferred work is instead
  written as prose ("documented Later item", "Release 4B") — e.g. RH from grids
  ([gridmet.ts:2-4](src/lib/weather/providers/gridmet.ts#L2-L4)), Baskerville-Emin GDD
  ([gdd-core.ts:3](src/lib/weather/gdd-core.ts#L3)), phenology-gated frost
  ([frost-core.ts:6](src/lib/weather/frost-core.ts#L6)), sub-daily UTC reconstruction
  ([obs-time-core.ts:37-38](src/lib/weather/obs-time-core.ts#L37-L38)), equatorial season gap
  ([season-core.ts:5](src/lib/weather/season-core.ts#L5)).
- **Claim vs behavior — weather alerts are counted, never emitted.** `sweep.ts` detects frost/heat
  crossings but only increments `summary.alerts`; no notification/inbox row is written and
  `alertMessage()` is dead (no callers). Comments promise "the sweep's thin inbox alert"
  ([alert-core.ts:1](src/lib/weather/alert-core.ts#L1), [sweep.ts:11,78-90](src/lib/weather/sweep.ts#L78-L90)).
- **Claim vs behavior — `stationElevationDeltaM` is never populated.** In ingest it is set to `null`
  with the comment "filled below when we have site + station elevation," but nothing below fills it and
  the config upsert never writes the column ([ingest-core.ts:111,166-188](src/lib/weather/ingest-core.ts#L111)).
  It is read by the summary/UI ([read-core.ts:220](src/lib/weather/read-core.ts#L220)) but will always
  be null; the card shows only `siteElevationM`, so the "station-vs-site elevation delta explains the
  gap" narrative in the schema comment ([schema.prisma:916](prisma/schema.prisma#L916)) has no live value.
- **Claim vs behavior — the CDO daily-cap "headroom gate" is not enforced.** `isProviderDailyExhausted`
  / `readWeatherUsage` have no callers ([usage-core.ts:43-53](src/lib/weather/usage-core.ts#L43-L53));
  usage is recorded but never checked before a fetch, despite council-R1 language in the comments and
  config ([config.ts:21-23](src/lib/weather/config.ts#L21-L23)).
- **Dead-ish integrations** (see §3.4): `daymet` and `noaa_cdo` are defined, tested, and registered but
  unreachable by the live ingest/backfill paths (history-role filter + CDO token gate).
- **Backfill discards non-growing-season data** ([backfill-core.ts:35-37](src/lib/weather/backfill-core.ts#L35-L37))
  — a latent limit for any future off-season rainfall/temperature view (documented behavior, not a bug).
- **No `User-Agent` on outbound requests** (§3.1) — some of the called hosts (RCC-ACIS, USGS) publish a
  UA expectation; not set here. Reported only.
- **Timezone split** between the web card (UTC) and the assistant (site-local) for "today"/"last night"
  (§7) — the two surfaces can disagree by a day at a UTC boundary.
- No commented-out code blocks were found in the weather tree (grep).

---

## 14. Reuse candidates

Existing utilities/patterns a rewrite should reuse rather than reinvent:

- **HTTP client wrapper** — [providers/fetch-util.ts](src/lib/weather/providers/fetch-util.ts):
  `fetchJson/fetchText/postJson` with SSRF host allowlist, `redirect:"manual"`, 30 s timeout, 8 MB cap,
  typed `ProviderFetchError`. Pair with [config.ts](src/lib/weather/config.ts) `assertAllowedHost` +
  `PROVIDER_HOST_ALLOWLIST`.
- **Provider abstraction** — the `ClimateProvider` contract + registry
  ([types.ts](src/lib/weather/providers/types.ts), [registry.ts](src/lib/weather/providers/registry.ts)):
  adding a network is a plug-in, not a rewrite (`providersForLocation`, `coverageStateFor`).
- **Unit conversion** — `C_TO_F_GDD = 1.8` and the `gddF` fields ([normals-core.ts:12,51-52](src/lib/weather/normals-core.ts#L12-L52));
  CDO tenths and ACIS feet→meters conversions in the adapters. (Note the assistant's hardcoded `1.8`
  duplicate — a rewrite should route all °C→°F through the one constant.)
- **Date/timezone utilities** — `obs-time-core.addDaysIso` + `mapRecordsToLocalDaily` (the observation-time
  mapping); `season-core` (`seasonYearFor`, `seasonWindowFor`, `filterToSeason`, `seasonCompleteness`,
  `windowDayCount`, `hemisphereFor`). For site-local "today," the assistant's
  `resolveOperatingTimeZone` + `zonedDateKey` (`@/lib/work-orders/due-at`) + `getWineryTimeZone`
  (`@/lib/settings/data`) ([query-climate.ts:5-6,46-49](src/lib/assistant/tools/query-climate.ts#L5-L6)).
- **Climate math cores** (pure, tested) — `gdd-core`, `winkler-core`, `gst-core`, `frost-core`,
  `heat-core`, `rainfall-core`, `normals-core`, `source-selection-core` (`gapFillCore`, `computeSpreadCore`,
  `effectivePrimary`, `assertNeverBlended`).
- **Chart component** — [GddChart.tsx](src/app/(app)/vineyards/weather/GddChart.tsx): a self-contained,
  dependency-free SVG line chart with crosshair readout, zoom (±/wheel/pinch), pan, dual axes, and
  DESIGN.md tokens — reusable as the pattern for a rainfall time-series (no charting lib to add).
  `NamedCurve` / `CurvePoint` shapes ([normals-core.ts:91-141](src/lib/weather/normals-core.ts#L91-L141))
  and `card-core.sparklinePoints` are the supporting primitives.
- **Map component** — [StationMap.tsx](src/app/(app)/vineyards/weather/StationMap.tsx) +
  [StationMap.client.tsx](src/app/(app)/vineyards/weather/StationMap.client.tsx): vanilla-Leaflet,
  `ssr:false`, keyless Esri imagery, `circleMarker` (no marker-image assets). Mirrors the shared
  `SatelliteMap` convention.
- **Presentation helpers** — [card-core.ts](src/lib/weather/card-core.ts): `trustLabel`, `coverageLabel`,
  `providerLabel`, `gddComparisonLabel`, `sparklinePoints`.
- **Persistence + tenancy patterns** — bulk `INSERT … ON CONFLICT` in 1,000-row batches inside
  `runInTenantTx`, fetch/normalize outside the tx ([ingest-core.ts:150-192](src/lib/weather/ingest-core.ts#L150-L192));
  `runAsTenant`/`requireTenant` wrapping in the server actions ([actions.ts:23-28,68-69](src/lib/weather/actions.ts#L23-L28));
  atomic usage upsert ([usage-core.ts:29-37](src/lib/weather/usage-core.ts#L29-L37)); the 3-table RLS
  migration template ([migration.sql](prisma/migrations/20260725150000_weather_schema/migration.sql)).
- **Location resolution** — [location.ts `resolveVineyardCentroid`](src/lib/weather/location.ts) (the
  planting-area → block → GPS-pin fallback) is the canonical "where is this vineyard" helper.
- **Cron auth pattern** — constant-time bearer check ([route.ts:11-17](src/app/api/cron/weather-poll/route.ts#L11-L17)).
- **Assistant integration** — [query-climate.ts](src/lib/assistant/tools/query-climate.ts) as the model
  for wiring the same cores to the assistant, plus its golden eval cases.
- **Design tokens** — DESIGN.md CSS variables already used throughout (§8.2); the hardcoded semantic
  chart palette is the one intentional exception.

---

## 15. Open questions

1. **Row counts / data volume** — how many `vineyard_climate_daily` rows exist per tenant, and how many
   vineyards are populated? Needs a `count()`/aggregate against the live DB (worktree lacks `.env`).
2. **Number of sites & their coverage split** — how many `Vineyard` rows per tenant, and how many resolve
   to `US_HIGH_RES` vs `GLOBAL_COARSE`? Same DB-access requirement.
3. **`NOAA_CDO_TOKEN` in production** — is it set in the Vercel env? If not, `noaa_cdo` is fully dormant.
   Needs deployment env access.
4. **Is the daily cron actually firing / succeeding?** The sweep returns a summary but logs nothing;
   confirming primes/refreshes/errors in production needs the cron invocation logs or the
   `weather_provider_usage` table.
5. **Intended alert behavior** — were frost/heat alerts meant to write to an inbox/notification (the
   comments say so) but the wiring was dropped, or is counting the intended scope? (§13)
6. **Timezone intent** — is the web card's UTC "today" a known simplification or a latent bug relative to
   the assistant's site-local resolution? (§7)
7. **Real provider behavior under load** — no retry/backoff exists; UNKNOWN how often RCC-ACIS/NASA POWER
   time out or rate-limit in practice (no logs/metrics to answer).
8. **Precision of the `stationElevationDeltaM`/elevation narrative** — given the column is never written
   (§13), was the elevation-delta feature completed or only stubbed?
9. **`daymet` / `noaa_cdo` intent** — are these meant to be reachable (e.g. an `includeHistory` path or a
   grower opt-in) or retained as future plug-ins only?
