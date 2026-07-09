---
title: "PHASE 6 - Operations gaps (usability + coverage parity)"
type: feat
status: planned
date: 2026-07-09
branch: feat/phase-6-operations-gaps
depth: deep
units: 23
---

# PHASE 6 - Operations Gaps Plan

## Current Posture

This plan follows `FIX_RUNBOOK.md` v2.4 Decision 7 and the current repo state:

- Phase 4 and Phase 7 remain parked. Do not build InnoVint/Vintrace adapters, parser calibration,
  export/API handling, or partner-specific migration assumptions in Phase 6.
- Phase 6 runs after Phase 5 lifecycle writers because corrections, archival guards, and split/reversal
  flows need the `ACTIVE`/`DEPLETED`/`ARCHIVED` lifecycle semantics to be real.
- The current tree already has Phase 5-style lifecycle seams: `src/lib/lot/lifecycle.ts`,
  archive/unarchive UI on lot detail, `verify:lifecycle`, and `verify:projection`.
- This is planning only. No source code is implemented by this file.

## Overview

Phase 6 closes day-to-day cellar operation gaps without adopting mutable-ledger behavior:

- Make blocked corrections understandable and actionable with a plain-language LIFO preview/unwind flow.
- Add real append-only reversal paths for `ADJUST`, `DEPLETE`, and explicit manual operator `SEED` where safe.
- Retire or reroute the current neutral-op in-place edit/delete path through a fenced model.
- Add a guarded metadata edit affordance for non-posting fields only.
- Add split-in-place and lees sub-lot primitives on top of existing lineage/fold machinery.
- Complete barrel-group workflow gaps using the existing `VesselGroup`, `VesselGroupMember`, and group fan-out code.
- Add long-tail operations: `DRAIN`, `DELESTAGE`, `COLD_STAB`, and `CUSTOM`.

The governing rule is unchanged: the ledger is append-only. Every volume, cost, compliance, capacity, bond,
tax-class, or lineage-affecting correction is a new event or a reverse-and-rebook composite, never an
in-place mutation.

## Why This Runs After Phase 5

Phase 5 makes lifecycle status trustworthy. Phase 6 needs that in four ways:

- Reversing `DEPLETE` or a narrowly allowed explicit manual operator `SEED` may reopen a zero-balance lot;
  the Phase 5 lifecycle helper is the correct place to move `DEPLETED -> ACTIVE`.
- Archived lots must stay closed to normal cellar work; Phase 6 reversal/rebook paths need the existing
  archived-write guard and the explicit correction/reversal reopen escape hatch.
- Split-in-place and lees sub-lots create or drain child lots; status sync must keep parent/child states
  honest after the fold.
- UX needs to distinguish "depleted but correctable" from "archived by choice" before offering edit,
  unwind, split, or rebook actions.

Phase 6 must not restate or rebuild Phase 5. It consumes the lifecycle helpers and extends the operation
surface around them.

## Split Verdict

Phase 6 is too broad for one safe `/work` session. It should be split into five separately planned and
shipped subplans:

| Subphase | Name | Why it stands alone | Depends on |
| --- | --- | --- | --- |
| 6A | Correction UX and reversal gaps | Touches the universal reverser, LIFO guard, risky verifier tenant cleanup, and ADJUST/DEPLETE/SEED semantics. | Phase 5 |
| 6B | Fenced metadata edit affordance | Retires the unsafe neutral edit/delete model and creates the whitelist/edit-rebook boundary. | 6A preferred |
| 6C | Split-in-place and lees sub-lots | Adds new lineage-writing product operations; needs correction semantics stable. | 6A |
| 6D | Saved vessel/barrel group workflows | Builds on existing `VesselGroup` and group fan-out; cost/barrel checks are high-risk enough to isolate. | 6A; can run before 6C if needed |
| 6E | Long-tail operations | Evaluates long-tail operation candidates and adds enum values only after semantic proof. | 6A, 6B |

Recommended order: **6A -> 6B -> 6C -> 6D -> 6E**.

## Problem Frame

Cellarhand has a strong append-only spine, but several incumbent-parity gaps remain visible in daily use:

- `ADJUST`, `DEPLETE`, and `SEED` currently fail closed in `src/lib/ledger/reverse.ts`; the UI can only say
  "record a new adjustment," not guide a safe correction.
- `src/lib/cellar/edit.ts` currently edits neutral treatments in place and hard-deletes neutral ops while
  retaining only audit rows. That path conflicts with Phase 6's fenced-edit model and must be retired or
  routed through an append-only/fenced path.
- `laterTouchedKeys()` in `src/lib/ledger/reverse-guard.ts` knows that a later operation blocks a correction,
  but it returns only keys. The UX cannot name the blocking op, preview the chain, or offer a safe unwind.
- Split tooling exists for press/saignee and blends, but there is no one-action in-place split for a resident
  lot and no first-class lees sub-lot primitive.
- `VesselGroup` and `VesselGroupMember` already exist, and `src/lib/cellar/group-apply.ts` fans operations
  across members, but the workflow does not yet cover combine/break group behavior or barrel-group parity.
- The long tail lacks named ops such as drain, delestage, cold stabilization, and a balanced custom operation
  with a clear free-text label location.

Doing this in one pass would mix verifier migration, reverser semantics, schema enum work, lineage rules,
barrel-cost projection, and high-friction UI. The safe path is to land narrow subplans with real gates.

## Non-Goals

- No Phase 4 InnoVint adapter or synthetic demo work.
- No Phase 7 Vintrace connector, API, sandbox, export bundle, or partner-specific migration work.
- No incumbent data assumptions and no real partner export/API parsing.
- No recurring work-order engine or task-skip expansion.
- No granular permissions matrix. Use the existing admin-only gate for high-risk actions until a richer
  owner/capability model exists.
- No in-place ledger mutation, line rewrite, ledger delete, or durable snapshot rewrite.
- No phantom-vessel round trips for split or group workflows.
- No barrel-cost redesign. Phase 6 must preserve the existing barrel-fill cost fold.
- No custom free-text operation that bypasses the controlled `OperationType` vocabulary.

## Current Code Anchors

### Ledger and Reversal

- `src/lib/ledger/write.ts` is the write chokepoint: balance, tenant visibility, archive guard, TAXPAID-1
  guard, projection fold, barrel-fill fold, bottled-state fold, compliance amendment cascade, and lifecycle
  status sync all run there.
- `src/lib/ledger/reverse.ts` is the universal dispatcher. It currently routes cellar/rack/sparkling/bottle/
  transform/blend/bond reversals, but returns non-reversible verdicts for `SEED`, `ADJUST`, `DEPLETE`, and
  `CORRECTION`.
- `src/lib/ledger/reverse-guard.ts` provides `laterTouchedKeys()` and `downstreamLineageChild()`. It needs a
  richer blocker/chain API for UX preview.
- `src/lib/cellar/correct.ts`, `src/lib/vessels/rack-core.ts`, `src/lib/transform/reverse.ts`,
  `src/lib/blend/blend-correct.ts`, and sparkling correctors are the family-specific reversal precedents.
- `scripts/verify-reverse.ts` and `scripts/verify-reverse-transform.ts` currently run against
  `org_bhutan_wine_co`. New Phase 6 verifier expansion must first move these to Demo Winery or fork new
  Demo-only verifiers.

