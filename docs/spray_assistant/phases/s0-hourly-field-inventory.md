---
title: S0 Unit 2 — live hourly field inventory with series-kind classification
type: phase-artifact
phase: S0
unit: 2
date: 2026-07-26
status: measured
---

# S0 Unit 2 — live hourly field inventory

_Probed live 2026-07-26T19:26:40.356Z against the five Unit 3 sites. Machine-readable sidecar: `s0-hourly-field-inventory.json`._

> Weather data by Open-Meteo.com (CC BY 4.0). ERA5/ERA5-Land © Copernicus Climate Change Service.
> NWS requests carry a User-Agent per provider policy. A 404 is a coverage signal and is never retried.

## 1. Series kinds are three ACQUISITION MODES, not three labels

Council C3 asked for every field to be classified OBSERVED / FORECAST / REANALYSIS. The classification
below does that, but the more useful finding is *why* the tag alone is insufficient: the three kinds
differ in **direction of acquisition**, and that drives different economics, different retention and a
different replay story.

| Kind | Direction | Re-fetchable after the fact? | Consequence |
|---|---|---|---|
| OBSERVED | observe forward | ✅ **yes** — Unit 0 established NCEI ISD and the IEM ASOS archive both serve it | retention is a *convenience* decision, not a preservation one |
| FORECAST | forecast forward | ❌ **no** — a past issuance is gone the moment it is superseded | the ONLY kind where not capturing is irreversible |
| REANALYSIS | reanalyze backward | ✅ yes, and it *improves* — a reanalysis is revised | storing it is caching; a stored copy can go STALER than the source |

⚠️ **The irreversibility sits with FORECAST, not with OBSERVED — the opposite of where the plan put it.**
Plan §1.3 built the retention urgency around observed data being lost if not captured. Unit 0 disproved
that. What actually cannot be recovered is *what the forecast said at the moment a grower acted on it*,
which is precisely the decision-replay input. Unit 8 must carry this reversal.

⚠️ **REANALYSIS being revisable is a hazard nobody has named yet.** A stored ERA5 row can drift out of
agreement with the live archive, so a recomputation months later can legitimately produce a different
answer from the same code. That is a replay-integrity problem hiding in the kind that looks safest.

## 2. The three timestamps (council C4)

`seriesKind` + `issuedAt` + `validTime` is **not** sufficient bitemporality for facts-as-of-then. A
delayed cron run, a QC revision, or a later provider revision of the same valid hour all break replay if
only provider issuance and valid time are stored. Measured, per provider:

| Provider | `validTime` | `providerIssuedAt` | `ingestedAt` |
|---|---|---|---|
| `nws:gridpoints-raw` | ✅ per slot | ✅ `2026-07-26T10:58:48+00:00` | ✅ ours |
| `nws:forecast-hourly` | ✅ per slot | ✅ `2026-07-26T10:58:48+00:00` | ✅ ours |
| `nws:station-observations` | ✅ per slot | ❌ **not exposed** | ✅ ours |
| `open_meteo:forecast-default` | ✅ per slot | ❌ **not exposed** | ✅ ours |
| `open_meteo:archive-era5_land` | ✅ per slot | ❌ **not exposed** | ✅ ours |
| `open_meteo:archive-era5` | ✅ per slot | ❌ **not exposed** | ✅ ours |
| `open_meteo:archive-era5_seamless` | ✅ per slot | ❌ **not exposed** | ✅ ours |
| `open_meteo:archive-default` | ✅ per slot | ❌ **not exposed** | ✅ ours |
| `nasa_power:hourly` | ✅ per slot | ❌ **not exposed** | ✅ ours |

⚠️ **Open-Meteo exposes no issuance timestamp on either endpoint.** `generationtime_ms` is how long
*this request* took to compute, not when the product was issued. So for Open-Meteo forecasts,
`providerIssuedAt` is **unknowable** and `ingestedAt` is the only capture time we have. That is a
concrete schema consequence for S1: `providerIssuedAt` must be **nullable**, and a null must mean
*"the provider does not tell us"* rather than *"we failed to record it"* — two states that a nullable
column conflates unless the distinction is made explicit.

### Is NWS `updateTime` a meaningful `issuedAt`?

The council asked directly, because if different gridpoint properties come from different update
streams then the forecast replay model is wrong before storage is even considered.

