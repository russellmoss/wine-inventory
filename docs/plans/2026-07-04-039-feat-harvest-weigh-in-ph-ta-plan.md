---
title: Harvest weigh-in — pH + TA on picks + an assistant fruit-intake tool
type: feat
status: completed
date: 2026-07-04
branch: feat/harvest-weigh-in
depth: deep
units: 9
follows: "docs/plans/2026-07-04-038-feat-wo-assistant-template-authoring-plan.md (shared WO/assistant surface — sequence after 038 merges or rebase onto it)"
---

## Overview

Make the harvest weigh-in capture the full fruit snapshot: today a pick is **weight + Brix + date**; add
**pH and TA** so each pick records weight, Brix, pH, TA. Surface those inputs three ways: (1) the harvest
module's "Add a pick" form + dashboard, (2) an **assistant tool** to log a weigh-in by chat ("weigh in 1200 kg
from Block 1, 24 Brix, pH 3.4, TA 6.2"), and (3) a **work-order "fruit intake / weigh-in" block** that targets
a vineyard block and, on completion, writes the pick. This is the "weigh the fruit" stage — vineyard data
logged to the harvest store, never a cellar ledger op. The WO block pulls the Phase-20 vineyard-block target
seam forward, kept minimal (one block type) so Phase 20 extends rather than unwinds it.

## Problem Frame

At weigh-in the crew has the fruit on a scale and a quick lab reading (Brix/pH/TA). Today only weight + Brix
are captured, so pH/TA get written on paper or lost until the wine hits a tank and the cellar chemistry panel
runs — too late to inform pick decisions or the fruit record. The job: capture the whole fruit snapshot once,
at the scale, from a phone or by voice/chat, into the block's harvest record.

**Product note — the scoping call (decided: build the WO block now).** The WO engine today targets only cellar
vessels/lots/materials — a WorkOrderTask has no vineyard-block target, and plan 032 deferred "block activities"
to **Phase 20** ("one shared engine serves cellar + vineyard"). We are **pulling that seam forward, minimally**:
this plan adds a vineyard-block *target* + ONE block-scoped observation block (fruit weigh-in) that writes a
`HarvestPick`. We are NOT building the rest of Phase 20 (block-activity ledger generalization, cross-block
fan-out, farming-cost roll-up) — those stay Phase 20 and must reconcile with this seam. Kept minimal + documented
so Phase 20 extends it rather than unwinds it. The pick pH/TA + the standalone assistant weigh-in tool ship
alongside so the value lands from the UI, chat, AND a work order.

## Requirements

- MUST: `HarvestPick` records **pH** and **TA** alongside weight + Brix (all optional except weight).
- MUST: The harvest manager view "Add a pick" form gains pH + TA inputs; the pick history + admin dashboard
  show them. Keep the existing kg/lb weight toggle (weight stays canonical kg).
- MUST: An assistant write tool **logs a harvest pick / weigh-in** for a vineyard block — resolve the block by
  plain language (findScopedBlocks + resolveExactlyOne, like log_brix), draft→confirm (D10, signed nonce),
  tenant + vineyard-membership scoped. Ensure the block's `HarvestRecord` for the current vintage exists
  (find-or-create, like set_yield_estimate) then append the pick.
- MUST: Add a golden case for the new write tool — the D26/H8 coverage guard fails CI otherwise.
- MUST: pH/TA representation consistent with the app's analyte registry (pH 2.5–4.5, 2 dp; TA g/L tartaric,
  ~1 dp) — see `src/lib/chemistry/analytes.ts`.
