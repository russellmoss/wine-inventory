---
title: S0 spike — council feedback
type: council-feedback
subject: docs/spray_assistant/phases/S0-spike-hourly-lwd-retention-plan.md
phase: S0
date: 2026-07-26
reviewers: Codex (gpt-5.4 — measurement methodology, data layer, gates) · Gemini (gemini-3.1-pro-preview — plant pathology, liability, product logic)
status: reconciled
---

# Council feedback — S0 spike plan

**Note on file location.** The `/council` skill's default output path is `council-feedback.md` in the
project root. Deviated deliberately: three sibling lanes are running `/council` concurrently and would
all write that same file. This follows the program's own convention
([phases/README.md](./README.md)): `S<n>-council-feedback.md` alongside the plan.

Adjudication uses the program's convention: **FOLD** (accept as stated), **FOLD-MODIFIED** (accept
the problem, reject the proposed fix), **DECISION** (needs Russell), **PUSH BACK**.

---

## Headline

**The plan's central reframe survives, but only after being narrowed — and it was very nearly fatal.**

Both reviewers attacked §1.1 from opposite directions and both landed:

- **Gemini** says the LWD-consumption table is agronomically wrong. Botrytis (Broome), Phomopsis
  (Erincik), and powdery-mildew primary infection all consume wetness in the real literature, and the
  Spotts black-rot curve is a continuous matrix, not three points. **The table describes what our
  brief says, not what the pathology says**, and the brief is incomplete.
- **Codex** says even a correct consumer list would not save the gate, because if both estimators are
  wrong *in the same direction* the flip rate stays low and the plan declares success with no
  evidence the estimator is usable. Correlated error, not merely absent ground truth.

Between them: **"a coarse consumer tolerates a coarse estimator" is not a safe argument, because the
consumers are not as coarse as our brief made them look and low disagreement is not evidence of
correctness.** The reframe stays — measuring the decision rather than the estimate is still the right
instinct — but it is demoted from *the gate* to *one arm of the gate*, and an independent
input-validation arm is added beside it.

Neither reviewer challenged the retention analysis's direction, the series-kind asymmetry, the Neon
branch isolation, or the pre-committed kill criteria. Those held.

---

## CRITICAL

### G1. The LWD-consumption table is agronomically false ⟶ **FOLD**
*Gemini, CRITICAL 1 — the most valuable finding in the review*

The plan's §1.1 table says only black rot and anthracnose consume LWD. Gemini's corrections:

| Model | Plan said | Reality |
|---|---|---|
| **Black rot** | "three points an order of magnitude apart" | **Spotts (1977/1984) is a continuous matrix**, ~50–90 °F in 2–5 °F increments. Not coarse |
| **Botrytis** | "No" | **Broome et al. (1995) is explicitly LWD × temperature** (e.g. ~15 h at 15 °C → high risk). Bloom and veraison are moisture-driven |
| **Phomopsis** | "no numbers at all" | **Erincik et al. (2003)** gives exact LWD × temperature thresholds for cane and leaf infection |
| **Powdery mildew** | "temperature-only" | Secondary is temperature-driven, but **primary ascospore release requires wetness**, and **liquid water suppresses secondary PM** (conidia burst). A PM model blind to wetness recommends sprays when the pathogen is already suppressed |

This is a defect in the **brief**, which S0 inherited and then reasoned from. The plan's table is a
faithful transcription of a document that is wrong.

**Folded as:**
1. §1.1's table is relabelled *"what the brief specifies"* and a second column added: *"what the
   literature specifies."* The gap between them becomes an S0 **finding**, routed to S5b and to the
   brief itself.
2. The tolerance argument is cut. "A coarse consumer tolerates a coarse estimator" comes out.
3. Unit 5's consumer set expands from two to four: black rot (real Spotts matrix), anthracnose,
   **Botrytis (Broome)**, **Phomopsis (Erincik)**. Four consumers with real published thresholds is a
   *better* flip measurement than two straw ones, so this strengthens the unit rather than bloating it.
4. Sourcing those three published models becomes explicit S0 work (Unit 0, new).

### C1. Low flip rate does not prove the estimator works — correlated error ⟶ **FOLD**
*Codex, CRITICAL 1*

If CART and RH≥90% are wrong in the same direction, flips stay low and the gate passes on no
evidence. The plan treated "no ground truth" as the only epistemic problem; correlated error is a
second, independent one.

