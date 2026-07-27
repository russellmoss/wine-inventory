# Council Feedback — S5a Powdery-mildew index and the latent-infection ledger

**Date:** 2026-07-26
**Plan reviewed:** [S5a-powdery-index-latent-ledger-plan.md](S5a-powdery-index-latent-ledger-plan.md) (v1, commit `1bcb6c08`)
**Reviewers:** Codex `gpt-5.4` (types, schema, data layer, gates) · Gemini `gemini-3.1-pro-preview` (agronomy, product judgment)
**Path note:** program convention §4 — council output lives here, not at the repo-root `council-feedback.md` the skill defaults to.

**Verdict: the probe-first shape survives review. Both reviewers endorsed Unit 0 explicitly.**
Gemini: *"The decision to use a pre-committed measurement probe rather than blindly building the
index is exactly the right call."* But **eleven findings are real defects**, three of them safety
bugs in my own reasoning, and **both reviewers independently reached the same criticism of the
ledger schema** — the strongest signal in the review.

---

## Critical issues

### C1 🔴 The "conservative" latent-period bound is INVERTED (Gemini). Safety bug.

Plan KD-4 says: hold the powdery event open on the **longer** (13–14 d) bound because it is
"conservative". **That is backwards for the transition that matters.** A longer latent period tells
the grower the infection will not be infectious for two weeks; if the true period is 5 days, the
pathogen sporulates on day 5 and seeds a secondary epidemic while the ledger still reads
"incubating".

**The resolution is better than a single choice, and it vindicates KD-3b's two-transition design:
the two transitions take OPPOSITE bounds, because each must err toward "the pathogen is active."**

| Transition | Bound | Why |
|---|---|---|
| `infectiousExpectedAt` | **shortest** plausible (≈5 d) | assuming *later* under-warns — the crop-loss direction |
| event close / expiry | **longest** plausible (≈14 d) | closing *earlier* declares a block clean prematurely |

The 2× conflict does not need resolving. It becomes the two ends of one interval, each used where
it is safe. **KD-4 must be rewritten.**

### C2 🔴 Unit 0 validates a model against a model (Codex). Methodological defect.

The probe compares reconstruction against "real observed hourly from the Open-Meteo ERA5 archive."
**ERA5 is reanalysis, not observation.** The error bars would be an agreement statistic between two
models, presented as empirical fidelity — for a spray-driving index that is not good enough.

**Fix:** validate against genuine station hourly. Four of six Demo sites already name real stations
in `vineyard_weather_config` (`SANTA ROSA SONOMA CO AP`, `MADERA`, `OJAI`, `LAMBERTVILLE`), and the
airport station publishes hourly METAR. Where no station hourly exists, the probe reports
**"consistency, not fidelity"** and no production confidence claim may rest on it.

### C3 🔴 The Unit 0 gate is symmetric on an asymmetric-harm problem (Codex).

`≥90%` point-delta and `≥95%` band agreement weight a false-high and a false-low identically. The
plan's own risk framing says false-low is the crop-loss direction. A model could also "pass" by
refusing so often it is never wrong.

**Fix — two gates the plan lacks:**
- **Unsafe-miss gate:** bound the cases where observed says `60+` and the model says `<60`, or
  observed interval is 7 d and the model emits 14–21 d. Make this the *binding* threshold.
- **Coverage gate:** a minimum fraction of decision-days on which the model actually answers, so
  refusal cannot buy a pass.

Codex also notes the thresholds carry no minimum sample size or confidence intervals — six sites
can pass on thin data. Pre-commit minimum N and report binomial CIs.

### C4 🔴 The ledger has no event identity (Codex).

"Keyed on pathogen × host organ" is a **discriminator, not an identity.** A block can carry several
infection episodes of the same pathogen and organ in one season, and correction-as-event needs a
target to point at.

**Fix:** `logicalEventId` (the stream) + immutable row `id` per append + `supersedesRowId` /
`reversesRowId`. Current state is the latest row per `logicalEventId`, never a lookup by
pathogen/organ.

### C5 🔴 Append-only is half-enforced and retries will duplicate rows (Codex).

A `BEFORE UPDATE` trigger does not stop `DELETE`, and `withWriteRetry` on an insert path
double-inserts without idempotency.

**Fix:** withhold `UPDATE`/`DELETE` grants from `app_rls` entirely (do not rely on the trigger
alone), add a `BEFORE DELETE` guard, and require a deterministic idempotency key with a unique
index per open/resolve/correct command. S3a already has this precedent — `computeRequestHash` in
`record-pure.ts:188`. Reuse it rather than inventing one.

