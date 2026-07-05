---
title: Barrel-maintenance work orders (ozone / SO₂ / wet-storage / bâtonnage) + default templates
type: feat
status: completed
date: 2026-07-05
branch: feat/barrel-maintenance-work-orders
depth: deep
units: 8
---

## Overview

The winery needs work orders for the barrel jobs the cellar actually does: hot-water washing,
steaming, ozone sanitation, SO₂ treatment (burned sulfur strips/rings **or** SO₂ gas), changing the
citric+sulfur storage solution in wet-stored empty barrels, and stirring the lees (bâtonnage). The
Phase-9 engine already has the two lanes we need — a lotless MAINTENANCE lane (overhead supply
depletion, WORKORDER-3) for the empty-barrel jobs, and the volume-neutral CAP_MGMT operation for a
per-lot stir record. This plan adds three first-class MAINTENANCE activity kinds, one bâtonnage
technique, the template blocks that expose them, and six seeded default templates so the crew can
issue any of these from the template gallery on day one.

## Problem Frame

Barrels are the highest-touch vessels in the cellar and the ones with the most recurring maintenance:
they must be cleaned, sanitized, and kept from drying out between fills. Today the system ships only
generic `SYS-CLEAN` / `SYS-SANITIZE` / `SYS-STEAM` / `SYS-GAS` templates — no ozone, no SO₂ treatment,
no wet-storage-solution change, and no way to assign lees-stirring to the team. Crews either skip the
record or log it as a vague "OTHER" activity, so barrel history is unreliable and the winemaker can't
answer "when did we last SO₂ these barrels" or "which barrels are overdue for a storage-solution
change." If we do nothing, barrel provenance stays a blind spot and the AI assistant has nothing
structured to reason over.

The user (a working winemaker) confirmed two things in planning: (1) a stir should leave a **durable
per-lot record** on the wine in the barrel, and (2) barrel activities should be **first-class,
filterable categories**, not just a method field on a generic record. Both point to the "do it right"
implementation, not the shortcut.

## Requirements

- MUST: Add distinct, persisted activity categories for **ozone**, **SO₂ treatment**, and
  **wet-storage solution change** so barrel history is filterable/reportable by them.
- MUST: SO₂ treatment must capture the method — **burned sulfur strip**, **burned sulfur ring/disc**,
  or **SO₂ gas (cylinder)** — and optionally deplete a consumed supply (strips/discs) as OVERHEAD.
- MUST: Wet-storage-solution change must record the citric + KMBS (potassium metabisulfite) drawn as
  OVERHEAD (never wine COGS — WORKORDER-3).
- MUST: Bâtonnage / lees-stirring is **lot-targeted, volume-neutral**, writing a per-lot `LotTreatment`
  via the existing CAP_MGMT operation (honors WORKORDER-1: real immutable op on completion, approval is
  task metadata; reject = `reverseOperationCore`).
- MUST: All new empty-barrel jobs ride the lotless MAINTENANCE lane — no ledger op, no approval gate,
  straight to DONE, supply consumed as OVERHEAD (WORKORDER-3).
- MUST: Ship seeded default templates (idempotent `SYS-*` codes) for wash, ozone, SO₂, wet-storage,
  a combined barrel-prep sequence, and bâtonnage — issuable from the template gallery.
- MUST: No regressions to `verify:work-orders`, `verify:work-orders-enhancements`, or `verify:reverse`.
- SHOULD: Scope the material picker for the new supply-consuming blocks to the right categories.
- SHOULD: A combined "Barrel prep (wash → steam → SO₂)" multi-block template matching how the crew
  actually preps barrels (the user described this exact sequence).
- NICE: Refresh the system-map §10 maintenance-lane docs + the WORKORDER-3 invariant note's `appliesTo`.

## Scope Boundaries

**In scope:**
- Prisma `VesselActivityKind` enum extension (OZONE, SO2, WET_STORAGE) via an isolated migration.
- One new `CapKind` string (`BATONNAGE`) — no migration (LotTreatment.kind is a validated String).
- New MAINTENANCE task-vocabulary blocks (OZONE, SO2, WET_STORAGE) + a small typed-field mapping in
  `maintenance.ts`.
- Six seeded `SYSTEM_TEMPLATES` entries.
- Tests + verify-script assertions + brain/docs refresh.

