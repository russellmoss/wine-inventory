---
title: S0 Unit 6 — the LWD estimator decision: bands, refusal threshold, canopy contract
type: phase-artifact
phase: S0
unit: 6
date: 2026-07-26
status: decided
gates: S1
---

# S0 Unit 6 — the leaf-wetness estimator decision

Runbook question 3, answered in writing. **Gate artifact.** Every claim below traces to a number in
[s0-lwd-disagreement.md](./s0-lwd-disagreement.md) (Unit 5) or
[s0-hourly-field-inventory.md](./s0-hourly-field-inventory.md) (Unit 2).

---

## 0. The headline, before the detail

The two-arm gate **did not pass**, and the reason is not the one the plan expected.

Arm A behaved roughly as anticipated. Arm B — the arm council C1 added specifically because Arm A
can pass on correlated error — produced the finding that decides this phase:

> **Reanalysis inputs are adequate to run a leaf-wetness estimator at humid-continental and
> humid-subtropical sites, and are NOT adequate at coastal-fog or hot-arid-interior sites.**

| Site | Regime | Dew-point depression MAE vs station | Tolerance | |
|---|---|---|---|---|
| Stoney Hill | humid continental East | **1.22 °C** | ≤ 1.85 °C | ✅ |
| Monticello AVA | humid subtropical Southeast | **1.72 °C** | ≤ 1.85 °C | ✅ |
| Russian River Ranch | coastal fog | **3.18 °C** | ≤ 1.85 °C | ❌ |
| Madera | hot arid interior | **5.07 °C** | ≤ 1.85 °C | ❌ |
| Paro | monsoon, high altitude | _not testable — no RH-carrying station_ | — | — |

The tolerance is not a preference: it is **half of CART's own 3.7 °C level-1 decision node**, on the
principle that the instrument must be finer than the thing it measures. At Madera the input error is
**1.4× the entire decision threshold**. The estimator there is not slightly noisy, it is being asked
to resolve a boundary it cannot see.

**The pattern is physical, not statistical noise.** Both failures are regimes whose microclimate is
sub-grid at ~25 km: a marine-layer boundary and an irrigated valley floor. This is a resolution
limit, and no amount of estimator work fixes it.

---

## 1. Which estimator runs, and when

**CART is the estimator. The RH ≥ 90 % threshold is a labeled-inferior fallback and is never
silently substituted.** Settled in the design doc §2.4 and brief §15; Unit 5 measured the
disagreement rather than re-running a bake-off, and nothing in the measurement disturbs it.

But Unit 4's goldens established something that changes how the pair must be described, and it was
not in the plan:

> **On physically consistent inputs the fallback's wet set is a strict SUBSET of CART's.** RH ≥ 90 %
> implies a dew-point depression of ~1.2–2.1 °C at every realistic temperature, which clears CART's
> 3.7 °C node, and RH ≥ 90 also clears its 87.8 % node. Verified by sweep over 5,000+ points in
> T × RH × wind.

Three consequences:

1. **They are not alternatives, one dominates.** The fallback under-calls wetness and never
   over-calls it. Measured across the fixture set, CART finds 1.6–2.1× the wet hours the fallback
   does (Stoney Hill 1,601 vs 1,012; Madera 165 vs 58; Paro 4,779 vs 3,034).
2. **A low flip rate would not have been reassuring.** It cannot mean "two independent methods
   agree" when one is a subset of the other. This is council C1's correlated-error trap in its purest
   form and it is why Arm B carries this phase rather than supporting it.
3. **Dominance breaks when RH and T/Td come from different providers.** That is not hypothetical —
   it is plan §1.2's hybrid arm (ERA5-Land for temperature and RH, ERA5 for wind). Any hybrid
   provider configuration must be reported separately and never pooled with single-provider results.

### Missing inputs: refuse only when the missing input could change the answer

The plan's rule is "an hour with no wind reading is not a dry hour." The naive implementation of that
— any null → refuse — is wrong in the opposite direction and manufactures coverage gaps out of
decided hours. The implemented rule is sharper:

| Situation | Behaviour | Why |
|---|---|---|
| Dew-point depression unavailable | **refuse** (`MISSING_INPUT`) | the tree cannot start |
| DPD ≥ 3.7 °C, wind and RH absent | **DRY**, fully determined | level 1 decides; the absent inputs are never consulted |
| DPD < 3.7 °C, wind absent, RH ≥ 87.8 % | **WET**, flagged `determinedUnderPartialInputs` | both wind branches agree; the missing value cannot change the outcome |
| DPD < 3.7 °C, wind absent, RH < 87.8 % or absent | **refuse** (`MISSING_INPUT`) | calm → wet, windy → dry. Genuinely undecidable |
| Any input present but QC-inadmissible | **refuse** (`INADMISSIBLE_QC`) | a distinct cause class — see §3 |