### Bulk SEED/ADJUST/DEPLETE

- `src/lib/bulk/actions.ts` writes manual `SEED` via `addComponent`, `ADJUST` via `updateComponentVolume`,
  and `DEPLETE` via `removeComponent`.
- `src/lib/migration/publish.ts` writes migration `SEED` with `captureMethod: "IMPORT"` and `batchId`.
- `scripts/migrate-legacy-lots.ts` also writes legacy/manual-style seed operations.
- `src/lib/ledger/write.ts` persists `captureMethod`, `commandId`, `batchId`, and `metadata`, which gives
  enough data to distinguish explicit manual seed, migration/import seed, and compensating seed variants,
  but Phase 6 must still add a fail-closed classifier.

### Edit Path

- `src/lib/cellar/edit.ts` currently permits in-place updates to `LotTreatment` rows and in-place update to
  `LotOperation.note` for neutral ops, plus hard delete of neutral `LotOperation` rows.
- `src/lib/cellar/actions.ts` exposes `editOperationAction` and `deleteOperationAction`.
- `src/app/(app)/lots/[id]/LotDetailClient.tsx` exposes timeline edit mode and calls those actions.
- This path must be retired or routed through the fenced model before Phase 6 is considered complete.

### Split, Lees, and Lineage

- `src/lib/transform/press-core.ts` already draws one parent into fraction children and records `SPLIT`
  lineage.
- `src/lib/transform/crush-core.ts` and `src/lib/transform/reverse.ts` establish transform idempotency and
  append-only reversal patterns.
- `src/lib/blend/blend-core.ts` supports new/grow blends and split destinations.
- `src/lib/lot/lineage.ts` defines current vocabulary; Phase 5 removed the stale `TRANSFORM` expectation.
- `prisma/schema.prisma` already has `Lot.sublotTag` for human sublot labels.

### Barrel Groups

- `prisma/schema.prisma` already defines tenant-scoped `VesselGroup` and `VesselGroupMember`.
- `src/lib/vessels/groups.ts` provides script-safe group CRUD.
- `src/lib/cellar/group-apply.ts` fans `ADDITION`, `FINING`, `FILTRATION`, `CAP_MGMT`, `LOSS`, and `TOPPING`
  across saved groups or ad-hoc vessel lists.
- `scripts/verify-cellar-ops.ts` already exercises group fan-out.
- `src/lib/cost/barrel-fold.ts` and `verify:cost` are the safety gates for barrel amortization.

## Key Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Phase shape | Split into 6A-6E | One all-in Phase 6 would mix too many governed seams and verifier changes. |
| Reversal model | Append-only compensating events only | Extends LEDGER-10 without mutating historical rows. |
| LIFO UX | Backend names blocking operations, proves the whole unwind chain is currently reversible, previews it, then revalidates before mutation | Plain-language LEDGER-11 needs concrete blockers; one-click unwind must not surprise-write half a chain. |
| `SEED` reversal | Fail-closed by default; allow only explicitly classified post-cutover manual operator seeds | MIGRATE-1 and older legacy import scripts make "ordinary seed" ambiguous. Import/system/legacy/compensating seeds are not generic undo targets. |
| Fenced metadata edit | Whitelist non-posting fields only; everything else reverse-and-rebook | Prevents report/cost/fold corruption while giving a usable edit affordance. |
| Reverse-and-rebook | Family-specific typed adapters only, no generic replay | Rebooking must recreate side tables and family metadata (`LotTreatment`, `VesselTransfer`, state events, costs, work-order attempts, bond/tax metadata) correctly. |
| Neutral edit/delete path | Retire hard delete and in-place treatment edits, or route them through the fenced model | Current behavior conflicts with the Phase 6 correction philosophy. |
| Split-in-place | New product core over existing fold/lineage/cost-transfer machinery, no phantom vessel | Incumbent parity without vessel theater, while preserving cost roll-up and reversal correctness. |
| Lees sub-lot | Child lot with `sublotTag` and `SPLIT` lineage; external counter-leg only for true loss | Lees can be tracked as wine only when it remains a resident lot; otherwise it is loss. |
| Barrel groups | Reuse `VesselGroup`/`VesselGroupMember` and fan-out code | Avoids creating a parallel barrel-group model. |
| Long-tail ops | Semantic-fit gate before enum migration | Do not add sticky enum values for incumbent-like labels until they beat existing `RACK`/`LOSS`/`DEPLETE`/`CAP_MGMT`/`CUSTOM` shapes. |
| `CUSTOM` label | Explicit open decision in 6E before implementation | The free-text label must not be hidden in an inconsistent place. |

## Subphase 6A - Correction UX and Reversal Gaps

### Goal

Make correction flows safer and clearer:

- Move new reversal verifier work to Demo Winery.
- Add backend blocker data for LIFO preview.
- Add explicit-confirm LIFO unwind orchestration for admins.
- Add append-only reversal paths for `ADJUST`, `DEPLETE`, and safe explicit manual operator `SEED`.
- Keep migration/import/legacy/system `SEED` semantics distinct from explicit manual seed reversal.

### Requirements

- **MUST:** New verifier work uses `runAsTenant("org_demo_winery", ...)`, never Bhutan Wine Co.
- **MUST:** Every verifier that will be extended or required as Phase 6 acceptance proof must be Demo
  Winery or tenant-parametric before expansion. This includes `verify:reverse`, `verify:reverse-transform`,
  `verify:projection`, and any Phase-6-adjacent verifier discovered in the audit.
- **MUST:** Existing Bhutan-targeted scripts must not be listed as acceptance proof for new Phase 6
  behavior. Either migrate them to Demo Winery or create Demo-only Phase 6 verifier(s).
- **MUST:** `laterTouchedKeys` gains a sibling API that returns blocking operation ids, types, observed dates,
  affected lots/vessels, and whether each blocker is itself reversible.
- **MUST:** UI preview names the blocking operation and shows the LIFO chain before applying unwind.
- **MUST:** LIFO unwind is admin-gated under the current `adminAction` access model. Do not promise
  owner-specific gating until the app has an owner role/capability model.
- **MUST:** LIFO preflight proves the whole chain is reversible before the first mutation. Partial success is
  only acceptable after a race/revalidation failure and must be reported as a stopped unwind, not success.
- **MUST:** LIFO execution is idempotent across double-submit/retry, using an `unwindGroupId`/metadata marker
  or equivalent.
- **MUST:** LIFO has hard blocks for filed-period operations unless an amendment-safe path is explicitly
  supported, work-order-owned operations unless the work-order rejection path owns the reversal, tax-paid
  boundaries, and mixed-family chains unless every family in the chain is explicitly supported by the planner.
- **MUST:** `ADJUST` reversal writes a compensating `CORRECTION` that restores the prior projection.
- **MUST:** `DEPLETE` reversal writes a compensating `CORRECTION` that re-admits the depleted volume unless
  TAXPAID-1 or capacity/bond guards block it.
- **MUST:** `ADJUST`/`DEPLETE`/`SEED` inverse lines preserve or validate all ledger metadata required by
  downstream folds: bucket, bottle deltas, bond fields, durable code snapshots, reason semantics, original
  `observedAt`, and any cost/compliance hooks.
