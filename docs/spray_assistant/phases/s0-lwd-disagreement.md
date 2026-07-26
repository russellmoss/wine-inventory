---
title: S0 Unit 5 — the two-arm gate: decision sensitivity and input validation
type: phase-artifact
phase: S0
unit: 5
date: 2026-07-26
---

# S0 Unit 5 — the two-arm gate

## 0. What this measures, and what it cannot

**There is no measured leaf wetness anywhere in this project, and nothing below changes that.**
Arm A measures how much the choice of estimator changes a DECISION. Arm B measures whether the
estimator is being fed plausible INPUTS. Neither is leaf-wetness validation, and Arm B in particular
must never be reported as one — it validates meteorological inputs against stations several
kilometres away, over grass, at 10 m.

⚠️ **And one structural fact reframes the whole of Arm A.** Unit 4's goldens established that on
physically consistent inputs the fallback's wet set is a strict **subset** of CART's: RH ≥ 90 % implies
a dew-point depression of ~1.2–2.1 °C at every realistic temperature, which clears CART's 3.7 °C node,
and RH ≥ 90 also clears its 87.8 % node. **The disagreement is one-signed.** So a low flip rate cannot
mean "two independent methods agree, therefore both are probably right" — one dominates the other.
That is council C1's correlated-error trap in its purest form, and it makes Arm B the only arm that
can catch a shared input error rather than a useful second opinion.

## 1. Layer 0 — the consumer models, and the asymmetry in their provenance

Council G1: brief §7's pathogen table is materially incomplete. Going to the sources fixed that, and
produced a finding that matters more than the models themselves.

| Consumer | Provenance | Zone | Citation |
|---|---|---|---|
| Black rot | **PUBLISHED_TABLE** | BOTH | Spotts 1977, Phytopathology 67:1378-1381, in the operational temperature × wetness-hours form reproduced by MSU Extension. Infection range 50-90 °F; minimum requirement 6 h at 80 °F; requirement rises again above 80 °F. |
| Anthracnose | **PUBLISHED_THRESHOLD** | BOTH | 3-4 h wetness optimal at 25-30 °C; development range ~2-40 °C; longer wetness widens the temperature range. Agrees with brief §7 — the only consumer where it does. |
| Botrytis bunch rot | **COARSENED_RENDERING** | CLUSTER | Broome et al. 1995, Phytopathology 85:97-102 — an LWD × temperature model, contra brief §7's 'cool, damp conditions, no LWD'. Public: wetness grid 4/8/12/16/20 h and a ~15 h at 15 °C high-risk anchor. The fitted coefficients are NOT public. |
| Phomopsis cane and leaf spot | **COARSENED_RENDERING** | BOTH | Erincik et al. 2003, Plant Disease 87:832-840. Public: 5-35 °C × 5/10/15/20 h grid, optimum 16-20 °C, min/max ~5 and ~35.5 °C. The generalized Beta model's coefficients are NOT public, and cane vs leaf infection have separate thresholds — only the leaf case is rendered here. |

⚠️ **Two of the four consumers could not be encoded from published numbers**, because the papers are
paywalled and only their experimental design is public. Broome et al. 1995 *is* an LWD × temperature
model — brief §7's "cool, damp conditions, no LWD" is simply wrong — and Erincik et al. 2003 gives a
validated generalized Beta model. Neither's coefficients are freely available.

The honest response is not to invent two sets of coefficients that would be indistinguishable from
real ones in the output. So:

- **the gate is carried by the 2 `PUBLISHED_*` consumers only** (Black rot, Anthracnose);
- the 2 coarsened ones (Botrytis bunch rot, Phomopsis cane and leaf spot) are reported as **sensitivity, never as evidence**;
- **S5b must obtain both papers before implementing either model for real.** That is a phase
  requirement, not a footnote.