Measured at stoney_hill: the raw gridpoint carries **one** product-level `updateTime` (`2026-07-26T10:58:48+00:00`),
and the ten property series **start within 0 minutes of each other**.

> **Verdict: `updateTime` is usable as a product-level `providerIssuedAt`**, because the properties are aligned to a single issuance rather than stitched from independent streams. It is still a *last-changed* stamp for the whole product, so it cannot attribute a change to a particular property — which is fine, since we capture whole rows.

### Measured re-issuance cadence — §1.4's ceiling input

Council C5 withdrew the plan's "~170×" forecast-row multiplier as false precision computed before
anything was measured. Here is the measurement it must be replaced with.

Sampled the Stoney Hill gridpoint 7 times over 30 minutes:

- distinct issuances observed: **1**
- gaps between them: _(only one issuance seen in the window)_

Combined with the retained horizon in §3, the forecast-row ceiling is:

```
rows/vineyard/year  =  8760 valid hours  ×  (issuances that still cover a given valid hour)
                    =  8760  ×  ceil(retainedHorizonH / cadenceH)
```

Unit 7 prices both branches of that with the measured numbers. **The multiplier is derived, never assumed.**

## 3. The field inventory

Presence, units, null density and native interval per field. `∅` = absent from the payload entirely.

### `nws:gridpoints-raw` — FORECAST

Endpoint: `https://api.weather.gov/gridpoints/PHI/53,96` · sites returning data: 4/5

| Field | Present | Units | Null density | Native interval | Note |
|---|---|---|---|---|---|
| `temperature` | ✅ 4/4 sites | wmoUnit:degC | 0.0% | 1 h | 148 slots, widths 1/2/3/4h |
| `dewpoint` | ✅ 4/4 sites | wmoUnit:degC | 0.0% | 1 h | 95 slots, widths 1/2/3/4/5/7/8/9h |
| `relativeHumidity` | ✅ 4/4 sites | wmoUnit:percent | 0.0% | 1 h | 149 slots, widths 1/2/3/5/10h |
| `windSpeed` | ✅ 4/4 sites | wmoUnit:km_h-1 | 0.0% | 1 h | 68 slots, widths 1/2/3/4/5/6/7/8/11/13h |
| `windDirection` | ✅ 4/4 sites | wmoUnit:degree_(angle) | 0.0% | 1 h | 91 slots, widths 1/2/3/4/5/8/9/12/13h |
| `windGust` | ✅ 4/4 sites | wmoUnit:km_h-1 | 0.0% | 1 h | 91 slots, widths 1/2/3/4/5/6/8/13h |
| `skyCover` | ✅ 4/4 sites | wmoUnit:percent | 0.0% | 1 h | 85 slots, widths 1/2/4/6/12h |
| `quantitativePrecipitation` | ✅ 4/4 sites | wmoUnit:mm | 0.0% | 2 / 6 h | 14 slots, widths 2/6h |
| `probabilityOfPrecipitation` | ✅ 4/4 sites | wmoUnit:percent | 0.0% | 1 / 186 / 3 h | 49 slots, widths 1/2/4/6/14h |
| `apparentTemperature` | ✅ 4/4 sites | wmoUnit:degC | 0.0% | 1 h | 149 slots, widths 1/2/3/4h |

Retained horizon: 179 h forward

- `stoney_hill`: updateTime=2026-07-26T10:58:48+00:00 · property start spread 0 min
- `russian_river`: updateTime=2026-07-26T18:26:38+00:00 · property start spread 0 min
- `madera`: updateTime=2026-07-26T18:56:29+00:00 · property start spread 0 min
- `monticello_va`: updateTime=2026-07-26T18:23:20+00:00 · property start spread 0 min

### `nws:forecast-hourly` — FORECAST

Endpoint: `https://api.weather.gov/gridpoints/PHI/53,96/forecast/hourly` · sites returning data: 4/5

| Field | Present | Units | Null density | Native interval | Note |
|---|---|---|---|---|---|
| `temperature` | ✅ 4/4 sites | — | 0.0% | 1 h | 156/156 non-null |
| `dewpoint` | ✅ 4/4 sites | wmoUnit:degC | 0.0% | 1 h | 156/156 non-null |
| `relativeHumidity` | ✅ 4/4 sites | wmoUnit:percent | 0.0% | 1 h | 156/156 non-null |
| `windSpeed` | ✅ 4/4 sites | — | 0.0% | 1 h | 156/156 non-null |
| `probabilityOfPrecipitation` | ✅ 4/4 sites | wmoUnit:percent | 0.0% | 1 h | 156/156 non-null |

