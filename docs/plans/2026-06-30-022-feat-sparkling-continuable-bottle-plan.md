---
title: Phase 7 — Bottle-as-continuable-container & sparkling
type: feat
status: completed
date: 2026-06-30
completed: 2026-07-01
branch: main
depth: deep
units: 14
revision: 5 (reviews folded + capture-surface consolidation)
---

> **Built on `main` 2026-07-01.** All 14 units shipped. Exit proof
> `tsx --env-file=.env scripts/verify-sparkling.ts` = 42 assertions (multi-vintage
> assemblage → tirage → 2nd ferment → riddling → partial disgorgement/split → dosage →
> finalize → NV Brut SKU, plus tank-method, pét-nat, corrections, and the clean-DB
> migration smoke). Still-wine bottling proven byte-identical (`verify-bottling.ts`, 17
> assertions); all prior verify-*.ts + 585 vitest tests green.
> Two plan gaps resolved at build time: (1) K14 assumed an existing winery-settings model —
> none existed, so a singleton `AppSettings` row + a `/settings` page were added (user-chosen);
> (2) K13 extended to also make `BottlingSource.vesselId` nullable (a finalized bottle lot has
> no vessel). The tank-method 2nd ferment is NOT modeled as an AF vector (the Phase 6 matrix
> treats WINE+AF:ACTIVE as incoherent) — the tirage-sugar ADDITION + isobaric bottling carry it.

## Overview

