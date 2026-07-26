---
title: S0 Unit 3 — committed fixture manifest and season characterization
type: phase-artifact
phase: S0
unit: 3
date: 2026-07-26
---

# S0 Unit 3 — the committed fixture series

> Weather data by Open-Meteo.com (CC BY 4.0). ERA5/ERA5-Land © Copernicus Climate Change Service.

100 fixtures · 3.2 MB · 543,360 site-hours across 5 sites × 5 seasons × 4 archive models.

Stored columnar and gzipped, in UTC, with the time array dropped — the archive is contiguous
hourly, so `startUtc` plus an index reconstructs every instant, and the contiguity assertion below
proves that rather than assuming it. Site-local hour is derived at read time from the IANA zone.

## Sites

| Site | Regime | Coords | Elevation | Zone | Why it earns a slot |
|---|---|---|---|---|---|
| Stoney Hill | humid continental east | 40.328822, -75.007183 | 75.78 m | America/New_York | Black rot, downy, phomopsis and anthracnose country. Has a measuring station ~8 km away (KDYL) with RH — an Arm B site. |
| Russian River Ranch | coastal fog | 38.5058, -122.8536 | 18.1 m | America/Los_Angeles | Marine-layer dew without rain — the regime where rain-driven intuition fails hardest. |
| Madera | hot arid interior | 36.857887, -119.99701 | 82.41 m | America/Los_Angeles | RH rarely reaches 90%, so the fallback reports 'never wet' all season while CART may still find radiative-dew nights. The refusal threshold's proving ground. |
| Paro | monsoon high altitude | 27.396872, 89.421769 | 2302 m | Asia/Thimphu | Non-US, no NWS coverage, reanalysis only. Proves runbook rule §3.9's jurisdiction-neutrality on a live tenant's real geography. READ-ONLY: coordinates and timezone, nothing else. |
| Monticello AVA (Virginia) — fixture only | humid subtropical southeast | 38.02, -78.48 | 180 m | America/New_York | Council G6 — the most aggressive US disease environment: extreme nighttime humidity plus high heat, which breaks simplistic dew-point estimators. Absent from the plan's first draft. KCHO sits ~10 km away, so this is a candidate SECOND Arm B site. |

⚠️ **Gemini proposed dropping Bhutan to make room for the Southeast site. Rejected.** Paro is a live
tenant and runbook rule §3.9 makes non-US first-class and forbids the app bricking outside the US;
that outranks a site slot. The fifth site was added and Paro kept.

**Bhutan discipline:** Paro is coordinates, elevation and a timezone. Nothing is written to
`org_bhutan_wine_co` and nothing is read from it. The fixture is a flat file.

## Season characterization

Council G5: a single season guarantees blind spots — if one year happens to lack a three-day rain
event at 70 °F, downy and black rot pressure are never exercised at all. So each season is
characterized against a 20-season baseline, and the characterization is an **output**, not a note:
a low-pressure fixture set must be visible rather than silent.

⚠️ **Deviation from the plan, stated rather than buried.** The plan said to characterize against the
20 years of daily climate in `vineyard_climate_daily`. That covers three of five sites — Paro's rows
are Bhutan's and this lane may not read them, and the Monticello site has no rows at all — and would
compute the characterization differently per site. A 20-season baseline pulled from the same archive
the fixtures come from is uniform across all five, needs no tenant context, and compares like with
like.

