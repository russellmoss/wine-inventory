---
title: "S3a spray record + planned harvest — council feedback"
type: council-feedback
subject: docs/spray_assistant/phases/S3a-spray-record-plan.md
date: 2026-07-26
reviewers: Codex (gpt-5.4 — types, data layer, concurrency) · Gemini (gemini-3.1-pro-preview — domain, liability, UX)
status: reconciled
---

# Council feedback — S3a spray application record

Reviewed at the **data-model and failure-mode** level. Each finding carries an adjudication:
**FOLD** (accept as proposed), **FOLD-MODIFIED** (accept the problem, change the fix), **DECISION**
(needs Russell), **PUSH BACK** (rejected, with reasoning).

**Headline: two findings changed the design, and one of them reverses a decision the plan made
explicitly.**

1. **Gemini G1 — a correction must NOT re-resolve the facts snapshot.** The plan said a correction is
   "a new assertion made now" and re-resolves facts. That is wrong and it violates the program's own
   rule §3.8. Fixing a ground-speed typo in November would repaint July's legal reality with
   November's registration data. **Reversed.** A correction now copies the predecessor's snapshot
   verbatim unless the material line's *product identity* changed.
2. **Codex C7 — a required Postgres `String[]` collapses "unknown" into `[]`.** The plan defended
   this only in the read core (`rotationContribution` never returns an empty group list). But the
   column itself still reads as "no groups used" to anything that queries it directly, which is
   precisely rule §3.6's most dangerous failure mode, built into the schema. **Now defended at the
   database**, with explicit knownness columns and CHECKs.

Also notable: **both reviewers independently flagged the same REI hole** (Codex C14 / Gemini G2) —
`spray_block_line.finishedAt` is nullable but the REI and residual clocks read it, and a fallback to
the header timestamp would clear a block that is still under restricted entry.

---

## CRITICAL

### C1. Child tables are missing `id` and `@@unique([tenantId, id])` ⟶ **FOLD**
*Codex.* The plan spelled the Phase-12 attributes out only on the header and said "all tenant-scoped,
all on the checklist" for the rest. `spray_mix_order_line.materialLineId` and
`spray_drying_override.blockLineId` both need composite-FK targets that were never declared.
**Fix:** every table gets `id`, `@@unique([tenantId, id])`, `@@index([tenantId])`, explicitly.

### C2. The at-most-once correction unique does not cover the VOID path ⟶ **FOLD**
*Codex.* `@@unique([tenantId, supersedesApplicationId])` only constrains rows that *have* a
predecessor. The plan said a void "writes no successor content", so two concurrent voids — or a void
racing an amendment — both commit. The double-correction race the unique was chosen to kill is still
open on the void path.
**Fix:** a void **is** a successor row — `correctionKind = VOID`, `supersedesApplicationId` set,
`status = VOIDED`, zero line children. One mechanism, one constraint, no race. (Rejected Codex's
alternative of a separate void table: it would need its own uniqueness and reintroduce two paths.)

### C3. `RETRACTED` planned harvest cannot represent "no date" ⟶ **FOLD (clarification, no schema change)**
*Codex.* The reviewer assumed retraction writes a RETRACTED **open** row, which would either need a
nullable date or break the one-open-row invariant.
**Fix:** retraction **closes** the open row and appends no successor. *No open row* is how "no
planned date" is represented, and a partial unique index permits zero matching rows. The plan was
ambiguous; it is now explicit.

### C4. An in-memory listener registry is not a durable seam for the C8 reverse-check ⟶ **FOLD-MODIFIED**
*Codex.* Correct and important — a committed harvest-date change could lose its PHI reverse-check
signal on a crash or on a different app instance, and C8 is a HIGH-severity safety finding.
**Reviewer's fix:** a transactional outbox row.
**Adjudicated fix:** no new table. **The event stream already is the outbox.**
`planned_harvest_date_event` is append-only and versioned, so S7a consumes it as a **watermark
cursor** (`plannedHarvestChangesSince(cursor)`), the same shape `LotCostState.computedThroughOpId`
and the Commerce7 ingest cursor already use in this repo. The in-process listener registry is
**deleted from the plan** — it was the weakest part of Unit 10 and the reviewer was right to hit it.

### C5. The immutability trigger omits two append-only tables ⟶ **FOLD**
*Codex.* `planned_harvest_date_event` and `spray_drying_override` are both specified as append-only
and neither was in the trigger's scope.
**Fix:** both get `BEFORE UPDATE` / `BEFORE DELETE` protection. `planned_harvest_date_event`
allowlists only `effectiveTo` and `status` (closing a row is bookkeeping). `spray_drying_override`
allowlists nothing at all.

