# S4 — Council feedback and adjudication

**Date:** 2026-07-26
**Plan reviewed:** [S4-phenology-growth-model-plan.md](./S4-phenology-growth-model-plan.md) (v1)
**Reviewers:** Codex `gpt-5.4` (type safety, Prisma, phase ordering) · Gemini `gemini-3.1-pro-preview`
(viticulture, plant pathology, data quality, UX)
**Outcome:** 9 CRITICAL + 8 SHOULD-FIX + 6 DESIGN QUESTIONS. **20 folded, 2 partially refuted,
0 rejected outright.** Plan revised to v2.

Every code-level claim was verified against the repo before adjudication. Two were narrowed on the
evidence; both are recorded below with what the code actually says.

---

## Adjudication summary

| # | Finding | Reviewer | Verdict |
|---|---|---|---|
| C1 | `useDraft.parseDraft` never normalizes an old draft shape | Codex | **FOLD** (verified) |
| C2 | Projections are truthiness-gated; falsy-but-meaningful values dropped | Codex | **FOLD, narrowed** (verified) |
| C3 | `phenoStagePct` interpolation can emit illegal values across a stage boundary | Codex | **FOLD** |
| C4 | Season completeness capped at *today*, not the target date, mis-refuses historical dates | Codex | **FOLD** |
| C5 | `newFraction` divides by zero when `L_now <= 0` | Codex | **FOLD** |
| C6 | Leaf expansion continues ~14–21 d after shoot-tip stagnation | Gemini | **FOLD — highest-value finding** |
| C7 | Hedging is an event, not a persistent state; carrying it pins the model to `unknown` forever | Gemini | **FOLD** |
| C8 | Band midpoints fabricate extreme dilution figures | Gemini | **FOLD** (consequence chain narrowed) |
| C9 | Hard-coded NH Apr 1–Oct 31 season window breaks the Bhutan tenant | Gemini | **FOLD** |
| S1 | `varietyBand` has no schema source — the plan violates the rule the phase owns | Codex | **FOLD** |
| S2 | `verify:ai-native` proves reachability, not serialization | Codex | **FOLD** |
| S3 | UI honesty requirements left entirely to manual QA | Codex | **FOLD** |
| S4 | `createFieldNote` swallows the specific parse-error message | Codex | **FOLD** |
| S5 | Future target dates unspecified | Codex | **FOLD** |
| S6 | `clusterDamage` gated at veraison misses early botrytis wound pathways | Gemini | **FOLD** |
| S7 | n=2 justification for form growth; add bulk-apply | Gemini | **PARTIAL** — sample size mischaracterized; fix folded |
| S8 | Provenance badge must carry anchor age | Gemini | **FOLD** |
| D1 | What clears `canopyHedged`? | Codex | Resolved by C7 |
| D2 | No `Variety.clusterCompactness` exists, so derivation is not implementable | Codex | **FOLD** — resolved with DQ1 |
| DQ1 | `clusterCompactness` should derive from variety with a block override | Gemini | **FOLD** |
| DQ2 | Rolling 4-week window beats block-week share for the fill-rate gate | Gemini | **FOLD** |
| DQ3 | Refusal horizon should scale with phenological phase | Gemini | **FOLD** |
| D3 | Test both edges of the invented constants | Codex | **FOLD** |

---

## CRITICAL

### C1 — `parseDraft` never normalizes an old draft shape ⟶ **FOLD**
*Codex.* **Verified.** `useDraft.ts:53-72` gates on `obj.schemaVersion !== SCHEMA_VERSION` and then
does `form: form as unknown as DraftFormState` — a bare cast, no `parseBlockStatuses()` call. Since
v1 decided (D9) to keep `SCHEMA_VERSION` at 1, a draft saved before deploy restores after deploy
with the six new keys `undefined` rather than `null`, and every tri-state control then reads an
impossible third value. The v1 `markRemainingHealthy` fix addressed one symptom of this, not the
cause.

**Fold:** `parseDraft` runs `parseBlockStatuses()` over the restored block statuses and normalizes
absent keys to `null`. D9 (keep `SCHEMA_VERSION` at 1) survives, because normalizing is strictly
better than discarding the grower's in-progress work. Test: a v1-shaped draft string restores with
all six new fields `null` and no throw.

