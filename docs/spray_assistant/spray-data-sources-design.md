# Spray Intelligence — Data Sources Design

**Status:** research record. Companion to the
[discovery brief](./spray-decision-discovery-brief.md) and the
[runbook](./SPRAY_ASSISTANT_RUNBOOK.md).
**Date:** 2026-07-26 · probes marked ✅ were run live on that date unless noted.

This document answers one question per row: **what data actually exists, what does it cost, and what
does it let us compute?** It exists so no phase plan re-derives a negative result.

---

## 1. The three findings that shape the program

1. **We have no humidity, no dew point, no hourly data, and no leaf wetness — anywhere.**
   `VineyardClimateDaily` carries exactly five numeric columns (`tmaxC`, `tminC`, `precipMm`,
   `rhMaxPct`, `rhMinPct`). The RH columns are plumbed end-to-end — types → `obs-time-core` →
   ingest SQL → `read-core` → server actions — and **every provider writes null to both.** All five
   `ClimateProvider` implementations declare `capabilities: ["tmax","tmin","precip"]`. Every weather
   table is keyed `@db.Date`. Consequence: every model in brief §7 except temperature-only
   Gubler-Thomas is currently unbuildable.
2. **Structured label values are not freely machine-readable.** EPA's PPLS API returns registration
   metadata and a link to the label PDF; rates, PHI, and REI live in the prose. Commercial providers
   (TELUS/CDMS, Agrian) sell structured label data. This is why plan 086 deferred label-value
   extraction and why S2 ships registration + resistance only.
3. **Registration and resistance data IS free and verified.** EPA APPRIL + CA DPR + UC IPM/extension
   derivation gets us legality and rotation without buying anything — the two things the rotation
   use case actually needs.

---

## 2. Weather — what we hold vs what we can get

### 2.1 Current state (as built, plan 096 / VI P8)

| Table | Grain | Columns |
|---|---|---|
| `VineyardClimateDaily` | `@db.Date` per provider | `tmaxC`, `tminC`, `precipMm`, `rhMaxPct` (null), `rhMinPct` (null), `dataStatus`, `provenance` |
| `VineyardForecastDaily` | `@db.Date` per provider | `tmaxC`, `tminC`, `precipMm`, `precipProbabilityPct`, `conditionCode`, `windMaxKph` |
| `VineyardWeatherConfig` | 1:1 per vineyard | primary provider + override, station + distance + elevation delta, `coverageState`, `timeZone`, `unitSystem`, NWS grid cache, alert thresholds |

Observation providers: `gridmet` (4 km CONUS via RCC-ACIS GridData grid 21), `rcc_acis` (station),
`nasa_power` (~50 km global), `daymet` (1 km NA, history), `noaa_cdo` (station, history).
Forecast providers: `nws` (US incl. AK/HI/territories), `open_meteo` (global).

**Why RH is null everywhere:**

| Provider | Reason |
|---|---|
| `gridmet` | ACIS GridData **grid 21 exposes `maxt`/`mint`/`pcpn` but not `rmax`/`rmin`** — verified live (`bad args`). A `withRh` normalizer flag exists and is never enabled. True gridMET RH needs a direct-gridMET adapter. |
| `nasa_power` | POWER's daily RH is a **mean**, not max/min |
| `rcc_acis`, `noaa_cdo` | COOP stations don't measure RH |
| `daymet` | hardcoded null |

### 2.2 The cheap unlock — NWS raw gridpoint ✅

`forecast-nws.ts` **already calls** `https://api.weather.gov/gridpoints/{office}/{x},{y}` to pull
`quantitativePrecipitation` (the `/forecast` endpoint carries probability only). That same response
also returns, as **hourly ISO8601-interval series**:

| Property | Confirmed |
|---|---|
| `temperature` | ✅ hourly (PT1H) |
| `relativeHumidity` | ✅ hourly |
| `dewpoint` | ✅ hourly |
| `windSpeed`, `skyCover`, `quantitativePrecipitation` | present in the same response (QPF already parsed by our adapter) |

**We are parsing one field out of a response that already contains the CART inputs.** Keyless,
User-Agent mandatory, US-only. This is S0's first probe and S1's first adapter.

### 2.3 Open-Meteo hourly + ERA5-Land archive ✅

