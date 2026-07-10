---
title: Phase 9.4a - Group barrel-down / barrel-group racking (one reviewable task, one ledger op)
type: feat-plan
status: implemented
date: 2026-07-09
branch: claude/barrel-down-ledger-audit-64d0ad
depth: deep
depends_on:
  - docs/plans/2026-07-09-phase-9-3-universal-work-order-authoring-plan.md
supersedes_decision: "Phase 9.3 Unit 6 (group barrel-down -> future_phase); ships fallback (a) the real group-rack adapter"
---

# Phase 9.4a - Group barrel-down / barrel-group racking

Make real winery barrel-down and barrel-group racking safe and reviewable:

- "Barrel down T12 into B101-B110."
- "Rack barrels B101-B110 back to T15."

Each must remain **one** reviewable work-order task (not 10/20/60 near-identical rows) and must
not weaken ledger balance, idempotency, rejection, correction, tenant isolation, or work-order
safety. This is the fast-follow the Phase 9.3 plan named as **fallback (a): "a single logical task
completed via a new group-rack completion adapter"**
(`docs/plans/2026-07-09-phase-9-3-universal-work-order-authoring-plan.md:402-404`). 9.3 shipped
fallback (b) — `future_phase` — because of a stated model concern that this plan refutes below.

---

## 0. Base correction (already applied)