**Folded as:** Unit 5 gains a **fourth layer — met-input validation**, run against NWS station
observations, with pre-declared tolerances per variable (RH, dew-point depression, wind, precip) and
its own fail state. It validates the *inputs*, never the wetness output. And the plan's conclusion is
narrowed in writing to *"acceptable for these four consumers at these sites,"* never *"the estimator
is good."*

### G2. Off-site 10 m wind is a poor proxy for in-canopy wind ⟶ **FOLD-MODIFIED**
*Gemini, CRITICAL 2*

NWS station wind is 10 m in open terrain, typically an airport. Canopy microclimate is 1–2 m, blocked
by topography, windbreaks, and the trellis. Gemini concludes we should therefore prefer RH≥90% over a
wind-dependent CART.

**Where Gemini is right, and folded:** wind is the *weakest* CART input and the plan treated all three
inputs as equally trustworthy. Wind provenance (station height, distance, terrain exposure) belongs in
the confidence band, and Unit 5 must report CART's sensitivity to wind specifically — if flips are
wind-dominated, that is the finding.

**Where I push back:** CART was developed *on standard weather-station data*, precisely so it could
run without on-site instruments, and our own research puts the naive RH≥90% threshold at ~40% more
error. Preferring a measurably worse estimator because a good one has a noisy input is the wrong
trade. It also collides with a settled decision (§1.8).

**Folded as:** CART stays the default. A **wind-sensitivity arm** is added to Unit 5, wind provenance
enters the confidence band in Unit 6, and if the sensitivity measurement shows wind noise dominates,
that reopens §1.8 with evidence instead of by assertion.

### G3. The canopy modifier must be organ-specific, not block-wide ⟶ **FOLD**
*Gemini, CRITICAL 3 — clearly correct and cheap to fix now*

Pathogens target organs living in different microclimates *within the same canopy*. Downy attacks
foliage (upper canopy, growing tips); Botrytis targets clusters (the fruiting zone). "Leaf-pulled VSP"
means leaves pulled **in the fruiting zone only** — the upper canopy stays dense. A block-wide
fast-drying modifier would correctly model cluster drying while badly under-predicting downy risk on
the upper foliage.

**Folded as:** the modifier becomes **two microclimates — cluster zone and foliar zone** — and each
pathogen model declares which zone it reads. This changes what S4 must collect, and Unit 6's
collection requirement is rewritten accordingly. Retrofitting this later would be expensive; it costs
nothing now.

### G4. Null wind breaks the legal spray gate, not just LWD ⟶ **FOLD**
*Gemini, CRITICAL 4 — the finding with the widest blast radius, and it lands outside S0's lane*

The plan framed ERA5-Land's null wind purely as an obstacle to CART. But **the label is the law**, and
labels dictate maximum wind speeds for drift. A provider carrying null wind cannot support an
application-window answer at all. Rendering that as anything other than *cannot determine safely*
would advise a grower toward a label violation — which is precisely runbook rule §3.6's most dangerous
failure mode, arriving through a door nobody was watching.

**Folded as:** §1.2 is rewritten — null wind is a **two-consumer** problem (LWD *and* the S7b
application-window legality gate), and the second consumer is the more serious one. **Wind
availability becomes a hard input to the legal gate, not just a confidence input**, written into
Unit 9's shape and routed to S7b as a named requirement. S0 does not build it; S0 makes sure S7b
cannot miss it.

### C2. Dependency inversion — "observed is irrecoverable" is asserted before Unit 2 tests it ⟶ **FOLD**
*Codex, CRITICAL 2*

§1.3, §1.4, and Unit 8 all lean on observed data being unrecoverable, but whether NCEI ISD closes the
backfill gap is an *unresolved Unit 2 probe*. If archival observed data is usable for our
geographies, the asymmetry driving the whole retention decision changes.

**Folded as:** *"Is historical observed recoverable for these geographies?"* is promoted to a
first-class Unit 2 output that **must resolve before Unit 8 may use irreversibility in any argument**,
and before any no-go condition may cite it. The Unit 2 → Unit 8 edge is made explicit in the DAG.

### C3. S0 gates only S1, yet observed loss happens *during* S0 ⟶ **FOLD**
*Codex, CRITICAL 7 — and Gemini's design question 3 compounds it*