- **MUST:** `ADJUST`/`DEPLETE`/`SEED` reversals call or introduce cost-reversal/cost-transfer hooks where the
  original operation produced cost artifacts, and they assert filed-period amendment behavior.
- **MUST:** Safe `SEED` reversal is DB-state dependent. Add a DB-aware `reversibilityForOperation` or
  equivalent timeline projection; keep `reversibilityOf()` as a coarse type/default table only.
- **MUST:** `SEED` reversal is fail-closed unless a positive marker proves it is a post-cutover manual
  operator seed, for example `metadata.seedKind === "MANUAL_OPERATOR_SEED"` or an equivalent explicit
  marker introduced by 6A.
- **MUST:** Any `captureMethod === "IMPORT"`, `system@day-zero-migration`, `Lot.isLegacy`, `legacySnapshot`,
  migration command prefix, migration `batchId`, or compensating `correctsOperationId`/family-reversal seed
  refuses generic reversal.
- **MUST:** A manual seed is reversible only if it is single-lot, latest, no downstream operation, no
  downstream lineage, no cost artifact, no filed-period/compliance implication, no bottle-storage side
  effect, and no adopted use by another family. Otherwise route to adjustment/rebook guidance.
- **MUST:** Published and legacy migration `SEED` operations are not reversed through the generic timeline
  path. Corrections to a migration seed require a migration correction policy outside 6A unless explicitly
  scoped.
- **MUST:** Unpublished migration draft discard stays in the migration batch lifecycle, not the ledger
  reverser.
- **MUST:** Reversal paths call existing lifecycle sync via `writeLotOperation` and respect archived-lot
  reopen rules.

### Likely Files

- `src/lib/ledger/reverse.ts`
- `src/lib/ledger/reverse-guard.ts`
- `src/lib/cellar/correct.ts`
- `src/lib/bulk/actions.ts`
- `src/lib/lot/data.ts`
- `src/lib/lot/timeline.ts`
- `src/app/(app)/lots/[id]/LotDetailClient.tsx`
- `src/components/vessel/TimelineEntryDetail.tsx`
- `src/lib/ledger/actions.ts`
- `src/lib/assistant/tools/undo-operation.ts`
- `src/lib/actions.ts` or existing admin action helpers
- `scripts/verify-reverse.ts`
- `scripts/verify-reverse-transform.ts`
- new `scripts/verify-phase6-reversal.ts` if the existing scripts cannot be safely moved immediately
- `test/reverse-verdict.test.ts`

### Implementation Units

#### 6A.0 - Phase 6 Verification Tenant Audit

Inventory every script and test that Phase 6 will extend or list as an acceptance gate.
`scripts/verify-reverse.ts`, `scripts/verify-reverse-transform.ts`, and `scripts/verify-projection.ts`
currently need tenant review before they can be expanded or used as proof for new behavior. Before adding
Phase 6 cases, either:

- migrate those scripts to Demo Winery and update fixture namespaces/scrub logic, or
- leave them as historical regression scripts and create Demo-only Phase 6 verifier(s).

Output must be recorded in `PHASE-6-REPORT.md`.

#### 6A.1 - Blocker Detail API

Add a richer guard helper, for example:

```ts
export type LaterTouchedBlocker = {
  operationId: number;
  type: OperationType;
  observedAt: Date;
  enteredBy: string;
  lotIds: string[];
  vesselIds: string[];
  keys: string[];
  reversible: boolean;
  reason?: string;
};
```

Keep `laterTouchedKeys()` for existing callers. New code should use `laterTouchedBlockers()` or equivalent.

#### 6A.2 - LIFO Chain Planner

Create a pure-ish planner that starts from a blocked op and returns:

- `blockedBy`: the immediate later operation(s)
- `unwindOrder`: newest-first operations that can be reversed
- `cannotUnwind`: blockers with non-reversible verdicts or family-specific hard blocks
- `previewLines`: plain-language rows for the UI

The planner must not mutate. It must return a stable preview token/hash over the planned operation ids,
types, corrected status, observedAt, and affected keys. The executor re-plans and compares before mutation.

#### 6A.3 - LIFO Unwind Action

Add an admin-gated action that takes a starting operation id, re-plans, verifies the preview token, then
reverses in newest-first order. It must preflight the whole chain before the first mutation. If a race
appears after preflight, it must stop at the first unexpected block and return a partial-stopped result
honestly.

Do not make this a background fire-and-forget job. The user needs a visible result and any stop reason.

Verifier cases must cover preview drift, stale preview execution, duplicate submit, concurrent admin
unwind, and a blocker appearing mid-chain.

#### 6A.4 - ADJUST Reversal Core

Implement the compensating correction for `ADJUST` by inverting its ledger lines and writing `CORRECTION`
through `writeLotOperation` at the original operation's `observedAt`. Capacity, TAXPAID-1, archive, bond,
cost, bucket, bottle-state, and amendment guards remain active.

Open detail for `/work`: whether this can reuse `correctOperationCore` directly or needs a small wrapper
because current `CELLAR_TYPES` excludes `ADJUST`.

#### 6A.5 - DEPLETE Reversal Core

Implement `DEPLETE` reversal similarly, with extra UX copy around "restore removed volume." Block if
restoration would violate capacity, taxpaid, bond, filed-period, or cost rules.

#### 6A.6 - SEED Reversal Policy and Core

Implement seed reversal only after fail-closed classification:

| Seed kind | Detection | Phase 6 behavior |
| --- | --- | --- |
| Explicit manual operator seed | Positive marker such as `metadata.seedKind === "MANUAL_OPERATOR_SEED"` and no legacy/import/system markers | Reversible only with no downstream touches, no lineage/cost/compliance adoption, no bottle-storage side effects, and no filed-period implication. |
| Published Phase 3 migration seed | `captureMethod === "IMPORT"` and/or migration `batchId`/metadata/command prefix | Not generically reversible in 6A. Show migration-specific guidance. |
| Legacy import seed | `captureMethod === "IMPORT"` without batch metadata, `system@day-zero-migration`, `Lot.isLegacy`, or `legacySnapshot` | Not generically reversible in 6A. Show migration-specific guidance. |
| Unpublished migration draft | Staged rows, no live `LotOperation` | Discard through migration batch lifecycle, not `reverseOperationCore`. |
| Compensating seed from another reversal | `correctsOperationId` or metadata points at a family reversal | Not reversed as origination; use the parent family guidance. |

This classification must be explicit in code and verifier assertions.

#### 6A.7 - Timeline UX

Update disabled Undo copy to name the blocking op when available and offer a preview action for admins.
For non-admin users, show the blocker and route to an admin rather than hiding the reason.

### 6A UX Contract

- Preview layout shows: original blocked operation, immediate blockers, newest-first unwind chain, affected
  lots/vessels, before/after balances when computable, filed-period/tax/cost/work-order stop reasons, and
  whether the chain crosses operation families.
- Admin confirmation must say how many ledger events will be written. If more than one operation is in the
  chain, require an explicit confirmation control; typed confirmation is acceptable but not mandatory if the
  modal is otherwise unmistakable.
- Non-admin users see blocker details and an "Ask an admin to unwind" path or equivalent request/copy. Do
  not show a dead disabled button with only a tooltip.
