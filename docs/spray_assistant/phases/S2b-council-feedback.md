# S2b Council Feedback — Product Facts Master

**Date:** 2026-07-26
**Plan reviewed:** [S2b-product-facts-master-plan.md](S2b-product-facts-master-plan.md)
**Reviewers:** Codex `gpt-5.4` (types, contracts, Prisma/RLS, gate honesty) · Gemini `gemini-3.1-pro-preview` (agronomic domain, data quality, curation operations)
**Adjudicated by:** Claude, 2026-07-26. Plan revised in the same pass.

Output path deviates from the `/council` default (`council-feedback.md` at repo root) per the program
convention in runbook §4 — every lane writes to `phases/S<n>-council-feedback.md`.

---

## The headline: three findings collapse into one change

Codex's DQ2, Gemini's CRITICAL 3, and Gemini's SHOULD-FIX 1 arrived independently and are the same
defect seen from three sides:

- Codex: *"Is row-wide `reviewDueAt` actually the model you want? It couples PHI/REI/rainfast/mobility/resistance freshness into one expiry bit even though the sources and cadences differ."*
- Gemini: *"If you put UC IPM rainfastness on a row cited to an EPA label, you are falsifying provenance."*
- Gemini: *"[whole-row override means] you have just built a system that actively hides regulatory updates from users."*

The plan treated **the row** as the unit of provenance, freshness, and override. It is not. A product's
facts come from **two sources on two cadences with two review disciplines**:

| Group | Facts | Source | Cadence |
|---|---|---|---|
| **REGULATORY** | PHI, REI, max applications, seasonal AI limits, min repeat interval, bulletin requirement, separation rules | the label (EPA / CA DPR) | changes rarely; changes are legally binding |
| **AGRONOMIC** | rainfast period, mobility class, agronomic class tags | extension sources (UC IPM, Cornell), manufacturer tech sheets | changes with the literature; advisory |

**Folded: the fact GROUP replaces the row as the unit of provenance, `reviewDueAt`, and tenant
override.** This is now KD-11, and it dissolves all three findings plus a fourth (Gemini's CRITICAL 4
attrition risk) at once — because regulatory facts, which barely change, no longer expire on the
agronomic review cadence.

---

## Critical findings

### C1. `ProductFactsKey` carries no version selector, so KD-1's multi-version rows are unresolvable ⟶ **FOLD**
*Codex, CRITICAL 1.* The frozen `ProductFactsKey` is `{ epaRegistrationNumber?, tenantProductRef?,
productName }` and the dedupe key in `record-core.ts:52` is exactly those three. Two curated rows for
one EPA reg gives `resolveMany` no deterministic selector, and "pick latest" destroys KD-1's entire
rationale.