| Site | Season | Season precip | Percentile | Wetness | Mean temp | Percentile | Warmth |
|---|---|---|---|---|---|---|---|
| stoney_hill | 2021 | 850.3 mm | p79 | **WET** | 19.15 °C | p75 | WARM |
| stoney_hill | 2022 | 776.2 mm | p50 | **NORMAL** | 18.6 °C | p42 | NORMAL |
| stoney_hill | 2023 | 781.3 mm | p54 | **NORMAL** | 18.54 °C | p33 | NORMAL |
| stoney_hill | 2024 | 564.8 mm | p4 | **DRY** | 19.09 °C | p67 | NORMAL |
| stoney_hill | 2025 | 699.8 mm | p42 | **NORMAL** | 18.87 °C | p50 | NORMAL |
| russian_river | 2021 | 247.7 mm | p92 | **WET** | 17.94 °C | p42 | NORMAL |
| russian_river | 2022 | 143.3 mm | p63 | **NORMAL** | 18.17 °C | p71 | WARM |
| russian_river | 2023 | 77.4 mm | p29 | **DRY** | 17.15 °C | p8 | COOL |
| russian_river | 2024 | 74.4 mm | p25 | **DRY** | 18.87 °C | p88 | WARM |
| russian_river | 2025 | 79.2 mm | p33 | **NORMAL** | 17.77 °C | p33 | NORMAL |
| madera | 2021 | 41.8 mm | p25 | **DRY** | 24.68 °C | p75 | WARM |
| madera | 2022 | 58 mm | p46 | **NORMAL** | 24.81 °C | p83 | WARM |
| madera | 2023 | 48.1 mm | p29 | **DRY** | 22.88 °C | p8 | COOL |
| madera | 2024 | 50.3 mm | p42 | **NORMAL** | 24.67 °C | p71 | WARM |
| madera | 2025 | 49.1 mm | p33 | **NORMAL** | 23.95 °C | p46 | NORMAL |
| paro | 2021 | 2112.7 mm | p17 | **DRY** | 15.29 °C | p79 | WARM |
| paro | 2022 | 1461 mm | p0 | **DRY** | 15.53 °C | p88 | WARM |
| paro | 2023 | 1662.9 mm | p4 | **DRY** | 15.23 °C | p63 | NORMAL |
| paro | 2024 | 2115.3 mm | p21 | **DRY** | 16 °C | p96 | WARM |
| paro | 2025 | 2090.6 mm | p13 | **DRY** | 15.72 °C | p92 | WARM |
| monticello_va | 2021 | 554.9 mm | p17 | **DRY** | 21.07 °C | p83 | WARM |
| monticello_va | 2022 | 574.6 mm | p38 | **NORMAL** | 20.04 °C | p29 | COOL |
| monticello_va | 2023 | 461.3 mm | p4 | **DRY** | 20.42 °C | p46 | NORMAL |
| monticello_va | 2024 | 589.6 mm | p46 | **NORMAL** | 20.49 °C | p58 | NORMAL |
| monticello_va | 2025 | 624.4 mm | p54 | **NORMAL** | 20.45 °C | p50 | NORMAL |

### ⚠️ Sampling skew detected

Council G5's whole point is that a low-pressure fixture set must be **visible rather than silent**.
These sites' five seasons all sit on one side of their own baseline, so conclusions drawn there are
drawn on a tail, not on a representative sample:

- **Paro: all 5 fixture seasons are DRY against its own 20-season baseline** (percentiles p17, p0, p4, p21, p13, median p13).

Two readings, and they have opposite consequences, so neither may be assumed:

1. **Sampling accident.** 2021–2025 happened to be dry there. The remedy is more seasons.
2. **Climate trend.** The 20-season baseline is dominated by earlier years that no longer describe
   the site, so *every* recent season would score dry and the percentile is measuring drift rather
   than anomaly. The remedy is a shorter, recency-weighted baseline — and the finding matters well
   beyond S0, because a disease model calibrated on a stale normal inherits the same error.

S0 does not have the evidence to choose between them, and says so rather than picking. What it does
commit to: **Unit 5 reports the affected sites' results per season and never pools them**, and Unit 6
does not set a refusal threshold from a skewed site's numbers alone.

## Shape assertions

Run on every fixture, on write AND on every `--verify-only` pass. A fixture that fails is **not
written** — the failure mode this prevents is a silently truncated or misaligned series that every
later unit would then measure with confidence.