### C6. `@db.Date` through a JS `Date` is an off-by-one for non-UTC tenants ⟶ **FOLD**
*Codex.* The repo already solved this once — `FieldNote.weekOf @db.Date` is documented as *"written
via the canonical UTC helper"* and `src/lib/fieldnotes/week.ts` exports `toISODateUTC` /
`parseISODateUTC`.
**Fix:** `plannedDate` crosses every boundary as an ISO `YYYY-MM-DD` **string**, converted only at
the DB edge with the existing helpers. A test asserts a Pacific-timezone caller does not shift the
stored date.

### C7. A required `String[]` overloads "unknown" onto `[]` — the §3.6 failure mode, in the schema ⟶ **FOLD**
*Codex.* **The most important finding in either review.** Prisma scalar lists are non-nullable and
default to `[]`. Under the null resolver, `snapshotResistanceGroups = []` and
`snapshotActiveIngredientKeys = []` for every row — and any query path that does not go through
`rotationContribution()` reads that as *"this spray used no resistance groups."* The plan's defense
lived entirely in one pure function. Rule §3.6 says a gap must never render as no-restriction, and
this built the gap directly into the column.
**Fix:** add `resistanceGroupsKnown Boolean` and `activeIngredientsKnown Boolean`, with CHECKs —
`NOT resistanceGroupsKnown OR cardinality(snapshotResistanceGroups) > 0`, and
`factsCompleteness <> 'KNOWN' OR (resistanceGroupsKnown AND activeIngredientsKnown)`. Absence is now
a distinct, queryable, database-enforced state. Invariant `SPRAY-3` guards it.

### G1. A correction must NOT re-resolve the facts snapshot ⟶ **FOLD — reverses Unit 7**
*Gemini.* The plan's Unit 7 said the correction re-resolves product facts and stamps a new
`factsAsOf`, rationalized as *"a correction is a new assertion made now."* That rationale is wrong.
An applicator fixing a ground-speed typo in November pulls November's registration data onto a July
application; if the label changed in October, the legal meaning of the July spray silently changed —
which is exactly what rule §3.8 and council C4 exist to prevent. The plan even listed the resulting
drift as an accepted risk rather than recognizing it as a defect.
**Fix:** the correction **copies the predecessor's snapshot verbatim**, including `factsRevision` and
`factsAsOf`. A line re-resolves **only** when its product identity changed
(`epaRegistrationNumber` / `tenantProductRef` / `productName`), because that is a genuinely new
assertion about a different product. Per-line, not per-document. The corresponding "Risks" entry is
deleted — it is no longer a risk, it is a fixed defect.

### G2 / C14. Null block `finishedAt` must never fall back to the header timestamp ⟶ **FOLD**
*Both reviewers, independently.* A pass can span twelve hours. If a block's own `finishedAt` is null
and the REI clock falls back to `spray_application.finishedAt`, the clock starts early for the blocks
sprayed last and a block still under restricted entry reads as clear. That is a worker-safety
failure, not a data-quality one.
**Fix, rejecting Codex's NOT NULL proposal:** keep the columns nullable — forcing them NOT NULL
makes operators type a fake time, which is worse. Instead, **Unit 8 resolves REI and residual to
`UNKNOWN` for any block line with a null `finishedAt`, and never falls back.** A contract test and a
`verify:spray-record` assertion pin it. Same treatment as every other gap in this program.

### G3. The material quantity has no denominator — rate vs total is ambiguous ⟶ **FOLD**
*Gemini.* **The best domain catch in the review.** `quantityEntered = 5` with `quantityUnit = LB`
could mean 5 lb per acre, 5 lb per 100 gallons of carrier, or 5 lb total in the tank. The template's
own columns corroborate the ambiguity: material lines say "Quantity" (H7) while the mixing table says
"Amount per tank" (E17) — two different bases, unlabelled. Guessing wrong hands the residual model an
order-of-magnitude dose error.
**Fix:** add `quantityBasis SprayQuantityBasis { TOTAL_IN_TANK | PER_AREA | PER_CARRIER_VOLUME }`,
required. `materialRatePerHa()` branches on it and returns `null` for a basis it cannot convert
(`PER_CARRIER_VOLUME` without a carrier volume). Never a guess.

### G4. One planned harvest date per block-vintage breaks split picks ⟶ **FOLD**
*Gemini.* Split picks are ordinary viticulture — an August pick off a block for sparkling or rosé and
a late-September pick off the same block for a still red. The partial unique on
`(tenantId, blockId, vintageYear)` silently overwrites the first, leaving one pick with no PHI
coverage at all.
**Fix:** add `harvestPassLabel String @default("main")` to the key. The partial unique becomes
`(tenantId, blockId, vintageYear, harvestPassLabel) WHERE "effectiveTo" IS NULL`. **Note carried to
S7a:** the PHI check must evaluate against the **earliest** open planned date for the block-vintage,
not the latest — the early pick is the binding constraint.