### C6 🔴 The ledger is over-abstracted — BOTH reviewers, independently.

Codex: the JSON-payload-per-enum-arm pays a permanent `jsonb` cost (weak Prisma types, awkward DB
constraints, ugly arm-specific queries) to dodge a hypothetical migration, and *"predeclaring future
enum arms to avoid later migrations is bad reasoning… that trade is backwards"* — Postgres enum
changes are already a solved isolated-migration pattern in this repo.
Gemini: *"S5a only implements Powdery Mildew… Why build the database abstraction for phenology gates
and Goidanich accumulators now?"*

This directly challenges KD-3, which I argued from the scale register's warning that event-schema
evolution costs grow non-linearly once consumers exist. **Two independent reviewers rejecting the
same decision outweighs that argument.** Design question D1 below.

### C7 🔴 Nullable projected timestamps collapse distinct states (Codex).

`symptomExpectedAt = NULL` conflates *unknown*, *not applicable*, *not yet computed*, and *cleared by
correction*. **The plan cites S4's three-distinct-facts rule (`null` / `NOT_ASSESSED` / `NONE`) and
then violates it in its own schema.** Add `symptomProjectionKind` / `infectiousProjectionKind`
(`PROJECTED | UNKNOWN | NOT_APPLICABLE`) plus the basis. Never encode epistemic state in a null.

### C8 🔴 The ascospore biofix ignores flag shoots (Gemini). Agronomy gap.

Powdery mildew overwinters **two** ways: as chasmothecia (releasing ascospores, needs wetness) *and*
as **dormant mycelium in buds**, which emerge at budbreak as mildew-covered **flag shoots**. Flag
shoots need no rain and no leaf wetness. A biofix gated solely on "confirmed ascospore infection"
leaves the model at *unknown* while a flag-shoot epidemic runs.

**Fix:** biofix = first ascospore infection **OR** first observed mildew / flag shoot. The second arm
is a scouting observation, which the system already collects.

### C9 🔴 The ledger has no eradication state (Gemini).

DMIs and strobilurins have **kickback (eradicant) activity**. A latent infection sprayed with a DMI
the next day is dead inside the leaf — but the ledger would still project it to become infectious
and prompt another useless application, driving exactly the resistance pressure the program exists
to manage.

**Fix:** an `ERADICATED` resolution arm, triggered by a logged spray whose chemistry carries kickback
action. This is a real cross-phase seam into S3a's spray record and S2's resistance data, and it is
better designed now than retrofitted.

### C10 🟠 KD-9's type-level enforcement is overstated (Codex).

TypeScript cannot force a caller to *use* a field. Structural typing lets consumers ignore fields,
narrow types, or re-export the number; serialization erases brands.

**Fix — state only what is enforceable:** no exported API returns a bare numeric risk; `rawIndex`
stays module-private; expose a branded wrapper with private fields; the single serializer emits
`{ riskBand, confidence, estimator, reasonCode? }`; back it with compile-time tests plus the DTO
payload test. Keep the intent, drop the overclaim.

### C11 🟠 Missing-day bridge logic is undefined (Gemini).

Monday +20, Tuesday missing, Wednesday +20 — did the streak break? The plan never says. Resetting to
0 manufactures false negatives; silently holding the score may skip a real biological reset.
**Fix:** define it explicitly — carry the previous state across a single missing day with degraded
confidence; beyond two missing days, `UNKNOWN`.

---

## Design questions for Russell

**D1. Collapse the ledger's resolution abstraction to what S5a actually implements?**
Both reviewers say yes. Gemini's version: ship `latent_infection_event` with a `resolvedAt` plus an
`inferenceRule` JSONB and keep Unit 5 simple; work out the relational shape for accumulators when a
pathogen that needs one is actually built. My original argument was the scale register's
non-linear-cost warning. *My read: the reviewers are right on the enum arms (drop `ACCUMULATOR` and
`PHENOLOGY_GATE` until they have consumers) but the **organ** discriminator and the **two
transitions** should stay — those are not speculative, they are required by the powdery arm itself
and by C1.*

