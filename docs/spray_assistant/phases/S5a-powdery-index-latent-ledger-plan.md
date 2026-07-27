# S5a — Powdery-mildew index and the latent-infection ledger (Wave 2, lane C)

> [!warning] READ THIS BEFORE THE PLAN — Unit 0's gate has FIRED and half this plan is cancelled.
> **The powdery index is a NO-GO.** The probe ran 2026-07-26 and **all 8 sites failed** the
> pre-committed gate: [S5a-diurnal-fidelity-probe.md](S5a-diurnal-fidelity-probe.md).
> Consecutive-hours-in-band error is 2.2–3.4 h against a rule thresholded at **6 h**, and the
> unsafe-miss rate breaches its 2% bar at six of eight sites. The failure is structural, not a
> tuning problem, so **do not re-open it without S1**.
>
> - **Cancelled:** Units 3 and 4 (`diurnal-core.ts`, `powdery-core.ts`). The index moves to S5b
>   behind S1 — which makes S1 load-bearing for powdery mildew, not just for leaf wetness.
> - **Still ships, unchanged:** the latent-infection ledger (Units 1, 2, 5). It never depended on
>   the index and is the durable half.
> - **Read alongside:** [S5a-build-status.md](S5a-build-status.md) for what actually landed, what
>   is blocked, and the append-only GRANT/REVOKE defect the schema work turned up.
>
> Sections below still describe the index as if it were shipping. They are left intact as the
> reasoning that produced the gate, **not** as instructions. Corrections made during `/work` are
> marked 🔴 in place — see Unit 10, which named an invariant id that was already taken by a shipped
> critical invariant.

**Status:** 🟨 **plan v2 — council-reconciled 2026-07-26; Unit 0 gate ANSWERED, index cancelled,
ledger proceeding**
**Depth:** Deep (12 units, 3 PRs)
**Dependency edge:** `S5a←∅` (existing daily weather). Parallel with S2b (1B), S7a (2A), S8 (2B), S1 (2D).
**Plan location note:** program convention §11 puts phase plans here, not in `docs/plans/`.
**Council:** [S5a-council-feedback.md](S5a-council-feedback.md) — Codex `gpt-5.4` + Gemini
`gemini-3.1-pro-preview`. Both endorsed the probe-first shape; **11 findings folded in below,
3 of them safety bugs in v1's own reasoning.** Changed sections are marked ⚡**v2**.

⚠️ **Five design questions were carried with defaults (D1–D5 in the council doc), following the
S3a precedent.** They are marked ⚡**v2 (D-n)** where they land. All five are cheap to reverse —
override at `/work` time if wanted, do not re-litigate from scratch.

---

## 1. Problem frame

The runbook scopes S5a as *"Gubler-Thomas is temperature-only and buildable on today's daily
data via diurnal reconstruction — ship it first as the program's modeling proof."*

**Half of that sentence is verified. The other half is an unexamined leap, and the literature
argues against it.**

"Temperature-only" is true, and stronger than the runbook knew: it is **forced**. `rhMaxPct` /
`rhMinPct` exist on `VineyardClimateDaily` but **no shipped adapter ever populates them** —
every provider declares `capabilities: ["tmax","tmin","precip"]`
(`providers/gridmet.ts:53`, `daymet.ts:50`, `nasa-power.ts:31`, `noaa-cdo.ts:22`,
`rcc-acis.ts:131`), and `gridmet.ts:24` carries a `withRh` parameter that is never passed true
because ACIS GridData returns `bad args` for `rmax`/`rmin`. Measured on the live DB:
**31,612 Demo rows and 38,777 Bhutan rows, 100% NULL RH.** Under rule §3.7 every
humidity-dependent index in the program is unbuildable today. Gubler-Thomas is not merely a
convenient first model — it is the only one the ingest layer can currently carry.

"Buildable from daily via diurnal reconstruction" does not follow, for two independent reasons.

### 1.0 The index has TWO phases, and the first one needs leaf wetness

