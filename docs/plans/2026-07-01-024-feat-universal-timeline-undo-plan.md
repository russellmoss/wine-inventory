---
title: Universal timeline undo (one reversal surface for every operation)
type: feat
status: 024a-completed
date: 2026-07-01
branch: main
depth: standard
units: 8
sequencing: "AFTER 2026-07-01-023-feat-multitenancy-foundation — build tenant-aware, not retrofitted"
---

## Overview

Make the lot timeline the ONE place to undo any operation. Reversal logic already exists for most
op types but is scattered across three subsystems and surfaced in three different places, and four
op types can't be undone anywhere. This unifies them behind a single `reverseOperationCore(operationId)`
dispatcher and exposes a consistent "Undo/Revert" affordance on every reversible timeline event, so a
user opens a lot's timeline and walks any step back (newest-first), with a clear reason shown when
something genuinely can't be undone.

## Problem Frame

The app is an append-only ledger, so "undo" already means writing a compensating CORRECTION op, never
deleting history — that principle is right and consistent. What's uneven is the *surfacing*: reversal
is fragmented, so a user can undo a fining from the timeline but must hunt elsewhere to undo a rack, a
tirage, or a bottling, and cannot undo a crush/press/blend at all. That inconsistency is the actual
problem (users can't reliably "take it back").

Do-nothing cost: every new operation type risks adding a fourth/fifth reversal island, and the
"can I undo this?" answer stays "depends where you look." Mistakes on origination ops (crush/press/
blend) have no recovery except manual SQL (we just hit exactly this with the sparkling test cleanup).

**Product pressure-test:** the simpler framing ("just add buttons per surface") is what produced the
fragmentation. The right move is one dispatcher + one timeline affordance, with task surfaces reduced
to thin callers. Not more islands.

## Requirements

- MUST: One `reverseOperationCore(operationId)` entry point that routes by op type to the correct
  reversal core and returns a uniform result. Generalizes the existing `reverseSparklingOperationCore`
  pattern (`src/lib/sparkling/correct.ts`) up one level.
- MUST: The lot timeline (`src/app/(app)/lots/[id]/LotDetailClient.tsx`) shows an Undo/Revert action
  on every non-corrected, reversible operation — not just the 6 cellar ops it exposes today.
- MUST: A consistent LIFO guard — reversing an op is blocked only when a later op that touched the
  same lot/position is *itself not yet reversed*; already-reversed later ops don't block (this is what
  lets a chain unwind). Today `sparkling/correct.ts` does this (excludes `correctedBy` ops) but
  `cellar/correct.ts` does not — unify.
- MUST: Preserve append-only semantics — reversal is always a compensating CORRECTION, never a delete
  of the original op (matches every existing core).
- MUST: For op types we choose NOT to auto-reverse, the timeline shows *why* (disabled with a reason),
  never a silently missing button.
- MUST: Tenant-aware from the start — reversal cores run under the same tenant transaction context as
  `runLedgerWrite` (set + re-set on retry). Depends on the multi-tenancy foundation landing first.
- SHOULD: Build reversal cores for the four origination/split ops (CRUSH, PRESS, SAIGNEE, BLEND) so
  the answer is "yes, undoable (LIFO)" for the whole ledger.
- SHOULD: Existing task surfaces (En Tirage worklist, post-rack toast, bottling-run undo) become thin
  callers of the same dispatcher — one code path, many entry points.
- NICE: A "reason it's blocked" tooltip that names the specific later op standing in the way.

## Scope Boundaries

**In scope:**
- The dispatcher, the guard unification, the timeline affordance, opId→(transferId/runId) resolvers,
  origination/split reversal cores, and refactoring existing shortcuts to call the dispatcher.

**Out of scope:**
- Multi-tenancy itself (separate plan 023 — this builds on top of it).
- Bulk "undo everything on this lot" one-click (LIFO per-op is the primitive; a batch wrapper can
  come later — `correctBatchCore` already shows the shape).
