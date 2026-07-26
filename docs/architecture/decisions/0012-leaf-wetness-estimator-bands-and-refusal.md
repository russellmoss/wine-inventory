# ADR 0012 — Leaf wetness: CART, confidence bands, and the refusal threshold

- **Date:** 2026-07-26
- **Status:** accepted, **with a regime restriction that is the point of the ADR**
- **Plan:** `docs/spray_assistant/phases/S0-spike-hourly-lwd-retention-plan.md` · **Council:** `docs/spray_assistant/phases/S0-council-feedback.md`
- **Evidence:** `docs/spray_assistant/phases/s0-lwd-disagreement.md` (measured) ·
  `s0-lwd-estimator-decision.md` (decision) · `scripts/s0-lwd.ts` + `test/s0-lwd.test.ts` (28 goldens)

## Context

No provider supplies leaf wetness and no free gridded product does either, so it must be estimated.
CART (relative humidity + dew-point depression + wind) is the literature default and the RH ≥ 90 %
threshold carries roughly 40 % more error. **There is no ground truth without an on-site sensor**
(brief §15), so an accuracy gate was never available and the question was what a defensible
substitute looks like.

The plan's first draft proposed measuring CART-versus-threshold disagreement and calling that the
gate. Council broke it from both directions: Gemini G1 showed the consumer list was wrong because
brief §7's pathogen table is materially incomplete, and Codex C1 showed that even a correct consumer
list would not have saved it — **if both estimators are wrong in the same direction the flip rate
stays low and the gate passes with no evidence the estimator is usable.** So the gate became two arms:
decision sensitivity (A) and independent input validation (B).

Writing the goldens then sharpened C1 further. On physically consistent inputs the fallback's wet set
is a strict **subset** of CART's — RH ≥ 90 % implies a dew-point depression of ~1.2–2.1 °C at every
realistic temperature, clearing CART's 3.7 °C node, and RH ≥ 90 also clears its 87.8 % node (verified
by sweep over 5,000+ points). The disagreement is one-signed. A low flip rate could never have meant
"two independent methods agree", so **Arm B is not a second opinion, it is the only arm capable of
catching a shared input error.**

## Decision

**CART is the estimator; the RH ≥ 90 % threshold is a labeled-inferior fallback and is never silently
substituted.** But the load-bearing decision is the restriction:

> **Reanalysis inputs are adequate to run the estimator at humid-continental and humid-subtropical
> sites, and are NOT adequate at coastal-fog or hot-arid-interior sites.**

| Site | Regime | Dew-point depression MAE vs station | Tolerance | |
|---|---|---|---|---|
| Stoney Hill | humid continental East | 1.22 °C | ≤ 1.85 °C | ✅ |
| Monticello AVA | humid subtropical Southeast | 1.72 °C | ≤ 1.85 °C | ✅ |
| Russian River Ranch | coastal fog | 3.18 °C | ≤ 1.85 °C | ❌ |
| Madera | hot arid interior | 5.07 °C | ≤ 1.85 °C | ❌ |

The tolerance is **half CART's own 3.7 °C level-1 node**, on the principle that the instrument must
be finer than the thing it measures. At Madera the input error is 1.4× the entire decision threshold.
Both failures are regimes whose microclimate is sub-grid at ~25 km — a marine-layer boundary and an
irrigated valley floor — so this is a resolution limit and no estimator work fixes it.

**Sub-decisions:**

**1. Refuse only when a missing input could change the answer.** "A missing input is never a dry
hour" is right, but the naive reading (any null → refuse) manufactures coverage gaps out of decided
hours: a dew-point depression of 15 °C decides at level 1 without ever consulting wind, and with wind
absent both wind branches agree whenever RH ≥ 87.8 %. Absence is recorded on every verdict regardless.

**2. Confidence bands must carry provider-vs-station AGREEMENT, not just completeness.** This is the
correction Madera forced. Madera has the **lowest** refusal rate in the fixture set (0.6 %) and the
**worst** inputs (5.07 °C). Confidence and correctness are uncorrelated there, so a band keyed on
input availability would report its highest confidence exactly where the answer is least trustworthy.
That is a safety inversion. Where no station exists to compare against (Paro), the band says so
rather than falling back to completeness.