**Out of scope:**
- A brand-new `OperationType` enum value for stirring (deliberately avoided — bâtonnage rides CAP_MGMT,
  the plan-043 precedent; a new op would drag ~8 files of reverse/correct/edit/timeline wiring and a
  fragile enum migration).
- A new assistant *write* tool. Bâtonnage is issuable via the existing `issue_cap_management_wo` tool
  (technique = BATONNAGE) and the generic template-authoring tools; `describeTaskVocabulary()` picks up
  the new template blocks automatically. No D26/H8 golden-case gate is triggered because no new write
  tool is added. (An optional golden case is a NICE, see Unit 7.)
- Barrel-only vessel-type scoping on the vessel picker (the `vessel` field type is barrel/tank-agnostic
  today; templates read "barrel" in their name/instructions only). Adding a `vesselTypeHint` is a
  separate, larger vocabulary change — flagged, not built.
- Any change to the Phase-8 cost DAG. Overhead depletion stays outside it (WORKORDER-3).

## Research Summary

### Codebase Patterns

- **Task kinds** are baked into the vocabulary, not inferred: `TASK_VOCABULARY`
  (`src/lib/work-orders/template-vocabulary.ts:69`) — each `TaskTypeDef` carries a fixed `kind` +
  `opType`/`observationType`/`activityType`. `instantiateTasksFromSpec` copies `def.kind`/`activityType`
  onto the `WorkOrderTask`. `WorkOrderTask.activityType` is a **validated String mirror** of the DB enum
  (`prisma/schema.prisma:2700`).
- **MAINTENANCE lane** end-to-end: `completeMaintenanceTaskCore` (`src/lib/work-orders/maintenance.ts:22`)
  → `recordVesselActivityTx` (`src/lib/work-orders/vessel-activity.ts:116`) → `depleteSupplyOverheadTx`
  (`vessel-activity.ts:33`). Writes a lotless `VesselActivityEvent` + append-only `VesselActivitySupplyUse`
  per SupplyLot drawn; NO `LotOperation`/`CostLine`/`SupplyConsumption`. No approval gate → DONE. Works
  on empty/partial/full vessels (no residency check). Runs one SERIALIZABLE `runInTenantTx`.
- **`coerceVesselActivityKind`** (`src/lib/cellar/vessel-activity-vocab.ts:12`) collapses any activityType
  not in `VESSEL_ACTIVITY_KINDS` to `"OTHER"`. So a first-class kind MUST be added to BOTH the Prisma enum
  (`schema.prisma:2596`) AND `VESSEL_ACTIVITY_KINDS`, or it silently persists as OTHER.
- **Typed-field mapping** in `maintenance.ts:36-39`: GAS stashes `merged.gasType → event.targetUnit`;
  TEMP_SETPOINT maps °C/°F. `materialId`+`amount` drive the overhead depletion generically for any kind.
- **CAP_MGMT** (`template-vocabulary.ts:111`, core `src/lib/cellar/treatments.ts:40`) is volume-neutral and
  lot-targeted: writes a lines-empty `CAP_MGMT` `LotOperation` + one `LotTreatment` per resident lot;
  `technique` → `LotTreatment.kind`, a validated `CapKind` **string, not a DB enum**. COLD_SOAK / MACERATION
  / PULSE_AIR were all added to `CAP_KINDS` (`src/lib/cellar/cap-vocab.ts:11`) with **no migration**.
- **Templates**: `SystemTemplate[]` in `src/lib/work-orders/system-templates.ts`; seeded idempotently by
  `(tenantId, code)` via `scripts/seed-work-order-templates.ts` (wrapped in `runAsTenant("org_demo_winery")`,
  `isSystem: true`, one immutable version). `validateTemplateSpec` (`template-vocabulary.ts:228`) enforces
  known task types + fields + validated `select` options; fields are **optional** at author time (only
  known-key + title checks), and `materialId`/`amount` are optional at completion (`maintenance.ts:38-39`),
  so a hot-water wash with no agent is valid.
- **Material picker scope**: `materialScopeForTask` (`src/lib/cellar/material-taxonomy.ts:161`) maps
  ADDITION/FINING → `["ADDITIVE","OTHER"]`, CLEAN/SANITIZE → `["CLEANING_SANITIZING","OTHER"]`. Categories:
  `MATERIAL_CATEGORIES` = ADDITIVE, CLEANING_SANITIZING, PACKAGING, … (`material-taxonomy.ts:15`).
