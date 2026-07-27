/**
 * S0 Units 1a + 1b — THE RUBRIC AND THE THRESHOLDS. The anti-rationalisation artifact.
 *
 * Follows `scripts/gis-p0-measure.ts`, whose kill criteria sit in code above the measurements because
 * a council once judged its first draft's criteria to be "sentences, not gates."
 *
 * ┌─ UNIT 1a (this commit) ─────────────────────────────────────────────────────────────────────┐
 * │ Every criterion's NAME, FORMULA, DIRECTION and BREACH MEANING. Zero numbers.                 │
 * │ Every `threshold` below is `null` and every evaluator returns `verdict: "PENDING"`.           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 * ┌─ UNIT 1b (this commit) ─────────────────────────────────────────────────────────────────────┐
 * │ The numbers, set after Units 2 and 3 established what is even being measured, and BEFORE     │
 * │ Unit 5 or Unit 7 ran. Council C6 split the unit precisely here: pre-committing numeric        │
 * │ thresholds before knowing what a provider offers would be arbitrary, not rigorous. The        │
 * │ anti-rationalisation property survives because the numbers are fixed before the RESULTS       │
 * │ exist, not before the UNITS exist. `git log` is the proof.                                    │
 * │                                                                                               │
 * │ EVERY THRESHOLD BELOW IS DERIVED FROM SOMETHING, NOT CHOSEN. Where a number could only be     │
 * │ a judgement call, the reasoning is written next to it and the judgement is named as one.      │
 * │ Several of these are deliberately strict enough that they may fail. That is the point of      │
 * │ committing them first — a threshold set where it cannot fail is not a gate.                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Nothing in this module imports from `src/`, Prisma, or the network. It is a definitions module and
 * a set of pure evaluators; Units 5 and 7 import it and exit non-zero on breach, so the verdict is
 * COMPUTED rather than narrated.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** Which way is bad. `band` breaches at BOTH ends — see C5, where a floor breach is as fatal as a ceiling breach. */
export type Direction = "lower_is_better" | "band";

export type Verdict = "PASS" | "FAIL" | "PENDING";

export type Criterion = {
  /** stable id used in report tables and in the no-go condition */
  readonly id: string;
  readonly name: string;
  /** the question in one sentence, in the terms the decision is actually made in */
  readonly question: string;
  /** how the number is computed, in words, so the code and the report cannot drift apart */
  readonly formula: string;
  readonly unit: string;
  readonly direction: Direction;
  /** what a breach MEANS — not "it is bad", but what we then do */
  readonly breachMeaning: string;
  /** Unit 1b fills these. `null` = not yet locked. */
  readonly ceiling: number | null;
  /** only meaningful when direction === "band" */
  readonly floor: number | null;
};

export type Evaluation = {
  readonly criterionId: string;
  readonly observed: number | null;
  readonly ceiling: number | null;
  readonly floor: number | null;
  readonly verdict: Verdict;
  /** which end broke, when it broke */
  readonly breach: "above_ceiling" | "below_floor" | null;
  readonly note: string;
};

/**
 * The single evaluator. Everything routes through here so no unit can invent its own pass logic.
 *
 * A `null` threshold yields PENDING, never PASS. That is deliberate: an unlocked criterion must not
 * be able to launder itself into a pass by being un-set. The scripts treat PENDING as a hard stop.
 */