**3. A refusal carries its cause class** (council G9): `MISSING_INPUT`, `INADMISSIBLE_QC`,
`STALE_INPUTS`. *"Cannot determine because the dew-point input is absent"* and *"do not spray because
it is pouring"* are agronomically opposite and never render as each other.

**4. The intra-cron window FAILS CLOSED.** Downy secondary sporulation can complete in a single
night, both weather crons are daily, and sub-daily schedules fail Vercel deployment on the current
plan. Between the last successful ingest and now the system reports *cannot determine safely* and
says why. The reasoning is asymmetric harm: failing open means telling a grower they are protected
during precisely the hours an infection period can complete.

**5. The canopy modifier is two-zone** — cluster and foliar, each with its own drying adjustment, and
every pathogen model declares which zone it reads. "Leaf-pulled VSP" means leaves pulled in the
*fruiting zone only*; a block-wide fast-drying modifier would model cluster drying correctly while
badly under-predicting downy risk on foliage. **S0 defines the shape and does not calibrate it** —
every `dryingHoursDelta` is `null`, because there is nothing to calibrate against and a number there
would be fabrication with a type signature.

**6. The estimator's identity is a type-level property.** There is no bare boolean in the estimator's
output; a caller cannot obtain wet-or-dry without destructuring an object carrying `qualityClass`.
Rule §3.5 becomes unenforceable-by-accident rather than a convention.

## Consequences

- **S1 proceeds, narrowed.** The weather lane is buildable for eastern sites on reanalysis inputs.
  Coastal-fog and hot-arid-interior sites need station-blended or on-site inputs first, and shipping
  to them on reanalysis alone would be shipping a known-wrong answer to a live tenant.
- **The archive model must be fixed and recorded, never "best match".** `era5` versus Open-Meteo's
  `default` blend moves **50.6 %** of infection-event classifications on average, and `era5` versus
  `era5_seamless` **27.1 %** — both above the pre-committed 15 % ceiling. A silently-changing blend
  makes past decisions unreplayable even with perfect retention.
- **ERA5-Land is excluded.** It carries no wind at any of the five sites (confirmed over a full
  week), and wind is both a CART input and a hard input to the S7b legality gate.
- **S5b inherits a specification for the refusal counterfactual**: a refused hour neither extends a
  wet run nor counts toward the dry-gap interruption threshold; a run containing one is a lower bound;
  a model handed one emits cannot-determine, not a low risk and not a conservative high risk either.
- **S4 inherits a collection requirement**: a per-block `canopyManagement` observation with a
  timestamp (not a static attribute — a spray decision in August must be able to ask what the canopy
  was in July). Brief §17.2's block profile carries no canopy-management state at all.
- **S5b's scope grows.** Botrytis and phomopsis are LWD models, not the qualitative gates brief §7
  implied.

## Tripwire — the narrowing, written as a gate

**Valid for:** two named consumers (black rot on the Spotts table; anthracnose), five named sites,
the 2021–2025 seasons, reanalysis inputs, two of five regimes.

- **Any new LWD consumer reopens this threshold.** Two of the four consumers measured
  (botrytis/Broome 1995, phomopsis/Erincik 2003) are `COARSENED_RENDERING` — their published models'
  coefficients are paywalled and only the experimental design is public. They carried no gate weight.
  **S5b must obtain both papers before implementing either.**
- **Any new SITE reopens the regime question.** A vineyard in a coastal-fog or arid-interior regime
  inherits the Russian River / Madera failure, not the Stoney Hill pass.
- **CART's RH node (87.8 %) rests on a single secondary source.** The 3.7 °C and 2.5 m/s nodes are
  corroborated independently; the RH node is not. **S1 must obtain the primary paper before lifting
  the estimator into `src/`.**
- **Nothing here is validated against measured leaf wetness**, and Arm B must never be reported as if
  it were. No station in the set even measures relative humidity — ASOS derives it from temperature
  and dew point exactly as we do, so Arm B's independent quantities are temperature, dew point, wind
  and precipitation.
- **Paro has no Arm B at all.** The one non-US site has the thinnest validation, and all five of its
  fixture seasons are dry against its own 20-season baseline.
