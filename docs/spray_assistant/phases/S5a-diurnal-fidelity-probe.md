# S5a Unit 0 — Diurnal reconstruction fidelity probe

**Deliverable of PR 0. No production code.** This is the phase's pre-committed gate:
whether an hourly temperature curve reconstructed from daily Tmin/Tmax resolves
Gubler-Thomas's derived quantities well enough to ship an index, *per site regime*.

**Run date:** 2026-07-27  
**Seasons:** 2020–2025, in-season window 04-01 to 09-30  
**Reconstruction:** Felber, Stoeckli & Calanca 2018 Eq. 1a–1c (generic a=2.71, b=3.14, c=0.75), with a Sanders sawtooth as the control  
**Oracle:** genuine station hourly METAR via the Iowa Environmental Mesonet ASOS archive, per council C2. ERA5 appears only where no station exists, and is labelled consistency-only.

---

## The gate, fixed before the run

| Gate | Threshold | What it protects against |
|---|---|---|
| **G1 unsafe-miss** (BINDING) | ≤ 2% | The model under-calling a real epidemic. This is the crop-loss direction. |
| **G2 coverage** | ≥ 80% | Refusal buying a pass. A model that rarely answers is rarely wrong. |
| **G3 agreement** | point ≥ 90%, band ≥ 95% | Ordinary inaccuracy. |
| **G4 statistical adequacy** | ≥ 3 full seasons/site, Wilson CIs on every rate | A site passing on thin data. |

Evaluated **per site, never averaged**. A regime-specific refusal is a legitimate outcome
(the ADR 0012 precedent), not a failed phase.

---

## Verdict

### ⛔ NO SITE PASSES. The pre-committed no-go triggers.

Per the plan's own outcome ladder: **S5a ships the ledger only, and the index moves to S5b behind S1.**

| Site | Oracle tier | G1 unsafe-miss | G2 coverage | G3 agreement | G4 seasons | Verdict |
|---|---|---|---|---|---|---|
| Russian River Ranch | station_hourly | **FAIL** | PASS | **FAIL** | PASS (6) | **FAIL** |
| Stoney Hill | station_hourly | PASS | PASS | **FAIL** | PASS (6) | **FAIL** |
| Madera | station_hourly | **FAIL** | PASS | **FAIL** | PASS (6) | **FAIL** |
| Oakville Estate | station_degraded | **FAIL** | PASS | **FAIL** | PASS (6) | **FAIL** |
| WV Oregon | station_degraded | **FAIL** | PASS | **FAIL** | PASS (6) | **FAIL** |
| Ojai | consistency_only | **FAIL** | PASS | **FAIL** | PASS (6) | **FAIL** |
| Bhutan Bajo | consistency_only | **FAIL** | PASS | **FAIL** | PASS (6) | **FAIL** |
| Bhutan Gortshalu | consistency_only | **FAIL** | PASS | **FAIL** | PASS (6) | **FAIL** |

---

## Oracle map — which arm produced each site's number

Council C2: a reconstruction validated against reanalysis yields an agreement statistic
between two models, presented as empirical fidelity. Each row therefore declares its arm.

| Site | Tier | Oracle | Why |
|---|---|---|---|
| Russian River Ranch | `station_hourly` | station hourly METAR — Santa Rosa Sonoma Co AP (STS), 3.7 km, +13 m | 3.7 km, +13 m. The best oracle in the fleet, and the site S0 flagged as a weather-lane failure — so the two measurements are directly comparable. |
| Stoney Hill | `station_hourly` | station hourly METAR — Doylestown Airport (DYL), 9.8 km, +44 m | 9.8 km, +44 m. Eastern regime — the one ADR 0012 left open for S1. |
| Madera | `station_hourly` | station hourly METAR — Madera Municipal (MAE), 17.4 km, -6 m | 17.4 km, -6 m, flat valley floor. S0's safety inversion site: lowest refusal rate, worst inputs. |
| Oakville Estate | `station_degraded` | station hourly METAR — Napa County (APC), 28.1 km, -41 m | Napa County (28.1 km) is chosen over the marginally nearer Petaluma (26.4 km) on meteorological grounds: APC sits in the SAME Napa valley on the same marine-intrusion path, Petaluma is over a ridge in a different air mass. Nearest is not always most comparable. |
| WV Oregon | `station_degraded` | station hourly METAR — McMinnville Municipal (MMV), 37 km, -58 m | 37 km, -58 m. Willamette Valley floor vs a site in the coastal foothills. |
| Ojai | `consistency_only` | station hourly METAR — Oxnard (OXR), 27.1 km, -256 m | 27.1 km but -255 m AND coastal-vs-inland-valley. Ojai sits behind the Topatopa range in a thermal belt; Oxnard is on the beach. This is not the same climate, so its number is consistency, not fidelity. |
| Bhutan Bajo | `consistency_only` | ERA5 reanalysis (Open-Meteo archive) — CONSISTENCY ONLY, not observation | Nearest ASOS is Paro (VQPR) 48 km away at 2235 m — 1,005 m ABOVE the vineyard. Comparing a valley vineyard to a mountain airport measures the lapse rate, not the reconstruction. No fidelity arm exists for this site. |
| Bhutan Gortshalu | `consistency_only` | ERA5 reanalysis (Open-Meteo archive) — CONSISTENCY ONLY, not observation | Nearest ASOS is Guwahati 135 km away on the Assam plain at 54 m — 783 m below and in a different climate zone. No fidelity arm exists for this site. |