This is the single biggest correction to the runbook's premise, and it comes from the canonical
primary text (Gubler, Rademacher, Vasquez & Thomas 1999, APSnet Feature; cross-checked against
Gubler's UCCE extension paper and the UC IPM model database).

**Phase 1 — ascospore infection forecast.** The season does not start on temperature at all.
Ascospore release requires **free moisture (~2.5 mm rain, sprinkler, or fog)**, and infection then
requires **extended leaf wetness at 10–15 °C** — Gubler 1999 says 12–15 h, his UCCE paper says
8–12 h (unresolved). Mechanism, verbatim: *"The model utilizes the 'Conidial Mills Table' at 2/3
value for hours of leaf wetness required at various temperatures."*

**Phase 2 — the conidial risk index.** Temperature-only, and this is the part everyone means when
they say "Gubler-Thomas is temperature-only". It runs **only after ascospore infection is
confirmed.**

**Consequence: S5a can compute Phase 2 but cannot legitimately initiate it.** Season initiation
depends on a leaf-wetness quantity we do not have and will not have until S1 — and ADR 0012
narrowed even S1's LWD to eastern regimes. So the index cannot self-start.

The house-style resolution, which is also the honest one: **the system suggests, a human confirms.**
A grower confirms the season's first infection, and Phase 2 runs from that confirmed biofix. This is
exactly the S3a legacy-mapping precedent (council S11) and S4's biofix anchor, and it satisfies rule
§3.1. An unconfirmed season yields *unknown*, never *low*. Fold this into Unit 4's refusal ladder as
its own cause.

⚡**v2 — the biofix has TWO arms, not one. Gating on ascospores alone is an agronomy bug**
(council C8). Powdery mildew overwinters **two** ways: as chasmothecia releasing ascospores (needs
wetness, above), **and as dormant mycelium inside buds**, which emerge at budbreak as
mildew-covered **flag shoots**. *Flag shoots require no rain and no leaf wetness at all.* A biofix
gated only on confirmed ascospore infection leaves the model at *unknown* while a flag-shoot
epidemic runs — a silent false negative in exactly the regimes (Oregon, Bhutan) where it is most
likely. **Biofix = first ascospore infection OR first observed mildew / flag shoot**, whichever
comes first. The second arm is a scouting observation the system already collects.

⚡**v2 (D-3) — we HAVE precipitation, so the system proposes the biofix rather than asking cold.**
v1 called the model "wetness-blind" because RH is NULL, but `precipMm` **is** populated. Phase 1's
ascospore trigger (~2.5 mm rain) is therefore *partly* computable — what is missing is only the
leaf-wetness **duration** at 10–15 °C, not the rain event. So the system surfaces candidate biofix
dates (a qualifying rain event with temperatures in range) and the grower confirms one. Strictly
better than a blank prompt, and it stays inside rule §3.1 because the human still authorizes.
**Deliberately NOT done:** deriving a precip-based conidial-suppression *points* term. Gemini
suggested it, but it is the same error as D-2 — inventing point logic the validated 0–100 scale was
never calibrated against. Precip informs the biofix proposal and the honesty copy, never the score.

### 1.1 One of the four index rules is structurally uncomputable

The Phase-2 rules are four, not one:

| Condition | Points |
|---|---|
| ≥6 **continuous** hours 21–30 °C (70–85 °F) | **+20** |
| <6 continuous hours in that band | **−10** |
| Temperature reached 35 °C (95 °F) **for more than 15 minutes** | **−10** |
| Both of the above occur | **+10** |

Three consecutive qualifying days (+20 each) take the index to 60 = epidemic underway; if the streak
breaks before 60, **reset to 0**; once 60 is reached the 3-day rule is **retired permanently**.
Bounds 0–100, max daily change +20/−10. The index **leads** the observable population by ~5–7 days.

Spray intervals — two published tables, both authoritative, differing by formulation vs chemistry
class. Encode the UC IPM guidelines table and cite both:

| Index | Pressure | Biologicals/SARs | Sulfur | DMI | Strobilurin |
|---|---|---|---|---|---|
| 0–30 | low | 7–14 d | 14–21 d | 21 d | 21 d |
| 40–50 | intermediate | 7 d | 10–17 d | 21 d | 21 d |
| 60+ | high | **not recommended** | 7 d | 10–14 d | 14 d |

**Three implementation ambiguities to decide deliberately, not discover in code:**
1. **"6 hours" vs "6 consecutive hours."** The 1999 primary says only "at least 6 hours"; Gubler's
   later UCCE paper and UC IPM both say *consecutive*/*continuous*, as does every operational
   implementation. **Take consecutive** — it is the stricter reading (fewer qualifying days).
2. **Both conditions on one day.** UC IPM applies the rules sequentially (+20 then −10 = **+10**);
   Gubler's 1999 prose reads as −10. **Take UC IPM's +10** — current official guideline, matches
   implementations, and errs toward higher risk.
3. **°C and °F bands are not equivalent.** 21–30 °C ≠ 70–85 °F (85 °F = 29.4 °C; 30 °C = 86 °F).
   35 °C = 95 °F exactly. Gubler's papers are °C; UC IPM's grower page is °F. **Work in °C and
   document it**, or carry a silent 0.6 °C band-width error at the top edge — which is exactly the
   edge the reconstruction's late-afternoon warm bias sits on.

**The 35 °C rule is a 15-minute criterion.** A smooth curve fitted through daily Tmin/Tmax has
no sub-hourly structure at all. This is not degraded accuracy — the rule is *absent*, and no
choice of reconstruction method recovers it.

Direction of the resulting bias matters and is favourable, which is why the phase survives:
failing to detect heat suppression means failing to subtract, so the index runs **high**, which
shortens the recommended interval. That errs toward spraying, not toward unprotected fruit.
But it is a **systematic upward bias, not noise**, and over-spraying is not free — it costs
money and it increases resistance selection pressure, which is precisely what S7a exists to
manage. It must be labelled, not waved through.

### 1.2 The 6-hour band count is the fragile class of derived metric

A single reconstructed hour landing on the wrong side of 21 °C or 30 °C breaks the continuous
run and flips a day from **+20 to −10** — a 30-point swing on a 0–100 scale, from one hour of
error. With decision thresholds at 30 and 60, two such flips move a block from a 21-day
interval to a 7-day one.

The literature measures exactly this failure class, and it splits sharply by metric shape:

| Study | Smooth accumulator | Narrow-window threshold counter |
|---|---|---|
| Savalkar et al. 2024, *Agric. For. Meteorol.*, DOI `10.1016/j.agrformet.2024.109952` | chill accumulation **<5%** median deviation | sunburn risk (hours above a threshold) **>100%** median deviation |
| `chillR` (Luedeling), reconstruction from local daily extremes vs observed hourly | Growing Degree Hours **−2.7%** | Chill Portions **+13%** |
| Felber, Stoeckli & Calanca 2018, *Int. J. Biometeorol.* | aGDD phenology within **±3 days** | — |

Every smooth-accumulator result is reassuring, and every one of them describes the class this
repo's existing weather math already lives in (`gdd-core.ts`, `normals-core.ts`,
`stage-core.ts`). **Gubler-Thomas is not in that class.** A consecutive-hours-in-a-narrow-band
counter is structurally the sunburn/Chill-Portions case.

Savalkar also names the mitigation: injecting **monthly statistics from station observations**
into the disaggregation reduced the error by **>75%** in the majority of cases. That is directly
available here — `rcc_acis` is already a station-backed provider, and every Demo site carries
`stationName` / `stationDistanceM` / `stationElevationDeltaM` in `vineyard_weather_config`.

### 1.3 Nobody has done this before

**No published study runs Gubler-Thomas on reconstructed hourly temperature. No sensitivity
analysis of the index to hourly data quality, sampling interval, gap-filling, or reconstruction
exists.** That is a clean negative result after an extensive search, not a gap in our reading.
The nearest analogue (Bregaglio et al. 2011) varies *leaf wetness*, not temperature.

The closest published acknowledgement of the index's brittleness is
**Choudhury, Mahaffee, McRoberts & Gubler (2018), bioRxiv 264622**, who modified the index with
fuzzy logic explicitly to address "biological and **mechanical** uncertainty" and achieved
comparable disease control with significantly fewer applications. When the model's own authors
soften its crisp thresholds, crisp thresholds fed by inferred inputs deserve a measurement.

### The pressure test

*Is this the right problem?* Yes, and more so than the runbook argues. The grower's real
question is "do I stretch to 21 days or tighten to 7?" — Gubler-Thomas's output *is* an
interval recommendation, so the model maps onto the decision without a translation layer.

*What happens if we do nothing?* The program has no probabilistic engine at all and S9 has
nothing to compose. S5a is also the lane that lands `query_spray_decision`, which every later
phase enriches rather than duplicating (rule §3.15).

*Is there a simpler framing?* Yes, and we take it: **measure before building.** The phase
becomes S0-shaped — a probe with a pre-committed no-go, then build to whatever the measurement
licenses. This is cheaper than building an index we may have to retract.

*Should the ledger be here at all?* Yes, and it is the more durable half. See KD-3 — two
independently-researched pathogens both refuse the obvious schema, and the scale register warns
that event-schema evolution costs grow non-linearly once consumers exist. Building it while
S5b's consumers do not yet exist is the cheap moment.

---

## 2. What is frozen and must be consumed, not re-derived

- **`LocalDailyRecord`** (`weather/obs-time-core.ts:14-21`) is the currency of every pure weather
  core. S5a's cores take `LocalDailyRecord[]`. Obs-time bucketing already happened at ingest —
  **S5a must not re-shift** (`obs-time-core.ts:55-70`).
- **`resolveSiteTimeZone` + `siteTodayIso`** (`weather/site-time-core.ts:16,25`) are the only
  definition of site-local "today". Never `new Date().toISOString().slice(0,10)` — that is the
  bug plan 096 Phase 0 fixed. Inject `today` into cores as a parameter
  (pattern: `phenology/read.ts:6-9`).
- **The daily-weather read** is `phenology/read.ts:85-98` verbatim: filter to
  `primaryProviderOverride ?? primaryProviderKey`, `select` the six columns, coerce Decimal→number
  at the Prisma boundary via `dec` (`read.ts:26`), never inside a core.
- **`wasScouted` / `isScoutedClean`** (`phenology/observation-types.ts:183,191`). The header at
  `:180-181` already names the disease lanes as the consumers. Never a truthiness check on the
  raw value — `null` / `NOT_ASSESSED` / `NONE` are three distinct facts (`:11-22`).
- **The refusal ladder shape** is `phenology/stage-core.ts` — a union of refusal codes, a private
  `refuse()` helper (`:210-231`) returning a full-shaped object with `reasonCode` + plain-English
  `reason` + whatever partial context is known. `null` is a first-class outcome, never an error
  and never a default (`:177`).
- **S0's three refusal cause classes** (`MISSING_INPUT`, `INADMISSIBLE_QC`, `STALE_INPUTS`) —
  reuse, do not invent a fourth taxonomy.
- **`SPRAY_CONTRIBUTORS`** (`spray/contributors.ts:17`) is still `[]`. S5a is the first lane to
  append, and appends exactly one line.
- **S2b's `factsAsOf` composite** is not S5a's concern — S5a touches no product facts.

---

## 3. Scope

### In scope

1. A **measurement probe** (Unit 0) with a pre-committed go/no-go, run before any production code.
2. `diurnal-core.ts` — hourly temperature reconstruction from daily Tmin/Tmax, pure, golden-tested,
   with the estimator's identity as a type-level property.
3. `powdery-core.ts` — the Gubler-Thomas index with a full refusal ladder and a categorical output.
4. The **append-only latent-infection ledger** — new tenant-scoped table, full Phase-12 checklist,
   with event-stream identity, grant-enforced append-only, idempotent commands, and explicit
   projection-state columns (KD-3, Unit 2). ⚡**v2 (D-1):** it ships **only** the arms S5a
   implements — `FIXED_WINDOW`, `UNKNOWN`, `ERADICATED`. The accumulator and phenology-gate arms are
   documented as design rationale for S5b, **not** pre-declared in the enum.
5. The read seam + DTO (per-vineyard index, per-block modifiers).
6. `query_spray_decision`, **thin and hard-refusing**, plus fleet discrimination goldens.
7. `verify:powdery` e2e on Demo Winery, including the NEWA comparison recorded as an oracle.
8. The invariant note, register entries, and **the runbook correction** (KD-10).

### Explicitly out of scope

- **Any humidity-dependent term.** RH is structurally empty (§1). Rule §3.7.
- **The 35 °C/15-min rule.** Structurally uncomputable (§1.1). Declared, never estimated.
- **Hourly weather ingest** — that is S1, and `src/lib/weather/*` is S1's file territory in the
  shared-file map. S5a reads existing daily data and reconstructs in `src/lib/spray/`.
- **Downy, black rot, phomopsis, botrytis models** — S5b. S5a defines the ledger arms they need.
- **The risk visual vocabulary.** Rule §3.18 — S9 owns clear/watch/act/unknown/blocked. S5a emits
  a categorical enum and does not style it.
- **Any spray decision.** Council C3 — the tool hard-refuses until S7a and S9 exist.
- **Cultivar susceptibility, canopy density beyond what S4 shipped.** No collection surface →
  rule §3.7 → cut to Later.

---

## 4. Key decisions

**KD-1 — Unit 0 is a pre-committed measurement gate, not an implementation detail.**
Mirrors S0's two-arm gate and S2b's Unit 0 probe (which reversed that phase's shape). Measure
reconstruction error on the **derived quantity**, not on temperature. Pre-commit the thresholds
*before* seeing results. See §5 Unit 0 for the exact gate.

**KD-2 — The missing 35 °C rule is declared. ⚡v2 (D-2): we do NOT substitute a replacement.**
`heatSuppressionObserved: false` is carried on every index result with an explanation string; the
index is known to run high, never silently.

v1 proposed shipping the Peduto, Backup, Hand, Janousek & Gubler 2013 revision
(*Plant Disease* 97:1438-1447, DOI `10.1094/PDIS-01-13-0039-RE`) as the heat term, because its
thresholds — **34 °C/4 h, 36 °C/4 h, 38 °C/2 h** — are multi-hour and therefore *are* computable from
a reconstructed curve, unlike the 1999 rule's 15-minute criterion.

**Council rejected that, correctly.** The 60-point epidemic threshold was empirically validated
against the *original* point logic. Swap the heat penalty and the totals no longer map to the scale
those thresholds were calibrated on — you are shipping a bespoke model under a recognised academic
name. **Ship the 1999 index, with its 15-minute term declared absent.**

The 2013 form survives as a **measurement in Unit 0 only**: compute what it *would* have changed, and
report it. That tells us the size of the heat-term error without putting an uncalibrated number in
front of a grower. It also gives the program the evidence to adopt the revision later, deliberately.

One consolation the research supplies: omitting the 15-minute rule is *less* wrong than it looks,
because Peduto et al. found *E. necator* survives hotter than 1999 assumed — **the original rule
over-penalizes heat.** Not subtracting a penalty that was itself too aggressive is a smaller error
than the raw omission suggests. Still an upward bias; still labelled.

**KD-3 — The ledger event is (pathogen × host organ × resolution rule), not a row with an
`incubationDays` column.** Four independently-researched pathogens all refuse the scalar shape,
and they refuse it in three different ways:

| Pathogen / organ | Resolution shape | Evidence |
|---|---|---|
| Powdery (S5a) | fixed window, 5–10 d **or** 13–14 d — conflicted, see KD-4 | Delp 1954; Chellemi & Marois 1991; Bendek et al. 2007 |
| Downy leaf (S5b) | **accumulator** — Goidanich is a %-of-incubation-per-day table run to 100%, humidity-regime dependent (~1.35× spread) | Pertot et al. 2007 Tab.1; Brischetto et al. 2021 |
| Black rot **leaf** (S5b) | **accumulator** — 175 cumulative degree-days, bounds 6–24 °C | Molitor et al. 2012, *Plant Disease* 96:1054-1059 |
| Black rot **fruit** (S5b) | **phenology gate + long hold** — see the organ note below | Hoffman et al. 2002, *Phytopathology* 92:1068-1076; Wilcox 2003 |
| Botrytis bloom-latent (S5b) | **phenology gate** — quiescent ~12 weeks, resolves on veraison/sugar, **no day-count data exists in the literature** | González-Domínguez et al. 2015 explicitly excluded latency and incubation from their model; Haile et al. PMC7002552 |

⚡**v2 (D-1) — the enum ships with only the arms S5a implements.** v1 pre-declared `ACCUMULATOR` and
`PHENOLOGY_GATE` to spare S5b a migration on a live table, arguing from the scale register's
non-linear-cost warning. **Both reviewers independently rejected that** — the strongest signal in the
review. Codex: pre-declaring arms to dodge a later migration trades a hypothetical cost for a
permanently under-constrained schema, and isolated enum migrations are *already* a solved pattern
here (`20260727100000_phenology_block_enums`). Gemini: S5a implements one pathogen; do not build the
abstraction for Goidanich accumulators before anything consumes one.

**Ships:** `FIXED_WINDOW` and `UNKNOWN` only. The table above stays in this plan as the **design
rationale S5b inherits** — the research is the durable artifact, not the enum value.

**What v1 got right and v2 keeps:** the **host organ** discriminator and the **two transitions** are
not speculative. Both are required by the powdery arm alone (and organ is required by KD-4's fix),
so they are not the over-abstraction the reviewers objected to.

⚡**v2 (council C9) — add `ERADICATED`, which is a genuine missing state, not speculation.**
DMIs and strobilurins carry **kickback (eradicant) activity**: a latent infection sprayed the next
day is dead inside the leaf. Without this state the ledger projects a dead pathogen to become
infectious and prompts another application — driving exactly the resistance pressure S7a exists to
manage. Resolution arms therefore ship as `FIXED_WINDOW` | `UNKNOWN` | `ERADICATED`, the last set by
a logged spray whose chemistry carries kickback. This is a real seam into S3a's spray record and S2's
resistance data; note it for S7a rather than wiring the chemistry lookup here.

**Two refinements the black-rot research forced, both structural:**

*(a) Host organ is a first-class discriminator, not a detail.* Black rot on the same vine in the
same infection event has a **leaf** incubation of 10–12 days (Spotts 1977, primary) and a **fruit**
incubation of **3 weeks to symptom and 4–5 weeks to rot** for late-window infections (Wilcox 2003),
with Hoffman et al. 2002 observing new symptoms appearing **for over a month** after inoculating
older fruit. Susceptibility windows differ by organ too — leaves are susceptible roughly one week
from unfolding; berries from midbloom to 4 weeks (labruscana) or 6–7 (*vinifera*).
**A single 14- or 21-day close-out silently drops real late-window berry infections.** That is the
exact failure the ledger exists to prevent.

*(b) "Visible" and "infectious" are two different states, and only one of them is what a scout
sees.* For black rot, latent period ≈ incubation **+ ~2 days at ≥20 °C, up to +8 days at 5 °C**,
and pycnidia form **only at RH ≥ 90%** (Onesti et al. 2017, *Phytopathology* 107:173-183) — so a
lesion in dry air is visible but **not yet infectious**. Downy splits the same way (oil spot vs
sporangia, with sporulation gated on a separate night trigger). Powdery and Botrytis conflate them.
The event therefore carries **two projected transitions**, `symptomExpectedAt` and
`infectiousExpectedAt`, either of which may be `UNKNOWN`. Collapsing them to one date would make
the ledger unable to answer "is this block currently a source of inoculum?" — which is the question
S6 and S7a will actually ask it.

**KD-4 ⚡v2 REWRITTEN (council C1 — v1 had this backwards, and it was a safety bug).**

The literature conflict is real: Delp 1954 (5 d at optimum, 25 d at 9 °C, limits 6–32 °C),
Chellemi & Marois 1991 (5 d at 22–30 °C, 7 d at 19 °C), UC IPM (7–10 d), Ohio State (~7 d), Cornell
(5–7 d generation) cluster tightly; **Bendek et al. 2007 reports 13–14 d at 20–23 °C**, roughly
double — most likely a different endpoint (first sporulation on heavily-inoculated detached leaves vs
naked-eye colonies on whole vines), unconfirmed.

**v1 said: hold the event open on the "conservative (longer)" bound. That is inverted.** In
epidemiology a *longer* latent period is the *less* cautious assumption. Telling a grower an
infection will not be infectious for fourteen days makes them wait; if the true period is five days
the pathogen sporulates on day five and seeds a secondary epidemic while the ledger still reads
"incubating". v1 reasoned from "longer = holds the event open longer = safer" without noticing that
the ledger answers **two different questions**, and they have **opposite** safe directions.

**v2 — each transition takes the bound that errs toward "the pathogen is active":**

| Transition | Bound | Value | Why the other direction is unsafe |
|---|---|---|---|
| `infectiousExpectedAt` | **shortest** plausible | **≈5 d** | assuming later under-warns — a grower delays and the epidemic runs |
| event close / expiry | **longest** plausible | **≈14 d** | closing earlier declares a block clean prematurely |

**The conflict does not need resolving. It becomes the two ends of one interval, each used where it
is safe** — which is independent confirmation that KD-3b's two-transition design is right, since a
single date could not express this. Both citations are recorded on the event. This is rule §3.3
applied to a scientific constant, now applied in the correct direction.

**KD-5 — A clean scout never closes a modelled infection event.**
Empirically grounded, not merely asserted: **Fedele et al. 2020, *Plant Disease* 104(5):1291-1297**
scored a Botrytis model across 23 epidemics at 65% against field assessment but **>87% against
post-harvest incubation assays of symptomless berries** — the model was correctly predicting
infections that scouting could not see. Cite this in the plan and the invariant note.

**KD-6 — The index is computed per-VINEYARD and modified per-BLOCK on read.**
`VineyardClimateDaily` is keyed `(tenantId, vineyardId, localDate, providerKey)` — there is no
per-block weather. Storing a per-block index row would fabricate spatial precision the data does
not have (rule §3.7). Follows the `LotCostState` lazy-versioned-materialization precedent in the
scale register rather than eager per-block fan-out.

**KD-7 — Confidence keys on provider-vs-station agreement, never on completeness.**
S0's Madera safety inversion: Madera had the *lowest* refusal rate (0.6%) and the *worst* inputs
(5.07 °C). A band keyed on availability reports highest confidence exactly where the answer is
least trustworthy. Where no station exists to compare against, the band says so.

**KD-8 — No raw index number reaches the UI (SAFE-22). ⚡v2 (D-4): ship a categorical TREND too.**
The 0–100 index is categorical at the boundary; the number may sit behind a disclosure. S5a emits
the category, S9 styles it.

Gemini's objection is fair and worth answering rather than overruling: a bare category **hides the
derivative**. A 40 that was 30 yesterday means danger; a 40 that was 60 means a heat wave is killing
the fungus. Agronomists know this index is a 0–100 scale, and hiding it can read as evasion.
But SAFE-22 is a program rule, not my preference, so the fix satisfies both: **emit a categorical
trend — `RISING` / `STEADY` / `FALLING` — alongside the band.** That restores the momentum signal
without putting false precision on screen. Raw value stays behind the disclosure.
*If Russell would rather show the number outright, that is a SAFE-22 amendment and his call.*

**KD-9 ⚡v2 NARROWED — the estimator's identity is enforced where it CAN be** (council C10).
v1 claimed a caller "cannot obtain a risk value without destructuring an object carrying the
confidence band". **TypeScript cannot enforce that** — structural typing lets a consumer ignore
fields, narrow the type, or re-export the number, and serialization erases brands entirely. Claiming
otherwise would leave a false sense of safety in the plan.

What *is* enforceable, and what v2 requires instead:
- no exported API returns a bare numeric risk;
- `rawIndex` stays module-private, reachable only by the math and the verify script;
- the assessment is a branded wrapper with private fields, not a plain object literal;
- the **single** serializer emits `{ status, riskBand?, trend, confidence, estimator, reasonCode? }`;
- backed by compile-time tests plus the Unit 8 DTO payload test.

Rule §3.5 stays hard to violate by accident. It is no longer described as impossible.

**KD-11 ⚡v2 (council DQ) — `status` is separate from `riskBand`.**
v1 mixed "unknown" into the risk vocabulary, which gets messy at the API boundary and risks *unknown*
being styled as a risk level. Ship `status: OK | UNKNOWN | REFUSED`, with `riskBand` present **only**
when `status === "OK"`. A refusal carries its S0 cause class. This also keeps rule §3.18 clean —
S9 owns how the states look, and *unknown* is structurally not a band.

**KD-12 ⚡v2 (council DQ) — block modifiers may raise risk or widen uncertainty, never lower risk.**
Weather is per-vineyard (KD-6) and canopy observations are per-block. Letting a block modifier pull
risk *down* would make a sparse or absent observation a path to "low" — a §3.6 violation wearing a
different hat. Modifiers are monotone: they can escalate a band or degrade confidence, never
de-escalate.

**KD-10 — Correcting the runbook is a deliverable of this phase, not a courtesy.**
S0 corrected brief §7.1: powdery is *not* purely temperature-driven — **primary ascospore release
requires wetness, and liquid water suppresses secondary PM by bursting conidia**. A wetness-blind
model can recommend spraying into conditions already suppressing the pathogen. The runbook's §9
S5a scope line predates that correction and still says "temperature-only". Both statements cannot
stand. The wetness-blindness belongs in every index output's "what we don't know".

---

## 5. Implementation units

### PR 0 — the probe (no production code)

#### Unit 0: Diurnal reconstruction fidelity probe, with a pre-committed gate

**Goal:** Answer whether a reconstructed hourly curve resolves Gubler-Thomas's derived quantities
well enough to ship an index, per site regime — before writing the index.
**Files:** `scripts/probe-diurnal-fidelity.ts` (throwaway, not shipped);
`docs/spray_assistant/phases/S5a-diurnal-fidelity-probe.md` (the deliverable).
**Approach:** For all six Demo vineyards across ≥3 seasons, reconstruct hourly temperature from
the stored daily Tmin/Tmax using **Felber et al. 2018** (the recommended method, see Unit 3) and at
least one baseline (Sanders sawtooth — Reicosky found it performed as well as the sophisticated
models, so it is the honest control).

⚡**v2 — the ground truth must be STATION HOURLY, not ERA5** (council C2, a methodological defect
in v1). v1 proposed validating against Open-Meteo's ERA5 archive. **ERA5 is reanalysis — a model.**
Validating a reconstruction against it produces an agreement statistic between two models, presented
as empirical fidelity. For a number that drives spray timing that is not good enough.

- **Primary oracle: real station hourly.** Four of six Demo sites already name a station in
  `vineyard_weather_config` — `SANTA ROSA SONOMA CO AP` (an airport, so hourly METAR is published),
  `MADERA`, `OJAI`, `LAMBERTVILLE`. Pull genuine hourly observations for those.
- **Secondary: NEWA**, where a NEWA station sits near a Demo block — the runbook's named oracle.
- **Where neither exists**, the probe may still run against ERA5, but it reports
  **"consistency, not fidelity"**, and **no production confidence claim may rest on that arm.**
  Say which arm each site's number came from, in the site's own row.

⚡**v2 (D-5) — add a Bhutan-regime arm.** Gemini argues gridded reconstruction in Himalayan terrain
is not merely miscalibrated but fiction: a grid cell's mean elevation can sit 1,000 m off a valley
vineyard, and Bhutan is `GLOBAL_COARSE` / NASA POWER with no station at all. **Bhutan is a live
tenant and v1's probe omitted it entirely** — which would mean shipping an unmeasured index to a
real grower. Rule §3.12 forbids fixtures *on* the Bhutan tenant, and this does not violate it: the
probe reads public weather archives at a latitude/longitude and writes nothing. Measure the regime,
and if it fails, **the index is disabled for that tenant explicitly** rather than quietly wrong.
Evaluate every site independently — **never average the pass rate across sites or tenants.**

**Stratify the results — an aggregate number will hide the failure.** Reicosky et al. 1989 found
all reconstruction methods "worked reasonably well on clear days but with limited success on
overcast days", with 24-hour absolute mean error ranging **0.5 to 9.3 °C**, and warned that in
regions where clear days are under half the season these models may be "providing questionable
information more than one-half of the time". Report clear vs overcast separately.
Also report the **assumption-violation rate**: Felber measured Tmin occurring in the *afternoon* on
**27%** of days and Tmax before noon or after sunset on **13%** — the dominant error source, and
explicitly *not* fixable by recalibration. If Demo's sites violate at a similar rate, that is a
hard ceiling on any reconstruction, not a tuning problem.
Measure error on the **derived** quantities, in this order of importance:
1. Daily point delta agreement — does the reconstruction assign the same +20 / −10 as observed
   hourly? (This is the metric that matters; temperature RMSE is not.)
2. Consecutive-hours-in-band count, absolute error.
3. Resulting season index trajectory, MAE in points.
4. **Resulting spray-interval band** (21 / 14 / 7 day) agreement across season-days.
5. ⚡**v2** — what the **Peduto 2013** heat term *would* have changed, reported but not shipped (KD-2).

Then re-run arm 1 with Savalkar's mitigation — station monthly statistics injected into the
disaggregation — and report the error reduction.

**Pre-committed gate (fix before running). ⚡v2 — v1's gate was symmetric on an asymmetric-harm
problem** (council C3): `≥90%`/`≥95%` weighted a false-high and a false-low identically, when the
plan's own risk table says false-low is the crop-loss direction. A model could also have "passed"
by refusing so often it was rarely wrong. Four gates, not two:

- **G1 — unsafe-miss rate (BINDING).** Of decision-days where observed-hourly says the epidemic
  threshold is met (`60+`) or the interval is 7 d, the fraction where the model says `<60` or emits
  14–21 d must be **≤2%**. *This is the gate that matters; the agreement gates are secondary.*
- **G2 — coverage.** The model must actually answer on **≥80%** of in-season decision-days.
  Refusal must not be able to buy a pass.
- **G3 — agreement.** Daily point-delta agreement **≥90%** of in-season days **and** interval-band
  agreement **≥95%** of decision-days.
- **G4 — statistical adequacy.** Minimum **N = 3 full seasons of in-season days per site**, and every
  rate reported with a **binomial confidence interval**. A site cannot pass on thin data, and a point
  estimate without an interval is not a result.

Outcomes, evaluated **per site, never averaged**:
- **PASS** → all four gates. Build the index for that site's regime.
- **FAIL** → any gate. The index **refuses** in that regime and says why, exactly as ADR 0012
  narrowed S1. A regime-specific refusal is a legitimate S5a outcome, not a failed phase.
- **NO-GO for the whole index** → if every site fails and the station-statistics mitigation does not
  lift any site over the bar, S5a ships **the ledger only**, and the index moves to S5b behind S1.
**Tests:** none — this is a measurement, and its fixtures are committed for reuse by Unit 3.
**Depends on:** none.
**Verification:** the probe doc records every number including the unflattering ones, per
`verify-phenology.ts:9-11` house discipline ("worthless if we only write it down when it flatters
us"). A zero denominator is reported as "not measurable", never as 0%.

---

### PR 1 — schema slice (land first, independently; serialized behind S2b's slice)

#### Unit 1: Latent-infection enums migration

**Goal:** Land the enums alone so no column can default to a value in the same migration.
**Files:** `prisma/migrations/<ts>_latent_infection_enums/migration.sql`, `prisma/schema.prisma`.
**Approach:** ⚡**v2** — `InfectionPathogen`, `InfectionHostOrgan`, `InfectionResolutionKind`
(**`FIXED_WINDOW` | `UNKNOWN` | `ERADICATED` only** — D-1 drops the pre-declared arms),
`InfectionEventStatus`, `InfectionEvidenceSource`, and **`InfectionProjectionKind`
(`PROJECTED` | `UNKNOWN` | `NOT_APPLICABLE`)** for C7. Isolated `ALTER TYPE`/`CREATE TYPE` only —
the Windows enum rule (`AGENTS.md:80-83`), which `20260727100000_phenology_block_enums` already
models.
**Tests:** none (migration).
**Depends on:** none. **Land before Unit 2.**
**Verification:** `npx prisma generate && npx tsc --noEmit` chained in one command.

#### Unit 2: `latent_infection_event` table + RLS

**Goal:** The append-only ledger table, built to the full Phase-12 checklist.
**Files:** `prisma/migrations/<ts>_latent_infection_event/migration.sql`, `prisma/schema.prisma`,
`scripts/verify-tenant-isolation.ts`, `test/tenant-isolation.test.ts`.
**Approach:** Copy the SQL posture of `20260726200000_weather_alert_state/migration.sql` verbatim:
`tenantId` + index, `@@unique([tenantId, id])`, composite FK `(tenantId, blockId) → vineyard_block`,
org FK RESTRICT, `ENABLE` + `FORCE` + `tenant_isolation` with USING **and** WITH CHECK,
`GRANT … TO app_rls`, and the self-verifying `DO $$` block that fails the migration if RLS is
incomplete. **Do NOT add the model to `GLOBAL_MODELS`** (`src/lib/tenant/models.ts:27-61`).
Personal data never in the event payload (D19) — reference the observer by id only.

⚡**v2 — four schema corrections from council. All four were real defects.**

**(a) Event identity (C4).** v1 said the event is "keyed on pathogen × host organ". That is a
*discriminator, not an identity* — a block can carry several infection episodes of the same pathogen
and organ in one season, and a correction has nothing to point at. Ship:
`logicalEventId` (the stream) + an immutable row `id` per append + `supersedesRowId` /
`reversesRowId`. **Current state is the latest row per `logicalEventId`**, never a lookup by
pathogen/organ.

**(b) Append-only is enforced by grants, not just a trigger (C5).** A `BEFORE UPDATE` trigger does
not stop `DELETE`. **Withhold `UPDATE` and `DELETE` from `app_rls` entirely**, keep the BEFORE UPDATE
trigger as defence in depth, add a `BEFORE DELETE` guard, and keep the sanctioned purge GUC for test
teardown only.

**(c) Idempotency (C5).** `withWriteRetry` on an insert path double-inserts on retry. Every
open/resolve/correct command carries a **deterministic idempotency key with a unique index**. S3a
already solved this — reuse the `computeRequestHash` pattern (`spray/record-pure.ts:188`) rather than
inventing one.

**(d) No epistemic state in a null (C7).** `symptomExpectedAt = NULL` would conflate *unknown*,
*not applicable*, *not yet computed*, and *cleared by correction* — **v1 cited S4's
three-distinct-facts rule and then violated it in its own schema.** Each transition ships as a
timestamp **plus** `symptomProjectionKind` / `infectiousProjectionKind`
(`PROJECTED | UNKNOWN | NOT_APPLICABLE`) plus the basis that produced it.

**(e) Arm storage.** With D-1 collapsing the enum to the arms S5a implements, the arm-specific
fields are **explicit scalar columns**, not a JSON payload — which removes Codex's `jsonb` objection
(weak Prisma types, awkward CHECK constraints, unindexable arm fields) at no cost.

**Indexes (council):** `(tenantId, logicalEventId, createdAt DESC)`;
`(tenantId, blockId, pathogen, hostOrgan, status, createdAt DESC)`; and partial indexes on open rows
for `symptomExpectedAt` / `infectiousExpectedAt`, which are the "what is due now" read path.

**Tests:** tenant isolation — a foreign tenant reads zero rows through the **pooled** endpoint;
an in-place update is refused; **a `DELETE` is refused** (new); **a retried command inserts once**
(new); a shape test asserting an event cannot be written without an organ, cannot collapse the two
transitions, and **cannot express a projection state through a bare null** (new).
**Depends on:** Unit 1.
**Verification:** `npm run verify:tenant-isolation` from the MAIN checkout.

---

### PR 2 — the feature

#### Unit 3: `diurnal-core.ts` — the reconstruction

**Goal:** Pure daily→hourly temperature reconstruction whose output cannot be used without
acknowledging that it is estimated.
**Files:** `src/lib/spray/diurnal-core.ts`, `test/spray-diurnal-core.test.ts`.
**Approach:** Takes `LocalDailyRecord[]` + latitude + the site timezone, returns an object carrying
the hourly series **plus** `estimator` (the named method), `qualityClass`, and the Unit 0 measured
error band for that regime. No bare `number[]` escape hatch (KD-9).

**Default method: Felber, Stoeckli & Calanca (2018) Eq. 1a–1c**, generic parameters
`a=2.71, b=3.14, c=0.75` (*Int. J. Biometeorol.* 62:621-630, DOI `10.1007/s00484-017-1471-5`,
open access). Chosen because the exact equations, the calibrated parameters, the calibration
protocol and the full validation statistics all come from **one open primary source**, and because
it is the only variant that is day-to-day continuous and forced through both Tmin and Tmax — plain
Parton-Logan has a documented night-branch discontinuity. Its generic calibration performed no
worse than site-specific calibration in complex terrain, which matters for Demo's six regimes.

Three documented traps to avoid:
- **Do not copy TrenchR's Denver parameters into TrenchR's own function.** Its comment block lists
  values in paper order `(a, b, c)` while its code reads them as `(a, c, b)`. The mismatch yields a
  *negative* night-decay coefficient — temperature would rise overnight.
- **Parton & Logan's own published parameters disagree across secondary sources** (Reicosky 1989:
  1.80/2.20/0.88; TrenchR and `mdekauwe`: 1.86/2.20/−0.17), and nobody has resolved it against the
  primary. Another reason to take Felber, whose parameters are unambiguous.
- **Do not implement the Parton daytime row from Adeniyi & Otunla (2017) Table 1** — it does not
  match the canonical form given by Reicosky, APSIM, TrenchR and Felber, and is likely a
  transcription error.

**One error signature to carry into Unit 4:** Felber's model overestimates in the late afternoon
(ME +0.58 °C at 13:00) and underestimates in the early morning (−0.81 °C at 04:00). The late-day
warm bias sits exactly where the 21–30 °C band's upper edge and the 35 °C rule both live, so it
does not cancel out — record it on the estimator's output rather than treating error as symmetric.
**Tests:** arithmetic goldens in the house style (`phenology-stage-core.test.ts:15-33`) — a
constant-temperature series makes each expected value a fact rather than a fixture lookup. Plus the
committed Unit 0 fixture series for regression. Import the exported constants, never re-declare
literals.
**Depends on:** Unit 0.
**Verification:** `npm test test/spray-diurnal-core.test.ts`.

#### Unit 4: `powdery-core.ts` — Gubler-Thomas

**Goal:** The index, with a refusal ladder and a categorical output.
**Files:** `src/lib/spray/powdery-core.ts`, `test/spray-powdery-core.test.ts`.
**Approach:** All four UC IPM rules encoded as **exported named constants**, with the 35 °C rule
present but always returning `heatSuppressionObserved: false` and its explanation (KD-2). Season
initiation (3 consecutive qualifying days), the reset-to-0-before-60 mechanic, and the 0–100 clamp
are explicit. Output is `status` + `riskBand` (only when `OK`) + `trend` + confidence + estimator
identity, with `rawIndex` module-private (KD-8, KD-9, KD-11). Refusal ladder in `stage-core.ts`
shape, reusing S0's three cause classes, **plus the no-biofix cause from §1.0**.
**Refuse narrowly, not naively** (ADR 0012): a day whose Tmax never reaches 21 °C decides "no
qualifying hours" without needing Tmin precision; a day with a null Tmax cannot. Absence is recorded
on every verdict regardless.

⚡**v2 — the missing-day bridge is defined, not discovered** (council C11). v1 never said what
happens to the accumulator when Monday is +20, Tuesday is missing, and Wednesday is +20. Resetting
to 0 manufactures a false negative; silently holding the score may skip a real biological reset.
**Rule: carry the previous state across a single missing day and degrade confidence one band; at two
or more consecutive missing days the index goes `UNKNOWN`** and the streak does not survive. Both
behaviours get their own golden, because this is the kind of gap that is invisible until a provider
outage hits mid-season.
**Tests:** goldens for each rule; the season-initiation sequence; the reset mechanic; **the
degrade golden — missing inputs produce `unknown`, never `low`**; a golden asserting a dry spell
does not produce "low powdery risk" (SAFE-9, and the §7.1 correction); a golden asserting the
index carries its wetness-blindness statement.
**Depends on:** Unit 3.
**Verification:** `npm test test/spray-powdery-core.test.ts`.

#### Unit 5: The ledger core

**Goal:** Append-only infection-event writes and the polymorphic resolution evaluator.
**Files:** `src/lib/spray/infection-ledger-core.ts`, `src/lib/spray/infection-resolution.ts`,
`test/spray-infection-ledger.test.ts`.
**Approach:** Open an event, resolve it, or correct it — all as appended rows, never an update
(SPRAY-1 precedent), each carrying its idempotency key (Unit 2c) and writing through
`withWriteRetry` (`src/lib/db/write-retry.ts`). The resolution evaluator dispatches on
`resolutionKind`; `UNKNOWN` is a first-class arm. A grower override of a modelled event is an
**attributed appended row**, following the `spray_drying_override` precedent (SPRAY-5) — never a
mutable column. Current state is the latest row per `logicalEventId` (Unit 2a).

⚡**v2 — the two transitions take opposite bounds (KD-4), and that lives here.**
`infectiousExpectedAt` projects from the **shortest** plausible latent period; the event's close
uses the **longest**. Anyone reading this core should see the asymmetry stated in the code, because
it looks like a bug until you know why.

⚡**v2 — `ERADICATED` resolution (KD-3, council C9).** A logged spray whose chemistry carries
kickback activity closes an open latent event. S5a wires the *state and the transition*; the
chemistry lookup (which FRAC groups have eradicant action) belongs with S2's resistance data and
S7a — leave a named seam, do not fake the lookup here. Absent that lookup, this arm is only reachable
by an attributed human override, which is the safe default.
**Tests:** an event stays open across a clean scouting pass (KD-5, the runbook's named gate); an
in-place edit is refused; the `UNKNOWN` arm never reports a resolution date; `wasScouted` /
`isScoutedClean` used rather than truthiness; **`infectiousExpectedAt` is proven to use the SHORT
bound and the close to use the LONG one** (new — this is the C1 regression guard); **an eradicated
event stops projecting** (new).
**Depends on:** Unit 2.
**Verification:** `npm test test/spray-infection-ledger.test.ts`.

#### Unit 6: The read seam and DTO

**Goal:** One `server-only` seam composing index + ledger per vineyard, with per-block modifiers.
**Files:** `src/lib/spray/powdery-read.ts`, `src/lib/spray/powdery-dto.ts`,
`test/spray-powdery-dto.test.ts`.
**Approach:** Mirror `phenology/read.ts` exactly — one `Promise.all` for blocks + weather config +
timezone, the `providerKey`-filtered daily read, Decimal coercion at the boundary, `today` injected.
Index computed per-vineyard (KD-6); block-level modifiers come from S4's shipped
`fruitZoneLeafRemoval` / `hedgedThisWeek` on `BlockStatus`, honouring the three-distinct-facts rule.
The DTO carries an `honesty` block in the `weather/read-core.ts:95-100` shape.
**Tests:** DTO composition, the honesty block always populated, the "what we don't know" section
non-empty by construction (SAFE-11).
**Depends on:** Units 4, 5.
**Verification:** `npm test test/spray-powdery-dto.test.ts`.

#### Unit 7: Contributor barrel and the thin assistant tool

**Goal:** Land `query_spray_decision` thin, hard-refusing, and register the first contributor.
**Files:** `src/lib/spray/contributors.ts` (**one-line append**),
`src/lib/assistant/tools/query-spray-decision.ts`, `src/lib/assistant/registry.ts`,
`src/lib/assistant/prompt.ts`, `scripts/ai-native-allowlist.mjs`,
`docs/architecture/assistant-coverage.md` (generated).
**Approach:** `kind: "read"`, modelled on `query-climate.ts` end to end. **It must hard-refuse any
"can I spray?" decision question** (council C3) and answer only what it can ground — current
powdery pressure, its confidence, what is unknown. Refusal copy is canonical and rendered verbatim.
Decide core naming deliberately: a `*Core` export enters the `verify:ai-native` matrix
(`verify-ai-native.mjs:101-115`) and needs tool reachability; the helper modules should follow
`spray/units-core.ts:5-6` and stay out. **Do not use `GAP_ALLOWLIST`** — it is capped at 2 and may
only shrink. The four assistant files are serialized against S11.
**Tests:** see Unit 8.
**Depends on:** Unit 6.
**Verification:** `npm run verify:ai-native` (regenerate the coverage doc with `-- --write` before
push or CI reds).

#### Unit 8: Goldens, fleet discrimination, and the payload test

**Goal:** Prove routing, refusal, and that the honesty fields actually reach the model.
**Files:** `test/evals/assistant-read-tools.golden.ts`, `test/evals/assistant-fleet.golden.ts`,
`test/spray-powdery-tool-payload.test.ts` (new file).
**Approach:** Read goldens for the questions the tool *can* answer; **refusal goldens** for
"should I spray sulfur tomorrow?" (must refuse, and must never fire a write — SAFE-12); fleet
discrimination against the confusables `query_climate` and `search_knowledge_base` (mandatory per
§5). The payload test copies `test/phenology-tool-payload.test.ts:7-11` — `verify:ai-native` proves
a tool *imports* the seam but cannot prove it *serializes* anything, so assert the confidence,
estimator, and refusal fields reach the payload. Requires the tool file to export its summarizer.
**Depends on:** Unit 7.
**Verification:** `npm test`, plus `npm run eval:assistant` when `ASSISTANT_EVAL=1`.

#### Unit 9: `verify:powdery` and the NEWA oracle

**Goal:** DB-backed e2e proof, and the runbook's named validation oracle.
**Files:** `scripts/verify-powdery.ts`, `package.json` (append to the contiguous scripts block).
**Approach:** `verify-spray-record.ts` structure — a header enumerating every assertion group,
`runAsTenant(DEMO, …)` for the exercise, `runAsSystem` teardown in a `finally`, `QA-*`-prefixed
fixtures, `runId` suffixes. Assert: RLS isolation from a second org through the pooled endpoint;
the append-only trigger refuses an in-place edit; an event survives a clean scout; a missing-input
day resolves `unknown` not `low`; a Bhutan-shaped fixture runs without an EPA dependency (SAFE-19,
rule §3.9). **Report the NEWA comparison whatever it says** — `verify-phenology.ts` discipline.
**Depends on:** Units 5, 6.
**Verification:** `npm run verify:powdery` from the MAIN checkout (worktrees have no `.env`).

#### Unit 10: Invariant, registers, and the runbook correction

**Goal:** Make the phase's safety property enforceable and fix the record.

🔴 **CORRECTED 2026-07-26 during `/work`. v2 named this invariant `PEST-2-index-unknown-never-low.md`.
DO NOT CREATE THAT FILE — writing it would have silently overwritten a shipped critical invariant.**
Three independent problems with the original line, any one of them disqualifying:

1. **The number is already taken.** `docs/architecture/invariants/PEST-2-exact-match-product-resolution.md`
   exists and shipped with S2 ("product resolution is exact-match only, and no negative result is a
   clearance", severity critical, guarded by `verify:pesticide`). The register is keyed by filename;
   there is no collision check. **Always `ls docs/architecture/invariants/` before claiming an id** —
   the counter is shared across lanes exactly like the ADR counter this same unit warns about.
2. **The rule already exists.** `SPRAY-3-gap-renders-unknown.md` already carries "a coverage gap
   renders as UNKNOWN, never as clear", generically and guarded by `verify:spray-record`. The
   proposed invariant was a narrower restatement of one the repo already enforces.
3. **Its subject no longer ships.** The Unit 0 gate ruled out the index
   ([S5a-diurnal-fidelity-probe.md](S5a-diurnal-fidelity-probe.md)), so "an index with missing
   inputs is UNKNOWN, never LOW" would guard code that does not exist — and `verify:invariants`
   fails on an invariant whose `verify:` command is missing.

**Ship instead: `SPRAY-7-clean-scout-never-closes.md`** — ⚠️ **this shipped as SPRAY-6 and had to be
renumbered, so learn from it rather than repeating it.** At authoring time SPRAY-5 was the high-water
mark, so SPRAY-6 looked free. S2b then merged its OWN SPRAY-6 (#535) hours before S5a merged (#537),
and because the register is keyed by FILENAME both landed. Reading the high-water mark once is not
enough: **`ls docs/architecture/invariants/` immediately before claiming an id, AND again after any
rebase.** `verify:invariants` now fails on a duplicate id, so the next one cannot land silently. —
**a clean scouting pass never closes an open infection event.** This is the ledger's actual safety
property, it is the one thing nothing in the register currently guards, and it is empirically
grounded rather than asserted: Fedele et al. 2020 (*Plant Disease* 104(5):1291-1297) scored a
Botrytis model at 65% against field assessment but **>87% against post-harvest incubation assays of
symptomless berries** — the model was right about infections scouting could not see. Without this
rule, a diligent scout walking a clean row is precisely what silently clears a real latent
infection. `severity: critical`, `enforcedBy: app-code`, `verify: "npm run verify:latent-infection"`,
`appliesTo: src/lib/spray/`.

**Files:** `docs/architecture/invariants/SPRAY-7-clean-scout-never-closes.md`,
`docs/architecture/scale-register.md`, `docs/architecture/security-register.md`,
`docs/spray_assistant/SPRAY_ASSISTANT_RUNBOOK.md`, `docs/architecture/ux-principles.md`,
`docs/architecture/decisions/00NN-*.md`.
**Approach:** Add the SPRAY-7 note above plus its `verify:` guard, since `verify:invariants` fails
on an invariant whose guard does not exist — so this unit stays sequenced behind Unit 9. Scale
register gets a row for the **ledger's** growth (append-only rows = blocks × infection episodes ×
appends, unbounded without a retention statement) — no existing row covers append-only event volume.
⚡ *The v2 text asked for a row on the per-vineyard-per-day index table; that table is not being
built.* **Runbook: correct the §9 S5a "temperature-only" line against S0's §7.1 correction** (KD-10)
— ✅ **DONE**, landed in commit `e0d3c6c8`, along with the Unit 0 outcome in the ledger row.
`ux-principles.md` has **no rule about presenting risk or uncertainty** — the original reason to add
one was that S5a would be the first phase to render a risk state, which it no longer is; keep the
addition anyway, narrowed to how an *unknown* / incubating ledger state is presented.
**Claim the ADR number at SHIP time, not now** — 0012 is the current high-water mark and the counter
is shared, the same hazard as problem (1) above.
**Depends on:** Unit 9.
**Verification:** `npm run verify:invariants`.

#### Unit 11: QA pass and phase report

**Goal:** The standing gate.
**Files:** `docs/spray_assistant/qa/S5a-qa-report.md`, `docs/spray_assistant/phases/S5a-report.md`.
**Approach:** QA-PROTOCOL §4, **all 23 program-wide safety cases**, skipped rows given a written
reason and never left blank. SAFE-9 (dry forecast never yields "low powdery") is the headline case.
Honour the **§5 site-regime expectation**: a confident number at Russian River or Madera is a
finding, not a pass — though note this rule was written for LWD-derived outputs, and Unit 0
measures whether it transfers to a temperature-only index. Say which, explicitly.
**Depends on:** Unit 10.
**Verification:** in-browser QA per §6; writes proven in the DB with a `runAsTenant` read-back.

---

## 6. Acceptance gate

- Unit 0's probe doc exists, with every number including unflattering ones, and **all four gates
  (G1 unsafe-miss, G2 coverage, G3 agreement, G4 statistical adequacy)** evaluated **per site,
  never averaged**, against thresholds fixed before the run. ⚡**v2**
- ⚡**v2** Every site's row states which oracle produced its number — **station hourly (fidelity)
  or ERA5 (consistency only)** — and no production confidence claim rests on a consistency-only arm.
- ⚡**v2** The Bhutan regime is measured, and the index is explicitly enabled or disabled for it.
- Gubler-Thomas goldens on a committed fixture series, incl. season initiation and the reset.
- ⚡**v2** Missing-day bridge goldens: one missing day carries state with degraded confidence; two
  or more go `UNKNOWN`.
- ⚡**v2** The biofix accepts **both** arms — ascospore infection **and** flag-shoot observation —
  with a golden proving a flag-shoot season initiates without any wetness input.
- **The degrade golden: missing inputs → `unknown`, never `low`. A dry spell never yields "low
  powdery risk."**
- ⚡**v2** `status`/`riskBand` separation proven: no output carries a `riskBand` unless
  `status === "OK"`; a block modifier is proven unable to lower a band (KD-12).
- The incubation ledger keeps an event open across a clean scouting pass.
- ⚡**v2 (the C1 regression guard)** `infectiousExpectedAt` provably uses the **short** latent bound
  and the event close the **long** one. This is the safety bug council caught; it gets a named test.
- ⚡**v2** A `DELETE` against the ledger is refused, and a retried command inserts exactly once.
- "Scout not diagnose" enforced by copy tests; "what we don't know" non-empty by construction.
- The thin tool refuses a "should I spray" question and fires no write.
- Fleet discrimination against `query_climate` and `search_knowledge_base` passes.
- NEWA comparison recorded as a validation oracle where a station is near a Demo block.
- RLS/tenant-isolation case green through the pooled endpoint; append-only trigger proven.
- Bhutan-shaped fixture runs unchanged (rule §3.9).
- `verify:powdery`, `verify:ai-native`, `verify:invariants`, `verify:naming` green.
- **QA report** with all 23 safety cases addressed.

---

## 7. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **Reconstruction cannot resolve the 6-hour band** — the phase's central risk | HIGH | Unit 0's pre-committed gate. A regime-specific refusal is a legitimate outcome (ADR 0012 precedent). Station-statistics mitigation measured as a second arm. |
| **The absent 35 °C rule biases the index high** | MED | KD-2 — declared on every output. Bias direction is toward spraying, which is costly (resistance pressure) but not crop loss. |
| **Wetness-blindness recommends spraying into suppressing conditions** | MED | S0's §7.1 correction surfaced in "what we don't know" on every output; runbook corrected (KD-10). |
| **Powdery latent period is a 2× literature conflict** | MED | ⚡**v2** KD-4 — the two transitions take **opposite** bounds (short for infectious, long for close); the conflict becomes an interval, not a choice. Never averaged. |
| ⚡**v2 A flag-shoot season never initiates and the model sits at *unknown* while an epidemic runs** | HIGH | §1.0 — two-armed biofix. This was invisible in v1 and is the highest-value catch in the review. |
| ⚡**v2 An eradicant spray kills a latent infection but the ledger keeps projecting it** | MED | KD-3 `ERADICATED` arm; absent the FRAC-kickback lookup, reachable by attributed human override. |
| ⚡**v2 A retried ledger write duplicates the event** | MED | Idempotency key + unique index, reusing S3a's `computeRequestHash`. |
| **The ledger's event schema needs changing once S5b has consumers** | MED-LOW | ⚡**v2** ACCEPTED, deliberately. D-1 — both reviewers judged a future isolated enum migration cheaper than a permanently under-constrained schema, and this repo already has that migration pattern. |
| **Confidence reported highest where inputs are worst** | HIGH | KD-7 — S0's Madera inversion; confidence keys on station agreement. |
| **Reconstruction fails worst on overcast days and when Tmin lands in the afternoon (~27% of days) — neither is fixable by recalibration** | HIGH | Unit 0 stratifies by sky condition and reports the assumption-violation rate. If the ceiling is structural, the honest output is a narrower refusal, not a tuned parameter. |
| **A single close-out horizon silently drops late-window fruit infections** | HIGH | KD-3a — organ is a first-class discriminator; fruit events hold open 5 weeks. This is the failure the ledger exists to prevent. |
| **The index cannot self-initiate — Phase 1 needs leaf wetness we do not have** | HIGH | §1.0 — human-confirmed ascospore biofix, S3a legacy-mapping precedent. Unconfirmed season → *unknown*, never *low*. |
| **Calibration mismatch: the index assumes an in-canopy fruit-zone sensor; our data is 2 m screen-height gridded** | MED | UC IPM specifies a fruit-zone sensor. Nobody has quantified this offset for gridded input. Name it in "what we don't know"; it is a second, independent reason the raw index number must not reach the UI. |
| A raw 0–100 index leaks to the UI as false precision | MED | KD-8, SAFE-22. |

---

## 8. Parallel-lane and shared-file plan

| File | Contention | Handling |
|---|---|---|
| `prisma/schema.prisma` + migrations | S2b holds the token (uncommitted slice in the MAIN checkout) | PR 1 lands **after** S2b's slice merges. PR 0 and Units 3–4 need no schema and start immediately. |
| `src/lib/spray/contributors.ts` | every model lane | one-line append; S5a is first |
| `scripts/ai-native-allowlist.mjs` | every lane | one additive entry |
| `docs/architecture/assistant-coverage.md` | generated | `verify:ai-native -- --write` before push |
| `registry.ts`, `prompt.ts`, `test/evals/assistant-*` | S11 | serialize; S11 not started |
| `package.json` scripts block | every lane | append-only; land early, rebase |
| runbook §8 ledger | every lane | edit only the S5a row; never reflow |
| `NOW.md` | every lane | touch once, at ship |
| ADR number | shared counter | claim at ship; 0012 is current |
| `council-feedback.md` | `/council` default path | deviate to `phases/S5a-council-feedback.md` |

Gate tiers: branch-local (`tsc`, unit tests, goldens) parallelize; DB-backed `verify:*` and browser
QA serialize from the MAIN checkout. Always chain `npx prisma generate && npx tsc --noEmit` in one
command — a sibling lane clobbers the shared client mid-session (this bit S4 four times).

---

## 9. Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem frame | **HIGH** | Index rules verified against UC IPM; error class verified against three independent studies; RH emptiness measured on the live DB. ⚡**v2** the flag-shoot gap (C8) is now closed — v1's frame had a real hole here. |
| Scope boundaries | **HIGH** | Every exclusion traces to a standing rule or a shared-file constraint. ⚡**v2** narrowed further: the 2013 heat rule and the precip-suppression term are both measured-not-shipped. |
| Implementation units | **MEDIUM-HIGH** ⚡**v2** | Raised from MEDIUM. The schema is materially better specified after C4/C5/C7, and D-1 removed the speculative arms. **Units 3–4 remain contingent on Unit 0's outcome** — by design. |
| Test strategy | **HIGH** | House golden pattern, refusal goldens, payload test, 23 safety cases. ⚡**v2** plus named regression guards for the C1 bound inversion, the delete path, idempotency, and the missing-day bridge. |
| Risk assessment | **HIGH** ⚡**v2** | Raised from MEDIUM-HIGH. Two HIGH risks that v1 did not know about (flag shoots, eradicant kickback) are now named, and the Unit 0 gate is asymmetric to match the harm. |

**The one thing that would most raise confidence: running Unit 0.** Until it runs, whether S5a
ships an index at all is genuinely open. That is the honest state, and it is why the probe is
Unit 0 rather than a footnote.

⚡**v2 — what council changed, in one line each.** Three safety bugs in v1's own reasoning (the
inverted latent bound C1, model-validated-against-model C2, a symmetric gate on asymmetric harm C3);
two agronomy gaps (flag shoots C8, eradicant kickback C9); four schema defects (no event identity
C4, delete + retry unguarded C5, epistemic state in a null C7, premature arms C6); one overclaim
narrowed (C10); one undefined behaviour defined (C11). **The probe-first shape itself was endorsed
by both reviewers and is unchanged.**

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Council — Codex `gpt-5.4` | `/council` | Types, schema, data layer, gates | 1 | ✅ **folded in** | 7 findings: C2 fake ground truth · C3 symmetric gate · C4 no event identity · C5 delete + retry unguarded · C6 premature arms · C7 null-as-state · C10 KD-9 overclaim |
| Council — Gemini `gemini-3.1-pro-preview` | `/council` | Agronomy, product judgment | 1 | ✅ **folded in** | 6 findings: C1 inverted latent bound · C6 over-abstraction · C8 flag shoots · C9 no eradication state · C11 missing-day bridge · D-2 model integrity |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | partly covered by council D-4 (raw index vs trend) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT: ✅ READY FOR `/work`.** Both reviewers endorsed the probe-first shape. All 11 findings are
folded into v2; five design questions (D1–D5) were carried with defaults per the S3a precedent and
are marked in place. Full detail and both raw responses: [S5a-council-feedback.md](S5a-council-feedback.md).

**Start with Unit 0.** It is the phase's gate, it needs no schema, and it does not wait on S2b.