`forecast-open-meteo.ts` calls `/v1/forecast` with **`daily=` parameters only**. The API's `hourly=`
parameter is unused and supplies `relative_humidity_2m`, `dew_point_2m`, `precipitation`,
`cloud_cover`, `wind_speed_10m`, `shortwave_radiation`, and soil-moisture layers. **No leaf-wetness
variable exists** — it must be estimated (§2.4).

Historical archive: ERA5 (0.25°, ~25 km, 1940→present), ~~**ERA5-Land (0.1°, ~11 km, 1950→present)**~~,
ECMWF IFS (9 km). Coarse for a single vineyard, but it is the only free hourly history for
non-US sites and for backfilling a season.

> ⚠️ **CORRECTED BY S0 (2026-07-26).** This section preferred **ERA5-Land** on resolution.
> **ERA5-Land carries NO WIND, NO PRECIPITATION, NO CLOUD COVER and NO RADIATION** — confirmed live
> at all five S0 fixture sites over a full week, not a spot check. CART is RH + dew-point depression
> + **wind**, so *the archive this document preferred cannot run the estimator this document
> prefers*. Worse, wind is a hard input to the **S7b legality gate** (labels dictate maximum wind
> speeds for drift), so a null-wind provider cannot support an application-window answer at all.
>
> **Use ERA5 (0.25°). Do not use ERA5-Land.** And fix the model explicitly — S0 measured `era5`
> versus Open-Meteo's `default` blend moving **50.6 %** of infection-event classifications, so
> "best match" is unusable for anything that will be replayed.
>
> Two further corrections to this section: `forecast-open-meteo.ts` **already sends `hourly=`** (plan
> 097 changed that), so S1's work there is three variables appended to an existing list; and
> Open-Meteo exposes **no issuance timestamp** on either endpoint, so `providerIssuedAt` is
> structurally unknowable for it. Evidence: [phases/s0-hourly-field-inventory.md](phases/s0-hourly-field-inventory.md).

The adapter already threads `OPEN_METEO_API_KEY` and `elevation=` downscaling — the commercial-tier
seam and the site-elevation correction are both in place.

### 2.4 Leaf wetness must be estimated — and the estimator is decided in S0

No provider supplies leaf wetness; no free gridded product does either. Estimation options:

| Model | Inputs | Note |
|---|---|---|
| **CART** (classification and regression tree) | RH, **dew-point depression**, wind speed | The recommended default. Few inputs, all available from §2.2/§2.3, and the literature reports a naive RH ≥ 90% threshold carrying roughly **40% more error**. Performs on both dew-eligible (20:00–09:00) and dew-ineligible periods. |
| RH ≥ 90% threshold | RH | Ship as the labeled-inferior fallback where wind or dew point is missing |
| Dew parameterization / neural-net / mechanistic | more inputs | Out of scope for v1 |

**There is no ground truth without an on-site sensor.** S0 therefore measures CART-vs-threshold
disagreement across a real season, fixes the confidence bands, and fixes the **refusal
threshold** — the point at which we return *unknown* rather than a wetness estimate. That decision
is an ADR, and it gates every model in brief §7 that consumes LWD.

### 2.5 Derived, free, and high-value

- **Delta T** (wet-bulb depression) — computable from temperature + RH alone. Best spray-quality
  signal available to us at zero data cost (brief §13).
- **Diurnal reconstruction** (sine, from daily Tmin/Tmax) — lets Gubler-Thomas run on today's daily
  data. Keep it even after hourly lands, for history before hourly ingest began.

### 2.6 NEWA — a validation oracle, not a dependency

NEWA (Cornell IPM + NRCC) already runs validated grape models: black rot, Phomopsis, powdery
mildew, grape berry moth, and grape cold hardiness. **No public developer API is documented** as of
this research; their weather comes from an IBM Environmental Intelligence Suite subscription plus
free NOAA forecasts, and full data access would be a partnership conversation. The underlying
station data is reachable via **NRCC/ACIS regardless** — which we already integrate.

**Posture:** build our own indices; use NEWA as a **human cross-check** where a NEWA station sits
near a Demo block, and record the comparison in the S5 phase report. Never a runtime dependency.

### 2.7 Storage economics — the open number

Hourly ingest is ~8,760 rows/vineyard/year minimum, before multiple providers. **S0 measures row
volume, index size, and read latency for S5/S6's actual query shapes, and produces a written
retention decision** (rolling window? hourly-for-N-days + daily rollup?). This is the single
measurement that could change the program's shape, which is why it is a Wave-0 gate and not an
implementation detail.

