---
title: "FIX_RUNBOOK reviewed execution plan"
type: plan-review
status: reviewed
date: 2026-07-09
source: "../FIX_RUNBOOK.md"
---

# FIX_RUNBOOK Reviewed Execution Plan

## Current Posture

`FIX_RUNBOOK.md` v2.4 is directionally sound, but the repo has moved since the top-level
"current execution posture" text was written:

- Phase 0 is shipped.
- Phase 1 is shipped.
- Phase 2 is shipped.
- Phase 3 is shipped and reported in `PHASE-3-REPORT.md`.
- The next executable phase is therefore **Phase 5: lifecycle-writer debt**.
- Phase 6 follows Phase 5, but should be split into smaller implementation plans before work starts.
- Phase 4 and Phase 7 remain parked unless their explicit partner/data triggers fire.

The practical sequence is:

1. Patch the Phase 3 trust-core gaps found by review.
2. Update the runbook posture so it says **Phase 3 hardening -> Phase 5 -> Phase 6**, not generic
   **Phase 3 -> Phase 5 -> Phase 6**.
3. Create and run a dedicated `/plan` for Phase 5.
4. Execute Phase 5 fully green.
5. Split Phase 6 into bounded follow-up plans and execute them one at a time.

## /plan Output

### Phase 3 Hardening Stop-Gate

Do this before Phase 5. It is not new adapter work; it is tightening the generic kernel that already
shipped.

#### Objective

Prove that published migration seeds behave as opening inventory and cannot slip into filed compliance
periods between sign-off and publish.

#### Implementation Units

1. **First post-cutover 5120.17 proof**
   - Extend `verify:migration` to generate the first 5120.17 after a migration publish.
   - Assert the migration `SEED` is opening inventory, not a reportable §A gain/loss.
   - Assert a source-declared cutover tax class does not incorrectly post an in-period §A line 10 movement.
   - Decide whether cutover tax class should remain a `ChangeOfTaxClassEvent` or become opening-balance
     classification metadata.

2. **Publish-time filing recheck**
   - Re-run the cutover/filing gate inside publish, not only preflight/sign-off.
   - If a report is filed after sign-off but before publish, publish must fail and require a fresh preflight.
   - Scope the gate to affected bonds instead of every filed 5120.17 in the tenant.

3. **Reconciliation-pack honesty**
   - Either implement the promised generic reconciliation items now, or relabel the shipped Phase 3 as a
     proof harness and explicitly gate real migration work on completing the fuller pack.
   - Minimum before real migration: by-vessel, by-lot, cost, TTB totals when present, chemistry count,
     unmapped entities, partial lineage, and finished-goods coverage gaps.

4. **Tenant-isolation verifier coverage**
   - Add direct checks for `legacy_operation`, staged analysis panels/readings, and cross-tenant
     staged-analysis FKs.
   - Keep all verifier writes in `org_demo_winery`; do not use Bhutan tenant data for dev/QA.

5. **Accounting disclosure**
   - Make opening-balance accounting export mapping an explicit pre-real-migration trigger.
   - `OPENING_BALANCE` may be cost-authoritative before it is accounting-exportable, but the runbook should
     say that plainly.

#### Gates

- `npm run verify:migration`
- `npm run verify:tenant-isolation`
- `npm run verify:ttb`
- `npm run verify:cost`
- `npm run test`
- `npm run build`

### Phase 5 - Lifecycle Writers

Phase 5 should be the next session. Keep it intentionally small.

#### Objective

Make declared-but-dead lifecycle states real without changing ledger truth:

- `Lot.status = DEPLETED` is written when the authoritative ledger projection reaches zero across all
  vessel and bottle-storage holdings for a lot.
- `Lot.status = ARCHIVED` is set only by an explicit metadata action, never by deleting ledger history.
- `LotLineage.kind = TRANSFORM` is either produced for a truthful transform edge or removed as dead schema
  vocabulary.