The plan names permanent daily data loss as a real risk, then proceeds as pure research gating a later
phase. Incoherent: if the risk is real, waiting for S1 means the loss already happened.

Gemini sharpens the same point from the grower's side: downy secondary sporulation can complete in a
single night. A grower asking at 08:00 when the cron ran at 00:00 is missing the most critical eight
hours. **Does the system fail open or fail closed in the intra-cron window?** The plan never says.

**Folded as:** a new **Unit 0** lands first and answers one question in a day, not a phase — is
observed backfillable (NCEI), and if not, what is the minimum capture that stops the bleeding? It
carries three outcomes: backfillable → no urgency; not backfillable → a minimal capture job jumps the
queue ahead of the rest of S1; or a **written, explicit acceptance of irrecoverable loss.** Silence
stops being an option. The intra-cron fail-open/fail-closed question is added to Unit 6's refusal
specification.

### C4. `issuedAt` + `validTime` is not sufficient bitemporality ⟶ **FOLD**
*Codex, CRITICAL 4*

Council C3 asks for `seriesKind` + `issuedAt` + `validTime`. That is still short a dimension: you need
**system time** — when *we* captured the row. Delayed cron runs, QC revisions, and same-valid-hour
provider revisions all break replay if you only store provider issuance and valid time.

**Folded as:** the plan now specifies **three timestamps** — `validTime`, `providerIssuedAt`,
`ingestedAt` — and Unit 8 must state which one audit replay keys on. Unit 7 benchmarks the real
replay query rather than an `issuedAt <= D` approximation. This is a correction to council C3 itself
and is routed back to the runbook.

### C5. The 170× forecast arithmetic is inconsistent and used before it is measured ⟶ **FOLD**
*Codex, CRITICAL 3*

Caught cleanly. 8,760 × 168 = 1,471,680 assumes a 168-hour horizon, but the plan's own §1.5 says NWS
hourly returns **156** periods — which gives 1,366,560 and a **156×** spread. And either way the
number is being used as an argument before Unit 2 measures actual issuance cadence and retained
horizon per provider.

**Folded as:** the specific multiplier comes out of §1.4 and is replaced by an order-of-magnitude
statement plus an explicit note that the real ceiling is **derived in Unit 2 from measured cadence and
horizon per provider**, then priced in Unit 7. The direction of the argument is unaffected; the false
precision goes.

---

## SHOULD FIX

### G5. One season is statistically useless for plant pathology ⟶ **FOLD**
*Gemini* — 2025 alone might be a drought year in PA and a heat dome in CA. If the season contains no
three-day rain event at 70 °F, downy and black rot pressure are never tested. **Folded:** Unit 3
fetches **five seasons (2021–2025)** rather than one. The archive is free, re-fetchable, and rate-
limited only by politeness; the cost is fetch time and fixture size, both trivial next to the risk of
fixing a global refusal threshold on one anomalous year. Unit 3 must also **characterize each season**
(wet/dry/normal) so a low-pressure year is not mistaken for a well-behaved estimator.

### G6. Site selection lacks a humid-subtropical high-pressure baseline ⟶ **FOLD-MODIFIED**
*Gemini* — the most aggressive US disease environment (VA / NC / MO) is missing: extreme nighttime
humidity plus high heat, which breaks simplistic dew-point estimators. Gemini proposes swapping Bhutan
out for it.

**The swap is rejected.** Bhutan is a **live tenant** and runbook rule §3.9 makes non-US first-class
and forbids the app bricking outside the US; dropping it to make room would trade a standing rule for
a site. **But the gap is real and folded:** a **fifth site** is added in the humid subtropical
Southeast. Five sites × five seasons is still cheap — it is flat files from a free archive.

### G7. Wetness-interruption rules are established science, not a variable to guess ⟶ **FOLD**
*Gemini* — the plan proposed testing whether a single dry hour resets the clock. It should not:
standard models use a dry-period threshold (roughly 4–12 h below the wetness threshold, radiation-
dependent). **Folded:** Unit 5 uses the literature rule and cites it; the free parameter becomes *"does
the published interruption rule interact with estimator choice?"*, which is a legitimate question,
rather than *"what should the rule be?"*, which is inventing pathology. Same adjudication for the
black-rot interpolation (**G8**): encode the real Spotts matrix, do not interpolate between three
transcribed points.