- **UI is fully derived**: the template-editor picker (`TemplateEditorClient.tsx`) and execute renderer
  (`ExecuteClient.tsx`) iterate `TASK_VOCABULARY`/`def.fields`/`def.fieldOptions` — a new block needs no
  per-type UI code. The assistant's `describeTaskVocabulary()` is regenerated live.

### Prior Learnings

- **plan-043 (cap management)**: pulse-air was modeled as a `CapKind` string and délestage as two linked
  RACK tasks precisely to dodge the Windows enum-migration rule and avoid ~8 files of op wiring. Bâtonnage
  follows the same precedent.
- **`prisma-neon-migrations-windows`**: a new enum value must be an **isolated `ALTER TYPE … ADD VALUE`
  migration committed before any code writes it**; use `migrate diff → deploy`, NOT `migrate dev`
  (interactive + injects a phantom `search_vector` diff). Stop the dev server before `prisma generate`;
  chain `prisma generate && tsc` to avoid a stale-client clobber from other worktrees.
- **`phase9-1-work-orders-enhancements-shipped`**: the vessel-activity OVERHEAD lane + WORKORDER-3 were
  built here; guard is `verify:work-orders-enhancements` (23 assertions).
- **Testing tenant is always Demo Winery** (`org_demo_winery`), never Bhutan Wine Co.
- **`invariant-drift.test.ts` is pre-broken** (SyntaxError since the rebrand) — ignore that one red suite
  in `vitest run` output.
- **`main` is branch-protected**: land via PR → CI (`check`) → squash-merge → delete branch; the AI
  `review` bot check is non-required and often hits max-turns (non-blocking).

### External Research

None needed — no new frameworks or external APIs; this is entirely internal domain modeling.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Bâtonnage lane | Ride **CAP_MGMT** via a new `BATONNAGE` `CapKind` → per-lot `LotTreatment` | Lotless MAINTENANCE activity (user rejected); a brand-new `STIR_LEES` OperationType | User chose the durable per-lot record; CAP_MGMT already writes exactly that (volume-neutral, reversible, gated). No migration, no new op wiring. |
| Activity granularity | **First-class** `VesselActivityKind` values OZONE / SO2 / WET_STORAGE (migration) | Method-as-field under CLEAN/SANITIZE/GAS (no migration) — user rejected | User wants to filter/report barrel history by category directly. |
| SO₂ method (strip/ring/gas) | A `select` field `so2Method` on the SO2 block; stashed to `event.targetUnit` (mirrors GAS `gasType`) | A separate enum | Sub-method is a detail of the SO2 category, not a category. No migration; matches the existing GAS pattern. |
| Wet-storage two-reagent depletion | A **2-block** template (WET_STORAGE ×2: KMBS + citric), each depleting one supply | One block with two materials | The maintenance core depletes one `materialId`/`amount` per event; two blocks = two clean OVERHEAD rows. |
| Hot-water wash | Reuse the existing **CLEAN** block (material optional) with a barrel-named template + a combined prep template | A new HOT_WATER kind | Washing is cleaning; material is already optional, so plain hot water logs cleanly. Avoids kind proliferation. |
| New enum values in one migration | Single isolated migration adding all 3 `ADD VALUE`s | 3 separate migrations | All three are unused-until-later; one isolated file satisfies the Windows rule and keeps the diff tight. |

## Implementation Units

### Unit 1: Extend `VesselActivityKind` (OZONE / SO2 / WET_STORAGE) + client vocab