---

## SHOULD FIX

### G5. Wind direction in degrees is hostile UX and will be zero-filled ⟶ **FOLD-MODIFIED**
*Gemini.* The failure mode is real: a tractor driver at 7pm does not know "315", and a required
integer gets a `0` typed into it, silently recording every spray as a north wind and corrupting the
drift record. But degrees is the right storable truth for a future drift model, and — the reviewer's
own argument, extended — **`CALM` and `VARIABLE` cannot be expressed in degrees at all**, which is
the stronger reason the enum should be primary.
**Fix:** `windDirection SprayWindDirection` (16-point + `CALM` + `VARIABLE`) is the entered truth;
`windDirectionDeg Int?` is retained for a future measured/sensor value only, never operator-typed.

### G6. Blocking cross-vineyard passes will make crews lie ⟶ **FOLD-MODIFIED — KD-12 rewritten**
*Gemini.* Contiguous plantings are routinely split into separate "vineyards" in software for
ownership or costing reasons and sprayed in one physical pass. Rejecting the write does not prevent
the operation; it pushes the crew to mis-attribute blocks, which corrupts the compliance record the
phase exists to produce.
**Fix, keeping the property KD-12 was protecting:** the write is **allowed** across vineyards.
`spray_application.vineyardId` stays required as the **primary site** (defaulted from the first block
line). PUR grouping is derived **at read time from each block line's own vineyard**, not from the
header. The read DTO exposes `isCrossSite` so the UI can surface it. Compliance is still filed per
site; it is just resolved at the right layer.

### G7. The same block can legitimately appear twice in one pass ⟶ **FOLD**
*Gemini.* A tractor breaks down mid-block; the crew flushes, repairs, and finishes later, possibly
off a different tank batch. Or they skip wet ground and return. `@@unique([tenantId, applicationId,
blockId])` makes that unrecordable.
**Fix:** `segmentNo Int @default(1)`, unique becomes `(tenantId, applicationId, blockId, segmentNo)`.
The "enter once, ten blocks, ten lines" round-trip is unaffected. **Added nuance the reviewer did not
raise:** if two segments of the same block are more than 24 hours apart they are arguably two
applications with two residual clocks, so the write core **warns** (does not block) and suggests a
separate record.

### G8. CA PUR needs the operator ID and county permit number ⟶ **FOLD**
*Gemini.* An applicator licence identifies the person; PUR also requires the **Operator
Identification Number** and the site's **county permit number**. The plan captured only the licence.
**Fix:** add `operatorIdNumber String?` and `countyPermitNumber String?` as header snapshot strings.
Cheap now, a backfill later.

### GQ3. Where is the water? ⟶ **FOLD**
*Gemini, filed as a design question but it is a real gap.* `tankVolumeL` is the tank's **size**, not
the carrier volume actually used, and brief §8.5 makes spray-water pH a first-class compatibility
input (alkaline water hydrolyzes organophosphates and carbamates; buffer to 5–6.5).
**Fix:** add `carrierWaterVolumeL Decimal?` and `sprayWaterPh Decimal?` to the header. Water and
compatibility agents already have a home as mix-order lines with a null `materialLineId`.

### C8. `commandId` uniqueness is not idempotency ⟶ **FOLD**
*Codex.* A retry currently surfaces as a raw `P2002`, and the same `commandId` submitted with a
*different* payload is undetectable.
**Fix:** store `requestHash String?`; on unique conflict, re-read by `commandId` and return the
winner when the hash matches, reject when it does not. Same shape as the Commerce7 ingest's
re-read-inside-the-transaction backstop.

### C9. The supersession links need real FKs and a one-time transition rule ⟶ **FOLD**
*Codex.* Nothing prevented a dangling chain or a repointed pointer.
**Fix:** raw-SQL composite self-FKs on `(tenantId, supersedesApplicationId)` and
`(tenantId, supersededByApplicationId)`; the trigger permits `NULL → value` once and never
`value → anything`.

### C10. `materialLineId` can point at another application's line ⟶ **FOLD**
*Codex.* A tenant-scoped FK is not application-scoped.
**Fix:** add `@@unique([tenantId, applicationId, id])` on `spray_material_line` and make the mix-order
FK composite on all three columns.

### C11. `resolve(key)` per material line is an N+1 the null resolver hides ⟶ **FOLD**
*Codex.* Sharp — with the null resolver every call is free, so the shape would ship untested and S2b
would inherit it.
**Fix:** the port's primary method is `resolveMany(keys)`, deduped per application.