### C6. Unit 1 pre-commits numeric thresholds too early ⟶ **FOLD**
*Codex* — provider spread, refusal rate, and 5-year storage ceilings depend on properties Unit 2 has
not measured. Pre-commitment is right; arbitrary numbers are not. **Folded:** Unit 1 splits. **1a**
pre-commits the *rubric, the formulas, and the direction of every criterion* before anything runs;
**1b** locks the numeric thresholds after Units 2–3 establish what is being measured, in its own
commit, still before Unit 5 or 7. The anti-rationalisation property is preserved — the numbers are
fixed before the results exist, not before the units exist.

### C7. Unit 5 confounds estimator choice with consumer-spec choices ⟶ **FOLD**
*Codex* — the plan already suspects interpolation and interruption rules may dominate, which means a
headline flip rate would not be attributable. **Folded:** Unit 5 becomes a **factorial design with
variance attribution** — estimator effect, provider/model effect, wind-input effect, and (now
literature-fixed, so a sensitivity check rather than a free parameter) consumer-spec effect. The gate
is on the **estimator effect conditional on a fixed consumer spec**, which is the number that was
wanted all along.

### C8. No declared temporal alignment method for the observed comparison ⟶ **FOLD**
*Codex* — NWS observations are sub-hourly and QC-tagged; model products are hourly bins. Without a
pre-declared rollup the comparison can be tuned after the fact. **Folded:** Unit 2 now specifies the
hourly rollup *before* Unit 5 runs — inclusion window, gap handling, precipitation summed versus
maxed, admissible QC states, and DST alignment.

### C9. Unit 7 omits the write path ⟶ **FOLD**
*Codex* — a storage-economics spike that measures only reads. Insert/upsert/delete/prune cost and
maintenance behaviour are load-bearing given three different lifecycles. **Folded**, together with
Codex's related point that the synthetic load must actually *simulate lifecycle churn* — repeated
issue/replace/prune cycles with `VACUUM`/`ANALYZE` between phases and explicit bloat measurement —
rather than bulk-insert once and measure. Also folded: a **branch-safety guard that asserts the
connection is not the default branch** before any DDL. That guard should have been in the plan.

### C10. Unit 7 must not reopen a tenancy invariant on storage grounds ⟶ **FOLD**
*Codex* — the plan asks whether the `(tenantId, id)` composite-FK guard is "even required here." That
is a safety invariant from the Phase-12 checklist and a storage spike is the wrong layer to relax it.
**Folded:** tenancy and RLS invariants are held **fixed** for the headline economics measurement. The
alternative key shape is still costed, but explicitly labelled **non-decisionable** — an input to a
future tenancy-rules conversation, never a conclusion S0 may draw.

### C11. Unit 9 is not weather-lane gating work ⟶ **FOLD-MODIFIED**
*Codex* — the decision-record shape ripples into every lane, contradicting "S0 gates only S1."
Correct, and the plan understated it. **But deleting it is worse:** the runbook explicitly puts the
shape sketch in S0's scope precisely so eight phases do not each invent a return shape. **Folded as:**
Unit 9 stays, marked **non-gating and non-binding** — it is a proposal S9 adopts or amends, it cannot
block S0's verdict, and no other lane is required to build against it. Renamed from "sketch the shape"
to "propose the shape" to make the status unambiguous.

### C12. Stop using ~1.07 KB/row as evidence ⟶ **FOLD**
*Codex* — the plan cites the daily table's per-row cost and then immediately explains why it is
confounded by churn and structural indexes. **Folded:** §1.7 keeps the number as the reason the
measurement is needed and stops using it to project anything. The ~9.4 MB/vineyard-year extrapolation
comes out.

### C13. Unit 8 conflates three different horizons ⟶ **FOLD**
*Codex* — raw-weather retention, decision auditability, and legal record retention need not share a
horizon. **Folded:** Unit 8 computes three separate horizons and states which artifact each governs.
Gemini's design question 1 supplies the missing legal input: **EPA Worker Protection Standard and
state rules (e.g. CA DPR) require spray records retained 2–3 years**, and an audit in year three must
be able to show *why* a spray was legal — including the wind at application. That partly answers the
plan's open question 6 and is the first real number the horizon derivation has.

