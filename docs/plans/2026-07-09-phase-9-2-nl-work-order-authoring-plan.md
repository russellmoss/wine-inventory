---
title: Phase 9.2 - Natural-language work-order authoring
type: feat-plan
status: planned
date: 2026-07-09
branch: codex/phase-9-2-nl-work-order-authoring
depth: deep
reviewed_by: [codex-engineering-review, codex-design-review]
council_status: deferred_external
---

# Phase 9.2 - Natural-language work-order authoring

## Reconciliation

### Repo/runbook state

- `FIX_RUNBOOK.md` v2.4 is the current authority for partner-gated migration sequencing: Phase 3 generic
  kernel was build-now; Phase 4 InnoVint and Phase 7 Vintrace adapters remain parked until explicit
  partner/authorized-data triggers.
- `PHASE-3-REPORT.md` confirms Phase 3 shipped the incumbent-agnostic migration spine only:
  draft import batches, saved mappings, reconciliation items, signed trust packet, and one live migration
  `SEED` per bulk vessel balance. It explicitly excludes InnoVint/Vintrace adapters and live partner API
  work. Gates include `verify:migration`, `verify:tenant-isolation`, `verify:cost`, `verify:ttb`, and build.
- `PHASE-5-REPORT.md` confirms Phase 5 shipped lifecycle-writer debt: real `ACTIVE`/`DEPLETED`/`ARCHIVED`
  status behavior, archived-lot write guards, correction reopen behavior, lineage vocabulary cleanup, and
  `verify:lifecycle`/`verify:projection` guards.
- `PHASE-6-REPORT.md` confirms Phase 6 shipped the operations-gap tranche: DB-aware reversal verdicts,
  LIFO chain reversal, fenced metadata edits, split-in-place/lees workflow, saved barrel groups, long-tail
  routing, and Demo Winery-only verify scripts. It explicitly excludes InnoVint/Vintrace adapter work.

### Roadmap status updates needed

Do not edit `ROADMAP.md` in this planning pass because it is already modified in the worktree. Capture these
as follow-up doc corrections:

- Keep the top-level Phase 9 status as in progress: core lifecycle, enhancements, template builder, and
  transform blocks shipped; NL/voice authoring remains.
- Update the FIX_RUNBOOK remediation index around migration: "Migration kernel shipped; real adapters
  parked under v2.4 partnerless lane." The current wording still says the adapter path is "unblocked" and
  Vintrace-first.
- Update Phase 13 copy to reconcile with v2.4: generic kernel is shipped, but Vintrace/InnoVint adapter
  implementation is event-gated on authorized partner data. Do not claim sandbox/API work is the next build
  unless the partner trigger is active.
- Leave H8 as "seeded" but add that Phase 9.2 must extend it with NL work-order proposal fixtures and a
  regression gate before the feature is exposed.

## Objective

A winemaker says or types:

> Rack T12 to T15, add 30 ppm SO2, pull a juice panel.

The system parses that utterance into a deterministic work-order proposal, resolves real vessels/lots and
materials, computes dose/cost/read-model warnings from current tenant state, shows a structured diff with
unresolved items, and only after human confirmation creates and issues a work order through the existing
server action path.

Core invariant:

**LLM proposes. Deterministic code validates. Human confirms. Server action creates the work order. The model
never writes ledger operations.**

## Review status

- Engineering review completed locally and incorporated. Artifact:
  `analysis/phase-9-2-eng-review.md`.
- Design review completed locally and incorporated. Artifact:
  `analysis/phase-9-2-design-review.md`.
- External council review is deferred. A `council-mcp` run was attempted in-thread, but it did not return a
  usable result or write a council output file. Do not treat this document as having passed Gemini/Codex
  council until that separate review is run.

## Current machinery to reuse

- Work-order creation: `createWorkOrderAction` -> `createWorkOrderCore`, then `issueWorkOrderAction` ->
  `issueWorkOrderCore`.
- Work-order task shape: `CreateTaskInput` and `instantiateTaskBuilds` over the typed vocabulary in
  `src/lib/work-orders/template-vocabulary.ts`.
- Ledger writes happen later on task completion in `completeTaskCore`, not during authoring.
- Confirmation: assistant write tools already use `signProposal`, `commitProposal`, nonce burn, and
  typed committers in `src/lib/assistant/confirm.ts` and `src/lib/assistant/commit.ts`.
