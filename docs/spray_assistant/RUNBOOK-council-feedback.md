---
title: Spray Intelligence master runbook — council feedback
type: council-feedback
subject: docs/spray_assistant/SPRAY_ASSISTANT_RUNBOOK.md
date: 2026-07-26
reviewers: Codex (gpt-5.4 — structure, data layer, gates) · Gemini (gemini-3.1-pro-preview — domain, liability, UX)
status: awaiting reconciliation decisions
---

# Council feedback — Spray Intelligence build runbook

Reviewed at the **program-structure** level, not the prose level: phase decomposition, dependency
edges, parallel-lane disjointness, gate sufficiency for safety-critical output, and sequencing.

**Headline: the phase decomposition has a genuine hole and the dependency graph is wrong.** Both
reviewers found it independently, from different angles. Neither reviewer challenged the two-engine
architecture, the honesty contracts, or the append-only posture — those held.

Each finding below carries my adjudication: **FOLD** (accept, clearly correct), **FOLD-MODIFIED**
(accept the problem, reject the proposed fix), **DECISION** (needs Russell), or **PUSH BACK**.

---

## CRITICAL — must resolve before S0

### C1. There is no phase that produces the product facts S6 and S7 depend on ⟶ **FOLD**
*Codex, CRITICAL 1*

S2 builds registration + state legality + resistance codes. But **S6's gate requires rainfast period
and chemistry mobility class** (contact / translaminar / locally systemic / mobile systemic), and
**S7's gate requires PHI, REI, separation intervals, and seasonal maxima.** No phase produces any of
those. I deferred label-value extraction to "Later" (following plan 086, correctly) and then wrote
two downstream gates that cannot pass without it.

This is a real contradiction in the runbook, not a nitpick.

**Fix:** insert **S2b — product facts master** in Wave 1, between S2 and the Wave-2 lanes that need
it. It is *not* full label-PDF extraction. It is a **curated, versioned, per-product, human-reviewed,
cited facts table**: rainfast period, mobility class, PHI, REI, minimum repeat interval, seasonal
maxima, separation rules, adjuvant restrictions. Scope it by the measured coverage curve — plan 086
found the **top 60 active ingredients cover 86.5% of all product-AI occurrences**, so a curated set
gets most of the way. Everything outside it resolves to *cannot-determine* per rule §3.6, which is
already the designed behavior.

New edges: `S2b←S2`; `S6←S2b`; `S7←S2b`.

### C2. The dependency graph is wrong in three places ⟶ **FOLD**
*Codex, CRITICAL 2 (Gemini implies the same)*

My own phase text contradicts my own edge list:

| Stated edge | Reality |
|---|---|
| `S7←S2,S3a` | S7's scope says *"sulfur × forecast temperature (**hourly**, after application)"* and *"copper under slow-drying conditions"* → **S7←S1** |
| `S7←S2,S3a` | Interlocks are conditioned on *fruit present* / growth stage → **S7←S4** |
| `S5←S1` | The 3-10 downy rule needs *"shoots ≥10 cm"*, which S4 produces → **S5←S4** |

This breaks the load-bearing claim that "each Wave-2 lane hangs off a *different* Wave-1 lane." It
does not kill the parallelism, but the schedule story was wrong and would have surfaced as a mid-wave
blocker.

**Fix:** correct the edge list, and see **C5** for the split that makes the parallelism true again
rather than merely stated.

### C3. One hourly table conflating observed / forecast / reanalysis ⟶ **FOLD**
*Codex, CRITICAL 4*

S1 specifies a single `VineyardWeatherHourly` fed by NWS gridpoint (**forecast**), Open-Meteo
(**forecast**), and ERA5-Land (**reanalysis/history**). But S5 and S6 read **past observed** weather
while S7 reads **future forecast**. Nothing in the design prevents a forecast row from satisfying a
historical-decision read.

That is exactly the bug that produces *"we scored your residual against rain that never fell."* The
existing codebase already keeps `ClimateProvider` and `ForecastProvider` deliberately parallel —
I said `HourlyProvider` was "parallel to" both and then specified one undifferentiated table.

**Fix:** model `seriesKind` (OBSERVED | FORECAST | REANALYSIS) + `issuedAt` + `validTime`
explicitly, or use separate tables. **Add a contract-test gate: a FORECAST row can never satisfy a
historical-decision read.**

### C4. A spray record that stores only an EPA reg string lets past decisions drift ⟶ **FOLD**
*Codex, CRITICAL 5*