### C12. No GIN indexes on the arrays the read paths query ⟶ **FOLD**
*Codex.* `has` / `hasSome` on `snapshotResistanceGroups` and `snapshotActiveIngredientKeys` are the
rotation-budget and residue read paths.
**Fix:** raw-SQL GIN indexes on both.

### C13. No `@db.Decimal(p, s)` specified ⟶ **FOLD**
*Codex.* The plan named `Decimal` without precision on regulated measures.
**Fix:** precision fixed per column in the data model, and `units-core.ts` owns rounding.

### C15. The purge GUC is a weak gate ⟶ **FOLD-MODIFIED**
*Codex.* `current_setting('app.allow_spray_purge')` alone can be set by the app role.
**Fix:** the delete trigger requires the flag **and** that the connected role is not `app_rls`, so
only an owner-context teardown can purge. (Rejected moving teardown into an owner-run SQL function —
it puts test scaffolding in a migration.)

### C16. The verify script's assertions do not cover the new items ⟶ **FOLD**
**Fix:** `verify:spray-record` grows from nine assertions to fourteen — adding the void race, the
append-only protection on the two newly-covered tables, the harvest-change watermark read, real
`commandId` retry semantics, and the null-`finishedAt` REI refusal.

### CQ2. Provenance for the treated-area snapshot ⟶ **FOLD**
*Codex.* The plan allows an operator override of the derived area but stores no record of which it
was — and a rate dispute turns on exactly that.
**Fix:** `treatedAreaSource SprayAreaSource { DERIVED_FROM_SPACING | OPERATOR_ENTERED | SURVEYED }`.

---

## DESIGN QUESTIONS

### GQ1 / CQ3. Coded pest, not free text ⟶ **FOLD-MODIFIED**
*Both reviewers.* Gemini is specific and correct: CA PUR requires DPR pest codes for restricted
materials, so free text will not export. Codex frames the same thing as migration debt.
**Why not fully folded:** there is no pest vocabulary anywhere in this repo, and inventing one is out
of this lane (it belongs with S2b's curated reference data, and PUR export belongs to Phase 20).
**Fix:** keep `targetPest String?` as the *entered* value and add a nullable `targetPestCode String?`
slot beside it now, so there is no migration later. An unmapped pest resolves to *cannot-determine*
at PUR-export time per rule §3.6 — the designed behavior, not a failure. Ownership of the code table
is recorded against S2b.

### GQ2. Does a whole-pass correction revoke block-level approvals? ⟶ **PUSH BACK (deferred, recorded)**
*Gemini.* A fair question against a thing that does not exist yet. S3a has **no approval object** —
rule §3.1 puts authorization on the human at decision time, and the approve/finalize lifecycle
arrives with ROADMAP Phase 20's vineyard work orders. There is nothing here for a correction to
revoke.
**Recorded as a constraint on Phase 20:** when block-level WO approval exists, Phase 20 must define
whether a whole-pass correction invalidates approvals on untouched blocks. Written into the Phase 20
seam section so it is not rediscovered.

### CQ1. Correction granularity ⟶ **resolved by G1, no longer open**
Codex asked whether a clerical correction should re-resolve facts. G1 answers it: it should not.
With the snapshot copied verbatim, whole-document correction costs ~16 copied rows and changes
nothing semantically, so the per-line-correction alternative loses its main argument. **Open question
2 in the plan is closed.**

### Open questions now closed by this review
| Plan OQ | Outcome |
|---|---|
| OQ-1 trigger vs app guard | **Trigger, and widened** (C5). Both reviewers treated DB-level enforcement as correct; Codex's complaint was that it did not go far enough. |
| OQ-2 correction granularity | **Closed** — whole-document, per CQ1 + G1. |
| OQ-3 one pass one vineyard | **Closed** — cross-site allowed, grouped at read (G6). |
| OQ-5 coded target pest | **Closed** — free text now, nullable code slot beside it (GQ1). |

### Still open for Russell
| # | Question |
|---|---|
| **D1** | **KD-5, canonical metric for a US regulatory record.** Neither reviewer challenged it, which is weak evidence. The material-line quantity is stored as entered; everything else converts at the PUR edge. Accept, or store every filed measure exactly as filed? |
| **D2** | **Assistant allowlist tier.** `record-core.ts` is a capability whose tool lands four phases out. `INTERNAL` is a slight lie; `GAP_ALLOWLIST` is forbidden by runbook §5. Add a `SCHEDULED` tier, or accept an honest `reason` string? |
| **D3** | **Segment-gap threshold.** The write core warns when two segments of one block are >24 h apart. Is 24 h the right line, or should it hard-split into two applications? |
