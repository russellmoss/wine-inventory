---
title: S2 registration and resistance master — council feedback
type: council-feedback
subject: docs/spray_assistant/phases/S2-registration-resistance-master-plan.md
phase: S2
date: 2026-07-26
reviewers: Codex (gpt-5.4 — types, data layer, gates) · Gemini (gemini-3.1-pro-preview — agronomy, regulatory, data quality)
status: reconciled
---

# Council feedback — S2 plan

Filed here rather than at the repo root: the
[phases README](README.md) fixes council artifacts at
`docs/spray_assistant/phases/S<n>-council-feedback.md`, and three sibling lanes are reviewing in the
same window.

**Headline: the plan protected the derivation and leaked at the mapping.** The tri-state resolution
enum, the `siteType` split, the DB CHECK on derivation provenance, and the exact-match-only reg-number
rule all survived review — both reviewers named them as correct defensive engineering. What both
reviewers found, from opposite directions, is that the *edges* of the model were still able to turn
"we don't know" into something a grower reads as "you're clear." Three of those are safety bugs, not
design preferences.

Adjudication key: **FOLD** (accept, clearly correct) · **FOLD-MODIFIED** (accept the problem, reject
the proposed fix) · **PUSH BACK** · **DECISION** (needs Russell).

---

## CRITICAL — safety bugs, folded into the plan

### G1. The grape regex ignores bearing vs non-bearing ⟶ **FOLD** *(Gemini — the best catch in either review)*

APPRIL carries hundreds of products — herbicides and soil fumigants especially — registered only on
**"Grapes (Non-bearing)."** `/\bGrapes?\b(?!fruit)/` ingests those as plain "registered on grapes."
A grower applies a non-bearing-only herbicide to a bearing vine: illegal application, illegal
residues, **the whole harvested crop is unsellable.**

Worse, the plan had no excuse — the discovery brief's §3 hard-stop list literally reads *"Bearing/
nonbearing status and vine age satisfy the label."* The plan dropped a named hard stop.

**Fix, folded:** `PesticideSiteRegistration.siteModifier` enum (`BEARING` / `NON_BEARING` /
`UNSPECIFIED`), parsed in Unit 3, carried in the Unit 5 payload so S3a/S7a can validate it against a
block's planting date. New success criterion + fixture.

### G2. Deferring the non-CA state layers makes the federal layer read as a clearance ⟶ **FOLD**

FIFRA lets a state restrict or ban a federally registered product. The plan ships the federal APPRIL
layer now and defers NY/OR/WA "to Later" — so an Oregon tenant queries an EPA-registered product that
Oregon has restricted, there is no state layer to override it, and Unit 5 returns `ok: true`. **The
system fails open on a legal question.** This is the same class as the gap-is-not-a-clearance rule,
one layer up, and the plan enforced it for resistance codes and not for jurisdiction.

**Fix, folded:** jurisdiction is a **required argument** to every legality read. Federal registration
alone is never `ok: true`. Outside CA the result is
`{ ok: false, reason: "state-registration-unknown", federalStatus }` — the federal fact is still
*shown*, it is just not a clearance. Outside the US it is
`{ ok: false, reason: "jurisdiction-unsupported" }`, which is the hook S2b's manual path fills.

### G3. A premix with one uncoded AI silently reports only its coded groups ⟶ **FOLD**

The tri-state is modeled per active ingredient. The product-level rollup was never specified. So a
premix of AI-A (`CODED`, group 7) and AI-B (`GAP`) returns `[7]`, the grower sees a clean group-7
rotation, and breeds resistance to whatever AI-B is. This violates the program's own rule that **a
premix counts against every group it contains** — and it is precisely the plan's stated most-dangerous
failure mode, at the level the plan forgot to check.

**Fix, folded:** product-level resolution is a **most-conservative rollup** — any constituent AI in
`GAP` makes the product `GAP`, with the known partial codes carried as explicitly-labelled *partial
evidence*, never as the answer. This becomes invariant **PEST-1**'s actual teeth, with a golden on a
synthetic coded+GAP premix.

### C1. `revisionId` is not a facts-as-of key ⟶ **FOLD-MODIFIED**

Right diagnosis. Rows are upserted in place, so after run *N+1* you cannot reconstruct run *N* — you
only know which run last touched a row. And a single scalar `revisionId` is a **false contract**
anyway, because one lookup spans APPRIL, CDPR, restrictions, and derived resistance data on different
cadences.

**Rejected fix:** full bitemporal versioning (`valid_from` / `valid_to` on every reference table).
That is over-build for S2 and it solves a problem S3a does not have — S3a snapshots the resolved
**values**, not a pointer into history.