- Resolver precedents: `resolveVessel`, `resolveLotTarget`, `resolveAdditiveFrom`, template material
  scoping, and `signResume` choice tokens.
- Material taxonomy authority: `CellarMaterial.category`, `materialDisplayName`, `materialScopeForTask`,
  `isDoseableCategory`.
- Cost authority: `SupplyLot.qtyRemaining`, weighted-average unit cost from `listMaterials`, unknown cost as
  `null`/`UNKNOWN`, never zero.
- Reservations/ATP: `reservationIntentsForTask`, `evaluateAtp`, `advisoryWarning`.
- H8 evals: `test/evals/assistant-write-tools.golden.ts`, `assistant-tools.eval.test.ts`,
  `assistant-fleet.golden.ts`, and `assistant-fleet.eval.test.ts`.

## Scope

In scope:

- A new NL work-order proposal tool for cellar work-order authoring, not direct operation logging.
- Multi-intent utterances composed into one work order with ordered tasks.
- Initial supported task intents:
  - `RACK`: from vessel -> to vessel, optional draw/loss/rack type.
  - `ADDITION`/`FINING`: vessel, material, amount, dose unit (`ppm` normalized to `mg/L`), optional note.
  - `PANEL`: pull/log a chem panel task for the resolved lot/vessel.
  - Optional narrow `NOTE` task only when the user explicitly asks for a checklist note.
- Deterministic proposal schema, warnings, cost estimate, and diff.
- Human confirmation via the existing signed-token/nonce flow.
- H8 structural + fleet eval coverage for proposal routing and parser output.

Out of scope:

- Completing or approving the created work order by NL.
- Any model-originated ledger write.
- Creating new materials from NL inside the proposal flow.
- Free-form material taxonomy writes or auto-created families.
- Blend, bottling, sparkling, taxpaid removal, crush/press fraction authoring, custom/vineyard spray WOs.
- Full offline-first sync beyond existing WO execution idempotency.
- New DB tables unless implementation proves a persisted proposal audit table is necessary; v1 should avoid
  schema changes by signing the proposal payload.
- Arbitrary NL-to-SQL/reporting.

## Architecture and data flow

1. User speaks or types in chat or voice overlay.
2. The assistant selects a new write tool, proposed name: `propose_work_order`.
3. Tool input is intentionally "intent-ish", not final DB IDs. The model may produce:
   - raw utterance
   - task intents with entity references
   - scheduling/assignee/title hints
4. Server-side deterministic parser canonicalizes the model input into `NlWorkOrderDraft`.
5. Deterministic resolver reads current tenant state:
   - vessels and contents
   - lot identity/contents
   - doseable material catalog
   - supply on-hand and weighted average cost
   - destination headroom and active reservations
   - applicable compliance/bond/tax-class risk facts
6. Deterministic validator returns `WorkOrderProposal`:
   - resolved tasks as `TaskBuild[]` if fully creatable
   - unresolved items and blocking errors
   - warnings
   - cost estimate
   - before/after diff
7. If any blocker or unresolved required entity exists, the tool returns a non-committable proposal with
   choices/next actions. It does not sign a commit token.
8. If creatable, the tool renders a confirmation card and signs the resolved proposal payload.
9. On confirm, the committer revalidates fresh state, rebuilds `TaskBuild[]`, calls `createWorkOrderAction`,
   then calls `issueWorkOrderAction`.
10. The created work order contains planned tasks only. Ledger/cost/supply mutation waits until crew task
    completion through existing `completeTaskCore`.

## Deterministic proposal schema

Add server-only types under a new module such as `src/lib/work-orders/nl-proposal.ts`.

```ts
type NlWorkOrderIntent =
  | { kind: "RACK"; from: string; to: string; drawL?: number; lossL?: number; rackType?: string; note?: string }
  | { kind: "ADDITION" | "FINING"; vessel: string; material: string; amount: number; unit: string; note?: string }
  | { kind: "PANEL"; vessel?: string; lot?: string; panelName?: string; note?: string }
  | { kind: "NOTE"; title: string; note?: string };

type WorkOrderProposal = {
  schemaVersion: 1;
  sourceText: string;
  title: string;
  assigneeEmail: string | null;
  dueAt: string | null;
  status: "ready" | "needs_input" | "blocked";
  tasks: ProposedTask[];
  unresolved: UnresolvedItem[];
  warnings: ProposalWarning[];
  cost: ProposalCostSummary;
  diff: ProposalDiff;
  taskBuilds: TaskBuild[];
  stateReadAt: string;
};
```