### G9. Separate "missing data" refusal from "meteorologically unsuitable" ⟶ **FOLD**
*Gemini, design question 2* — "cannot determine because the dew-point input is absent" and "do not
spray because it is pouring" are agronomically opposite and the plan's four-value union collapses
them. **Folded** into Unit 9's shape and Unit 6's refusal specification: a refusal carries its
**cause class**, and *unknown* is never rendered as *unsuitable* or vice versa.

---

## PUSH BACK

### Gemini's proposed drop of Bhutan ⟶ **REJECTED** (gap folded separately, see G6)
A live non-US tenant and a standing runbook rule outrank a site slot. Add the Southeast site; keep Paro.

### Gemini's "prefer RH≥90% because canopy wind is unknowable" ⟶ **REJECTED** (concern folded, see G2)
Choosing a measurably worse estimator to avoid one noisy input is the wrong trade. The concern becomes
a sensitivity arm and a confidence-band input, with the authority to reopen the choice on evidence.

---

## Open questions carried to Russell

1. **Was the brief's §7 pathogen table meant to be exhaustive?** G1 says it is materially incomplete
   (Botrytis/Broome, Phomopsis/Erincik, PM primary infection). Correcting it is a brief edit, not just
   an S0 finding — and S5b's scope grows with it.
2. **Is a two-microclimate canopy model (cluster zone / foliar zone) acceptable**, given it expands
   what S4 must collect? Cheap now, expensive to retrofit.
3. **Does the wind-is-a-legal-gate finding (G4) change S7b's scope**, and should it be added to the
   runbook's risk register now rather than when S7b is planned?
4. **Confirm the 2–3 year regulatory retention floor** for pesticide application records, and decide
   how long the lot residue flag must stay explicable — plausibly much longer, since it follows the
   wine.
5. **If observed data proves unbackfillable (Unit 0), does a minimal capture job jump the queue?**
   This is a schedule decision, not a technical one.

---

## Reconciliation summary

| Change | Source |
|---|---|
| **+ Unit 0** — observed-backfillability probe, runs first, three named outcomes | C2 + C3 |
| §1.1 table split into "what the brief says" / "what the literature says"; tolerance argument cut | G1 |
| Unit 5 consumer set: 2 → **4** (real Spotts matrix, anthracnose, Broome botrytis, Erincik phomopsis) | G1 |
| Unit 5 gains a **met-input validation layer** with pre-declared per-variable tolerances | C1 |
| Unit 5 becomes **factorial with variance attribution**; gate on estimator effect at fixed consumer spec | C7 |
| Unit 5 gains a **wind-sensitivity arm**; wind provenance enters the confidence band | G2 |
| Canopy modifier: block-wide → **cluster zone + foliar zone**, each model declares which it reads | G3 |
| **Wind becomes a hard input to the legal application-window gate**, routed to S7b | G4 |
| Bitemporality: `validTime` + `providerIssuedAt` + **`ingestedAt`**; replay keys on one, stated | C4 |
| 170× multiplier removed; ceiling derived from measured cadence in Unit 2 | C5 |
| Unit 3: 1 season → **5 seasons**, 4 sites → **5 sites** (+ humid subtropical SE), seasons characterized | G5 + G6 |
| Interruption rule and Spotts curve taken from **literature**, not invented | G7 + G8 |
| Unit 1 splits: **1a** rubric pre-commit, **1b** numeric thresholds after Units 2–3 | C6 |
| Unit 2 pre-declares the **hourly rollup and QC-admissibility rules** | C8 |
| Unit 7 adds **write-path, churn-lifecycle, bloat** measurement + a **not-the-default-branch guard** | C9 |
| Unit 7's tenancy-key question marked **non-decisionable** | C10 |
| Unit 9 marked **non-gating, non-binding**; "sketch" → "propose" | C11 |
| §1.7's per-row extrapolation withdrawn | C12 |
| Unit 8 computes **three separate horizons**; 2–3 yr WPS/DPR floor supplied | C13 |
| Refusals carry a **cause class** (missing-data vs meteorologically-unsuitable) | G9 |

**Net effect:** the spike gets meaningfully larger in measurement breadth (5 sites × 5 seasons ×
4 consumers, plus an input-validation arm) and meaningfully **safer** in what it is allowed to
conclude. It also gains a Unit 0 that can produce an urgent scheduling finding within a day. Nothing
was cut; two things (Unit 9, the tenancy-key question) were demoted to non-binding.

---

## Raw response — Codex (gpt-5.4)

**CRITICAL**