**Folded fix:** replace the scalar with a composite `factsAsOf` — `{ publishedRevisionId, apprilAsOf,
cdprAsOf, resistanceArtifactSha256 }` — and give `PesticideDataRevision` real publish semantics (C2 +
S4 below) so the id means something. Coordinate the shape with S3a before either lane lands.

### C2. Upsert-only ingest leaves stale legal positives answerable forever ⟶ **FOLD**

There is no disappearance diff. A product that drops out of the APPRIL grape set — cancelled,
re-registered, site removed — keeps answering "registered" indefinitely. In a domain where
cancellation is the whole reason freshness is safety-relevant, that is a real bug.

**Fix, folded:** mark-and-sweep inside a revision. Every row carries `lastSeenRevisionId`; rows not
seen in a completed run flip to `WITHDRAWN_FROM_SOURCE` (never deleted — this is an audit trail), and
that flip is what feeds Unit 10's coverage delta. Cheaper than staging tables and it makes the monthly
"status changed" line honest.

---

## SHOULD FIX — folded

| # | Finding | Adjudication | Fix |
|---|---|---|---|
| **C3** | The polymorphic `PesticideResistanceAssignment` is under-constrained — Postgres treats `NULL` as distinct, so a Prisma `@@unique` over the nullable subject columns will not dedupe. Duplicate `(AI, scheme, code)` rows would **double-count coverage and rotation**. | FOLD | **Partial unique indexes** in the raw migration, one per `subjectKind`. (Splitting into two tables also works; partial indexes are less churn and it is raw SQL either way.) |
| **C4** | `provenance: "registry"` is **not** forward-compatible. Widening a literal union is a breaking change for exhaustive consumers. The plan's claim was simply wrong. | FOLD | Define the full union now — `"registry" \| "grower-supplied"` — with S2 only ever *producing* `"registry"`. Consumers get exhaustiveness from day one. |
| **C5** | A **third** `GLOBAL_MODELS` sync point: `test/tenant-context.test.ts` hard-codes the expected global set. The plan named two. | FOLD | Third edit joins PR-1. **Verify the file and line at `/work` time** — this came from the reviewer's own read, not from our research pass. |
| **C6** | Unit 2's contract was internally inconsistent: a *pure parser* cannot return `NOT_FOUND`; only a lookup can. Parse failure and DB absence were blurred. | FOLD | Parser returns `OK \| MALFORMED \| UNSUPPORTED_FORMAT`; lookup returns `FOUND \| NOT_FOUND \| STATE_UNKNOWN \| SOURCE_NOT_ENABLED`. |
| **C7** | `verify:kb-subscriptions` proves the *generic* toggle works. It does **not** prove `lookup.ts` checks it before touching the global tables — the gate did not prove what the plan claimed. | FOLD | An explicit `verify:pesticide` case calling the **real** lookup service with the source off, asserting `source-not-enabled`. |
| **C8** | Per-record error tallying plus a "completed" revision publishes partial data — a crashed or partly-failed run leaves readers seeing mixed old/new rows under a misleading revision stamp. | FOLD | `PesticideDataRevision.status ∈ RUNNING \| FAILED \| PUBLISHED`; reads resolve only against `PUBLISHED`. Pairs with C1/C2. |
| **C9** | The schema section named exactly one index. | FOLD | Enumerate them: the join PK, `(productId, state)`, `(productId, state)` on restrictions, subject-key indexes on assignments, `lastSeenRevisionId`. |
| **C10** | The licensing guard is weaker than claimed — "those three hostnames appear nowhere" proves absence, not that every curated row cites an *approved* source. | FOLD | Flip it to a **positive allowlist**: every `sourceUrl` host in the artifact must resolve to a seeded `KnowledgeSource` / `TRUSTED_DOMAINS` entry. Strictly stronger, and cheap. |
| **G4** | Adjuvants (federally exempt, but **CA-state-registered** with alphanumeric numbers) and FIFRA 25(b) minimum-risk products are classified `MALFORMED` by a digits-only parser. Many labels *require* an adjuvant, so a CA grower could never log a legally-required tank component. | FOLD-MODIFIED | The parser must not mislabel: add a `format` discriminator (`EPA_FEDERAL` / `CA_STATE_ONLY` / `EXEMPT_25B`) and return `unsupported-registration-format` — distinct from `malformed` and from `not-found`. **Rejected:** actually ingesting non-EPA CDPR rows in S2 (that is scope creep into S2b/S3a). **Accepted at the cheap moment only:** make `epaRegNumber` nullable with a partial unique index, add `caRegNumber`, and CHECK at-least-one — one column and one constraint now versus a migration on a table three later phases will already be FK'ing into. |
| **G5** | Salts, esters, and copper variants will **inflate `GAP` massively**. APPRIL carries "Copper hydroxide", "Copper octanoate", "Copper sulfate pentahydrate" as distinct strings; extension sources say "Copper (M 01)". Exact string matching drops most copper and mancozeb products into `GAP` — a coverage report swamped with false gaps is as useless as no report. | FOLD | A **curated, cited, human-reviewed `ai-normalization.json`** — same discipline as the codes themselves, *not* a suffix-stripping regex (that would be exactly the genus-generalization inference K5 forbids). Applied **only** for resistance-code assignment, never for identity: the `PesticideActiveIngredient` row keeps its APPRIL name and gains a `parentActiveIngredientId` self-relation. Negative test: normalization never merges two AIs that carry different codes. |
| **C11** | "Run `prisma generate` immediately before every command" is a **human ritual, not isolation** — sibling lanes can still clobber the shared generated client between `tsc` and `vitest`. | FOLD-MODIFIED | Diagnosis accepted; the proposed fix (per-worktree generated-client output) is a repo-wide change outside this lane's file boundary that would collide with all three siblings. **Record as tech debt, keep the ritual for S2, raise it at the program level.** |