**D2. Drop KD-2's 2013 heat-rule substitution?**
Gemini: the 60-point epidemic threshold was validated against the *original* point logic; substitute
a different heat penalty and the totals no longer map to the validated scale — *"you are shipping a
bespoke model under a recognized academic name."* *My read: Gemini is right about shipping it. Keep
the 1999 rule as the model, with its 15-minute term declared absent, and demote the 2013 form to a
**measurement in Unit 0 only** so we learn what it would have changed.*

**D3. We have precipitation — should the model use it?** (Gemini, and this one is sharp.)
The plan calls the model "wetness-blind" because RH is NULL, but **`precipMm` is populated.** Two
consequences: heavy rain bursts conidia, so a rough suppression term is computable; and Phase 1's
ascospore trigger (~2.5 mm rain) is *partly* computable — what we lack is only the wetness *duration*
at 10–15 °C. That means the system could **propose** a biofix date from precip + temperature for the
grower to confirm, rather than asking them cold. Strictly better UX and more in the house
suggest-then-confirm style. Cost: a precip-derived suppression term is a new modelling claim, and the
program's rule §3.7 bar applies.

**D4. Does hiding the raw index cost more than it protects?**
Gemini: agronomists know Gubler-Thomas is a 0–100 scale, and a category hides the **derivative** — a
40 that was 30 yesterday means danger, a 40 that was 60 means a heat wave is killing the fungus.
This is a **direct tension with program rule SAFE-22** ("no raw percentage reaches the UI"), so it is
your call, not mine. *My read: satisfy both by shipping a categorical **trend** (rising / steady /
falling) alongside the category — that restores the derivative without the false-precision number —
and leave the raw value behind a disclosure.*

**D5. Should Unit 0 probe a Bhutan-shaped site?**
Gemini argues gridded reconstruction in Himalayan terrain is not merely miscalibrated but fiction —
grid-cell mean elevation can sit 1,000 m off a valley vineyard — and that the NO-GO must be evaluated
per-site, never averaged, with the index explicitly disabled for a failing tenant. Bhutan is a live
tenant and **is currently absent from the probe's six sites.** Rule §3.12 forbids fixtures *on* the
Bhutan tenant, but the probe reads public weather archives at a lat/lon and writes nothing, so it can
measure Bhutan's regime without touching tenant data. *My read: include it; the alternative is
shipping an unmeasured index to a live tenant.*

---

## Suggested improvements (non-blocking)

- **Indexes (Codex):** at minimum `(tenantId, logicalEventId, createdAt desc)`,
  `(tenantId, blockId, pathogen, hostOrgan, status, createdAt desc)`, and partial indexes on open
  rows for the two projected timestamps.
- **Ledger + projection (Codex):** Prisma is poor at "latest row per stream". Consider a
  current-state projection maintained in the same transaction, ledger remaining source of truth.
- **Runtime confidence is underspecified (Codex):** KD-7 describes an *offline* measurement. Say
  explicitly that runtime confidence is a mapped class from Unit 0's calibration, and define the
  mapping — otherwise "confidence" is decorative.
- **Block modifiers must not lower risk (Codex):** with vineyard-level weather and block-level
  observations, a sparse or missing block observation must never become a path to "low".
- **Separate status from band (Codex):** `status: OK | UNKNOWN | REFUSED` with `riskBand` present
  only when `OK`, rather than mixing "unknown" into the risk enum.
- **PR ordering (Codex):** the Prisma schema and migration history are single-lane assets even when
  product work is parallel — keep PR0 independent but do not merge PR1 until S2b lands and S5a
  rebases. The plan already says this; Codex confirms it.

---

## Raw Response — Codex (`gpt-5.4`)

**CRITICAL**
- `Unit 0 uses fake ground truth.` Where: Unit 0 says "compare against real observed hourly from the Open-Meteo ERA5 archive." ERA5 is reanalysis, not observed station hourly. You are validating one model against another, then pretending the error bars are empirical. For a spray-driven index, that is not good enough. Fix: validate against actual station hourly observations where available. If you cannot, rename Unit 0 to a consistency probe, not a fidelity probe, and block any production confidence claim on it.

- `KD-9 is overstated and not enforceable as written.` Where: KD-8, KD-9, Unit 8. TypeScript cannot force a caller to "use" confidence/estimator just because they received an object. Structural typing lets consumers ignore fields, narrow types, or re-export the number. Serialization erases brands entirely. Fix: weaken the claim to something enforceable: no exported API returns a bare numeric risk, and no public DTO includes `rawIndex`. Keep raw index module-private, expose a branded `PowderyAssessment` wrapper or class with private fields, and make the only serializer emit `{ riskBand, confidence, estimator, reasonCode? }`. Add compile-time tests plus payload tests on the DTO boundary.