`taskBuilds` is the only payload signed for commit, together with title/assignee/due date and a compact
state fingerprint. Everything else is explanatory and recomputed on confirm.

## Parser and LLM boundary

- The LLM may identify verbs, rough ordering, quantities, dates, assignee, and free-text references.
- The LLM may not supply trusted IDs unless they came from a deterministic choice token.
- The LLM may not invent task types, materials, units, categories, cost values, warnings, or compliance
  outcomes.
- Deterministic code owns:
  - task type allowlist
  - unit normalization
  - entity resolution
  - ambiguity/refusal
  - cost math
  - ATP/capacity checks
  - compliance/bond/tax-class checks
  - final `TaskBuild[]`
- If parser confidence is low or an utterance mixes supported and unsupported operations, return a
  non-committable proposal and mark unsupported items as unresolved. Do not silently drop them. V1 should
  not sign partial multi-intent proposals; if the user wants a supported subset, regenerate a new proposal
  whose source instruction explicitly asks for that subset.

Implementation preference:

- Start with a deterministic canonicalizer over the model's structured tool input.
- Keep a pure `parseWorkOrderUtteranceForEval` that can run in tests without a provider.
- The gated LLM eval asserts the model selects `propose_work_order` and produces the right intent shape; the
  structural tests assert deterministic resolution and refusal.

## Resolver behavior

### Vessels

- Resolve via existing vessel-code candidates (`T12`, `tank 12`, `T-12`) and exact/fuzzy matching.
- Reject inactive vessels.
- For racking, require one source and one destination vessel. If either is ambiguous, return choices.
- For additions, require exactly one target vessel. If vessel holds multiple lots, the task may still be
  whole-vessel; the proposal must show every resident lot that will receive a treatment.
- For panels, resolve to exactly one lot. A single-lot vessel is okay; a blended vessel asks which lot.

### Lots

- Use `resolveLotTarget` behavior: current code first, then cross-identifier search via Phase 12.5.
- Never pick one lot out of a blend for a panel or per-lot measurement.
- For rack/addition task builds, mirror canonical columns (`fromVesselId`, `toVesselId`, `vesselId`,
  `lotId`, `materialId`) exactly as template vocabulary expects.

### Materials

- Resolve only against active `CellarMaterial` rows.
- Match by `materialDisplayName`, canonical `name`, `genericName`, `brandName`, and `brand`.
- Scope addition/fining matches to `materialScopeForTask({ opType: "ADDITION" | "FINING" })`.
- A match whose stored category is `CLEANING_SANITIZING` or `PACKAGING` is a hard blocker.
- Ambiguity returns a picker with identity-pinned resume tokens. Text clarification is not enough for
  identical names.
- No material creation, no family creation, no free-form material string in signed task builds.

## Cost estimate and unknown-cost handling

Proposal cost is a read model, not a write:

- Compute dose totals using the same dose-unit math as additions:
  - `ppm` -> `mg/L`
  - rate units use current vessel volume, or barrel capacity for barrels
  - absolute units use the entered total
- Convert dose unit to the material stock unit when possible.
- Estimate supply cost from current open `SupplyLot` rows using the tenant costing method where practical.
  A v1 estimate may use weighted-average unit cost if it clearly labels the method and revalidates at
  commit/execute.
- If any participating open lot has unknown unit cost or the material is untracked/unconvertible, show
  `UNKNOWN`, not `$0`.
- Render money with the tenant currency/display utilities; never hardcode `$`.
- Treat proposal cost as advisory. Actual cost is recorded later by `consumeMaterialCore` when the task is
  completed.

## Warning checks

Warnings are deterministic, severity-tagged, and shown before confirmation.

Capacity and reservation:

- Destination headroom: current vessel fill plus active `VESSEL_CAPACITY` holds.
- Source availability: current source lot/vessel volume plus active `LOT_VOLUME` holds.
- Reservations are advisory: warn on shortfall, but allow issuing when the user confirms.
- Commit still calls `issueWorkOrderAction`; reservations are created there and may return fresher warnings.