### C2 — Projections are truthiness-gated ⟶ **FOLD, narrowed**
*Codex.* **Verified, and narrower than claimed.** `save-field-report.ts:49-55` reads
`if (partial.canopyDensity)`, `if (partial.waterStress)`, `if (partial.diseasePestSpotted)` — plain
truthiness. Note `phenoStage` at line 45 correctly uses `!== undefined && !== null`, so the file is
already internally inconsistent.

The narrowing: `"NONE"` and `"NOT_ASSESSED"` are **truthy strings** and survive, so the
string-enum fields are fine. The real hazard is exactly two shapes — **boolean `false`
(`canopyHedged`) and numeric `0` (`shootLengthCm`)**. Codex's failure scenario is nonetheless real
and lands on the most dangerous of the new fields: last week carries `canopyHedged = true`, this
week the grower clears it to `false`, and the write-confirmation card says *"no field changes"*
while a write is pending.

**Also surfaced: a pre-existing bug.** `diseasePestSpotted: false` is dropped by the same line
*today*. Clearing a disease flag through the assistant already produces a silent no-op preview.

**Fold:** every projection distinguishes `undefined` from `false` / `0` / `"NONE"` /
`"NOT_ASSESSED"`. Fix the pre-existing `diseasePestSpotted` case in the same pass. Tests pin each
falsy-but-meaningful value explicitly.

### C3 — Illegal `phenoStagePct` across a stage boundary ⟶ **FOLD**
*Codex.* `parsePhenoPct` (`types.ts:188`) admits only `5|25|50|75|100`, and `phenoStageUsesPct`
restricts pct to `BUD_BREAK`/`FLOWERING`/`VERAISON`. v1 said "interpolate on accumulated GDD" and
return `{stage, stagePct}` without defining the scalar ladder or the quantization — so interpolating
`FLOWERING 75%` → `FRUIT_SET` has an implementation space containing illegal pct values and
impossible intermediate states.

**Fold:** define one **monotone phenology coordinate** in `stage-core.ts` (a single scalar over
stage × pct), interpolate on that, then quantize back to the legal buckets on output and **emit
`stagePct: null` for any stage that does not take a pct**. Negative tests for cross-boundary
interpolation.

### C4 — Completeness capped at *today* mis-refuses historical dates ⟶ **FOLD**
*Codex.* `seasonCompleteness(records, lat, seasonYear, today?)` takes a cap date. If `stage-core`
feeds it `siteTodayIso(...)` per v1, a request for June 15 can refuse because July weather is
missing, even though the June window is complete. That is a refusal on data irrelevant to the
question asked.

**Fold:** cap completeness at the **end of the anchor span actually used**, falling back to
`min(targetDate, siteTodayIso())`. Test both a historical target with a later gap (must NOT refuse)
and a target inside a genuinely incomplete window (must refuse).

### C5 — Divide-by-zero in `newFraction` ⟶ **FOLD**
*Codex.* `(L_now − L_then) / L_now` is undefined at `L_now <= 0`; clamping afterwards does not save
a `NaN`. **Fold:** `L_now <= 0` returns `unknown`, never `0` and never `1`. Degenerate-input test.

### C6 — Leaf expansion continues after shoot-tip stagnation ⟶ **FOLD (highest-value finding)**
*Gemini.* v1 said `shootTip: STAGNANT ⇒ cmPerWeek ≈ 0 ⇒ no growth dilution`. That conflates
**internode elongation** with **leaf-area expansion**. Individual leaves keep expanding for roughly
14–21 days after tip growth ceases, and laterals continue after the primary tip stops. Expanding
leaf surface dilutes deposited residue.

This is the worst possible direction of error: the model would report a canopy fully protected when
it is materially diluted, and a grower would skip a spray. **It fails toward "protected," which is
exactly what the program's honesty rules exist to prevent.** v1 got this wrong.

**Fold:** decouple leaf area from a 1:1 relationship with shoot length. On `STAGNANT`, continue
modeling a **decaying leaf-expansion dilution tail** for ~14 days (or ~200 GDD) before settling to
zero. Golden test: `STAGNANT` at day 0 still yields a non-zero unprotected fraction at day 7.