Retained horizon: 156 h forward

- `stoney_hill`: 156 one-hour periods
- `russian_river`: 156 one-hour periods
- `madera`: 156 one-hour periods
- `monticello_va`: 156 one-hour periods

### `nws:station-observations` — OBSERVED

Endpoint: `https://api.weather.gov/stations/KDYL/observations` · sites returning data: 4/5

| Field | Present | Units | Null density | Native interval | Note |
|---|---|---|---|---|---|
| `temperature` | ✅ 4/4 sites | wmoUnit:degC | 0.0% | 0.07792207792207792 / 0.07643312101910828 / 0.12307692307692308 / 0.07692307692307693 h | 308/308 non-null |
| `dewpoint` | ✅ 4/4 sites | wmoUnit:degC | 0.6% | 0.07792207792207792 / 0.07643312101910828 / 0.12307692307692308 / 0.07692307692307693 h | 304/308 non-null |
| `relativeHumidity` | ✅ 4/4 sites | wmoUnit:percent | 0.6% | 0.07792207792207792 / 0.07643312101910828 / 0.12307692307692308 / 0.07692307692307693 h | 304/308 non-null |
| `windSpeed` | ✅ 4/4 sites | wmoUnit:km_h-1 | 2.6% | 0.07792207792207792 / 0.07643312101910828 / 0.12307692307692308 / 0.07692307692307693 h | 304/308 non-null |
| `windDirection` | ✅ 4/4 sites | wmoUnit:degree_(angle) | 3.3% | 0.07792207792207792 / 0.07643312101910828 / 0.12307692307692308 / 0.07692307692307693 h | 298/308 non-null |
| `precipitationLastHour` | ∅ **absent** | — | 100.0% | 0.07792207792207792 / 0.07643312101910828 / 0.12307692307692308 / 0.07692307692307693 h | 0/308 non-null |
| `barometricPressure` | ✅ 4/4 sites | wmoUnit:Pa | 0.0% | 0.07792207792207792 / 0.07643312101910828 / 0.12307692307692308 / 0.07692307692307693 h | 308/308 non-null |

Retained horizon: 168 h TRAILING

- `stoney_hill`: KDYL @ 9.8km · Δelev 44m · 308 obs/24h (~5min) · QC=[V|Z]
- `russian_river`: KSTS @ 3.3km · Δelev 20m · 314 obs/24h (~5min) · QC=[V|Z]
- `madera`: KMAE @ 17.4km · Δelev -7m · 195 obs/24h (~7min) · QC=[V|Z]
- `monticello_va`: KCHO @ 13.2km · Δelev 15m · 312 obs/24h (~5min) · QC=[V|Z]

### `open_meteo:forecast-default` — FORECAST

Endpoint: `https://api.open-meteo.com/v1/forecast` · sites returning data: 5/5

| Field | Present | Units | Null density | Native interval | Note |
|---|---|---|---|---|---|
| `temperature_2m` | ✅ 5/5 sites | °C | 0.0% | 1 h | 168/168 |
| `relative_humidity_2m` | ✅ 5/5 sites | % | 0.0% | 1 h | 168/168 |
| `dew_point_2m` | ✅ 5/5 sites | °C | 0.0% | 1 h | 168/168 |
| `wind_speed_10m` | ✅ 5/5 sites | km/h | 0.0% | 1 h | 168/168 |
| `precipitation` | ✅ 5/5 sites | mm | 0.0% | 1 h | 168/168 |
| `cloud_cover` | ✅ 5/5 sites | % | 0.0% | 1 h | 168/168 |
| `shortwave_radiation` | ✅ 5/5 sites | W/m² | 0.0% | 1 h | 168/168 |

Retained horizon: 168 h forward

- `stoney_hill`: 168 hourly slots · elevation=80m · gen 0.45609474182128906ms
- `russian_river`: 168 hourly slots · elevation=48m · gen 1.398324966430664ms
- `madera`: 168 hourly slots · elevation=83m · gen 2.9369592666625977ms
- `paro`: 168 hourly slots · elevation=2302m · gen 8.032083511352539ms
- `monticello_va`: 168 hourly slots · elevation=140m · gen 47.99807071685791ms