Note the existing precedent to reuse: `VineyardForecastDaily` is **replaced, never accumulated**
(delete the forward horizon, bulk insert), and the daily sweep prunes past target dates. Observed
hours need a different policy — they are history, not a horizon.

---

## 3. Pesticide registration and resistance

All rows below are from plan 086's live probing (2026-07-20) and were re-confirmed at the API level
2026-07-26. **Read [plan 086](../plans/2026-07-20-086-feat-us-pesticide-registration-plan.md) before
planning S2.**

| Source | Endpoint | Shape | Status |
|---|---|---|---|
| **EPA APPRIL** | `www3.epa.gov/pesticides/appril/apprildatadump_public.xlsx` | 98 MB xlsx, 366,579 × 31 | ✅ the registration backbone |
| **EPA PPLS (API)** | `ordspub.epa.gov/ords/pesticides/ppls/{company}-{product}` · `.../pplstxt/{name}` | JSON, refreshed twice daily | ✅ registration metadata + label PDF link — **not structured agronomic values** |
| **EPA PPLS (labels)** | `www3.epa.gov/pesticides/chem_search/ppls/{LABEL_NAMES}` | PDF with text layer | ✅ |
| **CA DPR** | `files.cdpr.ca.gov/pub/outgoing/product/` | 43 fixed-width `.dat`, nightly | ✅ the only free bulk state source verified working |
| **UC IPM** | `ipm.ucanr.edu` conventional + biologicals tables | trade-name-keyed, ~60 entries | ✅ **already a Tier-1 source in our corpus** |
| **Virginia Tech** | `pubs.ext.vt.edu/.../ENTO-635-C.pdf` | FRAC in prose, no table | ✅ LLM-extract + cite |
| **Cornell Table 3.2.1** | paid guide; 16 free preview rows | AI-keyed; premixes carry both codes | ⚠️ paywalled — upgrade path |
| **MSU E-154** | paid publication | AI→FRAC table | ⚠️ paywalled; free `/news/` articles carry FRAC in prose |
| **CDMS / TELUS, Agrian** | commercial APIs | structured label data incl. rates, MoA, RUP | 💲 the answer to §1.2 if we ever buy it |

### 3.1 Measured scale

2,509 distinct active registrations on grapes · **338 distinct active ingredients** · 144 in
fungicide products. Coverage curve: **top 60 AIs = 86.5%** of all product-AI occurrences. 62 AIs
(43%) appear in exactly one product, overwhelmingly **biologicals**. 317 grape rows have blank
`PEST_CAT` and would vanish from any class-filtered view — treat blank as `unknown`, never drop.

### 3.2 Negative results — do not re-discover these

- **Label-text FRAC scraping systematically drops the SDHI partner in premixes.** Luna 7+3 → 3 only;
  Miravis 7+12 → 12 only; Gavel M03+22 → none. Reliable for **single-AI products only.**
- **The label cannot answer state registration.** CDPR `prod_site.dat` shows Gavel 75DF and
  Fusilade DX both registered on `GRAPES, WINE` (status A) despite widespread claims otherwise.
- **CDPR `preharvest_interval.dat` / `reentry_interval.dat` are unit lookup tables** (D/H/M), not
  values. Do not plan around them.
- **Nassau/Suffolk detection** by `/Nassau|Suffolk/` caught 4/4 restricted products with zero false
  positives across four sentence structures — but Luna carries *"except as permitted under FIFRA
  24(c), Special Local Need registration,"* so **a binary banned flag is wrong.**
- **NY / OR / WA have no usable bulk source** — NYSPAD has no bulk export; PICOL's API is
  undocumented and probed 404. CA first.

### 3.3 Bulletins Live! Two

Where a label references it, the geographically specific EPA bulletin becomes an **enforceable
extension of the label** (endangered-species protections). Not yet probed for a machine-readable
feed. **S7 must at minimum surface "a Bulletin check is required for this product at this location
and date" as a hard stop the human must clear** — an unchecked bulletin is a *cannot-determine*, not
a pass.

---

## 4. Knowledge base — what's in, what's missing

The corpus is **global, with per-tenant subscriptions** (ADR 0007); 23 sources; `voyage-4` embeddings
at dim 1024; hybrid dense + lexical retrieval with RRF fusion and MMR diversification (λ 0.7);
fail-closed on subscriptions.

**Already carrying grape IPM/disease content:**