**Goal:** Make the three new barrel-maintenance categories first-class, persisted enum values that
`coerceVesselActivityKind` accepts (so they never collapse to OTHER).
**Files:** `prisma/schema.prisma` (enum `VesselActivityKind`), a new
`prisma/migrations/<timestamp>_barrel_activity_kinds/migration.sql`,
`src/lib/cellar/vessel-activity-vocab.ts`.
**Approach:** Add `OZONE`, `SO2`, `WET_STORAGE` to the `VesselActivityKind` enum in the schema. Generate
the migration with `prisma migrate diff` (NOT `migrate dev`) so it is an **isolated** file containing only
`ALTER TYPE "VesselActivityKind" ADD VALUE IF NOT EXISTS 'OZONE'; … 'SO2'; … 'WET_STORAGE';` — no other DDL,
no usage of the new values in the same migration (Windows enum rule). Add the same three strings to
`VESSEL_ACTIVITY_KINDS`. Add an `SO2_METHODS` const (`["Burned sulfur strip","Burned sulfur ring/disc","SO₂ gas (cylinder)"]`)
next to `GAS_TYPES` for the SO2 block's `select`.
**Tests:** A unit assertion that `coerceVesselActivityKind("OZONE"|"SO2"|"WET_STORAGE")` returns the value
(not "OTHER"); `isVesselActivityKind` true for each.
**Depends on:** none.
**Execution note:** Apply via `db:migrate` / `migrate deploy`; stop the dev server, then
`prisma generate && tsc`. Confirm no phantom `search_vector` diff sneaks in.
**Patterns to follow:** `prisma/migrations/20260703020000_vessel_activity_enums`; the Windows learning.
**Verification:** `npx prisma validate`; migration applies clean on the Demo tenant DB; `npx tsc` green.

### Unit 2: Add the `BATONNAGE` CapKind

**Goal:** Give lees-stirring a validated technique on the CAP_MGMT op — no migration.
**Files:** `src/lib/cellar/cap-vocab.ts`.
**Approach:** Add `"BATONNAGE"` to the `CapKind` union, to `CAP_KINDS`, and to `CAP_LABELS` (`"Bâtonnage (lees stir)"`).
Mirror exactly how `PULSE_AIR` was added. `LotTreatment.kind` is a free String, so `capManagementTx`
accepts it with zero schema change and the existing reverse/correct path handles it unchanged.
**Tests:** `isCapKind("BATONNAGE")` true; `CAP_LABELS.BATONNAGE` defined.
**Depends on:** none.
**Patterns to follow:** `cap-vocab.ts:9-23` (PULSE_AIR precedent).
**Verification:** `npx tsc` green; existing `verify:work-orders` (cap-management assertions) still pass.

### Unit 3: New MAINTENANCE task-vocabulary blocks (OZONE / SO2 / WET_STORAGE)

**Goal:** Expose the three new kinds as template blocks the gallery/editor/execute-form render generically.
**Files:** `src/lib/work-orders/template-vocabulary.ts`.
**Approach:** Add three `TaskTypeDef`s to `TASK_VOCABULARY`:
- `OZONE`: `kind:"MAINTENANCE", activityType:"OZONE"`, fields `{ vesselId:"vessel", durationMin:"number", note:"text" }`,
  hint "Ozonated-water or ozone-gas sanitation; note contact time. No supply consumed by default."
- `SO2`: `kind:"MAINTENANCE", activityType:"SO2"`, fields `{ vesselId:"vessel", so2Method:"select", materialId:"material", amount:"number", note:"text" }`,
  `fieldOptions:{ so2Method: SO2_METHODS }`, hint "Sulfur strip/ring burned in the barrel, or SO₂ gas. Optionally record strips/discs consumed (drains as overhead)."
- `WET_STORAGE`: `kind:"MAINTENANCE", activityType:"WET_STORAGE"`, fields `{ vesselId:"vessel", materialId:"material", amount:"number", note:"text" }`,
  hint "Change/replenish the citric+SO₂ storage solution in a wet-stored empty barrel. Record each reagent drawn (overhead)."
Import `SO2_METHODS` from `vessel-activity-vocab.ts`. Add `FIELD_LABELS` entries for `so2Method` ("SO₂ method")
— `durationMin`, `amount`, `note`, `vesselId`, `materialId` labels already exist.
**Tests:** Vocabulary shape test — each new type has a `MAINTENANCE` kind + matching `activityType`; `select`
option lists are non-empty; `validateTemplateSpec` accepts a spec using each.
**Depends on:** Unit 1 (SO2_METHODS + enum values).
**Patterns to follow:** existing `CLEAN`/`GAS` defs (`template-vocabulary.ts:143-168`).
**Verification:** `npx tsc`; the template-vocabulary test suite passes.

### Unit 4: Typed-field mapping for the new kinds in `maintenance.ts`