| Assertion | What it catches |
|---|---|
| hour count matches the requested range | a silently truncated season |
| every present variable has exactly `hours` entries | column misalignment, which shifts every hour by an unknown offset |
| contiguity: `startUtc + (hours−1)h` lands on the range's final hour | a duplicated or fabricated hour — and it is what licenses dropping the time array |
| DST behaviour per zone | the US window sits *inside* DST so no transition day should appear; `Asia/Thimphu` must never show one. Asserted positively, so "we handled DST" is distinguishable from "DST never came up" |
| temperature within [−60, 60] °C, RH within [0, 100] % | a swapped or misread column |
| **wind speed max < 45** | ⚠️ the km/h trap — see below |
| dew point never exceeds temperature | swapped columns, which would give CART a negative depression |

### ⚠️ The km/h trap

Open-Meteo's archive returns `wind_speed_10m` in **km/h by default**, and CART's wind node is
**2.5 m/s**. Feeding km/h into an m/s threshold makes a dead calm look windy, which collapses CART's
level 2 and routes the entire season through the RH node. The estimator would still run and still
produce plausible wet-hour counts. Caught while sizing this fetch, before any measurement.

Every request now forces `wind_speed_unit=ms` **and** asserts the returned unit anyway, because
forcing and trusting are different things. Six of the seven providers in this spike report wind in a
different unit from each other; `scripts/s0-units.ts` is the single place that knows.

## Manifest