- `§1.1 / Unit 5`: The "consumer-flip" gate does not answer the stated go/no-go question for estimator viability. If CART and `RH>=90%` are wrong in the same direction, flips stay low and the plan declares success with no evidence the estimator is usable. This is a correlated-error blind spot, not just "no ground truth." Fix: narrow the claim explicitly to "acceptable for the two current coarse consumers only," and add an independent met-input validation arm: observed vs reanalysis error budgets for RH, dew-point depression, wind, and precip, with predeclared tolerances and a fail state when the estimator is being fed implausible inputs.
- `§1.3 / §1.4 / Unit 2 / Unit 8`: The retention argument assumes OBSERVED is irrecoverable before Unit 2 has resolved whether NCEI ISD or another archive closes the backfill gap. That is a dependency inversion. If archival observed data is usable for the target sites, the asymmetry driving the retention decision changes materially. Fix: make "is historical observed recoverable for target geographies?" a first-class decision that must complete before any retention conclusion or no-go condition using "irreversible loss."
- `§1.4`: The forecast volume arithmetic is being used as an argument before it is measured, and the numbers are internally inconsistent. `8,760 * 168 = 1,471,680`, which supports the `~1.47M` claim only if the horizon is actually 168 hours. But `§1.5` says NWS hourly returns `156` one-hour periods, which would be `8,760 * 156 = 1,366,560`, a `156x` spread over latest-only, not `170x`. Fix: stop using `170x` as a decision argument. Derive retained-row ceilings from measured issuance cadence and measured retained horizon per provider in Unit 2/7.
- `§1.6 / Unit 7 / Unit 8 / Unit 9`: `issuedAt` and `validTime` are not sufficient bitemporal semantics for "facts as of then." You also need system-time knowledge: when your app captured the data. Delayed cron runs, QC revisions, and "same valid hour, later provider revision" all break replay if you only store provider issuance plus valid time. Fix: define three timestamps explicitly: `validTime`, `providerIssuedAt` (or source revision time), and `ingestedAt`. Then define which one audit replay uses. Benchmark that query in Unit 7 instead of a weaker `issuedAt <= D` approximation.
- `Unit 7`: The synthetic-rows-on-a-branch experiment will understate the cost of churn-heavy patterns and misstate read latency. Forecast "replace in place" behavior creates dead tuples, VACUUM pressure, and different index locality than one-time bulk inserts. Your own text says write pattern matters, but the proposed setup does not actually simulate lifecycle churn. Fix: benchmark append-only OBSERVED separately from churn-heavy FORECAST with repeated issue/replace/prune cycles, VACUUM/ANALYZE between phases, and explicit bloat measurement. Otherwise the storage and latency ceilings are not credible.
- `Unit 7`: The spike is trying to make tenancy-structure decisions it should not own. The repo context says every domain table carries `@@unique([tenantId, id])`; Unit 7 reopens "is the `(tenantId, id)` guard even required here?" on storage grounds. That is the wrong layer to relax a safety invariant. Fix: hold tenant/RLS invariants fixed for the main economics experiment. If you want to cost an alternative key shape, do it as a side measurement labeled non-decisionable unless the tenancy rules are amended elsewhere.
- `§1.3 / §6`: The plan correctly identifies that one missed daily observed capture is permanent data loss, then still treats S0 as pure research that gates only S1. That is not coherent. If the risk is real, waiting for S1 means the loss has already happened during S0. Fix: add an explicit operational gate before or during S0: manual daily capture, a minimal temporary job, or a formal decision to accept irrecoverable loss.

**SHOULD FIX**