### `open_meteo:archive-era5_land` — REANALYSIS

Endpoint: `https://archive-api.open-meteo.com/v1/archive` · sites returning data: 5/5

| Field | Present | Units | Null density | Native interval | Note |
|---|---|---|---|---|---|
| `temperature_2m` | ✅ 5/5 sites | °C | 0.0% | 1 h | 168/168 |
| `relative_humidity_2m` | ✅ 5/5 sites | % | 0.0% | 1 h | 168/168 |
| `dew_point_2m` | ✅ 5/5 sites | °C | 0.0% | 1 h | 168/168 |
| `wind_speed_10m` | ∅ **absent** | km/h | 100.0% | 1 h | ALL NULL (168 slots) |
| `precipitation` | ∅ **absent** | mm | 100.0% | 1 h | ALL NULL (168 slots) |
| `cloud_cover` | ∅ **absent** | % | 100.0% | 1 h | ALL NULL (168 slots) |
| `shortwave_radiation` | ∅ **absent** | W/m² | 100.0% | 1 h | ALL NULL (168 slots) |

- `stoney_hill`: 168 hourly slots · elevation=80m · gen 2.056121826171875ms
- `russian_river`: 168 hourly slots · elevation=48m · gen 7.352352142333984ms
- `madera`: 168 hourly slots · elevation=83m · gen 97.3273515701294ms
- `paro`: 168 hourly slots · elevation=2302m · gen 2.297043800354004ms
- `monticello_va`: 168 hourly slots · elevation=140m · gen 105.1100492477417ms

### `open_meteo:archive-era5` — REANALYSIS

Endpoint: `https://archive-api.open-meteo.com/v1/archive` · sites returning data: 5/5

| Field | Present | Units | Null density | Native interval | Note |
|---|---|---|---|---|---|
| `temperature_2m` | ✅ 5/5 sites | °C | 0.0% | 1 h | 168/168 |
| `relative_humidity_2m` | ✅ 5/5 sites | % | 0.0% | 1 h | 168/168 |
| `dew_point_2m` | ✅ 5/5 sites | °C | 0.0% | 1 h | 168/168 |
| `wind_speed_10m` | ✅ 5/5 sites | km/h | 0.0% | 1 h | 168/168 |
| `precipitation` | ✅ 5/5 sites | mm | 0.0% | 1 h | 168/168 |
| `cloud_cover` | ✅ 5/5 sites | % | 0.0% | 1 h | 168/168 |
| `shortwave_radiation` | ✅ 5/5 sites | W/m² | 0.0% | 1 h | 168/168 |

- `stoney_hill`: 168 hourly slots · elevation=80m · gen 10.422825813293457ms
- `russian_river`: 168 hourly slots · elevation=48m · gen 126.9751787185669ms
- `madera`: 168 hourly slots · elevation=83m · gen 14.455437660217285ms
- `paro`: 168 hourly slots · elevation=2302m · gen 35.70914268493652ms
- `monticello_va`: 168 hourly slots · elevation=140m · gen 7.127881050109863ms

### `open_meteo:archive-era5_seamless` — REANALYSIS

Endpoint: `https://archive-api.open-meteo.com/v1/archive` · sites returning data: 5/5

| Field | Present | Units | Null density | Native interval | Note |
|---|---|---|---|---|---|
| `temperature_2m` | ✅ 5/5 sites | °C | 0.0% | 1 h | 168/168 |
| `relative_humidity_2m` | ✅ 5/5 sites | % | 0.0% | 1 h | 168/168 |
| `dew_point_2m` | ✅ 5/5 sites | °C | 0.0% | 1 h | 168/168 |
| `wind_speed_10m` | ✅ 5/5 sites | km/h | 0.0% | 1 h | 168/168 |
| `precipitation` | ✅ 5/5 sites | mm | 0.0% | 1 h | 168/168 |
| `cloud_cover` | ✅ 5/5 sites | % | 0.0% | 1 h | 168/168 |
| `shortwave_radiation` | ✅ 5/5 sites | W/m² | 0.0% | 1 h | 168/168 |