- Partial-stopped result screen lists operations reversed, operations not touched, the new blocker/reason,
  and the next safe action.
- Loading/error states cover: planning, stale preview, execution, capacity conflict, archived lot block,
  TAXPAID block, work-order-owned block, filed-period block, and concurrent mutation.
- Keyboard focus moves into the preview modal/drawer and returns to the triggering timeline action.
  Recalculated validation and partial-stopped results must be announced with `aria-live` or equivalent.

### 6A Verify Gates

- Demo Winery `verify:reverse` / `verify:reverse-transform` after migration, or a new Demo-only
  `verify:phase6-reversal`. Do not count Bhutan-targeted scripts as proof for new Phase 6 behavior.
- New/extended Demo Winery verifier for `ADJUST`, `DEPLETE`, explicit manual `SEED`, import/legacy/
  compensating `SEED` refusal, and LIFO preview/unwind.
- `npm run verify:lifecycle`
- `npm run verify:projection`
- `npm run verify:taxpaid`
- `npm run verify:ttb`
- `npm run verify:tenant-isolation`
- `npm run test`
- `npm run lint`
- `npm run build`

## Subphase 6B - Fenced Metadata Edit Affordance

### Goal

Replace the current ambiguous neutral-op edit/delete path with two fenced edit affordances:

- guarded metadata edit for non-posting, non-fold fields only;
- reverse-and-rebook composite for posting/fold-affecting edits.

### Requirements

- **MUST:** Retire hard delete of neutral ops or route it through an append-only void/correction path.
- **MUST:** Retire in-place mutation of treatment fields that affect material, rate, total, duration, or
  anything report/cost/fold visible.
- **MUST:** Allow only whitelisted metadata fields in the direct metadata edit path.
- **MUST:** Explicitly forbid dates, volumes, vessel, lot, tax class, bond, material quantity, rate, bucket,
  line reason, capture method, operation type, cost, and any compliance/report-affecting field.
- **MUST:** Append an audit event for every direct metadata edit.
- **MUST:** A posting edit is presented as one Edit action but executes reverse original plus rebook new
  operation. The visual timeline can group it, but storage remains two append-only writes.
- **MUST:** Reverse-and-rebook is available only through family-specific typed adapters. A generic replay
  path is forbidden because it can miss side tables and domain metadata.
- **MUST:** Work-order-sourced operations keep WORKORDER-1 semantics. If a task owns the operation, route to
  task rejection/re-issue flow rather than silently editing the operation.
- **MUST:** Operations in filed/amended compliance periods must not have explanatory notes rewritten in
  place. Prefer an append-only supplemental note/audit entry unless the field is proven non-reporting and
  non-provenance.
- **MUST:** If 6B introduces any new `OperationEditGroup` table, it must follow the full Phase-12 tenant
  checklist from `AGENTS.md` and extend `verify:tenant-isolation`. Default v1 remains metadata-only.

### Likely Files

- `src/lib/cellar/edit.ts`
- `src/lib/cellar/actions.ts`
- `src/lib/ledger/reverse.ts`
- `src/lib/lot/timeline.ts`
- `src/lib/lot/data.ts`
- `src/app/(app)/lots/[id]/LotDetailClient.tsx`
- `src/components/vessel/TimelineEntryDetail.tsx`
- `src/lib/work-orders/approval.ts`
- `src/lib/assistant/tools/undo-operation.ts`
- `scripts/verify-cellar-ops.ts`
- new `scripts/verify-fenced-edit.ts`
- `test/lot-timeline.test.ts`

### Implementation Units

#### 6B.1 - Field Classification

Create a central whitelist and refusal list, likely in `src/lib/cellar/edit-policy.ts`:

- allowed direct metadata fields: supplemental note/free text, display label for a custom/non-posting label
  if 6E chooses the same storage, tags if such a field exists, UI-only note fields.
- disallowed direct fields: everything that changes ledger lines, treatments, cost, compliance, bond/tax,
  vessel, lot, observedAt, type, or operation family semantics.

The whitelist must be tested independently.

#### 6B.2 - Retire Neutral Hard Delete

Replace `deleteNeutralOperationCore` with a void/correction path, or remove the delete affordance entirely
and route users to Undo. Audit-only hard deletion is no longer acceptable for Phase 6. The old
`deleteOperationAction` must be removed or made impossible to call for ledger operations at the action layer,
not only hidden in the UI.

#### 6B.3 - Retire Neutral In-Place Treatment Edit

Replace `editNeutralOperationCore` for posting-like treatment changes with reverse-and-rebook. Note-only
edits may remain only if they use the guarded metadata path and do not rewrite provenance for filed/amended
periods. The old `editOperationAction` must be removed or made impossible to call for posting/fold fields at
the action layer.

#### 6B.4 - Reverse-and-Rebook Composite

Add a coordinator for each supported family, not a generic ledger replay. Each adapter owns typed replay
input and side-table behavior for its family. A family is unavailable until its adapter is written.

Each family adapter:

1. Loads original operation and validates it is editable by family policy.
2. Builds a preview of reverse + new operation, including side effects.
3. Executes reversal.
4. Executes the new operation with a metadata link to the original/edit group.
5. Returns a single UI result.

Adapters must explicitly recreate or decline to recreate `LotTreatment`, `VesselTransfer`, state events,
cost lines/transfers, work-order attempts, tax/bond metadata, compliance amendment behavior, and any family
metadata. If a side table exists and the adapter does not know how to recreate it, the edit is unavailable
with guidance.

Open detail for `/work`: whether to introduce `editGroupId` in `LotOperation.metadata` only, or a small
`OperationEditGroup` table. Default plan: metadata first unless query/report needs prove a table is worth it.
If a table is chosen, it is tenant-scoped with RLS and isolation tests.

#### 6B.5 - Timeline UI

Rename "Edit timeline" copy to avoid implying arbitrary edits. Present:

- "Edit note" for metadata-only edits.
- "Correct and rebook" for posting/fold changes.
- "Undo" for simple reversal.

Do not show delete for ledger operations.

### 6B UX Contract

- Timeline action decision matrix:
  - `Undo`: operation is currently reversible or conditionally reversible after DB-aware check.
  - `Edit note`: only supplemental/non-posting metadata is editable.
  - `Correct and rebook`: only when a family-specific adapter exists.
  - unavailable: show the exact reason, such as filed period, work-order-owned, taxpaid boundary, no adapter,
    archived lot, or unsupported side table.
- Reverse-and-rebook preview shows two layers: an operator summary ("replace this entry with...") and an
  expandable technical view ("reverse original" plus "write replacement").
- Grouped timeline display should collapse the correction pair into one narrative by default while allowing
  expansion to original, correction, replacement, audit, and metadata links.
- Forbidden-field attempts show inline reason text, not tooltip-only messaging.
- Loading/error states cover preview build, stale original, reverse failure, rebook failure, adapter missing,
  and work-order-owned refusal.
- Keyboard focus and screen-reader announcements follow the same modal/drawer rules as 6A.

### 6B Verify Gates