- `Unit 1`: Precommitting numeric kill criteria before Unit 2 inventory is too early. Provider spread, refusal rate, and 5-year storage ceilings depend on properties the plan has not measured yet. Precommitment is good; arbitrary thresholds are not. Fix: precommit the rubric and formulas first, then lock numeric thresholds after Unit 2/3.
- `Unit 5`: The consumer probe confounds estimator choice with unresolved consumer-spec choices. If interpolation and interruption dominate, the headline "consumer flip rate" is not actionable because you do not know what caused the flip. Fix: run a factorial analysis and report variance attribution: estimator effect, interpolation effect, interruption-rule effect, and provider effect. Gate on estimator effect conditional on a fixed consumer spec.
- `Unit 2 / Unit 5`: The observed-vs-model comparison is missing a declared temporal alignment method. Without a predeclared aggregation and QC rule, the comparison can be tuned after the fact. Fix: specify hourly rollup now: inclusion window, gap handling, whether precip is summed or maxed, which QC states are admissible, and how local-time/DST alignment is handled.
- `Unit 7`: The read shapes are incomplete for a storage-economics spike. You omit write-path latency, unique-conflict/upsert behavior, pruning cost, and maintenance operations. Fix: add insert/upsert/delete/prune benchmarks and a branch-safety guard that asserts the connection is not the default production branch before any DDL or load.
- `Unit 8`: "Longest replay horizon from the consumers" conflates raw-weather retention, auditability of a past decision, and legal/business retention of downstream records. Fix: compute separate horizons and decide which artifact each applies to.
- `Unit 6`: The canopy modifier is under-evidenced scope creep. S0 has no canopy data source, no calibration target, and no production consumer. Fix: reduce Unit 6 to interface and data-contract only.
- `Unit 9`: The decision-record output shape is not weather-lane gating work. It is shared contract design that ripples into other lanes, contradicting "S0 gates only S1." Fix: either remove Unit 9 from S0 or mark it explicitly non-gating and non-binding.
- `§1.7 / Unit 7`: The narrative uses the daily table's per-row cost as if it were informative, then explains why it is confounded. Fix: treat `~1.07 KB` as a historical anecdote only.

**DESIGN QUESTIONS**

- `§1.5 / Unit 2`: Is NWS raw gridpoint `updateTime` actually a meaningful `issuedAt` for replay, or only "last changed" metadata on a stitched product? If different properties come from different update streams, your forecast replay model is wrong before storage is considered.
- `Unit 7`: Why is the physical design framed as "`seriesKind` in the index vs in the predicate"? With three radically different retention and write lifecycles, the real alternatives are likely partial indexes, separate tables, or partitioning by series kind or recency.
- `Unit 3 / Unit 5`: Four sites and one full season are enough for a spike, but not enough to harden global refusal thresholds. Are the thresholds provisional S1 defaults with reopen criteria, or durable policy? The plan reads too close to the latter.
- `§6`: What happens when the nearest observed station is present but unusable because wind or RH is QC-failed? The plan says "missing wind is not dry," but not whether downstream reads prefer refusal, model fallback, or a hybrid per-field source mix.
- `§6` missing risk: no named operational risk for **silent cron failure detection**. Daily capture with a 1–2 day trailing window is a monitoring problem, not just a scheduling one. Without alerting on a miss, the loss is silent and permanent.
- `§6` missing risk: NWS station coverage, QC completeness, and nearest-station representativeness vary sharply by vineyard. "Observed coverage is too sparse to support CART at enough sites" is not named as a possible no-go.

## Raw response — Gemini (gemini-3.1-pro-preview)

**CRITICAL**

**1. The pathogen LWD consumption list is agronomically false (Section 1.1)** — The foundational claim that "almost nothing actually consumes LWD" is dangerously incorrect. **Black Rot:** the Spotts curve (Spotts 1977, updated 1984) is a continuous empirical matrix mapping temperature to wetness duration, typically implemented as a lookup table from 50°F to 90°F in 2-to-5-degree increments. It is not coarse. **Powdery Mildew:** Gubler-Thomas secondary infection is temperature-driven, but *primary* infection (ascospore release) strictly requires rainfall/wetness. Furthermore, liquid water on the leaf surface *inhibits* secondary PM (conidia burst). Failing to account for LWD in PM models means recommending sprays when the pathogen is already suppressed by rain. **Botrytis:** the industry-standard Broome et al. (1995) model is driven explicitly by LWD and temperature (e.g., 15 hours wetness at 15°C triggers high risk). **Phomopsis:** the Erincik et al. (2003) model provides exact LWD and temperature thresholds for cane and leaf infection. Fix: discard the table in 1.1; implement the actual continuous Spotts matrix, the Broome Botrytis model, and the Erincik Phomopsis model. The consumer is not "coarse," and therefore your justification for tolerating a highly inaccurate estimator fails.

**2. Off-site wind data is meaningless for in-canopy LWD (Section 1.2 & 1.3)** — NWS station wind is measured at 10 m in open terrain (typically airports). Vine canopy microclimates exist at 1–2 m, blocked by topography, windbreaks, and the trellis architecture itself. A 10 mph wind at an airport 8 km away does not equal 10 mph inside a VSP canopy. Using off-site 10 m wind to calculate aerodynamic resistance and surface energy balances will generate random noise. Fix: without on-site in-canopy wind you cannot safely run a wind-dependent CART model; better to use the RH >= 90% proxy with local temperature/dewpoint corrections than to hallucinate canopy wind from an airport.