**Correct, and it would have shipped.** Fix folded: **exactly one ACTIVE curated row per
`(epaRegNumber, factGroup)`**, enforced by a partial unique index on `supersededAt IS NULL`.
Superseded versions are retained for replay (a past decision's `factsRevision` still resolves) but
never participate in a live resolve. Version history exists for audit; resolution is single-row **by
construction**, not by selection.

### C2. KD-10 says "degrades to UNKNOWN", Unit 6 says "falls through" — and they are not the same thing ⟶ **FOLD-MODIFIED**
*Codex, CRITICAL 2.* If a stale curated row falls through to the registration-only tier, that tier
still supplies `resistanceGroups` and `activeIngredientKeys` from S2, and `rotationContribution`
(`read-core.ts:34`) consumes them as usable evidence. So "stale → unknown" silently became "stale →
still has rotation evidence."

**The contradiction is real and the plan's language was wrong.** But the fall-through is *correct* on
the merits once KD-11 lands: S2's resistance artifact is a **different source with its own
freshness**, and it is not stale merely because a curated facts row is. Folded as:

- KD-10 rewritten to say precisely what degrades — **the stale group's own fields**, not the product.
- A stale group can never contribute to `completeness: KNOWN` (test).
- S2's resistance/AI freshness is checked independently and travels labeled.
- The fall-through is documented as deliberate, with the reason, rather than reading as an oversight.

### C3. Jurisdiction is resolved at the wrong granularity and is never snapshotted ⟶ **FOLD**
*Codex, CRITICAL 3.* A spray pass spans blocks across vineyards, so one `vineyardId` jurisdiction is
wrong for some block lines. Worse: `regulatoryCountry/State` on a mutable `Vineyard` row means a
historical read drifts when an admin edits it later — a direct violation of rule §3.8
(decisions replay under facts-as-of-then).

**Correct on both counts, and the second one is the serious half.** Folded: jurisdiction is resolved
**per block line** and **snapshotted onto the block line at record time**; downstream legality reads
consume the snapshot, never the live vineyard row.

### C4. Unit 4's "additive" claim is true at the type level and false in the running system ⟶ **FOLD**
*Codex, CRITICAL 4.* Snapshot propagation is manual across `facts-snapshot-core.ts`,
`record-core.ts:165`, `correction-core.ts:102`, `spray/types.ts:71`, `spray/actions.ts:71`. And the
verification the plan named cannot catch the break: `verify-spray-record.ts:220` only asserts the
scalar `factsRevision`/`factsAsOf`, so `snapshotFactsProvenance` could be silently dropped on a
correction with every current test still green.

**Correct.** Folded: enumerate every copy path in the unit, and add a **correction-copy assertion for
the provenance field specifically**. "Optional at the type level" is not "additive in the running
system" — that sentence goes in the unit.

### C5. The new batched registry read can bypass entitlement while the K7 guard still passes ⟶ **FOLD**
*Codex, CRITICAL 5.* `test/pesticide-boundaries.test.ts:50` is a **textual, single-function** check:
it asserts the entitlement call precedes `findProductByCanonical` *inside `lookupRegistration`*. New
batched helpers in `lookup.ts` can query pesticide tables before entitlement and CI stays green.

**Correct, and this is the finding I would least have caught myself** — the guard looked like it
covered the module and it covers one function. Folded: the batch facts read is its own
entitlement-gated exported entrypoint, and the boundary test is widened to assert the gate on
**every exported registry-backed read**, enumerated, so a sixth read cannot be added without
tripping it.

### G1. No AI concentration, so `maxAiPerSeason` is not computable ⟶ **FOLD-MODIFIED**
*Gemini, CRITICAL 1.* *"'3 lbs of Pristine' does not mean 3 lbs of Boscalid."* Seasonal per-AI limits
and per-group budgets need concentration.

**Half already exists, half is a real hole.** S2 shipped `PesticideProductIngredient.percent` and
`ResolvedActiveIngredient.percentByWeight`, so dry formulations are covered. **Liquids are not** —
label seasonal maxima for liquids are expressed in lbs-AI/acre and the conversion needs
**lbs-AI-per-gallon**, which nothing in the repo carries. Folded: `lbsAiPerGallon` (+ formulation
type) as a curated per-product-AI attribute in the regulatory group. Cheap, and without it S7a's
seasonal-maximum gate — which the runbook says must **refuse**, not warn — cannot compute at all for
liquids.

### G2. PHI and REI are conditional, not scalars ⟶ **FOLD**
*Gemini, CRITICAL 2.* REI varies by task (12 h for scouting vs 48 h for tying, training, leaf
pulling); PHI varies by rate and crop state. *"Flattening these into a single number forces you to
either pick the highest (enraging growers) or the lowest (violating federal law)."*

**This is the review's best domain catch and it invalidates a downstream gate as written.** S7a's own
acceptance gate is *"REI collides correctly with a scheduled hand-labor work order"* — and hand
labor is precisely the 48-hour task. A scalar REI cannot answer it. Folded:

- child relations `pesticide_product_rei_condition` (activity, hours) and
  `pesticide_product_phi_condition` (condition, days);
- the **frozen port stays scalar** (`reiHours: number | null`), so the resolver emits the
  **worst-case bound** into it — renamed in the docs to what it is, a statutory worst case, never an
  allowance — while S7a reads the richer relation directly for the task-specific answer.

### G3. Whole-row override hides regulatory updates from the grower ⟶ **FOLD-MODIFIED (into KD-11)**
*Gemini, CRITICAL 3; Codex reaches the same place in DQ3.* A US grower who overrides a curated row
just to add a missing rainfast value now shadows the **whole** row. When EPA extends that product's
REI, the curated row updates and the grower's shadow does not.

**Both reviewers converged, so this is load-bearing.** Gemini's proposed fix — field-level
`COALESCE` — is **partially rejected**: a per-field merge still produces a snapshot no human reviewed
as a coherent whole, which was KD-3's original and still-valid reason. **Group-level is the answer**:
it is the natural review unit, it matches the source split, and it lets the "add rainfast" case
override the agronomic group while continuing to receive regulatory updates. That is exactly the
behavior Gemini is asking for, at the right granularity. KD-3 rewritten; KD-11 added.

### G4. The staleness mechanism bricks the app by attrition, and users will fight it with dummy overrides ⟶ **PARTIALLY FOLD**
*Gemini, CRITICAL 4.* *"If the solo maintainer goes on vacation, gets sick, or falls behind during
peak spray season... users will immediately create dummy tenant overrides to unbrick their
operations, permanently polluting your data."*

**The operational risk is real and it is the most honest thing in either review.** The proposed fix —
a `STALE — PROCEED WITH CAUTION` state the grower clicks through — is **rejected as stated**, because
a normalized click-to-proceed is how a safety system dies: the third time you see the dialog you stop
reading it. What is folded instead:

1. **KD-11 removes most of the attrition by itself.** Regulatory facts change rarely and now carry
   their own long cadence; they no longer expire because the agronomic literature review slipped.
2. **Group-scoped override removes the pollution incentive.** Nobody has to shadow a whole row to fix
   one thing, so the dummy-override path Gemini predicts has no reason to exist.
3. **Staleness is reported by S2b and acted on by S9.** S2b's resolver reports "this group is past
   review" as a fact. Whether a human may proceed on a stale fact is a **decision**, and decisions
   belong to the decision layer with attribution — that is rule §3.2's two-engine separation, and it
   keeps the acknowledgment out of the data layer where it would become invisible.
4. **Unit 10's 60-day warning becomes the actual mitigation**, and the failure mode is named in the
   risk register with its escalation: if curation cannot keep pace, the answer is buying structured
   label data, and Unit 8's coverage report is the decision input.

### G5. `CLASS` separation targets are unresolvable — there is no ontology ⟶ **FOLD**
*Gemini, SHOULD FIX 2.* KD-2 lets a rule target `CLASS: "oil"`, but nothing in the system maps a
product to "oil", and rule §3.17 forbids leaning on a licensed chemical-class compilation. Rules
targeting a class would **silently fail to match** preceding sprays — a gap rendering as no
restriction, the exact failure mode rule §3.6 exists to prevent.

**Correct and I missed it entirely.** Folded: a curated, cited `agronomicClass` tag array on the
facts row ("Horticultural Oil", "Fixed Copper", "Elemental Sulfur"), which Unit 3's rules target.
This is our own agronomic tagging derived from cited extension sources, not a FRAC/HRAC compilation,
so §3.17 holds. A rule whose target class matches nothing must report **no evidence**, distinguishable
from no restriction — tested.

---

## Should fix (folded without argument)

| # | Finding | Source | Resolution |
|---|---|---|---|
| S1 | The new columns were placed on `Vineyard`, but the settings form round-trips `VineyardDetail` — that is a second write path, not a form tweak | Codex | Fields move to **`VineyardDetail`**, which already has read/write/audit plumbing |
| S2 | `tenantProductRef` has no uniqueness and no entry surface, so "minimal entry surface" is underspecified | Codex | Per-tenant unique on a normalized ref, added to the form |
| S3 | Unit 6 **cannot** reuse `lookupRegistration` — it only yields product data on `ok: true`, which already requires state legality. Facts resolution must work for a product that is not CA-registered (you still need its PHI to evaluate a **past** spray) | Codex | A separate entitlement-gated facts read sharing the exact-match and published-only rules, independent of the legality union |
| S4 | The acceptance gate claims more than S2b can prove — S2b has no "permitted" surface at all; that is S7a's | Codex | Gate restated to what this phase can actually demonstrate; "never permitted" moves to the evaluator phases |
| S5 | Provenance collision: rainfast and mobility come from extension sources, not the EPA label the row cites | Gemini | Dissolved by KD-11 (per-group `sourceUrl`) |
| S6 | GPS should **propose** jurisdiction with human confirmation; hard-disconnecting physical reality is negligent (a user can pick CA for a block physically in Oregon) | Gemini | **FOLD-MODIFIED.** KD-9 over-rotated. Suggest-then-confirm is not inference-feeding-a-gate — it is the repo's existing pattern for legacy spray names and trade names. GPS proposes; a human confirms; the stored value is always the confirmed one; an unconfirmed proposal never resolves |
| S7 | `adjuvantRequirement` as one scalar cannot express *"requires surfactant for mites; prohibited with Captan"* | Gemini | Moves out of Unit 2's scalars and into Unit 3's conditions table, where the conditionality already lives |
| S8 | No pre-committed go/no-go threshold for the coverage measurement | Gemini | **Thresholds are now pre-committed in Unit 8, before the measurement runs** — the S0 discipline |

---

## ⛔ WITHDRAWN 2026-07-26 (same day): the pest-code deferral below was reversed

Russell asked *"why defer the codes? can't we get them through an API to the EPA or something?"* —
so the probe this deferral rested on was **run instead of deferred**, and it reversed the decision.
Findings in [plan §7](S2b-product-facts-master-plan.md) and the new **Unit 0**:

- **EPA APPRIL carries no target pest at all** — `PEST_CAT` is the *product* category, `SITES` is crops.
- **CA DPR does publish one, free and machine-readable, in the directory S2 already ingests from**
  (`target_pest.dat`, 41 coarse categories + a 2.7 MB product mapping, refreshed 2026-07-24) — so this
  is an **ingest, not a curation**, and deferring it to a later phase would cost more in setup than
  the work itself. Reinstated as **Unit 7b**.
- **Species-level coding ("powdery mildew") does not exist in either dataset**, so the free-text
  `targetPest` stays the truth of record and no species claim is made anywhere.
- **Council GQ1's premise is imprecise** and is corrected in the plan: the monthly PUR use report keys
  on chemical + commodity/site, not on a target pest; the restricted-materials *permit* is the
  artifact that names one.
- **Bigger find:** the same probe surfaced `prod_site.dat`, whose per-product-per-crop numeric+unit
  fields match the `preharvest_interval.dat` / `reentry_interval.dat` unit alphabet — a possible free
  source for per-crop PHI and REI, i.e. the most expensive part of Unit 2 and exactly the granularity
  council G2 demanded. **Unit 0 probes it before any curation starts**, including the `0`-versus-not-
  recorded question that decides whether it is usable at all.

**Nothing below this line about deferring pest codes is still in force.** Gemini's DQ2 was a fair
question and the answer turned out to be "it belongs here, but as an ingest" — which neither the
deferral nor the original curation plan had right. Kept for the record.

## ~~Scope change: Unit 7 (coded pest vocabulary) is **deferred out of S2b**~~ *(withdrawn — see above)*

Gemini DQ2 (*"pests do not belong in the product facts master... what is the actual consumer of Unit 7
in this phase?"*), Codex's silence on it, and the plan's own open question 6 all land together. It has
**no consumer inside S2b**, it was the one unit resting on an unrun live probe, and its only real
consumer is the PUR export in ROADMAP Phase 20.

**Deferred**, with the nullable `spray_application.targetPestCode` slot S3a already ships left
untouched so no migration is needed later — which was the entire point of GQ1's fold. Runbook §9's
S2b scope line needs its "also owned here" sentence moved to Phase 20 at ship time.

⚠️ **This is a scope change to a council-reconciled runbook, so it is Russell's call to confirm or
veto.** The plan proceeds on the deferral; reverting it is a one-unit re-add.

---

## What I pushed back on

- **Gemini's opening claim that the plan "fundamentally misunderstands how pesticide labels work."**
  Overclaimed. Several of its critiques describe things the plan already encodes explicitly:
  rainfast as a product property, the ban on inheriting one oil's rules onto the category, the
  direction-specific separation model, and the assignment of all *evaluation* to S7a/S7b. G1 and G2
  are genuinely right and they are the substance; the framing is not.
- **Field-level `COALESCE` (G3)** — replaced with group-level, reasoning above.
- **Click-through-to-proceed on stale facts (G4)** — rejected in the data layer, relocated to the
  decision layer, reasoning above.

---

## Answers to the plan's own open questions

1. **KD-2 class bound** — resolved by G5: the `PRODUCT` arm stays for labels naming a specific
   competitor, and `CLASS` now has a real curated ontology behind it.
2. **Whole-row too blunt?** — Yes. Group-level (KD-11).
3. **KD-9 adoption wall?** — Softened correctly by S6: propose from GPS, confirm by human. Still
   fail-closed, no longer a blank wall.
4. **`reviewDueAt` grace band?** — Not a grace band; **group-scoped cadences** plus the 60-day
   advance warning. A grace band is a silent one.
5. **Ship if rainfast coverage lags PHI?** — **Yes, and the thresholds are pre-committed in Unit 8
   before the measurement.** S7a unblocks on regulatory coverage; S6 waits on agronomic coverage.
   Splitting the gate this way is only possible *because* of KD-11.
6. **Pest codes** — deferred, above.

---

## New open question for Russell

**The curation-effort question neither reviewer could answer and the plan admits is unestimated.**
Gemini's attrition critique and my own MEDIUM-HIGH risk score point at the same unknown: nobody has
measured how long it takes to curate one product's facts to this standard. The plan's mitigation is
a **10-product calibration spike inside Unit 2** before committing to the full curated set. If that
spike says 40 minutes a product, the top-60-AI target is roughly a week of evenings and the phase is
fine. If it says three hours, the honest answer is to buy structured label data and this phase
becomes an ingestion phase instead of a curation phase.

**That measurement should happen first, not last.**

---

## Raw responses

Both reviews are preserved verbatim below the fold in the reviewers' own structure. Codex flagged 5
CRITICAL / 4 SHOULD FIX / 3 DESIGN QUESTIONS; Gemini flagged 4 CRITICAL / 3 SHOULD FIX / 3 DESIGN
QUESTIONS. Every item is adjudicated above — nothing was dropped silently.

**Adjudication tally:** 9 FOLD · 4 FOLD-MODIFIED · 1 PARTIALLY FOLD · 2 REJECTED-with-reason ·
1 scope deferral pending Russell.
