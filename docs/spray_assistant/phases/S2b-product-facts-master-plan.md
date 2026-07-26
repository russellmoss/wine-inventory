# S2b — Product Facts Master (Wave 1, lane B — second PR)

**Program:** Spray Intelligence · [runbook](../SPRAY_ASSISTANT_RUNBOOK.md) §9 S2b
**Depends on:** S2 (shipped + live, deploy `147b75c3`) · S3a (shipped, PR1–PR3 merged)
**Unblocks:** S7a (legality + rotation), S8 (lot residue), S6 (protection budget), S7b (interlocks)
**Status:** 🟨 **building — Units 0-5 DONE and merged-ready; Units 6-10 remain** ([council feedback](S2b-council-feedback.md))
**Plan depth:** Deep (12 units) · **Date:** 2026-07-26

> ## Build status (2026-07-26)
>
> | Unit | State | Evidence |
> |---|---|---|
> | 0 · CDPR interval probe | ✅ done | [probe report](S2b-cdpr-interval-probe.md) |
> | 1 · jurisdiction + per-block-line snapshot | ✅ built | schema + migration |
> | 2 · curated facts master (global) | ✅ **tables** built | `verify:product-facts` 1, 2, 3 |
> | 3 · separation rules + conditional PHI/REI | ✅ **tables** built | `verify:product-facts` 4 |
> | 4 · fifth source + fact-group provenance | ✅ built | schema + migration |
> | 5 · tenant grower-supplied override + RLS | ✅ built | `verify:product-facts` 5, 5b, 6 |
> | 6 · the real `ProductFactsResolver` | ⬜ next PR | — |
> | 7 · coverage report · 7b · pest-code ingest | ⬜ next PR | — |
> | 8 · verify + invariant note | 🟨 partial — `verify:product-facts` exists with 8 assertions | |
> | 9 · monthly drift detector · 10 · QA | ⬜ next PR | — |
>
> Gates green: `verify:product-facts` 8/8 · `verify:tenant-isolation` · `verify:naming` 25/25 ·
> `verify:invariants` 47/47 · `verify:ai-native` (KD-7 held — no allowlist entry spent) ·
> `tsc` clean · 4,613 unit tests · lint 0 errors.
>
> ⛔ **NOT built, and not mine to build: the curated CONTENT.** These units ship the *machinery*. A
> curated row's `reviewedBy` is a human signature on a legal fact (rule §3.1 — "the label is the law,
> and we are not it"), so an agent populating it would be fabricating a review. The tables ship empty;
> Unit 2's CDPR seeder writes **proposals with `reviewedBy: null`** and a human signs them.
>
> ⚠️ **`prisma migrate diff` is NOT safe against this database** — see the migration header. It
> proposes DROPping tenant FK constraints repo-wide because the composite `(tenantId, id)` FKs are raw
> SQL with no Prisma `@relation`. Hand-author, then `migrate deploy`.