**The station map is itself a finding.** Fidelity is not evenly available across the fleet:
three sites have a genuinely comparable station, two are degraded, and the two Bhutan sites
have none at all — the nearest ASOS to Bajo sits 1,005 m above the vineyard.

---

## Why it failed, and why the failure is structural

The obvious reading of a failed gate is "pick a better estimator or tune the parameters".
Four independent lines in this run say that is not available.

**1. The control performs about as well as the sophisticated model.** Sanders sawtooth tracks
Felber within a few points of daily agreement at every station-oracle site. Reicosky et al.
1989 reported exactly this. If a piecewise-linear ramp is competitive with a calibrated
sine-plus-exponential forced through both extremes, the limiting factor is not the curve.

**2. Our sites violate the model's assumptions far LESS than the sites it was calibrated on.**
Felber measured Tmin in the afternoon on 27% of days and Tmax outside the midday window on
13%. Our station sites run 0.2–1.4% and 0.4–6.6%. The shape assumption holds *better* here
than in Switzerland, and the index still fails. The error is not coming from bad days.

**3. The derived quantity is simply not resolvable.** Consecutive-hours-in-band MAE lands at
2.2–3.4 h across the station-oracle sites. The rule that drives the entire index asks whether
that count is at least **6**. An estimator whose error is half the threshold cannot answer the
question, and a 30-point swing (+20 to −10) hangs on it.

**4. Savalkar's mitigation does not transfer.** Injecting monthly station statistics reduced
error by >75% in that paper — for *chill accumulation*, a smooth accumulator. Fit here on
held-out seasons it moved nothing at the station-oracle sites and made Stoney Hill worse.
That is the plan's §1.2 thesis confirmed by measurement: Gubler-Thomas is a narrow-window
threshold counter, structurally the sunburn / Chill-Portions case, not the GDD case. The
repo's existing weather math (`gdd-core`, `normals-core`, `stage-core`) lives in the forgiving
class. This index does not.

### The error is not in the safe direction

A high-running index would have been survivable — it over-sprays, which costs money and
resistance pressure but not fruit. That is not what the data shows. The binding G1 gate
measures the *opposite* direction: days the station says are epidemic-threshold and the model
calls quieter. Six of eight sites breach the 2% bar, Madera worst at 13.6% — roughly one
missed epidemic day in seven, at the site S0 already flagged for reporting its highest
confidence on its worst inputs.

### Bhutan: there is nothing to measure against, and the data is offset

Gemini's D-5 objection is upheld, and more sharply than predicted. There is no station
oracle within reach of either Bhutan site, so no fidelity arm exists at all. The ERA5
consistency arm then shows the raw reconstruction and ERA5 disagreeing on essentially every
day — until a monthly additive correction is applied, after which they agree almost perfectly.

**That jump is not a pass. It is the finding.** The correction is removing a mean absolute
monthly offset of **9.26 °C at Bajo and 8.16 °C at Gortshalu**. For comparison, the US
station-oracle sites sit at 0.31–1.44 °C. Two gridded products, sampled at the same
coordinates, disagree about the temperature of these vineyards by nearly nine degrees.

