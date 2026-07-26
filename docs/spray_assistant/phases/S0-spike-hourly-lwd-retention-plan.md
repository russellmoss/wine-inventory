---
title: S0 — Spike: hourly data path, LWD estimator, retention economics
type: phase-plan
phase: S0
wave: 1
lane: A
date: 2026-07-26
branch: claude/spray-intelligence-s0-spike-0f21b2
status: council-reconciled
depth: deep
gates: S1 only
council: ./S0-council-feedback.md
---

# S0 — Spike: hourly path, leaf-wetness estimator, retention economics

**This phase ships no production code.** It ships measurements, two written decisions, one proposed
output shape, and a go/no-go on the weather lane. It gates **S1 only** — S2, S2b, S3a, S3b, and S4
start in parallel and are unaffected by anything decided here.

**Council-reconciled 2026-07-26.** See [S0-council-feedback.md](./S0-council-feedback.md) for the
review and the adjudication of every finding. Two findings changed the plan's shape rather than its
detail — G1 (the pathogen table is agronomically wrong) and C1 (correlated error) — and §1.1 is
rewritten because of them.

Contract: [runbook §9 "S0"](../SPRAY_ASSISTANT_RUNBOOK.md). Domain: [brief §7, §9, §15](../spray-decision-discovery-brief.md).
Prior research: [data-sources design](../spray-data-sources-design.md). Council findings owned here:
**C3** (series-kind classification), **S2** (retention sized by replay horizon), **S6** (canopy modifier).

---

## 0. Prerequisites — do these before `/work`

1. **The main checkout is behind `origin/main`.** `C:\Users\russe\Documents\Wine-inventory` sits at
   `791ecf8c`, two commits behind `origin/main` (`0713e66e`). Plan 097 — the hourly forecast work,
   PR #520 — is merged upstream but absent from the main working copy: no `VineyardForecastHourly`
   model, no `forecast-hourly-read-core.ts`, and pre-097 versions of every forecast adapter. **Every
   measurement in this plan was taken against `origin/main`, which this worktree is already on.**
   `git pull` in the main checkout first, or Unit 7 measures the wrong schema.
2. **Commit the program's parent documents** — see §3, "the uncommitted-parent problem."
3. `npx prisma generate` immediately before any `tsc`, `verify:*`, or `dev`, per the parallel-lane rule.

---

## 1. Problem frame

The runbook asks three questions. Planning research and the council review changed the shape of all
three and found two the runbook does not ask. Read this section before the units — it is why the
units look the way they do.

### 1.1 The gate: measure the decision AND validate the inputs. Neither alone is sufficient.

There is no ground truth without an on-site sensor. The brief says so and forbids pretending
otherwise (§15). An accuracy gate against measured leaf wetness is therefore off the table, and the
question becomes what a defensible substitute looks like.

**The first draft of this plan proposed one substitute and the council broke it.** The argument was:
almost nothing consumes leaf-wetness duration, the two things that do are coarse, and a coarse
consumer tolerates a coarse estimator. Both reviewers killed it, from opposite directions.

**Gemini (council G1): the consumer list was wrong, because the brief is wrong.** The plan
transcribed brief §7 faithfully; brief §7 is materially incomplete against the pathology literature.

| Model | What brief §7 specifies | What the literature specifies |
|---|---|---|
| **Black rot** | three points: ~24 h @ 50 °F, ~9 h @ 60 °F, ~6 h @ 70–80 °F | **Spotts (1977, rev. 1984) is a continuous matrix**, ~50–90 °F in 2–5 °F steps. Not coarse |
| **Botrytis** | "cool, damp conditions" — no LWD | **Broome et al. (1995) is explicitly LWD × temperature** (≈15 h at 15 °C → high risk) |
| **Phomopsis** | "no numbers at all" | **Erincik et al. (2003)** gives exact LWD × temperature thresholds for cane and leaf infection |
| **Powdery mildew** | "temperature-only" | Secondary is temperature-driven, but **primary ascospore release requires wetness**, and **liquid water suppresses secondary PM** (conidia burst) — a wetness-blind PM model recommends sprays into conditions that are already suppressing the pathogen |
| **Anthracnose** | 3–4 h, mid-70s–mid-80s °F | consistent; longer wetness widens the temperature range |
| Downy | driver named, no threshold; DMCast excluded | consistent with the brief |
| Sour rot | cut — inputs not collected | consistent |

**Codex (council C1): even a correct consumer list would not have saved it.** If CART and the RH≥90%
fallback are wrong *in the same direction*, the flip rate stays low and the gate passes with no
evidence the estimator is usable. Correlated error is a second, independent epistemic problem, and
low disagreement is not evidence of correctness.

**So the gate is now two arms, and both must pass:**

> **Arm A — decision sensitivity.** Run both estimators over five real seasons at five real sites,
> then run the four *real* LWD consumers — black rot on the actual Spotts matrix, anthracnose,
> Broome botrytis, Erincik phomopsis — over both estimator outputs, and measure how often the
> consumer's classification flips. Factorial, with variance attributed across estimator choice,
> provider/model choice, wind-input quality, and consumer-spec choice, so the headline number is
> *the estimator effect at a fixed consumer spec* rather than an unattributable blend.
>
> **Arm B — input validation.** Independently, compare the reanalysis inputs against measured NWS
> station observations — RH, dew-point depression, wind, precipitation — against per-variable
> tolerances declared in advance, with its own fail state. This validates that the estimator is being
> fed plausible inputs. **It is not leaf-wetness validation and must never be reported as such.**

Arm A alone can pass on correlated error. Arm B alone says nothing about whether input error reaches
a decision. Together they bound the problem from both sides, which is the most honest thing available
without a sensor.

**And the conclusion is narrowed in writing.** Whatever S0 concludes, it concludes *"acceptable for
these four consumers, at these sites, in these seasons"* — never *"the estimator is good."* Any new
LWD consumer reopens the threshold; that is a tripwire in the ADR, not a hope.

**The brief–literature gap in the table above is itself an S0 deliverable**, routed to S5b (whose
scope grows: botrytis and phomopsis are LWD models, not the qualitative gates the brief implied) and
back to the brief as a correction.

### 1.2 Live probe run during planning: ERA5-Land has no wind — and wind is a legal gate, not just a model input

The data-sources design (§2.3) recommends **ERA5-Land (0.1°, ~11 km)** as the historical archive,
preferring it over ERA5 (0.25°, ~25 km) on resolution. Probed live at Stoney Hill and Paro on
2026-07-26 through `archive-api.open-meteo.com`:

| `models=` | temp | RH | dewpoint | **wind** | precip | cloud | radiation |
|---|---|---|---|---|---|---|---|
| `era5_land` (~11 km) | ✅ | ✅ | ✅ | **null** | **null** | **null** | **null** |
| `era5` (~25 km) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `era5_seamless` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| *(default / best-match)* | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**CART is RH + dew-point depression + wind.** The archive the design doc prefers cannot run the
estimator the design doc prefers. That is a direct resolution-versus-estimator trade, it is recorded
nowhere, and S0 has to decide it with numbers rather than inherit the doc's preference.

⚠️ **Council G4 — the second consumer of wind is the more serious one, and the first draft missed it
entirely.** The label is the law, and labels dictate maximum wind speeds for drift. **A provider
carrying null wind cannot support an application-window answer at all.** Rendering that as anything
other than *cannot determine safely* would advise a grower toward a label violation — runbook rule
§3.6's most dangerous failure mode, arriving through a door nobody was watching. So:

- **Wind availability is a hard input to the S7b legality gate**, not merely a confidence input to
  the LWD estimator. S0 does not build that gate; S0 writes the requirement into Unit 9's shape and
  routes it to S7b so the phase cannot miss it.
- The null-wind archive choice therefore has consequences beyond the weather lane.