export function evaluate(c: Criterion, observed: number | null, note = ""): Evaluation {
  const base = { criterionId: c.id, observed, ceiling: c.ceiling, floor: c.floor, note } as const;
  if (c.ceiling == null && c.floor == null) {
    return { ...base, verdict: "PENDING", breach: null, note: note || "threshold not locked (Unit 1b pending)" };
  }
  if (observed == null) {
    return { ...base, verdict: "PENDING", breach: null, note: note || "not measured" };
  }
  if (c.direction === "band") {
    if (c.floor != null && observed < c.floor) return { ...base, verdict: "FAIL", breach: "below_floor" };
    if (c.ceiling != null && observed > c.ceiling) return { ...base, verdict: "FAIL", breach: "above_ceiling" };
    return { ...base, verdict: "PASS", breach: null };
  }
  if (c.ceiling != null && observed > c.ceiling) return { ...base, verdict: "FAIL", breach: "above_ceiling" };
  return { ...base, verdict: "PASS", breach: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE CRITERIA — Unit 1a. Names, formulas, directions, breach meanings. No numbers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * C1 — ESTIMATOR EFFECT, AT A FIXED CONSUMER SPEC.
 *
 * The headline gate. "At a fixed consumer spec" is load-bearing and is the whole of council C7: an
 * unattributed blend of estimator effect and consumer-spec effect is not a gate, because you cannot
 * tell which knob moved the answer. So this is measured with the consumer model HELD CONSTANT at the
 * literature specification, varying only the estimator.
 *
 * Counted over INFECTION-EVENT CLASSIFICATIONS, not over wet hours. Hours are not decisions. Two
 * estimators can disagree on 30% of hours and never once disagree about whether a black-rot infection
 * period occurred, and it is the second number that reaches a grower.
 */
export const C1_ESTIMATOR_EFFECT: Criterion = {
  id: "C1",
  name: "Estimator-effect ceiling",
  question:
    "Holding the consumer model fixed at its published specification, how often does swapping CART for the RH≥90% fallback change the infection-event classification?",
  formula:
    "flips / classifications, where a `classification` is one (site, season, consumer, event-window) tuple evaluated under both estimators, and a `flip` is a tuple whose categorical outcome differs. Computed per (site, season, consumer) and reported per cell; the gate is applied to the WORST cell, never to the pooled mean.",
  unit: "fraction of classifications that flip",
  direction: "lower_is_better",
  breachMeaning:
    "The choice of estimator changes the advice too often for a single confidence band to cover both. S1 may not ship a single LWD series that pathogen models consume interchangeably; either the estimator identity must be carried into every downstream decision, or the weather lane does not proceed as scoped.",
  // 1b — JUDGEMENT, and named as one. One spray decision in five changing on the estimator swap is
  // the point at which "these two are interchangeable" stops being sayable to a grower.
  //
  // ⚠️ Expected to BREACH, and the breach is informative rather than fatal. Unit 4's goldens
  // established that the fallback's wet set is a strict SUBSET of CART's on consistent inputs, so
  // flips are one-signed and the rate is a measure of how much the naive threshold misses — likely
  // well above 20%. The remedy this criterion's breachMeaning names (carry the estimator identity
  // into every downstream decision) is ALREADY BUILT: `qualityClass` rides on every verdict in
  // s0-lwd.ts. So a breach here confirms the design rather than blocking the lane.
  ceiling: 0.2,
  floor: null,
};

/**
 * C2 — ARM B INPUT TOLERANCE, per variable.
 *
 * Council C1's arm. Arm A alone can pass on CORRELATED ERROR: if CART and the fallback are wrong in
 * the same direction, the flip rate stays low and the gate passes with no evidence the estimator is
 * usable. Low disagreement is not evidence of correctness. Arm B independently asks whether the
 * inputs are plausible at all.
 *
 * ⚠️ Unit 0 established that NO station in the fixture set MEASURES relative humidity — ASOS measures
 * temperature and dew point, and publishes an RH derived from that pair exactly as we would. So the
 * PRIMARY humidity criterion is DEW-POINT DEPRESSION, which is a difference of two measured
 * quantities. `rhPct` is retained as a secondary, explicitly transitive check and must be reported as
 * such every single time. Getting this backwards would let a psychrometric identity masquerade as a
 * validation.
 *
 * This is input validation. It is NOT leaf-wetness validation and must never be reported as such.
 */
export type ArmBVariable = "dewPointDepressionC" | "tempC" | "windMs" | "precipMm" | "rhPct";

export const C2_ARM_B_TOLERANCE: Readonly<Record<ArmBVariable, Criterion>> = {
  dewPointDepressionC: {
    id: "C2.dpd",
    name: "Arm B — dew-point depression error (PRIMARY)",
    question:
      "How far does the modelled dew-point depression sit from the nearest station's, over the hours that matter?",
    formula:
      "mean absolute error of (T − Td) in °C, model vs station, computed on the pre-declared hourly rollup (Unit 2) over ADMISSIBLE hours only, restricted to the dew-eligible night window where CART's decision actually lives.",
    unit: "°C MAE",
    direction: "lower_is_better",
    breachMeaning:
      "The estimator is being fed a humidity signal too far from the measured one for its output to mean anything. Arm B fails, and no Arm A result can rescue it: agreeing estimators fed bad inputs agree about nothing useful.",
    // 1b — DERIVED, not chosen. CART's level-1 node sits at DPD = 3.7 °C. An input error at or above
    // that magnitude can move an hour across the model's own primary decision boundary in either
    // direction, which makes the output meaningless. Requiring the error to be under HALF the
    // decision threshold is the standard "the instrument must be finer than the thing it measures"
    // reading, so: 3.7 / 2 = 1.85 °C.
    ceiling: 1.85,
    floor: null,
  },
  tempC: {
    id: "C2.temp",
    name: "Arm B — temperature error",
    question: "How far is the modelled hourly temperature from the station's?",
    formula: "mean absolute error in °C, model vs station, admissible hours, pre-declared rollup.",
    unit: "°C MAE",
    direction: "lower_is_better",
    breachMeaning:
      "Every pathogen model in Unit 5 layer 0 is a temperature × wetness matrix. A temperature error moves the required wetness duration, so this breaching invalidates Arm A's consumer results as well as Arm B.",
    // 1b — DERIVED from the consumer, which is the right place to derive it. The Spotts black-rot
    // matrix steps in 2–5 °F; its FINEST step is 2 °F = 1.11 °C. An error of one full step can move
    // an hour to an adjacent row of the matrix and change the required wetness duration.
    //
    // 1.11 °C is therefore the LOOSEST defensible value: at exactly one step the error can still
    // move a row. The strict reading — half a step, 0.56 °C — is tighter than gridded reanalysis
    // achieves against a point station, and adopting it would mean pre-committing to a failure whose
    // only remedy is "do not use reanalysis temperature", which is a decision Unit 6 should make on
    // the numbers rather than one the rubric should force. So: the loose value, with the strict
    // value recorded here so Unit 5 can report against BOTH and Unit 6 can see the margin.
    ceiling: 1.11,
    floor: null,
  },
  windMs: {
    id: "C2.wind",
    name: "Arm B — wind-speed error",
    question: "How far is the modelled wind from the station's 10 m measurement?",
    formula: "mean absolute error in m/s, model vs station, admissible hours.",
    unit: "m/s MAE",
    direction: "lower_is_better",
    breachMeaning:
      "CART's weakest input (council G2) is also unverifiable. Read together with C4: if wind error is large AND wind sensitivity is high, plan §1.8's choice of CART is reopened on evidence.",
    // 1b — DERIVED. CART's level-2 node is 2.5 m/s; half of it is 1.25 m/s, by the same
    // finer-than-what-it-measures argument as C2.dpd.
    ceiling: 1.25,
    floor: null,
  },
  precipMm: {
    id: "C2.precip",
    name: "Arm B — precipitation error",
    question: "How far is modelled hourly precipitation from the station's?",
    formula:
      "mean absolute error in mm/h on hours where EITHER source is non-zero (a shared-zero hour is not evidence), plus the rate at which one source reports rain and the other reports none.",
    unit: "mm/h MAE",
    direction: "lower_is_better",
    breachMeaning:
      "Rain is the wetness-interruption input and the unambiguous wetting event. If it is wrong, the wetness-run segmentation is wrong upstream of every consumer.",
    // 1b — DERIVED from the estimator's own precipitation node. `s0-lwd.ts` treats ≥ 0.2 mm/h as a
    // wetting event; an error at or above that magnitude can invent or erase one. Half of 0.2 is
    // 0.1, which is finer than the archive's own reporting resolution, so the ceiling is set AT the
    // node value rather than half it: 0.2 mm/h. Recorded as the one place the half-the-threshold
    // rule is knowingly not applied, and why.
    ceiling: 0.2,
    floor: null,
  },
  rhPct: {
    id: "C2.rh",
    name: "Arm B — relative-humidity error (SECONDARY, transitive)",
    question: "How far is the modelled RH from the station's published RH?",
    formula:
      "mean absolute error in percentage points. ⚠️ BOTH SIDES ARE DERIVED from temperature and dew point. This tests psychrometric arithmetic, not measurement, and may never be cited as independent validation of humidity.",
    unit: "percentage points MAE",
    direction: "lower_is_better",
    breachMeaning:
      "Because both sides are derived, a breach here without a corresponding C2.dpd breach means a UNIT or FORMULA disagreement between us and the archive, not a weather error. Investigate the conversion before concluding anything about the data.",
    // 1b — MEASURED, from plan §1.2's live probe: at one site and one hour, `era5` reported RH 69%
    // while the default blend reported 79%. Ten points is the observed inter-model spread, so an
    // error against a station larger than half that spread means the station disagreement exceeds
    // the provider disagreement, and RH stops being interpretable at all: 5 percentage points.
    ceiling: 5,
    floor: null,
  },
};

/**
 * C3 — PROVIDER-SPREAD CEILING.
 *
 * Live-probed during planning: at the same site and hour, `era5` reported RH 69% and the default
 * blend reported 79%. Ten points is noise at 69/79 and is the entire decision at 85/95. Model
 * selection is a first-class error source, on par with the estimator choice.
 */
export const C3_PROVIDER_SPREAD: Criterion = {
  id: "C3",
  name: "Provider-spread ceiling",
  question:
    "Holding the estimator AND the consumer fixed, how often does swapping the archive model change the infection-event classification?",
  formula:
    "flips / classifications across archive-model variants (era5_land, era5, era5_seamless, default blend), estimator and consumer held constant. Worst cell, not pooled.",
  unit: "fraction of classifications that flip",
  direction: "lower_is_better",
  breachMeaning:
    "Provider identity may not be abstracted away behind a generic weather series. It must be carried into the confidence band and named at the point of display (rule §3.5), and S1's schema must keep the model variant, not just the provider family.",
  // 1b — JUDGEMENT, deliberately TIGHTER than C1 (0.20). The estimator is a modelling choice a
  // grower could reasonably be told about; the archive model behind it is an implementation detail
  // nobody outside this repo will ever see. So it has to move fewer decisions to stay hidden. Set at
  // three quarters of C1: 0.15.
  ceiling: 0.15,
  floor: null,
};

/**
 * C4 — WIND-SENSITIVITY CEILING. Council G2's escape hatch, made concrete.
 *
 * Gemini argued for dropping CART in favour of the naive RH≥90% threshold because station wind is
 * measured at 10 m in open terrain while canopy microclimate is 1–2 m and blocked by topography,
 * windbreaks and trellis. That was REJECTED in the plan: CART was developed on standard
 * weather-station data precisely so it could run without on-site instruments, and choosing a
 * measurably worse estimator to dodge one noisy input is the wrong trade. But the concern is real,
 * so it gets a number instead of an argument.
 */
export const C4_WIND_SENSITIVITY: Criterion = {
  id: "C4",
  name: "Wind-sensitivity ceiling",
  question: "How much of the estimator effect is attributable to the wind input alone?",
  formula:
    "(flips under wind perturbation) / (total estimator-effect flips), where the perturbation replaces the wind series with a plausible alternative (nearest-station measured wind, and separately a constant at the site's seasonal median) with all other inputs held fixed.",
  unit: "fraction of the estimator effect attributable to wind",
  direction: "lower_is_better",
  breachMeaning:
    "Plan §1.8 is REOPENED on evidence, which is the only thing entitled to reopen it. CART's advantage would be resting on its noisiest input, and the estimator choice must be re-decided in Unit 6 rather than inherited.",
  // 1b — JUDGEMENT with a clean reading: HALF. If more than half of CART's advantage over the naive
  // threshold traces to the one input that is measured at 10 m in open terrain, several kilometres
  // away, over a surface that is not a canopy — then the advantage is resting on the least
  // trustworthy thing in the model and Gemini's objection deserves a rehearing on numbers.
  ceiling: 0.5,
  floor: null,
};

/**
 * C5 — REFUSAL-RATE BAND. The only two-ended criterion, and deliberately so.
 *
 * Runbook rule §3.3 says the refusal will fire often and legitimately. But a threshold firing on
 * nearly nothing is decoration — it lets us claim honesty we never exercise — and one firing on most
 * of the season makes the weather lane pointless. BOTH ENDS ARE FAILURE.
 */
export const C5_REFUSAL_RATE: Criterion = {
  id: "C5",
  name: "Refusal-rate band (ceiling AND floor)",
  question: "Over a real season, what share of hours does the estimator refuse to answer for?",
  formula:
    "refused hours / total hours, per site and per season, where an hour is refused when a required input is absent or inadmissible. NOT pooled: Madera and Stoney Hill behave nothing alike and a pooled number hides exactly that. The gate is applied per cell.",
  unit: "fraction of season-hours refused",
  direction: "band",
  breachMeaning:
    "Above the ceiling: the weather lane cannot answer often enough to be worth building, and S1 is not built as scoped. Below the floor: the refusal is decoration and the honesty output is a claim we never actually make — which is worse than no refusal, because it looks like a safeguard.",
  // 1b — the two ends are set by DIFFERENT arguments, which is the whole reason this is a band.
  //
  // CEILING 0.33: above one hour in three the system is silent more often than a grower can plan
  // around, and rule §3.3's "it will fire often and legitimately" has tipped into "it does not work".
  //
  // FLOOR 0.005: below one hour in two hundred, over a WHOLE SEASON, the refusal has never
  // meaningfully fired. Shipping honesty copy for a path that never executes is worse than shipping
  // none, because it reads as a safeguard that was tested and held.
  //
  // ⚠️ This is the criterion most likely to be misread, so: it is applied PER (site, season, model)
  // cell, and the archive-model dimension is where it will bite. `era5_land` carries no wind at all
  // (Unit 2, confirmed at every site), so on that model CART refuses exactly in the band where wind
  // is the deciding input. That is not the estimator failing — it is the refusal mechanism working
  // as designed on a provider that cannot feed it. Unit 5 must report the cells separately and Unit
  // 6 must not average a wind-less provider together with a complete one.
  ceiling: 0.33,
  floor: 0.005,
};

/**
 * C6 — STORAGE CEILING. Unit 7.
 *
 * ⚠️ Judged with the TENANCY INVARIANTS HELD FIXED (council C10): the `(tenantId, id)` composite-FK
 * guard from the AGENTS.md Phase-12 checklist step 5 and the RLS policy stay in every arm of the
 * headline measurement. A storage spike is the wrong layer at which to reopen a tenancy safety
 * invariant. The cheaper key shape is costed only as a NON-DECISIONABLE side result.
 */
export const C6_STORAGE: Criterion = {
  id: "C6",
  name: "Storage ceiling at the 5-year projection",
  question: "How many bytes per vineyard-year does hourly weather cost, all-in, under a real write lifecycle?",
  formula:
    "(heap + index + measured bloat) bytes / vineyard-years loaded, measured after the series kind's real lifecycle (append-only for OBSERVED, repeated issue/replace/prune cycles for FORECAST) with VACUUM/ANALYZE between phases. Tenancy invariants held fixed.",
  unit: "bytes per vineyard-year",
  direction: "lower_is_better",
  breachMeaning:
    "The raw-retention branch of council S2's fork is rejected for that series kind, and Unit 8 must choose decision-input snapshots for it instead.",
  // 1b — ANCHORED to the measured production baseline, then given honest headroom.
  //
  // `vineyard_climate_daily` measures ~1.07 KB/row all-in (70,389 rows, 68 MB) on the live database.
  // An hourly row is wider than a daily one (more variables, three timestamps instead of one) and
  // will carry more indexes, so budget ~2.9 KB/row — call it 2.7× the daily row's cost. At
  // 8,760 rows per vineyard-year that is 25 MB/vineyard-year.
  //
  // ⚠️ Note what this is NOT. Plan §1.7 extrapolated ~9.4 MB/vineyard-year from that same per-row
  // figure and council C12 WITHDREW the extrapolation, because the daily table's per-row cost is
  // confounded by upsert churn and by structural indexes. The withdrawal was right and this is not a
  // re-run of it: 25 MB is a CEILING on what Unit 7 is allowed to measure, deliberately set well
  // above any plausible outcome so that a breach means something is structurally wrong rather than
  // merely bigger than hoped. The measured number is Unit 7's output, not this criterion's input.
  ceiling: 25 * 1024 * 1024,
  floor: null,
};

/**
 * C7 — READ-LATENCY CEILING. Unit 7.
 *
 * Applies per read shape. The C3-contract read (a historical read that must EXCLUDE forecast rows) is
 * the one to watch: it is a performance question wearing a correctness question's clothes. Get it
 * wrong and the safe query is the slow one, which is how the safe query stops getting written.
 */
export const C7_READ_LATENCY: Criterion = {
  id: "C7",
  name: "Read-latency ceiling, per read shape",
  question: "At the 5-year projection, how slow is each read shape the consumers actually issue?",
  formula:
    "p95 wall-clock ms over repeated EXPLAIN (ANALYZE, BUFFERS) runs per read shape, warm cache, at the largest scale loaded. Applied per shape; the gate is the worst shape.",
  unit: "p95 milliseconds",
  direction: "lower_is_better",
  breachMeaning:
    "That read shape needs a physical design change (partial index, separate table per kind, or partitioning) before S1 builds against it — decided in Unit 7, not deferred to whoever hits it in production.",
  // 1b — DERIVED from what the read is FOR. These queries back a grower-facing decision page that
  // issues several of them, on a serverless runtime, over a pooled connection to Neon. A 1-second
  // page budget with four such reads and room for rendering leaves roughly 250 ms of p95 per read
  // shape. Beyond that the page is slow enough that somebody will "optimise" it by dropping the
  // safe-but-slow query — which is exactly the failure mode the C3 contract read exists to prevent.
  ceiling: 250,
  floor: null,
};

export const ALL_CRITERIA: readonly Criterion[] = [
  C1_ESTIMATOR_EFFECT,
  ...Object.values(C2_ARM_B_TOLERANCE),
  C3_PROVIDER_SPREAD,
  C4_WIND_SENSITIVITY,
  C5_REFUSAL_RATE,
  C6_STORAGE,
  C7_READ_LATENCY,
];

// ─────────────────────────────────────────────────────────────────────────────
// THE NO-GO CONDITION — the specific combination meaning S1 should not be built as scoped.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deliberately NOT "any criterion fails". Individual breaches have individual, already-specified
 * consequences (see each `breachMeaning`), most of which narrow S1 rather than cancel it. The no-go
 * is the narrower question: is there a version of S1 worth building at all?
 *
 * Three independent ways to reach it. Each is a different mechanism, not three flavours of the same
 * one, which is why they are OR-ed rather than scored:
 *
 *   NG-1  Arm B fails on the PRIMARY humidity variable (C2.dpd).
 *         The inputs are not plausible. Nothing downstream can be salvaged by a better estimator,
 *         and Arm A's agreement would be the correlated-error trap council C1 named.
 *
 *   NG-2  The refusal rate breaches its CEILING at a majority of site-seasons.
 *         The system cannot answer often enough to change what a grower does.
 *
 *   NG-3  C1 breaches AND C3 breaches together.
 *         Both the estimator choice and the provider choice move the advice. That is not a
 *         confidence band, it is a coin flip wearing one, and no honesty copy fixes it.
 *
 * ⚠️ Note what is deliberately ABSENT. A C4 (wind-sensitivity) breach is NOT a no-go: it reopens the
 * estimator CHOICE, which is a Unit 6 decision, not a reason to abandon the lane. And a C6/C7 breach
 * is never a no-go on its own — storage and latency are physical-design problems with known remedies,
 * and treating them as existential would be the tail wagging the dog.
 */
export type NoGoInput = {
  armBPrimaryFailed: boolean;
  refusalCeilingBreachedCells: number;
  totalCells: number;
  c1Failed: boolean;
  c3Failed: boolean;
};

export type NoGoResult = { noGo: boolean; triggered: string[]; reasoning: string };

export function evaluateNoGo(i: NoGoInput): NoGoResult {
  const triggered: string[] = [];
  if (i.armBPrimaryFailed) triggered.push("NG-1: Arm B failed on dew-point depression — inputs are not plausible");
  if (i.totalCells > 0 && i.refusalCeilingBreachedCells / i.totalCells > 0.5)
    triggered.push(
      `NG-2: refusal ceiling breached in ${i.refusalCeilingBreachedCells}/${i.totalCells} site-seasons — cannot answer often enough`,
    );
  if (i.c1Failed && i.c3Failed)
    triggered.push("NG-3: estimator choice AND provider choice both move the advice — the band is a coin flip");
  return {
    noGo: triggered.length > 0,
    triggered,
    reasoning:
      triggered.length > 0
        ? "S1 should NOT be built as scoped. See each trigger's breachMeaning for the narrower alternatives."
        : "No no-go trigger fired. Individual criterion breaches, if any, narrow S1 per their own breachMeaning rather than cancelling it.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporting helper — shared by Units 5 and 7 so both render the verdict identically.
// ─────────────────────────────────────────────────────────────────────────────

export function verdictTable(evals: readonly Evaluation[]): string {
  const byId = new Map(ALL_CRITERIA.map((c) => [c.id, c]));
  const rows = [
    "| Criterion | Observed | Threshold | Verdict |",
    "|---|---|---|---|",
    ...evals.map((e) => {
      const c = byId.get(e.criterionId);
      const th =
        c?.direction === "band"
          ? `${e.floor ?? "—"} … ${e.ceiling ?? "—"}`
          : e.ceiling != null
            ? `≤ ${e.ceiling}`
            : "not locked";
      const mark = e.verdict === "PASS" ? "✅ PASS" : e.verdict === "FAIL" ? `❌ FAIL (${e.breach})` : "⏳ PENDING";
      return `| ${c?.name ?? e.criterionId} | ${e.observed ?? "—"}${c ? " " + c.unit : ""} | ${th} | ${mark} |`;
    }),
  ];
  return rows.join("\n");
}

/** Any PENDING is a hard stop, not a soft one — see `evaluate`. */
export function anyUnlocked(): boolean {
  return ALL_CRITERIA.some((c) => c.ceiling == null && c.floor == null);
}