- `stoney_hill`: 168 hourly slots · elevation=80m · gen 0.20694732666015625ms
- `russian_river`: 168 hourly slots · elevation=48m · gen 5.786538124084473ms
- `madera`: 168 hourly slots · elevation=83m · gen 17.396211624145508ms
- `paro`: 168 hourly slots · elevation=2302m · gen 0.8622407913208008ms
- `monticello_va`: 168 hourly slots · elevation=140m · gen 104.25639152526855ms

### `open_meteo:archive-default` — REANALYSIS

Endpoint: `https://archive-api.open-meteo.com/v1/archive` · sites returning data: 5/5

| Field | Present | Units | Null density | Native interval | Note |
|---|---|---|---|---|---|
| `temperature_2m` | ✅ 5/5 sites | °C | 0.0% | 1 h | 168/168 |
| `relative_humidity_2m` | ✅ 5/5 sites | % | 0.0% | 1 h | 168/168 |
| `dew_point_2m` | ✅ 5/5 sites | °C | 0.0% | 1 h | 168/168 |
| `wind_speed_10m` | ✅ 5/5 sites | km/h | 0.0% | 1 h | 168/168 |
| `precipitation` | ✅ 5/5 sites | mm | 0.0% | 1 h | 168/168 |
| `cloud_cover` | ✅ 5/5 sites | % | 0.0% | 1 h | 168/168 |
| `shortwave_radiation` | ✅ 5/5 sites | W/m² | 0.0% | 1 h | 168/168 |

- `stoney_hill`: 168 hourly slots · elevation=80m · gen 24.877548217773438ms
- `russian_river`: 168 hourly slots · elevation=48m · gen 109.49420928955078ms
- `madera`: 168 hourly slots · elevation=83m · gen 25.335192680358887ms
- `paro`: 168 hourly slots · elevation=2302m · gen 27.693510055541992ms
- `monticello_va`: 168 hourly slots · elevation=140m · gen 11.590242385864258ms

### `nasa_power:hourly` — REANALYSIS

Endpoint: `https://power.larc.nasa.gov/api/temporal/hourly/point` · sites returning data: 5/5

| Field | Present | Units | Null density | Native interval | Note |
|---|---|---|---|---|---|
| `T2M` | ✅ 5/5 sites | C | 0.0% | 1 h | 168/168 (fill=-999 excluded) |
| `RH2M` | ✅ 5/5 sites | % | 0.0% | 1 h | 168/168 (fill=-999 excluded) |
| `T2MDEW` | ✅ 5/5 sites | C | 0.0% | 1 h | 168/168 (fill=-999 excluded) |
| `WS2M` | ✅ 5/5 sites | m/s | 0.0% | 1 h | 168/168 (fill=-999 excluded) |
| `PRECTOTCORR` | ✅ 5/5 sites | mm/day | 0.0% | 1 h | 168/168 (fill=-999 excluded) |
| `ALLSKY_SFC_SW_DWN` | ✅ 5/5 sites | MJ/hr | 0.0% | 1 h | 168/168 (fill=-999 excluded) |

- `stoney_hill`: wind is WS2M (2 m), NOT 10 m — a different quantity from every other provider here
- `russian_river`: wind is WS2M (2 m), NOT 10 m — a different quantity from every other provider here
- `madera`: wind is WS2M (2 m), NOT 10 m — a different quantity from every other provider here
- `paro`: wind is WS2M (2 m), NOT 10 m — a different quantity from every other provider here
- `monticello_va`: wind is WS2M (2 m), NOT 10 m — a different quantity from every other provider here

## 4. The findings that change other phases

### 4.1 ERA5-Land carries no wind — **CONFIRMED across all five sites and a full week**

The data-sources design §2.3 recommends ERA5-Land (0.1°, ~11 km) over ERA5 (0.25°, ~25 km) on resolution.
The plan spot-checked two sites; this probe checks all five over a full week. **CART is RH + dew-point
depression + wind. The archive the design doc prefers cannot run the estimator the design doc prefers.**

⚠️ **And the second consumer of wind is the more serious one (council G4).** The label is the law, and
labels dictate maximum wind speeds for drift. **A provider carrying null wind cannot support an
application-window answer at all.** Rendering that as anything other than *cannot determine safely*
would advise a grower toward a label violation. **Wind availability is a hard input to the S7b legality
gate**, not merely a confidence input to the LWD estimator. S0 does not build that gate; Unit 9 writes
the requirement into the output shape so S7b cannot miss it.