| Source | Relevance |
|---|---|
| `uc-ipm` (Tier 1, autoCrawl, monthly) | **The direct hit** — ~90 grape Pest Management Guideline topics: invertebrates, diseases, nematodes, weeds, vertebrates, year-round IPM program, monitoring supplements. Its own config comment: *"FRESHNESS IS SAFETY-RELEVANT here… registrations get cancelled and REIs/resistance ratings change."* |
| `cornell-grapes` (Tier 1) | Eastern-US IPM; the Wilcox *Grape Disease Control* PDF is a named retrieval target |
| `mapa` (Tier 1) | Official Spanish integrated-pest-management guide for wine grapes (203 pp) |
| `wsu`, `osu-extension`, `osu-owri` | Pacific NW viticulture, leafroll virus + mealybug monitoring |
| `awri`, `wine-australia` | Warm-climate viticulture, downy mildew |
| `vt-enology-notes` | Rot chemistry, canopy management (enology notes; the pest guide is a separate pub) |

**Gaps (→ SKB):** **Penn State Extension** grape disease/IPM is absent and is the East's other
primary authority. **NEWA model documentation** is absent. **Virginia Tech's pest guide**
(ENTO-635-C) is distinct from the enology notes we crawl. **MSU Extension is registered but
dormant** — `autoCrawl:false`, `defaultEnabled:false`, blocked by Imperva/Incapsula from both
residential and GitHub Actions IPs — and it is exactly the cold-climate coverage this program wants.

### 4.1 Two hard constraints on adding sources

- **Capture the `verify:kb-register` displacement baseline BEFORE adding.** `verify:knowledge-base`
  scores *recall* — it passes when one expected doc appears anywhere in top-k and never inspects the
  other slots, and its documented response to a displaced expectation is to widen `expectPaths`.
  Meanwhile MMR at λ 0.7 structurally advantages a distinct-register source. Only
  `verify:kb-register` measures which publisher won each slot.
- **Licensing:** every source except IVES (CC BY) rests on an absence of objection. Record each new
  source's posture in `KnowledgeSource.license`. **The licensing ADR was declined — do not
  re-propose it.**

### 4.2 The boundary (restated because it matters most)

**Registration, FRAC codes, rates, PHI/REI, and interlocks do not go in the corpus.** Plan 086's
load-bearing decision: *"pesticide registration is structured data queried by exact match, not prose
queried by similarity."* The corpus answers *"why is powdery pressure high this week."* The
relational layer answers *"can I legally apply this."*

Two mechanical reasons this is not just philosophy: `extract/pdf.ts` emits no pipe tables and no
headings, so a label PDF becomes one segment with a garbage breadcrumb and ~40–45% header/row
separation with zero overlap; and **no ANN index exists on `knowledge_chunk.embedding`** — every
dense query is a sequential scan, with a scale-register tripwire around 10k chunks. Adding ~12,500
label chunks would spend that budget on the one content type least suited to similarity search.

---

## 5. What we would buy, and when

Nothing is required for the program as scoped. Two documented upgrade paths, both the user's call:

1. **Cornell Crop and Pest Management Guidelines** — plan 086 measured that its value concentrates
   in **biologicals**: it codes Stargus, LifeGard, Theia, and Romeo, none of which appear on either
   free UC IPM page, and which made up 4 of the 6 measured derivation misses. Cheapest way to close
   the biologicals gap. Note that Cornell **paused the 2026 edition** pending a 2027 relaunch — plan
   around the 2025 NY/PA guide.
2. **CDMS/TELUS or Agrian structured label API** — the only realistic route to machine-readable
   rates, PHI, and REI at scale, i.e. the thing that would unlock plan 086's deferred Phase 2. Do
   not scope it in until a phase actually needs label values.

---

## 6. Provider hygiene (carry into every adapter)

- All outbound fetches go through the **SSRF-guarded** edge (`src/lib/weather/providers/fetch-util.ts`)
  with the provider host on the allowlist in `src/lib/weather/config.ts`.