Second measured signal from the same probe: at the same site and the same hour, `era5` reported
**RH 69%** and the default blend reported **RH 79%**. Ten points of RH is noise at 69/79 and is the
entire decision at 85/95. **Model selection alone is a first-class error source**, on par with the
estimator choice, and it is one of Unit 5's factorial dimensions rather than an assumption.

⚠️ **Council G2 — wind is also CART's weakest input.** NWS station wind is measured at 10 m in open
terrain, usually an airport; canopy microclimate is 1–2 m and blocked by topography, windbreaks, and
the trellis. Gemini concluded we should prefer RH≥90% outright; that is **rejected** — CART was
developed on standard weather-station data precisely so it could run without on-site instruments, and
our own research puts the naive threshold at ~40% more error. Choosing a measurably worse estimator to
dodge one noisy input is the wrong trade. But the concern is real and folded: **wind provenance
(station height, distance, terrain exposure) enters the confidence band**, and Unit 5 carries a
dedicated **wind-sensitivity arm**. If flips prove wind-dominated, that reopens §1.8 on evidence.

### 1.3 Live probe: there IS a free OBSERVED hourly source. Whether it can be backfilled is Unit 0's question.

Council C3 requires classifying every field OBSERVED / FORECAST / REANALYSIS. The design doc treats
OBSERVED as effectively empty — no station in our stack measures RH. Probed live on 2026-07-26:

`https://api.weather.gov/stations/{id}/observations?start=&end=` returns, for KDYL (≈8 km from the
Demo tenant's Stoney Hill site), **temperature, dewpoint, relativeHumidity, windSpeed, and
precipitationLastHour, each with a `qualityControl` flag** — the complete CART input set, measured,
QC-tagged, keyless. 78 observations in a 6-hour window, so denser than hourly.

And the constraint that may matter more than the capability:

| Requested day (from 2026-07-26) | Observations returned |
|---|---|
| 2026-07-25 (yesterday) | **78** |
| 2026-07-19 | 0 |
| 2026-07-12 | 0 |
| 2026-06-26 | 0 |
| 2026-04-26 | 0 |

**This live API is a trailing window of roughly a day or two.** The first draft of this plan concluded
from that "you ingest it or you lose it permanently" and then used the irreversibility to drive the
whole retention decision. ⚠️ **Council C2 caught the dependency inversion:** whether *some other
archive* (NCEI ISD `global-hourly`, or a state mesonet) serves the same observed data after the fact
is an **unresolved probe**, and if it does, the asymmetry driving the retention argument changes
materially. A first attempt at NCEI with a guessed USAF-WBAN identifier returned empty, so the
station-identifier mapping is unsolved — which is a gap in our knowledge, not a proven absence.

**That question is promoted to Unit 0 and must resolve before any retention conclusion or no-go
condition may cite irreversibility.**

If Unit 0 finds observed data is *not* backfillable, then the acquisition constraint has no margin:
both weather crons are **daily** — `vercel.json` schedules `/api/cron/weather-poll` at `40 15 * * *`
and `/api/cron/forecast-poll` at `10 15 * * *`, and sub-daily schedules **fail Vercel deployment on
the current plan** (the #516/#517 deploy breaker, documented in the forecast-poll route's own header).
One cron run per day against a ~1–2 day window leaves no retry headroom, and ⚠️ **a missed run is
silent as well as permanent — there is no alerting on a skipped capture** (council, unnamed risk).

⚠️ **Council C3 — and S0 cannot just report this and move on.** The first draft named permanent data
loss as a real risk and then proceeded as pure research gating a later phase. That is incoherent: if
the risk is real, waiting for S1 means the loss already happened during S0. Unit 0 therefore carries
three named outcomes, one of which is an explicit, written acceptance of irrecoverable loss. Silence
is not one of them.

⚠️ **Council G3 (design) — the same daily cadence collides with the pathology.** Downy secondary
sporulation can begin and complete in a single night. A grower asking at 08:00 when the cron ran at
00:00 is missing the most decision-relevant eight hours. **Does the system fail open or fail closed in
the intra-cron window?** The plan never said; Unit 6 now must.

Whatever Unit 0 concludes, the three series kinds remain three different acquisition modes with
different economics — *observe forward*, *forecast forward*, *reanalyze backward* — and a schema that
merely tags rows with a kind misses that.

### 1.4 The runbook's "~8,760 rows/vineyard/year" is the floor. The ceiling is a different order of magnitude.

8,760 rows/vineyard/year is correct **for observed hours**. Forecast is a different object: NWS
re-issues across a multi-day horizon on a sub-daily cadence, so every valid hour is forecast many
times before it becomes the past.

If replaying a past decision means showing what the grower was actually shown, you need the forecast
**as issued at that moment** — a bitemporal retention question:

| Retention posture for FORECAST | Rows/vineyard/year | Can you replay what the grower saw? |
|---|---|---|
| Latest issuance only (replace, the `VineyardForecastDaily` precedent) | ~8,760 | **No** |
| Every issuance retained | **two orders of magnitude higher** | Yes |

⚠️ **Council C5 — the first draft put a specific "~170×" on that and the number was inconsistent with
its own §1.5.** 8,760 × 168 assumes a 168-hour horizon; NWS hourly actually returns 156 periods, which
gives a different multiplier. Worse, it was being used as a decision argument *before* anything was
measured. **The specific multiplier is withdrawn.** The real ceiling is **derived in Unit 2 from
measured issuance cadence and retained horizon per provider**, then priced in Unit 7. The direction of
the argument is unaffected; the false precision is gone.

The order of magnitude is still the strongest argument for the snapshot branch of council S2: if a
decision record captures its own inputs at composition time, you get replay without retaining an
issuance-complete forecast history.

Worth knowing that this exact decision has already been deferred once, in code: the
`VineyardForecastDaily` model's header comment records that forecast-versus-actual accuracy history
is *"a deliberate LATER (needs its own append-only table)."* S0 is where that Later comes due, and the
existing hourly forecast table is no guide — it holds roughly **340 rows per vineyard**, replaced in
place, not accumulated. **There is no accumulating-hourly precedent in this repo to copy.**

### 1.5 Two premises the source documents carry are already stale

Both worth correcting in the source documents, because a lane that trusts them will scope wrong:

- **"Open-Meteo's adapter uses `daily=` only today."** Plan 097 changed this. `forecast-open-meteo.ts`
  already sends `hourly=temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m`
  in the *same* request as `daily=`, with `forecast_days=7` and site `elevation=` downscaling applied
  to the hourly temps too. The remaining work is three variables — `relative_humidity_2m`,
  `dew_point_2m`, `cloud_cover` — appended to an existing list, not a new request and not a new
  adapter. Data-sources design §2.3 should be corrected.
- **NWS hourly is already fetched too, from a different endpoint than the one that has what we need.**
  `forecast-nws.ts` calls `/gridpoints/{office}/{x},{y}/forecast/hourly` for 156 one-hour periods
  (temp, PoP, condition, wind) — which carries **no humidity and no dew point**. It separately calls
  the **raw** `/gridpoints/{office}/{x},{y}` and reads exactly one property off it,
  `quantitativePrecipitation`, discarding the rest. The CART inputs are in that already-fetched,
  already-parsed response.

Neither changes the plan's shape. Both change how small S1's adapter work actually is, which is
relevant to the go/no-go.

### 1.6 The brief contradicts itself on weather replay, and S0 owns the contradiction

- **§4.3:** *"Actual weather replaces forecast weather after the event — recalculate, never preserve
  the original recommendation."*
- **§17.3 (council C4):** *"Decisions replay under facts-as-of-then, with a visible flag where
  current facts differ."*

These are not reconcilable as written. The brief applies the as-of-then snapshot rule to **product
facts** only and never says what happens to weather. §4.3 is right about a *live* forecast being
superseded by what actually happened; §17.3 is right about an *audit* of a past decision. They
describe two different operations that the runbook treats as one.

⚠️ **Council C4 — and council C3's own timestamp set is short a dimension.** `seriesKind` +
`issuedAt` + `validTime` is not sufficient bitemporality for "facts as of then." You also need
**system time**: when *we* captured the row. A delayed cron run, a QC revision, or a later provider
revision of the same valid hour all break replay if you store only provider issuance and valid time.
The plan therefore specifies **three timestamps — `validTime`, `providerIssuedAt`, `ingestedAt`** —
and Unit 8 must state which one audit replay keys on. That is a correction to council C3 itself and is
routed back to the runbook.

### 1.7 Measured storage baseline (live, `muddy-shape-80817041`, 2026-07-26)

| | `vineyard_climate_daily` | `vineyard_forecast_hourly` |
|---|---|---|
| Rows | 70,389 live | 2,112 |
| Total / heap / index | 68 MB / 37 MB / 31 MB | 1,040 kB / 392 kB / 608 kB |
| Per row, all-in | ~1.07 KB | ~504 B |

⚠️ **Council C12 — these numbers are the reason to measure, not an input to any projection.** The
first draft extrapolated ~9.4 MB/vineyard-year from the daily table's per-row cost and then, in the
same breath, explained why that cost is confounded by upsert churn and by structural indexes. **The
extrapolation is withdrawn.** Both figures stand only as evidence that per-row cost varies by more
than 2× with write pattern alone, which is precisely what Unit 7 has to measure properly.

The index picture is the part that generalises:

| Index on `vineyard_climate_daily` | Size | Scans since stats reset |
|---|---|---|
| `vcd_tenant_vineyard_localDate_provider_key` | 10,120 kB | 81,703 |
| `vcd_tenant_vineyard_localDate_idx` | 8,696 kB | 270 |
| `vineyard_climate_daily_tenantId_id_key` | 7,368 kB | **0** |
| `vineyard_climate_daily_pkey` (text cuid) | 5,296 kB | **0** |
| `vineyard_climate_daily_tenantId_idx` | 544 kB | 38 |

**12.7 MB of 31 MB — 41% of the index budget — has never been scanned.** Both zero-scan indexes are
structural: the cuid primary key, and the `(tenantId, id)` composite-FK guard from the AGENTS.md
Phase-12 checklist step 5. ⚠️ **Council C10 — neither is S0's to relax.** A storage spike is the wrong
layer to reopen a tenancy safety invariant, so Unit 7 holds them **fixed** for the headline
measurement and costs the alternative only as a **non-decisionable** side result. **The hourly table's
index set still has to be designed and measured rather than inherited** — that is cheap now and
expensive once the table is live on a tenant.

### 1.8 What this reframe does not change

CART remains the default and RH≥90% the labeled-inferior fallback — settled in the design doc §2.4 and
the brief §15. S0 implements both to measure disagreement, not to re-run a bake-off. What S0 fixes is
the **bands, the refusal threshold, and the canopy modifier's shape**, plus the two data decisions.
Council G2's wind objection is the one thing with standing to reopen this, and only on Unit 5's
wind-sensitivity numbers.

---

## 2. Scope

### In scope

1. **Whether observed hourly data is backfillable**, resolved first, with an operational outcome.
2. A live field inventory across every candidate hourly provider, every field classified
   OBSERVED / FORECAST / REANALYSIS, with three-timestamp bitemporal semantics and a pre-declared
   hourly-rollup and QC-admissibility rule.
3. A committed multi-site, multi-season hourly fixture series — the artifact S1's pure tests
   (brief §19) will be written against.
4. CART and the RH≥90% fallback as pure functions, plus the two-arm gate of §1.1.
5. A written LWD decision: confidence bands, refusal threshold with cause classes, canopy-modifier
   contract for S4.
6. Retention economics measured on an isolated Neon branch against real read *and write* shapes,
   priced per series kind and per forecast-retention posture.
7. A written retention decision sized by three separately-derived horizons.
8. A **proposed** decision-record output shape (non-gating, non-binding).
9. Two ADRs, the phase report, the S0 QA report, ledger and `NOW.md` updates.

### Out of scope

- **All production code.** No `src/` changes, no Prisma models, no migrations, no adapters, no UI.
- Any schema change whatsoever. `prisma/schema.prisma` is owned by other lanes this wave.
- Building the `HourlyProvider` contract, the ingest job, Delta T, the data-confidence score, or the
  sensor-ingest seam. All S1.
- Shipping pathogen models. S0 implements four published models **only** as throwaway measurement
  probes; they are explicitly not the S5b implementations, though S5b should start from them.
- Relaxing any tenancy or RLS invariant (council C10).
- NEWA integration of any kind. Purchasing decisions.

### Lane boundary

**May touch:** `scripts/`, `docs/spray_assistant/`.
**Must not touch:** `prisma/schema.prisma`, `src/lib/pesticide/`, `src/lib/spray/`,
`src/lib/fieldnotes/`, and — added by this plan — anything under `src/`.

⚠️ **Consequence of that boundary, worth stating:** the SSRF-guarded fetch edge
(`src/lib/weather/providers/fetch-util.ts`) enforces a host allowlist that is a `Record` keyed by an
exhaustive `WeatherSourceKey` union — **adding a probe host requires editing two files under `src/`.**
S0's probes therefore use plain `fetch` from `scripts/`, which is acceptable because they are
throwaway measurement code on no production path. **S1 owns wiring every retained provider through the
guarded edge and the allowlist**, and that is a named S1 requirement, not an oversight here.

---

## 3. Shared-file and collision map

Verified at plan time. **The runbook's shared-file map is missing four entries this lane hits**;
they should be folded into the runbook §4 table.

| File | Shared with | Handling |
|---|---|---|
| `docs/spray_assistant/phases/S0-*.md`, `qa/S0-*.md` | nobody | lane-owned, safe |
| `scripts/s0-*.ts` | nobody | new files, `s0-` prefix, safe |
| **`package.json` scripts block** | **every lane adding a `verify:*`** | ⚠️ **not in the runbook map.** Append-only, one contiguous block, land early and rebase rather than merging late |
| **`SPRAY_ASSISTANT_RUNBOOK.md` §8 ledger** | **every lane, every phase** | ⚠️ **not in the runbook map.** Every lane edits a different row of one table — textually adjacent, so it conflicts. Edit only the S0 row; never reflow the table |
| **`NOW.md`** | **all four concurrent instances** | ⚠️ **not in the runbook map.** Highest-frequency conflict in the program. Touch it once, at ship, not during the build |
| **`docs/architecture/decisions/00NN-*.md`** | **any lane writing an ADR** | ⚠️ ADR numbers are a shared counter (currently through `0009`). Re-read the directory immediately before writing; claim numbers at ship time, not plan time |
| **`council-feedback.md` (project root)** | **every lane running `/council`** | ⚠️ the `/council` skill's default output path. **Deviated deliberately** — this lane wrote `phases/S0-council-feedback.md` per the program convention. Every sibling lane should do the same |

### The uncommitted-parent problem — flag before `/work`

`docs/spray_assistant/` exists **only as untracked files in the main checkout**
(`C:\Users\russe\Documents\Wine-inventory`). `git log --all -- 'docs/spray_assistant/**'` is empty:
the runbook, the brief, the data-sources design, the council feedback, and the QA protocol are on no
branch. This worktree does not have them.

Consequence: every relative link in this plan resolves only once those files land. **Somebody has to
commit the program's parent documents**, and until they do, no lane's plan is self-contained and the
runbook ledger cannot be updated by anyone. Raise it before `/work`; it is a coordination bug, not a
build task.

---

## 4. Implementation units

Unit 0 runs first and alone — it can produce an urgent scheduling finding within a day. Units 1a and 2
follow. Units 3→6 (the LWD lane) and 7→8 (the retention lane) then run concurrently. Unit 9 is
independent and non-gating.

Dependency edges: `U0←∅` · `U1a←∅` · `U2←U0` · `U1b←U2,U3` · `U3←U2` · `U4←∅` · `U5←U1b,U3,U4` ·
`U6←U5` · `U7←U1b` · `U8←U0,U7` · `U9←U8` · `U10←everything`

---

### Unit 0: Is observed hourly data backfillable? — and what do we do if it is not

**Goal:** Resolve council C2's dependency inversion before anything depends on it, and discharge
council C3's incoherence by producing an operational outcome rather than an observation.

**Files:** `scripts/s0-probe-observed-backfill.ts`; output
`docs/spray_assistant/phases/s0-observed-backfill.md`.

**Approach:** One question, answered fast: **can we retrieve past hourly observed data for our
geographies after the fact?** Probe, in order of likely yield:

- **NCEI ISD `global-hourly`.** The unsolved piece is station-identifier mapping — a guessed
  USAF-WBAN returned empty, which proves nothing. Resolve the mapping from the ISD station-history
  inventory, then test a full past season for the station nearest each Unit 3 site.
- **NWS `/stations/{id}/observations`** — establish the exact trailing-window boundary empirically
  (it sits between 2026-07-19 and 2026-07-25 as probed).
- **State mesonets** where one covers a Unit 3 site, recorded as available-or-not without integration.
- Whether any of the above carries **QC flags and RH/dew point**, not just temperature and precipitation.

Then commit to **one of three outcomes, in writing**:

1. **Backfillable.** Observed history is retrievable on demand. The irreversibility argument is
   withdrawn from §1.3 and Unit 8, and there is no scheduling urgency.
2. **Not backfillable.** Specify the minimum capture that stops the bleeding — the smallest possible
   observed-ingest job — and state plainly that it should **jump the queue ahead of the rest of S1**.
   Include the monitoring requirement, because a missed daily run is currently silent as well as
   permanent, and a capture job without alerting only moves the failure.
3. **Not backfillable, and we accept the loss.** A written, dated, attributed acceptance naming what
   is being given up and until when.

**Tests:** The probe records which identifiers and endpoints were tried and what each returned, so a
negative result is reproducible rather than an assertion.

**Depends on:** none. **Blocks:** Unit 2's classification of the OBSERVED archive, and any use of
irreversibility in Unit 8.

**Verification:** One of the three outcomes is written, dated, and — if outcome 2 or 3 — carries
Russell's decision.

---

### Unit 1a: Pre-commit the rubric and the formulas

**Goal:** Fix *how* the verdict is computed before any number exists, so it cannot be rationalised
after the measurements arrive.

**Files:** `scripts/s0-criteria.ts` (formulas, criterion names, direction of each, rubric comment).

**Approach:** Follow `scripts/gis-p0-measure.ts`, whose kill criteria sit in code above the
measurements because a council once judged its first draft's criteria to be *"sentences, not gates."*

⚠️ **Council C6 split this unit.** Pre-committing *numeric* thresholds before Unit 2 has measured what
is even being measured would be arbitrary, not rigorous. So **1a fixes the rubric**: every criterion's
name, its formula, its direction, and what a breach means. **1b (below) fixes the numbers.**

Criteria to define here:

- **Estimator-effect ceiling** — the share of infection-event classifications, across the four
  consumers, that may differ between CART and the fallback **at a fixed consumer spec**. Fixed spec is
  load-bearing: an unattributed blend of estimator and consumer-spec effects is not a gate (council C7).
- **Input-tolerance budget (Arm B)** — per-variable error bounds for RH, dew-point depression, wind,
  and precipitation against station observations, with the fail state defined.
- **Provider-spread ceiling** — how much model choice may move a consumer classification before
  provider identity must be carried in the confidence band rather than abstracted away.
- **Wind-sensitivity ceiling** — how much of the estimator effect may be attributable to wind before
  §1.8's estimator choice is reopened (council G2's escape hatch, made concrete).
- **Refusal-rate ceiling *and floor*** — a threshold firing on nearly nothing is decoration; one
  firing on most of the season makes the weather lane pointless. **Both ends are failure.**
- **Storage and latency ceilings** — per-vineyard-year bytes and p95 latency per read shape at the
  5-year projection, above which the raw-retention branch is rejected.
- **The no-go condition** — the specific combination meaning S1 should not be built as scoped.

**Tests:** None (a definitions module).

**Depends on:** none. **Execution note:** its own commit, before any measurement commit.

**Verification:** `git log` shows the rubric commit precedes every measurement commit.

---

### Unit 1b: Lock the numeric thresholds

**Goal:** Put numbers on Unit 1a's rubric, still before any result exists.

**Files:** `scripts/s0-criteria.ts` (thresholds only).

**Approach:** After Unit 2 has established what the providers actually offer and Unit 3 has
established the fixture span, set each threshold. **In its own commit, before Unit 5 or Unit 7 runs.**
The anti-rationalisation property is preserved — the numbers are fixed before the *results* exist, not
before the *units* exist.

**Depends on:** Units 2, 3. **Blocks:** Units 5, 7.

**Verification:** `git log` shows the thresholds commit precedes the first Unit 5 or Unit 7
measurement commit.

---

### Unit 2: Live hourly field inventory with series-kind classification

**Goal:** Answer runbook question 1 with evidence, and turn council C3 from a schema note into a
measured provider taxonomy.

**Files:** `scripts/s0-probe-hourly.ts`; outputs `docs/spray_assistant/phases/s0-hourly-field-inventory.md`
plus a machine-readable JSON sidecar the later units import.

**Approach:** Probe every candidate against the five sites of Unit 3, recording for each field:
presence, units, null density, native interval, and the classification triple.

| Provider / endpoint | Expected kind | What the probe must establish |
|---|---|---|
| NWS `/gridpoints/{office}/{x},{y}` | FORECAST | full field set beyond the `quantitativePrecipitation` we already parse; per-property ISO8601 interval widths (they differ per property — the plan-097 lesson); **measured re-issuance cadence and retained horizon**, which is what §1.4's ceiling is derived from |
| **NWS `/stations/{id}/observations`** | **OBSERVED** | sub-hourly cadence, the `qualityControl` flag vocabulary, station-to-site distance and elevation delta, and **station wind height and terrain exposure** (council G2 — this feeds the confidence band) |
| Open-Meteo `/v1/forecast` with `hourly=` | FORECAST | field set, issuance cadence, and whether an issuance timestamp is exposed at all |
| Open-Meteo `/v1/archive`, `models=era5_land` | REANALYSIS | confirm the null-wind/null-precip finding of §1.2 across all five sites and full seasons, not a spot check |
| Open-Meteo `/v1/archive`, `models=era5` / `era5_seamless` / default | REANALYSIS | field completeness and inter-model spread |
| NCEI ISD `global-hourly` | OBSERVED (archive) | classification only — the yes/no lives in Unit 0 |
| NASA POWER hourly | REANALYSIS | the Bhutan fallback, since `nasa_power` is that tenant's current primary |

**Three timestamps, not two** (council C4). For every field record whether it carries a `validTime`, a
distinct `providerIssuedAt`, and what our `ingestedAt` would be; whether the source is re-issued and
how often; and — the retention question — **is it re-fetchable later, or lost if not captured now**
(deferring to Unit 0 for the observed answer).

⚠️ **Council C8 — pre-declare the alignment rule here, before Unit 5 can tune it.** Station
observations are sub-hourly and QC-tagged; model products are hourly bins with their own interval
semantics. Fix in this unit: the hourly rollup inclusion window, how ragged gaps are handled, whether
precipitation is summed or maxed, which QC states are admissible, and how local-time and DST alignment
work. Without this the Arm B comparison can be tuned after the fact.

⚠️ **Council design question — is NWS `updateTime` a meaningful `issuedAt`, or just "last changed" on
a stitched product?** If different gridpoint properties come from different update streams, the
forecast replay model is wrong before storage is even considered. Establish this here.

Provider hygiene per data-sources design §6 applies even to throwaway code: NWS requires a User-Agent,
Open-Meteo requires CC BY 4.0 attribution in the output document, and a 404 is a coverage signal and
never a retry.

**Tests:** The probe fails loudly if a field the design doc marked ✅ is absent, so the doc's claims
are re-verified rather than trusted.

**Depends on:** Unit 0.

**Verification:** Every field classified with no `unknown` in the kind column; the rollup rule is
written down; the JSON sidecar parses.

---

### Unit 3: Harvest the committed fixture series — five sites, five seasons

**Goal:** Produce the data the LWD measurement runs on, and that S1 commits as its test fixture, since
brief §19 requires LWD to be a pure function tested against a committed series with no live providers.

**Files:** `scripts/s0-fetch-fixtures.ts`; fixtures under `scripts/fixtures/s0/`.

**Approach:** ⚠️ **Council G5 and G6 expanded this unit, and it is the cheapest expansion in the
plan** — the archive is free, re-fetchable, and rate-limited only by politeness. One season and four
sites would have fixed a global refusal threshold on possibly anomalous weather.

**Five sites**, spanning five wetness regimes. Four are real rows already in the database with
coordinates, timezones, and cached NWS grid references:

| Site | Tenant | Coords | Regime | Why it earns a slot |
|---|---|---|---|---|
| **Stoney Hill** | Demo | 40.329, −75.007 (PHI 53,96) | humid continental East | Black rot, downy, phomopsis, anthracnose country. Has a station ~8 km away with measured RH — **the only Arm B site today** |
| **Russian River Ranch** | Demo | 38.506, −122.854 (MTR 77,140) | coastal fog | Marine-layer dew without rain — the regime where rain-driven intuition fails hardest |
| **Madera** | Demo | 36.858, −119.997 (HNX 46,106) | hot arid interior | RH rarely reaches 90%, so the fallback reports "never wet" all season while CART may still find radiative-dew nights. **The refusal threshold's proving ground** |
| **Paro** | Bhutan (**read-only**) | 27.397, 89.422, 2302 m | monsoon, high altitude | Non-US, no NWS coverage, ERA5 only. Proves runbook rule §3.9's jurisdiction-neutrality on a live tenant's real geography |
| **NEW — a humid subtropical Southeast site** (VA / NC / MO) | fixture only | TBD | humid subtropical | ⚠️ **Council G6** — the most aggressive US disease environment: extreme nighttime humidity plus high heat, which breaks simplistic dew-point estimators. Absent from the first draft |

⚠️ **Gemini proposed dropping Bhutan to make room. Rejected.** Bhutan is a live tenant and runbook
rule §3.9 makes non-US first-class and forbids the app bricking outside the US; that outranks a site
slot. Add the fifth, keep Paro.

**Five seasons: 2021–2025 growing seasons** (roughly April 1 – October 31; ~5,100 hours per site per
season per model). ⚠️ **Council G5** — a single season guarantees blind spots. If 2025 happens to lack
a three-day rain event at 70 °F, downy and black rot pressure are never exercised at all.

**Characterize each season** (wet / dry / normal, against the 20 years of daily climate already in
`vineyard_climate_daily` for four of the five sites) so a low-pressure year is never mistaken for a
well-behaved estimator. That characterization is an output, not a note.

Fetch under **every** archive model variant, since §1.2 established model choice is itself an error
source carried through the measurement rather than collapsed early.

**Bhutan discipline:** Paro is **coordinates and a timezone only**. Nothing is written to
`org_bhutan_wine_co`; nothing is read from it beyond the lat/long/elevation already recorded. The
fixture is a flat file. This does not breach the Demo-Winery-only rule, which governs fake data and
mutations, but it is worth saying out loud rather than assuming.

**Tests:** Per-fixture shape assertions — expected hour count for the range and timezone (including
DST transitions in `America/New_York` and `America/Los_Angeles`, which `Asia/Thimphu` does not have),
no duplicate hours, no fabricated hours.

**Depends on:** Unit 2.

**Verification:** Fixtures exist for 5 sites × 5 seasons × N model variants; hour counts match; the
DST-transition days have 23 and 25 hours in the US zones; each season carries its characterization.

---

### Unit 4: CART, the RH≥90% fallback, and the two-zone canopy modifier

**Goal:** Implement both estimators so they can be measured — and shape them so S1 lifts them into
`src/lib/weather/` unchanged rather than rewriting them.

**Files:** `scripts/s0-lwd.ts` (pure, no `src/` imports, no Prisma, no React, no I/O);
`scripts/s0-lwd.test.ts` if the test runner picks up `scripts/`, otherwise assertions inline.

**Approach:**

- **CART** — the classification tree on relative humidity, **dew-point depression**, and wind speed,
  per data-sources design §2.4. It handles both the dew-eligible night window (roughly 20:00–09:00
  local) and dew-ineligible hours, so per-site local-time bucketing must be correct — which is what
  makes Unit 3's timezone assertions load-bearing.
- **RH ≥ 90%** — the naive threshold, **labeled inferior at the type level, not in a comment.** It
  must be impossible for a downstream caller to consume it without knowing which estimator produced it.

Both return wet/dry per hour **plus the inputs used and which were missing**, because the refusal
decision in Unit 6 is a function of input availability, not of the estimate. An hour with no wind
reading is not a dry hour — that distinction is the whole exercise, and getting it wrong is exactly how
a coverage gap renders as "no restriction" (runbook rule §3.6).

**The canopy modifier is two-zone, not block-wide.** ⚠️ **Council G3 — the first draft's single
block-level state was anatomically wrong.** Pathogens target organs living in different microclimates
*within the same canopy*: downy attacks foliage in the upper canopy and growing tips, botrytis targets
clusters in the fruiting zone. "Leaf-pulled VSP" means leaves pulled **in the fruiting zone only** —
the upper canopy stays dense. A block-wide fast-drying modifier would model cluster drying correctly
while badly under-predicting downy risk on the foliage. So:

- The modifier carries **two microclimates: cluster zone and foliar zone**, each with its own drying
  adjustment.
- **Every pathogen model declares which zone it reads.**
- S0 defines the shape and measures sensitivity; it does **not** calibrate the adjustment, because
  there is nothing to calibrate against. Council also flagged the risk of inventing product logic
  here — hence shape and contract only, with the numbers left to a phase that has data.
- Unit 6 turns this into a collection requirement for S4. Note for that lane: brief §17.2's block
  profile carries *cluster compactness* and *canopy vigor* but **no canopy-management state at all**.

**Tests:** Goldens on hand-built series — a clear dew night, a rain event, a windy dry night CART
should call dry and the threshold may not, an hour with wind missing (refusal-eligible, never dry),
and a Madera-shaped season where RH never reaches 90%.

**Depends on:** none (pure). **Execution note:** test-first. These goldens outlive the spike.

**Patterns to follow:** the purity discipline of `src/lib/weather/obs-time-core.ts` and `src/lib/gis/*`
— no Prisma, no React, no live providers, per runbook rule §3.13.

**Verification:** Goldens pass; a grep proves no `src/` or Prisma import in the estimator module.

---

### Unit 5: The two-arm gate — decision sensitivity and input validation

**Goal:** The measurement the whole spike turns on, in the form the council review left it.

**Files:** `scripts/s0-measure-lwd.ts`; outputs `docs/spray_assistant/phases/s0-lwd-disagreement.md`.

**Approach:** Four layers, each importing the Unit 1a/1b criteria.

**Layer 0 — source the real consumer models.** ⚠️ **Council G1 and G8.** Before measuring anything,
encode the published models rather than the brief's transcriptions: the **actual Spotts (1984) black
rot matrix** across ~50–90 °F, **Broome et al. (1995) botrytis**, **Erincik et al. (2003) phomopsis**,
and anthracnose. Same for the **wetness-interruption rule** (council G7): standard models use a
dry-period threshold of roughly 4–12 hours below the wetness threshold, radiation-dependent. **Use the
literature rule and cite it.** Do not invent an interruption threshold by observing when estimator
outputs flip — that is fitting pathology to a measurement artifact.

**Layer 1 — estimator disagreement.** Per site-season: total wet hours per estimator, disagreement
hours, distribution by hour-of-day and month, longest contiguous divergent run. **Reported per site
and per season, never pooled** — Madera and Stoney Hill behave nothing alike and a pooled number hides
exactly that.

**Layer 2 — Arm A, decision sensitivity, factorial.** ⚠️ **Council C7.** Run the four consumers over
both estimator outputs and report **variance attribution** across four dimensions: estimator effect,
provider/model effect, wind-input effect, and consumer-spec effect (now literature-fixed, so a
sensitivity check rather than a free parameter). **The gate is the estimator effect at a fixed
consumer spec.** An unattributed blend is not actionable, which is the flaw this replaces.

**Layer 3 — Arm B, input validation.** ⚠️ **Council C1 — the arm that closes the correlated-error
hole.** Compare reanalysis and forecast inputs against measured NWS station observations at Stoney
Hill (the one site with a nearby measuring station), per variable, against Unit 1b's pre-declared
tolerances, using Unit 2's pre-declared rollup and QC rules. Report per-variable error distributions
and the fail state.

**Say what this is and is not, every time it is reported: it validates the meteorological inputs
against a station 8 km away. It is not leaf-wetness ground truth and must never be presented as
validation of the estimator.**

**Tests:** The script asserts against Unit 1's criteria and exits non-zero on breach, so the verdict is
computed rather than narrated.

**Depends on:** Units 1b, 3, 4.

**Verification:** The report states, per site and per season, the estimator effect at fixed consumer
spec, the variance attribution across all four dimensions, and the Arm B per-variable results — each
with an explicit pass/fail against its criterion.

---

### Unit 6: The LWD estimator decision — bands, refusal threshold, canopy contract

**Goal:** Runbook question 3, answered in writing. Gate artifact.

**Files:** `docs/spray_assistant/phases/s0-lwd-estimator-decision.md`.

**Approach:** Convert Unit 5's numbers into five committed decisions:

1. **Which estimator runs when**, including what happens when an input is missing. Missing wind is not
   a licence to fall back silently — the fallback is labeled inferior, and rule §3.5 requires the
   estimator named at the point of display.
2. **Confidence bands defined by their inputs**, not asserted as adjectives: input completeness,
   provider kind, station distance and elevation delta, model spread from Unit 5, and — council G2 —
   **wind provenance** (station height, distance, terrain exposure).
3. **The refusal threshold**, with its measured season-wide firing rate per site and per season.
   Runbook rule §3.3 says it will fire often and legitimately; Unit 1's ceiling *and floor* bound it at
   both ends. Two things the first draft omitted:
   - ⚠️ **Council G9 — a refusal carries its cause class.** "Cannot determine because the dew-point
     input is absent" and "do not spray because it is pouring" are agronomically opposite and must
     never render as each other. *Missing-data* and *meteorologically-unsuitable* are distinct.
   - ⚠️ **Council G3 (design) — the intra-cron window.** Downy secondary sporulation can complete in a
     single night; a grower asking at 08:00 when the cron ran at 00:00 is missing the decisive eight
     hours. **State whether the system fails open or fails closed in that window**, and why.
   - The counterfactual: **what a pathogen model does when LWD refuses**, so S5b inherits a
     specification rather than a gap.
4. **The two-zone canopy contract** — the zones, the adjustment shape, and **precisely what S4 must
   collect**, written so S4's lane can implement it without reading this document. Plus the
   "calibrate wetness" grower override (council S6): itself an observation, attributed, resetting the
   clocks per brief §6 — and now zone-scoped, since a grower standing in a dry fruiting zone is not
   reporting on the upper canopy.
5. **What S0 is not entitled to conclude** — the narrowing from §1.1, written as the ADR's tripwire:
   valid for these four consumers, these five sites, these five seasons; any new LWD consumer reopens
   the threshold.

Write the honesty output here too, in the exact words a grower will read — the brief's rule is that
copy matters as much as math, and its §9 worked example puts leaf wetness in the `Confidence` and
`What we don't know` rows and never in the risk row.

**Tests:** None (a decision document); gated by review.

**Depends on:** Unit 5.

**Verification:** Every claim traces to a number in Unit 5; refusal rate stated per site and season;
S4's collection requirement is a standalone, liftable paragraph.

---

### Unit 7: Retention economics on an isolated Neon branch

**Goal:** Runbook question 2, measured — per series kind, read *and* write, per forecast-retention
posture.

**Files:** `scripts/s0-measure-retention.ts`; output
`docs/spray_assistant/phases/s0-retention-economics.md`.

**Approach:**

**Isolation first, and it is not negotiable.** All DDL and synthetic load run on a **throwaway Neon
branch** of project `muddy-shape-80817041`, created for the measurement and deleted after. The repo's
`.env` points at production and there is no dev database; a Neon branch is copy-on-write, so it is
both the cheapest and the only safe way to build and index a large table. **No DDL on the default
branch, ever; the application is never pointed at the measurement branch.** The branch is a full copy
of production including the Bhutan tenant, so deleting it is part of the unit, not cleanup.

⚠️ **Council C9 — add a hard guard, which the first draft should have had.** Before any DDL or load,
**assert the connection is not the default branch** and abort otherwise. A comment saying "never the
default branch" is not a control.

Load synthetic hourly rows shaped like a real `VineyardWeatherHourly` — the CART inputs, plus
`seriesKind` / `validTime` / `providerIssuedAt` / `ingestedAt` per §1.6, plus tenant columns per the
AGENTS.md Phase-12 checklist — at three scales: 1 vineyard-year, 10 vineyard-years, and the 5-year
projection for the current vineyard count.

Measure five things:

1. **Per-row cost by series kind, under each kind's real lifecycle.** ⚠️ **Council C9** — the first
   draft would have bulk-inserted once and measured, which understates churn-heavy patterns badly.
   Forecast "replace in place" creates dead tuples, VACUUM pressure, and different index locality than
   a one-time load. So: benchmark **append-only OBSERVED separately from churn-heavy FORECAST**, with
   repeated issue/replace/prune cycles, `VACUUM`/`ANALYZE` between phases, and **explicit bloat
   measurement**. Otherwise the ceilings are not credible.

2. **Write-path cost**, which a storage spike that measures only reads would miss entirely (council
   C9): insert, upsert-on-conflict, delete, and prune latency, plus maintenance behaviour.

3. **The physical-design experiment.** ⚠️ **Council design question — the first draft framed this too
   narrowly** as "`seriesKind` in the index or in the predicate." With three lifecycles this different,
   the real alternatives are **partial indexes, separate tables per kind, or partitioning by kind or
   recency**, and all should be costed. Within that: is a text `cuid` primary key affordable at hourly
   grain, or does the row want a natural composite key?
   ⚠️ **Council C10 — tenancy invariants are held fixed.** The `(tenantId, id)` composite-FK guard and
   the RLS policy stay in every arm of the headline measurement. The alternative key shape is costed
   only as a **non-decisionable side result** — an input to a future tenancy-rules conversation, never
   a conclusion S0 draws.

4. **Read latency for the shapes the consumers actually issue**, `EXPLAIN (ANALYZE, BUFFERS)` on each:
   - S5b black rot: contiguous wet-run scan for one vineyard over a date range, **observed only**
   - S5b downy secondary: night-hour filter on temperature and RH over a range
   - S6 residual: open-ended range from an arbitrary application timestamp to now, summing
     precipitation and integrating temperature
   - S7b: forward forecast hours from now, latest issuance only
   - **Replay** — the inputs to a decision made at time D. On the retain-every-issuance branch this is
     the genuine bitemporal read keyed on the timestamp Unit 8 designates, **not an `issuedAt <= D`
     approximation** (council C4), and it is the one most likely to be slow
   - **The C3 contract read** — a historical read that must exclude forecast rows. This is a
     performance question wearing a correctness question's clothes: get it wrong and the safe query is
     the slow one, which is how the safe query stops getting written

5. **The §1.4 forecast ceiling**, priced from Unit 2's *measured* cadence and horizon rather than an
   assumed one: latest-issuance-only versus every-issuance-retained, at all three scales.

**Tests:** Asserts against Unit 1b's storage and latency ceilings; exits non-zero on breach.

**Depends on:** Unit 1b. Independent of the LWD lane.

**Execution note:** Runs from the **main checkout** — worktrees have no `.env`. `npx prisma generate`
immediately before. Branch deletion in a `finally`; the report records the branch id and its deletion.

**Verification:** Measured bytes and p95 latencies per read shape per scale per physical design;
bloat measured after churn cycles; no leftover `s0-*` branch.

---

### Unit 8: The retention decision — three horizons, one policy per series kind

**Goal:** Runbook question 2 and council S2, in writing, plus the resolution of §1.6's contradiction.
Gate artifact.

**Files:** `docs/spray_assistant/phases/s0-retention-decision.md`.

**Approach:**

1. **Derive three separate horizons, not one.** ⚠️ **Council C13 — the first draft conflated them, and
   they need not agree:**
   - **Raw-recomputation horizon** — how far back must we be able to *recompute* an index from raw
     weather?
   - **Decision-replay horizon** — how far back must a past decision be *explicable*, which a snapshot
     can satisfy without raw data?
   - **Legal-record horizon** — how long must the underlying record survive independently? ⚠️
     **Council G-design-1 supplies the first real number: EPA Worker Protection Standard and state
     rules (e.g. CA DPR) require spray records retained 2–3 years, and an audit in year three must
     show *why* a spray was legal — including the wind at application.** That last clause matters: it
     means wind-at-application must survive in the record, which ties back to §1.2's legal gate.

   Then state which artifact each horizon governs. Also bound the outer edge from the consumers: a late
   spray correction event (rule §3.14, propagating to four consumers), the lot-residue flag following
   fruit into the cellar through blending (S8) and therefore living as long as the wine does, and
   harvest-date re-evaluation (council C8).

2. **Separate the two operations §1.6 conflates.** *Supersession* — a forecast replaced by what
   actually happened, brief §4.3 — is forward-looking and correct. *Replay* — reconstructing a past
   decision for audit, §17.3 — is backward-looking and equally correct. Different reads, different
   retention. Draft the amendment sentence for the runbook and the brief, since the contradiction is
   load-bearing for S1's schema.

3. **Fix the replay timestamp.** State which of `validTime` / `providerIssuedAt` / `ingestedAt` audit
   replay keys on, and why (council C4).

4. **Decide the council S2 fork with Unit 7's numbers**: retain raw hourly to the horizon, **or**
   snapshot decision inputs so decisions stay reproducible after raw hourly is pruned. The forecast
   ceiling and the irreversibility finding — **as Unit 0 resolved it, not as §1.3 assumed it** — point
   toward a split answer per series kind: plausibly retain observed, replace forecast, backfill
   reanalysis on demand. But the decision belongs to the measurements.

5. **If the answer is snapshots, specify the snapshot**: what a decision record captures at composition
   time so it replays without raw hourly. That specification is an input to Unit 9 and to S9, and it is
   the same shape as the facts-as-of snapshot council C4 already requires for product facts — reuse the
   pattern rather than inventing a second one.

6. **Name the pruning invariant** for `docs/architecture/invariants/`, with its `verify:` guard, per
   runbook §11. The runbook already nominates *"a forecast row never satisfies a historical read"*;
   determine whether pruning needs a second one.

**Tests:** None, but it must state the retention job's acceptance test in terms S1's gate can
implement — the runbook requires S1 to prove the job prunes *without breaking replay*, and that test is
only writable once this decision exists.

**Depends on:** Units 0, 7.

**Verification:** Three horizons derived and attributed; the replay timestamp named; the fork decided
with numbers; the §4.3/§17.3 amendment drafted; the invariant named.

---

### Unit 9: Propose the decision-record output shape *(non-gating, non-binding)*

**Goal:** Give downstream models a starting contract so eight phases do not each invent a return
shape and S9 does not spend its budget reconciling them.

⚠️ **Council C11 — status corrected.** The first draft called this a deliverable of a phase that
"gates S1 only," which was self-contradictory: the shape ripples into every lane. It stays, because the
runbook explicitly scopes it here and deleting it recreates the problem it exists to prevent. But it is
**non-gating** — it cannot block S0's verdict — and **non-binding**: a proposal S9 adopts or amends,
which no other lane is required to build against. "Sketch" became "propose" to make that unambiguous.

**Files:** `docs/spray_assistant/phases/s0-decision-record-shape.md`.

**Approach:** Brief §9 gives a fixed-width worked example and a prose contract. **There is no typed
schema anywhere in the brief.** Propose one — a shape sketch and field table, not implementation code.

Constraints the shape must make structurally impossible to violate, each traced to its rule:

| Constraint | Source | How the shape enforces it |
|---|---|---|
| `Decision` is one of four values including *cannot determine safely* | brief §9 | closed union, not a string |
| **A refusal carries its cause class** — missing-data vs meteorologically-unsuitable | **council G9** | the refusal member is itself discriminated; the two never render as each other |
| Every risk and protection line carries a `why` | brief §9 | the `why` is required alongside the value, not a sibling optional |
| `whatWeDontKnow` is **never empty by construction** | brief §9, SAFE-11 | non-empty collection; "we know everything" is an explicit member, not an empty list |
| Risk and confidence are always two numbers | rule §3.4, brief §15 | never a single composite score anywhere |
| No percentage reaches the UI | council S1, SAFE-22 | protection is categorical + drivers; the internal number is not in the DTO at all |
| A block reason is rendered verbatim | council D2, SAFE-23 | opaque `blockReasonCode` **and** a canonical human string, both required |
| A coverage gap never renders as no-restriction | rule §3.6, SAFE-3/4 | *gap*, *no-code-exists*, and *clear* are distinct members, never a nullable boolean |
| Estimated is labeled, with the estimator named | rule §3.5, SAFE-8 | every modeled value carries its estimator identity |
| **Wind availability gates the application window** | **council G4** | a null-wind provider yields *cannot determine safely* on the legal window — structurally, not by convention |
| A forecast row never satisfies a historical read | council C3, SAFE-21 | every weather-derived input carries `seriesKind` + all three timestamps |
| Decisions replay under facts-as-of-then | council C4 | the facts snapshot is part of the record, not a join |
| Five-state visual vocabulary with an operational instruction each | rule §3.18, council D3 | closed union; S9 owns the tokens |

If Unit 8 chooses snapshots, this record **is** the snapshot and its field list must be sufficient to
replay the decision without the raw hourly series — which is why Units 8 and 9 are mutually
constraining and in the same phase.

Mark what is proposal versus what is a rule inherited from elsewhere. Do not over-specify fields for
phases S5a–S7b that have not been designed.

**Tests:** None. Reviewed against brief §9's worked example — it must be expressible with nothing lost.

**Depends on:** Unit 8.

**Verification:** The §9 worked example round-trips; every row above points at a structural mechanism,
not a convention.

---

### Unit 10: Gate artifacts — ADRs, phase report, QA report, ledger

**Goal:** Close the phase to the runbook's standard so S1 can start.

**Files:** `docs/architecture/decisions/00NN-hourly-weather-retention-and-replay.md`,
`docs/architecture/decisions/00NN-leaf-wetness-estimator-bands-and-refusal.md`,
`docs/spray_assistant/phases/S0-report.md`, `docs/spray_assistant/qa/S0-qa-report.md`,
the runbook §8 S0 row, `NOW.md`.

**Approach:**

**The two ADRs** are required by runbook §11. Thin — decision, context, consequences, tripwire — with
the phase documents carrying the measurements. **The LWD ADR's tripwire is §1.1's narrowing**: valid
for four named consumers at five sites across five seasons; any new LWD consumer reopens it. Claim ADR
numbers by re-reading `docs/architecture/decisions/` immediately before writing, per §3. Add the
context-ledger entries and a scale-register entry.

**The QA report** needs care, because runbook rule §3.16 makes it non-waivable and S0 ships no
surface. The honest report is not "N/A":

- Enumerate **all 23 SAFE cases** from QA-PROTOCOL §4, each marked *not-yet-applicable* **with the
  specific reason and the phase that will first make it testable**. The protocol is explicit that a
  blank row reads as a pass. This establishes the baseline table every later phase fills in, which is
  worth more than the zero cases S0 could actually run.
- Record `verify:naming` green before and after.
- Record that **no tenant row was written or mutated in any tenant**, with the read-back proving it —
  the persistence proof for a phase that persists nothing.
- Record the Neon measurement branch's creation and deletion, the one piece of state S0 does touch.

**The phase report** carries gate evidence plus **the lessons that change later phases**. On current
evidence those are at least: the **brief §7 pathogen-table correction** (S5b's scope grows — botrytis
and phomopsis are LWD models); **wind as a legal gate** (S7b); the **three-timestamp correction to
council C3** (S1's schema); the null-wind finding rewriting data-sources §2.3; Unit 0's
backfillability verdict and any scheduling consequence; the forecast-retention ceiling; the §4.3/§17.3
amendment; the **two-zone canopy collection requirement** (S4); and the missing shared-file entries
from §3. **A lesson that changes a later phase means editing the runbook, not just the report.**

**Depends on:** Units 0, 2, 5, 6, 7, 8, 9.

**Verification:** Runbook §8 S0 row links plan, council feedback, PR, QA report, and phase report;
both ADRs exist; `verify:naming` green.

---

## 5. Test strategy

No application surface, so the pyramid is inverted: assertions live in the measurement scripts and
review lives on the decision documents.

| Layer | What it covers |
|---|---|
| **Goldens (Unit 4)** | The estimators, on hand-built series. S1 inherits them — they outlive the spike |
| **Fixture shape assertions (Unit 3)** | Hour counts, DST transitions, no duplicate or fabricated hours, season characterization |
| **Criteria assertions (Units 5, 7)** | Each measurement script imports Unit 1's criteria and exits non-zero on breach, so the verdict is computed rather than argued |
| **Probe self-checks (Units 0, 2)** | Fail loudly if a field the design doc marked ✅ is absent; a negative result records what was tried so it is reproducible |
| **Review (Units 6, 8, 9)** | Decision documents, gated by `/council` and by Russell |

Explicitly **not** run: `verify:ai-native` (no new core), `verify:tenant-isolation` (no new table),
browser QA (no surface). Each recorded as not-applicable with its reason rather than skipped silently.

---

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **The gate still passes on correlated error** — both estimators wrong the same way, Arm B's single station insufficient | HIGH | Arm B exists because of council C1, but only Stoney Hill has a nearby measuring station. Report Arm B's coverage honestly; if one station is the whole validation set, say so in the ADR and treat the conclusion as correspondingly narrow |
| **The brief's pathogen table is wrong in ways we have not yet found** | HIGH | G1 found four errors in one table. Unit 5 layer 0 goes to primary sources for all four consumers. Anything else the brief asserts about disease weather should be treated as unverified until checked |
| **Observed coverage is too sparse to support CART at enough sites** | HIGH | ⚠️ *Named by council, absent from the first draft.* NWS station coverage, QC completeness, and nearest-station representativeness vary sharply by vineyard. Unit 2 measures distance, elevation delta, wind height, and QC completeness per site — and "too sparse" is an admissible **no-go**, not just a caveat |
| **Silent cron failure** — a missed daily capture is undetected as well as permanent | HIGH | ⚠️ *Named by council.* Unit 0 outcome 2 must include the monitoring requirement, not just the capture job. A capture job without alerting moves the failure rather than fixing it |
| **Wind noise dominates CART** and we have committed to it anyway | MED | Unit 5's wind-sensitivity arm, with a Unit 1a ceiling that reopens §1.8 on evidence rather than on argument |
| ERA5-Land's missing wind forces the archive onto 25 km ERA5 | MED | Measured, not assumed. The hybrid (ERA5-Land for temperature and RH, ERA5 for wind) is one of Unit 5's arms |
| **Observed data lost between S0 and S1** | MED | Unit 0 resolves it first and forces one of three written outcomes, including an explicit acceptance of loss |
| Retention measured on rows that do not match real write patterns | MED | Unit 7 measures per series kind under each kind's real lifecycle, with churn cycles, VACUUM, and bloat measurement |
| Five seasons still miss a severe epidemic year | MED | Unit 3 characterizes each season against 20 years of daily climate, so a low-pressure fixture set is visible rather than silent |
| A Neon measurement branch left running or confused for production | MED | Not-the-default-branch assertion before any DDL, branch id recorded, deletion in a `finally`, deletion asserted in the QA report |
| Unit 9's proposed shape is treated as binding by a sibling lane | LOW | Marked non-binding in its own title and first paragraph |
| ADR number / `package.json` / ledger / `NOW.md` / root `council-feedback.md` collision | LOW | §3 collision map |
| The program's parent documents are never committed | LOW but blocking | §3. Raise before `/work` |

---

## 7. Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem frame | **MEDIUM-HIGH** | The measured findings are live-probed and stand. But council G1 showed the frame inherited a wrong domain premise from the brief without checking it, which is a caution about the rest of the brief, not just that table |
| Scope boundaries | **HIGH** | No production code, no schema; the `src/`-boundary consequence for the fetch edge is now explicit |
| Units 0–3 (backfill, criteria, probe, fixtures) | **HIGH** | Endpoints probed live; sites verified in the database; the `gis-p0-measure` precedent applies directly |
| Unit 4 (estimators + two-zone canopy) | **HIGH** | Pure functions with goldens. The two-zone correction is structural and cheap now |
| Unit 5 (the two-arm gate) | **MEDIUM** | Design is much stronger post-review, but Arm B rests on one station. If Unit 2 finds no usable station near the other sites, the validation arm is thinner than it looks |
| Unit 6 (LWD decision) | **MEDIUM** | Depends on numbers that do not exist yet — that is what a spike is. Disciplined by Unit 1's pre-committed rubric |
| Units 7–8 (retention) | **MEDIUM** | Approach and isolation are solid; the legal horizon now has a real 2–3 year floor from council. The lot-residue horizon is still open |
| Unit 9 (proposed shape) | **MEDIUM** | Well-sourced constraints; risk is over-specifying for undesigned phases, mitigated by non-binding status |
| Unit 10 (gate artifacts) | **HIGH** | Mechanical, and the QA-report shape is specified rather than improvised |

**What would raise the MEDIUMs:** for Unit 5, confirmation that a usable measuring station exists near
more than one fixture site. For Unit 8, a decision on how long a lot's residue flag must stay
explicable — plausibly much longer than the 2–3 year regulatory floor, since it follows the wine.

---

## 8. Open questions for Russell

1. **Was brief §7's pathogen table meant to be exhaustive?** Council G1 says it is materially
   incomplete — Botrytis/Broome, Phomopsis/Erincik, and PM primary infection all consume wetness.
   Correcting it is a brief edit, and **S5b's scope grows with it**.
2. **Is the two-zone canopy model (cluster zone / foliar zone) accepted**, given it expands what S4
   must collect? Cheap now, expensive to retrofit.
3. **Does the wind-is-a-legal-gate finding change S7b's scope**, and should it go into the runbook's
   risk register now rather than when S7b is planned?
4. **Confirm the 2–3 year regulatory retention floor** for pesticide application records, and decide
   how long the lot residue flag must stay explicable.
5. **If Unit 0 finds observed data unbackfillable, does a minimal capture job jump the queue ahead of
   the rest of S1?** A schedule decision, not a technical one.
6. **Is Arm B acceptable if only one fixture site has a nearby measuring station?** If not, site
   selection should be re-weighted toward stations rather than regimes.