---

## DESIGN QUESTIONS — answered in the plan

**C12 — which of site / state / restriction is authoritative for legality?** *(Codex; Gemini's G2 is
the same question from the regulatory side.)* Answered explicitly, and it is now written into the
plan: **most restrictive wins.** Federal site registration is *necessary, never sufficient*; state
registration is a required conjunct and its absence is `UNKNOWN`, not `NO`; restrictions are
subtractive; and the *only* composition that yields `ok: true` is federal-registered **and**
state-registered-for-this-jurisdiction **and** no unresolved restriction. Everything else degrades to
a typed not-ok.

**C13 — a mutable `labelDate` on a current-state row does not establish a version key.** Correct.
**The claim is withdrawn** rather than the feature built: S2 stores `labelDate` as an attribute of the
current row and says plainly that **S2b owns product versioning.** Better to under-claim than to hand
S2b a key that does not hold.

**G6 — how does a trade name in an extension PDF become an EPA registration number?** The genuinely
missing link, and neither our plan nor plan 086 had an answer. Extension guides key on trade names
("Rally 40WSP"); APPRIL trade names carry ™, ®, and alternate spellings. **Folded:** a curated
`trade-name-map.json` with the same citation-and-review discipline, plus a normalization pass
(strip ™/®, case-fold, collapse whitespace) used **only to propose candidates a human confirms** —
never auto-applied, because an auto-applied trade-name match is the same silent mis-attribution K4
and K6 exist to prevent. Trade names carrying a cited code that we could not attach to a product get
their **own bucket in the coverage report** — that count is worth having.

---

## What survived review unchanged

Worth recording, because these were the load-bearing choices and neither reviewer challenged them:

- **K2** the tri-state `ResistanceResolution` enum with the `CODED` ⟺ `code IS NOT NULL` CHECK
- **K3** `siteType` modeled separately from the code
- **K4** the DB CHECK forbidding a `PRODUCT` assignment derived from an AI-keyed table — Codex called
  it correct defensive engineering, Gemini called it excellent
- **K6** exact-match-only reg-number resolution with no fuzzy matcher anywhere in the lane
- **K7** entitlement at the service layer rather than the tool
- **K1** the no-`-core.ts` naming decision
- The binding no-FRAC/HRAC/IRAC-compilation constraint — **neither reviewer re-litigated it**, and
  Gemini's G5 tightened the *derivation* rather than attacking the *decision*

---

## Reconciliation summary

Everything above is folded into
[S2-registration-resistance-master-plan.md](S2-registration-resistance-master-plan.md). No finding
was rejected outright; three had their *proposed fixes* replaced (C1 bitemporal versioning, C11
per-worktree clients, G4 non-EPA ingest) while the problems were accepted.

**Net effect on scope:** twelve units still, with Unit 1 (schema), Unit 3 (parse), Unit 5 (lookup
contract), and Unit 9 (derivation) each heavier. Two new curated artifacts — `ai-normalization.json`
and `trade-name-map.json` — both the same shape and discipline as the one already planned. **Three
new success criteria** covering bearing/non-bearing, jurisdiction, and the premix GAP rollup.

**One thing to coordinate outside this lane before `/work`:** the composite `factsAsOf` shape (C1).
S3a is building its facts-as-of snapshot in parallel and consumes it.