#### Implementation Units

1. **Status fold hook**
   - Add a tx-local helper near the ledger chokepoint that receives affected lot ids after projection folds.
   - Recompute each affected lot's live holdings from `vessel_lot` plus any in-process `bottled_lot_state`.
   - Set `ACTIVE -> DEPLETED` when holdings reach functional zero.
   - Set `DEPLETED -> ACTIVE` if a correction/restoration reopens volume.
   - Do not auto-change `ARCHIVED`; archive is operator-owned metadata.
   - Do not overwrite `CORRECTED`; transform reversal owns that terminal state unless a future plan changes
     it explicitly.

2. **Archive/unarchive core**
   - Add `archiveLotCore` / `unarchiveLotCore` behind existing admin authorization.
   - Archive guard: reject if the lot has live vessel or bottle-storage balance.
   - Unarchive: `ARCHIVED -> DEPLETED` if still zero, or `ARCHIVED -> ACTIVE` if live balance exists.
   - Append an audit event. Do not mutate ledger rows.

3. **Lot UI**
   - Lots list already has `ACTIVE` / `DEPLETED` / `ARCHIVED` filters; keep them.
   - Lot detail already shows a status badge; add archive/unarchive controls only where allowed.
   - Use plain status labels and disabled-state reasons rather than explanatory page copy.

4. **Lineage vocabulary decision**
   - Audit `CRUSH`, `PRESS`, `SAIGNEE`, form/state transitions, sparkling transforms, and split-in-place
     candidates.
   - If there is no current truthful producer for `TRANSFORM`, remove the schema comment/expectation rather
     than inventing a false edge.
   - If a producer exists, add the edge at the domain core where the identity transition is created.

5. **Verifier**
   - Extend or create a lifecycle verifier.
   - Add `npm run verify:lifecycle` if the checks are larger than a unit test.
   - Required assertions:
     - drawdown to zero marks `DEPLETED`;
     - correction/restoration reopens to `ACTIVE`;
     - archive rejects a live lot;
     - archive succeeds for a zero-balance lot;
     - unarchive chooses `DEPLETED` or `ACTIVE` from current holdings;
     - `TRANSFORM` is produced truthfully or the dead value/comment is removed.
   - Add `verify:projection` to `package.json` or call `npx tsx --env-file=.env scripts/verify-projection.ts`
     explicitly; the runbook currently names a package script that does not exist.

#### Gates

- `npm run test`
- `npm run lint`
- `npm run build`
- `npm run verify:projection`
- `npm run verify:reverse`
- `npm run verify:reverse-transform`
- `npm run verify:invariants`
- `npm run verify:tripwires`

Finish with `PHASE-5-REPORT.md`.

### Phase 6 - Operations Gaps

Phase 6 is too broad for one safe `/work` session as written. Keep it as the umbrella, but split it into
subplans with independent gates.

Recommended split:

1. **Phase 6A: correction UX and reversal gaps**
   - Plain-language LEDGER-11 block messages.
   - One-click LIFO unwind orchestration.
   - Return blocking operation ids/types from the reverse guard so the UI can name and preview the chain.
   - Reverse-and-rebook composite for posting edits.
   - New reversal behavior for `ADJUST` / `DEPLETE`.
   - Treat ordinary Day-Zero `SEED` and migration `SEED` separately; migration draft discard is not ledger
     reversal.
   - Move `verify:reverse` and `verify:reverse-transform` off `org_bhutan_wine_co` before expanding them.

2. **Phase 6B: metadata edit affordance**
   - Whitelist non-fold fields only.
   - Reject date, quantity, vessel, lot, tax class, bond, and report-affecting fields.
   - Append audit/history records; do not mutate operation lines.
   - Explicitly retire or replace the existing neutral-op edit/delete path that mutates treatments and
     hard-deletes neutral `LotOperation` rows.