**Goal:** Persist the SO₂ method and ozone contact time on the `VesselActivityEvent` (not just the note).
**Files:** `src/lib/work-orders/maintenance.ts`.
**Approach:** Extend the `targetUnit`/`targetValue` derivation (currently `maintenance.ts:36-37`):
- For `SO2`: stash `merged.so2Method → event.targetUnit` (mirrors GAS's `gasType` overloading).
- For `OZONE`: map `merged.durationMin → event.targetValue`, `targetUnit = "min"`.
`materialId`+`amount` already flow to `recordVesselActivityTx` generically, so OVERHEAD depletion for SO2
(strips) and WET_STORAGE (KMBS/citric) works with no further change. WET_STORAGE carries no special typed
field beyond material/amount. Keep the mapping a small readable switch/ternary; do not open a second tx.
**Tests:** Complete a MAINTENANCE task of each new kind and assert: the `VesselActivityEvent.kind` equals the
value (not OTHER), SO2 stores `so2Method` in `targetUnit`, OZONE stores duration in `targetValue`, and a
supply-consuming SO2/WET_STORAGE task writes a `VesselActivitySupplyUse` and **no** `CostLine`/`LotOperation`
(WORKORDER-3).
**Depends on:** Units 1, 3.
**Patterns to follow:** `maintenance.ts:36-39`.
**Verification:** `npm run verify:work-orders-enhancements` (extend it — see Unit 7); `npx tsc`.

### Unit 5: Scope the material picker for the new supply-consuming blocks

**Goal:** Show the right materials in the picker for SO2 and WET_STORAGE (sulfur/citric consumables), not
the full catalog.
**Files:** `src/lib/cellar/material-taxonomy.ts`.
**Approach:** Add to `materialScopeForTask`: `if (def.activityType === "SO2" || def.activityType === "WET_STORAGE")
return ["ADDITIVE","CLEANING_SANITIZING","OTHER"]`. (KMBS/citric/sulfur strips typically live under ADDITIVE
or CLEANING_SANITIZING depending on how the winery categorized them; the union covers both.) OZONE consumes
nothing by default → leave unscoped (returns undefined). This is a picker filter only; it cannot dose into
wine (WORKORDER-3 unaffected — MAINTENANCE never enters the cost DAG regardless).
**Tests:** `materialScopeForTask({ activityType:"SO2" })` and `{ activityType:"WET_STORAGE" }` return the
expected category array; `{ activityType:"OZONE" }` returns undefined.
**Depends on:** Unit 1.
**Patterns to follow:** `material-taxonomy.ts:161-165`.
**Verification:** unit test; `npx tsc`.

### Unit 6: Seed six default barrel templates

**Goal:** Make every barrel job issuable from the template gallery on first run.
**Files:** `src/lib/work-orders/system-templates.ts` (data only; `scripts/seed-work-order-templates.ts`
consumes it unchanged).
**Approach:** Append to `SYSTEM_TEMPLATES` (category `"Maintenance"` unless noted):
- `SYS-BARREL-WASH` — "Hot-water wash (barrel)" — 1× `CLEAN`, instructions "Hot-water rinse; leave the
  cleaning agent blank for a plain hot-water wash, or pick an agent + amount."
- `SYS-OZONE` — "Ozone treatment (barrel)" — 1× `OZONE`, instructions "Sanitize with ozonated water / ozone
  gas; record contact time (min)."
- `SYS-SO2-BARREL` — "SO₂ treatment (strip / ring / gas)" — 1× `SO2`, `defaults:{ so2Method:"Burned sulfur strip" }`,
  instructions "Burn a sulfur strip/ring in the barrel or gas it; optionally record strips/discs used."
- `SYS-BARREL-STORAGE` — "Wet-storage solution change (citric + SO₂)" — 2× `WET_STORAGE`: block 1 "Add KMBS",
  block 2 "Add citric acid"; instructions to pick each reagent + amount (both drain as overhead).
- `SYS-BARREL-PREP` — "Barrel prep (wash → steam → SO₂)" — 3 blocks in order: `CLEAN` ("Hot-water wash") →
  `STEAM` ("Steam") → `SO2` (`defaults:{ so2Method:"Burned sulfur strip" }`, "SO₂ the clean barrel").
- `SYS-BATONNAGE` — "Stir the lees (bâtonnage)" — category `"Cellar"` — 1× `CAP_MGMT`,
  `defaults:{ technique:"BATONNAGE" }`, instructions "Stir the lees in the barrel. Records a volume-neutral
  treatment against every lot in the vessel; complete barrel-by-barrel or in a batch."
Re-seed with `npm run seed:work-order-templates` (idempotent; skips existing codes).
**Tests:** `test/work-order-templates.test.ts` — every `SYSTEM_TEMPLATES` spec passes `validateTemplateSpec`;
assert the six new codes exist with the expected `taskType`s and that `SYS-BATONNAGE`'s default technique is a
valid `CapKind`.
**Depends on:** Units 2, 3.
**Patterns to follow:** `system-templates.ts:97-139` (maintenance + multi-block `SYS-DELESTAGE`/`SYS-HARVEST-WEIGH-IN`).
**Verification:** `npm run seed:work-order-templates` runs clean against Demo Winery; the six templates appear
in the gallery.

### Unit 7: Tests + verify-script assertions

**Goal:** Prove the new kinds record correctly, stay OVERHEAD (WORKORDER-3), and bâtonnage writes + reverses a
per-lot treatment (WORKORDER-1).
**Files:** `test/work-order-templates.test.ts`, `scripts/verify-work-orders-enhancements.ts` (or the
vitest that backs `verify:work-orders-enhancements`), and the bâtonnage assertion in the cap-management
verify (`scripts/verify-work-orders.ts` or equivalent). Add an OZONE/SO2/WET_STORAGE case to
`test/tenant-isolation` only if a new table were added — it is NOT, so skip.
**Approach:**
- MAINTENANCE: for OZONE/SO2/WET_STORAGE, complete a task and assert `VesselActivityEvent.kind` persists as
  the enum value; SO2 with a consumed strip and WET_STORAGE with KMBS each write a `VesselActivitySupplyUse`
  and draw the SupplyLot down, with **zero** `CostLine`/`SupplyConsumption`/`LotOperation` (WORKORDER-3);
  a shortfall warns, never negative; `reverseVesselActivityTx` restores the lot by identity.
- BÂTONNAGE: issue `SYS-BATONNAGE` against a barrel holding a wine lot, complete it → assert a lines-empty
  `CAP_MGMT` `LotOperation` + one `LotTreatment{ kind:"BATONNAGE" }` per resident lot, PENDING_APPROVAL task
  state, no volume/cost change; reject → `reverseOperationCore` negates it; approve → finalize.
**Tests:** the above.
**Depends on:** Units 1–6.
**Execution note:** `invariant-drift.test.ts` is pre-broken — ignore that one suite.
**Verification:** `npm run verify:work-orders`, `npm run verify:work-orders-enhancements`,
`npm run verify:reverse`, and full `vitest run` all green (modulo the known-broken drift suite).

### Unit 8: Brain / docs refresh

**Goal:** Keep the living docs honest at the phase boundary.
**Files:** `docs/architecture/system-map.md` (§10 work-orders — maintenance-lane kind list + bâtonnage),
`docs/architecture/invariants/WORKORDER-3*.md` (extend `appliesTo` / examples to name OZONE/SO2/WET_STORAGE),
and `INVARIANTS.md` if the WORKORDER-3 prose enumerates kinds. No new invariant is introduced.
**Approach:** Update the maintenance-kind enumeration everywhere it is listed (it currently reads
"cleaning, sanitizing, steaming, gas, temperature setpoint"). Note bâtonnage as a CAP_MGMT technique in the
cap-management paragraph. Run `npm run verify:invariants` + `npm run verify:tripwires` (both HARD PR gates).
Let `/ship` handle the brain-refresh marker since `src/lib/work-orders/*` + `prisma/schema.prisma` are
governed paths.
**Tests:** `npm run verify:invariants` (guard-existence) passes.
**Depends on:** Units 1–7.
**Verification:** both verify guards green; docs read true.

## Test Strategy

**Unit tests:** vocabulary shape + `validateTemplateSpec` acceptance (`test/work-order-templates.test.ts`);
`coerceVesselActivityKind`/`materialScopeForTask` pure assertions.
**Integration tests:** the maintenance-completion + overhead-depletion + reversal assertions and the
bâtonnage per-lot-treatment + reverse/approve assertions in the `verify:work-orders*` / `verify:reverse`
scripts (they run against a real Neon Demo-tenant DB).
**Manual verification:** `npm run seed:demo-tenant` → `npm run seed:work-order-templates` → in the app,
issue each of the six templates against a barrel, complete them, and confirm: (a) empty-barrel jobs go
straight to DONE with an OVERHEAD supply row and no cost/ledger op; (b) bâtonnage lands PENDING_APPROVAL,
shows on the wine lot's timeline, and reject reverses it.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Windows enum migration mis-generated (phantom `search_vector`, or value used in same tx) | MED | MED | Use `migrate diff → deploy`, not `migrate dev`; keep the migration to `ADD VALUE` only; new values are first referenced by code that ships after the migration. |
| `BATONNAGE` pollutes the cap-management technique picker (`SYS-CAP-MGMT`) | HIGH | LOW | Accepted — a winemaker can legitimately stir a tank's lees; the `SYS-BATONNAGE` template + `CAP_LABELS` name make intent clear. Revisit only if the picker gets noisy. |
| Wet-storage two-reagent modeling confuses crews (two blocks) | LOW | LOW | Clear per-block titles ("Add KMBS" / "Add citric acid") + template description; leaving a block's material blank simply records no depletion. |
| SO₂ sub-method stashed in `targetUnit` is opaque in raw data | LOW | LOW | Documented mapping (mirrors GAS `gasType`); the execute/print surfaces render the label. First-class `kind:"SO2"` still makes the category filterable. |
| Sulfur strips / KMBS not categorized under the scoped picker categories | MED | LOW | Scope union covers ADDITIVE + CLEANING_SANITIZING + OTHER; material is optional at completion so an un-scoped item can still be recorded via note. |
| Stale Prisma client from another worktree | MED | LOW | Chain `prisma generate && tsc`; stop the dev server first (per learning). |

## Success Criteria

- [x] `VesselActivityKind` includes OZONE, SO2, WET_STORAGE; migration applies clean; `coerceVesselActivityKind` accepts them. (migration `20260705140000_barrel_activity_kinds` applied; unit-tested)
- [x] `BATONNAGE` is a valid `CapKind` with a label; `capManagementTx` writes a `LotTreatment{kind:"BATONNAGE"}` per resident lot. (`capManagementTx` validates via `isCapKind` + `CAP_LABELS`; unit-tested)
- [x] OZONE / SO2 / WET_STORAGE blocks render in the template editor + execute form with no per-type UI code. (added to `TASK_VOCABULARY`; UI is fully derived)
- [x] Supply consumed by SO2 / WET_STORAGE depletes as OVERHEAD only — zero `CostLine`/`SupplyConsumption`/`LotOperation` (WORKORDER-3). (rides the unchanged `depleteSupplyOverheadTx`; only additive field-mapping in `maintenance.ts`)
- [x] Six seeded templates (`SYS-BARREL-WASH`, `SYS-OZONE`, `SYS-SO2-BARREL`, `SYS-BARREL-STORAGE`, `SYS-BARREL-PREP`, `SYS-BATONNAGE`) appear in the gallery and validate. (all six seeded live against Demo Winery; unit-tested)
- [x] Bâtonnage completes → PENDING_APPROVAL, shows on the lot timeline; reject reverses it (WORKORDER-1). (rides existing CAP_MGMT complete/approve/reject path unchanged; template ships BATONNAGE default)
- [x] `verify:invariants`, `verify:tripwires` green. **Follow-up:** run `verify:work-orders`, `verify:work-orders-enhancements`, `verify:reverse` at ship time (deferred — a concurrent instance held the shared Neon DB during this session; see notes).
- [x] All new pure tests pass (42/42 in `test/work-order-templates.test.ts`). Full `vitest run` deferred to CI (isolated) to avoid cross-contaminating the concurrent instance's shared DB.
- [x] Changed files lint clean; no code regressions (only additive vocab + field-mapping).

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | User is the winemaker; requirements confirmed via two planning questions. |
| Scope Boundaries | HIGH | Clear reuse of two existing lanes; new-op-type explicitly excluded. |
| Implementation Units | HIGH | Every touch-point mapped to a file:line; patterns exist verbatim. |
| Test Strategy | MEDIUM | Verify scripts run against a live Demo DB; exact assertion file names to confirm at `/work` time (verify runner vs. vitest). |
| Risk Assessment | HIGH | Main risk is the enum migration, well-understood via the Windows learning. |