Inventory:

- Material ATP: on-hand minus active `MATERIAL_QTY` holds.
- Below-stock additions warn but do not create negative stock; completion later draws to zero and surfaces
  shortfall via existing consumption behavior.
- Unknown cost is a warning, not a blocker.

Compliance:

- Racking across lots/bonds/tax-class-sensitive contexts should warn when the proposal appears to cross a
  compliance boundary or relies on missing ABV/tax-class facts.
- The v1 check should stay conservative and read-only: use existing bond/tax-class derivation helpers where
  possible; otherwise surface "needs compliance review" rather than pretending a full filing simulation ran.
- If an operation would be unsupported as a work-order authoring task, block it and route to the existing UI
  or later phase.

Freshness:

- Include `stateReadAt` and a compact fingerprint in the signed proposal, e.g. target vessel ids, material
  ids, task count/order, source/destination vessel ids, resident lot ids, material category/active state/stock
  unit, observed current volumes/headroom/on-hand/ATP, and available `updatedAt` or version-like facts.
- On confirm, re-read state. If destination capacity, source contents, material category, or material
  existence changed materially, refuse the stale confirmation and ask the user to regenerate the proposal.
- If only advisory values changed, regenerate the warning set and require a fresh confirm.

## Confirmation flow

- The chat/voice response must show a structured card, not just prose.
- The card must include:
  - task list in execution order
  - resolved entities with human labels and IDs hidden unless needed
  - unresolved items
  - warnings with severity
  - estimated supply use and cost
  - before/after diff for vessels/lots/material ATP
  - confirmation affordance
- If the user says "confirm" in voice, reuse the existing signed-token path. The voice command confirms the
  visible proposal only; it does not re-run a looser model prompt.
- Expired or stale tokens return a clear "regenerate proposal" state.
- Cap v1 generated proposals to a bounded operational size, recommended 25 tasks. Larger requests return a
  blocker asking the user to split the work order.

## Server action and transaction boundaries

- Propose phase: read-only; no mutation, no reservations, no ledger writes.
- Confirm phase:
  - burn assistant nonce through existing `commitProposal`
  - revalidate proposal state
  - call `createWorkOrderAction({ title, tasks, assigneeEmail, dueAt })`
  - call `issueWorkOrderAction({ workOrderId })`
  - return navigation to the created work order
- Do not call Prisma directly from the committer except for read-only revalidation if no existing reader
  exists. Writes go through existing actions/cores.
- Do not combine WO creation with task completion. A created NL work order is still only a plan for the crew.
- Idempotency relies on the assistant confirmation nonce for create/issue. If create succeeds but issue fails,
  return a recoverable `draft_created_not_issued` state with the draft link and an explicit warning; do not
  retry blindly into duplicate issue. Any retry must target the known draft rather than creating a second work
  order.
- Preserve and show any fresher reservation/capacity warnings returned by `issueWorkOrderAction`.

## Tenant isolation and Demo Winery

- All tests and verify scripts use `org_demo_winery`.
- Never generate test data in Bhutan Wine Co.
- Read helpers must either run under `action()`/session tenant or accept explicit `tenantId` and wrap reads in
  `runAsTenant`.
- No new tenant-scoped tables are expected. If implementation adds proposal persistence, it must follow the
  full Phase-12 checklist and add `verify:tenant-isolation` coverage.
- Add a tenant-isolation regression if the proposal resolver gets a new raw SQL read.

## H8 eval and regression gate

Add a new golden dataset focused on Phase 9.2, for example:

- "Rack T12 to T15, add 30 ppm SO2, pull a juice panel" -> `propose_work_order` with RACK, ADDITION, PANEL.
- "Rack tank 12 to tank 15 and add 30 ppm KMBS" -> same tool; material resolves to existing additive.
- "Add 30 ppm sanitizer to T12 as a work order" -> blocked/refused as non-doseable.
- "Pull a juice panel on T12" where T12 holds multiple lots -> needs-input, no confirm token.
- "Rack T12 to T15" where T15 is short on headroom -> ready with capacity warning, not silent.
- "Add 30 ppm SO2 to T12" with unknown supply cost -> ready with UNKNOWN cost warning.
- "Make a work order to blend T1 and T2" -> unsupported/out of scope, route to UI/future phase.