3. **Phase 6C: split and lees sub-lots**
   - One-action in-place lot split.
   - Lees child lot primitive.
   - No phantom vessel round trip.
   - Lineage and reversal tests.

4. **Phase 6D: barrel groups**
   - Start from existing `VesselGroup` / `VesselGroupMember` and vessel-group fan-out code.
   - Fill workflow/test gaps and define break/combine semantics.
   - Cost DAG and barrel-fill invariant checks.

5. **Phase 6E: long-tail operation types**
   - Decide whether `DRAIN`, `DELESTAGE`, and `COLD_STAB` need new enum values or can be named `CUSTOM`
     / treatment variants.
   - If enum values are required, use isolated enum migrations.
   - Every op must remain balanced and capacity-checked.
   - Define where a `CUSTOM` label lives: metadata, note, treatment detail, or a structured table.

Each subplan must run the relevant verifier plus the cross-phase gates before merging.

## Engineering Review

### Critical

- **Phase 3 has trust-core gaps despite being reported as shipped.** The first post-cutover 5120.17 is not
  proven, publish does not re-check the filing gate after sign-off, and staged-analysis/legacy-operation
  tenant isolation coverage appears incomplete. Fix: add the Phase 3 hardening stop-gate above before
  Phase 5.
- **Runbook posture is stale after Phase 3.** The runbook still says the practical next sequence is
  `Phase 3 generic kernel -> Phase 5 -> Phase 6`, but `PHASE-3-REPORT.md` says Phase 3 shipped green.
  Fix: update the current posture before handing a future agent the file.
- **Phase 6 is over-scoped.** It combines new operation vocabulary, reversals, edit semantics, LIFO UX,
  split, lees, barrel groups, and cost-sensitive behavior. Fix: split into 6A-6E as above.
- **`SEED` reversal needs stricter language.** Ordinary legacy Day-Zero `SEED`, migration published
  `SEED`, and unpublished migration draft discard are different cases. Fix: make Phase 6 decide exactly
  which `SEED` can be reversed and which remains terminal.

### Should Fix

- Add `verify:lifecycle` to Phase 5 if lifecycle checks are not naturally covered by existing scripts.
- Add the missing `verify:projection` package script or stop naming it as `npm run verify:projection`.
- Phase 5 status recomputation must include bottle-storage state, not only `VesselLot`, or sparkling lots
  can remain incorrectly active/depleted.
- Archive/unarchive should use audit history and existing admin action patterns; no new tenant-global table
  is needed.
- `TRANSFORM` should not be forced if the current model already uses `SPLIT`/`BLEND` plus
  `LotStateEvent` truthfully.
- Phase 6 enum additions should be delayed until the exact operation semantics are chosen; enum churn is
  expensive on Windows/Postgres migrations.
- Phase 5/6 should remove stale "lighthouse" / Phase 4 representability references; Phase 4 and Phase 7
  are parked under Decision 7.

### Design Questions

- Should archived lots be hidden from pickers everywhere, or only de-emphasized with explicit inclusion?
- Should a depleted lot auto-reactivate if a correction restores it, even after the user manually archived it?
  Proposed answer: archive wins until explicit unarchive.
- Should `CUSTOM` be an operation type, or should custom labels ride existing neutral/volume-affecting
  operation families? Decide before adding enum values.

## Council Review

The external `ask_codex` / `ask_gemini` MCP tools were not mounted in this session, so this is a local
council-style adversarial review rather than a live Codex+Gemini council transcript.

### Critical

- **The migration-adapter boundary is correct; keep it parked.** Do not let Phase 5 or Phase 6 smuggle
  InnoVint/Vintrace adapter assumptions back into the plan.
- **Phase 6 must not overclaim incumbent parity.** The right claim after 6 is better ongoing operation
  coverage and correction UX, not complete migration fidelity or full feature parity.