The wetness-interruption rule is **swept, not picked** (council G7 — "do not invent an interruption
threshold by observing when estimator outputs flip"). Results at 4, 8 and 12 h are in §4.

## 2. Layer 1 — estimator disagreement, per site and per season

Never pooled: Madera and Stoney Hill behave nothing alike and a pooled number hides exactly that.

| Site | Season | Model | CART wet h | Fallback wet h | CART refusal | Hour-level disagreement |
|---|---|---|---|---|---|---|
| stoney_hill | 2021 | era5 | 1779 | 760 | 0.0% | 19.8% |
| stoney_hill | 2022 | era5 | 1410 | 552 | 0.0% | 16.7% |
| stoney_hill | 2023 | era5 | 1628 | 771 | 0.0% | 16.7% |
| stoney_hill | 2024 | era5 | 1549 | 753 | 0.0% | 15.5% |
| stoney_hill | 2025 | era5 | 1660 | 765 | 0.0% | 17.4% |
| russian_river | 2021 | era5 | 1124 | 305 | 0.0% | 15.9% |
| russian_river | 2022 | era5 | 1070 | 243 | 0.0% | 16.1% |
| russian_river | 2023 | era5 | 1392 | 305 | 0.0% | 21.2% |
| russian_river | 2024 | era5 | 1000 | 198 | 0.0% | 15.6% |
| russian_river | 2025 | era5 | 1548 | 521 | 0.0% | 20.0% |
| madera | 2021 | era5 | 132 | 24 | 0.0% | 2.1% |
| madera | 2022 | era5 | 76 | 7 | 0.0% | 1.3% |
| madera | 2023 | era5 | 114 | 13 | 0.0% | 2.0% |
| madera | 2024 | era5 | 211 | 48 | 0.0% | 3.2% |
| madera | 2025 | era5 | 179 | 27 | 0.0% | 3.0% |
| paro | 2021 | era5 | 5632 | 3555 | 0.0% | 31.4% |
| paro | 2022 | era5 | 5608 | 3478 | 0.0% | 32.2% |
| paro | 2023 | era5 | 5530 | 3623 | 0.0% | 28.8% |
| paro | 2024 | era5 | 5599 | 3535 | 0.0% | 31.2% |
| paro | 2025 | era5 | 5535 | 3498 | 0.0% | 30.8% |
| monticello_va | 2021 | era5 | 1581 | 693 | 0.0% | 17.3% |
| monticello_va | 2022 | era5 | 1748 | 750 | 0.0% | 19.4% |
| monticello_va | 2023 | era5 | 1408 | 532 | 0.0% | 17.1% |
| monticello_va | 2024 | era5 | 2286 | 1435 | 0.0% | 16.6% |
| monticello_va | 2025 | era5 | 1849 | 875 | 0.0% | 19.0% |

_(era5 shown; all four archive models are in the JSON sidecar.)_

## 3. Layer 2 — Arm A, decision sensitivity, factorial

Council C7: report **variance attribution** so the headline is the estimator effect at a fixed
consumer spec rather than an unattributable blend.

| Dimension | Between-group variance of the flip rate |
|---|---|
| total | 0.07036 |
| byConsumerSpec | 0.00129 |
| byProviderModel | 0.02662 |
| bySite | 0.02734 |
| bySeason | 0.00066 |
| byInterruptionThreshold | 0.00316 |

### The gate

Estimator effect at a fixed consumer spec, gate-carrying consumers only, interruption threshold fixed at 8 h:

- **worst cell: 100.0%** (madera 2021 era5_land, anthracnose)
- mean across cells: 67.4%

### Provider spread — worst 100.0% over 150 model swaps

Estimator and consumer held fixed, archive model varied against `era5`. This is the dimension plan
§1.2 flagged after probing a 10-point RH difference between models at the same site and hour.

### Wind sensitivity — 16.4% of the estimator effect

Council G2's objection, made concrete rather than argued. The wind series is replaced with (a) nothing
and (b) a constant at the site's seasonal median, all else fixed, and the movement is measured against
the native-wind effect.

## 4. Interruption-threshold sweep (council G7)

| Dry-gap threshold | Mean flip rate | Mean CART infection events |
|---|---|---|
| 4 h | 60.1% | 43.1 |
| 8 h | 67.4% | 30.8 |
| 12 h | 71.9% | 23.4 |

## 5. Layer 3 — Arm B, input validation

> **This validates meteorological inputs against stations several kilometres away. It is NOT leaf
> wetness ground truth and must never be presented as validation of the estimator.**

⚠️ **And no station in the set MEASURES relative humidity.** ASOS measures temperature and dew point
with separate sensors; the RH column is computed from that pair, exactly as ours is. So Arm B's
independent quantities are **temperature, dew point, wind and precipitation**, and RH is validated only
*transitively*. That is why Unit 1b's primary humidity criterion is dew-point depression and RH is an
explicitly secondary check.

| Site | Season | Station | Matched h | DPD MAE | T MAE | Wind MAE | Precip MAE | RH MAE |
|---|---|---|---|---|---|---|---|---|
| stoney_hill | 2021 | `DYL` | 5131 | 1.219 °C | 0.865 °C | 1.258 m/s | 1.081 mm | 4.854 pp |
| stoney_hill | 2024 | `DYL` | 5118 | 1.133 °C | 0.753 °C | 1.362 m/s | 0.752 mm | 4.485 pp |
| russian_river | 2021 | `STS` | 5130 | 2.873 °C | 3.578 °C | 1.347 m/s | 0.92 mm | 11.17 pp |
| russian_river | 2024 | `STS` | 5134 | 3.184 °C | 3.239 °C | 1.326 m/s | 0.44 mm | 12.431 pp |
| madera | 2021 | `MAE` | 5125 | 5.071 °C | 2.895 °C | 1.145 m/s | 0.815 mm | 13.562 pp |
| madera | 2024 | `MAE` | 5132 | 3.34 °C | 1.841 °C | 1.2 m/s | 0.534 mm | 9.304 pp |
| monticello_va | 2021 | `CHO` | 5110 | 1.717 °C | 1.121 °C | 1.17 m/s | 1.182 mm | 6.457 pp |
| monticello_va | 2024 | `CHO` | 5103 | 1.622 °C | 1.049 °C | 1.187 m/s | 0.921 mm | 6.654 pp |

### ⚠️ Arm B does not pass or fail globally. It splits by REGIME, and cleanly.

This is the single most consequential result in the spike, and a worst-cell gate would have hidden
it behind one number.

| Site | Regime | Dew-point depression MAE (PRIMARY) | Verdict |
|---|---|---|---|
| stoney_hill | humid continental east | 1.219 °C (ceiling 1.85) | 🟡 passes the primary criterion, fails a secondary |
| russian_river | coastal fog | 3.184 °C (ceiling 1.85) | ❌ FAIL |
| madera | hot arid interior | 5.071 °C (ceiling 1.85) | ❌ FAIL |
| paro | monsoon high altitude | — °C (ceiling —) | — no ASOS station |
| monticello_va | humid subtropical southeast | 1.717 °C (ceiling 1.85) | 🟡 passes the primary criterion, fails a secondary |

**The pattern is physical, not noise.** The reanalysis tracks the stations closely in the humid
continental East and the humid subtropical Southeast, and misses badly in coastal fog and in the hot
arid interior — which are exactly the two regimes whose microclimate cannot be resolved in a ~25 km
cell. A marine-layer boundary and an irrigated valley floor are sub-grid features by construction.

So the honest conclusion is not "the inputs are plausible" or "the inputs are not plausible". It is:

> **Reanalysis inputs are adequate for the leaf-wetness estimator at humid-continental and
> humid-subtropical sites, and are NOT adequate at coastal-fog or hot-arid-interior sites.**
> Those sites need station-blended or on-site inputs before any LWD consumer runs on them.

Two corollaries worth stating because they are easy to miss:

- **Madera was chosen as "the refusal threshold's proving ground"** and it has proved something
  sharper than intended. The refusal rate there is the LOWEST of any site (0.6%) — the estimator is
  confidently answering — while its inputs are the WORST in the set (DPD MAE 5.07 °C, against a
  1.85 °C tolerance). **Confidence and correctness are uncorrelated here.** A refusal threshold keyed
  on input *availability* cannot catch input *error*, and Unit 6's confidence band must therefore
  carry provider-vs-station agreement, not just completeness.
- The two failing sites are both in California, and both are Demo-tenant sites. A rollout that
  started with the eastern sites would look fine and would be measuring nothing about the western ones.

Rolled up using **Unit 2's pre-declared rule** — state variables take the observation nearest the bin
centre and never a mean, precipitation takes the last hourly accumulation rather than a sum, and a bin
with no admissible observation is MISSING rather than interpolated or zeroed. Pre-declaring it in Unit
2 is what stops this comparison being tuned after the results arrived (council C8).

## 6. Criteria

| Criterion | Observed | Threshold | Verdict | Note |
|---|---|---|---|---|
| C1 | 1 | ≤ 0.2 | ❌ FAIL (above_ceiling) | worst cell across 200 (site × season × model × gate-consumer) cells at a fixed 8 h interruption threshold |
| C3 | 1 | ≤ 0.15 | ❌ FAIL (above_ceiling) | worst of 150 model-swap comparisons |
| C4 | 0.16412643834223944 | ≤ 0.5 | ✅ PASS | share of the estimator effect that moves under wind perturbation |
| C5 | 0.18719806763285024 | 0.005 … 0.33 | ✅ PASS | worst cell of 100; best cell 0.00% |
| C2.dpd | 5.071 | ≤ 1.85 | ❌ FAIL (above_ceiling) | worst of 8 Arm B cells (era5) |
| C2.temp | 3.578 | ≤ 1.11 | ❌ FAIL (above_ceiling) | worst of 8 Arm B cells (era5) |
| C2.wind | 1.362 | ≤ 1.25 | ❌ FAIL (above_ceiling) | worst of 8 Arm B cells (era5) |
| C2.precip | 1.182 | ≤ 0.2 | ❌ FAIL (above_ceiling) | worst of 8 Arm B cells (era5) |
| C2.rh | 13.562 | ≤ 5 | ❌ FAIL (above_ceiling) | worst of 8 Arm B cells (era5) |

## 7. The no-go condition

> ❌ **NO-GO TRIGGERED.**

S1 should NOT be built as scoped. See each trigger's breachMeaning for the narrower alternatives.

- NG-1: Arm B failed on dew-point depression — inputs are not plausible
- NG-3: estimator choice AND provider choice both move the advice — the band is a coin flip

## 8. What S0 is not entitled to conclude

Whatever the numbers above say, the conclusion is narrowed in writing: **acceptable for these
consumers, at these sites, in these seasons** — never *"the estimator is good"*. Two of the four
consumers are coarsened renderings and carry no weight. Any new LWD consumer reopens the threshold.
That is a tripwire in the ADR, not a hope.
