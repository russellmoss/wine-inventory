---
title: Cellar Operations (Phase 3)
type: feat
status: completed
date: 2026-06-27
branch: claude/zen-chebyshev-b2195e
depth: deep
units: 10
---

## Overview

Generalize the ledger to the rest of the cellar, with floor-fast vessel-first capture.
After this phase the winemaker can record the daily reality of winemaking — additions
(SO₂, nutrients, acid, tannin, fining agents), topping, filtration, loss/angel's share,
and cap management (pump-over/punch-down) — as first-class, correctable ledger operations,
including **group actions** that apply one operation across a whole barrel group, and
**additions math** that turns a dictated rate (g/hL, ppm…) into a computed total from the
vessel's current volume. Every write goes through the Phase 1 chokepoint; no new write path.

## Problem Frame

Phase 1 + 2 gave wine a durable identity, an append-only ledger, and a timeline to read it.
But the ledger only knows how to move liters (rack/bottle/seed). The *daily* cellar reality
— "added 40 ppm SO₂ to Tank 4", "topped all 60 Cabernet barrels", "fined with bentonite",
"lost 8 L to evaporation" — is unrecorded. Without it the traceability story has holes and
Phase 8 cost roll-up has nothing to roll up. This is the first **write-side capture** phase:
it makes the system something a cellar hand actually uses during harvest, not just a record
they read afterward.

**Product pressure test (noted, not blocking):** right problem — these operations ARE the
job. The risk is over-building bespoke UIs per op; the mitigation is that they're all the
same shape (a `LotOperation` through the chokepoint + an optional `LotTreatment` detail +
optional volumetric lines), differing mostly in volume effect and which fields the form
shows. Simpler 80/20 framing baked in: one shared "log a cellar operation" surface with a
few typed variants, not ten hand-built screens. User = winemaker/cellar hand; job = record
what they did to the wine, fast, from the vessel they're standing at (D12), one tap, no
work-order ceremony (work orders are Phase 9).

## Requirements

- MUST route every operation through `writeLotOperation` (the Phase 1 chokepoint) — no new
  write path (D2/D14: SERIALIZABLE, DB constraints, provenance preserved).