> **v2 changes.** The council found the plan treated *the row* as the unit of provenance, freshness,
> and override. It is not — a product's facts come from two sources on two cadences. **KD-11 (fact
> groups)** is the structural fix and it dissolved four separate findings. Also folded: a resolution
> ambiguity that would have shipped (C1), a stale-facts fall-through that leaked rotation evidence
> (C2), an unsnapshotted jurisdiction that broke replay (C3), an entitlement bypass the CI guard
> could not see (C5), missing liquid AI concentration (G1), conditional PHI/REI (G2), and a
> `CLASS` separation target with no ontology behind it (G5).
>
> **v2.2 (same day).** [PR #532](https://github.com/russellmoss/wine-inventory/pull/532) merged at
> 22:53, hours after v2 was written, and shipped most of **Unit 4** from a cross-lane seam audit.
> Unit 4 is narrowed to what genuinely remains (the fifth source + KD-11's separate group-provenance
> axis), and §2's frozen-contract table is updated: `factsRevision` is **gone** and `factsAsOf` is
> now the composite `ProductFactsAsOf`. **Re-read `product-facts-port.ts` before building** — this
> plan was written against the pre-#532 shape.
>
> **v2.1 (same day, after Russell asked "can't we get the codes from an EPA API?").** The probe I had
> deferred was run instead. It **reversed the deferral** and turned up a bigger finding — see §7 and
> the new **Unit 0**. Pest codes are now an *ingest*, not a curation, and `prod_site.dat` may be a
> free machine-readable source for the most expensive part of Unit 2.

---

## 1. Problem frame

The council found a hole and named it C1: **S6's gate requires rainfast period and mobility class;
S7a's and S7b's gates require PHI, REI, minimum repeat interval, seasonal maxima, and separation
rules — and no phase produced any of them.** Label-value extraction was deferred (correctly, plan
086), and then two downstream gates were written that cannot pass without it.

S2 shipped the *identity* layer: 2,420 grape registrations, 361 active ingredients, zero
unclassified resistance rows, CA state legality, restriction flags. It can answer *"is this product
legal on grapes in California."* It cannot answer *"how long until I can pick,"* *"how long until a
worker can re-enter,"* *"will the rain wash it off,"* or *"can I follow oil with sulfur."*

Those four questions are the entire deterministic value of Wave 2. S2b produces the data behind
them.

**What S2b is not.** It is not label-PDF extraction. It is a **curated, versioned, per-product,
human-reviewed, cited facts table**, scoped by the measured coverage curve, where everything outside
the curated set resolves to *cannot-determine* per rule §3.6. That refusal is the designed behavior,
not a failure — and it is the reason this phase can ship in Wave 1 instead of waiting on a data
vendor.

### The pressure test

**Is this the right problem?** Yes, and it is load-bearing in a way that is easy to underrate. S3a
already ships `NullProductFactsResolver`, which returns `UNKNOWN` for every product. That is honest,
and it means Wave 2 is currently *buildable but useless*: S7a would compile, pass its tests, and
tell every grower "cannot determine" for every spray. S2b is what turns the deterministic engine
from a correct refusal machine into a product.

**What happens if we do nothing?** Wave 2 ships a legality engine that refuses everything. The
program's own Wave-2 milestone — *"can I spray Pristine on Block 4 today?"* answered exactly and
citably — is unreachable.

**Is there a simpler framing?** Yes, and it is already the runbook's: curate the top-N active
ingredients rather than solving the general label-extraction problem. This plan holds that line hard,
and adds two things the runbook did not: **re-measure the curve** (86.5% is a 2026-07-15 figure
against 338 AIs; production carries 361), and **pre-commit the go/no-go thresholds before
measuring** — the S0 discipline.

**Who is the user?** The grower standing at the tank at 6am, and the winemaker at harvest who
inherits the consequences. The job they are hiring this for is *"tell me what I am not allowed to do,
and be honest when you don't know."*

---

## 2. What is frozen and must be consumed, not re-derived

These are shipped contracts. Changing them is a cross-lane breaking change.

| Contract | Where | S2b's obligation |
|---|---|---|
| `ProductFactsResolver.resolveMany(keys)` | `src/lib/spray/product-facts-port.ts` | **Implement it.** Index-aligned with `keys`, must never throw. ⚠️ **The key carries no version selector** — see KD-1. |
| `ResolvedProductFacts` | same file | Produce it. `completeness` is derived by `buildFactsSnapshot`, never asserted. ⚠️ `reiHours`/`phiDays` are **scalars** — see KD-12. ⚠️ **Changed by #532:** `factsRevision` is **gone**; `factsAsOf` is now the composite `ProductFactsAsOf \| null`. |
| `ProductFactsAsOf` composite | **`src/lib/spray/product-facts-port.ts`** (declared there, *not* imported from `src/lib/pesticide/`) | Landed by [#532](https://github.com/russellmoss/wine-inventory/pull/532). Declared in the port on purpose so a **non-registry resolver can answer** — the S2b tenant-defined path (rule §3.9) gets provenance without the spray family depending on the US registry lane. **Widen, never collapse.** A fifth source gets its own field. |
| `PesticideProvenance = "registry" \| "grower-supplied"` | same | S2 only produced `"registry"`. **S2b produces the other arm.** |
| `SprayFactsSource = NONE \| REGISTRY \| TENANT_DEFINED` | `prisma/schema.prisma:5791` | Already carries the Bhutan arm. No enum widening needed. |
| `SprayMobilityClass` (4 values) | `prisma/schema.prisma:5777` | Curated `mobilityClass` lands in this vocabulary exactly. |
| `resistanceGroupsKnown` / `activeIngredientsKnown` + DB CHECKs | `spray_material_line` | `KNOWN` requires both knowns true; `[]` may never read as "no groups". |
| Correction re-resolve rule (S3a council G1) | `src/lib/spray/correction-core.ts` | A clerical correction **copies** the predecessor snapshot. Registering the real resolver **back-fills nothing** (rule §3.8). |
| Entitlement gate `isPesticideSourceEnabled` | `src/lib/pesticide/lookup.ts:45` | One gate for the lane. ⚠️ **The CI guard only covers `lookupRegistration`** — see KD-5. |
| K7 sole-prisma-importer boundary | `test/pesticide-boundaries.test.ts:41` | Hard CI gate, **and insufficient as written** — widened in Unit 6. |

---

## 3. Scope

### In scope

Per runbook §9 S2b, keyed by EPA registration number + label version:

- rainfast / absorption period · mobility class · PHI · REI (**both conditional — KD-12**)
- minimum repeat interval · maximum applications and seasonal AI limits (**+ AI concentration — KD-13**)
- separation rules (oil ↔ sulfur ↔ captan, **direction-specific**) and conditional limits
- adjuvant restrictions, as conditions rather than a scalar
- temperature, stress, wet-foliage limits
- curated **agronomic class tags** — the ontology `CLASS` separation targets resolve against
- the **non-US / grower-supplied manual path** (rule §3.9, council C6 + P1 — built once, serves both)
- the real `ProductFactsResolver`, registered at the composition root
- the coverage report, re-measured, with **pre-committed** go/no-go thresholds
- **the `prod_site.dat` PHI/REI probe (Unit 0), run before any curation begins**
- **the DPR pest-category vocabulary, ingested not curated** (Unit 7b — 41 coarse categories, free,
  from the feed S2 already pulls; species-level coding does not exist in public data and is not claimed)

### Explicitly out of scope

- Label PDF parsing or OCR (Later, per plan 086 Risks).
- Any FRAC / HRAC / IRAC compilation (rule §3.17, binding user decision).
- Evaluating the rules — **S7a and S7b evaluate; S2b only supplies data.** S2b ships no legality
  verdict, no rotation budget, no interlock decision. The gate in §6 is written to that limit.
- Cultivar sulfur/copper sensitivity — brief §17.2 puts that on the **block profile** (S4's shipped
  territory, `Variety.species` / `HYBRID`). S2b keeps product-side limits only.
- PUR export (Phase 20).
- Bulletins Live! Two integration — S2b records *that a bulletin check is required*; performing it is Later.
- **Species-level pest coding** — it does not exist in EPA or DPR public data (§7). Only the coarse
  41-category DPR vocabulary is ingested, and it is never presented as a species.

---

## 4. Key decisions

| # | Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|---|
| **KD-11** ⭐ | The unit of provenance, freshness, and override | **The fact GROUP**, not the row and not the field. Two groups: **REGULATORY** (PHI, REI, max applications, seasonal AI limits, min repeat interval, bulletin requirement, separation rules — sourced from the label) and **AGRONOMIC** (rainfast, mobility class, class tags — sourced from extension literature). Each group carries its own `sourceUrl`/`sourceAsOf`/`reviewedBy`/`reviewDueAt`, and is independently overridable | Row-level (v1); field-level `COALESCE` (Gemini G3) | **The structural fix of the council pass.** Row-level falsifies provenance (a UC IPM rainfast value on a row cited to an EPA label), couples two very different review cadences into one expiry bit, and makes a grower who wants to add one rainfast value shadow the whole row forever — so an EPA REI extension would never reach them. Field-level fixes the shadowing but reintroduces the original problem: a snapshot no human reviewed as a coherent whole. **The group is the natural review unit and it matches the source split.** Dissolves Codex DQ2 + Gemini C3 + Gemini S1, and most of Gemini C4. |
| **KD-1** | Version key and resolution | Curated row keyed `(epaRegNumber, factGroup, labelVersionKey)` where `labelVersionKey` is the label date the **reviewer** read. **Exactly one ACTIVE row per `(epaRegNumber, factGroup)`**, enforced by a partial unique index on `supersededAt IS NULL`. Superseded rows are retained for replay but never participate in a live resolve | Key on the upstream mutable `labelDate`; "pick the latest row" | S2 council C13 withdrew the claim that a mutable `labelDate` establishes a version key. A curated fact is true *of the label the human actually read*. ⚠️ **Council C1:** the frozen `ProductFactsKey` carries **no version selector**, so multiple active rows would leave `resolveMany` non-deterministic and "pick latest" would destroy this decision's whole point. Resolution is therefore single-row **by construction**. Drift between the reviewer's date and the upstream `labelDate` becomes a review-due signal. |
| **KD-12** | PHI and REI shape | **Child relations** `pesticide_product_rei_condition` (activity, hours) and `pesticide_product_phi_condition` (condition, days). The frozen port stays scalar, so the resolver emits the **worst-case statutory bound** into it, named as such everywhere it surfaces | Scalars only (v1) | **Council G2, the best domain catch of the review.** REI varies by task — 12 h to scout, 48 h for tying, training, and leaf pulling. S7a's own gate is *"REI collides correctly with a scheduled hand-labor work order"*, and hand labor **is** the 48-hour task: a scalar REI cannot answer it. A single number forces picking the highest (useless) or the lowest (illegal). The scalar survives as an honest worst-case bound for the frozen port; S7a reads the relation. |
| **KD-13** | AI concentration | Curated `lbsAiPerGallon` + formulation type per product-AI, in the REGULATORY group | Rely on S2's existing `percent` | **Council G1, half-right and the half that's missing matters.** S2's `PesticideProductIngredient.percent` covers dry formulations. Liquid seasonal maxima are expressed lbs-AI/acre and need lbs-AI/gallon, which nothing carries. Without it S7a's seasonal-maximum gate — which the runbook requires to **refuse**, not warn — cannot compute at all for liquids. |
| **KD-2** | Separation rules | A relation asserted **BY** a subject product **ABOUT** a target (`AI` \| `CLASS` \| `PRODUCT`), with direction, `minDays`, conditions. Both labels' rules union in the relevant direction; **most restrictive wins**. `CLASS` targets resolve against **KD-14's curated class tags** | Pairwise product×product matrix (~5.8M cells); a category table keyed on "oil" | A pairwise matrix is uncurateable. A category table violates brief §8.2 (*"Do not inherit JMS's rules into every oil"*). Asserting from the subject label about a class is **how labels are actually written**, and it preserves both direction-specificity and per-product ownership. |
| **KD-14** | The class ontology | A curated, cited `agronomicClass` tag array on the AGRONOMIC group ("Horticultural Oil", "Fixed Copper", "Elemental Sulfur") | Leave `CLASS` targets to match on AI name | **Council G5, which I missed entirely.** KD-2 lets a rule target `CLASS: "oil"` but nothing maps a product to "oil", and §3.17 forbids leaning on a licensed compilation. Class-targeted rules would **silently fail to match** — a gap rendering as no restriction, precisely the §3.6 failure mode. Our own tagging from cited extension sources is not a FRAC compilation, so §3.17 holds. A class matching nothing reports **no evidence**, distinguishable from no restriction. |
| **KD-3** | Registry vs grower-supplied facts | **Group-level precedence.** A tenant override replaces one group entirely; that group's `source` becomes `TENANT_DEFINED` and `provenance` `grower-supplied`. Never blended within a group | Whole-row (v1); per-field merge | Whole-row hides regulatory updates behind a grower's agronomic edit (council G3, and Codex reached it independently). Per-field produces a snapshot nobody reviewed whole. Group-level gives the "add rainfast, keep getting REI updates" behavior at the right granularity. |
| **KD-4** | Entitlement scope | The `epa-pesticide` toggle gates **registry** facts only. Tenant-supplied facts resolve regardless | Gate everything uniformly | Gating the manual path on the EPA source toggle would re-brick Bhutan through the back door — the failure council C6 promoted to CRITICAL. The gate protects a data source we ship; it must not protect data the grower typed in. Guarded by a test. |
| **KD-5** | Resolver location + the K7 boundary | `src/lib/pesticide/product-facts.ts` does composition and pure mapping; **all DB reads go through `lookup.ts`** as **their own entitlement-gated exported entrypoints**, and the boundary test widens to assert the gate on **every** exported registry-backed read | Widen the allowlist to a second prisma importer; reuse `lookupRegistration` | ⚠️ **Council C5:** `test/pesticide-boundaries.test.ts:50` is a **textual, single-function** check — it proves the gate inside `lookupRegistration` and nothing else, so a new batched helper could query before entitlement with CI green. ⚠️ **Council S3:** `lookupRegistration` cannot be reused anyway — it yields product data only on `ok: true`, which already requires state legality, and facts resolution must work for a product that is **not** CA-registered (you still need its PHI to evaluate a *past* spray). |
| **KD-6** | Composition root | Register the resolver in `src/lib/spray/actions.ts` at `submitSprayRecord` and `submitSprayCorrection` | A module-level registry | House style is function-argument DI with a null default (`record-core.ts:92`, `drying-core.ts:20`). A registry adds import-order fragility for nothing. Two call sites change; the port is untouched. |
| **KD-7** | Naming | **No `-core.ts` in `src/lib/pesticide/`** — continue S2's precedent | Name the resolver `product-facts-core.ts` | S2 decision 6: registering a core no tool can reach for three waves is a false coverage signal. `verify:ai-native` stays green, **no allowlist entry spent**, `MAX_ALLOWED` stays 2. |
| **KD-8** | Artifact discipline | Default run = **REPLAY** of the committed JSON; `--propose` rewrites from sources for human review; sha256 pinned into the published revision | Auto-update from source on the monthly job | Replay-by-default makes the monthly refresh a **detector**, not an unreviewed auto-update. Rule §3.1: the label is the law and we are not it. |
| **KD-9** | Jurisdiction | `regulatoryCountry` / `regulatoryState` on **`VineyardDetail`**, nullable, never defaulted to US. **GPS proposes; a human confirms; an unconfirmed proposal never resolves.** Jurisdiction is resolved **per block line** and **snapshotted at record time** | Silent GPS derivation; no derivation at all (v1); tenant-level; `Vineyard` (v1) | v1 over-rotated: it banned derivation outright, but **suggest-then-confirm is the repo's existing pattern** for legacy spray names and trade names — it is a data-entry aid behind a human gate, not an inference feeding a legal gate. Gemini S6 is right that hard-disconnecting GPS from jurisdiction lets someone select CA for a block physically in Oregon. ⚠️ **Council C3:** a pass spans vineyards, so one `vineyardId` is wrong for some block lines; and a mutable vineyard row means historical reads **drift**, violating rule §3.8. Hence per-block-line + snapshot. ⚠️ **Council S1:** the settings form round-trips `VineyardDetail`, so putting these on `Vineyard` would be a second write path, not a form tweak. |
| **KD-10** | Staleness | A group past its `reviewDueAt` has **its own fields degraded to null and can never contribute to `completeness: KNOWN`.** Other groups and S2's independently-refreshed resistance data are unaffected and travel labeled. **S2b reports staleness; S9 decides what a human may do about it** | Serve stale with a badge; a click-through "proceed anyway" (Gemini G4) | ⚠️ **Council C2:** v1 said "degrades to UNKNOWN" and then had the row *fall through* to a tier that still supplied resistance groups, which `rotationContribution` consumes as usable evidence. The fall-through is right — S2's artifact is a different source with its own freshness — but the language was wrong and the coupling was unstated. Gemini's click-through is **rejected in the data layer**: a normalized click-to-proceed is how a safety system dies. Whether to proceed on a stale fact is a *decision*, and decisions belong to the decision layer with attribution (rule §3.2). |

---

## 5. Implementation units

> **Unit 0 runs first and may resize the entire phase.** Units 1–5 are then the schema-first slice,
> landing as one small serialized PR per the §4 shared-file rule.

### Unit 0: Probe `prod_site.dat` for machine-readable PHI and REI — ✅ **RUN 2026-07-26, COMPLETE**

> **Result: [S2b-cdpr-interval-probe.md](S2b-cdpr-interval-probe.md).** Hypothesis **confirmed**;
> phase **not** resized to an ingestion phase. Headlines:
>
> - **Layout decoded and oracle-validated.** `[25,28)+[28]` = **PHI**, `[29,32)+[32]` = **REI**.
>   Mancozeb reproduces the brief's own **66-day PHI**; Pristine 14 d / 12 h; Captan 48–96 h REI.
> - ✅ **The kill question is answered favourably: the UNIT column is the null discriminator.**
>   Blank unit = not recorded (939,441 PHI cells). Non-blank unit = a real interval, including a
>   legitimate `0D` (739 rows). A value ≠ 0 with a blank unit occurs **2 times in 1.24 M rows**.
>   ⚠️ **76% of PHI cells contain `0`** — a value-keyed ingest would tell three-quarters of the corpus
>   *"PHI = 0, pick today."* **Unit-keyed is safe; value-keyed is catastrophic. Contract-test it.**
> - ⛔ **Coverage misses the pre-committed gate.** Of 4,965 active grape products: **PHI 40.4% ·
>   REI 64.0% · both 30.4%**, against Unit 7's ≥80% REGULATORY threshold. Threshold was written down
>   first and is honoured. *(Corpus-wide denominator — the curated top-60 set must be re-measured
>   separately.)*
> - ⚠️ **New hazard: the source contradicts itself.** A product carries ~3 near-duplicate grape site
>   rows (`1014`/`29141`/`29143`) which disagree on PHI for 0.6% of products and are recorded-vs-blank
>   for 1.4%. Verified against raw bytes, DPR ships a **12-hour** and a **7-minute** PHI. Hence the
>   most-restrictive-recorded rollup in Unit 2, and hence rule §3.1: this is DPR's *transcription* of a
>   label, so it feeds `--propose` and **never auto-populates**.
> - **KD-12 survives unchanged**: this source has **one base REI per product-site**, not the
>   task-conditional 12 h-scout / 48 h-tying split council G2 required. The child relation is still needed.

**Goal (as specified before the run):** Find out whether the most expensive part of Unit 2 is already free and machine-readable.
**Files:** `scripts/probe-cdpr-intervals.ts` (throwaway), `docs/spray_assistant/phases/S2b-cdpr-interval-probe.md`
**Approach:** The pest-code probe turned up something larger. The CDPR product directory S2 already
ingests from contains `preharvest_interval.dat` and `reentry_interval.dat` — and both are **unit
lookups** (`D` DAYS / `H` HOURS / `M` MINUTES), not values. Something references them. A byte-range
sample of **`prod_site.dat`** (86 MB, product × site) shows rows shaped:

```
    188 77005  0A00        0   2H A          ← prodno · site · ? · num · num+unit(H) · status
    103  5002  0A00        0   0  I
```

Two numeric-plus-unit fields whose unit alphabet **matches those two lookups exactly**. That is
consistent with **per-product, per-crop PHI and REI** — and per-crop is precisely the granularity
council G2 said a scalar cannot express. If it holds, a large share of KD-12's condition relations is
an ingest rather than a curation, and the §10 calibration spike gets much cheaper.

**This is an inference from a byte sample, not from documentation** — DPR's `prodtables.htm` no longer
carries the layouts. So it is a probe, not a plan. Measure, in writing:

1. Confirm the column semantics against DPR's data dictionary or by correlating a handful of known
   products against their published labels (mancozeb's 66-day PHI is the obvious oracle).
2. **Which numeric is PHI and which is REI**, and the unit column for each.
3. **Coverage on grape sites specifically** — in an 18-row sample only 1 row carried a non-zero
   interval. If grape coverage is ~5%, this is a curiosity; if it is ~70%, it resizes the phase.
4. ⚠️ **The `0`-versus-not-recorded question, which is the whole safety story.** A fixed-width `0`
   meaning "no interval on file" read as "PHI = 0 days" says *pick today*. That is rule §3.6's worst
   failure mode arriving through a side door. If `0` and absent are indistinguishable in this file,
   **the field is unusable as a PHI source** and the probe's answer is no.
5. Provenance posture: DPR's product database is **DPR's transcription of a label**, not the label.
   Rule §3.1 makes it evidence for a reviewer, never authority — so even a good result feeds the
   `--propose` path (KD-8), it does not auto-populate curated rows.

**Outcome gates the shape of Unit 2:** a clean result makes S2b substantially an ingestion phase; a
`0`-ambiguous or sparse result and it stays a curation phase, with the probe recorded so nobody
re-runs it.
**Depends on:** none. **Blocks:** the Unit 2 calibration spike (§10).

---

### Unit 1: Jurisdiction — resolution, confirmation, and snapshot

**Goal:** Every legality read gets a jurisdiction a human confirmed, and a past read keeps the one it had.
**Files:** `prisma/schema.prisma` (+ migration), `src/lib/vineyard/data.ts`, `src/lib/vineyard/actions.ts`,
`src/lib/pesticide/lookup.ts`, `src/lib/spray/actions.ts`, the vineyard settings form,
`test/pesticide-jurisdiction.test.ts` (new)
**Approach:** Add nullable `regulatoryCountry` (ISO 3166-1 alpha-2), `regulatoryState`, and
`jurisdictionConfirmedAt`/`ConfirmedBy` to **`VineyardDetail`** (KD-9 / council S1 — it already has
the read/write/audit round-trip; `Vineyard` does not). The form **proposes** a jurisdiction from the
existing `gpsLat`/`gpsLng` and requires an explicit confirm; the stored value is always the confirmed
one. Add `resolveJurisdiction` in `lookup.ts` returning S2's `PesticideJurisdiction`. Unset or
unconfirmed → `jurisdiction-unsupported`; US with unset state → `state-registration-unknown`. Add
`snapshotJurisdictionCountry`/`State` to **`spray_block_line`**, written at record time, and make
every downstream legality read consume the snapshot rather than the live vineyard row.
**Tests:** unset country never throws; US/unset-state is not a clearance; `BT` →
`jurisdiction-unsupported` (extend the existing `pesticide-verify-cases.ts` case to the resolved
path); **an unconfirmed GPS proposal does not resolve**; **editing a vineyard's state after a spray
does not change that spray's snapshotted jurisdiction** (the rule §3.8 case); a pass spanning two
vineyards in different states snapshots both correctly.
**Depends on:** none
**Verification:** `npm run verify:pesticide` 31/31 plus the new cases.

---

### Unit 2: The curated facts artifact and its tenant-global table — group-scoped

**Goal:** Cited, reviewed, versioned facts, with provenance and freshness at the group level.
**Files:** `prisma/schema.prisma` (+ migration), `src/lib/pesticide/data/product-facts.json` (new),
`scripts/seed-product-facts.ts` (new), `src/lib/tenant/models.ts`,
`scripts/verify-tenant-isolation.ts`, `test/tenant-context.test.ts`, `package.json`
**Approach:** `pesticide_product_facts`, tenant-**global** (no `tenantId`, no RLS), registered in
**all three** `GLOBAL_MODELS` mirrors (S2 council C5 — the plan named two, there are three). One row
per `(epaRegNumber, factGroup, labelVersionKey)` with a **partial unique index on
`supersededAt IS NULL`** enforcing one active row per `(epaRegNumber, factGroup)` (KD-1).

- **REGULATORY group:** `minRepeatIntervalDays`, `maxApplicationsPerSeason`, `maxAiPerSeason` (+unit),
  `requiresBulletinCheck`, plus per-product-AI `lbsAiPerGallon` + formulation type (KD-13).
  PHI and REI live in Unit 3's condition relations, not here (KD-12).
- **AGRONOMIC group:** `rainfastHours`, `mobilityClass`, `agronomicClass[]` (KD-14).
- **Both groups:** `sourceUrl`, `sourceTitle`, `sourceAsOf`, `reviewedBy`, `reviewedAt`, `reviewDueAt`.

**Every scalar is nullable and null means "the reviewer could not determine it"** — no zero-as-unknown
anywhere in this table. Lifecycle uses the existing `PesticideDataRevision` publish pattern with
`lastSeenRevisionId` mark-and-sweep. Seed script is replay-by-default (KD-8).

**⭐ Seed the REGULATORY group from CDPR, propose-only (new — Unit 0's result).** `prod_site.dat`
supplies a verified PHI for 40.4% and REI for 64.0% of active grape products. Wire it into
`seed-product-facts.ts --propose` so the reviewer **verifies and fills** rather than researching from
scratch. Two rules are non-negotiable and both are contract tests, not comments:

1. **Nullity is keyed on the UNIT column, never the value.** Blank unit → `null` → *cannot-determine*.
   76% of PHI cells contain `0`; reading the value would assert "pick today" across the corpus.
2. **Most-restrictive-recorded rollup across a product's grape site rows** (`1014`/`29141`/`29143`),
   mirroring S2's K13 resistance rollup. A disagreement is surfaced as a **review flag**, never
   silently resolved — DPR ships a 12-hour and a 7-minute PHI, so disagreement means *a human looks*.

A seeded value lands as a **proposal with `reviewedBy: null`**, exactly like an unconfirmed
trade-name row; it is not a curated fact until a human signs it, and it carries CDPR as its
`sourceUrl` with the file's own 2026-07-24 date as `sourceAsOf`.

⚠️ **Start with a 10-product calibration spike** before committing to the top-N target — see §10.

**Tests:** artifact discipline in the style of `test/pesticide-boundaries.test.ts:70` — every group row
carries `sourceUrl` + `sourceAsOf` + `reviewedBy` + `reviewDueAt`; every `sourceUrl` host resolves to
a seeded trusted domain (council C10's positive allowlist); no FRAC/HRAC/IRAC host appears; **a
REGULATORY row may not cite an extension source and an AGRONOMIC row may not claim an EPA label as
the source of a rainfast value** (the council S5 falsification case); a schema test that no column
has a non-null default readable as a known value; the partial unique index rejects a second active row.
**Depends on:** none
**Patterns to follow:** `src/lib/pesticide/data/resistance-codes.json`; `scripts/derive-resistance-codes.ts:1-19`.

---

### Unit 3: Conditional PHI/REI, separation rules, and limits

**Goal:** Encode the facts that are genuinely conditional as conditions, not as flattened scalars.
**Files:** `prisma/schema.prisma` (+ migration), `src/lib/pesticide/data/separation-rules.json` (new),
`src/lib/pesticide/separation.ts` (new, pure), `test/pesticide-separation.test.ts` (new)
**Approach:** Four relations, all carrying the group provenance block.

- `pesticide_product_rei_condition` — activity, hours (KD-12). *12 h scouting / 48 h tying, training, leaf pulling.*
- `pesticide_product_phi_condition` — condition, days (KD-12).
- `pesticide_separation_rule` — `subjectEpaRegNumber` · `targetKind` (`AI` | `CLASS` | `PRODUCT`) ·
  `targetKey` · `direction` (`TARGET_AFTER_SUBJECT` | `TARGET_BEFORE_SUBJECT`) · `minDays` ·
  `fruitPresentOnly` · `condition`.
- `pesticide_product_condition` — `conditionKind` (`MAX_TEMP_F` | `NO_WET_FOLIAGE` |
  `NO_STRESSED_VINES` | `NO_FREEZE_WITHIN_H` | `TANK_MIX_PROHIBITED` | `MIXING_ORDER` |
  **`ADJUVANT_REQUIRED`** | **`ADJUVANT_PROHIBITED`**) · `threshold` · `severity`
  (`HARD_STOP` | `CAUTION`) · `appliesWhen`. Adjuvant requirement moves here from Unit 2's scalars
  (council S7 — *"requires surfactant for mites; prohibited with Captan"* has no scalar form).

`separation.ts` is pure: given two products' rule sets, a direction, elapsed days, and fruit-present,
return the **most restrictive** applicable rule plus the rules that produced it — **evidence, never a
verdict** (S7b decides).
**Tests (goldens):** JMS Stylet-Oil asserts "no sulfur within 10 days after oil" and the reverse is
**not** implied (the brief's central worked example); a second, different oil does not inherit JMS's
rules; oil↔captan fires in both directions; most-restrictive wins on overlap; **a `CLASS` target that
matches no tagged product returns *no evidence*, distinguishable from *no restriction*** (council G5);
a product with no rules likewise; the REI worst-case bound is the max across activities and is never
mistaken for the scouting value.
**Depends on:** Unit 2
**Verification:** goldens green; `separation.ts` imports nothing from Prisma or React (rule §3.13).

---

### Unit 4: Add the fifth source and the fact-group provenance axis *(NARROWED in v2.2 — most of this shipped without us)*

> ✅ **The bulk of the original Unit 4 landed in [PR #532](https://github.com/russellmoss/wine-inventory/pull/532),
> merged 2026-07-26 22:53 — hours after this plan was written, from a cross-lane seam audit.** It did
> exactly what this unit specified, and one thing better: it **dropped `factsRevision`** instead of
> leaving a misleading Int beside the real composite. Already done, do not redo:
> `spray_material_line` now carries `factsPublishedRevisionId` / `factsApprilAsOf` / `factsCdprAsOf`
> / `factsResistanceArtifactSha256`; `factsRevision` is gone behind a raise-if-populated guard;
> `factsAsOf` survives narrowed to a display convenience (newest non-null component); the correction
> copy-verbatim path covers every component; `verify:spray-record` #6 proves a correction under a
> *newer* registry generation keeps June's facts. **Council C4's "additive at the type level is not
> additive in the running system" was the right worry and #532 discharged it.**

**What is left, and it is two genuinely separate axes — do not conflate them.**

**Goal:** Give the composite its fifth source, and give KD-11's fact groups their own provenance.
**Files:** `src/lib/spray/product-facts-port.ts`, `src/lib/spray/facts-snapshot-core.ts`,
`src/lib/spray/record-core.ts`, `src/lib/spray/correction-core.ts`, `src/lib/spray/types.ts`,
`prisma/schema.prisma` (+ migration), `scripts/verify-spray-record.ts`,
`docs/spray_assistant/phases/S2-S3a-factsAsOf-contract.md`
**Approach:**

1. **Axis A — the fifth source.** `ProductFactsAsOf` currently carries S2's four registry components.
   S2b's curated facts artifact is a **fifth**, and the contract's change rule says it gets its own
   field rather than overloading one: add `productFactsArtifactSha256` + `productFactsAsOf`, with the
   matching `spray_material_line` columns. Purely additive, and cheap **only while the table still
   holds zero rows** — #532's migration comment makes that window explicit, and S2b's resolver is what
   closes it. Do this in the schema slice, before anything resolves real facts.
2. **Axis B — fact-group provenance (KD-11).** REGULATORY and AGRONOMIC move on different cadences
   with different sources, so *which* group a snapshot's values came from, and how fresh each was, is
   **not** expressible in the registry watermark. It needs its own columns on the material line
   (per-group source, as-of, and staleness-at-write). ⚠️ **This is a different question from "which
   registry generation" and must not be folded into it** — conflating them is how the scalar-vs-
   composite defect happened in the first place.

**Tests:** a six-component round-trip; a null component renders unknown, never fresh; **a correction
preserves both axes verbatim** (extend #532's assertion rather than writing a parallel one); a
snapshot whose AGRONOMIC group was stale at write time still says so when read back months later.
**Depends on:** Unit 2. **Do first** — the zero-rows window is the whole reason this is cheap.

---

### Unit 5: The tenant-scoped grower-supplied path — group-scoped

**Goal:** Bhutan works, and a US grower can supply one group without shadowing the other.
**Files:** `prisma/schema.prisma` (+ migration incl. RLS), `src/lib/pesticide/lookup.ts`,
`src/app/(app)/vineyards/sprays/**`, `scripts/verify-tenant-isolation.ts`, `test/tenant-isolation.test.ts`
**Approach:** `tenant_product_facts`, tenant-scoped, full `AGENTS.md` Phase-12 nine-step checklist
(`tenantId @default("")` + index + FK → `organization(id)` ON DELETE RESTRICT, per-tenant uniques,
`ENABLE` + `FORCE ROW LEVEL SECURITY` + `tenant_isolation` with USING **and** WITH CHECK, app_rls
grants, an isolation case). **One row per `(tenantId, productRef, factGroup)`** (KD-3), carrying the
same fact columns as its registry counterpart plus `enteredBy`, `enteredAt`, `note`. Product identity
does **not** require an EPA number: `tenantProductRef`, **per-tenant unique on a normalized form**
(council S2 — v1 left this underspecified) with `epaRegistrationNumber` nullable. Not in
`GLOBAL_MODELS`. Per KD-4 its reads are **not** behind `isPesticideSourceEnabled`. Minimal entry
surface so QA SAFE-19 is exercisable in a browser, including the `tenantProductRef` field.
**Tests:** RLS isolation across two tenants; entitlement **off** still resolves tenant facts while
registry facts are withheld (the KD-4 guard); every resolved tenant group carries
`provenance: "grower-supplied"` + `source: TENANT_DEFINED`; **a tenant AGRONOMIC override leaves the
registry REGULATORY group live and still updating** (the council G3 case); no blending within a group.
**Depends on:** Units 2, 4

---

### Unit 6: The real `ProductFactsResolver`

**Goal:** Replace `NullProductFactsResolver` at the one injection site, without opening an entitlement hole.
**Files:** `src/lib/pesticide/product-facts.ts` (new), `src/lib/pesticide/lookup.ts`,
`src/lib/spray/actions.ts`, `test/pesticide-boundaries.test.ts`, `test/pesticide-product-facts.test.ts` (new)
**Approach:** `resolveMany(keys)` — batched, index-aligned, never throws. Resolution runs **per fact
group**, and the groups are then assembled into the single `ResolvedProductFacts` the port expects:

```
per (product, factGroup):
  tenant_product_facts row      → TENANT_DEFINED / grower-supplied
  else curated registry row     → REGISTRY / registry
  else                          → group unresolved (fields null)
then: resistanceGroups + activeIngredientKeys from S2's independently-refreshed data (labeled)
      completeness derived by buildFactsSnapshot across the assembled result
```

A group past `reviewDueAt` has its own fields nulled and **cannot contribute to `KNOWN`** (KD-10);
other groups and S2's resistance data are unaffected. Per KD-1 exactly one active row can match, so
there is no selection step. All DB access goes through **new, individually entitlement-gated exported
reads in `lookup.ts`** — not `lookupRegistration`, which yields data only on `ok: true` and so cannot
serve facts for a product that is not CA-registered (council S3). **Widen
`test/pesticide-boundaries.test.ts` to assert the entitlement gate on every exported registry-backed
read, enumerated**, so a sixth read cannot be added without tripping it (council C5). Register the
resolver in `actions.ts` at both submit paths; the correction path inherits S3a's identity-changed-only
rule, so registering **back-fills nothing**.
**Tests:** index alignment for a 3-key batch with an unknown middle key; never throws on a malformed
reg number and **must not fuzzy-match** (reuse the K6 scan); an empty `resistanceGroups` never yields
`resistanceGroupsKnown: true`; `buildFactsSnapshot` downgrades an over-claiming resolver; **a stale
AGRONOMIC group does not suppress a live REGULATORY group, and vice versa**; **a stale group can never
produce `KNOWN`**; the boundary test fails if a new ungated read is added.
**Depends on:** Units 2, 3, 4, 5

---

### Unit 7: Coverage report, re-measured, with pre-committed thresholds

**Goal:** Know how much we can answer for — and decide the go/no-go **before** seeing the number.
**Files:** `scripts/report-product-facts-coverage.ts` (new), `package.json`,
`docs/spray_assistant/phases/S2b-coverage.md` (output)
**Approach:** Re-derive against the **live** corpus (2,420 registrations / 361 AIs), not plan 086's
2026-07-15 / 338-AI figure — 86.5% is quoted as the scoping *principle*, never as a current number.
Report: curated vs uncovered share of product-AI occurrences; **per-fact-field coverage** (known PHI
vs REI vs rainfast vs mobility class — these will differ, and the differences decide what each
downstream phase can answer); the resulting `cannot-determine` rate; the biologicals share of the gap.
Emit a machine-readable `::PESTICIDE_FACTS_SUMMARY::` line matching the existing cron greps.

**Pre-committed thresholds (council S8 — the S0 discipline, written down before the measurement):**

| Threshold | Consequence |
|---|---|
| REGULATORY coverage (PHI **and** REI) **≥ 80%** of the curated set | **S7a unblocked** |
| AGRONOMIC coverage (rainfast **and** mobility) **≥ 60%** | **S6 unblocked** |
| Either below its bar | The phase still **ships** what it has; the deficit is recorded as the trigger for the structured-label-data purchase decision, and the dependent phase waits rather than shipping a mostly-refusing surface |

📊 **First measurement in (Unit 0, corpus-wide): PHI 40.4% · REI 64.0% · both 30.4%** across 4,965
active grape products — **below the 80% bar.** The threshold was written down before the number
existed and it stands. But this is the **corpus** denominator; the gate is defined over the **curated
set**, which is a smaller and probably better-covered population. **Re-measure against the curated set
here, and report both numbers side by side** so the gap between "what DPR has on everything" and "what
we curated" is visible rather than inferred.

This split is only possible **because of KD-11** — group-scoped coverage is what lets S7a proceed
while S6 waits. The report is a **decision input** (runbook §12 q5 makes S2b's measured
cannot-determine rate the trigger for re-evaluating the Cornell purchase), not just a gate artifact.
**Depends on:** Units 2, 6

---

### Unit 7b: Ingest the DPR pest-category vocabulary *(new in v2.1 — replaces the v2 deferral)*

**Goal:** Populate `spray_application.targetPestCode` from a free feed, and claim nothing beyond it.
**Files:** `prisma/schema.prisma` (+ migration), `src/lib/pesticide/cdpr-parse.ts`,
`scripts/ingest-cdpr.ts`, `src/app/(app)/vineyards/sprays/**`, `test/pesticide-pest-codes.test.ts` (new)
**Approach:** Two tenant-global reference tables — `pesticide_pest_category` (the 41 rows of
`target_pest.dat`) and `pesticide_product_pest` (the `prod_target_pest.dat` mapping) — ingested by the
**existing** CDPR script under the **existing** `PesticideDataRevision` lifecycle and mark-and-sweep.
Both go in all three `GLOBAL_MODELS` mirrors. Add `cdprPestArtifactAsOf` to the facts-as-of composite
per Unit 4's fifth-source rule if the ingest lands on a separate cadence.

The spray form offers the category as an **optional** coded companion to free-text `targetPest`,
proposed from the products on the pass (a product coded `C0 FUNGI` proposes `C0`) and **confirmed by a
human** — never auto-applied, mirroring the trade-name and legacy-mapping pattern.
**Tests:** the vocabulary is exactly the 41 ingested rows and is **never extended by inference**; an
unmapped pest resolves to *cannot-determine*, never a guess; a proposal is never written without
confirmation; free-text `targetPest` is preserved verbatim alongside any code; **a copy test asserts
no surface presents a category as a species** — `C0` must never render as "powdery mildew".
**Depends on:** Unit 2 (revision lifecycle)

---

### Unit 8: `verify:product-facts`, goldens, and the invariant note

**Goal:** The gate, in one command.
**Files:** `scripts/verify-product-facts.ts` (new), `scripts/product-facts-verify-cases.ts` (new),
`package.json`, `docs/architecture/invariants/SPRAY-6-no-facts-means-cannot-determine.md` (new)
**Approach:** Copy `scripts/verify-pesticide.ts` structure exactly — `TENANT = "org_demo_winery"`,
`assert(cond, name, detail)` with counters, `withSubscription(enabled)` returning a restore closure,
the entitlement-off block first, `try/finally` restore, footer with `disconnectSystem()` +
`process.exit(1)`. **Always `await` inside the `runAsTenant` callback** — a non-async callback runs
its query after the ALS scope exits and silently reads the outer tenant. Cases: a product with no
facts row resolves unknown, never clear; entitlement off → registry withheld, tenant still resolves;
the Bhutan-shaped fixture end-to-end; separation direction; group-level precedence; a stale group
nulls only itself; `resolveMany` index alignment and no-throw; the jurisdiction snapshot survives a
vineyard edit. Invariant note with the standard frontmatter
(`severity`, `enforcedBy`, `verify: "npm run verify:product-facts"`, `appliesTo`).
**Depends on:** Units 1–7

---

### Unit 9: Monthly re-review cadence and the drift detector

**Goal:** A curated fact that ages out becomes unknown, and someone gets told before it does.
**Files:** `.github/workflows/knowledge-recrawl.yml`, `scripts/seed-product-facts.ts`
**Approach:** Extend the existing monthly pesticide step rather than adding a workflow. Runs the seed
script in **replay** mode, reports drift between the committed artifact and live sources into the same
GitHub issue, and reports **per group** the count of rows within 60 days of `reviewDueAt`. Never
auto-updates a curated value (KD-8). This is the concrete discharge of the risk-register row *"derived
resistance table has no vendor update SLA"* extended to the facts table, and the primary mitigation
for the attrition risk council G4 named.
**Depends on:** Units 2, 7

---

### Unit 10: QA pass and phase report

**Goal:** The standing gate, with evidence.
**Files:** `docs/spray_assistant/qa/S2b-qa-report.md`, `docs/spray_assistant/phases/S2b-report.md`,
runbook §8 ledger row, `NOW.md` (at ship only)
**Approach:** [QA-PROTOCOL](../qa/QA-PROTOCOL.md) in full, from the MAIN checkout. Browser proves the
UI; a `runAsTenant("org_demo_winery", …)` script proves the DB. A skipped case is **written down as
skipped** with its reason — a blank row reads as a pass.
**Depends on:** Units 1–9

---

## 6. Acceptance gate

⚠️ **Restated after council S4.** S2b has no "permitted" output surface at all — it returns facts
snapshots, and every legality verdict belongs to S7a/S7b. The gate below is written to what this
phase can actually demonstrate; *"never permitted"* moves to the evaluator phases where it can be
proven.

- [ ] **Every curated group row carries source + as-of date + reviewer + review-due date** — test-enforced, not conventional.
- [ ] **A REGULATORY row cannot cite an extension source, and an AGRONOMIC row cannot claim a label as the source of a rainfast value.**
- [ ] **A product with no facts row serializes as `UNKNOWN`/`NONE`, and no pure consumer coerces that to clear** (`rotationContribution`, `buildFactsSnapshot`, `reiWindow` each asserted).
- [ ] **Exactly one active curated row per `(epaRegNumber, factGroup)`** — the partial unique index rejects a second.
- [ ] **A stale group nulls only its own fields, never contributes to `KNOWN`, and does not suppress a live sibling group.**
- [ ] **The non-US path proven end-to-end on a Bhutan-shaped fixture** — no EPA lookup, engines still run, marked grower-supplied. ⚠️ A Bhutan-*shaped* fixture on **Demo Winery**, never the live Bhutan tenant.
- [ ] **A tenant AGRONOMIC override leaves the registry REGULATORY group live and still updating.**
- [ ] **Jurisdiction is snapshotted per block line and survives a later vineyard edit** (rule §3.8).
- [ ] **An unconfirmed GPS-proposed jurisdiction does not resolve.**
- [ ] Separation rules are direction-specific, non-inheriting, and a `CLASS` target matching nothing reports *no evidence*.
- [ ] The REI worst-case scalar is the max across activities and is never served as the scouting value.
- [ ] The entitlement toggle gates registry facts and **not** tenant facts; **the boundary test covers every exported registry-backed read.**
- [ ] `resolveMany` is index-aligned and never throws; a malformed reg number does not fuzzy-match.
- [ ] **A correction preserves `snapshotFactsProvenance` verbatim**; registering the resolver back-fills nothing.
- [ ] Coverage report re-measured, with the §5 Unit 7 thresholds evaluated against it.
- [ ] `verify:product-facts` · `verify:pesticide` · `verify:spray-record` · `verify:tenant-isolation` · `verify:ai-native` · `verify:invariants` · `verify:naming` green.
- [ ] **QA report** at `qa/S2b-qa-report.md`.

### QA safety cases

| Case | What it proves | Note |
|---|---|---|
| **SAFE-19** | Non-US tenant does not brick; manual path offered; facts marked grower-supplied | **The flagship S2b case.** S2 deferred it here explicitly |
| **SAFE-10** | Missing input → *"Cannot determine safely — human review required"* as its own state | Not a degraded *act*, not an error page |
| **SAFE-3 / SAFE-4** | *gap* renders distinctly from *no-code-exists* | S2 proved at data layer; S2b re-runs |
| **SAFE-6** | Oil 6 days ago → sulfur blocked, reason names the oil and its date | S2b supplies the data; evaluation is S7a/S7b, so a **DB-level proof** with the UI half explicitly deferred |
| **SAFE-14** | Entitlement off → withheld, not answered from memory | Extended: tenant facts still resolve |
| **SAFE-15** | A product referencing Bulletins Live! Two surfaces "a bulletin check is required" | S2b records the flag; the check is Later |
| SAFE-2, 11, 17, 18, 20 | Re-run at whatever scope exists | A skipped case is **written down as skipped** |

---

## 7. The pest-code probe — RUN 2026-07-26, and it reversed the deferral

v2 deferred the pest vocabulary partly because the probe was unrun. Running it took twenty minutes
and changed the answer. **Deferral withdrawn. It becomes a cheap ingest (Unit 7b), not a curation.**

### What exists, at three levels

| Source | Carries a target pest? | Evidence |
|---|---|---|
| **EPA APPRIL** (the dump S2 already ingests) | **No.** Its columns are `ABNS`, `AIS`, `COMPANY_NAME`, `LABEL_NAMES`, `MAX_LABEL_DT`, `PEST_CAT`, `PRODUCT_NAME`, `REG_NUM`, `SITES`, `STATUS_DESC`, `STATUS_GROUP`. **`PEST_CAT` is the *product* category** (fungicide / herbicide / insecticide) — `derive-resistance-codes.ts:248` already uses it that way. `SITES` is crops. There is no target-pest field | the parser's own column reads, `src/lib/pesticide/appril-parse.ts` |
| **CA DPR product database** | **Yes, but coarse.** `target_pest.dat` is **41 categories**: `C0 FUNGI`, `E0 INSECTS`, `J0 MITES/TICKS`, `M1 ANNUAL BROADLEAF WEEDS`, `EA MOTHS-LEPIDOPTERA`… `prod_target_pest.dat` (2.7 MB) maps products to them as `prodno` + 2-char code | fetched verbatim 2026-07-26 from `files.cdpr.ca.gov/pub/outgoing/product/`, refreshed 2026-07-24 |
| **Species level** — "powdery mildew", "grape berry moth", "botrytis" | **Does not exist** in either public dataset | — |

**The decisive fact: the coarse list is in the exact directory S2 already ingests from**
(`CDPR_BASE = "https://files.cdpr.ca.gov/pub/outgoing/product"`), on a host already in
`TRUSTED_DOMAINS`, refreshed on the same date as `product.dat`, behind the revision lifecycle S2
already built. Ingesting it is roughly the size of one existing CDPR parse function.

### Why that reverses the deferral, and what it does *not* buy

Deferring was right when the alternative was hand-curating a species vocabulary. It is wrong when the
work is a 1,150-byte lookup plus a mapping file from a feed we already pull — a separate phase would
cost more in setup than the work itself.

But it must be labelled honestly. **`C0 FUNGI` is not an answer to "I sprayed for powdery mildew."**
So: the grower's free-text `targetPest` stays the truth of record, `targetPestCode` carries the coarse
DPR category, and **no species-level coding is claimed anywhere**. A pest that does not map resolves
to *cannot-determine* (rule §3.6), unchanged.

⚠️ **Council GQ1's premise needs a correction.** It states *"CA PUR requires DPR pest codes for
restricted materials, so free text will not export."* The monthly **PUR use report** keys on
chemical + **commodity/site** (~320 commodity codes drawn from 2,000+ site codes), not on a target
pest; it is the **restricted-materials permit** — a separate county-issued document — that names the
target pest. Phase 20 should verify which artifact it is actually generating before assuming a pest
code is required at all. Recorded here rather than silently inherited. Runbook §9's S2b "also owned
here" sentence moves to Phase 20 at ship time.

---

## 8. Risks

| Risk | Sev | Mitigation |
|---|---|---|
| **Curation cannot keep pace and facts go stale in-season** (council G4) | HIGH | KD-11 keeps regulatory facts — which change rarely — off the agronomic review cadence. KD-3's group override removes the incentive to shadow a whole row. Unit 9 warns 60 days ahead **per group**. Escalation is named: if curation cannot keep pace, buy structured label data, and Unit 7's report is the decision input. |
| **Curated facts wrong but read as authoritative** | HIGH | Per-group citation + reviewer + review date; `reviewDueAt` degrades; the monthly job is a detector, never an updater; rule §3.1 copy on every surface. |
| **A missing fact reads as "no restriction"** | HIGH | Rule §3.6. Every scalar nullable, no defaults, `completeness` derived not asserted, and the live `KNOWN`-requires-both-knowns CHECK. Plus the new `CLASS`-matches-nothing case (KD-14). |
| **A stale group leaks usable evidence through the fall-through** (council C2) | HIGH | KD-10's group-scoped nulling, with an explicit test that a stale group cannot reach `KNOWN` and does not suppress a live sibling. |
| **An entitlement bypass the CI guard cannot see** (council C5) | HIGH | Per-read gating plus an enumerated boundary test over every exported registry-backed read. |
| **The tenant override becomes a permission bypass** | HIGH | Group-scoped, `TENANT_DEFINED` + `grower-supplied` end to end, records who typed it. S7a still applies its own gates — a grower-supplied PHI is a fact, not an authorization. |
| **Jurisdiction drift breaks replay** (council C3) | HIGH | Per-block-line snapshot at record time; tested against a later vineyard edit. |
| **Collapsing the `factsAsOf` composite loses replay provenance** | HIGH | Unit 4 widens rather than collapses, and proves propagation through a correction. |
| **Seasonal maxima uncomputable for liquids** (council G1) | MED | KD-13's `lbsAiPerGallon`. |
| **A scalar REI answers the hand-labor collision wrongly** (council G2) | MED | KD-12's condition relations; the scalar survives only as a named worst-case bound. |
| Separation-rule curation unbounded | MED | KD-2's subject-asserts-about-class shape plus KD-14's tag ontology bounds it to the curated set. |
| Coverage worse than expected for the fields that matter | MED | Unit 7 measures **per-field** and the thresholds are **pre-committed**. |
| Prisma client clobbered mid-session by a sibling lane | MED | Chain `npx prisma generate &&` into the **same** command as every `tsc`/`verify` run. Four confirmed occurrences during S4. |
| Runbook / ledger clobber | MED | Re-read immediately before editing; edit only the S2b row; never reflow the §8 table. |

---

## 9. Parallel-lane and shared-file plan

S2b runs in lane 1B. Contended files and handling:

| File | Handling |
|---|---|
| `prisma/schema.prisma` + migrations | Units 1–5 land as **one schema-first slice PR**, serialized across lanes. Isolated `ALTER TYPE` before any dependent default (Windows enum rule). |
| `package.json` scripts block | Append-only, one contiguous block. **Land early and rebase**, do not merge late. |
| `src/lib/spray/actions.ts`, `record-core.ts`, `correction-core.ts`, `types.ts`, `facts-snapshot-core.ts` | ⚠️ **The genuinely new collision, and Unit 4 widened it.** S2b is the first lane writing into both `src/lib/pesticide/` and `src/lib/spray/` — the boundary S3a's port was built to keep apart. Land the resolver + provenance propagation as its own PR, after the schema slice. `product-facts-port.ts` itself gains one optional field and nothing else. |
| `spray_block_line` (Unit 1's jurisdiction snapshot) | Additive columns on S3a's shipped table — include in the schema slice PR. |
| `src/lib/tenant/models.ts` + `scripts/verify-tenant-isolation.ts` + `test/tenant-context.test.ts` | **Three** `GLOBAL_MODELS` mirrors, not two (S2 council C5). Verify file and line at `/work` time. |
| `test/pesticide-boundaries.test.ts` | Widened by Unit 6 — a shared test file, so serialize. |
| `SPRAY_ASSISTANT_RUNBOOK.md` §8 ledger | Edit **only** the S2b row. Never reflow the table. |
| `NOW.md` | **Touch once, at ship.** Highest-frequency conflict in the program. |
| `docs/architecture/decisions/00NN-*.md` | Re-read and claim the number **at ship time**. 0012 is the current high-water mark. |
| `council-feedback.md` (repo root) | Deviated to `phases/S2b-council-feedback.md` per program convention. ✅ done |
| `scripts/ai-native-allowlist.mjs` | **Untouched** — KD-7 spends no entry. |

**Gate tiers:** branch-local = `tsc`, pure unit tests, goldens. **Serialized from the MAIN checkout**
= every DB-backed `verify:*` and all browser QA (worktrees have no `.env`).

---

## 10. The measurement that should happen first

Neither reviewer could answer, and no document in this repo estimates, **how long it takes to curate
one product's facts to this standard.** That single unknown drives the phase's real risk: Gemini's
attrition critique, the coverage thresholds, and the structured-label-data purchase decision all hang
off it.

✅ **Unit 0 has run.** `prod_site.dat` does carry usable per-crop PHI and REI, so the spike now
measures a **different and smaller job**: for ~40% of PHI and ~64% of REI the reviewer is *verifying a
proposed value against the label*, not researching one. **Measure the verify workflow, not the
research workflow** — and measure both, since the uncovered tail is still research.

**Run a 10-product calibration spike inside Unit 2 before committing to the top-N target.** Pick ten
products spanning the range — a premix, a liquid, a dry flowable, an oil, a sulfur, a biological —
curate both groups end to end with real citations, and record the minutes.

- **~40 min/product** → the top-60-AI target is roughly a week of evenings. Proceed as planned.
- **~3 h/product** → the honest answer is to buy structured label data, and S2b becomes an **ingestion**
  phase rather than a curation phase. That is a materially different plan, and better to discover it
  at ten products than at sixty.

---

## 11. Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem frame | HIGH | Council C1 is explicit; the hole is verified in code (`NullProductFactsResolver` returns UNKNOWN for everything today). |
| Scope boundaries | HIGH | Drawn from shipped decisions. Sharpened by the council: evaluation is unambiguously S7a/S7b's, and the gate now says only what this phase can prove. |
| Implementation units | HIGH *(was MEDIUM-HIGH)* | Raised: the MEDIUM unit (pest codes, resting on an unrun probe) is deferred out, and the five structural defects the council found are folded rather than deferred. |
| Test strategy | HIGH | Two working templates in-tree, plus three new adversarial cases the council supplied that I would not have written (C2's stale fall-through, C4's correction-drop, C5's ungated read). |
| Risk assessment | MEDIUM-HIGH | The residual unknown is still **curation effort** — but v2.1 narrowed it. Unit 0 can collapse a large part of it (per-crop PHI/REI may be a free ingest), and the pest-code unknown is now closed rather than deferred. §10's ordering — probe, then spike, then commit — is the answer. |

**Lesson recorded (v2.1).** Both the deferral in v2 and the MEDIUM confidence that justified it rested
on an **unrun probe**. Running it took twenty minutes, reversed the decision, corrected a council
premise (GQ1's PUR claim), and surfaced a possible free source for the phase's single most expensive
input. *An unrun probe is not a reason to defer — it is a reason to run the probe.*