- `The ledger identity model is missing.` Where: KD-3, Unit 2, Unit 5. "Keyed on pathogen × host organ × resolution rule" is not a usable event identity. A block can have multiple infection episodes for the same pathogen/organ in one season. Correction-as-event also needs a way to point at what is being corrected. Fix: add `logicalEventId` for the event stream, immutable row `id` for each append, and `supersedesRowId` or `reversesRowId` for corrections. Query current state by latest row per `logicalEventId`, not by pathogen/organ.

- `Append-only is only half enforced, and retries will duplicate rows.` Where: Unit 2, Unit 5. A `BEFORE UPDATE` trigger does not stop deletes, and `withWriteRetry` on an append-only insert path will happily double-insert unless you have idempotency. Fix: do not grant `UPDATE` or `DELETE` to `app_rls`, add a `BEFORE DELETE` guard or simply no delete grant, and require a deterministic idempotency key with a unique index for each open/resolve/correct command.

- `The JSON-per-arm design is premature and weakens both DB integrity and queryability.` Where: KD-3, Unit 2. You are paying the permanent cost of `jsonb` now to avoid a hypothetical future migration later. Prisma types for JSON are weak, DB constraints are awkward, and arm-specific queries/indexes become ugly fast. Fix: for S5a, model the two shipped arms explicitly with scalar columns or subtype tables. If you insist on JSONB, add DB-side `CHECK` constraints keyed on `resolutionKind`, generated columns for query-critical fields, and accept that many queries will be raw SQL.

- `Nullable projected timestamps collapse distinct states.` Where: KD-3, Unit 2. `symptomExpectedAt NULL` can mean unknown, not applicable, not yet computed, or cleared by correction. Those are not the same fact. Fix: add projection status columns such as `symptomProjectionKind` / `infectiousProjectionKind` (`PROJECTED | UNKNOWN | NOT_APPLICABLE`) plus source/basis metadata. Do not encode epistemic state with null alone.

- `The Unit 0 gate misses the harm direction.` Where: KD-1, Unit 0, Acceptance gate. `90%` daily point-delta agreement and `95%` interval-band agreement are not enough because they weight false-high and false-low equally. Your own risk framing says false-low can cause crop loss or illegal application timing. Fix: add an explicit unsafe-miss gate around threshold downgrades, e.g. limit cases where observed says `60+` and model says `<60`, or observed interval is `7d` and model emits `14–21d`. Also add a coverage gate so a model cannot "pass" by refusing too often.

**SHOULD FIX**
- `PR ordering ignores the live schema constraint.` Where: dependency note plus PR1. If S2b has an uncommitted schema slice, "PR0 no schema → PR1 schema → PR2 feature" is optimistic. Prisma schema and migration history are single-lane assets even when product work is parallel. Fix: keep PR0 independent, but do not merge PR1 until S2b lands and S5a is rebased. If you want parallel progress, move pure math/read-only work ahead of the schema PR.

- `Predeclaring future enum arms to avoid later migrations is bad reasoning.` Where: KD-3. The plan treats a future enum migration as more dangerous than a permanently underconstrained schema. That trade is backwards. Postgres enum changes are already a known isolated migration pattern in this repo. Fix: only ship `FIXED_WINDOW` and `UNKNOWN` now unless you also have real consumers, tests, and DB constraints for the others.

- `The missing indexes are not minor.` Where: Unit 2. With append-only rows, latest-state queries and "what is due now" reads will be hot. Fix: add at minimum `(tenantId, logicalEventId, createdAt desc)`, `(tenantId, blockId, pathogen, hostOrgan, status, createdAt desc)`, and partial indexes for open rows on `symptomExpectedAt` / `infectiousExpectedAt`. If JSON stays, add expression indexes for any arm-specific field you filter on.

- `The thresholds are statistically hand-wavy.` Where: Unit 0. "Per site" thresholds over six demo vineyards can be noisy, and the plan does not specify minimum N or confidence intervals. Fix: precommit minimum sample sizes and report bootstrap CIs or binomial intervals for band agreement. Otherwise a site can "pass" on thin data.

- `Raw index leakage is still too easy.` Where: Unit 4, Unit 6, Unit 8. The core output still includes raw index, and the read seam/tool boundary is where accidental false precision leaks happen. Fix: keep raw index internal to the math and verifier paths only. The UI/tool DTO should not carry it unless there is a very explicit internal-only consumer.