**3. The Canopy Modifier misunderstands grape anatomy (Unit 4)** — Pathogens target specific organs that exist in entirely different microclimates within the *same* canopy. Downy mildew attacks the foliage (upper canopy, active growing tips). Botrytis targets the clusters (the fruiting zone). When a grower executes "leaf-pulled VSP," they pull leaves in the *fruiting zone* only; the upper canopy remains dense. Applying a "fast drying" modifier to the whole block will drastically under-predict Downy Mildew risk on the upper foliage while correctly predicting Botrytis risk on the clusters. Fix: the canopy modifier must be organ-specific (cluster microclimate vs foliar microclimate), not block-wide.

**4. Missing wind data breaks the spray-legality contract, not just LWD (Section 1.2 & Unit 9)** — The plan frames the ERA5-Land "null wind" problem purely as an obstacle to running CART. "The label is the law." Pesticide labels strictly dictate maximum wind speeds for application to prevent drift (e.g., "Do not apply when wind speeds exceed 10 mph"). If your system outputs a decision record that asserts "no restriction" or implies a spray is legally possible while the underlying provider carries null wind, you have advised a grower to commit a federal label violation. Fix: wind speed must be a top-level legal gate independent of the disease models. If wind is null, legal spray status must be "cannot determine safely."

**SHOULD FIX**

**1. One season is statistically useless for plant pathology (Unit 3)** — Gating on 2025 alone guarantees blind spots. 2025 might be a drought year in PA and a heat-dome year in CA. If the season lacks a 3-day continuous rain event at 70°F, you will never test behavior under severe Downy Mildew or Black Rot pressure. Fix: pull at least a 5-year historical window to capture both high- and low-pressure epidemic years.

**2. Site selection lacks a high-pressure humid-subtropical baseline (Unit 3)** — Pennsylvania (continental) and Bhutan (monsoon) are distinct, but you are missing the most aggressive viticultural disease environment in the US: the humid subtropical Southeast (e.g., Virginia or North Carolina). These regions feature extreme nighttime humidity combined with high heat, which breaks simplistic dewpoint estimators. Fix: replace Bhutan (irrelevant for verifying US label/spray logic) with a site in VA, NC, or MO.

**3. Wetness interruption rules are established science, not a variable to guess (Unit 5, Item 2)** — You do not need to test this; the literature already dictates it. Pathogen spores do not instantly die when RH drops to 89%. Most standard models (NEWA, Washington State AgWeather) use a specific dry-period threshold (typically 4 to 12 hours of RH < 90%, depending on solar radiation) to reset an infection period. Fix: implement standard interruption rules from the pathology literature; do not invent a threshold based on when estimator outputs flip.

**4. Black rot interpolation testing is a waste of time (Unit 5, Item 2)** — The actual Spotts lookup table exists. Interpolating between three arbitrary points will yield incorrect infection thresholds. Fix: go to the source (Spotts 1984) and encode the actual 50°F to 90°F matrix.

**DESIGN QUESTIONS**

**1. How do you handle legal retention requirements when pruning the weather table?** EPA Worker Protection Standard (WPS) and state laws (e.g., California DPR) require spray records maintained for 2 to 3 years. If an audit occurs in year 3, the grower must be able to prove *why* a spray was legal (e.g., wind was 5 mph). If the underlying facts-as-of-then weather rows are discarded or decoupled from the snapshot, the ERP fails its legal compliance mandate.

**2. How does the system differentiate between "Hostile Weather" and "Missing Data"?** There is a massive agronomic difference between "we cannot determine risk because the dewpoint sensor is offline" and "do not spray because it is actively pouring rain." Does the 4-value union explicitly separate missing-data refusals from meteorological unsuitability?

**3. How do you resolve temporal mismatches between daily crons and hourly infection clocks?** Downy mildew secondary sporulation can begin and complete its cycle in a single night. If a grower queries at 8:00 AM but the daily cron ran at 12:00 AM, the system is missing the most critical 8 hours of LWD data. Are you failing open or failing closed during intra-cron hours?