- New `verify:fenced-edit` package script if implementation adds a script.
- Metadata edit succeeds for whitelisted note/free-text field and appends audit.
- Metadata edit rejects observed date, volume, vessel, lot, tax class, bond, material rate/quantity, and op type.
- Old hard-delete and in-place treatment mutation paths are unreachable from UI and action/core layers.
- Reverse-and-rebook emits two append-only operations and does not mutate the original.
- Reverse-and-rebook refuses families without typed adapters and refuses originals with unsupported side
  tables.
- `npm run verify:reverse`
- `npm run verify:lifecycle`
- `npm run verify:projection`
- `npm run verify:cost`
- `npm run test`
- `npm run lint`
- `npm run build`

## Subphase 6C - Split-In-Place and Lees Sub-Lots

### Goal

Add first-class split and lees operations without phantom vessel movement.

### Requirements

- **MUST:** Split a resident lot in place into parent/child lots in the same vessel or across specified
  destination vessels without inventing a temporary vessel.
- **MUST:** Co-resident virtual lots are allowed only with explicit operator copy and verifier coverage
  proving later operations can target the separate lots honestly.
- **MUST:** Record truthful `SPLIT` lineage and source-vineyard inheritance.
- **MUST:** Inherit or explicitly resolve bond, tax class, ownership, and cost allocation for child lots.
- **MUST:** Use `Lot.sublotTag` for child labels where appropriate.
- **MUST:** Reuse or share math with existing press/saignee split machinery where possible.
- **MUST:** Add or invoke cost-transfer writers for split/lees so parent cost is not stranded and child
  cost basis is proportional or explicitly assigned.
- **MUST:** Lees sub-lot creation distinguishes retained lees wine from ordinary loss:
  - retained lees: child lot with `sublotTag`, vessel position, lineage;
  - discarded lees: normal loss, no child lot.
- **MUST:** Retained lees child lots are allowed only when the operator intends to separately work or track
  recoverable wine-bearing material. Sludge/disposal is loss, not inventory.
- **MUST:** Reversal is LIFO-guarded and append-only.
- **MUST:** No fake `TRANSFORM` lineage value; current lineage vocabulary remains honest.

### Likely Files

- `src/lib/transform/press-core.ts`
- `src/lib/transform/reverse.ts`
- `src/lib/ledger/math.ts`
- `src/lib/cost/*`
- `src/lib/lot/lineage.ts`
- `src/lib/lot/generate.ts`
- `src/lib/lot/code.ts`
- `src/lib/lot/data.ts`
- `src/app/(app)/bulk/*`
- `src/app/(app)/lots/[id]/LotDetailClient.tsx`
- new `src/lib/transform/split-core.ts` or `src/lib/cellar/split-core.ts`
- new `scripts/verify-split-in-place.ts`
- `test/lineage.test.ts`
- `test/ledger-math.test.ts`
- `test/cost-rollup.test.ts`

### Implementation Units

#### 6C.1 - Split Math

Extract or add a split planner that consumes one parent lot position and emits balanced lines for:

- parent negative leg(s)
- child positive leg(s)
- optional true loss external leg

It must preserve total volume and reject non-positive children, overdraw, and dust.
For co-resident virtual lots, the planner must also prove the output lot ids can be addressed separately
by subsequent operations.

#### 6C.2 - Child Lot Creation and Naming

Create child lots with inherited provenance, optional `sublotTag`, and generated code. Collision behavior
must follow Phase 1 naming rules: suggest disambiguation, do not silently mutate adopted human codes except
for generated post-go-live codes.

The child creation step must explicitly inherit or resolve bond, tax class, ownership, source-vineyard set,
and cost basis. If any of those cannot be resolved, the split is blocked before writing ledger lines.

#### 6C.3 - Lineage and Source Sets

Append `LotLineage.kind = "SPLIT"` edges and inherited `LotVineyard` rows. Do not use stale `TRANSFORM`.

#### 6C.3b - Cost Transfer

Add a reusable split/lees cost-transfer writer or invoke an existing one if available. The writer must:

- move proportional parent cost to each child;
- leave no stranded parent cost when the parent is fully split;
- handle retained lees as an explicit child basis or named exception;
- reverse cleanly when the split/lees operation is reversed;
- be covered by `verify:cost` and focused cost-rollup tests.

#### 6C.4 - Lees Sub-Lot Flow

Add a retained-lees path that creates a child lot and positions it in the chosen vessel. The UI must make
the operator choose retained lees vs discarded lees, because those have different ledger truth.

Retained lees copy must say it remains tracked wine inventory. Discarded lees copy must say it leaves
inventory as loss and no child lot is created.

#### 6C.5 - Reversal

Extend transform reversal or add a split-specific reversal path. It must block when the child has downstream
activity and it must keep lineage audit truth. Reversal must also reverse or compensate any split/lees
cost-transfer artifacts.

### 6C UX Contract

- Split form shows parent volume, child volumes, retained/discarded loss, remaining parent, and total
  conservation live as the operator types.
- Destination selection supports same vessel, different vessel, and multiple vessels only where the backend
  planner supports the exact shape. Capacity warnings are shown before submit.
- Child code/sublot-tag collision handling is visible before submit.
- Provenance preview shows inherited vineyard/source, bond, tax class, ownership, and cost allocation.
- Co-resident split copy says the lots are virtually separated in the same vessel and must be selected by lot
  in later operations.
- Lees choice is explicit: "retain as tracked lees lot" vs "discard as loss." Timeline labels distinguish
  retained lees from ordinary splits and discarded lees from ordinary loss.
- Loading/error states cover stale parent volume, capacity conflict, code collision, unresolved cost/bond/tax,
  archived lot, and downstream reversal block.

### 6C Verify Gates

- New split-in-place verifier under Demo Winery.
- Parent splits into children with conserved volume.
- Child codes/sublot tags are correct.
- `SPLIT` lineage exists; no `TRANSFORM`.
- Retained lees child remains live; discarded lees is only a loss.
- Child cost transfer is correct and reversible; no stranded parent cost after full split.
- Child bond/tax/ownership inheritance is correct or explicitly blocked.
- Reversal restores parent volume and marks new child lots corrected when appropriate.
- `npm run verify:reverse-transform`
- `npm run verify:lifecycle`
- `npm run verify:cost`
- `npm run verify:projection`
- `npm run test`
- `npm run lint`
- `npm run build`

## Subphase 6D - Saved Vessel/Barrel Group Workflows

### Goal

Finish saved vessel/barrel group workflows on top of the existing group model and fan-out engine. In Phase
6D, "break/combine" means group membership organization unless the user explicitly chooses a physical wine
movement, in which case the action routes to rack/blend/split cores.

### Requirements

- **MUST:** Account for existing `VesselGroup` and `VesselGroupMember`; do not add a parallel barrel group table.
- **MUST:** Account for existing vessel group fan-out code in `src/lib/cellar/group-apply.ts`.
- **MUST:** Use operator-language definitions:
  - "change group membership" for saved group organization;
  - "move/combine wine" for physical cellar work routed to rack/blend/split.
- **MUST:** Do not imply physical break/combine parity for pure membership actions.
- **MUST:** Preserve barrel-fill cost fold and avoid double-counting barrel cost.
- **MUST:** Group corrections operate per member and can unwind by shared `batchId` where safe.
- **MUST:** UX distinguishes saved group membership from a one-time ad-hoc vessel selection.

### Likely Files