Avoiding a hard FK is right for durability (a spray must survive de-registration). But re-deriving
legal and chemistry facts from a **monthly-refreshed** reference table means a historical decision
silently changes meaning after a refresh or a data correction. The repo already treats this class of
problem correctly elsewhere — `COST-3-immutable-cogs-snapshot`.

**Fix:** store the durable natural key **plus a facts-as-of snapshot** — the resolved AIs, resistance
groups, PHI/REI, rainfast, mobility class, and the facts revision/as-of date used at entry time.
This also answers *"do historical decisions replay under facts-as-of-then or facts-as-of-now?"* —
**then**, with a visible flag when current facts differ.

### C5. Sequencing: the deterministic, high-value engine is built last ⟶ **DECISION (recommend FOLD)**
*Gemini, CRITICAL 5 — the strongest product argument in either review*

The plan builds fragile probabilistic models (S5 infection risk, S6 residual) **before** the
deterministic legal engine (S7). A grower needs *"can I legally put this in the tank, and does it
rotate?"* long before they need a 6-km-grid leaf-wetness botrytis estimate. The legal answer is
exact, defensible, and shippable without any of the weather work.

Combined with **C2**, the clean synthesis is to **split S7**:

- **S7a — legality + rotation** (registration, state, PHI, REI, minimum interval, seasonal maxima,
  FRAC/IRAC rotation budget, elapsed-days separations). Needs only `S2, S2b, S3a`. **Moves to Wave 1.**
- **S7b — weather-conditioned interlocks** (sulfur × hourly post-application temperature × variety
  sensitivity, copper under slow-drying, application-window/Delta T). Needs `S1, S4`. **Stays Wave 2.**

This resolves Codex's dependency complaint *and* Gemini's sequencing complaint with one cut, and it
front-loads the highest-severity gate. Gemini also argues **S8 (lot residue crossover) moves to
Wave 1** — it needs only `S2, S2b, S3a`, so that follows for free and the moat ships even earlier.

⚠️ **This is a real re-shape of the program and needs Russell's call.** See Decision 1.

### C6. The regulatory layer bricks the app for the Bhutan tenant ⟶ **FOLD**
*Gemini, SHOULD FIX 3 — I am promoting this to CRITICAL because Bhutan is a LIVE tenant*

Rule §3.6 says an unmatched product renders *unknown*; S7 then yields *cannot-determine*; the
assistant refuses. S2 is EPA + CA DPR. **Therefore every Bhutanese spray resolves to unknown and the
entire feature refuses to work for a real, live customer.** The runbook never says what happens
outside the US.

**Fix:** a **non-US tenant path** in S2/S2b — a tenant flagged non-US defines product legality, PHI,
REI, and resistance group manually (tenant-scoped, attributed to the user who entered it, clearly
marked "grower-supplied, not verified against a registry"), bypassing the EPA lookup entirely. The
agronomic engines (S5/S6/S7b) are jurisdiction-neutral and work unchanged.

### C7. Entitlement enforced "at the tool" is the wrong layer ⟶ **FOLD**
*Codex, CRITICAL 8*

Rule §3.7 inherits plan 086's *"the tool is the entitlement boundary"* — which was true when the only
consumer was an assistant tool. **S9 and S10 are server components and server actions, not tools**,
and they bypass it entirely.

**Fix:** move entitlement into the shared domain service layer that both tools and UI consume, and
gate it with page-level tests as well as assistant-level tests.

### C8. Moving the planned harvest date retroactively creates a PHI violation nobody is told about ⟶ **FOLD**
*Gemini, CRITICAL 1 — the best catch in the review, and a scenario I missed entirely*

A grower plans an Oct 10 pick, sprays a 14-day-PHI product on Sept 20 (legal), then pulls the pick
forward to Sept 30 because of a rain forecast. **The fruit is now unsellable and the system says
nothing**, because PHI was validated once, at spray time.

**Fix:** PHI cannot be a one-time gate. **Any mutation of a block's planned harvest date must
re-evaluate every application in the trailing PHI window** and raise a hard warning at the moment of
the date change. Add it to S7a's gate and to the standing QA safety cases.

### C9. Adjuvants are invisible to the interlock engine ⟶ **FOLD**
*Gemini, CRITICAL 2*

S3a captures material lines (product, active ingredient) and a mixing-order table — but **no
adjuvant class**. Brief §8.5 explicitly warns that penetrant adjuvants stack phytotoxicity risk, and
captan plus an organosilicone penetrant under slow-drying is a known injury combination. The record
schema contradicts the brief.

**Fix:** add `adjuvantClass` to S3a material lines; add penetrant-adjuvant combinations to the S7b
interlock matrix.

### C10. Sour rot depends on telemetry the system does not collect ⟶ **FOLD**
*Both reviewers, independently*