- **Reversal semantics can corrupt compliance if under-specified.** ADJUST/DEPLETE reversal must still
  respect filed periods, tax-paid terminal boundaries, and amendment behavior through the ledger chokepoint.
- **Phase 3 should be described honestly.** Either call the shipped state a generic proof harness, or finish
  the fuller reconciliation/TTB trust pack before calling it migration-trust complete.

### Should Fix

- Add an explicit "Demo Winery only" reminder to Phase 5/6 verifier text.
- Make Phase 6 barrel-group work prove cost behavior with `verify:cost`.
- Make long-tail ops demonstrate their TTB/compliance classification, even when they are neutral or custom.
- Preserve the Phase 3 promise that legacy history remains archive evidence, not fold input.
- Keep Phase 4/7 parked, and rewrite lower historical sections that still imply InnoVint validates the
  kernel or Phase 4 must precede Vintrace.

### Design Questions

- Is the first Phase 6 slice chosen by product pain or implementation dependency? Proposed answer:
  correction UX/reversal first, because it reuses existing cores and lowers day-to-day risk.
- Do barrel groups need to be visible as first-class navigation, or only as an operation picker grouping?
  Proposed answer: operation-surface first; navigation later if repeated use demands it.

## Design Review

### Critical

- **Phase 5 needs small, visible, reversible controls.** Archive must not feel like deletion. It should be
  a metadata state with a confirmation, a reason/notes field if cheap, and an obvious unarchive path.
- **Phase 6 edit affordances need hard visual separation.** Metadata edit and posting edit must not share
  an ambiguous "Edit" surface without showing what will happen.
- **Existing timeline edit/delete must be replaced.** The current neutral-op path allows in-place treatment
  edits and hard deletion; Phase 6 must remove that UI/core path or route it through the new fenced model.

### Should Fix

- Use status badges consistently between the lot list and lot detail; `ARCHIVED` should be neutral, not
  alarming.
- Hide or disable archived/depleted lots in action pickers with a clear reason.
- For LIFO unwind, show the exact chain to be unwound before execution.
- For reverse-and-rebook, present the composite as one reviewable workflow but show that the ledger will
  append two events.
- For in-place split, put the primary affordance on lot detail/current-location context with vessel and
  available volume prefilled; `/ferment/press` can remain the specialized workflow.

### Design Questions

- Should the lot detail timeline show lifecycle metadata events inline? Proposed answer: yes, but visually
  distinct from ledger operations.
- Should archive be admin-only? Proposed answer: yes for now; granular permissions remain deferred.

## Final Plan Amendments

Before the next `/work` run, update `FIX_RUNBOOK.md` with these edits:

1. Add a Phase 3 hardening stop-gate for first post-cutover TTB proof, publish-time filing recheck,
   fuller reconciliation-pack honesty, and missing tenant-isolation checks.
2. Change the current v2.4 practical sequence to `Phase 3 hardening -> Phase 5 -> Phase 6`.
3. Mark Phase 3 as shipped-but-hardening-needed and point to `PHASE-3-REPORT.md`.
4. Add a Phase 5 planning note that status fold must include vessel and bottle-storage projections.
5. Add a Phase 5 planning note that archive/unarchive is metadata + audit, not ledger mutation.
6. Add or rename `verify:projection`.
7. Replace the single large Phase 6 execution instruction with subphase planning guidance: 6A correction,
   6B metadata edits, 6C split/lees, 6D barrel groups, 6E long-tail ops.
8. Tighten `SEED` reversal language so migration draft discard and published ledger reversal are not
   conflated.
9. Move reverse verifiers off Bhutan before Phase 6 extends them.
10. Explicitly retire the current in-place neutral-op edit/delete path.
11. Keep Phase 4 and Phase 7 parked unless authorized partner/export/API triggers fire.

With those amendments, the plan is solid enough to hand to `/work` for the Phase 3 hardening patch, then
Phase 5.