**DESIGN QUESTIONS**
- `Do you actually want one append-only table, or a ledger plus a current-state projection?` Where: Unit 2, Unit 5. Prisma is bad at "latest row per stream" query ergonomics. If read performance matters, a projection table maintained in the same transaction may be the cleaner design while keeping the ledger as source of truth.

- `How is confidence computed at runtime?` Where: KD-7, Unit 3. "Provider-vs-station agreement" is a good principle, but the plan only describes offline measurement. If runtime confidence is really a mapped class from Unit 0 calibration, say that explicitly and define the mapping. Otherwise "confidence" becomes decorative.

- `Can block modifiers only increase uncertainty/risk, or can they lower it?` Where: KD-6, Unit 6. With vineyard-level weather and block-level observations, allowing block modifiers to lower risk is dangerous unless the rule is tightly constrained. Missing or sparse block observations must not become a path to "low".

- `Is "unknown" part of the risk enum or a separate evaluation status?` Where: refusal ladder, Unit 4. Right now the plan mixes "unknown" and "refusal" semantically. That will get messy at the API boundary. A cleaner shape is `status: OK | UNKNOWN | REFUSED` plus `riskBand` only when `OK`.

---

## Raw Response — Gemini (`gemini-3.1-pro-preview`)

This is a sharp, defensive plan that does an excellent job treating data deficiency as an engineering hazard rather than just a business problem. The decision to use a pre-committed measurement probe (Unit 0) rather than blindly building the index is exactly the right call.

However, the domain reasoning has several fatal flaws. You have inverted the definition of "conservative" for epidemiology, your biofix logic ignores a primary overwintering mechanism, and you are applying a Mediterranean climate model to a Himalayan terrain using interpolated grid data. If shipped as-is, this will cause crop loss.

### CRITICAL (Will cause crop loss, false negatives, or silent failures)

**1. Agronomy: You have inverted the "conservative" latent period.**
- **Where in plan:** Section 4, KD-4. "Bendek... reports 13–14 d... roughly double. Hold the event open on the conservative (longer) bound."
- **What's wrong:** In plant pathology, a *longer* latent period is less risky. If you tell a grower "this infection won't be infectious for 14 days" (holding it open), they will delay their spray. If the real latent period was 5 days, the pathogen sporulates on day 5 and starts a secondary epidemic while your ledger says it is still safely incubating.
- **The fix:** The "conservative" (safest for the crop) bound is the *shortest* biologically plausible generation time. Resolve the latent period at 5-7 days.

**2. Agronomy: The Ascospore Biofix ignores Flag Shoots (mycelial overwintering).**
- **Where in plan:** Section 1.0. "Runs only after ascospore infection is confirmed... grower confirms first ascospore infection... Phase 2 runs from that biofix."
- **What's wrong:** Powdery mildew does not solely overwinter as chasmothecia (which release ascospores). In many climates, it overwinters as dormant mycelium in the buds. When these buds break, they emerge as "flag shoots" covered in mildew. **Flag shoots do not require leaf wetness or rain to initiate.** If a Bhutanese or Oregon vineyard has flag shoots and the system refuses to start Phase 2 until an "ascospore infection" is logged, the epidemic will rage while the model sits at *Unknown*.
- **The fix:** The biofix must be "First Ascospore Infection OR First Visible Mildew / Flag Shoot".

**3. Data & Climatology: Gridded diurnal reconstruction will fail catastrophically in Bhutan.**
- **Where in plan:** Section 5, Unit 0 & Section 7 Risks. "Calibration mismatch... 2 m screen-height gridded".
- **What's wrong:** You are using gridded weather (like ERA5) to drive a diurnal temperature curve in **the Himalayas** (Bhutan). Gridded data interpolates over 9km to 30km squares. In mountainous terrain, the grid's average altitude can be 1,000+ meters off from the actual vineyard valley. A reconstructed hourly curve from a flattened grid Tmax/Tmin in a monsoon climate will not just have a "calibration mismatch"—it will be pure fiction. It will never hit the 21–30°C consecutive hour bands correctly.
- **The fix:** The Unit 0 NO-GO gate MUST be evaluated independently for the Bhutan site. Do not average the pass/fail rate across all tenants. If the Bhutan site fails Unit 0 (it will), you must explicitly disable the index for that tenant rather than shipping bad numbers.