- `src/lib/vessels/groups.ts`
- `src/lib/cellar/group-apply.ts`
- `src/lib/cellar/actions.ts`
- `src/app/(app)/bulk/GroupActions.tsx`
- `src/app/(app)/bulk/BulkClient.tsx`
- `src/lib/cost/barrel-fold.ts`
- `src/lib/cellar/correct.ts`
- `scripts/verify-cellar-ops.ts`
- `scripts/verify-cost.ts`
- new `scripts/verify-barrel-groups.ts` if needed

### Implementation Units

#### 6D.1 - Barrel Group Audit

Inventory what saved groups already support and make "break/combine" language explicit:

- Break group: deactivate/remove members only, or physically split a composite wine position?
- Combine groups: merge membership only, or physically combine wine?
- Group operation: fan-out per vessel, not one aggregate ledger op.

Default plan: membership break/combine is metadata/audit; physical wine combine/split routes to rack/blend/
split cores.

#### 6D.2 - Membership Workflow

Improve group creation, rename, deactivate, member add/remove, and combine/deactivate flows with audit. No
ledger operation is written for pure membership changes.

#### 6D.3 - Group Operation Preview

Before fan-out, preview members, skipped members, capacity risks, and per-member operation shape. The apply
engine already records per-member exceptions; the UX should show them before and after.

#### 6D.4 - Batch Correction

Harden `correctBatchCore` / shared `batchId` behavior so group fan-out can be unwound clearly:

- each member remains an independent ledger op;
- batch correction reports partial success honestly;
- LIFO blockers are named per member.

### 6D UX Contract

- Saved group screens use "members", "add/remove barrels", "deactivate group", and "merge group membership"
  for metadata workflows.
- Physical movement actions use cellar verbs: rack, blend, split, top, drain/loss. They do not hide behind
  "combine group."
- Group apply preview is a table with every member and predicted status: ready, skipped, blocked by
  capacity, blocked by tax/bond/cost, missing lot, or source vessel.
- After-action result table shows applied, skipped, failed, blocked by LIFO, capacity/tax/cost guard blocked,
  and remediation action where one exists.
- Batch correction preview is per member, not only shared `batchId`.
- Wide member/result tables remain scannable on mobile and keyboard navigable.

#### 6D.5 - Barrel Cost Assertion

Add verifier assertions that group fan-out into/out of barrels opens/closes barrel fills once per actual
barrel movement and does not double count cost.

### 6D Verify Gates

- Existing `verify-cellar-ops` extended or new `verify:barrel-groups`.
- `npm run verify:cost`
- `npm run verify:reverse`
- `npm run verify:lifecycle`
- `npm run verify:projection`
- `npm run test`
- `npm run lint`
- `npm run build`

## Subphase 6E - Long-Tail Operations

### Goal

Evaluate and, only where justified, add controlled operation coverage for `DRAIN`, `DELESTAGE`,
`COLD_STAB`, and `CUSTOM`. 6E starts with a semantic-fit gate; it does not assume all four become
`OperationType` enum values.

### Requirements

- **MUST:** Run a semantic-fit gate before any enum migration. Prefer existing operation families when they
  are truthful.
- **MUST:** Add an enum value only in the same subphase that ships that operation's core, reversibility
  verdict, UI label, compliance/cost mapping, and verifier.
- **MUST:** If an enum value is added, use an isolated enum migration before any code writes it and update
  `src/lib/ledger/vocabulary.ts` in lockstep with `prisma/schema.prisma`.
- **MUST:** Every long-tail op remains balanced and capacity-safe.
- **MUST:** `CUSTOM` remains a controlled op type with a required free-text label; it does not turn
  `OperationType` into arbitrary text.
- **MUST:** Decide where `CUSTOM` label lives before implementation.
- **MUST:** Long-tail ops use existing treatment/material/cost patterns where possible.
- **MUST:** Every candidate gets an explicit compliance decision before migration/code: maps to a 5120.17
  line, maps by an existing line reason, or is intentionally non-reportable with a test.
- **MUST:** Verifiers assert form-map/compliance behavior for every new op or explicit non-op routing.

### Semantic Fit Gate

Before adding any enum value, write a mini decision table in the 6E subplan:

| Candidate | Default before proof | Proof required for new enum |
| --- | --- | --- |
| `DRAIN` | Route to `LOSS`, `DEPLETE`, or `RACK` depending on whether wine is wasted, removed from tracking, or moved | A single drain semantics that is not already truthfully represented, with explicit line reason and compliance behavior. |
| `DELESTAGE` | Model as a linked rack-out/rack-back workflow or work-order sequence | Evidence that a single op is safer than linked `RACK` events and does not hide movement. |
| `COLD_STAB` | Treat as process/treatment/work-order state unless it includes measured loss/material addition | Evidence that it needs ledger semantics rather than treatment/process metadata. |
| `CUSTOM` | Controlled fallback only when the operator needs a named, balanced operation that selects an existing line shape | Required label, line shape, reversibility family, compliance decision, and search/timeline behavior. |

If semantics are not crisp, do not add the enum. This gate exists specifically to avoid importing incumbent
labels into the ledger just because they appeared in parity notes.

### Compliance and Cost Matrix

Each candidate must define before implementation:

- ledger lines and bucket/reason values;
- 5120.17 effect, including Part X if relevant;
- whether it is a reportable loss, non-reportable process step, transfer, depletion, or treatment;
- cost effect and whether cost lines/transfers are written;
- reversal family and LIFO behavior;
- timeline summary and disabled/reversal copy.

`DRAIN` is the danger case: "drain to waste", "drain off free-run", "empty this vessel", and "remove from
active tracking" are different ledger events.

### `CUSTOM` Label Open Decision

The label location must be decided in the 6E `/work` preflight:

| Option | Pros | Cons | Default recommendation |
| --- | --- | --- | --- |
| `LotOperation.metadata.customLabel` | No schema change; matches other operation details | Harder to query/index | Best v1 default |
| New nullable `LotOperation.customLabel` | Queryable and obvious | Schema migration for one op | Use only if reporting/search needs it now |
| `LotTreatment.kind/materialName` | Reuses neutral detail rows | Wrong for volumetric custom ops | Reject for general `CUSTOM` |

Default: `metadata.customLabel`, with UI/read-model helpers so callers do not parse JSON ad hoc.
Do not rely on ad hoc JSON parsing in callers. Add a helper such as `customOperationLabel(op)` and require
timeline/search/filter code to use it. Label length, uniqueness/non-uniqueness, and search behavior are
part of the 6E subplan.

### Likely Files

- `prisma/schema.prisma`
- enum migration under `prisma/migrations/*_phase6_<op>_enum/` only for the candidate(s) that pass the
  semantic-fit gate
- `src/lib/ledger/vocabulary.ts`
- `src/lib/cellar/treatments.ts`
- `src/lib/cellar/loss.ts`
- `src/lib/cellar/actions.ts`
- `src/lib/lot/timeline.ts`
- `src/lib/lot/data.ts`
- `src/app/(app)/bulk/*`
- `src/app/(app)/lots/[id]/LotDetailClient.tsx`
- `src/lib/compliance/form-map.ts`
- `scripts/verify-cellar-ops.ts`
- new `scripts/verify-long-tail-ops.ts`
- `test/reverse-verdict.test.ts`
- `test/lot-timeline.test.ts`