### C7 — Hedging is an event, not a persistent state ⟶ **FOLD**
*Gemini.* Hedging breaks apical dominance and triggers a flush of lateral growth — so a hedge is
followed by *more* growth, not less. v1 carried `canopyHedged` forward as a state and reset the
growth baseline to `unknown` on any span crossing it, which would pin the model to `unknown` for
the rest of the season. This also answers Codex's D1 ("what clears it?"): nothing did.

**Fold:** rename to `hedgedThisWeek: boolean | null`, a **point-in-time event**, and **do not carry
it forward**. A hedge resets the length baseline for that block; the following week starts a fresh
baseline for the lateral-growth phase. Only the span containing the event refuses.

### C8 — Band midpoints fabricate extreme dilution ⟶ **FOLD** (consequence narrowed)
*Gemini.* `CM_10_30` → `CM_30_60` using midpoints gives `(45−20)/45 = 55 %` unprotected, when the
true movement might be 29 → 31 cm, i.e. ~6 %. A point estimate built from bucket midpoints is
fiction with a decimal point on it.

Narrowing: Gemini's consequence chain ("triggers a severe warning → over-application → MRL
violation") overstates what S4 does — S4 emits no warning, S6's output is categorical, and MRL
checks are explicitly out of program scope. The **math defect is real and folded regardless**; the
alarm is what gets trimmed.

**Fold:** bands never produce a point rate. Band-only input yields either an explicit
**{min, max} range** from the band edges or `unknown` — never a single number to the residual
model. **The `shootsAtLeast10cm` threshold answer stays exact from the band**, which was D4's actual
purpose. This narrows D4 rather than killing it.

### C9 — The hard-coded NH season window breaks Bhutan ⟶ **FOLD**
*Gemini.* `season-core` hard-codes NH = Apr 1 … Oct 31. Bhutan (~27 °N) is nominally NH but
monsoon-driven, and off-cycle or double-pruning regimes are plausible. An Oct 31 cutoff silently
truncates the GDD curve and can trap the model pre-veraison. S4 may not modify `src/lib/weather/`,
so this must be solved on S4's side.

**Fold:** anchor GDD accumulation to the **`BUD_BREAK` biofix** — the first observed bud-break
field note for that block — rather than to the calendar season window. That is better viticulture
anyway (biofix-anchored degree-day models are the standard), it is implementable without touching
the weather tree, and it removes the hemisphere assumption from the interpolator entirely. The
calendar window is retained only as the completeness denominator. **New decision D11.**

---

## SHOULD FIX

### S1 — `varietyBand` has no schema source ⟶ **FOLD**
*Codex.* v1's `stage-core` signature took `varietyBand?` and the MODELED tier used early/mid/late
threshold ladders — but no such field exists. `VineyardBlock` has `varietyId`; `Variety` has
`BerryColor` and `VineSpecies`, neither of which is a phenology band.

**This is the sharpest software finding in the review: the plan violated §3.7 — the exact rule this
phase exists to enforce.** Folded without argument. **Fix:** S4 ships **one generic ladder**, no
variety banding. A per-variety calibration returns when a field exists to drive it.

### S2 — `verify:ai-native` proves reachability, not serialization ⟶ **FOLD**
*Codex.* The check builds an import graph; a tool can import the read seam and serialize none of it.
v1's U9 leaned on it as if it proved the payload carried `source` / `fruitPresent` / `boundaryRisk`.
**Fix:** a pure serializer test over the `query_field_reports` payload asserting each field and its
provenance stamp, plus a `save_field_report` preview test.

### S3 — UI honesty left to manual QA ⟶ **FOLD**
*Codex.* With no jsdom/RTL, *"'estimated' must appear in text"* and *"a gap renders unknown, not
clear"* were unverifiable by CI. **Fix:** extract the source→label and chip-building logic into
**pure helpers** in `src/lib/phenology/labels.ts` and test the exact strings under vitest. Browser
QA then confirms placement, not correctness.

### S4 — `createFieldNote` swallows the parse-error message ⟶ **FOLD**
*Codex.* `actions.ts:73` catches and throws a generic *"Report data is malformed. Please retry."*
Rolling out six new validated fields behind that message makes every bad payload look identical.
**Fix:** preserve the `FieldNoteParseError` message (or at minimum the failing field name) in the
`ActionError`.