| Fixture | Hours | Size | sha256 (12) |
|---|---|---|---|
| `madera__2021__default.json.gz` | 5,136 | 33 kB | `66f696facec6` |
| `madera__2021__era5.json.gz` | 5,136 | 33 kB | `274b2aa914a4` |
| `madera__2021__era5_land.json.gz` | 5,136 | 18 kB | `f0ac3844f278` |
| `madera__2021__era5_seamless.json.gz` | 5,136 | 33 kB | `dc0fa36854bd` |
| `madera__2022__default.json.gz` | 5,136 | 34 kB | `17f1d2adb6f3` |
| `madera__2022__era5.json.gz` | 5,136 | 34 kB | `06fce8712bd8` |
| `madera__2022__era5_land.json.gz` | 5,136 | 18 kB | `19bae5a3f098` |
| `madera__2022__era5_seamless.json.gz` | 5,136 | 34 kB | `a278a5a3b949` |
| `madera__2023__default.json.gz` | 5,136 | 34 kB | `54353c4191c3` |
| `madera__2023__era5.json.gz` | 5,136 | 34 kB | `766e413a0ff5` |
| `madera__2023__era5_land.json.gz` | 5,136 | 18 kB | `206dd81acd78` |
| `madera__2023__era5_seamless.json.gz` | 5,136 | 34 kB | `bcd0fb7dae23` |
| `madera__2024__default.json.gz` | 5,136 | 33 kB | `96c7846de654` |
| `madera__2024__era5.json.gz` | 5,136 | 33 kB | `c4cee656f953` |
| `madera__2024__era5_land.json.gz` | 5,136 | 18 kB | `6143b3a4850a` |
| `madera__2024__era5_seamless.json.gz` | 5,136 | 33 kB | `60b525967cc2` |
| `madera__2025__default.json.gz` | 5,136 | 33 kB | `242aed6e9579` |
| `madera__2025__era5.json.gz` | 5,136 | 34 kB | `aa7ce3b02032` |
| `madera__2025__era5_land.json.gz` | 5,136 | 18 kB | `2067ff2fff3c` |
| `madera__2025__era5_seamless.json.gz` | 5,136 | 33 kB | `b96719caf529` |
| `monticello_va__2021__default.json.gz` | 5,136 | 37 kB | `7001bba04a1f` |
| `monticello_va__2021__era5.json.gz` | 5,136 | 36 kB | `47b7ca44dfe7` |
| `monticello_va__2021__era5_land.json.gz` | 5,136 | 19 kB | `08fa8c4caf4e` |
| `monticello_va__2021__era5_seamless.json.gz` | 5,136 | 36 kB | `426b4984f583` |
| `monticello_va__2022__default.json.gz` | 5,136 | 36 kB | `d0faee8553a4` |
| `monticello_va__2022__era5.json.gz` | 5,136 | 37 kB | `52836524faf8` |
| `monticello_va__2022__era5_land.json.gz` | 5,136 | 19 kB | `ca36bb2644b9` |
| `monticello_va__2022__era5_seamless.json.gz` | 5,136 | 37 kB | `6c7329cf6428` |
| `monticello_va__2023__default.json.gz` | 5,136 | 36 kB | `6943ba016a79` |
| `monticello_va__2023__era5.json.gz` | 5,136 | 36 kB | `66ed7cb7bd59` |
| `monticello_va__2023__era5_land.json.gz` | 5,136 | 19 kB | `bda6b3f8e461` |
| `monticello_va__2023__era5_seamless.json.gz` | 5,136 | 36 kB | `d9b03979bf33` |
| `monticello_va__2024__default.json.gz` | 5,136 | 36 kB | `e643f7735534` |
| `monticello_va__2024__era5.json.gz` | 5,136 | 36 kB | `621a94c222de` |
| `monticello_va__2024__era5_land.json.gz` | 5,136 | 18 kB | `5dace9ba30cc` |
| `monticello_va__2024__era5_seamless.json.gz` | 5,136 | 36 kB | `8748e1a2bee5` |
| `monticello_va__2025__default.json.gz` | 5,136 | 37 kB | `0757f5f1375c` |
| `monticello_va__2025__era5.json.gz` | 5,136 | 37 kB | `053f25fde41b` |
| `monticello_va__2025__era5_land.json.gz` | 5,136 | 19 kB | `0110e219337c` |
| `monticello_va__2025__era5_seamless.json.gz` | 5,136 | 36 kB | `ca71524740a1` |
| `paro__2021__default.json.gz` | 6,624 | 45 kB | `329f7bb6d90b` |
| `paro__2021__era5.json.gz` | 6,624 | 43 kB | `b4edbd8d749e` |
| `paro__2021__era5_land.json.gz` | 6,624 | 21 kB | `0ebbb1aaa42e` |
| `paro__2021__era5_seamless.json.gz` | 6,624 | 42 kB | `27684d9a1316` |
| `paro__2022__default.json.gz` | 6,624 | 45 kB | `cb8be9559142` |
| `paro__2022__era5.json.gz` | 6,624 | 45 kB | `7729d2da317d` |
| `paro__2022__era5_land.json.gz` | 6,624 | 21 kB | `0b5de8614370` |
| `paro__2022__era5_seamless.json.gz` | 6,624 | 44 kB | `7e38e54d802a` |
| `paro__2023__default.json.gz` | 6,624 | 46 kB | `d60b6a82916d` |
| `paro__2023__era5.json.gz` | 6,624 | 44 kB | `fcca6f6b1298` |
| `paro__2023__era5_land.json.gz` | 6,624 | 21 kB | `1cea44f910dd` |
| `paro__2023__era5_seamless.json.gz` | 6,624 | 43 kB | `a5c5369e60f3` |
| `paro__2024__default.json.gz` | 6,624 | 46 kB | `09206003bec4` |
| `paro__2024__era5.json.gz` | 6,624 | 45 kB | `9bb5dc860c59` |
| `paro__2024__era5_land.json.gz` | 6,624 | 21 kB | `c74704538559` |
| `paro__2024__era5_seamless.json.gz` | 6,624 | 44 kB | `d820a7120533` |
| `paro__2025__default.json.gz` | 6,624 | 47 kB | `2b8091b2d6db` |
| `paro__2025__era5.json.gz` | 6,624 | 45 kB | `983e023c07b5` |
| `paro__2025__era5_land.json.gz` | 6,624 | 21 kB | `2de4bfbad318` |
| `paro__2025__era5_seamless.json.gz` | 6,624 | 44 kB | `4a6922363471` |
| `russian_river__2021__default.json.gz` | 5,136 | 34 kB | `4fa96e7c628a` |
| `russian_river__2021__era5.json.gz` | 5,136 | 34 kB | `11ddef0aa02d` |
| `russian_river__2021__era5_land.json.gz` | 5,136 | 18 kB | `1238f470a5ee` |
| `russian_river__2021__era5_seamless.json.gz` | 5,136 | 33 kB | `d07a00a38c26` |
| `russian_river__2022__default.json.gz` | 5,136 | 35 kB | `e162934d6c4c` |
| `russian_river__2022__era5.json.gz` | 5,136 | 35 kB | `c80abd9d7c53` |
| `russian_river__2022__era5_land.json.gz` | 5,136 | 18 kB | `bdc1b1690a69` |
| `russian_river__2022__era5_seamless.json.gz` | 5,136 | 34 kB | `4319bc2f3030` |
| `russian_river__2023__default.json.gz` | 5,136 | 34 kB | `7b60c11e0744` |
| `russian_river__2023__era5.json.gz` | 5,136 | 34 kB | `901be6c20ea5` |
| `russian_river__2023__era5_land.json.gz` | 5,136 | 17 kB | `8d9a5e4b0af4` |
| `russian_river__2023__era5_seamless.json.gz` | 5,136 | 33 kB | `9f1bf724aa36` |
| `russian_river__2024__default.json.gz` | 5,136 | 35 kB | `ed4c67112c9f` |
| `russian_river__2024__era5.json.gz` | 5,136 | 34 kB | `d9a36b9525d8` |
| `russian_river__2024__era5_land.json.gz` | 5,136 | 18 kB | `04e45486a59d` |
| `russian_river__2024__era5_seamless.json.gz` | 5,136 | 34 kB | `35a9964191ae` |
| `russian_river__2025__default.json.gz` | 5,136 | 34 kB | `d9f754474675` |
| `russian_river__2025__era5.json.gz` | 5,136 | 35 kB | `b22da8e48e56` |
| `russian_river__2025__era5_land.json.gz` | 5,136 | 17 kB | `772dda0b99f0` |
| `russian_river__2025__era5_seamless.json.gz` | 5,136 | 34 kB | `a607cdb229e1` |
| `stoney_hill__2021__default.json.gz` | 5,136 | 37 kB | `784f0dfdaa3c` |
| `stoney_hill__2021__era5.json.gz` | 5,136 | 36 kB | `cc6c3f5cf724` |
| `stoney_hill__2021__era5_land.json.gz` | 5,136 | 18 kB | `89da48742a59` |
| `stoney_hill__2021__era5_seamless.json.gz` | 5,136 | 36 kB | `a77e4a61dbd7` |
| `stoney_hill__2022__default.json.gz` | 5,136 | 36 kB | `f69ed58e0a5d` |
| `stoney_hill__2022__era5.json.gz` | 5,136 | 37 kB | `973b67629469` |
| `stoney_hill__2022__era5_land.json.gz` | 5,136 | 18 kB | `91f5b4063749` |
| `stoney_hill__2022__era5_seamless.json.gz` | 5,136 | 36 kB | `43b4cc7990d5` |
| `stoney_hill__2023__default.json.gz` | 5,136 | 36 kB | `19334c8eae8e` |
| `stoney_hill__2023__era5.json.gz` | 5,136 | 36 kB | `024920c55e72` |
| `stoney_hill__2023__era5_land.json.gz` | 5,136 | 18 kB | `2a98fb628024` |
| `stoney_hill__2023__era5_seamless.json.gz` | 5,136 | 36 kB | `c92b6bf57df7` |
| `stoney_hill__2024__default.json.gz` | 5,136 | 36 kB | `35bc36cd16b0` |
| `stoney_hill__2024__era5.json.gz` | 5,136 | 36 kB | `b70f6a4f1afd` |
| `stoney_hill__2024__era5_land.json.gz` | 5,136 | 18 kB | `bd21d2d5eb85` |
| `stoney_hill__2024__era5_seamless.json.gz` | 5,136 | 36 kB | `f4643f56c3c4` |
| `stoney_hill__2025__default.json.gz` | 5,136 | 36 kB | `853e7253ff6f` |
| `stoney_hill__2025__era5.json.gz` | 5,136 | 36 kB | `b35f2755d819` |
| `stoney_hill__2025__era5_land.json.gz` | 5,136 | 18 kB | `1e911b0c4d0b` |
| `stoney_hill__2025__era5_seamless.json.gz` | 5,136 | 36 kB | `eb80ef25e966` |