- **Per-provider quota telemetry** extends the existing `WeatherProviderUsage` daily-keyed counter
  (NOAA CDO's cap is 10k/**day**, which is why the key is daily).
- NWS requires a **User-Agent**; Open-Meteo requires **CC BY 4.0 attribution**; Copernicus/ERA5
  attribution rides the provenance path.
- **Node does not do AIA fetching** — a publisher serving only its leaf certificate loads in a
  browser and dies in the crawler with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Use
  `src/lib/knowledge/crawl/tls.ts`; always spread `tls.rootCertificates` (undici's `connect.ca`
  *replaces* the default store). Never `rejectUnauthorized:false`.
- **404 is a coverage signal, never a retry** (plan 096 lesson).
- A `fetchDocument` **throw is not "removed"** — treating it as such mass-tombstones a source
  (plan 085 lesson; inherit their fix, do not write a second one).

---

## 7. Sources cited in this document

- [EPA — Introduction to Pesticide Labels](https://www.epa.gov/pesticide-labels/introduction-pesticide-labels)
- [EPA — PPLS Application Program Interface](https://epa.gov/pesticide-labels/pesticide-product-label-system-ppls-application-program-interface-api)
- [EPA — Bulletins Live! Two](https://www.epa.gov/endangered-species/bulletins-live-two-view-bulletins)
- [EPA — Reducing pesticide drift / improving labels](https://www.epa.gov/reducing-pesticide-drift/improving-labels-reduce-pesticide-drift)
- [EPA — Pollinator protection](https://www.epa.gov/pollinator-protection)
- [EPA — JMS Stylet-Oil label (065564-00001)](https://www3.epa.gov/pesticides/chem_search/ppls/065564-00001-20110719.pdf)
- [Open-Meteo — Historical Weather API (ERA5 / ERA5-Land)](https://open-meteo.com/en/docs/historical-weather-api)
- [NWS API — gridpoint forecast](https://api.weather.gov/)
- [NEWA — grape disease models](https://www.newa.cornell.edu/grape-diseases)
- [NEWA — grape berry moth](https://newa.cornell.edu/grape-berry-moth/)
- [NEWA — grape ripe rot](https://www.newa.cornell.edu/grape-ripe-rot/)
- [Cornell — grapevine powdery mildew fact sheet](https://cals.cornell.edu/integrated-pest-management/outreach-education/fact-sheets/grapevine-powdery-mildew-erysiphe-necator-fruit-fact-sheet)
- [Cornell — grapevine downy mildew fact sheet](https://cals.cornell.edu/integrated-pest-management/grapevine-downy-mildew-plasmopara-viticola-fruit-fact-sheet)
- [Cornell — sour rot alternative management](https://cals.cornell.edu/news/2026/05/sour-rot-grapes-alternative-management-strategies-update)
- [Cornell — 2025 Grape Guide preview](https://cropandpestguides.cce.cornell.edu/Preview/2025/2025_Grape_Guide_Preview.pdf)
- [Cornell — grape pathology updates](https://blogs.cornell.edu/goldlab/grape-pathology-extension/grape-pathology-updates-for-2025/)
- [Cornell — flooding and wet conditions, weed management](https://cals.cornell.edu/weed-science/herbicides/effects-of-flooding-and-wet-conditions-weed-management)
- [Penn State — black rot](https://extension.psu.edu/grape-disease-black-rot)
- [Penn State — botrytis bunch rot](https://extension.psu.edu/botrytis-bunch-rot-on-grapes-in-home-gardens)
- [Penn State — herbicide drift and drift-related damage](https://extension.psu.edu/herbicide-drift-and-drift-related-damage)
- [MSU — disease control during rainy spells](https://www.canr.msu.edu/news/the_challenges_of_disease_control_during_rainy_spells_1)
- [MSU — late-season fungicide sprays and fermentation](https://www.canr.msu.edu/news/late_season_fungicide_sprays_in_grapes_and_potential_effects_on_fermentatio)
- [NRCCA — herbicide behavior in soil](https://nrcca.cals.cornell.edu/pest/CA2/CA0220.php)
- [FRAC — fungicide resistance management](https://www.frac.info/fungicide-resistance-management)
- [eCFR 7 CFR 205.601 — organic synthetic substances](https://www.ecfr.gov/current/title-7/subtitle-B/chapter-I/subchapter-M/part-205/subpart-G/subject-group-ECFR0ebc5d139b750cd/section-205.601)
- [APS — site-specific leaf wetness duration model](https://apsjournals.apsnet.org/doi/10.1094/PDIS.2002.86.2.179)
- [Suitability of relative humidity as an estimator of leaf wetness duration](https://www.sciencedirect.com/science/article/abs/pii/S0168192307002614)
- [CDMS / TELUS Agriculture — crop input API](https://www.cdms.net/)