Every verdict records what was absent even when the answer stands, because the confidence band in §2
is a function of input availability, not of the estimate.

**Rule §3.5 applies without exception: the estimator is named at the point of display.**
`qualityClass` (`PREFERRED` | `LABELED_INFERIOR`) rides on every verdict, and there is no bare
boolean anywhere in the estimator's output — a caller cannot obtain wet-or-dry without destructuring
an object that also carries the estimator's identity. That is a type-level property, not a convention.

---

## 2. Confidence bands, defined by their inputs

Not adjectives. Each band is a function of measured quantities, and every input below was measured in
Unit 2 or Unit 5 rather than asserted.

| Band input | Source | Measured range across the fixture set |
|---|---|---|
| Input completeness | the estimator's own `inputsMissing` | refusal 0.6 %–4.3 % of season-hours on complete-field models |
| Series kind | Unit 2 classification | OBSERVED / FORECAST / REANALYSIS, three different acquisition modes |
| **Provider-vs-station agreement** | Unit 5 Arm B | DPD MAE 1.22 °C → 5.07 °C depending on site |
| Archive-model spread | Unit 5 Layer 2 | `era5` vs `default` moves **50.6 %** of classifications on average |
| Station distance and elevation delta | Unit 2 §6 | 3.3 km → 17.4 km; Δ elevation up to 15 m |
| **Wind provenance** (height, terrain, distance) | Unit 2 §6, council G2 | all 10 m open-terrain except NASA POWER, which is **2 m** |
| **Native interval width of the source bin** | Unit 2 addendum | RH arrives in 1 h bins near-term and up to **10 h** bins at long lead |

### ⚠️ The band must carry AGREEMENT, not just COMPLETENESS. Madera proved it.

Madera was chosen as "the refusal threshold's proving ground". It proved something sharper than
intended:

- its **refusal rate is the LOWEST in the set — 0.6 %**, so the estimator is confidently answering
  almost every hour;
- its **inputs are the WORST in the set — DPD MAE 5.07 °C**, against a 1.85 °C tolerance.

**Confidence and correctness are uncorrelated there.** A confidence band keyed on input
*availability* is blind to input *error*, and would have reported the highest confidence at exactly
the site where the answer is least trustworthy. That is a safety inversion, and it is the single
most important design correction this unit makes.

So: **provider-vs-station agreement is a required band input, not an optional one.** Where no station
exists to compare against (Paro), the band must say *that*, not fall back to completeness.

---

## 3. The refusal threshold

### Measured firing rates, per site (never pooled)

| Site | CART refusal rate, complete-field models | Worst cell across all models |
|---|---|---|
| Stoney Hill | 3.6 % | — |
| Russian River Ranch | 3.7 % | — |
| Madera | 0.6 % | — |
| Paro | 4.3 % | — |
| Monticello AVA | 3.4 % | — |
| **worst cell, any model** | | **18.7 %** |

Criterion C5 is a **band**: ceiling 33 %, floor 0.5 %. The worst cell is 18.7 % and the best is
0.6 %, so **C5 passes at both ends** — the refusal fires often enough to be real and rarely enough
for the lane to be worth building. It is the only Arm A criterion that passed cleanly.

### A refusal carries its CAUSE CLASS (council G9)

*"Cannot determine because the dew-point input is absent"* and *"do not spray because it is pouring"*
are agronomically opposite and must never render as each other. Within refusals there is a second
distinction with different remedies:

| Cause | Meaning | Remedy | Renders as |
|---|---|---|---|
| `MISSING_INPUT` | the provider did not supply a required field | change provider, or backfill | *"we cannot determine leaf wetness — the humidity data for these hours is missing"* |
| `INADMISSIBLE_QC` | the value arrived but failed Unit 2's QC rule | a data-quality event; investigate the station | *"we cannot determine leaf wetness — the weather station's readings for these hours failed quality checks"* |

Neither is a risk statement. **A coverage gap never renders as no-restriction** (rule §3.6,
SAFE-3/4).

### ⚠️ The intra-cron window: the system FAILS CLOSED