S5 gates sour rot on "Brix, berry wounds, vinegar-fly pressure." `BrixLog` exists. **Berry wounds and
vinegar-fly pressure do not exist anywhere in the schema**, and the weekly field note does not carry
them. The model would never fire, or would fire on fabricated inputs.

**Fix:** either add a *"cluster damage + pest pressure"* scouting observation to S4 and keep sour rot,
or cut sour rot from S5 to the Later bucket. **A disease model may not depend on data the system
does not collect** — worth promoting to a standing rule.

---

## SHOULD FIX

### S1. "Percent protection remaining" is false precision ⟶ **FOLD**
*Gemini* — 42% implies a mathematical certainty that does not exist. **Expose categorical states
(Protected / Vulnerable / Depleted) plus the decay *drivers* ("depleted — 6″ shoot growth since
application, 1.2″ rain on a 9-day-old protectant"). Keep the number internal for tests.** The driver
is what a grower acts on anyway, which is already what S6's scope says.

### S2. Retention must be sized by replay horizon, not storage cost ⟶ **FOLD**
*Codex* — S0 frames retention as rows/latency. The real constraint is that **pruning hourly data
destroys the ability to explain a past decision**, through harvest and after a correction event.
Fix: S0's ADR sizes retention against the longest required replay horizon, **or** requires immutable
decision-input snapshots so decisions stay reproducible after raw hourly is pruned. (This pairs with
C4 — the same principle, one layer down.)

### S3. `driedBeforeRain` must be derived, not self-reported ⟶ **FOLD**
*Codex* — a free-text/boolean truth source for a value that materially changes the residual estimate
is a data-quality hole. Derive it from application timestamps + S1 hourly precipitation; let the
operator override with attribution.

### S4. Per-block material rate, tank batches, and deposition are missing ⟶ **FOLD**
*Codex* — a ten-block pass has one header weather snapshot but blocks sprayed hours apart, and no
per-block rate. Add tank-batch identity + per-block computed rate/acre + coverage/deposition
evidence fields. S6's confidence already claims to fall when no deposition check exists — nothing
records one.

### S5. Wind speed and direction must be distinct columns ⟶ **FOLD**
*Gemini* — S3a says "weather at application" as a blob. **CA PUR and drift-mitigation rules require
wind speed and direction at time of application.** Make them first-class columns, with temperature.

### S6. LWD is blind to canopy architecture, and needs a grower override ⟶ **FOLD**
*Gemini* — leaf wetness inside a leaf-pulled VSP canopy dries hours faster than an unmanaged sprawl.
Add canopy-management state as a modifier to the S1 estimator, and a **"calibrate wetness"** action
so a grower standing in a dry vineyard can correct the grid estimate and reset the clocks. That
override is itself an observation and gets recorded with attribution.

### S7. Split S5 — it is over-bundled ⟶ **FOLD**
*Codex* — daily-data Gubler-Thomas, hourly/LWD pathogens, and the latent-infection ledger should not
share one acceptance gate. **S5a** (daily powdery proof + the ledger foundation) / **S5b** (hourly
pathogens). S5a needs no hourly data and could run in Wave 1.

### S8. "File-disjoint by construction" is false beyond the files I named ⟶ **FOLD**
*Codex* — additional shared choke points: `docs/architecture/assistant-coverage.md` (generated),
`test/evals/assistant-tools.eval.test.ts` + golden files, `src/lib/assistant/prompt.ts`,
`src/lib/harvest/*` and `src/lib/fieldnotes/*` (S3a's back-compat + planned-harvest seams),
`src/lib/weather/*` (reused by S4 and S7b), cron/config for S1 and S2 refreshes.
**Fix: replace the blanket claim with an explicit serialized shared-file map.**

### S9. Missing gates for dangerous failure modes ⟶ **FOLD**
*Codex* — add: **correction-event propagation** (reversing a spray must remove its residual, PHI,
rotation, *and* lot-residue effects — currently untested and it crosses four phases); stale reference
data or stale weather forces *unknown/refuse*; a malformed EPA reg number **never fuzzy-matches** to
a product; operating-timezone/DST cases for sulfur windows and PHI boundaries.

### S10. Two gate tiers, because branch acceptance cannot be parallel ⟶ **FOLD**
*Codex* — DB-backed `verify:*` runs only from the main checkout, the `.git` index is shared, and
`prisma generate` is shared. Branch-local gates (`tsc`, pure tests) parallelize; integration gates
serialize. **Say so, rather than implying full parallelism through to green.**

### S11. Legacy name-only sprays must still seed the rotation budget ⟶ **FOLD-MODIFIED**
*Gemini* — correct problem: a legacy "Pristine" record that never maps to FRAC 7/11 lets S7a clear a
consecutive-use violation. **But Gemini's fix — LLM fuzzy-matching into safety-critical rotation
data — violates standing rule §3.2.** Correct shape: the system *suggests* a mapping, a **human
confirms** it, and the confirmed mapping is stored with attribution. Unconfirmed legacy records
count as *unknown* in the rotation budget, which blocks a "rotation OK" claim rather than granting one.

---

## PUSH BACK

### P1. "Do not derive FRAC codes at all" ⟶ **PARTIALLY REJECTED, one part folded**
*Gemini, CRITICAL 3*

Gemini argues the derived resistance table is a "shadow FRAC database" with no update SLA and
recommends buying CDMS/Agrian or pushing manual entry onto the tenant.

**Where it is wrong:** it treats derivation as ungated. Plan 086 already **measured** the failure
modes (6/14 match, 2/14 systematic multi-site conflict, 6/14 miss, concentrated in biologicals) and
built the **coverage report** specifically so every AI resolves to coded / no-code-exists / **gap**
with zero unclassified — and rule §3.6 makes a gap render as *unknown*, which cannot produce a
"rotation OK." The mitigation Gemini asks for is the design. Also, "no FRAC parsing" is a **binding
user decision**, not an oversight.

**Where it is right, and folded:** (a) the **no-update-SLA risk is real** and belongs in the runbook's
risk register with a monthly-refresh + re-derivation obligation; (b) a **tenant-level manual override**
for an unrecognized product is genuinely useful — and it is the *same mechanism* C6 needs for Bhutan,
so it gets built once and serves both.

Whether to *additionally* buy structured label data is Decision 2 below.

---

## DESIGN QUESTIONS

### D1. Export MRLs — a real gap ⟶ **DECISION**
*Gemini* — the brief mentions MRL divergence by market once, in passing; **no phase owns it.** For a
winery exporting to the EU, UK, Japan, or Canada, a blended wine violating an import MRL is a larger
financial event than the H2S flag S8 ships. And we own the blend lineage that makes it computable.
Scope question, see Decision 3.

### D2. How is the model *forced* to quote the block reason? ⟶ **FOLD**
*Gemini* — rule §3.2 says the model may only explain a hard stop, but names no mechanism. Fix: S7's
output carries an opaque `blockReasonCode` + canonical human string; the tool contract requires the
model to render that string **verbatim**; a golden case asserts a copper-slow-drying block is never
explained as a PHI violation. Add to S11's gate.

### D3. What does "Watch" mean operationally that "Act" does not? ⟶ **FOLD**
*Gemini* — fair challenge to the five-state vocabulary. My answer: **Watch = the risk model is
elevated but protection still holds — re-check within N days; Act = protection is inadequate for the
risk — do something now (which may be scouting, not spraying).** If S9 cannot write a one-sentence
operational instruction for each of the five states, the state does not exist. **Add that to S9's gate.**

### D4. Is planned harvest mutable intent or an auditable event stream? ⟶ **DECISION (recommend: audited)**
*Codex* — if PHI decisions read it and it can be edited in place, prior decisions silently change
meaning. Given C8, it should carry the same correction/audit treatment as spray records. Cheap now,
expensive to retrofit.

### D5. Facts-as-of-then or facts-as-of-now for replay? ⟶ **ANSWERED by C4** — as-of-then, with a
visible flag when current facts differ.

---

## Reconciliation summary

**Structural changes to the phase map** (pending Decision 1):

| Change | Source |
|---|---|
| **+ S2b** product facts master (Wave 1) | C1 |
| **S7 → S7a** legality + rotation (Wave 1) **/ S7b** weather interlocks (Wave 2) | C2 + C5 |
| **S8** moves to Wave 1 | C5 |
| **S5 → S5a** daily powdery + ledger (Wave 1) **/ S5b** hourly pathogens (Wave 2) | S7 |
| Corrected edges: `S5b←S1,S4`; `S7b←S1,S4`; `S6←S2b`; `S7a←S2b` | C2 |
| Sour rot cut from S5 unless S4 adds damage/pest scouting | C10 |

**New standing rules:** a model may not depend on data the system does not collect (C10); non-US
tenants get a manual product-facts path (C6); entitlement lives in the service layer, not the tool
(C7).

**Net effect if Decision 1 is taken:** Wave 1 delivers the spray record, the legal/rotation engine,
the lot-residue moat, and a working powdery-mildew index — **a shippable, defensible product before
any hourly-weather work lands.** Wave 2 becomes the weather-dependent modeling wave.