This branch (`claude/barrel-down-ledger-audit-64d0ad`) was cut from `d2c668d` — **one commit before
Phase 9.3 merged** (`50f0c72`, PR #108). Without the fix, `nl-proposal.ts`, `nl-resolve.ts`,
`proposal-readiness.ts`, `future_phase`, and the two verify scripts named in the brief do not exist
here. The branch had no unique commits and a clean tree, so it was fast-forwarded to `main`
(`git merge --ff-only main`). All file:line anchors in this plan are against `50f0c72`.

Logistics note (does not block planning): this worktree has **no `.env`**, so the DB-backed
`verify:*` gates (they hit Neon) must run from a checkout that has one — per the repo convention,
the `claude/*` branch is normally checked out in the MAIN repo dir (`C:/Users/russe/Documents/Wine-inventory`)
which carries `.env`. Pure unit tests (`vitest`), `lint`, `verify:invariants`, `verify:tripwires`,
`verify:naming` run anywhere.

---

## 1. The critical architectural question — answered

> Does a group barrel-down require N ledger operations, or can it be ONE `LotOperation` with many
> balanced `LotOperationLine` rows across source/destination vessels?

**Verdict: ONE `LotOperation`, many balanced lines. No schema change. The preferred model works.**

### Why 9.3 declined it — and why that reasoning was wrong

The 9.3 code comment (`src/lib/work-orders/nl-proposal.ts:133-136`) and Unit 6 note
(`docs/plans/2026-07-09-phase-9-3-...-plan.md:757`) state:

> "a group RACK is N member ops under one reviewable task, but `WorkOrderTaskAttempt` is
> one-op-per-attempt and reject reverses a single op — per-member completion state needs a
> schema/model change."

That conflates **N destinations** with **N operations**. A group barrel-down is **one operation
with N balanced lines**, not N operations. The ledger already models exactly this:

- `LedgerLine` (`src/lib/ledger/math.ts:21-41`) carries a per-line `vesselId`; an operation is just
  a list of signed lines across arbitrarily many vessels. `assertBalanced`
  (`math.ts:53`) only checks the signed sum is ~0.
- `writeLotOperation` (`src/lib/ledger/write.ts:113-356`) creates **one** `LotOperation` and appends
  **all** lines via one `createMany`. Its cross-tenant guard (`write.ts:120-144`), `foldLines`
  projection (`math.ts:66-85`), per-vessel capacity guard (`write.ts:196-206`), barrel-fill cost
  fold (`write.ts:284`), and compliance amendment cascade (`write.ts:347`) all iterate over an
  **arbitrary** set of vessels already.
- **The shape already ships.** `planPress` (`math.ts:363-394`) writes ONE `PRESS` op splitting one
  parent lot into N fraction lots across N vessels; `planCrushSplit` (`math.ts:322-340`) and
  `planBlendSplit` (`math.ts:227-252`) both write ONE op fanning across N destination vessels. These
  are the exact structural analogue of one tank -> ten barrels.
- **Reversal of a multi-line op already ships too.** `reverseTransformCore`
  (`src/lib/transform/reverse.ts:196-202`) reverses a PRESS (1 parent -> N children in N vessels) as
  a single unit: `planCorrection` (`math.ts:448-476`) over **all** the op's lines, loading **all**
  affected vessels, writing **one** `CORRECTION` op with `correctsOperationId`. `correctOperationCore`
  (`src/lib/cellar/correct.ts:82-165`) does the same for volumetric ops.

So one op -> one `WorkOrderTaskAttempt` (`operationId` is a single `Int?`, `@@unique([tenantId,
operationId])`, `prisma/schema.prisma:3423,3438`) -> `rejectTaskCore` reverses that one `operationId`.
**The 9.3 attempt model is preserved, not violated.** No per-member completion state, no schema
change. The only real deferral is *progressive* per-member completion ("4 of 10 barrels done across
sessions"), which is genuinely out of scope for v1 (see Non-goals).

### Identity, not blend

Barrel-down is a **RACK** (a move that preserves lot identity), NOT a **BLEND** (which mints a new
child lot + lineage). A tank of one wine put into ten barrels leaves the **same lot** in each barrel;
racking them back recombines the **same lot**. Therefore we do **not** reuse `planBlendSplit`/
`blendLotsCore` (they mint a child lot) and we do **not** type the op `BLEND`. We add
identity-preserving multi-vessel rack planners and type the op `RACK` (the correct in-bond,
compliance-neutral type). This also keeps the tax-paid guard and amendment cascade behaving exactly
as a normal rack.

### Reversal routing (the one wiring subtlety)

The single-vessel `RACK` reverser (`revertTransferCore`, `src/lib/vessels/rack-core.ts:319`) is bound
to the 1:1 `VesselTransfer` read-model, whose `fromVesselId`/`toVesselId` are single columns and which
loads only two vessels for balances/codes/capacity — it **cannot** model one-tank-to-ten-barrels. So a
group rack:

- writes its `RACK` op with `metadata: { groupRack: {...} }` and **no** `VesselTransfer` row, and
- is reversed by a new `reverseGroupRackCore` that mirrors `reverseTransformCore` exactly
  (`planCorrection` over all lines + `laterTouchedKeys` LIFO guard + `negateCostForReversedOp`).

`reverseOperationCore`'s `rack` branch (`src/lib/ledger/reverse.ts:344-349`) gains one sub-route: if
`resolveTransferIdForOp` returns null **and** `metadata.groupRack` is present, dispatch to
`reverseGroupRackCore`; otherwise the existing single-vessel path is unchanged. `reversibilityOf("RACK")`
stays `{reversible:true, family:"rack"}`, so the timeline verdict and `rejectTaskCore`
(`src/lib/work-orders/approval.ts:212-235`, unchanged) route correctly.

---

## Problem frame

Real wineries barrel down into multiple barrels constantly; it is table-stakes cellar work. Today
the instruction is refused three ways: the assistant tool excludes it
(`propose-work-order.ts:109`), the NL canonicalizer throws `GROUP_RACK_MESSAGE`
(`nl-proposal.ts:137-139,188,384-386`), and there is no group-rack core (`applyToGroup` fans
ADDITION/FINING/FILTRATION/CAP_MGMT/LOSS/TOPPING but **not** RACK, `cellar/group-apply.ts:18-31`).
The fix is additive and contained; the safety model is preserved by reusing the proven
one-op/many-lines + `planCorrection` machinery.

## Scope

In scope:
- Identity-preserving multi-destination and multi-source rack **math** (pure).
- A dedicated **group-rack core** (barrel-down + rack-to-tank) that writes ONE `RACK` op and a
  matching reverser. NOT `applyToGroup`.
- WO **completion** wiring so a group-rack task lands its single op inside `completeTaskCore`'s one
  `runLedgerWrite`.
- **NL/manual authoring**: group barrel-down / rack-barrels-to-tank become supported when they
  resolve safely; unresolved/ambiguous/unsafe stay honest (`needs_input`/`blocked`).
- **Review UI**: one parent row, expandable to members/allocations. Never N task rows.
- **Verification**: unit + e2e coverage; keep all 9.3 gates green.

## Non-goals (explicit)

- No zero-dilution domain-pack work. Do not rename `WineSku`. Do not add `TenantProductProfile`.
  Do not replace `LotForm`. No generic manufacturing abstraction.
- **No schema/migration** — the one-op model is proven feasible, so none is needed.
- Do NOT hide N independent ledger ops under one `WorkOrderTaskAttempt`. (We write exactly one op.)
- **Progressive per-member completion** ("mark 4 of 10 barrels done now, the rest tomorrow") is
  deferred — that is the per-member completion state that would need schema. v1 is **all-or-nothing**:
  the whole balanced op writes atomically or fails cleanly.
- Auto-blend on rack-to-tank into an occupied tank holding a *foreign* lot is deferred (surface as
  `needs_input`/`blocked`, do not silently mint a blend).

---

## Implementation units

### Unit 1 - Identity-preserving multi-vessel rack math (pure)
**Goal:** Two pure planners that build ONE balanced, identity-preserving operation across many vessels.
**Files:** `src/lib/ledger/math.ts` (add), `test/ledger-group-rack-math.test.ts` (new).
**Approach:** Add `planRackSplit(source: VesselLotBalance[], destinations: {vesselId, volumeL}[], lossL)`
(one source vessel -> many destinations) and `planRackMerge(sources: VesselLotBalance[], toVesselId,
lossL)` (many source vessels -> one destination). Both preserve each `lotId` (no child lot). For a
multi-lot source, split each lot proportionally across destinations via the existing centiliter-exact
`computeProportionalDraw` / largest-remainder helpers (mirror `planLedgerRack:101-135` and
`planBlendSplit:227-252`, but keep lot identity — one `-` source line per (lot, source vessel), one
`+` line per (lot, destination), optional external `loss` line). Reconcile EXACTLY (`Σdest = Σdraw -
loss`, mirror the guard at `math.ts:244`); call `assertBalanced` before returning.
**Tests:** single-lot source into 10 equal destinations balances and preserves lotId; multi-lot source
splits proportionally per lot and balances; explicit per-destination volumes; loss line; over-draw and
non-positive volume throw; `planRackMerge` of 10 barrels of the same lot -> one tank sums to one lot,
balances; largest-remainder leaves no dust (Σ exact to the centiliter).
**Depends on:** none.
**Execution note:** test-first (pure math, high leverage).
**Verification:** `npx vitest run test/ledger-group-rack-math.test.ts`.

### Unit 2 - Group-rack core + reverser
**Goal:** A dedicated core that writes ONE `RACK` op for barrel-down / rack-to-tank, plus its reverser.
**Files:** `src/lib/vessels/group-rack-core.ts` (new), `src/lib/ledger/reverse.ts` (wire),
`test/group-rack-core.test.ts` (new, if DB-inert paths allow) + coverage via Unit 7 e2e.
**Approach:**
- `groupRackTx(tx, actor, input, commandId)` — a tx-form (mirrors `rackWineTx`,
  `rack-core.ts:87`). Resolves the signed, **sorted** member list from `input` (barrel_down:
  one `sourceVesselId` + `destVesselIds[]`; rack_to_tank: `sourceVesselIds[]` + one `destVesselId`),
  loads balances in-tx, computes allocations (explicit per-destination actuals if given, else default
  greedy fill-to-capacity in sorted order for barrel-down / draw-all for rack-to-tank), runs
  headroom/draw pre-checks with friendly aggregated errors, builds lines via `planRackSplit`/
  `planRackMerge`, then `writeLotOperation(tx, { type: "RACK", lines, commandId, metadata: {
  groupRack: { direction, sourceVesselIds, destVesselIds, allocations } }, lotCodes, vesselCodes,
  capacityByVessel })`. Returns `{ operationId, message }`. **No `VesselTransfer`.** All-or-nothing
  (single op; any member failure aborts the whole write).
- `groupRackCore(actor, input)` — standalone wrapper owning `runLedgerWrite` (scripts/tests/timeline),
  mirroring `rackWineCore` (`rack-core.ts:208`).
- `previewGroupRack(input)` — resolved members + per-member allocation + headroom `ready`/`blocked`
  status; the data contract for Unit 6 (mirror `GroupApplyPreview.members[]`,
  `cellar/group-apply.ts:55-64`).
- `reverseGroupRackCore(actor, {operationId})` — `planCorrection` over ALL op lines, loading ALL
  affected vessels for balances/codes/capacity; write ONE `CORRECTION` with `correctsOperationId`;
  LIFO-guarded via `laterTouchedKeys`; `negateCostForReversedOp`. Copy the shape of
  `reverseTransformCore`/`planTransformReversal` (`transform/reverse.ts:48-78,196-202`).
- `reverse.ts`: in the `rack` case (`reverse.ts:344-349`), when `resolveTransferIdForOp` is null and
  `op.metadata.groupRack` is set, call `reverseGroupRackCore`; else unchanged. Load `metadata` in the
  op fetch at `reverse.ts:324-327`.
**Tests:** covered end-to-end in Unit 7 (needs DB). Pure allocation/default helpers unit-tested here.
**Depends on:** Unit 1.
**Patterns to follow:** `rackWineTx`/`rackWineCore` (`rack-core.ts:87,208`); `reverseTransformCore`
(`transform/reverse.ts`).
**Verification:** Unit 7 e2e (`verify:universal-work-order-authoring`).

### Unit 3 - Work-order completion dispatch
**Goal:** Route a group-rack task through `completeTaskCore` as one attempt / one op / one commandId.
**Files:** `src/lib/work-orders/execute.ts`.
**Approach:** In `dispatchOperationTx` (`execute.ts:64-208`), inside the `RACK` case, detect the group
shape from `payload` (a `groupRack` block / `destVesselIds[]` / `sourceVesselIds[]`) and call
`groupRackTx(tx, actor, groupInput, commandId)`; otherwise the existing `rackWineTx` path is unchanged.
Thread `commandId` into the op write (as crush/press already do) so `LotOperation.commandId @unique`
is a second idempotency guard behind the attempt-level `commandId` pre-check + P2002 duplicate-as-
success (`execute.ts:216-227,351-362`). The attempt stores the single `operationId` (`execute.ts:307`)
— unchanged.
**Tests:** Unit 7 asserts exactly one attempt + one op per completion and duplicate-commandId no-dup.
**Depends on:** Unit 2.
**Verification:** Unit 7 e2e.

### Unit 4 - Vessel range / group resolution
**Goal:** Resolve a member set from a range ("B101-B110"), a saved group name, or an explicit list.
**Files:** `src/lib/vessels/range.ts` (new), small helper in the resolve path.
**Approach:** `expandVesselRange("B101-B110")` -> ordered code list (prefix + zero-padded numeric
range; reject inverted/huge ranges). Resolve a saved `VesselGroup` by fuzzy name against
`listGroups()` (`vessels/groups.ts:27`), reusing its natural-numeric member sort
(`groups.ts:40,217`). Each member code resolves via the existing single-vessel `resolveVessel`
(`assistant/scope.ts:153`); zero/missing/inactive members surface honestly (see Unit 5). No range or
group-by-name resolver exists today — this is net-new.
**Tests:** `test/vessel-range.test.ts` — range expansion, padding, inverted/oversized rejection, group
name fuzzy match, dedup + sort.
**Depends on:** none.
**Verification:** `npx vitest run test/vessel-range.test.ts`.

### Unit 5 - NL / manual authoring (future_phase -> supported)
**Goal:** Group barrel-down / rack-barrels-to-tank become supported when they resolve safely; stay
honest otherwise.
**Files:** `src/lib/work-orders/nl-proposal.ts`, `nl-resolve.ts`, `template-vocabulary.ts`,
`proposal-readiness.ts`, `src/lib/assistant/tools/propose-work-order.ts`.
**Approach:**
- `nl-proposal.ts`: add union members `{ kind: "BARREL_DOWN"; from; toGroup; perDestVolumeL?;
  lossL?; note? }` and `{ kind: "RACK_TO_TANK"; fromGroup; to; lossL?; note? }` (`toGroup`/`fromGroup`
  = a range string, a saved-group name, or an explicit code list); add to `SUPPORTED` (`:126`);
  canonicalize in `canonicalizeRawIntents` and `parseWorkOrderUtteranceForEval`. Replace the
  `GROUP_RACK` throw (`:188,384-386`) with real intents when a group is expressed; keep a *reason*
  for the still-unsupported case (e.g. group with <2 resolvable members).
- `nl-resolve.ts`: add branches that expand the member set (Unit 4), resolve each member, and push a
  single `TaskBuild { taskType: "GROUP_RACK", values: { direction, sourceVesselId(s),
  destVesselId(s), members: sorted[], allocations?, lossL?, note? }, taskKey }`. Unresolved/ambiguous
  members -> `UnresolvedItem` / relayable error (mirror the RACK branch `nl-resolve.ts:229-259`).
- `template-vocabulary.ts`: add a `TASK_VOCABULARY["GROUP_RACK"]` entry -> `kind:"OPERATION"`,
  `opType:"RACK"`. `canonicalColumns` mirrors only the single side (source tank for barrel_down / dest
  tank for rack_to_tank); the member list lives in `plannedPayload` (canonical columns stay advisory).
- `proposal-readiness.ts`: add a `TASK_COVERAGE["GROUP_RACK"] = { state:"supported", ... }` (`:58`);
  add a `readTask` case (`:306`) that fans capacity/headroom across members — source-draw sufficiency
  (barrel_down), per-barrel headroom, tank headroom + foreign-resident check (rack_to_tank) — and
  extend `collectIds` (`:595`) to load member vessels.
- `propose-work-order.ts`: extend the `kind` enum (`:126-130`) + args (group/range/list, per-dest
  volumes), and rewrite the declining sentence (`:109`).
**Tests:** `test/work-order-nl-proposal.test.ts` additions — "Barrel down T12 into B101-B110" ->
one GROUP_RACK task, sorted members, `status:"ready"`; missing member -> `needs_input`/error;
over-capacity barrel -> `blocked`; rack-to-tank into a foreign-lot tank -> `needs_input`.
**Depends on:** Units 3, 4.
**Verification:** unit tests + `verify:work-order-nl` (must stay green) + Unit 7.

### Unit 6 - Review UI: one parent row, expandable members
**Goal:** The proposal/review shows ONE parent row ("Rack T12 to 10 barrels (B101-B110)"), expandable
to member/allocation detail. Never N task rows.
**Files:** `src/lib/work-orders/nl-proposal.ts` (extend `ProposedTask` with an optional `members`/
`allocations` detail array), `src/app/(app)/assistant/AssistantChat.tsx` and
`src/app/(app)/work-orders/new/NewWorkOrderClient.tsx` (render the collapsed parent row + expandable
members), execute screen (capture optional per-destination actual volumes at completion).
**Approach:** Reuse the `GroupApplyPreview.members[]` contract shape (status/message/totalL/capacityL,
`cellar/group-apply.ts:55-64`). The `WorkOrderReadinessPanel` stays section-oriented
(`WorkOrderReadinessPanel.tsx`); the per-task parent-row + expander lives on the proposal task card.
v1 completion is one atomic op with optional per-destination actual volumes; progressive per-member
completion is deferred (Non-goals).
**Tests:** manual QA (repo has no jsdom/RTL — UI ships manual-QA-only per house rule); pure
`ProposedTask` shaping covered in Unit 5 unit tests.
**Depends on:** Unit 5.
**Verification:** manual Demo-Winery walkthrough; `npm run build`.

### Unit 7 - Verification
**Goal:** Prove the safety claims; keep every 9.3 gate green.
**Files:** `scripts/verify-universal-work-order-authoring.ts` (flip the reject case at `:138`),
`scripts/verify-work-order-nl.ts` (unchanged, must stay green), new unit tests from Units 1/4/5.
**Approach:** In `verify-universal-work-order-authoring.ts` add group-barrel-down cases asserting:
(a) "Barrel down ZZUW-T12 into <barrels>" is **supported/ready** (not `future_phase`) and produces
**one** GROUP_RACK task with a sorted resolved member list; (b) authoring writes **no** ledger rows;
(c) completion writes exactly **one** `WorkOrderTaskAttempt`; (d) exactly **one** `LotOperation`;
(e) that op has multiple destination/source lines; (f) it **balances** (Σ deltaL = 0); (g) replaying
the same `commandId` does **not** duplicate; (h) reject reverses the **entire** op (one `CORRECTION`,
`correctsOperationId` set, projection restored); (i) a capacity/headroom failure **blocks cleanly**
(no partial write); (j) ambiguous/missing members -> `needs_input`/blocked. Keep green: SAMPLE_PULL
end-to-end, sanitation, crush/press readiness, source-agnostic parity, and the whole
`verify-work-order-nl.ts` happy path + sanitizer reject.
**Depends on:** Units 1-6.
**Verification (full gate list):** `verify:work-order-nl`, `verify:universal-work-order-authoring`,
`verify:invariants`, `verify:tripwires`, `verify:naming`, `verify:ai-native` (a new
`group-rack-core.ts` may flag as unreachable until the assistant authoring path + completion route
are recognized — wire or allow-list per the register), `lint`, full `vitest`. **No** migration ->
`verify:tenant-isolation` and the Phase-12 checklist are not triggered (the group op writes only
existing tenant-scoped rows through `writeLotOperation`, which auto-injects `tenantId`).

---

## Safety checklist (invariants preserved)

- **Ledger balance** — `assertBalanced` in both planners + `writeLotOperation:117`.
- **Vessel capacity** — per-vessel guard `write.ts:196-206` + `previewGroupRack` pre-check.
- **Archived-lot guard** — `assertLotsNotArchivedForNormalWriteTx` (`write.ts:147`), unchanged.
- **Tax-paid guard** — `write.ts:157-182` runs for the RACK op (in-bond move; not re-admission).
- **Same-tx compliance amendment cascade** — `cascadeAmendmentsForWrite` (`write.ts:347`) runs.
- **WO attempt idempotency** — attempt `commandId` pre-check + P2002 (`execute.ts:216-227,351-362`)
  + `LotOperation.commandId @unique` second guard.
- **Reject / correction semantics** — `reverseGroupRackCore` uses `planCorrection` + `laterTouchedKeys`
  (same D6/D15 LIFO guard as every other reverser); append-only, original never mutated.
- **Tenant isolation / RLS** — `runLedgerWrite` sets the tenant GUC; cross-tenant guard
  `write.ts:120-144`; no new global model.

## Final-report answers (to confirm after implementation)

1. **One `LotOperation` or schema?** One `LotOperation` with many balanced lines. No schema change.
2. **Reject/reversal?** `rejectTaskCore` -> `reverseOperationCore(operationId)` -> `rack` family ->
   (group route) `reverseGroupRackCore`: one compensating `CORRECTION` op inverting all lines,
   LIFO-guarded, `correctsOperationId` set. The whole op is reversed as a unit.
3. **Rows per completion?** Exactly **1** `WorkOrderTaskAttempt` and **1** `LotOperation` (with N
   lines) per completion.
4. **Deferred?** Progressive per-member completion; auto-blend on rack-to-tank into a foreign-lot
   tank; per-barrel WO-task fanout (never — it stays one task by design).
5. **Gates?** ALL PASSED. `tsc --noEmit` (0 errors); full `vitest` (1641 passed, 0 fail); `lint`
   (0 errors); `verify:invariants` (28/28 guarded); `verify:tripwires` (all accounted);
   `verify:ai-native` (group-rack-core reachable via complete-task; coverage doc regenerated);
   `verify:work-order-nl` (14 assertions); `verify:universal-work-order-authoring` (32 assertions,
   up from 13 — the group barrel-down e2e: one task → one attempt → one balanced op with 4 dest lines,
   duplicate-command no-op, reject reverses the whole op + restores the tank, headroom overflow blocks,
   missing members refused); `verify:naming` (25 assertions). The three DB-backed gates were run from
   the worktree against the main repo's `.env` (Demo Winery sandbox). No migration → `verify:tenant-isolation`
   + Phase-12 checklist not triggered.

## Confidence

| Section | Confidence | Notes |
|---|---|---|
| Architectural verdict (one op) | HIGH | Proven by `planPress`/`planBlendSplit` + `writeLotOperation` reading real code; identical shape ships today. |
| Reversal design | HIGH | Mirrors shipped `reverseTransformCore`; single contained `reverse.ts` sub-route. |
| Completion wiring | HIGH | `dispatchOperationTx` RACK-branch discrimination is a small, local change. |
| NL authoring | MEDIUM | New range/group-name resolver is net-new; readiness capacity fan-out across members is new code (single-vessel ATP path today). |
| Review UI | MEDIUM | Repo has no jsdom/RTL -> UI ships manual-QA-only; parent-row/expander is new. |
| Verification/logistics | MEDIUM | DB-backed `verify:*` need a checkout with `.env` (this worktree has none). |