Council G3 (design) asked the question the plan never answered. Downy secondary sporulation can begin
and complete in a single night; a grower asking at 08:00 when the cron ran at 00:00 is missing the
most decision-relevant eight hours. Both weather crons are **daily** and sub-daily schedules fail
Vercel deployment on the current plan (the #516/#517 deploy breaker).

**Decision: fail closed.** In the window between the last successful ingest and now, the system
reports *cannot determine safely* for any LWD-dependent output, and says why — *"the last weather
update was N hours ago; conditions since then are unknown."* It does **not** extrapolate, and it does
**not** silently present stale wetness as current.

The reasoning is asymmetric harm. Failing open means telling a grower they are protected during
precisely the hours an infection period can complete. Failing closed means telling them we do not
know, during hours when we do not know. Rule §3.3 already establishes that a legitimate refusal is
acceptable and expected; a wrong reassurance is not.

Two things this decision does **not** license:

- It does not make the freshness problem go away. Unit 0 established that observed data **is**
  backfillable, so a missed run is recoverable *after the fact* — but backfill does nothing for
  freshness, and freshness is what the intra-cron window is about.
- It does not justify skipping alerting. A missed capture is currently **silent as well as stale**.
  S1 owns monitoring on the ingest job.

### The counterfactual: what a pathogen model does when LWD refuses

So S5b inherits a specification rather than a gap:

1. **A refusal is not a dry hour and must not be counted as one.** In wet-run segmentation a refused
   hour neither extends a run nor counts toward the dry-gap interruption threshold — counting it as
   dry would let a coverage gap silently terminate a wetness period, which is the §3.6 failure mode
   wearing a different hat.
2. **A run containing any refused hour is flagged** (`containsRefusal`) and its duration is a **lower
   bound**, never a measurement.
3. **A pathogen model handed a flagged run may not emit a risk value.** It emits *cannot determine
   safely* with the cause class propagated. It does not emit a low risk, and it does not emit a
   conservative high risk either — inventing pressure is its own failure mode.
4. **The refusal propagates, it does not accumulate.** One refused hour inside a 40-hour run does not
   invalidate a season; it invalidates that run's contribution to that decision.

---

## 4. The two-zone canopy contract — what S4 must collect

⚠️ Council G3: the plan's first draft carried a single block-level canopy state and it was
**anatomically wrong**. Pathogens target organs living in different microclimates *within the same
canopy*. Downy attacks foliage in the upper canopy and growing tips; botrytis targets clusters in the
fruiting zone. "Leaf-pulled VSP" means leaves pulled **in the fruiting zone only** — the upper canopy
stays dense. A block-wide fast-drying modifier would model cluster drying correctly while badly
under-predicting downy risk on the foliage: the system would tell a grower they are protected on the
exact tissue that is not.

### The contract

Two microclimates, each with its own drying adjustment, and **every pathogen model declares which
zone it reads**:

| Pathogen | Zone | Why |
|---|---|---|
| Downy mildew | `FOLIAR` | attacks foliage and growing tips in the upper canopy |
| Botrytis | `CLUSTER` | targets clusters in the fruiting zone |
| Powdery mildew | `FOLIAR` | secondary spread is on foliage — and liquid water *suppresses* conidia |
| Black rot | `BOTH` | leaf lesions produce the inoculum; the economic damage is on fruit |
| Phomopsis | `BOTH` | cane and leaf infection have separate published thresholds |
| Anthracnose | `BOTH` | shoots, leaves and berries are all susceptible |

Direction per canopy management, per zone:

| Canopy management | `CLUSTER` | `FOLIAR` |
|---|---|---|
| Unmanaged sprawl | SLOWER | SLOWER |
| VSP | NEUTRAL | NEUTRAL |
| **VSP, leaf-pulled fruit zone** | **FASTER** | **NEUTRAL** ← the whole reason this is two-zone |
| Divided canopy | FASTER | FASTER |
| Unknown | NEUTRAL, **flagged as an assumption** | NEUTRAL, **flagged as an assumption** |

**S0 defines the shape and measures sensitivity to it. S0 does NOT calibrate the magnitude.** Every
`dryingHoursDelta` is `null` and that is the deliverable, not an omission: there is no on-site
sensor, no measured wetness and no paired canopy trial to calibrate against. Council specifically
flagged the risk of inventing product logic here. A number in that field before a phase that has data
would be fabrication with a type signature.

### >>> LIFTABLE PARAGRAPH FOR S4'S LANE — implement from this alone <<<

> **S4 must collect a per-block `canopyManagement` state** with the closed vocabulary
> `UNMANAGED_SPRAWL | VSP | VSP_LEAF_PULLED_FRUIT_ZONE | DIVIDED_CANOPY | UNKNOWN`, where `UNKNOWN` is
> a distinct member and never a default that silently reads as `VSP`. It is a **management state, not
> a trellis type**: `VineyardBlock.trellisSystem` (which S4 is already adding) says how the vine is
> trained; this says what was done to the canopy this season, it changes during the season, and leaf
> removal is the transition that matters. Brief §17.2's block profile carries *cluster compactness*
> and *canopy vigor* but **no canopy-management state at all**, so nothing existing covers it.
> Because it changes within a season it must be an **observation with a timestamp**, not a static
> block attribute — a spray decision in August must be able to ask what the canopy was in July.
> Everything in S0's canopy contract is unusable until this exists.

### The grower "calibrate wetness" override (council S6)

It is **itself an observation** — attributed, timestamped, resetting the clocks per brief §6 — and it
is now **zone-scoped**, because a grower standing in a dry fruiting zone is not reporting on the
upper canopy. An override that silently applied to both zones would reintroduce exactly the
block-wide error this section exists to prevent.

---

## 5. What S0 is NOT entitled to conclude

This is the ADR's tripwire, not a caveat.

**Valid for:** two named consumers (black rot on the Spotts table, anthracnose), at five named sites,
across the 2021–2025 seasons, on reanalysis inputs, in two of five regimes.

**Explicitly NOT established:**

- **Nothing here is validated against measured leaf wetness.** There is none, anywhere in this
  project. Arm B validates *meteorological inputs* against stations several kilometres away, over
  grass, at 10 m. It is not leaf-wetness ground truth and must never be presented as such.
- **Two of the four consumers carry no weight.** Botrytis (Broome et al. 1995) and phomopsis (Erincik
  et al. 2003) are `COARSENED_RENDERING` — their published models' coefficients are paywalled, only
  the experimental design is public. They were run for sensitivity only. **S5b must obtain both
  papers before implementing either model.**
- **RH was never independently validated.** No station in the set *measures* relative humidity; ASOS
  derives it from temperature and dew point exactly as we do. Arm B's independent quantities are
  temperature, dew point, wind and precipitation.
- **Paro has no Arm B at all.** Its nearest station (`VQPR`, 0.8 km) carries temperature, dew point
  and wind through NCEI ISD but no RH column and no hourly precipitation. The one non-US site is the
  one with the thinnest validation.
- **CART's RH node (87.8 %) rests on a single secondary source.** The 3.7 °C and 2.5 m/s nodes are
  corroborated across independent sources; the RH node is not. S1 must obtain the primary paper
  before lifting the estimator into `src/`.
- **All five Paro seasons are dry against Paro's own baseline** (p0–p21). Conclusions there are drawn
  on a tail.

**Tripwire: any new LWD consumer reopens this threshold.** Any new SITE reopens the regime question —
a new vineyard in a coastal-fog or arid-interior regime inherits the Russian River / Madera failure,
not the Stoney Hill pass.

---

## 6. The honesty output, in the words a grower reads

Brief §9's worked example puts leaf wetness in the `Confidence` and `What we don't know` rows and
**never in the risk row**. Copy matters as much as math here.

**When the estimator answers with good inputs:**

> **Confidence:** Moderate. Leaf wetness is estimated, not measured — we use the CART model on
> humidity, dew point and wind from the nearest weather data. There is no wetness sensor at this
> block.

**When the estimator answers but the inputs are poor (the Madera case):**

> **What we don't know:** We can estimate leaf wetness for this block, but the weather data we have
> disagrees with the nearest measuring station by more than the model can tolerate — about 5 °C on
> the humidity measure that drives it. Treat any wetness-based risk here as unreliable until this
> block has its own sensor or a closer station.

**When the estimator refuses for missing data:**

> **What we don't know:** We cannot determine leaf wetness for these hours — the humidity data is
> missing. This is not the same as "conditions are safe". We do not know.

**When the estimator refuses because the data is stale (the intra-cron window):**

> **What we don't know:** The last weather update was 9 hours ago. Conditions since then are unknown,
> and a wetness period can begin and end inside a window that long. We are not able to tell you
> whether one has.

**What must never be written:** any sentence combining leaf wetness with a percentage, any wetness
figure without its estimator named, and any rendering of a refusal that a reader could mistake for an
all-clear.

---

## 7. What this means for S1

1. **S1 is buildable, but NOT as scoped for all sites.** The lane proceeds for humid-continental and
   humid-subtropical sites on reanalysis inputs. Coastal-fog and hot-arid-interior sites need
   station-blended or on-site inputs first, and shipping to them on reanalysis alone would be
   shipping a known-wrong answer.
2. **The archive model must be FIXED and RECORDED, never "best match".** `era5` vs `default` moves
   50.6 % of classifications on average. A silently-changing blend makes past decisions unreplayable
   even with perfect retention.
3. **Do not use ERA5-Land.** It carries no wind at any site (confirmed across all five, over a full
   week), and wind is both a CART input and — more seriously — a hard input to the S7b legality gate.
4. **Wire every retained provider through the SSRF-guarded fetch edge and its allowlist.** S0's
   probes deliberately bypassed it as throwaway code; S1 owns doing it properly.
5. **Carry the native interval width per property.** RH arrives in bins up to 10 hours wide at long
   lead time, and a 10-hour RH plateau fed to a threshold model manufactures or erases a ten-hour
   wetness run wholesale.
6. **Obtain the CART primary paper** before the estimator moves into `src/`.
