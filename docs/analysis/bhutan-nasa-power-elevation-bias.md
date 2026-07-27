# NASA POWER grid-cell elevation bias — Bhutan Wine Co. (LIVE tenant)

**Status:** investigation complete · cause identified · **remedy BUILT and APPLIED to the live tenant** (see §7)
**Date:** 2026-07-26
**Origin:** out-of-scope finding from the S5a Unit 0 diurnal-fidelity probe
(`docs/spray_assistant/phases/S5a-diurnal-fidelity-probe.md`, branch `claude/powdery-index-latent-ledger-38428b`)
**Scope of this work:** READ-ONLY against `org_bhutan_wine_co` + public weather archives. No writes, no fixtures.
**Reproduction script:** `scripts/probe-bhutan-temp-bias.ts` (independent of the S5a probe's code paths)

---

## 1. Verdict

The S5a finding reproduces, and it is **not** an unresolvable disagreement between two gridded products.
NASA POWER is describing a point roughly **1.0–1.8 km above** each Bhutan vineyard, and it is wrong for
those sites. Three lines of evidence, none of which needs a station oracle:

1. **NASA POWER says so itself.** Its own API returns the grid-cell elevation in
   `geometry.coordinates[2]`. At Bajo that is **3,038 m**. The vineyard is at **1,229–1,230 m** — a figure
   independently agreed by Copernicus DEM GLO-90 (1,229 m) and by the value already stored in
   `VineyardDetail.elevationM` (1,230.17 m). This is not two models disagreeing; it is one model answering
   a different question.
2. **Correcting for that elevation collapses the disagreement.** Open-Meteo's ERA5 archive downscales to a
   requested elevation, so ERA5 can be sampled at the *same* elevation POWER reports. Doing that drops the
   bias from **−9.71 °C to +1.80 °C** at Bajo, and equivalently at all eight sites. The implied lapse rate
   is **4.7–6.1 °C/km** across the fleet — the textbook environmental lapse rate. Nothing about model
   disagreement would land on that constant at eight independent sites.
3. **The app's own output is internally falsified.** Bajo (1,230 m) and Ser Bhum (2,773 m) currently render
   **identical** season GDD, GST, Winkler region and frost dates, because they fall in one POWER cell.
   Gortshalu, Lingmethang and Norzinthang likewise. Eight vineyards spanning 579–2,774 m of elevation are
   served by **three distinct series**.

A fourth, softer check agrees: published climate normals for Wangdue Phodrang (the valley Bajo sits in,
~1,240 m) give a mean daily maximum near **29.5 °C in July**. POWER's stored value for Bajo on 2026-07-22 is
**17.19 °C**. ERA5-at-site for the same window is ~31 °C.

---

## 2. The measurement (reproduced independently)

`scripts/probe-bhutan-temp-bias.ts` re-reads the DB, re-fetches NASA POWER live, and re-fetches Open-Meteo's
ERA5 archive from scratch — it does not reuse the S5a probe's plumbing. Window 2020-04-01 → 2025-09-30,
timezone `Asia/Thimphu`, n = 1,646 paired days per site.

First, an integrity check: **the stored series is faithfully what NASA POWER returns.** Stored minus live
POWER is mean 0.00 °C, MAE 0.00, r = 1.0000 at every site. The ingest is not the defect.

| site | site elev (m) | POWER cell elev (m) | Δz (m) | bias vs ERA5 **@ site** | bias vs ERA5 **@ POWER's own cell** | mean&#124;monthly&#124; |
|---|---|---|---|---|---|---|
| Bajo | 1,229 | 3,038 | +1,809 | **−9.71** | +1.80 | 9.71 |
| Gortshalu | 820 | 2,419 | +1,599 | **−9.02** | +1.40 | 9.03 |
| Lingmethang | 628 | 2,419 | +1,791 | **−8.82** | +2.04 | 8.82 |
| Norzinthang | 721 | 2,419 | +1,698 | **−8.90** | +1.85 | 8.91 |
| Paro | 2,302 | 3,437 | +1,135 | **−6.96** | +0.14 | 6.97 |
| Pinsa | 585 | 1,607 | +1,022 | **−4.76** | +1.67 | 4.76 |
| Ser Bhum | 2,773 | 3,038 | +265 | −0.38 | +1.09 | 0.56 |
| Yusipang | 2,719 | 3,038 | +319 | −0.73 | +1.09 | 0.79 |
| *[US] Madera* | 83 | 195 | +112 | +0.67 | — | 0.71 |
| *[US] Oakville Estate* | 48 | 266 | +218 | +0.37 | — | 0.44 |
| *[US] Ojai* | 257 | 739 | +482 | +1.32 | — | 1.34 |

My mean&#124;monthly&#124; at Bajo (9.71) runs slightly above the probe's 9.26 because I compare stored dailies
directly rather than a reconstructed-hourly aggregate; the two agree on the phenomenon.

**Read the last two data columns together.** The bias tracks Δz and nothing else. Ser Bhum and Yusipang sit
close to their cell's mean elevation and behave like the US sites. This is therefore **not a "Bhutan
problem"** — it is a systematic property of using a ~50 km grid product as a point observation, whose
magnitude scales with local relief. It is merely invisible on the flat California valley floors, and the US
sites are additionally protected because `gridmet`/`rcc_acis` — not POWER — is their effective primary.

**Is the offset constant or seasonal?** Effectively constant. Month-of-year spread is 1.4–2.5 °C against a
level shift of 7–10 °C, i.e. the seasonal component is ~20% of the total and the rest is a pure offset.

---

## 3. Blast radius — what the grower is being shown today

Rendered through the real cores (`composeClimateSummaryCore`), as of 2026-07-26:

| site | GST → Jones group | Winkler normal (20-yr) | reality |
|---|---|---|---|
| Bajo | 12.35 °C → **"Too cool"** | **Region I** on 655 °C-days | subtropical valley; ERA5@site gives ~2,644–2,819 °C-days → **Region V** |
| Gortshalu | 15.30 °C → "Intermediate" | **Region I** on 1,240 | ~3,095–3,231 → **Region V** |
| Lingmethang | 15.30 °C → "Intermediate" | **Region I** on 1,240 | ~3,018–3,186 → **Region V** |
| Norzinthang | 15.30 °C → "Intermediate" | **Region I** on 1,240 | ~3,087–3,199 → **Region V** |
| Paro | 10.23 °C → **"Too cool"** | **Region I** on 318 | ~1,492–1,715 → **Region II/III** |
| Pinsa | 19.45 °C → "Hot" | Region IV on 2,133 | ~3,080–3,217 → **Region V** |

**Winkler is wrong by the full width of the scale at five of six valley sites** (I → V). Jones group is wrong
by four steps at Bajo ("Too cool" → "Very hot"). Both are hard-boundary classifications, so there is no
"approximately right" reading available — the label is simply the wrong label. `winklerRegion`'s
`nearBoundary` honesty flag does not fire, because the value is not near a boundary; it is near the *wrong*
boundary, confidently.

**Frost events are fabricated.** The Bajo card currently lists spring-frost events including
**2026-04-06 at −0.63 °C** and **2026-04-08 at −1.15 °C**. ERA5 at the vineyard's elevation gives **11.8 °C**
and **10.5 °C** on those nights; the coldest night in the whole of April 2026 was **9.3 °C**. Over the
2020–2025 window POWER produces **353 sub-freezing nights at Bajo and 126 at Gortshalu**; ERA5@site gives
**9 and 0**. These are not marginal calls — they are ~12 °C errors presented as observations.

**The forecast and the history on the same card disagree by ~14 °C.** The forecast path
(`forecast-open-meteo.ts`) is already elevation-downscaled — its header comment names "the Bhutan-at-2,302 m
case" explicitly. The observed path is not. So at Bajo the card shows an observed high of **17.2 °C on
2026-07-22** and a forecast high of **31.7 °C on 2026-07-26**. Four days apart, in a monsoon summer. The
inconsistency is already visible to the grower.

**Surfaces reading the affected series:**

| surface | path | exposure |
|---|---|---|
| Climate summary card (GDD, Winkler, GST, frost, heat, normals, sparkline, 20-yr graph) | `weather/read-core.ts` → `actions.ts` → `vineyards/weather/WeatherCard.tsx` | **wrong labels shown now** |
| Winkler/GST normals | `weather/normals-core.ts` | Bhutan has no `gridmet`, so normals fall through to `nasa_power` — the 20-yr normal is POWER-based too |
| Assistant climate answers | `assistant/tools/query-climate.ts` | same core, so the assistant states the same wrong region/group in conversation |
| Phenology stage estimation | `phenology/read.ts` → `phenology/stage-core.ts` | GDD accumulates ~2.5× too slowly; the interpolator will hold vines pre-veraison ~indefinitely |
| Observed frost/heat alerts | `weather/sweep.ts` → `alert-core.ts` | detection runs on the primary series; frost alerts fire on nights that were ~12 °C |
| Spray drying / any future weather-driven index | `spray/drying-core.ts` and the S1/S5a lane | S0 already narrowed S1 to eastern US sites, so Bhutan is not yet exposed here — but this is the series any Bhutan spray model would inherit |

Forecast-driven alert tiers (plan 096 U19–U22) run on Open-Meteo and are **not** affected.

---

## 4. Two adjacent defects found on the way

1. **`VineyardWeatherConfig.siteElevationM` is NULL at 7 of 8 Bhutan sites** (only Paro has 2,302 m), even
   though `lastRefreshAt` is current on all of them. `ingest-core.ts:80` does
   `await elevFn(lat, lon).catch(() => null)` and then writes that value **unconditionally** into both the
   `create` and `update` branches — so a transient failure on a deliberately non-fatal side lookup
   **overwrites a previously-good elevation with NULL**. Not currently user-visible (Open-Meteo's forecast
   defaults to its own 90 m DEM lookup when `elevation=` is omitted, which I verified returns the same
   value), but any elevation-aware remedy keys on this column, so it must be made non-destructive first.
2. **Gortshalu, Lingmethang and Norzinthang have no forecast rows at all** — `vineyard_forecast_daily` is
   empty for them while Bajo, Paro, Pinsa and Ser Bhum are populated. Separate issue, not investigated here.

---

## 5. Recommended remedy

The brief floated three options. My reading, in order of preference:

### Primary — give the observed series the elevation downscaling the forecast path already has

Add an **Open-Meteo ERA5 archive** `ClimateProvider` (`providers/open-meteo-archive.ts`) alongside the
existing forecast adapter, passing `elevation=` from the site elevation exactly as
`forecast-open-meteo.ts:115` already does. Make it the resolved primary wherever the coarse-grid path is
today, and re-ingest Bhutan's history.

This is the smallest honest change and it closes an inconsistency rather than inventing a policy: the same
codebase already decided, in writing, that Himalayan sites need elevation downscaling — it just only applied
that decision to the forecast half of the card.

**Do not** apply a lapse-rate correction to the POWER rows at ingest (the brief's option A). It would write a
derived number into a column whose contract is "the SINGLE source of this row" (schema comment on
`providerKey`), breaking the never-blend discipline of weather council R1/R3, and it would bake in a lapse
constant we have no local oracle to validate.

### Mandatory companion — a structural guard, so this cannot recur silently

Switching providers alone would replace one unvalidated grid with another; the residual after elevation
correction is still 1.4–2.0 °C at the Bhutan valley sites versus 0.3–1.4 °C in the US, and Winkler has hard
boundaries. So:

- **Persist the provider's reported grid-cell elevation** in the row provenance (POWER already returns it;
  it is currently discarded by `normalizePowerResponse`), and store Δz = cell − site on the config.
- **Refuse the hard-boundary classifications when Δz exceeds a defensible envelope.** `winklerRegion` and
  `jonesGroup` should return a refusal state, not a label — show the GDD number and
  *"cannot classify: the source grid cell sits 1,809 m above this site"*. This is rule §3.6 (a gap must never
  render as a confident value) applied to weather, and §3.4/§3.5 (confidence alongside the number; the
  estimator named). It is deliberately narrower than the brief's option C: refuse the **classification**,
  which is where the hard boundary makes a wrong answer unrecoverable, while still showing the raw series.
- **Make the elevation write non-destructive** — never overwrite a good `siteElevationM` with a fetch failure.

### Sequencing note (live tenant)

The stored history is ~4,847 rows per vineyard back to 2006, and the 20-year Winkler normal is computed from
it. A provider switch that leaves the POWER rows in place leaves `perSource` still showing them and leaves
any read that falls back to POWER still wrong. Per AGENTS.md, treat this as backfill-then-enforce: ingest the
corrected series first, verify, then move the primary — and decide explicitly whether the POWER rows are
retained as a labelled second source or removed.

---

## 7. What shipped

All of the above was built and applied. Migration
`20260727150000_weather_primary_source_elevation` (one nullable column) is applied to the live DB.

**New:** `providers/open-meteo-archive.ts` (ERA5, `elevation=`-downscaled, retries past the free tier's
429s) · `source-fidelity-core.ts` (the Δz → band → refusal rule) · `test/weather-source-fidelity.test.ts`
(20 cases, built from this investigation's measured numbers) ·
`scripts/backfill-elevation-corrected-weather.ts` (dry-run by default).

**Changed:** POWER now surfaces its grid-cell elevation instead of discarding it · the registry and an
explicit `GRID_PREFERENCE` in `source-selection-core` put the corrected source ahead of POWER (it was
previously decided by stable-sort luck) · `read-core` withholds Winkler + the Jones group and the 20-yr
normals when fidelity is `UNUSABLE` · gap-fill drops POWER when the archive is present · the card shows
the reason and its empty-states no longer say "load history" when the real reason is refusal · the
assistant tool carries `sourceFidelity` and a `refused` flag · `backfill-core` builds the long-term
normal from the corrected source · `ingest-core` no longer wipes `siteElevationM` on a transient miss.

**Live backfill result** — all 8 Bhutan vineyards, `primary=open_meteo_archive`, `siteElev == sourceElev`,
fidelity `OK`:

| site | before (POWER) | after (ERA5 @ site) |
|---|---|---|
| Bajo | Region **I** · GST 12.35 "Too cool" · fabricated April frosts | Region **V** · GST 22.82 "Very hot" · 0 frost |
| Gortshalu | Region I · 1,240 °C-days | Region **V** · 3,055 |
| Lingmethang | Region I · 1,240 (identical to Gortshalu) | Region **V** · 3,130 (now distinct) |
| Norzinthang | Region I · 1,240 (identical) | Region **V** · 2,960 (now distinct) |
| Paro | Region I · 318 | Region **II** · 1,465 |
| Pinsa | Region IV · 2,133 | Region **V** · 3,143 |
| Ser Bhum (2,773 m) | Region I · 655 (identical to Bajo) | Region **I** · 672 — correctly cool, and now distinct from Bajo |
| Yusipang (2,719 m) | Region I · 655 (identical) | Region **I** · 734 |

The observed/forecast discontinuity is closed: Bajo's stored observation for 2026-07-26 is now
31.7 °C / 20.5 °C against a forecast of 31.7 °C / 20.5 °C for the same date (it was 17.2 °C).

The old `nasa_power` rows were deliberately **kept** — they remain visible in the compare-sources view
and make the change reversible. They are no longer the headline.

**One thing to watch:** the guard proved itself mid-run. When Open-Meteo 429'd on Paro's history
request, ingest fell back to POWER and the card withheld Paro's classifications rather than showing the
old wrong ones. That is the intended failure mode, and it is why the refusal exists as well as the
provider swap. A retry now makes that path rare rather than expected.

---

## 6. Reproducing

```bash
npx tsx --env-file=.env scripts/probe-bhutan-temp-bias.ts
```

Read-only. Run from the main checkout (worktrees have no `.env`). ~3 min; hits NASA POWER and
Open-Meteo's public archive once per site.

**Sources for the external corroboration in §1:**
[climate-data.org — Wangdue Phodrang](https://en.climate-data.org/asia/bhutan/wangdue-phodrang-district/wangdue-phodrang-176824/) ·
[timeanddate.com — Wangdue Phodrang climate](https://www.timeanddate.com/weather/@1252395/climate)