Make bottling **non-terminal** (VISION D5) so a bottled lot keeps accruing ledger
operations — the spine needed for traditional-method (méthode champenoise) sparkling
end-to-end on the same append-only ledger we already have. A cuvée flows: base wine →
**assemblage** (a Phase 5 BLEND, frequently multi-vintage) → **tirage** (a Phase 3
ADDITION of *liqueur de tirage* + a bottling event that discretizes bulk liters into a
counted, in-process bottle lot) → secondary ferment + lees aging (Phase 6 `afState`,
elapsed time) → **riddling** (a zero-volume work step) → **disgorgement** (a LOSS;
partial disgorgement is a Phase 5/6 SPLIT) → **dosage** (an ADDITION of *liqueur
d'expédition* that sets the brut/extra-brut/… style) → cork + cage → **finalize** to a
sellable `WineSku` through the existing bottling/inventory path. Tank method (Charmat)
and pét-nat ride the same primitives as the simpler contrast cases.

The win for the winemaker: a tirage batch stops being a dead-end inventory row and
becomes a living lot you can carry — with correct volumes, bottle counts, and lineage —
from blend to disgorgement-by-tranche to a labeled finished SKU, all auditable on one
timeline.

## Problem Frame

Today `applyBottling()` (`src/lib/bottling/run.ts`) treats bottling as the lot's exit:
it draws bulk volume out of the vessel, writes a `BOTTLE` op whose counter-leg leaves
the cellar, and creates finished `BottledInventory`. The lot's `form` never changes and
nothing accrues after. That's correct for still wine and **fatal for sparkling**, where
the most important winemaking — second fermentation, months-to-years of lees aging,
disgorgement, dosage — all happen *after* the wine is in glass.

If we do nothing: sparkling can't be tracked past bottling; a winery making
traditional-method wine keeps that entire (high-value, multi-year) inventory in a
spreadsheet, breaking the single-source-of-truth the ledger exists to provide. The cost
roll-up planned for Phase 8 also can't reach bottle-phase additions/losses.

The job to be done: **represent "bottled but not finished" as a first-class, continuable
lot state**, and express every sparkling step as an operation on the *existing* ledger —
not a parallel mechanism (§4: process is data).

**Product pressure-test note:** the simpler framing ("just add a few status fields to
the SKU") fails because sparkling needs volume bookkeeping (disgorgement loss, dosage
add-back) and lineage (partial disgorgement by tranche) that only the lot/ledger spine
provides. The chosen framing is the minimum that satisfies the ROADMAP exit criteria.

## Requirements

- **MUST:** A lot can enter `BOTTLED_IN_PROCESS` form holding a **bottle count** and a
  **volume**, and keep accruing ledger operations until it transitions to `FINISHED`.
- **MUST:** Assemblage reuses the Phase 5 BLEND primitive (`blendLotsCore`), supporting
  multi-vintage / reserve-wine cuvées (vintage stays an attribute — D3).
- **MUST:** Tirage and dosage are ledger **ADDITION**s that record material, rate, and
  computed totals via `LotTreatment` + `CellarMaterial` (so Phase 8 can draw them down).
- **MUST:** Disgorgement is a ledger **LOSS** of per-bottle volume; **partial
  disgorgement is a SPLIT** (Phase 5/6 split primitive) producing a disgorged child lot
  with its own disgorgement/dosage date + specs + lineage, while the remainder stays
  en tirage.
- **MUST:** The projection reconciles **both** a bottle count and a volume for an
  in-process bottled lot, under the existing double-entry/projection invariants
  (D2/D14): **projection == deterministic fold of the ledger, folded inside the
  `writeLotOperation` chokepoint** (not by cores after it).
- **MUST:** Bottle-storage ledger legs are marked with an explicit `bucket =
  BOTTLE_STORAGE` discriminator — **never** conflated with `vesselId = null` "left the
  cellar" (so Phase 8 cost roll-up can tell wine-in-bottle from wine-gone).
- **MUST:** Finalize transitions the lot to `FINISHED` and hands off through a **single
  shared finished-goods materialization core** (used by both still-wine `applyBottling`
  and sparkling finalize) → `WineSku` / `BottlingRun` / `BottlingSource.lotId` →
  inventory, with the dosage-determined **style** on the SKU.
- **MUST:** New `OperationType` values land in their **own isolated migration** before
  any migration/code uses them (Postgres `ALTER TYPE ADD VALUE` gotcha).
- **MUST:** Tank method (Charmat) stays a **bulk** lot (`LotForm.WINE`, in a pressurized
  tank vessel) — it never gets a `BottledLotState`; pét-nat is supported as a variant.
- **MUST:** NV / multi-vintage sparkling is representable on the finished SKU (nullable
  vintage + `isNonVintage`).
- **MUST:** The whole traditional-method flow is gated behind a winery-level
  `sparklingEnabled` Setting (default **off**) — when off, none of the sparkling UI/nav is
  shown; when on, the full flow (tirage → … → finalize) + the En Tirage worklist appear.
- **SHOULD:** Riddling is logged as a `deltaL = 0` work step.
- **SHOULD:** Bottle-phase ops are correctable per D6/D15, with the correction guard
  extended to cover bottle positions (`BOTTLE_STORAGE` legs + `bottleDelta`).
- **SHOULD:** Sugar helpers compute tirage-sugar↔pressure and dosage→residual-sugar off a
  **measured pre-dosage RS** (base RS + tirage sugar − fermented + dosage), classify the
  EU sweetness style (Brut Nature iff `dosageGramsPerL == 0`), and log an advisory ABV
  bump when the secondary ferment finishes.
- **SHOULD:** A materialized, backdatable `tirageAt` on the bottled lot makes
  "months on lees" cheap to query and seedable for legacy import.
- **NICE:** In-bottle observations during lees aging (bottle pressure, tasting) reuse
  the Phase 4 measurement/tasting records.
- **NICE:** Non-750 mL formats (magnum, etc.) via the per-lot `nominalFillMl` field.

## Scope Boundaries

**In scope:**
- The `BOTTLED_IN_PROCESS` lifecycle (continuable bottle lot: count + volume + location).
- Traditional method end-to-end: assemblage → tirage → (2nd ferment/aging) → riddling →
  disgorgement (full + partial-as-split, incl. sacrificial-bottle topping) → dosage →
  finalize → finished SKU.
- Tank method (bulk) and pét-nat (bottle, sur lie) as variants.
- New operation vocabulary: `TIRAGE`, `RIDDLING`, `DISGORGEMENT`, `DOSAGE`, `FINISH`.
- Bottle-count ↔ volume reconciliation folded inside the chokepoint.
- The finished-SKU hand-off via a shared materialization core; NV SKU support.
- A winery-level `sparklingEnabled` Setting gating the whole flow (K14, default off).
- UI for the bottled-in-process lot and its operations; a dedicated **En Tirage
  worklist**; timeline rendering; a `verify-sparkling.ts` integration proof.

**Out of scope (and why):**
- **Sparkling-specific supplies inventory + cost** — **Phase 8**. Tirage/dosage are clean
  ADDITIONs against `CellarMaterial` *now* so Phase 8 can draw them down without rework.
- **Work orders** (riddling schedules, disgorgement runs as planned tasks) — **Phase 9**.
  Riddling is logged now so Phase 9 has an anchor.
- **Assistant / voice capture** of sparkling ops — **Phase 10** (D10 keeps
  lineage-mutating ops UI-only regardless).
- **Cellar-bin management UI** (bin CRUD, capacity, maps) — later. Phase 7 adds only a
  nullable `locationId` pointer + set/show on the lot.
- **Mixed bottle formats inside one tirage batch** — one `nominalFillMl` per bottled lot;
  a magnum run is its own lot.
- **Per-bottle individual tracking** — bottles within a lot are homogeneous within a
  tolerance (K6); divergence is a split, not per-bottle rows.
- **Backfilling sparkling state onto legacy/pre-cutover lots** — D11 (no fabricated
  history); `tirageAt` is backdatable for opt-in legacy seed only.

## Research Summary

### Codebase Patterns
- **Ledger chokepoint** — `writeLotOperation(tx, WriteOpInput): Promise<number>` in
  `src/lib/ledger/write.ts` (~L66–150): asserts balanced lines, folds against current
  `VesselLot` balances, capacity-guards, inserts immutable `lot_operation` +
  `lot_operation_line` (durable code snapshots), applies the projection, syncs the legacy
  `vessel_component` table. Wrapped by `runLedgerWrite()` at **SERIALIZABLE** with P2034
  retry. `LotOperation.id` autoincrement **is** the monotonic fold order. **Phase 7
  extends this applier to also fold `BottledLotState` (see K2).**
- **Enums** — `src/lib/ledger/vocabulary.ts`: `OperationType` on `main` =
  `SEED, RACK, LOSS, ADJUST, DEPLETE, BOTTLE, CORRECTION, ADDITION, TOPPING, FINING,
  FILTRATION, CAP_MGMT, BLEND, CRUSH, PRESS, SAIGNEE`. `LotForm` = `FRUIT, MUST, JUICE,
  WINE, BOTTLED_IN_PROCESS, FINISHED` (the two target values already exist).
- **Blend/split primitive** — `src/lib/ledger/math.ts` `planBlend()`/`planBlendSplit()`;
  wrapped by `blendLotsCore()` (`src/lib/blend/blend-core.ts`) with `NEW_LOT` /
  `GROW_EXISTING` modes + per-distinct-parent lineage aggregation. Phase 6 press
  (`planPress`) already rides this with `LotLineage.kind = "SPLIT"`.
- **Additions / loss** — `src/lib/cellar/addition.ts` (`addAdditionCore`, volume-neutral,
  writes a `LotTreatment` with `computedTotal`/`computedUnit`/`volumeLAtAddition`
  snapshots against `CellarMaterial`; `LotTreatment.kind` is a validated string —
  extensible with no migration); `src/lib/cellar/loss.ts` (`recordLossCore`).
- **Bottling/SKU/inventory** — `src/lib/bottling/run.ts` `applyBottling()`: draws from
  `VesselLot`, upserts `WineSku`, creates `BottlingRun` + `BottlingSource` (nullable
  `lotId` FK), writes a `BOTTLE` op, then `StockMovement` + `BottledInventory`.
  `reverseBottlingTx()` exists. Does **not** change `lot.form` or track bottle count.
  **Phase 7 extracts a shared materialization core from this and reuses it (K8).**
- **Form transitions** — Phase 6 added `LotStateEvent` + a `form × afState × mlfState`
  legal-transition validator. Phase 7 extends the matrix for `WINE → BOTTLED_IN_PROCESS
  → FINISHED`. (Confirm the transition writer's exact name at `/work` time; reuse it.)
- **Tests** — vitest; pure planners unit-tested directly (`test/ledger-math.test.ts`,
  `test/blend-math.test.ts`); cores split from `"use server"` actions; integration proofs
  are `scripts/verify-*.ts` (run with `tsx --env-file=.env`).

### Prior Learnings
- Phases 3, 5, 6 each explicitly **defer sparkling/tirage to Phase 7**; the seams they
  left are exactly `OperationType` (isolated migration), `LotLineage.kind`, `LotStateEvent`
  form transitions, the split primitive, and the Phase 4 analyte registry. **No
  architecture change required — Phase 7 extends at the seams** (plus the chokepoint fold).
- Memory: measurements attach to exactly one lot; Phase 6 ferment complete on main;
  `/bulk` reads `vessel_component` (treat `vessel_lot` as authoritative); deleting a Neon
  lot uses sequential FK-safe deletes; prefers committing straight to main.
- Memory — **Windows/Neon migrations**: `prisma migrate dev` is broken here; hand-author
  via `prisma migrate diff --from-url "$DATABASE_URL_UNPOOLED" --to-schema-datamodel`,
  strip the phantom `search_vector` diff, `prisma validate` → `migrate deploy` → stop the
  dev server → `prisma generate`.
- **This worktree is behind `main` by Phase 6.** The plan is authored here; `/work`
  executes on `main` where Phase 5 + 6 primitives are present.

### External Research (winemaking domain — load-bearing numbers, cited)
- **Tirage sugar ↔ pressure:** ~**4 g/L sugar per 1 atm** (varies 4.0–4.3 with temp).
  Champagne target ~**6 atm → ~24 g/L**; liqueur de tirage ~500–625 g/L. Fermenting
  ~24 g/L adds **~1.2–1.4 % ABV** (bump ≈ added-sugar-g/L ÷ ~16.8).
- **Lees aging minimums** (region-specific, store as config): Champagne NV ≥12 mo on lees
  (15 mo total), Vintage ≥36 mo; Cava 9/18/30; Crémant ~9–12.
- **Disgorgement loss:** ~**3–5 % ≈ 20–37 mL / 750 mL** (varies by method); **sacrificial
  bottles** (~2 %) may be opened to top survivors — that volume is *reallocated, not lost*;
  breakage/culls drop the *count*.
- **Dosage:** liqueur d'expédition **0–60 mL/bottle** at **300–750 g/L**; tops up *and*
  sets style. Final RS ≈ base RS + tirage sugar − fermented + dosage sugar.
- **EU sweetness bands (g/L), ±3 g/L tolerance:** Brut Nature **<3 (iff no *sugar*
  dosage — a 0 g/L dry reserve/SO₂ top-up still counts as Brut Nature)**, Extra Brut
  **0–6**, Brut **<12**, Extra Dry **12–17**, Sec **17–32**, Demi-Sec **32–50**,
  Doux **>50**.
- **Tank method (Charmat):** secondary ferment in a pressurized **tank** (2–4 atm),
  isobaric bottling; **no riddling/disgorgement/dosage top-up** → stays bulk in liters
  until one final bottling. The easy case: one vessel = one homogeneous lot.
- **Pét-nat / ancestral:** single fermentation finished in bottle; **no liqueur de
  tirage**; disgorgement + dosage optional/absent (often finalized *sur lie*).
- **Bottle formats:** standard 750 mL; split 187.5 / half 375 / magnum 1.5 L / … .

## Key Decisions

| # | Decision | Choice | Alternatives rejected | Rationale |
|---|----------|--------|-----------------------|-----------|
| **K1** | What is an "en tirage" batch? | A **lot in `BOTTLED_IN_PROCESS` form** with a 1:1 **`BottledLotState` projection** holding `bottleCount`, `nominalFillMl`, `volumeL`, `method` (`TRADITIONAL`\|`PETNAT` only), `stage`, `tirageAt`, and a nullable `locationId`. No new vessel/entity. | New `BOTTLE` vessel type; a separate `TirageBatch` entity | User-selected. Keeps sparkling a pure operation sequence on the lot/ledger spine (D4/D5). The projection mirrors how `VesselLot` materializes vessel volume; bottles are the lot's current state in a non-vessel location. |
| **K2** | Where does bottle count/volume live, and who folds it? | A dedicated **`BottledLotState` projection keyed by `lotId`**, folded **inside the `writeLotOperation` chokepoint's projection applier** (`src/lib/ledger/write.ts`, after the `vessel_lot` diff at ~L146), using the **same SERIALIZABLE + P2034-retry pattern as the existing `vessel_lot` fold — plain in-tx read, no bespoke row-lock** (matches write.ts:36-40,:77), *not* by cores after the write. | Cores write it after the chokepoint (council CRITICAL #1); a manual `SELECT FOR UPDATE` (inconsistent with the house pattern); abusing `VesselLot` with a null vessel | One authoritative deterministic projection path (D2/D14). `BOTTLE_STORAGE` legs are already skipped by the vessel fold (it filters on `l.vesselId`), so the bottle fold is additive. Cores supply descriptive attributes (method/nominalFill/tirageAt/locationId) via an optional `bottleState` on `WriteOpInput`; the chokepoint folds `volumeL`/`bottleCount` from the lines. |
| **K3** | Encoding + count↔volume reconciliation | Add **`LotOperationLine.bucket`** (`VESSEL`\|`EXTERNAL`\|`BOTTLE_STORAGE`) + **`bottleDelta Int?`**. Bottle-storage legs use `bucket=BOTTLE_STORAGE` and carry **both** `deltaL` and `bottleDelta`; all other legs have `bottleDelta` null. `volumeL` folds from `deltaL`, `bottleCount` from `bottleDelta`. `nominalFillMl` is a format constant. | Reusing `vesselId=null` for bottle storage (council CRITICAL #2 — conflates with "gone"); a nullable `bottleDelta` with no discriminator (nullability trap) | An explicit bucket lets Phase 8 distinguish wine-in-bottle from wine-lost; the discriminator + hard validation closes the nullability trap. Both dimensions are genuine ledger folds. |
| **K4** | Partial disgorgement | **A SPLIT** via the Phase 5/6 split primitive generalized to a bottle-counted lot: each tranche **peels off a NEW disgorged child lot** (own code, own disgorgement/dosage date + style, `LotLineage.kind="SPLIT"`, tagged with a `disgorgementRunId`); the **parent en-tirage lot keeps identity** with reduced `bottleCount`/`volumeL`. Cost roll-up aggregates children via `parentLotId`. | Two fresh children + parent becomes a pure node; in-place flag | Peeling children off a surviving parent models N disgorgement dates cleanly and lets each tranche take a **different dosage style** from one base. Council confirmed keep-parent; `disgorgementRunId` keeps repeats queryable. |
| **K5** | New operation vocabulary | `TIRAGE`, `RIDDLING`, `DISGORGEMENT`, `DOSAGE`, `FINISH` added to `OperationType` in **one isolated enum-only migration** deployed before any use. Assemblage = `BLEND`; partial-disgorge split = existing primitive; in-tank 2nd ferment = Phase 6 `afState`. | Free-text op types (violates D4); overloading `BOTTLE`/`ADDITION`/`LOSS` | Typed vocabulary keeps the timeline legible and cost roll-up traceable. Add only what has no honest existing type. |
| **K6** | Homogeneity invariant (relaxed) | A bottled-in-process lot is **homogeneous within a tolerance**: all bottles at the same `stage`, and `volumeL ≈ bottleCount × nominalFillMl` within a configurable band (accommodates disgorgement loss before dosage top-up, and sacrificial-bottle topping). Any *stage* divergence MUST be a split. Legal stage transitions enforced in the writer. | Exact `volumeL/bottleCount` equality (council: broken by sacrificial bottles / pre-dosage state) | Per-bottle fill is well-defined *within tolerance*; exactness is false. The writer + tests enforce it since it isn't DB-native. |
| **K7** | Riddling | A **`RIDDLING` op with `deltaL = 0`** + a `LotTreatment` (method: pupitre/gyropalette, days). | Omit from the ledger; a generic work-step op | User-selected; `CAP_MGMT` precedent. Keeps the arc complete; anchors Phase 8/9. |
| **K8** | Finalize / SKU hand-off | Extract the **finished-goods materialization *tail*** of `applyBottling` (SKU upsert/find-or-create + `BottlingRun` + `StockMovement` + `BottledInventory`) into a shared `materializeFinishedGoods(tx, { bottlesProduced, volumeConsumedL, bottleSizeMl, sources[], … })` helper — **parameterized volume + bottle size** (still wine derives via `consumedForBottles`/750; sparkling passes actual `volumeL` + `nominalFillMl`). Refactor `applyBottling` to call it (guarded by a characterization test — user fork resolved: extract & share). `finalizeSparklingCore` = a `FINISH` op closing `BottledLotState`, `form → FINISHED` (state machine + `LotStateEvent`), then the shared helper creates `WineSku` (`method` + `dosageStyle`; **NV via find-or-create, not compound upsert** — K11) + `BottlingRun` (batch `disgorgedAt` + actual `dosageGramsPerL`) + a **required** `BottlingSource.lotId` (with **nullable** variety/vineyard — see K13) + `StockMovement`/`BottledInventory`. `BottlingRun` blessed as the generic finished-goods record. | Two independent finished-goods paths (council CRITICAL #6 — double-count/desync); duplicating the tail (user fork: rejected in favor of DRY); a separate finished-goods table | One materialization contract = one set of guarantees; the tail is small and the characterization test proves still-wine bottling is byte-identical. Batch facts live on `BottlingRun`, not the catalog `WineSku` (council CRITICAL #5). |
| **K9** | Lees aging / 2nd ferment | **No new op for aging.** Secondary fermentation = Phase 6 `afState` (`ACTIVE→DRY`) on the bottled lot (orthogonal to `form`, works in-bottle and in-tank). A materialized **`tirageAt`** on `BottledLotState` (backdatable) drives "months on lees" queries + legacy seed; per-tranche `disgorgedAt` lives on the disgorged child + its `BottlingRun`. In-bottle observations reuse Phase 4 records. | A linear "sparkling phase" enum; time-only with no queryable dates | Honors Phase 6's orthogonal-vectors rule; `tirageAt`/`disgorgedAt` make aging cheap to query and importable. |
| **K10** | Sugar / style math | Pure advisory helpers: tirage-sugar↔pressure (~4 g/L/atm, overridable) recording `tirageSugarAddedGpl`; **dosage ΔRS computed off a measured pre-dosage RS** (base RS + tirage − fermented), not assumed ~0; EU **style classifier** where **Brut Nature ⇔ `dosageGramsPerL == 0`** (dry/SO₂ top-up allowed); advisory **ABV bump** logged when `afState ACTIVE→DRY`. Store actuals; label separate from measured RS (±3 g/L). | Hardcoded constants; RS = dosage only; Brut Nature = "no DOSAGE op" | Real practice varies; store actuals, compute suggestions; the EU rule is about *sugar*, not the existence of a dosage step. |
| **K11** | NV / multi-vintage SKU | `WineSku.vintage` becomes **nullable** + a **`isNonVintage Boolean`** flag; the unique key `[name, vintage, bottleSizeMl]` allows null vintage. Finalize sets `isNonVintage` (and null vintage) when the lot's lineage shows >1 vintage. | Sentinel `0=NV`; storing the disgorgement year in `vintage` | User-selected. A true, non-lying representation; avoids magic numbers and unique-key collisions across NV runs. |
| **K12** | Physical bottle location | A **nullable `locationId`** (FK to the existing `Location` model) on `BottledLotState`, with light set/show UI; no bin-management CRUD in Phase 7. | Tracking count/volume only (can't find bottles); full bin management now | User-selected. Nullable = no burden if unused; high value for locating en-tirage bottles. |
| **K13** | `BottlingSource` origin for blended lots (eng-review) | Make `BottlingSource.varietyId`/`vineyardId` **nullable**; stop writing `?? ""` (run.ts:93-95). Provenance for lot-sourced runs is `lotId` (required) + the lineage DAG. | Keeping them required (a **blended/multi-vintage sparkling lot has null origin** → the current `?? ""` inserts an invalid FK and the finalize would blow up against `Restrict`); deriving a representative variety/vineyard from lineage (fabricated) | Grounded bug: this is already latent for blended *still* wine. `lotId` is the real provenance; nullable origin is honest. Fold, not a fork. |
| **K14** | Sparkling as an opt-in capability (design-review, user) | A winery-level **`sparklingEnabled` setting** (default **off**) gates the **entire** traditional-method UI: the tirage vessel-action, the in-process lot panel, the En Tirage worklist, and the disgorge/dosage/finalize actions + nav entry. Backend enums/schema ship regardless (inert when unused). | Always-on sparkling UI for every winery (clutter for the many wineries that make no traditional-method sparkling); a build-time flag (not per-winery) | User-decided. Most wineries don't make méthode-champenoise; the flow should be invisible unless turned on in Settings. A runtime per-winery toggle keeps one codebase and lets a winery switch it on when they start a sparkling program. Follows the existing "winery setting" pattern (e.g. Phase 6 sugar unit). |
| **K15** | Capture-surface consolidation (user) | **Disgorgement + dosage + finalize are ONE capture flow** ("Disgorge & finish"), writing the distinct DISGORGEMENT + DOSAGE + FINISH ledger ops in sequence, with an **"advanced: disgorge only / dose later"** escape for late-disgorged / hold-on-cork wines. **Riddling** is an inline one-tap quick-log, not a form. The **En Tirage worklist is the action hub** (launch the flow from a row). Cores (`disgorgement`/`dosage`/`finalize`) stay modular. | Five separate action forms (Tirage/Riddling/Disgorge/Dosage/Finalize) | User-decided; the direct analog of the crush+press merge and Phase 6's combined de-stem+press module. Disgorge→dose→cork is one physical pass on the line; three screens for one job is needless surface area. Ledger events stay distinct for cost/traceability/corrections (D2/D7). Net: 5 action forms → 2 (Tirage + Disgorge-&-finish) + an inline riddling log. |

## Implementation Units

> Ordering: enum + schema first (migrations), then pure planners/helpers (test-first),
> then the chokepoint fold, then cores (tirage → riddling → disgorgement → dosage →
> finalize), then variants, corrections, UI, timeline, and the integration proof. Cores
> are split from `"use server"` actions. No implementation code — approach + DSL only.

### Unit 1: Operation vocabulary (isolated enum migration)
**Goal:** Add `TIRAGE`, `RIDDLING`, `DISGORGEMENT`, `DOSAGE`, `FINISH` to `OperationType`.
**Files:** `src/lib/ledger/vocabulary.ts`, `prisma/schema.prisma` (enum), new
`prisma/migrations/<ts>_phase7_operation_types/migration.sql` (enum-only).
**Approach:** Add the five values to the Prisma `OperationType` enum + TS mirror.
Hand-author an **enum-only** migration containing just the `ALTER TYPE ... ADD VALUE`
statements — nothing that references them — so the Postgres "new enum value can't be used
in the same tx that adds it" gotcha can't bite a later unit. Deploy on its own before
Unit 2. (New Phase 7 *enums* — `bucket`, method, stage, style — are brand-new `CREATE
TYPE`s and may land with the tables in Unit 2; only `ALTER TYPE ADD VALUE` on the
existing `OperationType` must be isolated.)
**Tests:** enum-parity test (Prisma ⇄ TS mirror) asserting the five new values.
**Depends on:** none. **Execution note:** test-first for parity.
**Verification:** `prisma validate`; the five values exist in the DB enum; build compiles.

### Unit 2: Schema — bottled-lot state, line discriminator, SKU/run fields, enums
**Goal:** Persist the continuable-bottle state, the count dimension with a sound
discriminator, and finished-good sparkling metadata — as typed enums.
**Files:** `prisma/schema.prisma`, new
`prisma/migrations/<ts>_phase7_bottled_lot_state/migration.sql`.
**Approach:** Add enums + models/fields (DSL):
```
enum SparklingMethod { TRADITIONAL TANK PETNAT }
enum BottleStage     { EN_TIRAGE RIDDLING DISGORGED DOSED }
enum DosageStyle     { BRUT_NATURE EXTRA_BRUT BRUT EXTRA_DRY SEC DEMI_SEC DOUX }
enum LedgerBucket    { VESSEL EXTERNAL BOTTLE_STORAGE }

model BottledLotState {                 // 1:1 chokepoint-folded projection
  lotId         String  @id             // FK → Lot
  bottleCount   Int                     // CHECK >= 0
  nominalFillMl Int     @default(750)
  volumeL       Decimal @db.Decimal(10,2)   // CHECK >= 0
  method        SparklingMethod         // TRADITIONAL | PETNAT (tank never bottled-in-process)
  stage         BottleStage
  tirageAt      DateTime                // materialized, backdatable (aging + legacy seed)
  locationId    String?                 // FK → Location (nullable; physical bin)
  updatedAt     DateTime @updatedAt
}
LotOperationLine += bucket LedgerBucket , bottleDelta Int?
WineSku:  vintage Int -> Int? ; += isNonVintage Boolean @default(false) ,
          method SparklingMethod? , dosageStyle DosageStyle?
BottlingRun    += disgorgedAt DateTime? , dosageGramsPerL Decimal? @db.Decimal(6,2)
BottlingSource: varietyId String -> String? ; vineyardId String -> String?   // K13: blended lots have null origin
<WinerySettings> += sparklingEnabled Boolean @default(false)   // K14 capability gate; confirm exact settings model at /work time
```
Hand-author the migration via the documented Windows/Neon `migrate diff` flow, strip the
phantom `search_vector` diff. **Backfill** `LotOperationLine.bucket` from existing data
(`VESSEL` where `vesselId` not null, else `EXTERNAL`) and leave `bottleDelta` null on all
existing rows. Add by hand (DB-level, D14): `CHECK (bottleCount >= 0)`, `CHECK (volumeL >=
0)`; a **CHECK enforcing** `bucket = 'BOTTLE_STORAGE' ⇔ bottleDelta IS NOT NULL` (and
`bottleDelta IS NULL` otherwise). **NV uniqueness (eng-review):** a nullable `vintage`
breaks `@@unique([name,vintage,bottleSizeMl])` — Postgres treats NULLs as distinct, so NV
runs would create duplicate SKUs and Prisma can't `upsert` on a null compound member. Drop
that unique and replace with **two partial unique indexes**: `UNIQUE(name, vintage,
bottleSizeMl) WHERE vintage IS NOT NULL` and `UNIQUE(name, bottleSizeMl) WHERE
isNonVintage` — so vintaged and NV SKUs each dedupe correctly. **Migration ordering:** U1
(enum) already deployed → this DDL → regen client → callers. Add a clean-DB migration smoke
check to the verify script.
**Tests:** none yet (schema); covered by Units 3–4 + Unit 14.
**Depends on:** Unit 1.
**Verification:** `prisma validate` → `migrate deploy` → stop dev server → `prisma
generate`; generated client exposes new enums/model/fields; constraints reject a
`BOTTLE_STORAGE` line with null `bottleDelta`.

### Unit 3: Pure planners + sugar/style helpers (test-first)
**Goal:** All bottle-phase ledger-line math and winemaking math as pure functions.
**Files:** `src/lib/sparkling/plan.ts`, `src/lib/sparkling/sugar.ts`,
`test/sparkling-plan.test.ts`, `test/sparkling-sugar.test.ts`.
**Approach:** Pure functions mirroring `planBlend`/`planVesselLoss`, all bottle legs
tagged `bucket=BOTTLE_STORAGE` with paired `deltaL`+`bottleDelta`:
- `planTirageBottling(sourceBalances, vesselId, lotId, drawL, bottleCount, nominalFillMl)`
  → `−drawL` VESSEL leg + a BOTTLE_STORAGE leg (`+drawL`, `bottleDelta=+bottleCount`).
- `planDisgorgement({ bottlesDisgorged, perBottleLossMl, sacrificedBottleCount,
  breakageCount })` → volume lost = `perBottleLossMl×bottlesDisgorged` + wine in broken
  bottles; **sacrificial wine is reallocated, not lost** (count down, volume unchanged by
  it); `bottleDelta = −(sacrificed+breakage)`; balanced LOSS to `EXTERNAL`.
- `planDosage({ bottlesDosed, perBottleDoseMl })` → `+addL` BOTTLE_STORAGE leg balanced
  against an `EXTERNAL` counter (an addition source).
- `planBottleSplit(state, tranches[])` → generalize `planBlendSplit` to carry
  `bottleDelta` per destination; parent `−`, child(ren) `+`; count and volume conserved.
- `planFinishHandoff(state)` → close-out legs (`−volumeL`, `bottleDelta=−count`).
Sugar helpers: `tirageSugarForPressure(atm, gPerLPerAtm=4)`, `pressureForSugar(...)`,
`abvBumpForSugar(gPerL)`, `finalRS({ baseRS, tirageSugar, fermentedSugar, doseMl,
liqueurGPerL, bottleMl })`, `doseMlForTargetRS(...)`, `classifyStyle(rsGPerL,
dosageGramsPerL)` where Brut Nature requires `dosageGramsPerL == 0`.
**Tests (input/action/outcome):**
- every planner's lines balance (`assertBalanced`); BOTTLE_STORAGE legs always pair
  `deltaL`+`bottleDelta`.
- tirage 1500 L → 2000×750 mL ⇒ `bottleCount=2000`, `volumeL≈1500`.
- disgorge 2000 × 25 mL ⇒ `volumeL −= 50`, count unchanged; +3 breakage ⇒ `bottleDelta=−3`;
  +40 sacrificial ⇒ `bottleDelta=−40` **without** extra volume loss.
- partial split 2000 → 500 + 1500 conserves count and volume.
- dosage 600 g/L × 15 mL / 750 mL ≈ +12 g/L; classifier lands Extra Dry; `dosageGramsPerL=0`
  ⇒ Brut Nature even when a DOSAGE op exists; style band edges (2.9/3.0, 5.9/6.0, …).
- `finalRS` includes base RS + leftover tirage sugar; `abvBumpForSugar(24)≈1.3`.
**Depends on:** Unit 2. **Execution note:** test-first.
**Verification:** `npm run test` — both suites green.

### Unit 4: Chokepoint fold of `BottledLotState` + reconciliation
**Goal:** Make the bottled-lot projection a deterministic fold **inside** the chokepoint.
**Files:** `src/lib/ledger/write.ts` (extend the projection applier + `WriteOpInput`),
`src/lib/sparkling/projection.ts` (pure fold helpers), `test/sparkling-projection.test.ts`.
**Approach:** Extend `WriteOpInput` with optional `bottleState?: { nominalFillMl, method,
tirageAt, locationId? }` (used only when a BOTTLE_STORAGE line first creates the row).
In the applier, after folding `VesselLot` (write.ts ~L146): read the `BottledLotState`
row(s) for the lots touched by BOTTLE_STORAGE lines with a **plain in-tx `findMany`**
(same as the `vessel_lot` read at write.ts:77 — rely on SERIALIZABLE + `withWriteRetry`,
**no `SELECT FOR UPDATE`**, matching the house pattern), fold `volumeL += Σ deltaL` and
`bottleCount += Σ bottleDelta`, upsert/create (with `bottleState` attrs on first create),
delete at functional zero (both hit ~0 at `FINISH`). Pure `foldBottledLot(lines)` mirrors
it for tests. `assertCountVolumeConsistent(state, tol)` checks the K6 tolerance band.
**Tests:** fold a synthetic sequence (tirage → disgorge → dosage → partial split →
finish); assert the materialized state equals the independent fold; tolerance holds each
step; a BOTTLE_STORAGE write with no `bottleState` on first-create is rejected; a
BOTTLE_STORAGE line with null `bottleDelta` is rejected by the DB CHECK.
**Depends on:** Units 2, 3.
**Verification:** new suite green; fold == projection; **CRITICAL regression:** all
existing `verify-ledger`/`verify-blends`/`verify-ferment`/`verify-bottling` scripts + the
ledger/blend vitest suites still pass (the chokepoint change is additive and must not
alter still-wine behavior).

### Unit 5: `tirageCore` — bulk → en-tirage bottle lot
**Goal:** Bottle a (usually assembled) bulk lot into `BOTTLED_IN_PROCESS`, recording
liqueur de tirage.
**Files:** `src/lib/sparkling/tirage-core.ts`, server action.
**Approach:** Core (no `"use server"`): given source vessel+lot, `drawL`, `bottleCount`,
`nominalFillMl`, method (`TRADITIONAL`\|`PETNAT`), optional liqueur-de-tirage material +
target pressure → within `runLedgerWrite`: (1) optionally record the liqueur as a Phase 3
**ADDITION** (`LotTreatment`, computed sugar via Unit 3, `tirageSugarAddedGpl` stored);
(2) `writeLotOperation(type=TIRAGE, lines=planTirageBottling(...), bottleState={
nominalFillMl, method, tirageAt, locationId })` — the chokepoint creates+folds
`BottledLotState` (`stage=EN_TIRAGE`); (3) transition `form WINE→BOTTLED_IN_PROCESS`
(state machine + `LotStateEvent`); (4) set `afState=ACTIVE`. Idempotency via `commandId`
(Phase 6) on the action. Assemblage is a *prior* `blendLotsCore` call.
**Tests:** form change, `BottledLotState` created with right count/volume/tirageAt,
ADDITION treatment + `tirageSugarAddedGpl` recorded.
**Depends on:** Units 3, 4.
**Verification:** scripted tirage yields the expected projection + timeline entry.

### Unit 6: `riddlingCore` — zero-volume work step
**Goal:** Log riddling/remuage without touching volume or count.
**Files:** `src/lib/sparkling/riddling-core.ts`, action.
**Approach:** `writeLotOperation(type=RIDDLING, lines=[])` + `LotTreatment{ kind:"RIDDLING",
method: pupitre|gyropalette, durationMin/days, note }`; set `stage=RIDDLING`. No
volume/count change. **UI is an inline one-tap quick-log (K15), not a standalone form.**
**Tests:** RIDDLING op with no lines, treatment row, unchanged state.
**Depends on:** Units 4, 5.
**Verification:** riddling on the timeline; state volume/count unchanged.

### Unit 7: `disgorgementCore` — full + partial (split), sacrificial-aware
> Units 7–9 are three modular cores surfaced by **one** "Disgorge & finish" capture flow
> (K15/Unit 12), exactly as `crush-core`/`press-core` sit under one combined page. The
> flow calls them in sequence (disgorge → dose → finish); the "advanced: disgorge only"
> escape calls just this one.
**Goal:** Eject the lees plug as a per-bottle volume LOSS; partial disgorgement splits.
**Files:** `src/lib/sparkling/disgorgement-core.ts`, action.
**Approach:** Inputs: `bottlesDisgorged`, `perBottleLossMl` (method default, overridable),
`sacrificedBottleCount?`, `breakageCount?`, method (glace/volée), `disgorgedAt`,
`disgorgementRunId`. Optional: prompt/record a Phase 4 **pre-dosage RS measurement**.
- **Full** (all remaining bottles): `writeLotOperation(type=DISGORGEMENT,
  lines=planDisgorgement(...))`; `LotTreatment{ kind:"DISGORGEMENT", method,
  perBottleLossMl, sacrificedBottleCount }`; chokepoint folds volume/count down;
  `stage=DISGORGED`; set child/lot `disgorgedAt`.
- **Partial** (a tranche): first `planBottleSplit` peels a **NEW disgorged child lot**
  (K4; `LotLineage.kind="SPLIT"`, own code + `BottledLotState` + `disgorgementRunId`),
  then apply DISGORGEMENT to that child; the parent retains identity with reduced
  count/volume and `stage` back to `EN_TIRAGE`.
Correction strategy in Unit 11.
**Tests:** full (volume drop; breakage vs sacrificial count effects; sacrificial adds no
extra volume loss); partial (child created, sums conserve, SPLIT lineage, parent reduced);
disgorge > present ⇒ rejected.
**Depends on:** Units 3, 4, 5.
**Verification:** scripted partial disgorgement ⇒ parent + disgorged child with correct
counts/volumes + a SPLIT edge + `disgorgementRunId`.

### Unit 8: `dosageCore` — liqueur d'expédition + style
**Goal:** Add dosage volume back, compute residual sugar off measured base + EU style.
**Files:** `src/lib/sparkling/dosage-core.ts`, action.
**Approach:** Inputs: `bottlesDosed`, `perBottleDoseMl` (or a target style → dose via
Unit 3), liqueur material + `liqueurGPerL`, optional measured pre-dosage RS.
`writeLotOperation(type=DOSAGE, lines=planDosage(...))` (+volume) + a Phase 3 **ADDITION**
`LotTreatment` for the liqueur (sugar mass). Compute `finalRS` (base + leftover tirage +
dosage) and `classifyStyle(finalRS, dosageGramsPerL)`; persist the resulting
`dosageStyle` on the (child) lot state and the **actual `dosageGramsPerL`** for carry to
`BottlingRun` at finalize; `stage=DOSED`. Brut Nature only when `dosageGramsPerL == 0`.
**Tests:** RS bump math off a non-zero base RS; style assignment incl. Brut Nature at
`dosageGramsPerL=0` with a real DOSAGE op; volume rises by `doseMl×bottles`; tolerance
holds.
**Depends on:** Units 3, 4, 7.
**Verification:** scripted dosage sets style + restores per-bottle fill toward nominal.

### Unit 9: `finalizeSparklingCore` + shared finished-goods core
**Goal:** Turn the dosed/corked in-process lot into a sellable `WineSku` via one shared
materialization path.
**Files:** `src/lib/bottling/materialize.ts` (new shared core, extracted from
`applyBottling`), `src/lib/sparkling/finalize-core.ts`, refactor `src/lib/bottling/run.ts`
to call the shared core.
**Approach:** Extract the finished-goods **tail** of `applyBottling` (run.ts:68-119) into
`materializeFinishedGoods(tx, { skuName, vintage|null, isNonVintage, method, dosageStyle,
bottleSizeMl, bottlesProduced, volumeConsumedL, sources:[{ lotId, varietyId?, vineyardId?,
vintage?, volumeConsumedL }], destinationLocationId, runMeta, actor })` — **parameterizing
`bottleSizeMl` and `volumeConsumedL`** (still wine derives via `consumedForBottles`/750,
sparkling passes actual `nominalFillMl` + `BottledLotState.volumeL`). Refactor
`applyBottling` to build its vessel-draw `sources[]` then call the helper (behavior
unchanged — guarded by a characterization test). SKU creation is **find-or-create keyed
by the right partial index** (NV ⇒ `(name,bottleSizeMl,isNonVintage)`, not a compound
upsert on null `vintage` — K11). `finalizeSparklingCore`: within `runLedgerWrite` → (1)
`writeLotOperation(type=FINISH, lines=planFinishHandoff(state))` closing bottle storage;
(2) `materializeFinishedGoods(...)` with one source `{ lotId (required), varietyId:null,
vineyardId:null }` (K13), `BottlingRun` carrying batch `disgorgedAt` + actual
`dosageGramsPerL`; (3) `form BOTTLED_IN_PROCESS→FINISHED` (state machine + `LotStateEvent`);
close `BottledLotState`. Finalize operates on a **disgorged+dosed child lot** (or a fully
disgorged single lot) → one `BottlingRun` per finalize; multiple tranches → multiple runs
under one SKU. Idempotent via `commandId` (Phase 6). **Pét-nat:** allow `FINISH` directly
from `EN_TIRAGE` when `method=PETNAT` (no disgorge/dosage required); style may be null
(sur lie).
**Tests:** **CRITICAL characterization/regression** — `applyBottling` output (SKU, run,
sources, stock, inventory, ledger op) byte-identical before/after the extraction on a seeded
still-wine bottling. Sparkling finalize: creates SKU (method/style; **NV ⇒ null vintage +
`isNonVintage`**, and a second NV run of the same wine reuses the SKU — no duplicate), a
required `BottlingSource.lotId` with **null variety/vineyard for a blended lot** (no FK
violation), right `bottlesProduced`/`volumeConsumedL`, inventory rows; lot `FINISHED`;
`BottledLotState` closed; pét-nat finalize sur lie succeeds with no dosage; finalize when
`bottleCount`/`volumeL` already zero is rejected.
**Depends on:** Units 4, 8.
**Verification:** finished SKU queryable through the lineage DAG back to the assemblage;
inventory reflects the count; still-wine bottling unchanged.

### Unit 10: Tank method (Charmat, bulk) + pét-nat variants
**Goal:** Prove the simpler styles ride existing primitives with minimal new surface.
**Files:** thin wiring; `scripts/verify-sparkling.ts` cases; docs note.
**Approach:**
- **Tank method — stays BULK (council CRITICAL #3):** the lot remains `LotForm.WINE` in a
  pressurized **tank vessel**; tirage sugar/yeast = a normal **ADDITION** to the tank;
  secondary ferment = Phase 6 `afState ACTIVE→DRY`; dosage (if any) = an ADDITION to the
  tank; final isobaric bottling = the **existing `applyBottling`** (now on the shared
  core) with `WineSku.method=TANK`, style from tank RS. **No `BottledLotState`.**
- **Pét-nat:** `tirageCore` with **no liqueur** (`method=PETNAT`), `afState=ACTIVE`
  carried into the bottle; disgorgement + dosage **optional/absent**; finalize allowed
  from `EN_TIRAGE` (sur lie), style null.
**Tests:** a tank-method case (never bottled-in-process; finished SKU + style) and a
pét-nat case (bottled mid-ferment; finalize sur lie without disgorge/dosage).
**Depends on:** Units 5, 9.
**Verification:** both variants run clean in `verify-sparkling.ts`.

### Unit 11: Corrections for bottle-phase ops (D6/D15)
**Goal:** Make sparkling ops correctable without corrupting lineage — including bottle
positions.
**Files:** additions to each core; extend the correction/guard utilities.
**Approach:** Extend the D15 guard so **`BOTTLE_STORAGE` positions (bottled volume +
`bottleDelta`)** are guarded exactly like vessel positions: a correction is blocked if any
later non-correction op touched the lot's bottle positions. Volumetric bottle ops
(TIRAGE/DISGORGEMENT/DOSAGE/FINISH) correct via **compensating operations**; zero-volume
RIDDLING corrects via **void** (`voidedByOperationId`). A partial-disgorgement split
correction follows the Phase 5 blend-correction rules (return the child's bottles/volume
to the parent, mark the child CORRECTED, keep for audit). **Finalize reversal** mirrors
the existing `reverseBottlingTx` (run.ts:128): require the produced bottles still on hand
at the destination (else block), reverse `StockMovement`/`BottledInventory` + delete the
`BottlingRun`, then a compensating `FINISH`-inverse **reopens `BottledLotState`** and moves
`form FINISHED→BOTTLED_IN_PROCESS`. The chokepoint re-folds `BottledLotState` on every
correction.
**Tests:** correct a dosage (reverses volume + clears style); guard **blocks** correcting
a disgorgement after a later dosage; void a riddling; correction re-folds bottle state;
finalize reversal blocked when bottles already sold, and on success reopens the bottle lot.
**Depends on:** Units 5–9.
**Verification:** corrections re-fold to the pre-op state where allowed; blocked where
downstream bottle activity exists.

### Unit 12: UI — settings gate, En Tirage worklist, in-process panel + actions
**Goal:** A real capture/review surface for the continuable bottle lifecycle, gated
behind an opt-in Setting, with a dedicated worklist for running a sparkling program.
**Files:** a winery-Setting toggle in the existing Settings surface; a new
`src/app/(app)/cellar/en-tirage/` (worklist) route; `src/app/(app)/lots/[id]/`
(in-process panel); new sparkling action components; a tirage vessel-action near the
existing cellar capture UI (vessel-first, D12). `DESIGN.md` tokens only (no hardcoded
color/font/spacing); Next 16 App Router (`params`/`searchParams` are Promises — read
`node_modules/next/dist/docs/` per AGENTS.md).
**Approach:**
- **Capability gate (K14):** add a winery-level `sparklingEnabled` Setting (default off).
  A single server-side helper gates the nav entry, the En Tirage route, the tirage
  vessel-action, and the in-process panel/actions. Off → none of it renders (and the
  routes 404/redirect); on → the full flow appears. Backend enums/cores are inert when
  unused.
- **En Tirage worklist** (dedicated surface): a table of all `BOTTLED_IN_PROCESS` lots —
  columns lot code, bottle count, months-on-lees (from `tirageAt`), stage, `afState`,
  location, next action — sortable/filterable, default sort "ready to disgorge (≥ X
  months on lees)". Row action → the lot's in-process panel. Uses `tabular-nums` for all
  counts/volumes/months (DESIGN.md), the `Eyebrow` label pattern, wine `--accent` only
  for the primary CTA; **stage rendered as a compact stepper** (en tirage → riddling →
  disgorged → dosed → finished) using semantic/editorial hues, not the wine accent.
- **In-process panel** (on lot detail): primary line = bottle count + stage stepper;
  secondary = volume + per-bottle fill + `afState` + months-on-lees + settable
  **location**. A **vessel↔bottle cross-link + a tirage summary** ("1,500 L from Tank 3
  → 2,000 × 750 mL en tirage on {date}") so the moment bulk *disappears from the vessel*
  is legible, not confusing. Lineage view shows disgorged children peeled off the parent.
- **Actions — consolidated to two forms (K15):**
  - **Tirage** (vessel-first): draw L, count, format, target pressure → suggested tirage
    sugar; writes the liqueur ADDITION + TIRAGE + form change in one go (Unit 5).
  - **Disgorge & finish** (one flow, launched from a worklist row or the panel): tranche
    count → live **preview** ("disgorges 500, splits off new child lot {preview code},
    leaves 1,500 en tirage; ~25 mL/bottle loss") + sacrificial/breakage inputs → **dose**
    (mL or target style → suggested dose; **live style chip** = computed RS + EU band, a
    ±3 g/L band-edge caution, "Brut Nature (0 g/L)" when dose is zero) → **finish**
    (destination, SKU name, **NV toggle**) → one confirm (D10). Under the hood it writes
    the distinct DISGORGEMENT + DOSAGE + FINISH ops in sequence. An **"advanced: disgorge
    only / dose later"** escape splits the flow for late-disgorged / hold-on-cork wines
    (and pét-nat, which finishes with no disgorge/dosage).
  - **Riddling** is an **inline one-tap quick-log** on the panel / worklist row (mark
    riddling started/done), not a standalone form.
- **Confirm-before-write** on lineage-mutating actions (disgorge-split, finalize) per D10.
- **Interaction states** (spec, not backend):

  | Surface | Loading | Empty | Error | Success | Partial |
  |---------|---------|-------|-------|---------|---------|
  | En Tirage worklist | skeleton rows | warm empty: "No wines en tirage yet" + (if enabled) a "Start a tirage" hint pointing to the vessel action | inline retry banner | new row appears after tirage | rows mid-arc show the stepper at their stage |
  | In-process panel | skeleton | n/a (only shows for in-process lots) | field-level + toast | "Logged · Undo" toast (Phase 4/6 pattern) | after a partial disgorge, panel shows reduced count + a child link |
  | Disgorge & finish flow (from worklist row) | disabled submit + spinner | n/a | validation inline (e.g. disgorge > present) | toast + optimistic panel update; child link if partial | tranche preview + advanced "disgorge only" branch before confirm |
  | Settings toggle | — | — | — | toggling on reveals nav + routes immediately | — |

**Tests:** component/interaction tests where the project has them (gate hides/show;
tranche preview math; style chip bands; NV toggle); otherwise the manual QA steps below.
**Depends on:** Units 5–9.
**Verification:** with `sparklingEnabled` off, no sparkling UI anywhere; toggle on →
drive the full arc from the En Tirage worklist + a lot on a seeded lot.

### Unit 13: Timeline rendering for sparkling ops
**Goal:** The lot timeline reads the sparkling arc clearly.
**Files:** `src/lib/lot/` describe helpers; timeline render in `src/app/(app)/lots/[id]/`.
**Approach:** Extend `describeOperation` for `TIRAGE` (bottled N×fmt, +liqueur, tirage
sugar), `RIDDLING`, `DISGORGEMENT` (−mL/bottle, sacrificial/breakage, split→child code +
`disgorgementRunId`), `DOSAGE` (style, g/L), `FINISH` (→ SKU). Show bottle-count and
volume deltas (`tabular-nums`); link disgorged child lots; render stage transitions with
DESIGN.md semantic/editorial hues (not the wine accent), consistent with the worklist
stepper. Order by `LotOperation.id` (Phase 2).
**Tests:** derivation tests for each new op summary.
**Depends on:** Units 5–9.
**Verification:** the Unit 14 run reads end-to-end with correct numbers.

### Unit 14: `scripts/verify-sparkling.ts` — integration proof (the exit criteria)
**Goal:** Prove the ROADMAP exit end-to-end.
**Files:** `scripts/verify-sparkling.ts`.
**Approach:** Seed two base lots of different vintages → `blendLotsCore` assemblage
(multi-vintage) → `tirageCore` (1500 L → 2000 × 750 mL, +24 g/L tirage sugar,
`tirageAt`) → `afState ACTIVE→DRY` (assert advisory ABV bump) → `riddlingCore` →
**partial** `disgorgementCore` (500 bottles, ~25 mL/bottle, some sacrificial → disgorged
child + `disgorgementRunId`) → `dosageCore` (target Brut ~9 g/L off a measured base RS) →
`finalizeSparklingCore` → assert: child lineage to the assemblage, parent still en tirage
with 1500 bottles, finished SKU style=Brut + **NV (null vintage + `isNonVintage`)** with a
**required** `BottlingSource.lotId`, and count↔volume tolerance holds at every step. Also
run tank-method (bulk, never bottled-in-process) and pét-nat (finalize sur lie) cases, and
a clean-DB migration smoke check. Run with `tsx --env-file=.env`.
**Tests:** the script is the test; non-zero exit on any assertion failure.
**Depends on:** all prior units.
**Verification:** `tsx --env-file=.env scripts/verify-sparkling.ts` prints a clean pass.

## Test Strategy

**Unit tests (vitest, pure):** planners + sugar/style (Unit 3), chokepoint fold +
tolerance reconciliation (Unit 4), op-description derivations (Unit 13). Pattern follows
`test/ledger-math.test.ts` / `test/blend-math.test.ts`.

**Core/integration tests:** each core (Units 5–9, 11) against seeded data; the headline
proof is `scripts/verify-sparkling.ts` (Unit 14) covering traditional + tank + pét-nat +
a clean-DB migration smoke check. Cores are import-safe (split from `"use server"`).

**Manual verification (Unit 12 UI):** on a seeded assembled lot walk Tirage → Riddling →
partial Disgorge (sacrificial + breakage) → Dosage → Finalize; confirm count, volume,
per-bottle fill, months-on-lees, style chip (incl. Brut-Nature-at-0), location, lineage
children, and the resulting SKU/inventory (NV toggle); DESIGN.md tokens; ≥44px touch
targets.

**Regression (CRITICAL — eng-review IRON rule):** a **characterization test** on still-wine
`applyBottling` (SKU/run/sources/stock/inventory/ledger op identical before/after the
`materializeFinishedGoods` extraction); all existing `verify-*.ts` (ledger, blends, ferment,
bottling) + vitest suites must pass after the `write.ts` chokepoint change (additive fold)
and the `WineSku` unique-index change. Explicit added cases: NV SKU dedupe (two NV runs, one
SKU), blended-lot finalize with **null** `BottlingSource` origin (no FK violation), and
zero-count/zero-volume mid-process rejection.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Extending the `writeLotOperation` chokepoint to fold a second projection introduces a regression in the hot write path | MED | HIGH | Additive fold behind BOTTLE_STORAGE lines only; canonical row-lock; Unit 4 asserts fold==projection; **all existing verify scripts must pass** before merge. |
| `bucket`/`bottleDelta` backfill or the `bucket⇔bottleDelta` constraint wrong on existing rows | MED | HIGH | Deterministic backfill (`VESSEL`/`EXTERNAL` from `vesselId`); DB CHECK enforces the pairing; migration smoke check on a clean DB in Unit 14. |
| Postgres `ALTER TYPE ADD VALUE` used in the same migration that references it | MED | HIGH | Unit 1 is enum-only, deployed before any consumer (D4 procedure). |
| Sacrificial-bottle / tolerance math lets real count↔volume drift hide | MED | MED | Explicit `sacrificedBottleCount` vs `disgorgementLossL`; tolerance band asserted every step in Unit 14; UI surfaces per-bottle fill. |
| Nullable `WineSku.vintage` + unique-key change breaks existing SKU queries/constraints | MED | MED | Recreate the unique index for null vintage; audit still-wine call sites; regression via `applyBottling` tests. |
| Shared materialization core refactor changes still-wine bottling behavior | MED | MED | Extract-and-delegate (no behavior change); characterization test on `applyBottling` before/after. |
| `BottlingSource` FK violation for blended (null-origin) lots — latent today (`?? ""` at run.ts:93-95) | MED | HIGH | K13: nullable `varietyId`/`vineyardId`; provenance via required `lotId` + lineage; test blended-lot finalize. |
| NV SKU duplicates from nullable `vintage` in a unique index (Postgres treats NULLs distinct) | MED | MED | Two partial unique indexes (vintaged vs `isNonVintage`); NV find-or-create instead of compound upsert; dedupe test. |
| Windows/Neon migration friction (phantom `search_vector`, interactive `migrate dev`) | HIGH | LOW | Documented `migrate diff` → strip → `deploy` → stop dev → `generate` flow. |
| Worktree behind `main` by Phase 6 → planning against stale files | LOW | MED | `/work` runs on `main`; verify Phase 6 state-machine entry points before Unit 5. |
| Scope creep into supplies/cost (Phase 8) or bin management | MED | MED | Tirage/dosage are clean ADDITIONs; location is a nullable pointer only; cost + bin CRUD explicitly out of scope. |

## Success Criteria

- [ ] A lot moves `WINE → BOTTLED_IN_PROCESS → FINISHED`, accruing TIRAGE/RIDDLING/
      DISGORGEMENT/DOSAGE/FINISH ops in between.
- [ ] `BottledLotState` materializes bottle count **and** volume, **folded inside the
      chokepoint**, equal to the ledger fold, with the tolerance reconciliation holding
      after every op (incl. sacrificial bottles).
- [ ] Bottle-storage legs carry `bucket=BOTTLE_STORAGE` + `bottleDelta`; the DB rejects a
      BOTTLE_STORAGE line with null `bottleDelta` and vice-versa.
- [ ] Assemblage is a `BLEND` (multi-vintage), tirage/dosage are `ADDITION`s, full
      disgorgement is a `LOSS`, **partial disgorgement is a `SPLIT`** producing a disgorged
      child lot with its own date/style + `SPLIT` lineage + `disgorgementRunId`.
- [ ] Dosage sets the EU style (Brut Nature iff `dosageGramsPerL == 0`) off a measured
      base RS and stores actual g/L on the `BottlingRun`.
- [ ] Finalize goes through the **shared materialization core** and produces a `WineSku`
      (method + style; NV ⇒ null vintage + `isNonVintage`) via `BottlingRun` + a
      **required** `BottlingSource.lotId` + inventory, traceable through the DAG.
- [ ] Tank method stays a bulk `WINE` lot (never bottled-in-process) and finishes via
      `applyBottling`; pét-nat finalizes sur lie without disgorge/dosage.
- [ ] Correction guard covers bottle positions; corrections re-fold bottle state.
- [ ] `scripts/verify-sparkling.ts` passes (traditional + tank + pét-nat + migration
      smoke).
- [ ] New `OperationType` values shipped in an isolated migration.
- [ ] With `sparklingEnabled` **off**, no sparkling UI/nav renders anywhere; toggling it
      **on** reveals the flow + the En Tirage worklist.
- [ ] The sparkling action surface is **two forms** (Tirage + Disgorge-&-finish) + an
      inline riddling log, launched from the En Tirage worklist (K15); the combined flow
      writes distinct DISGORGEMENT/DOSAGE/FINISH ops and offers the "disgorge only" escape.
- [ ] UI drives the full arc from the En Tirage worklist + lot panel (incl. location +
      months-on-lees + partial-tranche preview + live style chip); DESIGN.md tokens +
      `tabular-nums`; lineage-mutating ops confirm before write (D10); vessel↔bottle
      cross-link makes the "bulk → bottles" moment legible.
- [ ] All existing tests/verify scripts pass; still-wine bottling unchanged.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Council (cross-LLM) | `/council` | Adversarial plan review (Gemini + Codex) | 1 | ✅ done | 6 CRITICAL + 9 SHOULD-FIX folded (rev 2); 2 forks resolved (K11 NV vintage, K12 bottle location) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ✅ CLEAR | Grounded in write.ts + run.ts (rev 3). Chokepoint fold sound (locking corrected to house pattern); 2 latent bugs found + folded (K13 BottlingSource null-origin FK; NV unique-index hole); tail-extraction precision; regression/characterization tests added; 1 fork resolved (extract & share) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ✅ done | Calibrated to DESIGN.md (rev 4). IA 5→9, states 4→9, journey 6→9, AI-slop 8→9. Folded: capability gate (K14), dedicated En Tirage worklist, interaction-states table, tranche preview, live style chip, vessel↔bottle "bulk disappears" cross-link, tabular-nums + semantic-hue stage stepper. 1 fork resolved (worklist + Settings toggle) |

**Council fold summary (rev 2):**
- CRITICAL: chokepoint owns the `BottledLotState` fold (K2/U4); `bucket=BOTTLE_STORAGE`
  discriminator replaces null-vessel abuse (K3/U2); tank method stays bulk, no
  `BottledLotState` (K1/U10); sacrificial-bottle handling + relaxed K6 tolerance (U7);
  `disgorgedAt`/actual `dosageGramsPerL` moved to `BottlingRun`, `dosageStyle` on SKU
  (K8/U9); shared `materializeFinishedGoods` core for both bottling paths (K8/U9).
- SHOULD-FIX: typed enums + parity (U2); `bottleDelta` tied to the discriminator w/ DB
  constraint (U2); `disgorgementRunId` grouping (K4/U7); correction guard covers bottle
  positions (U11); richer sugar math off measured base RS + ABV bump (K10/U3/U5/U8);
  Brut Nature ⇔ 0 g/L (K10/U8); pét-nat finalize from EN_TIRAGE (U9/U10); materialized
  backdatable `tirageAt` (K9/U2); migration ordering + clean-DB smoke (U1/U2/U14); bless
  `BottlingRun` as the generic finished-goods record (K8).
- FORKS (user-decided): K11 NV = nullable `vintage` + `isNonVintage`; K12 = nullable
  `locationId` on `BottledLotState`.

**Eng-review fold summary (rev 3):** chokepoint bottle-fold uses the house SERIALIZABLE +
retry pattern, no bespoke locking (K2/U4); `materializeFinishedGoods` extracted as the
*tail* of `applyBottling`, parameterized volume + `bottleSizeMl`, guarded by a
characterization test (K8/U9); **K13** `BottlingSource.varietyId`/`vineyardId` nullable
(fixes a latent blended-lot FK bug); NV unique-index hole fixed via two partial indexes +
find-or-create (U2/U9); finalize reversal added (U11); regression + NV-dedupe +
null-origin + zero-edge tests added. One fork resolved: extract & share the bottling core.

**Eng-review required outputs:**
- *What already exists (reused, not rebuilt):* `writeLotOperation` chokepoint + `runLedgerWrite`
  (extended, not replaced); `planBlend`/`planBlendSplit`/`blendLotsCore` (assemblage + the
  disgorgement split); `addAdditionCore`/`CellarMaterial` (tirage/dosage); `recordLossCore`
  (disgorgement); `applyBottling` tail (shared for finalize); Phase 6 `LotStateEvent` +
  transition validator (form changes) + `afState` (2nd ferment); Phase 4 records (in-bottle
  observations); `Location` model (K12).
- *NOT in scope:* supplies inventory/cost (Phase 8), work orders (Phase 9), assistant/voice
  (Phase 10), cellar-bin management CRUD, mixed formats per batch, per-bottle rows, legacy
  sparkling backfill (all with rationale in Scope Boundaries).
- *Parallelization:* U1→U2 sequential (schema). Then two lanes: **Lane A** (pure) U3→U4→U13
  = `src/lib/sparkling/*` + `src/lib/ledger/write.ts`; **Lane B** (finished-goods) the
  `materializeFinishedGoods` extraction + `src/lib/bottling/*` refactor. Cores U5→U8 depend
  on U4 (sequential, shared `src/lib/sparkling/`). U9 needs both lanes. U10–U12 after cores;
  U14 last. Conflict flag: U4 and Lane B both approach the ledger/bottling seam — merge U4
  first.

**Design-review fold summary (rev 4):** capability gate **K14** (`sparklingEnabled`
Setting, default off — the whole flow is invisible unless a winery turns it on); a
dedicated **En Tirage worklist** (Unit 12) sorted by months-on-lees / ready-to-disgorge;
an interaction-states table (loading/empty/error/undo/partial); the partial-disgorge
**tranche preview** (shows the child lot it will split off, per D10 confirm); the live
dosage **style chip** with ±3 g/L band-edge caution + Brut-Nature-at-0; a vessel↔bottle
cross-link + tirage summary so the "bulk disappears into bottles" moment is legible;
`tabular-nums` for all figures; a stage **stepper** in semantic/editorial hues (wine
accent reserved for the primary CTA). *Design NOT-in-scope:* cellar-bin management CRUD
(K12 is a nullable pointer only); mockups (backend-heavy plan, DESIGN.md is authoritative
+ the styleguide route exists). *Reuses:* DESIGN.md tokens, `Eyebrow`, the Phase 4/6
"Logged · Undo" toast, the Phase 2 lot detail + lineage view, the existing Settings + `Location`.

**Post-review consolidation (rev 5, K15):** capture surface reduced from 5 action forms to
**2** (Tirage + Disgorge-&-finish) + an inline riddling log + worklist-as-hub — the
crush+press-merge pattern applied to disgorge/dose/finalize. Ledger ops stay distinct;
cores stay modular; an "advanced: disgorge only" escape preserves late-disgorged wines.

**VERDICT:** Council + Eng Review + Design Review all CLEARED. Every CRITICAL + SHOULD-FIX
folded; 6 genuine forks resolved by the user (NV vintage, bottle location, extract-&-share
bottling core, En Tirage worklist, sparkling capability toggle, capture consolidation).
**Plan is fully reviewed + consolidated (rev 5) and ready for `/work` on `main`.**