A ~9 °C gap is what a ~1.3 km elevation difference buys you at a normal lapse rate, which is
exactly the grid-cell-mean-elevation mismatch Gemini predicted for Himalayan terrain. The
probe cannot say which product is closer to the vineyard — that is precisely what having no
station oracle means — only that they cannot both be right, and that the 21–30 °C band is
narrower than the disagreement. Two coarse grids agreeing on *shape* once you subtract their
disagreement on *level* is the model-validated-against-model artifact council C2 warned
about, in its purest form.

**The index must be explicitly disabled for this tenant**, not quietly wrong. This also
deserves escalation beyond S5a: an 8–9 °C uncertainty on the daily series is a live
data-quality question for every temperature-derived number already shown to that grower.

> [!success] ✅ RESOLVED 2026-07-27 (PR #536) — and it was NOT a coin-flip after all
> The escalation above was right to fire, and its central claim — *"the probe cannot say which
> product is closer to the vineyard"* — turned out to be **answerable, just not from inside this
> probe**. NASA POWER publishes the elevation of the grid cell it answered with, in
> `geometry.coordinates[2]`, and the adapter was discarding it. **At Bajo that cell sits at
> 3,038 m; the vineyard is at 1,229 m.** Re-sampling ERA5 at POWER's *own* reported cell elevation
> collapsed the bias from **−9.71 °C to +1.80 °C** across all eight sites, at a 4.7–6.1 °C/km lapse
> rate. **Elevation explained essentially all of it.** The two products were never disagreeing about
> the weather; they were describing two different altitudes.
>
> Fixed in two parts, because either alone would have been wrong: an ERA5 archive provider that
> passes `elevation=` (the correction `forecast-open-meteo.ts` already made), plus
> `source-fidelity-core` — when a source's own reported elevation is >300 m off the site, the
> **hard-boundary classifications are withheld rather than mislabelled**, while the raw series, GDD
> and GST still render. Winkler classes are ~278 °C-days wide against a ~214-day season, so 1 °C
> moves the label; there is no "approximately right" region. A provider that publishes no elevation
> yields UNKNOWN and still classifies — the guard bites where there is evidence, not everywhere
> evidence is absent.
>
> Bajo went Region I "too cool" with fabricated April frosts → **Region V "very hot", zero frosts**,
> and its stored observation for 2026-07-26 now matches the forecast exactly (31.7 / 20.5 °C). Three
> Bhutan sites that had read as identical Region I are now distinct. The `nasa_power` rows were kept
> as a second source, so it is reversible.
>
> **This does NOT reopen the index NO-GO.** Bhutan was `consistency_only` tier and the plan already
> forbade resting any production confidence claim on it; the gate is evaluated **per site, never
> averaged**; and the six US sites failed independently against *genuine station METAR*. The Bhutan
> arm was never evidence for the verdict — it was an artifact the probe reported honestly, and that
> honesty is what surfaced a real live-tenant data bug.
>
> ⚠️ **If you re-run this probe, the Bhutan rows will differ.** Bhutan's effective primary is no
> longer `nasa_power`, and the committed 2024 fixtures under `test/fixtures/s5a/` are POWER-based.

---

## What this licenses

Per the plan's pre-committed outcome ladder, with every site failing and the mitigation arm
lifting no site over the bar:

> **S5a ships the ledger only, and the index moves to S5b behind S1.**

Concretely:

1. **Units 3 and 4 (`diurnal-core.ts`, `powdery-core.ts`) do not ship as a risk engine.** The
   plan made them explicitly contingent on this measurement and the measurement says no.
2. **The latent-infection ledger (Units 1, 2, 5) ships as planned.** It never depended on the
   index — it is the durable half, and building it before S5b has consumers is the cheap
   moment (plan §1, KD-3).
3. **`query_spray_decision` still lands thin and hard-refusing** (Unit 7). With no index it
   refuses more, which is the honest behaviour, not a degraded one.
4. **S1 is now load-bearing for powdery mildew, not just for leaf wetness.** ADR 0012 narrowed
   S1's LWD to eastern regimes; this probe adds that even the temperature-only half of
   Gubler-Thomas needs real hourly data. The runbook's "buildable on today's daily data via
   diurnal reconstruction" premise is now measured false and must be corrected (KD-10).
5. **The refusal is regime-independent.** ADR 0012 could narrow S1 to eastern sites because the
   failure split cleanly by regime. This one does not split: the best oracle in the fleet
   (Russian River, 3.7 km) scores *worse* than a 9.8 km one. There is no subset to ship to.

---

## Russian River Ranch

- Oracle: station hourly METAR — Santa Rosa Sonoma Co AP (STS), 3.7 km, +13 m
- Daily extremes provider: `gridmet` — **SUBSTITUTED.** Production's effective primary here is `rcc_acis`, which has under three seasons of history, so there was nothing to measure on it. This row is indicative of the regime, not of the exact production input.
- In-season days available: **1098**; oracle-decidable: **1093**
- Full seasons (≥120 decidable in-season days): **6** — 2020, 2021, 2022, 2023, 2024, 2025
- Days the oracle itself saw ≥35 °C: 7.0% [5.7–8.7] (77/1093)

**Assumption violations (Felber measured 27% / 13%; these are OUR sites):**

- Tmin occurred in the afternoon (12:00–20:00): 0.2% [0.1–0.7] (2/1093)
- Tmax occurred before noon or after 20:00: 0.5% [0.2–1.1] (5/1093)

These are **not fixable by recalibration** — they are days on which the model's shape
assumption is simply false.

| Arm | Point-delta agreement | Band agreement | Unsafe-miss (G1) | Coverage | Consec-hours MAE | Index MAE |
|---|---|---|---|---|---|---|
| Felber et al. 2018 (a=2.71, b=3.14, c=0.75) | 64.3% [61.4–67.1] (702/1092) | 78.9% [76.4–81.3] (862/1092) | 4.9% [3.6–6.7] (38/773) | 99.9% [99.5–100.0] (1097/1098) | 2.86 h | 14.7 pts |
| Sanders sawtooth (control) | 60.3% [57.4–63.2] (659/1092) | 72.1% [69.3–74.6] (787/1092) | 16.9% [14.5–19.8] (131/773) | 99.9% [99.5–100.0] (1097/1098) | 2.73 h | 21.0 pts |
| Felber + Savalkar monthly station-statistics correction (held-out seasons) | 63.0% [58.8–66.9] (345/548) | 81.0% [77.5–84.1] (444/548) | 7.3% [5.2–10.2] (30/411) | 100.0% [99.3–100.0] (549/549) | 2.70 h | 14.4 pts |

**Stratified by sky condition** (Reicosky 1989: all methods work on clear days and
struggle on overcast ones; an aggregate number hides this):

- clear days (cloud fraction < 0.3): 63.8% [60.6–66.8] (588/922)
- overcast days (cloud fraction ≥ 0.7): 69.0% [54.0–80.9] (29/42)

**Systematic offset removed by the Savalkar arm:** mean |monthly bias| = **0.67 °C**. Small — so the raw agreement figures above reflect curve shape, not a level offset.

**Peduto et al. 2013 heat term** (measured, never shipped — KD-2): would have changed the heat verdict on 0.0% [0.0–0.3] (0/1097) of decidable days.

---

## Stoney Hill

- Oracle: station hourly METAR — Doylestown Airport (DYL), 9.8 km, +44 m
- Daily extremes provider: `gridmet` (the effective primary — the same read production performs)
- In-season days available: **1098**; oracle-decidable: **1092**
- Full seasons (≥120 decidable in-season days): **6** — 2020, 2021, 2022, 2023, 2024, 2025
- Days the oracle itself saw ≥35 °C: 2.9% [2.1–4.1] (32/1092)

**Assumption violations (Felber measured 27% / 13%; these are OUR sites):**

- Tmin occurred in the afternoon (12:00–20:00): 1.4% [0.8–2.3] (15/1092)
- Tmax occurred before noon or after 20:00: 6.3% [5.0–7.9] (69/1092)

These are **not fixable by recalibration** — they are days on which the model's shape
assumption is simply false.

| Arm | Point-delta agreement | Band agreement | Unsafe-miss (G1) | Coverage | Consec-hours MAE | Index MAE |
|---|---|---|---|---|---|---|
| Felber et al. 2018 (a=2.71, b=3.14, c=0.75) | 77.6% [75.1–80.0] (847/1091) | 92.9% [91.3–94.3] (1014/1091) | 1.9% [1.2–3.0] (16/855) | 99.9% [99.5–100.0] (1097/1098) | 3.40 h | 5.5 pts |
| Sanders sawtooth (control) | 78.6% [76.0–80.9] (857/1091) | 89.3% [87.3–91.0] (974/1091) | 7.6% [6.0–9.6] (65/855) | 99.9% [99.5–100.0] (1097/1098) | 3.40 h | 7.9 pts |
| Felber + Savalkar monthly station-statistics correction (held-out seasons) | 73.8% [69.9–77.3] (402/545) | 88.8% [85.9–91.2] (484/545) | 5.6% [3.8–8.1] (25/448) | 100.0% [99.3–100.0] (549/549) | 3.58 h | 8.0 pts |

**Stratified by sky condition** (Reicosky 1989: all methods work on clear days and
struggle on overcast ones; an aggregate number hides this):

- clear days (cloud fraction < 0.3): 76.6% [73.4–79.5] (560/731)
- overcast days (cloud fraction ≥ 0.7): 74.3% [65.6–81.5] (84/113)

**Systematic offset removed by the Savalkar arm:** mean |monthly bias| = **0.31 °C**. Small — so the raw agreement figures above reflect curve shape, not a level offset.

**Peduto et al. 2013 heat term** (measured, never shipped — KD-2): would have changed the heat verdict on 1.8% [1.2–2.8] (20/1097) of decidable days.

---

## Madera

- Oracle: station hourly METAR — Madera Municipal (MAE), 17.4 km, -6 m
- Daily extremes provider: `gridmet` (the effective primary — the same read production performs)
- In-season days available: **1098**; oracle-decidable: **1091**
- Full seasons (≥120 decidable in-season days): **6** — 2020, 2021, 2022, 2023, 2024, 2025
- Days the oracle itself saw ≥35 °C: 42.3% [39.4–45.3] (462/1091)

**Assumption violations (Felber measured 27% / 13%; these are OUR sites):**

- Tmin occurred in the afternoon (12:00–20:00): 0.3% [0.1–0.8] (3/1091)
- Tmax occurred before noon or after 20:00: 0.4% [0.1–0.9] (4/1091)

These are **not fixable by recalibration** — they are days on which the model's shape
assumption is simply false.

| Arm | Point-delta agreement | Band agreement | Unsafe-miss (G1) | Coverage | Consec-hours MAE | Index MAE |
|---|---|---|---|---|---|---|
| Felber et al. 2018 (a=2.71, b=3.14, c=0.75) | 77.0% [74.4–79.4] (839/1090) | 79.7% [77.2–82.0] (869/1090) | 13.6% [10.9–17.0] (66/484) | 99.9% [99.5–100.0] (1097/1098) | 2.20 h | 11.4 pts |
| Sanders sawtooth (control) | 66.2% [63.4–69.0] (722/1090) | 58.2% [55.2–61.1] (634/1090) | 9.5% [7.2–12.4] (46/484) | 99.9% [99.5–100.0] (1097/1098) | 2.51 h | 29.7 pts |
| Felber + Savalkar monthly station-statistics correction (held-out seasons) | 78.8% [75.2–82.0] (428/543) | 75.9% [72.1–79.3] (412/543) | 18.8% [14.3–24.2] (45/240) | 100.0% [99.3–100.0] (549/549) | 2.00 h | 12.9 pts |

**Stratified by sky condition** (Reicosky 1989: all methods work on clear days and
struggle on overcast ones; an aggregate number hides this):

- clear days (cloud fraction < 0.3): 76.9% [74.1–79.4] (744/968)
- overcast days (cloud fraction ≥ 0.7): 69.2% [42.4–87.3] (9/13)

**Systematic offset removed by the Savalkar arm:** mean |monthly bias| = **0.32 °C**. Small — so the raw agreement figures above reflect curve shape, not a level offset.

**Peduto et al. 2013 heat term** (measured, never shipped — KD-2): would have changed the heat verdict on 6.7% [5.4–8.4] (74/1097) of decidable days.

---

## Oakville Estate

- Oracle: station hourly METAR — Napa County (APC), 28.1 km, -41 m
- Daily extremes provider: `gridmet` (the effective primary — the same read production performs)
- In-season days available: **1098**; oracle-decidable: **1068**
- Full seasons (≥120 decidable in-season days): **6** — 2020, 2021, 2022, 2023, 2024, 2025
- Days the oracle itself saw ≥35 °C: 2.3% [1.6–3.4] (25/1068)

**Assumption violations (Felber measured 27% / 13%; these are OUR sites):**

- Tmin occurred in the afternoon (12:00–20:00): 0.0% [0.0–0.4] (0/1068)
- Tmax occurred before noon or after 20:00: 0.4% [0.1–1.0] (4/1068)

These are **not fixable by recalibration** — they are days on which the model's shape
assumption is simply false.

| Arm | Point-delta agreement | Band agreement | Unsafe-miss (G1) | Coverage | Consec-hours MAE | Index MAE |
|---|---|---|---|---|---|---|
| Felber et al. 2018 (a=2.71, b=3.14, c=0.75) | 54.9% [51.9–57.9] (586/1067) | 62.6% [59.7–65.5] (668/1067) | 18.8% [16.1–21.7] (139/741) | 99.9% [99.5–100.0] (1097/1098) | 3.47 h | 32.4 pts |
| Sanders sawtooth (control) | 61.3% [58.3–64.2] (654/1067) | 79.2% [76.7–81.5] (845/1067) | 3.6% [2.5–5.2] (27/741) | 99.9% [99.5–100.0] (1097/1098) | 2.84 h | 18.4 pts |
| Felber + Savalkar monthly station-statistics correction (held-out seasons) | 57.4% [53.1–61.5] (303/528) | 65.0% [60.8–68.9] (343/528) | 6.8% [4.5–10.0] (22/325) | 100.0% [99.3–100.0] (549/549) | 2.96 h | 29.2 pts |

**Stratified by sky condition** (Reicosky 1989: all methods work on clear days and
struggle on overcast ones; an aggregate number hides this):

- clear days (cloud fraction < 0.3): 55.0% [51.7–58.1] (510/928)
- overcast days (cloud fraction ≥ 0.7): 62.1% [44.0–77.3] (18/29)

**Systematic offset removed by the Savalkar arm:** mean |monthly bias| = **1.44 °C**. Moderate — enough to shift band boundaries, but the raw agreement figures still mostly reflect curve shape.

**Peduto et al. 2013 heat term** (measured, never shipped — KD-2): would have changed the heat verdict on 0.0% [0.0–0.3] (0/1097) of decidable days.

> Oracle is a degraded-fidelity station (distance and/or elevation). Treat the numbers as indicative.

---

## WV Oregon

- Oracle: station hourly METAR — McMinnville Municipal (MMV), 37 km, -58 m
- Daily extremes provider: `gridmet` — **SUBSTITUTED.** Production's effective primary here is `rcc_acis`, which has under three seasons of history, so there was nothing to measure on it. This row is indicative of the regime, not of the exact production input.
- In-season days available: **1098**; oracle-decidable: **1055**
- Full seasons (≥120 decidable in-season days): **6** — 2020, 2021, 2022, 2023, 2024, 2025
- Days the oracle itself saw ≥35 °C: 5.0% [3.9–6.5] (53/1055)

**Assumption violations (Felber measured 27% / 13%; these are OUR sites):**

- Tmin occurred in the afternoon (12:00–20:00): 0.4% [0.1–1.0] (4/1055)
- Tmax occurred before noon or after 20:00: 1.4% [0.9–2.3] (15/1055)

These are **not fixable by recalibration** — they are days on which the model's shape
assumption is simply false.

| Arm | Point-delta agreement | Band agreement | Unsafe-miss (G1) | Coverage | Consec-hours MAE | Index MAE |
|---|---|---|---|---|---|---|
| Felber et al. 2018 (a=2.71, b=3.14, c=0.75) | 69.4% [66.6–72.2] (732/1054) | 82.5% [80.1–84.7] (870/1054) | 13.2% [10.8–16.0] (87/661) | 99.9% [99.5–100.0] (1097/1098) | 2.68 h | 13.1 pts |
| Sanders sawtooth (control) | 66.1% [63.2–68.9] (697/1054) | 78.0% [75.4–80.4] (822/1054) | 21.6% [18.7–24.9] (143/661) | 99.9% [99.5–100.0] (1097/1098) | 2.65 h | 17.1 pts |
| Felber + Savalkar monthly station-statistics correction (held-out seasons) | 66.7% [62.6–70.7] (345/517) | 81.8% [78.3–84.9] (423/517) | 16.5% [13.0–20.7] (59/357) | 100.0% [99.3–100.0] (549/549) | 2.74 h | 15.4 pts |

**Stratified by sky condition** (Reicosky 1989: all methods work on clear days and
struggle on overcast ones; an aggregate number hides this):

- clear days (cloud fraction < 0.3): 66.5% [63.0–69.8] (490/737)
- overcast days (cloud fraction ≥ 0.7): 69.0% [57.5–78.6] (49/71)

**Systematic offset removed by the Savalkar arm:** mean |monthly bias| = **0.53 °C**. Small — so the raw agreement figures above reflect curve shape, not a level offset.

**Peduto et al. 2013 heat term** (measured, never shipped — KD-2): would have changed the heat verdict on 0.0% [0.0–0.3] (0/1097) of decidable days.

> Oracle is a degraded-fidelity station (distance and/or elevation). Treat the numbers as indicative.

---

## Ojai

- Oracle: station hourly METAR — Oxnard (OXR), 27.1 km, -256 m
- Daily extremes provider: `gridmet` — **SUBSTITUTED.** Production's effective primary here is `rcc_acis`, which has under three seasons of history, so there was nothing to measure on it. This row is indicative of the regime, not of the exact production input.
- In-season days available: **1098**; oracle-decidable: **1067**
- Full seasons (≥120 decidable in-season days): **6** — 2020, 2021, 2022, 2023, 2024, 2025
- Days the oracle itself saw ≥35 °C: 0.1% [0.0–0.5] (1/1067)

**Assumption violations (Felber measured 27% / 13%; these are OUR sites):**

- Tmin occurred in the afternoon (12:00–20:00): 0.6% [0.3–1.2] (6/1067)
- Tmax occurred before noon or after 20:00: 7.5% [6.1–9.2] (80/1067)

These are **not fixable by recalibration** — they are days on which the model's shape
assumption is simply false.

| Arm | Point-delta agreement | Band agreement | Unsafe-miss (G1) | Coverage | Consec-hours MAE | Index MAE |
|---|---|---|---|---|---|---|
| Felber et al. 2018 (a=2.71, b=3.14, c=0.75) | 50.4% [47.4–53.4] (537/1066) | 36.3% [33.5–39.2] (387/1066) | 30.0% [25.2–35.3] (93/310) | 99.9% [99.5–100.0] (1097/1098) | 4.62 h | 50.4 pts |
| Sanders sawtooth (control) | 53.8% [50.8–56.8] (574/1066) | 50.6% [47.6–53.6] (539/1066) | 2.9% [1.5–5.4] (9/310) | 99.9% [99.5–100.0] (1097/1098) | 4.35 h | 41.4 pts |
| Felber + Savalkar monthly station-statistics correction (held-out seasons) | 58.7% [54.4–62.8] (305/520) | 56.9% [52.6–61.1] (296/520) | 15.1% [10.4–21.5] (24/159) | 100.0% [99.3–100.0] (549/549) | 3.61 h | 36.3 pts |

**Stratified by sky condition** (Reicosky 1989: all methods work on clear days and
struggle on overcast ones; an aggregate number hides this):

- clear days (cloud fraction < 0.3): 51.3% [47.5–55.2] (326/635)
- overcast days (cloud fraction ≥ 0.7): 38.6% [32.3–45.4] (80/207)

**Systematic offset removed by the Savalkar arm:** mean |monthly bias| = **2.56 °C**. Moderate — enough to shift band boundaries, but the raw agreement figures still mostly reflect curve shape.

**Peduto et al. 2013 heat term** (measured, never shipped — KD-2): would have changed the heat verdict on 2.6% [1.8–3.7] (28/1097) of decidable days.

> Oracle is consistency-only. No production confidence claim may rest on this row (council C2).

---

## Bhutan Bajo

- Oracle: ERA5 reanalysis (Open-Meteo archive) — CONSISTENCY ONLY, not observation
- Daily extremes provider: `nasa_power` (the effective primary — the same read production performs)
- In-season days available: **1098**; oracle-decidable: **1098**
- Full seasons (≥120 decidable in-season days): **6** — 2020, 2021, 2022, 2023, 2024, 2025
- Days the oracle itself saw ≥35 °C: 0.0% [0.0–0.3] (0/1098)

**Assumption violations (Felber measured 27% / 13%; these are OUR sites):**

- Tmin occurred in the afternoon (12:00–20:00): 1.0% [0.6–1.8] (11/1098)
- Tmax occurred before noon or after 20:00: 6.6% [5.3–8.3] (73/1098)

These are **not fixable by recalibration** — they are days on which the model's shape
assumption is simply false.

| Arm | Point-delta agreement | Band agreement | Unsafe-miss (G1) | Coverage | Consec-hours MAE | Index MAE |
|---|---|---|---|---|---|---|
| Felber et al. 2018 (a=2.71, b=3.14, c=0.75) | 8.3% [6.8–10.1] (91/1097) | 1.9% [1.3–2.9] (21/1097) | 100.0% [99.6–100.0] (1067/1067) | 99.9% [99.5–100.0] (1097/1098) | 14.58 h | 96.5 pts |
| Sanders sawtooth (control) | 7.5% [6.1–9.2] (82/1097) | 1.9% [1.3–2.9] (21/1097) | 100.0% [99.6–100.0] (1067/1067) | 99.9% [99.5–100.0] (1097/1098) | 14.67 h | 96.7 pts |
| Felber + Savalkar monthly station-statistics correction (held-out seasons) | 96.2% [94.2–97.5] (528/549) | 98.9% [97.6–99.5] (543/549) | 0.7% [0.3–1.9] (4/546) | 100.0% [99.3–100.0] (549/549) | 3.82 h | 1.2 pts |

**Stratified by sky condition** (Reicosky 1989: all methods work on clear days and
struggle on overcast ones; an aggregate number hides this):

- clear days (cloud fraction < 0.3): not measurable (n=0)
- overcast days (cloud fraction ≥ 0.7): not measurable (n=0)

**Systematic offset removed by the Savalkar arm:** mean |monthly bias| = **9.26 °C**. **This is enormous.** The reconstruction and the oracle were not describing the same temperature range at all, so the raw row measures a level mismatch between two gridded products, not curve-shape error. See the Bhutan note below.

**Peduto et al. 2013 heat term** (measured, never shipped — KD-2): would have changed the heat verdict on 0.0% [0.0–0.3] (0/1097) of decidable days.

> Oracle is consistency-only. No production confidence claim may rest on this row (council C2).

---

## Bhutan Gortshalu

- Oracle: ERA5 reanalysis (Open-Meteo archive) — CONSISTENCY ONLY, not observation
- Daily extremes provider: `nasa_power` (the effective primary — the same read production performs)
- In-season days available: **1098**; oracle-decidable: **1098**
- Full seasons (≥120 decidable in-season days): **6** — 2020, 2021, 2022, 2023, 2024, 2025
- Days the oracle itself saw ≥35 °C: 0.0% [0.0–0.3] (0/1098)

**Assumption violations (Felber measured 27% / 13%; these are OUR sites):**

- Tmin occurred in the afternoon (12:00–20:00): 0.2% [0.0–0.7] (2/1098)
- Tmax occurred before noon or after 20:00: 26.2% [23.7–28.9] (288/1098)

These are **not fixable by recalibration** — they are days on which the model's shape
assumption is simply false.

| Arm | Point-delta agreement | Band agreement | Unsafe-miss (G1) | Coverage | Consec-hours MAE | Index MAE |
|---|---|---|---|---|---|---|
| Felber et al. 2018 (a=2.71, b=3.14, c=0.75) | 47.1% [44.2–50.1] (517/1097) | 60.4% [57.5–63.3] (663/1097) | 39.5% [36.7–42.5] (433/1095) | 99.9% [99.5–100.0] (1097/1098) | 13.82 h | 40.5 pts |
| Sanders sawtooth (control) | 22.9% [20.5–25.5] (251/1097) | 28.5% [25.9–31.3] (313/1097) | 71.5% [68.8–74.1] (783/1095) | 99.9% [99.5–100.0] (1097/1098) | 14.92 h | 69.8 pts |
| Felber + Savalkar monthly station-statistics correction (held-out seasons) | 95.8% [93.8–97.2] (526/549) | 99.5% [98.4–99.8] (546/549) | 0.5% [0.2–1.6] (3/549) | 100.0% [99.3–100.0] (549/549) | 4.77 h | 1.0 pts |

**Stratified by sky condition** (Reicosky 1989: all methods work on clear days and
struggle on overcast ones; an aggregate number hides this):

- clear days (cloud fraction < 0.3): not measurable (n=0)
- overcast days (cloud fraction ≥ 0.7): not measurable (n=0)

**Systematic offset removed by the Savalkar arm:** mean |monthly bias| = **8.16 °C**. **This is enormous.** The reconstruction and the oracle were not describing the same temperature range at all, so the raw row measures a level mismatch between two gridded products, not curve-shape error. See the Bhutan note below.

**Peduto et al. 2013 heat term** (measured, never shipped — KD-2): would have changed the heat verdict on 0.0% [0.0–0.3] (0/1097) of decidable days.

> Oracle is consistency-only. No production confidence claim may rest on this row (council C2).

---