- Changing what a reversal *does* physically (each core's semantics stay; we only unify routing + surface).
- Undoing SEED (day-zero origination) and ADJUST/DEPLETE — marked non-undoable with a reason.

## Research Summary

### Op-type reversal map (current state — verified this session)

| Op type | Reversal core today | Surfaced at | Action needed |
|---|---|---|---|
| ADDITION, FINING, CAP_MGMT | `cellar/correct.ts` `correctOperationCore` (void) | timeline | route via dispatcher |
| TOPPING, FILTRATION, LOSS | `cellar/correct.ts` `correctOperationCore` (revert) | timeline | route via dispatcher |
| RACK | `vessels/rack-core.ts` `revertTransferCore` (by transferId) | post-rack toast only | opId→transferId resolver; add to timeline |
| TIRAGE, RIDDLING, DISGORGEMENT, DOSAGE, FINISH | `sparkling/correct.ts` `reverseSparklingOperationCore` | En Tirage worklist only | add to timeline |
| BOTTLE (still wine) | `bottling/run.ts` `reverseBottlingTx` (by runId) | bottling-run undo only | opId→runId resolver; add to timeline |
| CRUSH, PRESS, SAIGNEE, BLEND | none | nowhere | build reversal cores (Unit 4) |
| SEED, ADJUST, DEPLETE | none | — | mark non-undoable with reason |

### Codebase patterns to follow
- Dispatcher shape: `reverseSparklingOperationCore` (`src/lib/sparkling/correct.ts:335`) — load op, reject
  if `correctedBy` set, switch on `op.type`, delegate to the right core.
- Origination/split reversal shape: `reverseTirageCore` (`src/lib/sparkling/correct.ts:227`) and the
  partial-disgorgement child handling in `correctBottleOperationCore` (mark child lot `CORRECTED`, delete
  `LotLineage` SPLIT edge, inverse legs through the chokepoint, rewind form via direct `LotStateEvent`).
- LIFO guard (correct version): `sparkling/correct.ts` later-lines query excludes
  `operation: { correctedBy: { is: null } }`. The cellar version (`cellar/correct.ts:72`) does NOT —
  it blocks on any later non-correction line. Unify to the sparkling behavior.
- Chokepoint does all the heavy lifting: `writeLotOperation` (`src/lib/ledger/write.ts`) recreates
  drained vessel positions, folds/deletes `BottledLotState`, syncs `vessel_component`, enforces capacity.
  Every reversal just feeds it inverse `LedgerLine`s.
- Timeline is already positioned: `src/lib/lot/timeline.ts` renders every op type (CRUSH/PRESS/SAIGNEE/
  TIRAGE/RIDDLING/DISGORGEMENT/DOSAGE/FINISH summary cases exist), and each `OpItem` carries the
  operationId + `corrected`/`voided` flags. `LotDetailClient.tsx` `isActionable()` gates on
  `NEUTRAL_OPS` (ADDITION/FINING/CAP_MGMT) + `REVERTABLE_OPS` (TOPPING/FILTRATION/LOSS) only.
- Origination provenance to restore on reverse: CRUSH consumes picks via `LotHarvestSource`
  (`crush-core.ts`); PRESS/SAIGNEE/BLEND write `LotLineage` (SPLIT/BLEND) + child `Lot` rows.

### Prior learnings
- Neon single-CU cold starts blow the 20s interactive-tx cap (P2028) — the reversal verify script
  should warm the DB / retry (see `sparkling-reversion-shipped` memory).
- `@unique` `correctsOperationId` already enforces "an op is corrected at most once" at the DB level.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Where the dispatcher lives | New `src/lib/ledger/reverse.ts` (op-type-agnostic, imports the family cores) | Put it in cellar/correct | Reversal spans cellar + sparkling + bottling + transforms; belongs at the ledger layer, not one family |
| Guard consistency | Unify all cores to the "exclude already-reversed later ops" rule | Leave per-core | Without it, chains can't unwind and the same op blocks differently depending on family |
| CRUSH/PRESS/SAIGNEE/BLEND | Build reversal cores (SHOULD) following the reverseTirage pattern; guarded LIFO | Mark non-undoable | The pattern already exists; "undo anything" is the whole point. Falls back to a shown reason only if a child was further processed |
| RACK/BOTTLE routing | Resolve opId→transferId / opId→runId (stamp `metadata.runId` on BOTTLE like FINISH does) | Change core signatures to take opId | Non-invasive; keeps the proven cores intact |
| Timeline vs new page | Timeline (`LotDetailClient`) is the home; task surfaces become thin callers | A dedicated "undo center" page | Timeline already renders every op with the needed metadata; it's where users ask "what happened?" |

## Implementation Units

### Unit 1: opId → (transferId / runId) resolvers + BOTTLE runId stamp
**Goal:** Let a bare `operationId` reach the RACK and BOTTLE reversal cores.
**Files:** `src/lib/bottling/run.ts` (stamp `metadata.runId` on the BOTTLE op at creation, mirroring
`finalize-core.ts`), `src/lib/ledger/reverse.ts` (new — resolver helpers).
**Approach:** For RACK, resolve `VesselTransfer.operationId → transferId` (the 1:1 FK exists on
`VesselTransfer`). For BOTTLE, read `op.metadata.runId`; fall back to the run whose source references
the op's lot (mirrors the FINISH resolver already in `reverseSparklingOperationCore`).
**Tests:** unit test each resolver returns the right id; BOTTLE op has `metadata.runId` after bottling.
**Depends on:** none
**Verification:** `npx tsx --env-file=.env scripts/verify-sparkling.ts` still green; a new resolver unit test passes.

### Unit 2: Shared LIFO guard helper
**Goal:** One guard used by every reversal core: block only on later ops that touched the same
lot/position AND are not themselves already reversed.
**Files:** `src/lib/ledger/reverse-guard.ts` (new), `src/lib/cellar/correct.ts` (adopt it),
`src/lib/sparkling/correct.ts` (adopt it — it already has the right behavior, just centralize).
**Approach:** Extract the `operationId > opId`, same lot/position, `operation.type != CORRECTION`,
`operation.correctedBy is null` query into a helper returning the blocking op (or null).
**Tests:** guard blocks when a later un-reversed op touches the lot; passes once that op is reversed.
**Depends on:** none
**Execution note:** characterization-first — pin current cellar + sparkling guard behavior before refactor.
**Verification:** existing corrections assertions in `scripts/verify-sparkling.ts` (section 10) unchanged.

### Unit 3: `reverseOperationCore(operationId)` dispatcher
**Goal:** The single entry point routing by op type to the correct family core.
**Files:** `src/lib/ledger/reverse.ts`.
**Approach:** Load the op; reject if `correctedBy` set or type is non-undoable (return a typed
"why not"); switch: cellar-6 → `correctOperationCore`; RACK → `revertTransferCore` (via Unit 1);
sparkling-5 → `reverseSparklingOperationCore`; BOTTLE → `reverseBottlingTx` (via Unit 1); CRUSH/PRESS/
SAIGNEE/BLEND → origination reversal (Unit 4). Return `{ correctionId, reversedOperationId, type, lotId, message }`.
**Tests:** dispatch table hits the right core for each type; non-undoable types return a reason, not a throw.
**Depends on:** Unit 1, Unit 2
**Verification:** a test reverses one op of each family through the dispatcher; ledger stays balanced.

### Unit 4: Origination / split reversal cores (CRUSH, PRESS, SAIGNEE, BLEND)
**Goal:** Make the four origination/split ops undoable, LIFO-guarded.
**Files:** `src/lib/transform/reverse.ts` (new — crush/press/saignée), `src/lib/blend/reverse.ts` (new — blend).
**Approach:** Follow `reverseTirageCore`: inverse the op's `LedgerLine`s through `writeLotOperation`
(returns volume to the parent/source vessels, drains the child), mark each fully-drained child `Lot`
`CORRECTED`, delete its `LotLineage` edges; for CRUSH also restore `LotHarvestSource` pick consumption;
rewind any form/AF `LotStateEvent` the op recorded. Guard with Unit 2 (a child that was further
processed blocks the reverse with a clear message). Set `correctsOperationId` so the chain unwinds.
**Tests:** reverse a crush (picks freed, must lot gone, tank restored); reverse a press (fractions
gone, parent volume restored, lineage removed); reverse a saignée; reverse a blend (parents restored).
Each asserts vessel-fold == projection and BOTTLE_STORAGE/child rows cleaned.
**Depends on:** Unit 2
**Execution note:** test-first per op.
**Verification:** new section in `scripts/verify-sparkling.ts` (or a sibling `verify-reverse.ts`) — build each op, reverse via dispatcher, assert clean.

### Unit 5: `reverseOperationAction` server action
**Goal:** One gated server action the UI calls, wrapping the dispatcher.
**Files:** `src/lib/ledger/actions.ts` (new or existing ledger actions module).
**Approach:** `action(async ({actor}, {operationId, note}) => reverseOperationCore(...))`. Enforce the
per-family gates the dispatcher declares (sparkling still requires the sparkling capability gate).
Revalidate `/lots/[id]`, `/bulk`, and the family surfaces.
**Tests:** action rejects when sparkling gate off; succeeds and revalidates for a cellar op.
**Depends on:** Unit 3
**Verification:** call from a client, confirm revalidation + returned message.

### Unit 6: Timeline affordance (`isActionable` widening + Undo button + "why not")
**Goal:** Every non-corrected reversible op shows Undo/Revert on the timeline; non-undoable shows a reason.
**Files:** `src/app/(app)/lots/[id]/LotDetailClient.tsx`, `src/lib/lot/timeline.ts` (ensure `OpItem`
exposes a `reversible`/`reason` hint, computed from op type + corrected flags).
**Approach:** Replace the `NEUTRAL_OPS`/`REVERTABLE_OPS` gate with a single reversibility check keyed
to the dispatcher's supported types. Add an "Undo" (two-step `ConfirmButton`) per actionable event
calling `reverseOperationAction`. For non-undoable types render a disabled control with a tooltip/label
("Origination — can't be undone" / "A later step still stands — undo it first").
**Tests:** timeline renders Undo for each reversible type; disabled+reason for SEED/ADJUST; hidden for
already-corrected ops.
**Depends on:** Unit 5
**Verification:** load a lot with a mixed op history in the running dev server; confirm affordances.

### Unit 7: Refactor existing shortcuts to call the dispatcher
**Goal:** One code path. En Tirage worklist, post-rack toast, and bottling-run undo all call
`reverseOperationAction`.
**Files:** `src/app/(app)/cellar/en-tirage/EnTirageClient.tsx`, the rack toast caller, the bottling-run
undo caller.
**Approach:** Swap their bespoke action calls for `reverseOperationAction(operationId)`, keeping their
own UI/labels. Delete now-dead direct wrappers only if nothing else uses them.
**Tests:** each shortcut still reverses its op (regression), now through the shared path.
**Depends on:** Unit 5
**Verification:** worklist Undo + rack toast Undo + bottling undo all still work.

### Unit 8: End-to-end reversal verification + tenant-context check
**Goal:** Prove every op type reverses through the dispatcher, ledger stays balanced, and reversal runs
under tenant context.
**Files:** `scripts/verify-reverse.ts` (new) or extend `scripts/verify-sparkling.ts`.
**Approach:** For each op family, build it then reverse via `reverseOperationCore`; assert vessel-fold
== projection, child/lineage/pick cleanup, LIFO guard behavior, and (post-multitenancy) that reversal
respects the active tenant (a cross-tenant reverse is denied by RLS).
**Tests:** the script itself is the test; must self-clean ZZ-TEST fixtures.
**Depends on:** Units 3, 4
**Verification:** `npx tsx --env-file=.env scripts/verify-reverse.ts` — all assertions pass.

## Test Strategy

**Unit tests:** resolvers (Unit 1), guard helper (Unit 2), dispatch routing (Unit 3), each origination
reversal (Unit 4) — vitest, following `test/crush.test.ts` style for pure logic and the DB-driving
`scripts/verify-*.ts` pattern for ledger-level assertions.
**Integration:** `scripts/verify-reverse.ts` drives real cores against the DB under ZZ-TEST fixtures
(warm the DB first — Neon cold-start P2028 caveat) and scrubs in a finally block.
**Manual:** open a lot with crush→press→rack→additions history in the dev server; undo each from the
timeline newest-first; confirm the wine/positions return correctly and blocked steps show a reason.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Origination reversal corrupts provenance (picks/lineage) | MED | HIGH | Mirror the proven reverseTirage/partial-disgorge child handling; guard hard on downstream activity; verify pick + lineage cleanup in Unit 8 |
| Guard unification changes cellar behavior subtly | MED | MED | Characterization-first (Unit 2); keep section-10 sparkling assertions + add cellar guard assertions |
| Retrofitting before multitenancy → rework | MED | MED | Sequence AFTER plan 023; reversal cores set tenant context via `runLedgerWrite` from day one |
| Undo of a FINISH/BOTTLE after bottles sold | LOW | MED | Existing on-hand guard in `reverseBottlingTx`/`reverseFinalizeCore` already blocks with a clear error |
| Timeline shows Undo on something genuinely irreversible | LOW | MED | Dispatcher is the single source of truth for reversibility; timeline reads its verdict, never guesses |

## Success Criteria

- [x] `reverseOperationCore(operationId)` reverses every reversible op type; returns a typed reason for non-undoable ones. *(024a: cellar/RACK/sparkling/BOTTLE; CRUSH/PRESS/SAIGNEE/BLEND report "coming soon" pending 024b.)*
- [x] The lot timeline shows Undo/Revert on every non-corrected reversible op, and a shown reason otherwise.
- [ ] CRUSH, PRESS, SAIGNEE, BLEND are undoable (LIFO-guarded) with provenance restored. *(024b — deferred; shown non-undoable-yet with a reason.)*
- [x] En Tirage worklist calls the one dispatcher. *(Rack toast + bottling-run delete keep their id-typed direct calls — both already hit the exact family cores the dispatcher routes to; an opId round-trip would add queries + risk with no behavioral gain. Documented in Unit 7.)*
- [x] Reversal runs under tenant context; a cross-tenant reverse is denied (verified in `verify-reverse.ts` §8).
- [x] `scripts/verify-reverse.ts` passes (31/31); no regression in `scripts/verify-sparkling.ts` (53/53).
- [x] All tests pass (605 vitest + both DB verify scripts); ledger invariant (vessel-fold == projection) holds after every reversal.

## 024a Implementation Log (2026-07-01)

Built Units 1, 2, 3, 5, 6, 7, 8 on `main`. Open decisions resolved with the user before build:
"Undo" nomenclature + "corrected" badge; loose-neutral / strict-volume LIFO (matches existing
guard); server-computed reversibility in one loader pass (no preview modal, no N+1); scope = 024a
only. Unit 4 (origination/split reversal for CRUSH/PRESS/SAIGNEE/BLEND) deferred to 024b — those
op types render a "coming soon" reason on the timeline via `reversibilityOf`.

Deviations from the plan (all deliberate, low-risk):
- **commandId idempotency (SHOULD-FIX)**: not threaded. The existing `correctedBy` / unique
  `correctsOperationId` guard already makes a double-reverse a caught "already reversed" error
  (never a duplicate). Threading commandId through every family core was out of 024a scope.
- **Blocked-reason naming the specific blocker op (NICE)**: kept the existing "a later operation
  has since touched the same wine — undo that first" CONFLICT message; naming `{id,type,date}`
  deferred.
- **Rack toast / bottling-run delete refactor (SHOULD)**: left as id-typed direct calls (see above).

## Review Findings & Revisions (2026-07-01 — council + eng + design)

### Revised scope: split 024a / 024b (eng review)
- **024a (do first — low risk, ~80% of the value):** Units 1, 2, 3, 5, 6, 7 for the ops whose reversal ALREADY exists — wire the dispatcher + unify the guard + surface Undo on the timeline for cellar/RACK/sparkling/BOTTLE. No new reversal semantics.
- **024b (follow-up — the risky part):** Unit 4 (origination/split reversal for CRUSH/PRESS/SAIGNEE/BLEND) + its verify. Isolated so the child-lot/pick-restoration risk doesn't gate 024a. The timeline shows these as non-undoable-yet (reason: "coming soon") until 024b lands.

### MUST-FIX before build (council criticals — grounded in the cores)
1. **Guard unify must keep `planCorrection`'s shortfall/negative-fold pre-check** (`math.ts:441-464`). The shared helper is GUARD-ONLY (returns the blocking op or null); cellar/rack keep calling `planCorrection`. The only change: add `operation: { correctedBy: { is: null } }` to how `touchedKeys` is built in `cellar/correct.ts:72` + `rack-core.ts:309`. Add a characterization test: A→B→reverse-B→reverse-A across the cellar family. (Unit 2)
2. **Don't `DELETE` lineage/state on reverse** — mark CORRECTED/voided (append-only; deleting orphans AnalysisPanel/tasting notes on child lots). Resolve the tension with the existing partial-disgorge SPLIT-edge delete. (Unit 4)
3. **Origination guard must also block on lineage children** — a must lot drawn to zero (position gone) can still have downstream `LotLineage` children. Block if any `LotLineage.parentLotId == originatedLotId` edge exists that this op didn't create. (Unit 4)
4. **BLEND reversal branches grow-vs-new** — stamp `metadata.mode` in `blend-core.ts` (not stamped today); GROW must NOT mark the lot CORRECTED or delete pre-existing lineage; snapshot pre-op lineage to restore, not blind-delete. (Unit 4)
5. **Inverse legs = exact negation of the original legs**, never recomputed fractions (float-drift ghosts). (Unit 4)
6. **Tenant parity explicit** (post-multitenancy): assert `originalOp.tenantId === currentTenant`; the dispatcher opens NO transaction — it calls exactly one core, which owns its `runLedgerWrite` tx and sets the tenant GUC inside (set + re-set on retry). (Units 3, 5)

### SHOULD-FIX
- **PRESS is ambiguous** — whole-cluster press (fruit origination, has `LotHarvestSource`) vs parent split (has SPLIT lineage). Reverse-press branches on picks-vs-lineage, not `op.type`. (Unit 4)
- **"Rewind form/AF" is a no-op for crush/press/blend** — they set child form at `lot.create` with NO `LotStateEvent`; only TIRAGE writes one. Don't imply a symmetric rewind. (Unit 4)
- **BOTTLE/FINISH runId fallback** picks the wrong run for multi-run lots — return "reverse from the bottling-run view" rather than guessing (same latent bug in `reverseFinalizeCore`). (Unit 1)
- **Idempotency** — every new core sets `correctsOperationId` NON-null (finalize currently allows null → no double-reverse guard); add a `commandId` to `reverseOperationAction` so a double-tap is a no-op success. (Units 4, 5)
- **Timeline verdict N+1** — don't call `canReverse(opId)` per op row. Either compute reversibility for all of a lot's ops in ONE loader pass, or use attempt→show-CONFLICT and only STATICALLY disable non-undoable types. (Unit 6, perf)
- **Blocked reason names the blocker** `{id, type, date}` + link; **pick over-restore** flags when returning kg exceeds a pick's original weight. Shared guard uses the LOT-SCOPED query form (`sparkling/correct.ts:244-250`), not global-by-key.
- **Fix Unit 4 dependency**: its verification uses the dispatcher (Unit 3), not just Unit 2.

### Design: interaction-state coverage (fold into Unit 6)
```
UNDO CONTROL      | what the user sees
------------------|--------------------------------------------------------------
idle              | "Undo <step>" ghost button on the op row
armed             | "Sure? [Undo <step>] [Cancel]" (existing ConfirmButton, >=44px)
loading           | "Undoing…", row dimmed + disabled
success           | toast "Reversed <step> on <lot>"; op row gets the existing
                  |   "corrected" badge; reopened lot/tank reflects it
blocked (LIFO)    | disabled control + reason naming the blocker op (aria-describedby)
non-undoable      | no button; muted reason (SEED/ADJUST/DEPLETE/CORRECTION)
error             | toast with the CONFLICT message (bottles moved/sold, race)
```
Reuse `ConfirmButton`/`Badge`/`Modal` per DESIGN.md tokens. a11y: 44px targets, `aria-describedby` on disabled reasons, focus returns to the row after action.

### OPEN DECISIONS (resolve in /refine before /work)
1. **Nomenclature:** "Undo" vs "Correct / Void record" (a winemaker can't un-press grapes — the action is a ledger correction, not time travel).
2. **Blast-radius preview:** add an `analyzeReversal(opId)` probe that shows "voids child lot X, returns 450 L to Tank 4, frees 2.5 t to Pick A" before the confirm? (Strong trust win for destructive reverses; also answers the timeline-verdict question by computing reversibility server-side.)
3. **Strict vs loose LIFO:** neutral cellar ops (ADDITION/FINING/CAP_MGMT) reverse loosely (a typo'd SO₂ addition isn't blocked by a later rack), volume/lineage/state ops stay strict LIFO. (Preserve today's guard-free zero-line void path.)
4. **Non-undoable remedy copy:** what the reason says for SEED/ADJUST ("requires a new ADJUST to correct") and CORRECTION ("redo the original op").

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Council (cross-LLM) | `/council` | Independent 2nd opinion | 1 | issues_found | Gemini + Claude: 6 criticals (guard shortfall, no-delete, lineage-children guard, BLEND grow/new, exact-negation, tenant parity) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | scope split 024a/024b; timeline N+1; 3 critical failure-mode gaps (pick over-restore, wrong-run, orphan child) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | 5/10 → 8/10; interaction-state table added; 4 open decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CROSS-MODEL:** Gemini + Claude independently converged on Unit 2 (guard) and Unit 4 (origination reversal) as the bug-prone units, and both flagged append-only-vs-delete + false-uniformity of the dispatcher.
- **UNRESOLVED:** 4 open decisions (nomenclature, blast-radius preview, strict/loose LIFO, non-undoable copy).
- **VERDICT:** Spine approved. Scope split to 024a/024b. Resolve the 4 open decisions + fold the 6 criticals into Units 2/4, then this is ready to implement — AFTER the multi-tenancy foundation (plan 023).