**4. Ledger Domain Model: The ledger has no state for "Eradicated by Spray".**
- **Where in plan:** Section 4, KD-3 & Section 5, Unit 5. Arms are `FIXED_WINDOW`, `ACCUMULATOR`, `PHENOLOGY_GATE`, `UNKNOWN`.
- **What's wrong:** A latent infection ledger is useless if it doesn't account for grower intervention. DMIs (sterol inhibitors) and Strobilurins have "kickback" (eradicant) activity. If a latent infection occurs on Monday, and the grower sprays a DMI on Tuesday, the fungus dies inside the leaf. Your ledger will incorrectly project this dead pathogen to become infectious next week, prompting another (useless) spray.
- **The fix:** The ledger must support an `ABORTED` or `ERADICATED` resolution state, triggered by a logged spray event containing a chemical with known kickback action.

### SHOULD FIX (Logic gaps and model violations)

**1. Model Integrity: You are rewriting Gubler-Thomas, not implementing it.**
- **Where in plan:** Section 1.1 states the 35°C rule is *absent*. Section 4, KD-2 contradicts this, inventing a replacement rule (34°C/4h, 36°C/4h).
- **What's wrong:** The 60-point threshold for "epidemic underway" in Gubler-Thomas was empirically validated against the specific point logic of the original index. If you substitute a completely different heat-penalty rule (KD-2), your point totals no longer map to the validated 0-100 scale. You are shipping a bespoke model under a recognized academic name.
- **The fix:** Drop KD-2. Stick to Section 1.1's conclusion: the 35°C rule is computationally absent. Document that the index runs conservative (high) during extreme heat waves. Do not invent points.

**2. State Machine: Accumulator behavior on missing days is undefined.**
- **Where in plan:** Section 5, Unit 4. "missing-input day resolves unknown not low". Section 1.1: "Three consecutive days... if the streak breaks before 60, reset to 0".
- **What's wrong:** You did not define how the Gubler-Thomas accumulator handles a missing day. If Monday is +20, Tuesday is Missing (`Unknown`), and Wednesday is +20, what happens? Did the streak break? Does it resume? If you default to resetting to 0, you generate false negatives. If you hold the score, you might skip a biological reset.
- **The fix:** Explicitly define the missing-day bridge logic. The standard agronomic fallback for a single missing day in an accumulator is to carry over the previous day's state (assume continuity), but flag the confidence as degraded. If >2 days are missing, reset to `Unknown`.

**3. Environmental Logic: Utilizing daily precipitation to mimic conidia suppression.**
- **Where in plan:** Section 4, KD-10. "liquid water suppresses secondary powdery mildew by bursting conidia. A wetness-blind model can recommend spraying into conditions already suppressing."
- **What's wrong:** You say the model is wetness-blind because humidity is NULL, but you have precipitation data! Heavy rain (e.g., >2.5mm) washes off and bursts conidia.
- **The fix:** You can implement a rough version of this suppression logic using the `precip` column. Subtract points or suspend the accumulator on days with significant continuous precipitation.

### DESIGN QUESTIONS (Product and Engineering choices)

**1. UX Judgment: Hiding the raw index score will destroy trust.**
- **Where in plan:** Section 4, KD-8 & KD-9. "No raw index number reaches the UI... destructuring an object carrying confidence band."
- **Question:** Are you sure your growers won't reject this? Agronomists understand Gubler-Thomas is a 0-100 scale. If you give them a category ("Intermediate") instead of a number ("40"), they cannot see *momentum*. A 40 that was 30 yesterday means danger. A 40 that was 60 yesterday means the heat wave is killing the fungus. By hiding the number, you hide the derivative (rate of change).
- **Alternative:** Expose the raw number, but change the UI treatment (e.g., strike-through, gray out, or add a heavy warning icon) when confidence is low.

**2. Architecture: Is the Ledger over-engineered for S5a?**
- **Where in plan:** Section 4, KD-3. Defining Goidanich accumulators, degree-day bounds, and phenology gates for Black Rot and Downy Mildew.
- **Question:** S5a only implements Powdery Mildew, which uses a highly contested `FIXED_WINDOW` resolution. S5a does not implement the other pathogens. Why build the database abstraction for phenology gates and Goidanich accumulators now?
- **Alternative:** Ship the `latent_infection_event` table with a simple `resolved_at` timestamp and an `inference_rule` JSONB column. When you actually implement Downy Mildew (which needs humidity you don't have), figure out the relational schema for accumulators then. Keep Unit 5 dead simple.