### Implementation Units

#### 6E.0 - Semantic Fit Gate

Decide, one candidate at a time, whether it is:

- an alias/UI wrapper over an existing operation family;
- a work-order/process/treatment record;
- a `CUSTOM` labeled operation using an existing line shape;
- or a truly new `OperationType`.

No enum migration occurs before this gate passes for that specific candidate.

#### 6E.1 - Enum Migration and Vocabulary

For each candidate that passes 6E.0 as a truly new op, add only that enum value in an isolated migration.
Update the TS mirror and tests in the same subphase. Do not batch unresolved candidates into one sticky enum
migration.

#### 6E.2 - Operation Semantics

Define each op before coding:

- `DRAIN`: first classify the cellar intent: waste/loss, remove from active tracking, rack/drain off, or
  full-vessel empty. Use `LOSS`, `DEPLETE`, or `RACK` unless a distinct semantics remains.
- `DELESTAGE`: default to linked rack-out/rack-back workflow or work-order sequence; do not fake a complex
  two-vessel movement as a note if it affects volume.
- `COLD_STAB`: classify as process state, work order, treatment, material addition, temperature record, or
  loss before considering a ledger op.
- `CUSTOM`: balanced generic operation with explicit label and chosen existing line/treatment shape unless
  the semantic-fit gate proves a new line shape is needed.

If semantics are not crisp, keep the op out of the enum until it is crisp.

#### 6E.3 - Timeline and UI Labels

Add display labels, summaries, and disabled/reversible affordance copy.

#### 6E.4 - Reversal Policy

Decide per op whether it routes to existing cellar correction, rack reversal, or remains non-reversible with
guidance. Prefer making every volume-changing op reversible through an existing family if the inverse is
unambiguous.

#### 6E.5 - Compliance/Cost Mapping

Update form-map/cost behavior only where semantics require it. Do not map `CUSTOM` to compliance lines
unless its label/metadata gives a controlled, verified reason.

### 6E UX Contract

- Each candidate has a capture spec before implementation: required fields, optional fields, validation,
  preview, timeline summary, reversal copy, disabled copy, and compliance/cost display.
- `CUSTOM` requires a short label at capture time. The label is non-unique unless a later product decision
  says otherwise; search/filter behavior must be specified before ship.
- If a candidate is routed to an existing operation family, the UI says what will actually be recorded
  ("record as rack", "record as loss", etc.) instead of hiding it behind an invented op.
- Loading/error states cover stale vessel volume, capacity conflict, missing label, unsupported semantics,
  compliance mapping refusal, and missing reversal family.

### 6E Verify Gates

- Semantic-fit decision recorded for each candidate before enum migration.
- `npm run verify:long-tail-ops` if added.
- `npm run verify:cellar-ops` if existing script is extended.
- `npm run verify:reverse`
- `npm run verify:ttb`
- focused `compliance-form-map` tests for every new op or explicit non-op routing
- `npm run verify:cost`
- `npm run verify:invariants`
- `npm run verify:tripwires`
- `npm run test`
- `npm run lint`
- `npm run build`

## Cross-Subphase Test Strategy

Every subphase should run its narrow verifier plus the relevant shared gates. A final Phase 6 integration
pass should run:

- `npm run verify:reverse`
- `npm run verify:reverse-transform`
- `npm run verify:lifecycle`
- `npm run verify:projection`
- `npm run verify:cost`
- `npm run verify:ttb`
- `npm run verify:taxpaid`
- `npm run verify:tenant-isolation`
- `npm run verify:invariants`
- `npm run verify:tripwires`
- `npm run test`
- `npm run lint`
- `npm run build`

New verifier writes must use Demo Winery fixtures (`org_demo_winery`). Do not add new Bhutan Wine Co test
data. If an existing verifier still targets Bhutan and is not migrated during a subphase, record that
explicitly as pre-existing verifier debt, do not expand it with new Phase 6 assertions, and do not count it
as acceptance proof for new Phase 6 behavior.

## Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Phase 6 attempted as one work session | High | High | Split into 6A-6E; ship with separate reports/gates. |
| New reversal paths corrupt tax-paid or migration boundaries | Medium | High | TAXPAID-1 guard remains in `writeLotOperation`; fail-closed SEED classifier; import/legacy/system/compensating seed refusal is tested. |
| LIFO unwind preview drifts from execution | Medium | High | Preview hash/token, whole-chain preflight, executor re-plan, idempotent metadata, and per-family core revalidation. |
| Neutral edit/delete path keeps mutating history | High | High | 6B explicitly retires/reroutes `src/lib/cellar/edit.ts` actions. |
| Metadata whitelist accidentally includes posting fields | Medium | High | Central edit policy plus negative tests for every forbidden field family. |
| Split-in-place creates fake lineage, phantom vessels, or stranded cost | Medium | High | Reuse real split math and `SPLIT` lineage; no temporary vessel modeling; cost-transfer writer and `verify:cost`. |
| Lees sub-lot is confused with loss | Medium | Medium | UI forces retained vs discarded lees choice; different ledger shapes. |
| Barrel group work double-counts barrel cost | Medium | High | Reuse existing group/fan-out; `verify:cost` checks barrel-fill fold. |
| Long-tail enum values become sticky wrong abstractions | Medium | High | Semantic-fit gate before enum migration; add one enum only with semantics/core/UI/reversal/compliance/verifier. |
| `CUSTOM` becomes arbitrary ungoverned operation text | Medium | Medium | Controlled enum value plus required label helper, not free-form `OperationType`; no ad hoc JSON parsing. |
| Verifier expansion touches real tenant data | Medium | High | Demo Winery only for new work; tenant audit before expanding existing reversal scripts. |

## Open Questions

1. **Should existing `verify:reverse` and `verify:reverse-transform` be migrated to Demo Winery in 6A, or
   should 6A add a new `verify:phase6-reversal` first?**
   - Plan default: migrate/fork only after reviewing scrub safety. Do not expand Bhutan-targeted scripts.

2. **What is the exact explicit manual `SEED` reversal scope?**
   - Plan default: fail closed unless a positive manual seed marker exists; then allow only a fresh
     single-lot create-in-vessel seed with no downstream operation, no import/legacy/system marker, no
     adopted lineage, no cost artifact, no bottle-state side effect, and no filed-period/compliance effect.

3. **Should reverse-and-rebook grouping get a table or metadata-only v1?**
   - Plan default: metadata-only unless UX/reporting needs a queryable group.

4. **What does "break/combine barrel groups" mean physically vs organizationally?**
   - Plan default: membership changes are metadata/audit; physical wine changes route to rack/blend/split.

5. **Where does `CUSTOM` label live?**
   - Plan default: `LotOperation.metadata.customLabel` plus helper accessors.

6. **Does `DRAIN` deserve a new enum at all?**
   - Plan default: no enum until semantic-fit proves it is not better represented as `LOSS`, `DEPLETE`, or
     `RACK`.

## Success Criteria