### S5 — Future target dates unspecified ⟶ **FOLD**
*Codex.* Nothing reads forecast GDD today, and v1 never forbade a future target date. **Fix:** a
target date after the last observed `VineyardClimateDaily.localDate` returns `unknown` with a
distinct reason, until a forecast-aware phase exists.

### S6 — `clusterDamage` gated at veraison misses early botrytis ⟶ **FOLD**
*Gemini.* Botrytis exploits early wounds — powdery scarring, hail, bird damage at pea-size — and
those infections stay latent until veraison (brief §7.5's latent-bloom pattern). Hiding the control
until veraison blinds the botrytis model to the damage that matters most.

**Fold:** `clusterDamage` gates at **`FRUIT_SET`**, not `VERAISON`. `vinegarFlyPressure` stays at
`VERAISON` (vinegar flies are a ripening-sugar phenomenon and an earlier control would be noise).

### S7 — n=2 justification and form bloat ⟶ **PARTIAL**
*Gemini.* **Partially refuted on the facts.** The measurement was **10 block-week observations**
across 2 notes, not 2 data points, and the plan already labeled it *"tiny… n = 10 block-weeks, one
tenant, one season"* and rated UI adoption MEDIUM confidence. The criticism was pre-registered.

**The fix is folded, and it is a good one.** A bulk-apply mechanism for values that rarely differ
between adjacent blocks on the same day materially reduces taps — and **precedent already exists**:
`markRemainingHealthy` in `FieldNoteForm.tsx:286-304` is exactly this pattern. Extend it rather than
inventing a second one.

### S8 — Provenance badge needs anchor age ⟶ **FOLD**
*Gemini.* `ESTIMATED` alone does not tell a grower that *their own* missed observation caused the
guess. **Fix:** the badge reads `Estimated — last observed 12 days ago`. Cheap, and it converts an
honesty label into a nudge to go measure.

---

## DESIGN QUESTIONS — resolved

**DQ1 / Codex D2 — `clusterCompactness` derived from variety?** *(Gemini: yes, emphatically — Pinot
Noir is tight, Cabernet Sauvignon is loose; do not make growers configure static viticultural facts
you already know. Codex: not implementable, no such field exists.)*
**Resolution — both are right, so do both.** Add `Variety.clusterCompactness` to the schema slice as
the default, and keep `VineyardBlock.clusterCompactness` as a nullable **override**. Resolution
order: block override → variety default → `unknown`. **New decision D12.** The slice grows by one
column.

**DQ2 — 60 % block-week share, or something better?** *(Gemini: a rolling window is much safer — a
grower who skips all of August but fills September could clear 60 % while missing the entire
pathogen build-up.)* **Fold.** The fill-rate gate becomes **coverage in a rolling 4-week window
prior to the target date**, not a season-wide share. Epidemiologically correct and strictly harder
to game.

**DQ3 — is 28 days the right refusal horizon?** *(Gemini: too long in May–June when phenology moves
fast, too short in August–September when veraison→harvest spans 45 days with few transitions.)*
**Fold.** The horizon **scales with phenological phase**: tighter through bud break → fruit set,
looser post-veraison. Named as S4 constants, tested at both edges (Codex D3).

**Codex D1 — what clears `canopyHedged`?** Resolved by C7: it becomes a non-carried event, so
nothing needs to clear it.

---

## What changed in the plan

New decisions **D11** (biofix-anchored GDD, from C9) and **D12** (variety-derived cluster
compactness with block override, from DQ1). **D4** narrowed (bands answer the threshold, never a
point rate). **D5** revised (`hedgedThisWeek` event, not carried). Variety banding **removed** from
the MODELED tier (S1). `clusterDamage` gate moved to `FRUIT_SET` (S6). The `STAGNANT ⇒ zero growth`
rule **replaced** with a leaf-expansion tail (C6). Schema slice grows one column. Units 4, 5, 6, 7,
8, 10 all gained tests or behavior; a new `labels.ts` pure module was added (S3).

Plan v2 is the artifact to build from. Next step per the runbook lifecycle: `/work`.