- MUST (WO block): a work-order **"fruit intake / weigh-in" block** whose target is a **vineyard block** (new
  run-time target, like a vessel is for cellar ops); completing it writes a `HarvestPick` (weight/Brix/pH/TA,
  find-or-create the vintage's `HarvestRecord`) — NO cellar ledger op, straight to DONE (observation lane). It
  is issuable from a template + the new-WO form, executed via a run-time sub-form (mirror the CRUSH sub-form),
  and rendered on the WO detail/print. Reversible per the existing observation/undo model.
- MUST (WO block): keep the seam **minimal + Phase-20-compatible** — a `blockId` task target + a `"block"`
  field type + one `observationType: "HARVEST_WEIGH_IN"`; do NOT generalize to a block-activity ledger,
  cross-block fan-out, or farming cost (Phase 20 owns those).
- SHOULD: pH/TA are optional on a pick (a fast weigh-in may only have weight + Brix).
- SHOULD: TA unit is **g/L tartaric** for v1 (the registry's default); a per-pick unit toggle is deferred.
- NICE: show pH/TA in any harvest export/summary if one exists.

## Scope Boundaries

**In scope:** pH/TA columns on `HarvestPick` (+ migration); harvest data-layer + `addHarvestPick` action
extension; harvest manager form + dashboard display; one assistant weigh-in tool + committer + registry +
golden + tests; **the work-order fruit-intake weigh-in block** — a `blockId` task target, a `"block"` field
type + picker, an `observationType: "HARVEST_WEIGH_IN"`, a completion handler that writes a `HarvestPick`, the
execute sub-form, and template/new-WO/detail/print wiring.

**Out of scope (stays Phase 20 — do NOT build here):**
- Generalizing to a **block-activity ledger** (a first-class append-only vineyard op ledger), **cross-block
  fan-out** ("apply to blocks 1–10"), and **farming-cost roll-up** per block → fruit cost. We add only the ONE
  weigh-in block target; Phase 20 owns the general vineyard-WO model and must extend (not unwind) this seam.
- Other vineyard WO block types (spray, prune, irrigate) — not in this plan.
- CRUSH already consumes picks into a must lot (plan 035, shipped) — unchanged. Weigh-in ≠ crush.
- Cellar chemistry (`AnalysisPanel`) — untouched; field pH/TA live on the pick, not the lot.
- Retroactive backfill of pH/TA on existing picks (they stay null).
- The assistant *template*-authoring tools (plan 038) auto-derive the new block from `TASK_VOCABULARY`; since
  the block target is a run-time field (not a template default, like vessels/lots), plan 038 needs no change —
  but 039 should land after 038 (or rebase onto it) so the derivation includes the new block.

## Research Summary

### Codebase Patterns
- **Pick model:** [schema.prisma:436](prisma/schema.prisma) `HarvestPick { harvestRecordId, pickDate @db.Date,
  weightKg Decimal(12,3), brixAtPick Decimal(4,1)?, note, createdByEmail, tenantId, @@unique([tenantId,id]),
  @@index([harvestRecordId, pickDate]) }`; parent `HarvestRecord { blockId, vineyardId, vintageYear,
  yieldEstimateKg, @@unique([tenantId, blockId, vintageYear]) }` (~L411); target `VineyardBlock` (~L286).
  pH/TA are NOT on the pick today.
- **Analyte precision (mirror for consistency):** [analytes.ts](src/lib/chemistry/analytes.ts) — pH type "PH",
  precision 2, range 2.5–4.5; TA type "TA", precision 1, units "g/L tartaric" | "g/L H2SO4"
  (1 g/L H₂SO₄ = 1.5306 g/L tartaric). Cellar readings store `AnalysisReading.value Decimal(12,4)` + unit.
- **Harvest data layer + UI:** [harvest/actions.ts](src/lib/harvest/actions.ts) — `addHarvestPick`,
  `recordYieldEstimate` (UPSERTs the `HarvestRecord` for block+vintage), `logBrix`, all inside `runInTenantTx`
  behind `requireBlockAccess`. UI: [HarvestManagerView.tsx](src/app/(app)/vineyards/harvest/manager/HarvestManagerView.tsx)
  + [HarvestRecordForm.tsx](src/app/(app)/vineyards/harvest/manager/HarvestRecordForm.tsx) (Add-a-pick: weight
  + optional Brix); admin [HarvestDashboard.tsx](src/app/(app)/vineyards/harvest/admin/HarvestDashboard.tsx) via
  `getVineyardHarvestDashboard`. kg/lb canonicalization: [harvest/units.ts](src/lib/harvest/units.ts).
- **Assistant vineyard tools (the exact pattern to copy):** [log-brix.ts](src/lib/assistant/tools/log-brix.ts)
  + [set-yield-estimate.ts](src/lib/assistant/tools/set-yield-estimate.ts): `run()` → `findScopedBlocks`
  ([scope.ts:61](src/lib/assistant/scope.ts)) → `resolveExactlyOne` ([resolve.ts:8](src/lib/assistant/tools/resolve.ts))
  → `signProposal` ([confirm.ts:29](src/lib/assistant/confirm.ts)); committer in
  [commit.ts](src/lib/assistant/commit.ts) calls the harvest server action. Registry:
  [registry.ts](src/lib/assistant/registry.ts). Golden + guard:
  [assistant-write-tools.golden.ts](test/evals/assistant-write-tools.golden.ts) +
  [assistant-tools.eval.test.ts](test/evals/assistant-tools.eval.test.ts).
- **WO block-target gap (why part 2 is deferred):** [template-vocabulary.ts:12](src/lib/work-orders/template-vocabulary.ts)
  FieldType has no "block"; WorkOrderTask canonical columns are vessel/lot/material only (no `blockId`);
  observation completion [observations.ts:17](src/lib/work-orders/observations.ts) writes to `AnalysisPanel`
  (lot-scoped), only when `lotId` present. A block-target weigh-in would need all-new plumbing.

### Prior Learnings
- rstack learnings + context-ledger: **empty** for this topic; authority is ROADMAP (Phase 20 / Phase 9 shared
  engine), the harvest plan docs (005 blocks, 006 field notes, 007 harvest dashboard — `brixAtPick` was added
  there, the exact precedent for adding pH/TA), and plan 032 (WO engine, block activities deferred).
- **Chemistry attaches to exactly one lot** (locked) — that's why field pH/TA belong on the PICK (block+vintage),
  not the cellar `AnalysisPanel`. [[measurements-attach-to-one-lot]].
- **Migrations on Windows:** column-only add (no enum) → single `migrate diff → deploy`; no enum-ordering rule
  needed here. RLS unchanged (harvest_pick already RLS-forced). [[prisma-neon-migrations-windows]].
- **Demo Winery** tenant for all test data ([[demo-winery-testing-convention]]).

### External Research
None — all in-repo patterns.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| **WO "fruit intake" block** | **Build now (decided), minimally.** Add a vineyard-block task target + ONE weigh-in observation block; do NOT build the general Phase-20 block model. | Defer entirely to Phase 20 | User wants weigh-in issuable from a work order. Kept to the smallest seam (one target + one block type) so Phase 20 extends it. |
| Block as target, not template default | The `blockId` is a **run-time** field (picked when the WO is issued/executed), exactly like a vessel/lot — NOT a template default. | Bake a block into the template | Mirrors the WO engine's WHERE-at-runtime rule (plan 034 excludes vessels/lots from template defaults); keeps plan-038 assistant template tools unaffected (no block resolution needed). |
| Observation vs new kind | Reuse `kind: "OBSERVATION"` with a new **`observationType: "HARVEST_WEIGH_IN"`** (a string, not the `WorkOrderTaskKind` enum) → no enum migration; straight to DONE, no approval gate, no ledger op. | A new `WorkOrderTaskKind` enum value | Weigh-in is observation-like (writes data, not a ledger op); observationType is a free string, so only the `blockId` column is a schema change. |
| Completion writes a Pick | The HARVEST_WEIGH_IN completion handler calls the **same pick-write core** as Units 2/4 (find-or-create `HarvestRecord`, append `HarvestPick`) — not `AnalysisPanel`. | A parallel writer | One source of truth for "write a pick"; keeps field pH/TA off the cellar chemistry store. |
| Execute UX | A run-time **sub-form** (block picker + weight/Brix/pH/TA) mirroring the CRUSH sub-form (plan 035, `CrushTaskForm.tsx`). | Generic field inputs | CRUSH already established the run-time sub-form pattern for a block that captures bespoke inputs. |
| pH/TA storage | **Columns on `HarvestPick`** (`phAtPick`, `taAtPick`), optional, mirroring `brixAtPick`. | A field-side AnalysisPanel; a generic reading table | Field readings are per block+vintage, not per lot-in-vessel; `brixAtPick` is the exact precedent; keeps the pick a single self-describing row. |
| Precision / units | pH `Decimal(4,2)` (2.5–4.5); TA `Decimal(4,1)` in **g/L tartaric** (v1, labeled). | Store a per-pick TA unit column now | Matches the analyte registry; a unit toggle is a NICE follow-up, not needed for v1. |
| Weight unit | Unchanged — canonical kg, kg/lb toggle at the UI/tool boundary (reuse `harvest/units.ts`). | New per-pick unit | Consistent with today; weigh-in must accept lb input and store kg. |
| Assistant record ensure | The weigh-in committer **find-or-creates** the `HarvestRecord(block, currentVintage)` then appends the pick (mirror `recordYieldEstimate`'s UPSERT). | Require an estimate first | A crew weighs fruit before any estimate exists; the pick must not fail on a missing record. |
| Tool access | Match the existing vineyard tools (`log_brix`/`set_yield_estimate` are not adminOnly — managers log their own blocks). | adminOnly | Weigh-in is a floor/crew action, scoped by vineyard membership, not an admin-only SOP edit. |

## Implementation Units

### Unit 1: pH + TA columns on HarvestPick (schema + migration)

**Goal:** Persist optional pH + TA on each pick.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_harvest_pick_ph_ta/migration.sql`.
**Approach:** Add `phAtPick Decimal(4,2)?` and `taAtPick Decimal(4,1)?` to `HarvestPick` (mirror `brixAtPick`).
Column-only add on an existing RLS-forced tenant table → one `migrate diff → deploy` migration; nullable, no
backfill, no NOT NULL, no enum, no RLS change. Optional CHECK constraints (pH 2.5–4.5, TA ≥ 0) matching the
analyte registry. Regenerate the Prisma client.
**Tests:** none directly (schema); covered by Units 2/4. Keep `npm run build`/tsc green after `db:generate`.
**Depends on:** none
**Patterns to follow:** the `brixAtPick` column + the plan-007 add; [[prisma-neon-migrations-windows]] (stop dev
server before `db:generate`).
**Verification:** `npx prisma validate`; migration applies on a Neon branch; `HarvestPick` type shows the fields.

### Unit 2: Harvest data layer — carry pH/TA through picks

**Goal:** `addHarvestPick` accepts + persists pH/TA; reads/DTOs surface them.
**Files:** `src/lib/harvest/actions.ts` (+ any `src/lib/harvest/*` DTO/read: dashboard.ts, the PickDTO type).
**Approach:** Extend the `addHarvestPick` input with optional `ph`, `ta` (validated to range; null when absent),
written on the pick inside the existing `runInTenantTx` + `requireBlockAccess`. Add `ph`/`ta` to the pick DTO
returned by the harvest reads (`getVineyardHarvest` / `getVineyardHarvestDashboard`) so the UI can render them.
**Tests:** unit-test the input validation/coercion if a pure helper exists; otherwise covered by Unit 4 +
manual. Add a `harvest` reads test only if shaping is non-trivial.
**Depends on:** Unit 1
**Patterns to follow:** existing `addHarvestPick` + `recordYieldEstimate` in
[harvest/actions.ts](src/lib/harvest/actions.ts); the weight-kg coercion in `harvest/units.ts`.
**Verification:** a pick created with ph/ta round-trips through the read layer.

### Unit 3: Harvest UI — capture + show pH/TA

**Goal:** The manager "Add a pick" form takes pH + TA; picks + dashboard display them.
**Files:** `src/app/(app)/vineyards/harvest/manager/HarvestRecordForm.tsx`,
`src/app/(app)/vineyards/harvest/admin/HarvestDashboard.tsx` (+ the pick-history render if separate).
**Approach:** Add pH and TA inputs beside the existing Weight + Brix in the add-pick row (label TA "g/L tartaric";
both optional). Submit them through the Unit 2 action. Render pH/TA in the pick history line and the admin
dashboard pick list. Tokens only (DESIGN.md); keep the kg/lb toggle behavior for weight.
**Tests:** none automated (UI); manual in Demo Winery.
**Depends on:** Unit 2
**Patterns to follow:** the existing add-pick form fields + `BrixQuickLog`; design tokens per DESIGN.md.
**Verification:** manual — add a pick with weight+Brix+pH+TA; it shows in history + dashboard; lb input stores kg.

### Unit 4: Assistant weigh-in tool (`log_harvest_pick`)

**Goal:** Log a fruit weigh-in for a block by chat, draft→confirm, writing a `HarvestPick`.
**Files:** `src/lib/assistant/tools/log-harvest-pick.ts` (new), `src/lib/assistant/registry.ts` (register),
`src/lib/assistant/commit.ts` (committer), `src/app/(app)/assistant/AssistantChat.tsx` (`TOOL_LABELS`),
`test/assistant-harvest-pick.test.ts` (new), `test/evals/assistant-write-tools.golden.ts` (golden case).
**Approach:** Mirror `set_yield_estimate`: `run()` validates weight (+unit → kg via `harvest/units.ts`) and
optional brix/pH/TA/pickDate, resolves the block (`findScopedBlocks` + `resolveExactlyOne`), builds a preview
("Weigh-in: 1200 kg off Block 1 — 24 Bx, pH 3.4, TA 6.2 g/L"), and `signProposal("log_harvest_pick", {...resolved})`.
Committer calls a harvest action that **find-or-creates** `HarvestRecord(blockId, currentVintage)` then appends
the pick with weight/brix/pH/TA (reuse/extend Unit 2's action; the ensure-record mirrors `recordYieldEstimate`).
`kind: "write"`, NOT adminOnly (parity with the other vineyard tools). Add the golden case (D26 gate) + a
`TOOL_LABELS` entry.
**Tests:** contract/guard test (DB-free): tool is a write, not adminOnly, required fields, tenant guard when no
vineyard scope; input coercion (lb→kg, out-of-range pH/TA rejected). Golden case satisfies the coverage guard.
**Depends on:** Unit 2 (the pick-write action)
**Execution note:** test-first for the input coercion + block-resolution guards.
**Patterns to follow:** [set-yield-estimate.ts](src/lib/assistant/tools/set-yield-estimate.ts) +
[log-brix.ts](src/lib/assistant/tools/log-brix.ts); registry/commit registration; the golden format.
**Verification:** `npx vitest run assistant-harvest-pick assistant-tools.eval` green; manual chat weigh-in in Demo Winery.

### Unit 5: WorkOrderTask vineyard-block target (schema + migration)

**Goal:** A work-order task can target a vineyard block.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_wo_task_block_target/migration.sql`.
**Approach:** Add `blockId String?` to `WorkOrderTask` (canonical column, sibling to `sourceVesselId`/`lotId`/
`materialId`) + a relation/FK to `VineyardBlock`. Follow the Phase-12 composite-FK rule for cross-tenant-risk FKs
(`(tenantId, blockId) → vineyard_block(tenantId, id)`; ensure `vineyard_block` has `@@unique([tenantId, id])`,
add if missing). Column-only add (no new enum — `observationType` is a string). RLS: `work_order_task` already
RLS-forced; a new FK column is RLS-neutral. Regenerate the client.
**Tests:** none directly (schema); covered by Units 6/8.
**Depends on:** none (parallel with 1)
**Patterns to follow:** the existing canonical target columns on `WorkOrderTask`; Phase-12 checklist in CLAUDE.md
(composite FK); [[prisma-neon-migrations-windows]].
**Verification:** `npx prisma validate`; migration applies on a Neon branch; `WorkOrderTask.blockId` present.

### Unit 6: HARVEST_WEIGH_IN vocabulary + completion handler

**Goal:** Define the block type + make completing it write a `HarvestPick`.
**Files:** `src/lib/work-orders/template-vocabulary.ts` (new `"block"` FieldType + `HARVEST_WEIGH_IN` task def +
canonical-column mapping for `blockId`), `src/lib/work-orders/observations.ts` (or a new
`harvest-observations.ts` branch off `completeObservationTaskCore`), `src/lib/work-orders/execute.ts` (dispatch).
**Approach:** Add FieldType `"block"`; add a `HARVEST_WEIGH_IN` entry (`kind: "OBSERVATION"`,
`observationType: "HARVEST_WEIGH_IN"`, fields: `blockId: "block"`, weight/brix/ph/ta: "number", note: "text").
Extend `canonicalColumns()` to map `blockId`. At completion, when `observationType === "HARVEST_WEIGH_IN"`,
dispatch to a handler that calls the Unit 2/4 pick-write core (find-or-create `HarvestRecord(blockId,
currentVintage)`, append the pick) instead of `insertPanelTx`; straight to DONE, no approval, no ledger op.
Reject if `blockId` missing or weight absent.
**Tests:** vocabulary: `HARVEST_WEIGH_IN` validates; canonical `blockId` extracted. Completion (DB, Demo Winery
in a verify script): completing the task writes a pick with weight/brix/ph/ta to the right block+vintage; no
ledger op; missing block/weight rejected.
**Depends on:** Unit 2 (pick-write core), Unit 5 (blockId column)
**Patterns to follow:** BRIX/PANEL observation handling in [observations.ts](src/lib/work-orders/observations.ts);
CRUSH dispatch in [execute.ts](src/lib/work-orders/execute.ts).
**Verification:** `npm run verify:work-orders` (add a HARVEST_WEIGH_IN case) green.

### Unit 7: WO UI — block picker + run-time weigh-in sub-form + render

**Goal:** Issue + execute the weigh-in block from the UI.
**Files:** the new-WO form + template builder field renderer (wherever FieldType inputs render — e.g.
`src/app/(app)/work-orders/new/*` + the template editor), a new execute sub-form
`src/app/(app)/work-orders/[id]/execute/HarvestWeighInTaskForm.tsx` (mirror `CrushTaskForm.tsx`), and the WO
detail/print rows.
**Approach:** Render the `"block"` field as a vineyard-block picker (reuse the block-scoping read used by the
harvest module / assistant `findScopedBlocks`, tenant + membership scoped). Execute sub-form: block picker (or
pre-filled from the task) + weight (kg/lb) + Brix + pH + TA → completes the task (Unit 6). Detail + print render
a human "Weigh-in — Block 1: 1200 kg, 24 Bx, pH 3.4, TA 6.2" row. Tokens only.
**Tests:** none automated (UI); manual in Demo Winery.
**Depends on:** Unit 6
**Patterns to follow:** [CrushTaskForm.tsx](src/app/(app)/work-orders/[id]/execute/CrushTaskForm.tsx) (run-time
sub-form); the existing field renderers for vessel/lot pickers; DESIGN.md tokens.
**Verification:** manual — issue a WO with a weigh-in block, execute it, see the pick appear in the harvest module.

### Unit 8: WO block tests + verify

**Goal:** Lock the block-target + completion behavior.
**Files:** `test/work-order-harvest-weigh-in.test.ts` (new) + a case in `scripts/verify-work-orders.ts`.
**Approach:** Pure vocabulary tests (HARVEST_WEIGH_IN valid; `blockId` canonicalized; `"block"` field type).
DB e2e (Demo Winery via runAsTenant, in the verify script): issue → complete → a `HarvestPick` exists on the
block for the current vintage with the right weight/brix/ph/ta; no ledger op written; reverse/undo behaves.
**Tests:** this unit is tests.
**Depends on:** Units 5–7
**Patterns to follow:** `test/work-order-templates.test.ts`, `scripts/verify-work-orders-transform.ts`.
**Verification:** `npx vitest run work-order-harvest-weigh-in` + `npm run verify:work-orders` green.

### Unit 9: Docs + brain

**Goal:** Keep the registers honest — record the new pick fields + the (minimal) vineyard-block WO seam.
**Files:** `docs/architecture/system-map.md` (harvest picks carry pH/TA; WorkOrderTask can target a vineyard
block via the HARVEST_WEIGH_IN block), ROADMAP Phase 20 (note: the weigh-in block + block-target seam shipped
in plan 039; Phase 20 EXTENDS it to the general block-activity model, does not rebuild it).
**Approach:** Short doc edits per CLAUDE.md brain rules; if the block-target seam is a meaningful architecture
decision, add a one-line ADR under `docs/architecture/decisions/`.
**Tests:** none.
**Depends on:** Units 1–8
**Verification:** docs read true; `npm run verify:invariants` / `verify:tripwires` green (governed-code touched:
work-orders — run the brain-refresh at ship per CLAUDE.md).

## Test Strategy

**Unit:** the assistant tool's input coercion (lb→kg, pH/TA range, optional fields) + block-resolution/tenant
guards (DB-free), plus any pure harvest-input helper. **Eval:** the D26/H8 structural + coverage guard stays
green (Unit 4 adds the golden case). **Manual (Demo Winery):** add a pick with weight+Brix+pH+TA from the
manager view (kg and lb); confirm it shows in history + admin dashboard; then log the same by chat
("weigh in 1200 kg from Block 1, 24 Brix, pH 3.4, TA 6.2") → confirm card → appears in harvest. `verify:*`
DB-backed scripts need `.env` (run in CI).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Phase-20 reconciliation — the block-target seam we add conflicts with Phase 20's general vineyard-WO model | MED | HIGH | Keep it minimal (one target column + one block type + one observationType), document it (Unit 9 + ADR), and shape it as "Phase 20 extends this," not a parallel model. |
| The new `blockId` FK / composite-FK across tenants done wrong (leak or broken FK) | LOW | HIGH | Follow the Phase-12 composite-FK checklist exactly (`(tenantId, blockId) → vineyard_block(tenantId,id)`); Unit 8 e2e asserts tenant isolation. |
| Ordering vs plan 038 (both touch the WO/assistant surface) | MED | MED | 039 `follows` 038 — ship 038 first or rebase 039 onto it; the new block auto-appears in the assistant template tools once both are together. |
| TA unit ambiguity (tartaric vs H₂SO₄) | MED | MED | v1 fixes g/L tartaric + labels it; per-pick unit toggle deferred; registry conversion exists if needed later. |
| Assistant weigh-in fails when no HarvestRecord exists yet | MED | HIGH | Committer find-or-creates the record (mirror `recordYieldEstimate`); covered by a test. |
| New write tool ships without eval coverage → red CI | HIGH (guard active) | MED | Unit 4 adds the golden case; verify `assistant-tools.eval` before push. |
| pH/TA precision drift vs analyte registry | LOW | LOW | Match registry (pH 2dp/2.5–4.5, TA 1dp g/L tartaric) in the column + validation. |
| Migration/client staleness on Windows | MED | LOW | `migrate diff → deploy`, stop dev server before `db:generate`, then tsc. |

## Success Criteria

- [x] `HarvestPick` stores optional pH + TA; migration applies cleanly (RLS unchanged).
- [x] Manager "Add a pick" captures weight + Brix + pH + TA (kg/lb weight preserved); pick history + admin
      dashboard show pH/TA.
- [x] `log_harvest_pick` assistant tool logs a weigh-in by chat: resolves the block, draft→confirm, find-or-creates
      the vintage's HarvestRecord, writes the pick with weight/Brix/pH/TA; tenant + membership scoped.
- [x] D26/H8 eval coverage guard green (golden case added); assistant + harvest tests pass; build + tsc + eslint clean.
- [x] A work order can carry a **fruit-intake weigh-in block** targeting a vineyard block; completing it writes a
      `HarvestPick` (weight/Brix/pH/TA) to that block's current-vintage record — no ledger op — visible in the
      harvest module; issuable from a template + the new-WO form, executed via a run-time sub-form, rendered on
      detail/print; `npm run verify:work-orders` green with a HARVEST_WEIGH_IN case.
- [x] The vineyard-block WO seam is minimal (one target + one block type) and documented so Phase 20 extends it.