Test layers:

- Structural eval: new write tool is covered and schema keys match.
- Fleet eval: issue-via-NL must pick `propose_work_order`, not `rack_wine`, `add_addition`,
  `create_work_order`, or `issue_operation_wo`.
- Pure parser/resolver tests: deterministic task builds and refusal cases.
- Optional gated LLM eval: `npm run eval:assistant` before landing prompt/model/tool changes.

## Implementation units

### Unit 1 - Proposal types and pure validators

Files:

- `src/lib/work-orders/nl-proposal.ts`
- `test/work-order-nl-proposal.test.ts`

Build the schema, unit normalization, supported-intent allowlist, warning taxonomy, and deterministic
proposal status rules.

### Unit 2 - Read-side resolver and diff builder

Files:

- `src/lib/work-orders/nl-resolve.ts`
- possibly small read helpers in `src/lib/work-orders/data.ts`

Resolve vessels/lots/materials, compute current fill/on-hand, build before/after and cost estimate, and
return blocker/warning sets. Keep it read-only and tenant-scoped.

### Unit 3 - Assistant tool and committer

Files:

- `src/lib/assistant/tools/propose-work-order.ts`
- `src/lib/assistant/registry.ts`
- `src/lib/assistant/commit.ts`

Add `propose_work_order` as a write tool. `run()` returns a proposal or signed confirmation token.
Committer revalidates and calls existing WO actions.

### Unit 4 - Proposal card UI

Files:

- `src/app/(app)/assistant/AssistantChat.tsx`
- a small reusable proposal renderer under `src/components/assistant/` if needed

Render task list, diff, warnings, unresolved items, and confirm affordance. Keep it mobile-first and
accessible.

### Unit 5 - H8 evals

Files:

- `test/evals/assistant-write-tools.golden.ts`
- `test/evals/assistant-fleet.golden.ts`
- maybe `test/evals/work-order-nl.golden.ts`

Add reachability, fleet discrimination, refusal/ambiguity, and unsupported-operation cases.

### Unit 6 - Verify script

Files:

- `scripts/verify-work-order-nl.ts`
- `package.json` script `verify:work-order-nl`

Demo Winery e2e:

1. Seed or assert T12/T15/material fixtures in `org_demo_winery`.
2. Build a proposal for the motivating utterance.
3. Assert RACK, ADDITION, PANEL task builds and no ledger ops.
4. Confirm through the committer.
5. Assert one issued work order exists with expected tasks/reservations.
6. Assert no task attempts and no new `LotOperation` rows were created by authoring.
7. Exercise ambiguity, non-doseable material, unknown-cost, and stale-confirm refusal.

### Unit 7 - Docs and invariants

Files:

- `docs/architecture/assistant-coverage.md`
- `ROADMAP.md` status correction only if the worktree owner permits it
- optionally `INVARIANTS.md` if a new guard name is added

Document that Phase 9.2 extends H8 and is a proposal-authoring path only.

## Verification commands

Narrow gate:

```bash
npx tsc --noEmit --pretty false
npx vitest run test/work-order-nl-proposal.test.ts test/evals/assistant-tools.eval.test.ts test/evals/assistant-fleet.eval.test.ts
npm run verify:work-order-nl
```

Existing domain guards to run before shipping:

```bash
npm run verify:work-orders
npm run verify:work-orders-enhancements
npm run verify:work-orders-transform
npm run verify:cost
npm run verify:ttb
npm run verify:tenant-isolation
npm run verify:invariants
npm run verify:tripwires
npm run test
npm run lint
npm run build
```

Optional gated model check:

```bash
npm run eval:assistant
```

## Engineering review

Artifact: `analysis/phase-9-2-eng-review.md`.

Findings:

- P0: The committer must revalidate full semantic state. A five-minute signed token can outlive a tank move,
  material recategorization, lot-content change, or stock receipt. The final plan requires a compact
  fingerprint over task count/order, resolved ids, resident lots, material state, observed volumes/headroom,
  on-hand/ATP, and available version facts.
- P0: Multi-intent partials must not silently commit. If one required operation is unresolved or unsupported,
  v1 blocks confirmation; the user must regenerate an explicitly narrowed proposal to create only a subset.