- [ ] Phase 6 is split into subplans 6A-6E before implementation starts.
- [ ] LIFO blocked corrections name blocking operation ids/types and can preview the unwind chain.
- [ ] Admin-gated LIFO unwind exists, preflights the whole chain, is idempotent, and is revalidation-safe.
- [ ] `ADJUST`, `DEPLETE`, and safe explicit manual operator `SEED` have append-only reversal paths.
- [ ] Import/legacy/system/compensating `SEED`, published migration `SEED`, and unpublished migration draft
      discard are explicitly separate refusal/discard paths.
- [ ] Existing neutral-op edit/delete behavior is retired or routed through the fenced model.
- [ ] Guarded metadata edit accepts only non-posting fields and rejects posting/fold/report fields.
- [ ] Reverse-and-rebook composite is append-only and visually understandable.
- [ ] Split-in-place works without phantom vessels, records truthful `SPLIT` lineage, and transfers cost
      correctly.
- [ ] Lees sub-lots work as retained child lots; discarded lees remains loss.
- [ ] Barrel-group workflow uses existing `VesselGroup`/`VesselGroupMember` and group fan-out.
- [ ] Barrel-group work does not regress barrel cost.
- [ ] `DRAIN`, `DELESTAGE`, `COLD_STAB`, and `CUSTOM` pass semantic-fit before any enum value is added; any
      shipped candidate has crisp semantics and guards.
- [ ] All new verifier work uses Demo Winery.
- [ ] Phase 4 and Phase 7 remain parked.
- [ ] `PHASE-6-REPORT.md` records subphase outcomes, deferrals, and gate results.

## Review Adjudications - Engineering

Findings folded in:

- Phase 6 is too large for one safe work session; split into 6A-6E.
- 6A must land before broad edit/split/group work because reverser semantics and verifier tenant cleanup are
  prerequisites.
- The verifier tenant audit must cover every Phase-6-required or extended verifier, not only
  `verify:reverse` and `verify:reverse-transform`; `verify:projection` also needs review.
- Current `src/lib/cellar/edit.ts` is a direct conflict with the fenced model: in-place treatment updates,
  op-note update, and hard-delete of neutral ops cannot survive as-is.
- `laterTouchedKeys()` is insufficient for UX; backend must return operation ids/types and a chain preview.
- Existing Bhutan-targeted verifiers must not be expanded or counted as proof for new Phase 6 behavior until
  migrated/forked to Demo Winery.
- `SEED` reversal must fail closed unless a positive manual seed marker proves it is not import/legacy/
  system/compensating origination.
- ADJUST/DEPLETE/SEED inverse lines must preserve bucket, bottle deltas, bond fields, durable snapshots,
  reason semantics, original observedAt, and cost/compliance hooks.
- Conditional `SEED` reversibility requires a DB-aware operation-level reversibility projection; the current
  type-only `reversibilityOf()` table is only a coarse default.
- LIFO unwind needs whole-chain preflight, idempotency, preview drift handling, and race coverage.
- Reverse-and-rebook must be family-specific with typed replay adapters; generic replay can miss side tables.
- Split/lees work needs cost-transfer writers and reversal handling, with `verify:cost` proving no stranded
  parent cost.
- Existing lifecycle helpers should be reused, not rebuilt.
- Barrel groups must account for existing `VesselGroup`, `VesselGroupMember`, `vessels/groups.ts`, and
  `cellar/group-apply.ts`.
- Current high-risk action gating is admin-only (`adminAction`), not a real admin/owner split.
- `CUSTOM` cannot be implemented until the free-text label storage is explicitly chosen.

## Review Adjudications - Council

External `ask_codex` / `ask_gemini` MCP council tools were not mounted in this session. I checked available
tools and did not find them, so this is a local multi-agent council-style adversarial review rather than a
live Codex+Gemini MCP transcript.

Findings folded in:

- The biggest failure mode is smuggling adapter/migration-partner work into Phase 6. The plan explicitly
  keeps Phase 4 and Phase 7 parked and forbids InnoVint/Vintrace adapter work.
- The second biggest failure mode is treating any import/legacy/system/compensating `SEED` like ordinary
  seed undo. The plan now default-denies `SEED` unless explicit manual seed metadata proves safety.
- A "one-click unwind" can become dangerous if preview and execution diverge. The plan now requires
  whole-chain preflight, preview token/hash, idempotency, race tests, and explicit stopped-partial copy.
- Metadata edit can become a loophole unless the forbidden field list is explicit. The plan names the
  forbidden field families and requires negative tests.
- Barrel-group work should reuse the existing group model; a new barrel-group abstraction would duplicate
  state and complicate cost.
- Long-tail ops should not be accepted merely because the enum can be extended. 6E now starts with a
  semantic-fit gate and adds enum values one candidate at a time only after semantics/core/UI/reversal/
  compliance/verifier are ready.
- DRAIN, DELESTAGE, COLD_STAB, and CUSTOM are not assumed to become core ops; they may route to existing
  `RACK`, `LOSS`, `DEPLETE`, `CAP_MGMT`, treatment, work-order, or `CUSTOM` shapes.
- Every new operation needs an explicit compliance/form-map decision before it can ship.

## Review Adjudications - Design

Findings folded in:

- Blocked correction copy must name the blocker: operation type, date, affected vessel/lot, and why it
  blocks. "Downstream activity" is not enough.
- LIFO unwind needs a preview screen, not a surprise mutation. Show the newest-first chain and stop reasons.
- LIFO unwind needs a real interaction contract: affected lots/vessels, before/after balances, stale-preview
  handling, partial-stopped result, and non-admin path.
- Edit affordances should be labeled by user intent: "Edit note", "Correct and rebook", "Undo", not a
  generic edit/delete mode that implies mutable history.
- Fenced edits need a field-level decision matrix and reverse-and-rebook needs grouped timeline display
  requirements.
- Retiring delete is a UX change: explain that erroneous entries are voided/corrected, not erased.
- Split-in-place UI should show parent/child volumes side by side with conservation visible.
- Split-in-place UI must show destination/capacity checks, child-code collision handling, and inherited
  provenance/bond/tax/ownership/cost preview.
- Lees UI must force the retained/discarded distinction because those are different operations, with visible
  consequence copy.
- Barrel group UX should distinguish saved group membership from one-time selected barrels.
- `CUSTOM` should require a short label at capture time and display that label in the timeline summary.
- Accessibility requirements added: keyboard/focus handling, visible disabled reasons, loading/error states,
  mobile-scannable wide tables, and `aria-live` announcements for recalculations/results.

## Gate Pipeline Summary

- **/plan:** Completed in this file.
- **Engineering review:** Completed via a read-only engineering review agent and folded into subphase
  structure, seed classification, cost-transfer requirements, DB-aware reversibility, verifier tenant audit,
  and test gates.
- **Council review:** External council MCP unavailable; completed via two read-only adversarial agents
  (types/data/contracts lens and winemaking/domain/compliance lens) and folded into seed default-deny,
  LIFO safety, semantic-fit gating, and compliance/form-map requirements.
- **Design review:** Completed via a read-only design review agent and folded into UX contracts for LIFO,
  fenced edits, reverse-and-rebook grouping, split/lees forms, group result states, long-tail capture specs,
  and accessibility.

**Verdict:** Phase 6 should not proceed as a single `/work`. Start with a dedicated **6A correction UX and
reversal gaps** plan/work session. The whole Phase 6 plan is now hardened enough to guide subplanning, but
each subphase still needs its own `/plan` before `/work`.