### 4.2 NWS `/forecast/hourly` has no humidity — the raw gridpoint is the only NWS CART source

`forecast-nws.ts` already calls both endpoints. It parses 156 one-hour periods from `/forecast/hourly`
(temp, PoP, condition, wind — **no humidity, no dew point**), and separately calls the raw gridpoint but
reads exactly one property off it, `quantitativePrecipitation`, discarding the rest. **The CART inputs
are already being fetched and thrown away.** S1's NWS work is a parse, not a request.

### 4.3 NASA POWER's wind is 2 m, not 10 m

`WS2M` is a different physical quantity from every other provider's 10 m wind, and CART was developed
against standard 10 m station data. Mixing them silently would inject a systematic bias into exactly the
input council G2 already flagged as CART's weakest. Since NASA POWER is **Bhutan's current primary**,
this lands on the one site with no NWS coverage. S1 must either convert with a documented wind profile
or carry the measurement height in the confidence band. **Do not silently treat them as the same field.**

## 5. The alignment and QC-admissibility rule — pre-declared (council C8)

Station observations are sub-hourly and QC-tagged; model products are hourly bins with their own
interval semantics. This rule is fixed **here, in Unit 2**, before Unit 5 can tune it. Without that,
the Arm B comparison could be adjusted after the fact until it passed.

| Aspect | Rule |
|---|---|
| Bin definition | [HH:00, HH+1:00) UTC, half-open |
| Inclusion window | obs timestamp floored to the hour; obs at minute >= 45 roll into the following hour |
| State variables (T, Td, RH, wind) | nearest-to-bin-centre single observation, never a mean |
| Precipitation | last non-null hourly-accumulation report in the bin (NOT summed — the field is already an hour accumulation) |
| Ragged gaps | a bin with no admissible observation is MISSING; never interpolated, never defaulted to zero |
| QC admissible (NWS) | V, Z — Z (preliminary) is admitted but tagged; Unit 5 reports the V/Z split so the reader can discount accordingly |
| QC admissible (ISD) | 0, 1, 4, 5, 9 |
| DST | align in UTC; convert to site-local via the IANA zone only at the estimator's night-window boundary |

Two of these are not obvious and are worth the sentence:

- **State variables take the nearest observation, never a mean.** A mean of two observations 40 minutes
  apart is a value that never occurred. CART is a threshold model, so fabricated intermediate values
  create fabricated threshold crossings.
- **Precipitation is not summed.** `precipitationLastHour` is already an hour-long accumulation, so
  adding several reports inside one hour double-counts. Take the last non-null report in the bin.

## 6. Station provenance for the confidence band (council G2)

Station wind is measured at 10 m in open terrain, usually an airport; canopy microclimate is 1–2 m and
blocked by topography, windbreaks and the trellis. That provenance enters the confidence band, so it is
measured here rather than asserted in Unit 6.

| Site | Station | Distance | Δ elevation (station − site) | Observation cadence | QC vocabulary |
|---|---|---|---|---|---|
| Stoney Hill | `KDYL` | 9.8 km | 44 m | 308/24h | V, Z |
| Russian River Ranch | `KSTS` | 3.3 km | 20 m | 314/24h | V, Z |
| Madera | `KMAE` | 17.4 km | -7 m | 195/24h | V, Z |
| Paro | — | — | — | — | _no NWS station (rule §3.9)_ |
| Monticello AVA (Virginia) — fixture only | `KCHO` | 13.2 km | 15 m | 312/24h | V, Z |

⚠️ **The elevation delta is not decoration.** Dew point is far more conserved across an elevation change
than temperature is, so a station several hundred metres off the site biases dew-point *depression*
mostly through the temperature term. Unit 5 reports the delta alongside every Arm B figure.

## 7. What Unit 3 and Unit 5 inherit from this

1. Fetch the archive under **every** model variant — model choice is a first-class error source, carried
   through the measurement rather than collapsed early.
2. The rollup rule in §5 is frozen. Unit 5 imports it; it does not re-derive it.
3. `providerIssuedAt` is unknowable for Open-Meteo. Any replay design that assumes every provider
   supplies one is wrong.
4. NASA POWER wind is 2 m. Paro's fixtures carry that caveat into every wind-sensitivity number.

_1 of 5 sites have no NWS grid (non-US). That is the rule §3.9 jurisdiction case working as intended, not a gap._