- MUST add new operation types as **controlled enum values** (D4): `ADDITION`, `TOPPING`,
  `FINING`, `FILTRATION`, `CAP_MGMT`. (`LOSS` already exists — reuse it for angel's share.)
- MUST model **volume-neutral** ops (additions, fining, cap management) as a `LotOperation`
  + a `LotTreatment` detail row with **no volumetric lines** (`deltaL <> 0` forbids zero
  lines); volume-changing ops (topping, filtration loss, loss) also carry lines.
- MUST compute addition totals from rate × current vessel volume and **store the rate, the
  basis, the computed total, AND the volume snapshot** used (recompute-on-read corrupts
  history). Bases: `G_HL`, `MG_L` (=ppm), `G_L`, `ML_L`.
- MUST implement **group fan-out** (D13) on the existing `VesselGroup`/`VesselGroupMember`
  schema: one logical action → one op per member vessel, sharing a `batchId`, each
  independently capacity-checked and correctable; **exceptions** (empty/wrong/skip) recorded
  per vessel without failing the whole batch.
- MUST treat **topping** as a transfer from a keg lot into the target(s) with lineage
  appended (not an addition).
- MUST make every op **correctable** (D6/D15): volumetric ops via the existing
  `planCorrection` guard; neutral treatment ops via a void/correction event.
- MUST surface capture **vessel-first** (D12): one-tap ad-hoc actions on the vessel surface,
  with capture provenance (`captureMethod`, observed/entered, who) per op (D14).
- MUST extend the Phase 2 lot timeline to render treatment events + the new op types.
- SHOULD provide a light **`CellarMaterial`** catalog (upsert-on-first-use, `FieldInput`
  pattern) with a default basis per material; cost/inventory deferred to Phase 8.
- SHOULD support **exceptions** as first-class outcomes on group actions.
- NICE: a live additions-math preview in the form (rate → grams as you type).

## Scope Boundaries

**In scope:** the operation types above; `LotTreatment` + `CellarMaterial` schema; additions
math; group CRUD + fan-out; topping; correction across the new ops; the vessel-first capture
UI; timeline rendering of the new ops.

**Out of scope (and why):**
- **Supplies inventory + stock draw-down + costing** — Phase 8. Additions record what/how-
  much/basis now; Phase 8 attaches inventory consumption + cost to those existing records.
- **Work orders** (create → assign → auto-log on completion) — Phase 9. Phase 3 ops are
  ad-hoc/quick-log; never require a work order first.
- **Chemistry/tasting records** (pH, TA, free/molecular SO₂, tasting notes) — Phase 4.
  SO₂ additions here are rate-only; molecular SO₂ (pH-dependent) is Phase 4.
- **Fermentation logging / crush-press / Round bulk-entry** — Phase 6.
- **Hard offline/queue-and-sync** — acknowledged cross-cutting, but the roadmap defers the
  real implementation to Phase 6's heavy floor surface. Forms here must not lose data on a
  failed submit (clear error + retry), but no offline queue is built.
- **Blends originating new lots** — Phase 5 (topping is a micro-merge via lineage, but no
  new blend-lot creation here).

## Research Summary

### Codebase Patterns
- **Chokepoint:** `src/lib/ledger/write.ts` — `writeLotOperation(tx, WriteOpInput)` (balance
  assert, fold into `VesselLot`, capacity guard, `vessel_component` sync, audit), wrapped by
  `runLedgerWrite` (SERIALIZABLE + `withWriteRetry`). A **zero-line op is valid** (empty
  balance, no projection change) — this is how neutral ops attach.
- **Op-write templates:** `src/lib/vessels/rack-core.ts` (rack + `planCorrection` + a
  read-model + `transfer.ts` "use server" wrapper), `src/lib/bulk/actions.ts` (SEED/ADJUST/
  DEPLETE build `LedgerLine`s + call the chokepoint), `src/lib/bottling/run.ts` (BOTTLE).
- **Math:** `src/lib/ledger/math.ts` (`LedgerLine`, `planLedgerRack`, `planCorrection`,
  `foldLines`, `balanceKey`, `FUNCTIONAL_ZERO_L`); `src/lib/bottling/draw.ts`
  (`computeProportionalDraw`, `round2`). `src/lib/ledger/vocabulary.ts` (`OPERATION_TYPES`,
  `LINE_REASONS`).
- **Enum/migration:** `OperationType` enum at `prisma/schema.prisma:~701`; the lot-codes
  feature shows the migration pattern. **Gotcha:** Postgres `ALTER TYPE … ADD VALUE` can't
  run in a txn and a new value can't be used in the same migration that adds it — add the
  enum values in their own migration step.
- **Material catalog precedent:** `FieldInput` + `src/lib/fieldnotes/input-actions.ts`
  (`listFieldInputs`, `addFieldInput` upsert-on-first-use, dedup by `normalizedKey`).
- **Groups:** `VesselGroup` + `VesselGroupMember` exist, **zero code uses them** — Phase 3
  builds the fan-out on this schema, no schema change for the group spine.
- **Capture UI:** `src/app/(app)/bulk/BulkClient.tsx` (per-vessel modal, contents table, add-
  wine form, `run()`/`useTransition` + error state), `src/components/ui/` (`Modal`, `Input`,
  `Button`, `ConfirmButton`, `Badge`). Lot timeline: `src/app/(app)/lots/[id]/`.
- **Lineage:** `LotLineage(parentLotId, childLotId, fraction, kind)` exists, structure-only —
  topping is its first real use.
- **Tests:** vitest pure-math (`test/ledger-math.test.ts`); live-DB scripts via
  `npx tsx --env-file=.env scripts/verify-*.ts`.

### Prior Learnings
- context-ledger empty, rstack CLI unavailable → `VISION.md §11` + `ROADMAP.md` authoritative.
- D7 already gives `LOSS` + external `reason:"loss"` lines — don't redefine angel's share.
- D15 gets harder: correcting a group op or a topping fan-out touches many positions at once;
  the guard must consider all of them.

### External (winemaking domain)
- Rate→total: `g/hL`→`rate*V/100`; `mg/L`(=ppm)→`rate*V/1000`; `g/L`→`rate*V`; `mL/L`→`rate*V`.
  `1 g/hL = 10 mg/L = 10 ppm`. `%` is a material property, not a dose basis (omit as a basis).
- Volume effect: dry/most liquid additions = **neutral**; fining = neutral (loss comes later
  at racking); filtration = small **loss** (~1%); evaporation/angel's share = **loss**;
  topping = **adds** (transfer from keg); cap management = neutral (zero-data).
- Addition record needs a **volume snapshot** + material; SO₂ rate-only now, defer molecular;
  topping = transfer primitive (keg lot → many targets), not an additive.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Volume-neutral ops | A `LotOperation` (type ADDITION/FINING/CAP_MGMT) + a `LotTreatment` detail row, **no volumetric lines** | A synthetic balanced line; a separate non-ledger notes table | `deltaL<>0` forbids zero lines; the op still needs timeline + provenance + correction, which only a `LotOperation` gives. Chokepoint already accepts a no-line op. |
| Timeline of neutral ops | Phase 2 `getLotDetail` reads operations via **lines.lotId UNION treatment.lotId** | Leave neutral ops off the timeline | An SO₂ addition MUST appear in the lot's story. |
| Additions math | Store `rateValue` + `rateBasis` enum + `computedTotal` + `computedUnit` + `volumeLAtAddition` snapshot | Store only the total; recompute on read | History must not shift when the vessel volume later changes. |
| Material reference | Light `CellarMaterial` catalog (name, normalizedKey, kind, defaultBasis, percentActive?) upserted on first use | Free-text only; full inventory now | Enough for a default basis + Phase-8 cost hook; inventory/cost is Phase 8. |
| Topping | A **transfer** (rack) from a keg lot → target(s) + `LotLineage` append | An "addition" record | Domain-correct: topping moves wine, isn't an additive; lineage keeps composition honest. |
| Group fan-out | **One op per member vessel**, sharing a `batchId`; per-vessel capacity + correction; exceptions recorded per vessel | One giant op spanning all vessels | Independent capacity checks, granular correction, and partial-failure tolerance (D13 + exceptions). |
| Filtration / loss | Volumetric ops with an external loss line (`reason:"filtration"` / `"loss"`); filtration also gets a `LotTreatment` (medium, micron) | Neutral-only | Captures the real ~1% loss so cost-per-liter stays honest (D7). |
| Cap management | Zero-data `LotOperation` (CAP_MGMT) + minimal `LotTreatment` (kind: PUMPOVER/PUNCHDOWN, optional duration); no lines | A free-text note | One-tap, but still a typed, provenance-bearing, queryable event. |
| Correction of neutral ops | A `CORRECTION` op (no lines) that voids the treatment (`voidedByOperationId`); always allowed | Reuse `planCorrection` (needs lines) | No volumetric positions to guard; voiding a note is always valid. Volumetric ops keep the D15 guard. |
| Op type enum | Add `ADDITION`, `TOPPING`, `FINING`, `FILTRATION`, `CAP_MGMT` to the controlled enum (D4) in a dedicated enum-add migration step | Free-text type | D4; Postgres enum-add gotcha handled by isolating the migration. |

## Design Specification

Resolved in the design review. Token-driven per `DESIGN.md` (warm editorial, light-only,
sentence-case, no hardcoded colors, no AI-slop). Capture is **vessel-first** (D12) and
write-heavy — optimized for a cellar hand with full hands.

### Where capture lives
- **`/bulk` per-vessel modal** gets an **Actions row** (text buttons, not an icon grid):
  **Add · Top · Fine · Filter · Cap · Loss**. Tapping one swaps the modal body to a focused
  form for that op. The lot detail page (`/lots/[id]`) shows the same actions one tap from
  the timeline (lot-scoped). Tap budget: vessel → action → 1–2 fields → confirm.
- **Group actions live on `/bulk`** (chosen): a "group action" affordance targets a saved
  `VesselGroup` or an ad-hoc multi-select; a small group manager (create/name/add-remove)
  sits alongside. No separate page.

### One-tap vs confirm (chosen policy)
- **Cap management** (pump-over/punch-down): **one-tap instant** + a 5s undo toast. Near-zero
  data; speed matters most.
- **Addition, topping, fining, filtration, loss:** show a **preview** (computed grams or the
  volume effect) then a **confirm** tap (`ConfirmButton` / explicit submit). Volume/cost is
  involved — a check earns its tap.

### Per-op form specs
- **Addition:** material picker (text `Input` + `<datalist>` of `CellarMaterial`, upsert-on-
  submit), rate `Input` (`inputMode="decimal"`) + basis select (**g/hL · ppm (mg/L) · g/L ·
  mL/L**), optional note. A **live computed line** under the inputs: `30 g/hL × 450 L = 135 g`
  — muted, `tabular-nums`, in an `aria-live="polite"` region; recomputes as you type from the
  vessel's current volume. Confirm.
- **Topping:** source keg (`select` of vessels) + volume (`inputMode="decimal"`); preview the
  resulting target volume; confirm.
- **Loss / Filtration:** volume lost `Input`; preview "new volume = X L"; confirm. Filtration
  also takes an optional medium/micron note.
- **Fining:** material + rate (same picker as Add); note that volume is unchanged (the loss
  comes later at racking); confirm.
- **Cap:** kind toggle (pump-over / punch-down) + optional duration (min); one-tap apply.

### Group action result + exceptions
After a group apply, show a **result summary**: "Applied to 58 of 60 · 2 skipped" with a
semantic list of the exceptions ("Barrel 12 — empty", "Barrel 41 — would exceed capacity").
A skipped/failed member never aborts the batch; each is reported, not thrown.

### Interaction states
| Surface | Pending | Success | Error | Partial |
|---|---|---|---|---|
| Single op | button disabled + "Saving…" | inline "Logged" + op on the timeline + 5s undo toast | inline red message + retry, inputs preserved | n/a |
| Group op | progress ("Applying… 23/60") | result summary | per-member errors listed; batch still completes | "N/M applied · K skipped" + reasons |

### Undo (chosen)
A brief **"Logged · Undo"** toast after each capture (calls the correction/void path) for
fat-finger fixes, **plus** the durable correct/void action on the lot timeline (Unit 8).

### Responsive & accessibility
`inputMode="decimal"` on every rate/volume field; interactive targets ≥44px; `:focus-visible`
→ `--shadow-focus`; the computed-math line and group progress in `aria-live="polite"`; op type
never color-only (text Badge); forms full-width in the modal ≤768px; group result is a
semantic `<ul>`.

### Anti-slop
Action menu = plain text buttons / a segmented control (no icon-in-circle grid); computed
totals as a quiet tabular line, not a decorated callout; left-aligned; restrained.

### Timeline rendering (extends Phase 2)
`describeOperation` summaries for the new types: "Added 30 g/hL DAP → 135 g", "Topped 1.5 L
from Keg A", "Fined: 50 g/hL bentonite", "Filtered (1 L loss)", "Pump-over (20 min)", "Lost
8 L to evaporation". A corrected/voided op stays visible, dimmed, with a quiet "corrected" /
"voided" pill (same treatment as Phase 2 corrections).

## Implementation Units

### Unit 1: Additions math + volume-effect vocabulary (test-first)
**Goal:** Pure helpers for rate→total and the per-op volume classification.
**Files:** `src/lib/ledger/vocabulary.ts` (extend); `src/lib/cellar/additions-math.ts` (new);
`test/additions-math.test.ts` (new).
**Approach:** Extend `OPERATION_TYPES` with `ADDITION`/`TOPPING`/`FINING`/`FILTRATION`/
`CAP_MGMT` and `LINE_REASONS` with `topping`/`filtration`/`evaporation`. Add a `RATE_BASES`
enum (`G_HL`,`MG_L`,`G_L`,`ML_L`) and `computeAdditionTotal(rateValue, basis, volumeL)` →
`{ total, unit }` using the confirmed formulas (centiliter-safe via `round2`). Add a
`VOLUME_EFFECT` map (op type → `neutral|adds|removes`) for the UI/forms.
**Tests:** each basis computes the right total at a known volume; ml/L gives mL unit; rounding
is exact; unknown basis throws.
**Depends on:** none
**Execution note:** test-first.
**Patterns to follow:** `src/lib/bottling/draw.ts`, `test/draw.test.ts`.
**Verification:** `test/additions-math.test.ts` passes.

### Unit 2: Schema + migration (treatments, materials, batch, enum)
**Goal:** Land the data model the new ops ride on.
**Files:** `prisma/schema.prisma`; new migration(s) under `prisma/migrations/`.
**Approach:** Add enum values to `OperationType` in a **dedicated migration step** (Postgres
`ADD VALUE`). New models: **`LotTreatment`** (`id`, `operationId` FK, `lotId` FK, `vesselId?`
FK, `kind` String, `materialId?` FK, `materialName` snapshot, `rateValue Decimal?`,
`rateBasis?`, `computedTotal Decimal?`, `computedUnit?`, `volumeLAtAddition Decimal?`,
`durationMin Int?`, `note?`, `voidedByOperationId?`), indexed by `lotId` and `operationId`;
**`CellarMaterial`** (`id`, `name`, `normalizedKey` unique-by-kind, `kind`, `defaultBasis?`,
`percentActive Decimal?`, `isActive`). Add `batchId String?` (indexed) to `LotOperation` for
group fan-out. Apply via `prisma migrate` (unpooled URL); verify additive (no drops).
**Tests:** schema validates; client regenerates; constraints apply.
**Depends on:** Unit 1
**Patterns to follow:** the lot-codes migration; `prisma/migrations/*_lot_ledger_spine`.
**Verification:** `prisma migrate status` clean on the shared DB; `prisma generate` succeeds.

### Unit 3: CellarMaterial catalog actions
**Goal:** A light, deduped material list with upsert-on-first-use.
**Files:** `src/lib/cellar/materials.ts` (new).
**Approach:** `listMaterials()` (active, ordered) + `upsertMaterial(name, kind, defaultBasis?)`
deduping by `normalizedKey` (strip-punct/UPPERCASE), mirroring `FieldInput`. No cost/stock.
**Tests:** dedup ("KMBS" == "kmbs") covered by a small pure test on the normalize helper.
**Depends on:** Unit 2
**Patterns to follow:** `src/lib/fieldnotes/input-actions.ts`.
**Verification:** adding the same material twice yields one row; list returns it.

### Unit 4: Addition operation (core + action)
**Goal:** Record an additive dose against a lot-in-vessel, volume-neutral, with math + basis.
**Files:** `src/lib/cellar/addition.ts` (core, script-safe); `src/lib/cellar/actions.ts`
("use server" wrappers).
**Approach:** `addAdditionCore(actor, { vesselId, lotId?, materialId|materialName, rateValue,
rateBasis, note })` → resolve the vessel's current volume from `VesselLot`; `computeAdditionTotal`;
`runLedgerWrite` → `writeLotOperation({ type:"ADDITION", lines: [] })` then create a
`LotTreatment` (material snapshot, rate, basis, computed total + unit, `volumeLAtAddition`) +
audit. If `lotId` omitted and the vessel holds one lot, default to it; if multi-lot, the
treatment attaches to the vessel (lotId = each resident lot, or a vessel-level treatment —
see open question). Provenance (`captureMethod`) passed through.
**Tests:** Unit 10 (live script) + the pure math in Unit 1.
**Depends on:** Units 1, 2, 3
**Patterns to follow:** `src/lib/bulk/actions.ts` (action shape), `rack-core.ts` (core+wrapper).
**Verification:** an addition creates an ADDITION op (no lines) + a treatment with the right
computed grams; it appears on the lot timeline (after Unit 9).

### Unit 5: Fining, filtration, cap-management, loss ops
**Goal:** The remaining single-vessel cellar ops.
**Files:** `src/lib/cellar/treatments.ts` (fining, filtration, cap-mgmt cores);
`src/lib/cellar/loss.ts` (loss core); extend `src/lib/cellar/actions.ts`.
**Approach:** **Fining** = neutral `FINING` op + `LotTreatment` (material, rate via Unit 1).
**Cap management** = `CAP_MGMT` op + minimal treatment (kind PUMPOVER/PUNCHDOWN, optional
duration), no lines. **Filtration** = `FILTRATION` op + a `LotTreatment` (medium/micron) +
an external loss line (`reason:"filtration"`) for the measured/estimated loss (proportional
across the vessel's lots via `computeProportionalDraw`). **Loss/angel's share** = reuse the
`LOSS` type: a volumetric op, `-L` from the vessel (proportional across lots) + external
`reason:"evaporation"`. All through the chokepoint.
**Tests:** Unit 10.
**Depends on:** Units 1, 2, 4
**Patterns to follow:** `bulk/actions.ts` DEPLETE (loss lines), Unit 4 (treatment write).
**Verification:** filtration reduces vessel volume by the loss + records the treatment; loss
reduces volume; fining/cap leave volume unchanged but appear on the timeline.

### Unit 6: Topping (transfer from a keg lot, with lineage)
**Goal:** Top a vessel from a source keg lot, moving volume + appending lineage.
**Files:** `src/lib/cellar/topping.ts` (core); extend `src/lib/cellar/actions.ts`.
**Approach:** `topVesselCore(actor, { toVesselId, fromVesselId (keg), volumeL })` → reuse the
rack mechanic (`planLedgerRack` from the keg lot into the target), `type:"TOPPING"`, then
append a `LotLineage` edge (parent = keg lot, child = each target lot, `kind:"TOPPING"`,
`fraction` = contributed share). Capacity-guarded on the target. (External-supply topping —
no keg lot — mints a lot like SEED; flag as a minor variant.)
**Tests:** Unit 10.
**Depends on:** Units 1, 2; reuses `rack-core`/`planLedgerRack`.
**Patterns to follow:** `rack-core.ts`.
**Verification:** topping moves the volume keg→target, target volume rises, keg falls, a
lineage edge is created.

### Unit 7: Vessel groups — CRUD + fan-out engine
**Goal:** Make group actions real (D13): one action across many vessels.
**Files:** `src/lib/vessels/groups.ts` (CRUD: create/rename/deactivate group, add/remove
members); `src/lib/cellar/group-apply.ts` (fan-out engine); extend actions.
**Approach:** CRUD on `VesselGroup`/`VesselGroupMember`. `applyToGroup(actor, groupId, opSpec)`
loops members, builds each member's op via the Unit 4–6 cores, writes **one op per vessel
sharing a generated `batchId`**, and collects a per-vessel result (applied | skipped-empty |
error). Returns a batch summary ("58/60 applied, 2 skipped"). A member failure does not abort
the batch (each op is its own tx); exceptions are recorded/returned, not thrown.
**Tests:** Unit 10 (live: apply an addition to a 3-vessel group; one empty → skipped).
**Depends on:** Units 4, 5, 6
**Patterns to follow:** `writeLotOperation` per-op; `runLedgerWrite` per member.
**Verification:** applying to a group writes N ops with a shared `batchId`; an empty/invalid
member is skipped and reported, others succeed.

### Unit 8: Correction across the new ops
**Goal:** Make every Phase 3 op correctable (D6/D15).
**Files:** `src/lib/cellar/correct.ts`; extend actions; reuse `planCorrection`.
**Approach:** Volumetric ops (topping, filtration, loss) → `planCorrection` with the D15
later-touched guard (already built). Neutral treatment ops (addition, fining, cap-mgmt) →
a `CORRECTION` op (no lines) that sets `LotTreatment.voidedByOperationId`; always allowed
(no volumetric positions). Group-batch correction → correct each member op in the batch,
honoring the per-op guard, reporting which could/couldn't be undone.
**Tests:** Unit 10.
**Depends on:** Units 4–7
**Patterns to follow:** `rack-core.ts` `revertTransferCore` + `planCorrection`.
**Verification:** an addition can be voided; a topping can be corrected (and blocked if the
target was racked on); a corrected/voided op stays visible on the timeline, marked.

### Unit 9: Capture UI + timeline rendering
**Goal:** Vessel-first one-tap capture (D12) + show the new events on the lot timeline.
**Files:** `src/app/(app)/bulk/BulkClient.tsx` (per-vessel action menu: Add · Top · Fine ·
Filter · Cap · Loss); new form components under `src/app/(app)/bulk/` or
`src/components/cellar/`; a group-actions surface; `src/lib/lot/data.ts` +
`src/app/(app)/lots/[id]/LotDetailClient.tsx` (render treatments + new op types on the rail).
**Approach:** Build exactly to the **Design Specification** above. Per-vessel **Actions row**
(Add·Top·Fine·Filter·Cap·Loss) in the `/bulk` modal (+ same on lot detail); **confirm policy**:
cap = one-tap instant + 5s undo toast, all others = preview + confirm. Addition form has the
**live computed line** (`aria-live`, tabular-nums) from Unit 1 + a material picker
(`<datalist>`, upsert via Unit 3); provenance defaults (`captureMethod:"MANUAL"`). **Group
actions on `/bulk`** (saved group or multi-select) with a result summary + per-member
exceptions; a small group manager. Post-capture **"Logged · Undo" toast** (calls the
correction/void path). Extend the timeline loader to UNION ops from `lot_operation_line.lotId`
and `lot_treatment.lotId`, and `describeOperation` for the new types + the corrected/voided
pill. Interaction states + responsive + a11y per the spec. Read the Next 16 docs before
route/server-component edits.
**Tests:** Unit 10 (build + walkthrough).
**Depends on:** Units 4–8
**Patterns to follow:** `BulkClient.tsx` forms; the Phase 2 timeline rail + `describeOperation`.
**Verification:** from a vessel, log each op type; each appears correctly on the lot timeline;
group apply works from the UI.

### Unit 10: Verification
**Goal:** Prove the new ops against real data with no regressions.
**Files:** `scripts/verify-cellar-ops.ts` (new); pure tests from Units 1/3.
**Approach:** Live-DB script (via `tsx --env-file=.env`) exercising the cores with an explicit
actor: addition (neutral, math correct, treatment written, projection unchanged), filtration/
loss (volume drops, projection==fold), topping (keg→target + lineage), group apply (N ops +
batchId + a skipped member), correction/void of each. Restores state where possible. Then
`tsc --noEmit` clean, full `vitest` green, `npm run build` clean, `verify-projection`
zero-drift.
**Tests:** this unit is verification.
**Depends on:** Units 1–9
**Patterns to follow:** `scripts/verify-cutover.ts`, `scripts/verify-projection.ts`.
**Verification:** script passes; suite green; build clean; projection == fold of the ledger.

## Test Strategy

**Unit tests:** `test/additions-math.test.ts` (rate→total per basis, exact rounding) +
material normalize dedup; existing suite stays green (additive).
**Live-DB integration:** `scripts/verify-cellar-ops.ts` drives the real cores (addition,
fining, filtration, loss, topping, group, correction/void) and asserts projection==fold,
treatment records, lineage, and batch/exception behavior — restoring state where possible.
**Build:** `npm run build` compiles the new ops + UI. **Manual:** from a vessel, log each op;
confirm the lot timeline renders them; run a group action and a correction.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Neutral ops invisible on the timeline (read via lines only) | MED | HIGH | Timeline loader UNIONs `lot_treatment.lotId`; verify each neutral op shows (Unit 9/10). |
| Multi-lot vessel: which lot does an addition attach to? | MED | MED | Default single-lot; for multi-lot attach a treatment per resident lot (or vessel-level) — see open question; covered in Unit 4 + tests. |
| Postgres enum `ADD VALUE` migration gotcha | LOW | MED | Add enum values in a dedicated migration step, not used in the same migration's data. |
| Group fan-out partial failure poisons the batch | MED | HIGH | One tx per member op; failures recorded as exceptions, not thrown; batch summary returned (Unit 7). |
| D15 correction across many positions (group/topping) | MED | MED | Correct per-op with the existing guard; report which members couldn't be undone (Unit 8). |
| Scope creep into inventory/cost/work-orders | MED | MED | Hard boundary: record-only; cost/stock = Phase 8, work orders = Phase 9. |
| Float drift in additions math | LOW | MED | `round2`/centiliter discipline; exact-rounding tests (Unit 1). |

## Success Criteria

- [x] New op types added to the controlled enum (D4) + migration applied (additive, DB clean).
- [x] An addition entered as g/hL records the computed grams + basis + volume snapshot, with
      no volume change, and appears on the lot timeline.
- [x] Fining, cap-management (volume-neutral) and filtration, loss (volume-reducing) all log,
      update state correctly, and render on the timeline.
- [x] Topping moves volume from a keg lot to the target and appends lineage.
- [x] A single group action applies across all member vessels (one op each, shared batchId),
      skipping/reporting exceptions without failing the batch.
- [x] Every op is correctable: volumetric via the D15 guard, neutral via void; corrected ops
      stay visible, marked.
- [x] Capture is vessel-first (one-tap, no work order), with provenance on every op.
- [x] All ops route through `writeLotOperation`; projection == fold of the ledger (0 drift).
- [x] Capture UX matches the Design Specification: per-vessel Actions row; cap = one-tap +
      undo, others = preview + confirm; live additions-math line; group actions on `/bulk`
      with a result summary + per-member exceptions; "Logged · Undo" toast.
- [x] Responsive + a11y per spec (`inputMode="decimal"`, ≥44px, `:focus-visible`, `aria-live`
      math/progress, op type not color-only); no AI-slop patterns.
- [x] `tsc` clean; full vitest green (incl. additions-math); `npm run build` clean.

## Open Questions (resolve at /work or design review)

1. **Multi-lot vessel additions:** when a vessel holds >1 lot, does an addition attach to
   every resident lot, to a chosen lot, or to the vessel (lot-agnostic)? Lean: attach to all
   resident lots (one treatment each) so each lot's timeline is complete.
2. **Cap-management granularity:** per-vessel only, or group-first (punch-downs are often "all
   reds")? Lean: support both via the group engine.
3. **Topping external supply** (no keg lot): mint a lot (SEED-like) vs. require a keg lot.
   Lean: allow both; mint a minimal lot for external.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score 6/10 → 9/10, 3 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**DESIGN REVIEW (7 passes):** Info Arch 6→9 · States 5→9 · Journey 6→8 · AI-Slop 7→9 ·
Design-Sys 7→9 · Responsive/A11y 3→9 · Decisions: 3 resolved (confirm policy = cap instant /
others preview+confirm; group actions on `/bulk`; "Logged · Undo" toast + timeline correction).
A **Design Specification** section was added; Unit 9 + success criteria updated.
**UNRESOLVED:** 0 design (3 product open-questions remain in the plan body for /work).
**VERDICT:** DESIGN CLEARED (9/10). Eng review optional — this phase reuses the Phase-1
chokepoint architecture (already council-reviewed); the new surface is op cores + capture UI.