- P0: No ledger writes in authoring. The plan explicitly creates and issues WOs only; task completion remains
  the existing ledger path.
- P0: Do not sign explanatory JSON as authority. Sign only canonical task builds plus minimal metadata; recompute
  warnings/cost on confirm.
- P1: Create+issue is two existing actions, so issue failure after draft creation must be recoverable. The plan
  requires returning `draft_created_not_issued` with the draft link and retrying issue against that known draft
  rather than creating duplicates.
- P1: Material category is mutable. The plan requires rechecking stored category on confirm.
- P1: Reservations are advisory and created only on issue. The proposal must not write holds early.
- P1: Fresh warnings returned by `issueWorkOrderAction` must be surfaced in the confirmation result.
- P1: Unknown cost must propagate to proposal diff as unknown. It must not sort or sum as zero.
- P1: Due dates and assignees require deterministic validation. Signed metadata may contain only ISO due dates
  produced by deterministic date resolution and assignee emails validated against tenant members.
- P2: Add confirm-path tests for expired token, stale token, duplicate confirm, and issue failure after draft
  creation.
- P2: Add a verify script that asserts no `LotOperation` rows are created by NL authoring.
- P2: Keep proposal readers K12-safe and avoid ALS reads inside cached functions.

## Deferred council review

External council remains valuable and should be run before `/work` if available. The in-thread `council-mcp`
attempt hung and produced no result artifact, so the following risks are carried forward as council prompts:

- Hallucinated material risk: The model may map "SO2" to a cleaning SO2 strip or invent "sulfur dioxide".
- Hallucinated vessel risk: "T15" may be inactive, missing, or ambiguous.
- Ambiguous panel risk: "juice panel" on a blended vessel could attach to the wrong lot.
- Stale inventory/capacity risk: Proposal says ready but a crew member moves wine before confirm.
- Unsafe WO creation risk: A multi-intent utterance could drop the unsupported piece and still create a partial
  WO.
- LLM overreach risk: Model chooses `rack_wine`/`add_addition` and writes immediate ops instead of creating a
  WO.
- Eval blind spot risk: Structural eval alone only checks schema.
- Regression risk: Existing `issue_operation_wo` overlaps with this feature.

## Design review

Artifact: `analysis/phase-9-2-design-review.md`.

Findings:

- P0: Proposal/diff needs to render as structured UI, not markdown prose. Incorporated: a typed proposal card
  with task rows, before/after vessel/material rows, warnings, unresolved section, and confirm controls bound
  to the visible token.
- Unresolved items need action affordances, not vague prose. Incorporated: choice tokens for ambiguous
  entities, one-tap/keyboard-selectable choices, and no confirm until required items are resolved.
- Confidence should not look like authority. Incorporated: show deterministic statuses ("resolved",
  "needs input", "warning"), not model confidence percentages.
- Mobile/floor use needs compact scanning. Incorporated: one row per task, large confirm/cancel controls,
  short warning text, sticky card actions, and full detail expanders.
- Confirmation affordance must bind to the visible proposal. Incorporated: voice "confirm" applies only to the
  current signed token; stale/expired proposals regenerate.
- Error/partial success must be explicit. Incorporated: if issue fails after draft creation, link the draft and
  state that it was not issued, with a distinct `Draft created, not issued` UI.
- Accessibility: warnings need text plus color, live updates need `aria-live`, choices/confirm controls must be
  keyboard operable.
- Consistency: use existing assistant proposal card language and work-order print/detail labels; render money
  through tenant currency utilities.

## Revised build checklist

- [ ] Build pure proposal schema and validators.
- [ ] Build deterministic resolver/diff/cost/warning read model.
- [ ] Add `propose_work_order` tool and committer.
- [ ] Add stale/expired/duplicate confirm handling and `draft_created_not_issued` recovery.
- [ ] Add proposal card UI.
- [ ] Add H8 golden/fleet/refusal cases.
- [ ] Add `verify:work-order-nl`.
- [ ] Run full WO/cost/compliance/tenant/invariant gates.
- [ ] Update roadmap/runbook status text after user-owned `ROADMAP.md` edits are safe to touch.

## Recommended next command

```text
/work docs/plans/2026-07-09-phase-9-2-nl-work-order-authoring-plan.md
```
