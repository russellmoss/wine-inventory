---
title: Phase 9.3 - Universal work-order authoring and coverage
type: feat-plan
status: in-progress
date: 2026-07-09
branch: codex/phase-9-3-universal-work-order-authoring
depth: deep
reviewed_by: [codex-engineering-review, codex-adversarial-review, codex-design-review, plan-eng-review, council-codex-gpt5.4, council-gemini-3.1-pro]
depends_on:
  - docs/plans/2026-07-09-phase-9-2-nl-work-order-authoring-plan.md
---

# Phase 9.3 - Universal work-order authoring and coverage

## Cross-model review (2026-07-09) - applied hardening

This plan was re-reviewed by `/plan-eng-review` and a cross-LLM council (Codex gpt-5.4 +
Gemini 3.1 Pro), grounded against the actual Phase-9.2 code (`nl-proposal.ts`,
`nl-resolve.ts`, `propose-work-order.ts`, `template-vocabulary.ts`, `execute.ts`,
`bottling/*`, `chemistry/samples.ts`, `vessels/groups.ts`, `cellar/group-apply.ts`).
The following changes were applied where the reviewers converged and the win was clear:

1. **Scope cut.** Bottling and the equipment/facility-asset lane are removed from 9.3 and
   split into their own sub-plans (**Phase 9.4 - bottling WO task**, **Phase 9.5 - facility
   asset maintenance**). All four review voices independently flagged this plan as too large
   for one safety-sensitive phase and proposed the same cut line. See [Deferred sub-plans](#deferred-sub-plans).
   *Vessel* cleaning/sanitizing/gas/etc. stays in 9.3 (those tasks already target `vesselId`);
   only *non-vessel* equipment/floor cleaning needs the asset lane and is deferred.
2. **Dependent dose/capacity math is computed at execution, not plan time.** Simulated plan
   state is UX-only. See [Dependent-task math](#dependent-task-math-execution-time-not-plan-time).
3. **Dependency refs use stable proposal task keys, not `taskSeq`**, with a per-attempt
   produced-output record and state-machine gating. See [Dependency graph](#dependency-graph-hardened).
4. **Partial confirm is allowed but re-signed server-side.** Dropping an unsupported/unresolved
   task re-mints a fresh signed token over the kept set; the client never edits the signed payload.
   See [Partial confirm](#partial-confirm-drop-and-re-sign).
5. **v1 commit tokens are hard-rejected after v2 ships** (no silent upconversion; the existing
   5-min TTL bounds exposure); choice/resume tokens are versioned too. See [Schema version](#schema-version-and-token-compatibility).
6. **Group/barrel fanout is one group-aware task, not N rows** (a per-barrel fanout would blow
   the existing `NL_WORK_ORDER_MAX_TASKS = 25` cap). See [Groups and barrel fanout](#groups-and-barrel-fanout).
7. **Design:** runtime-required vs required-before-issue are distinct states; the confirm shows
   assignee/due/effect and reads "Issue Work Order"; blocked dependencies get a first-class
   execute-screen state; floor accessibility hardened. See [Design review](#design-review).
8. **Manual-first amendment.** The proposal/warning engine is not assistant-owned. It must be a
   shared work-order readiness core used first by the physical/manual work-order builder, then by
   assistant/voice as another input source. This prevents two warning systems and keeps AI as a faster
   drafting method, not a separate authority.

## Why this plan exists

Phase 9.2 built the safe natural-language work-order wedge:

**LLM proposes. Deterministic code validates. Human confirms. Server action creates the work order. The model
never writes ledger operations.**

That wedge is intentionally narrow. The current `propose_work_order` path supports only:

- `RACK`
- `ADDITION`
- `FINING`
- `PANEL`
- `NOTE`

The work-order engine itself is broader. `TASK_VOCABULARY` and execution support already include crush,
press/saignee, harvest weigh-in, cap management, filtration, topping, temperature setpoints, vessel
cleaning/sanitizing/steam/gas/ozone/SO2/wet storage, and checklist notes. The missing product shape is not
"can the app ever press wine from a work order?" It can. The missing shape is:

1. all real cellar-floor work can be represented as typed work-order tasks,
2. natural-language/voice authoring can propose those tasks safely,
3. unsupported or ambiguous work is surfaced rather than silently dropped,
4. work-order completion still routes through deterministic server code and existing ledger/stock cores.

## Reconciled capability map

| User-requested operation | Current state | Gap |
|---|---|---|
| Fruit intake / weighing | `HARVEST_WEIGH_IN` task exists and completes to `HarvestPick` | NL authoring does not cover it; no weigh-tag/gross-tare-net workflow yet |
| Additions at intake | `ADDITION` exists, but targets a current vessel/lot | Need deferred binding to newly crushed/intaken must, or a runtime target rule |
| Destemming / crushing | `CRUSH` task exists and has execute support | NL authoring does not cover it; dependent downstream tasks are weak |
| Pressing / saignee | `PRESS` task exists and execute form supports `PRESS`/`SAIGNEE` | NL authoring does not cover it; press-day workflow composition is weak |
| Tank temperature changes | `TEMP_SETPOINT` task exists | NL authoring does not cover it |
| Cap management | `CAP_MGMT` exists; separate assistant issue tool exists for cap work | NL authoring should compose it with other tasks and fan out across vessels |
| Rack and return / delestage | System template exists as two `RACK` tasks | NL authoring should create the two-task workflow and validate no unsupported partial |
| Transfers | `RACK` covers vessel-to-vessel transfer | Need group-aware barrel fanout and better aliases: transfer, barrel down, rack to tank |
| Cleaning tanks/barrels | `CLEAN`/`SANITIZE`/`STEAM`/`OZONE`/`SO2`/`WET_STORAGE` exist for vessels | NL authoring missing (**in 9.3**) |
| Cleaning press/destemmer/pumps | No first-class non-vessel asset target | **Deferred to Phase 9.5**; surfaced as `unsupported` in 9.3 |
| Cleaning/sanitizing floors | No first-class facility-area target | **Deferred to Phase 9.5**; surfaced as `unsupported` in 9.3 |
| Barreling down | Representable as `RACK` into barrels, but not first-class | Need workflow alias, barrel-group destination planning, and capacity warnings |
| Racking barrel to tank | Representable as multiple `RACK` tasks | Need group-source resolver and fan-in workflow support |
| Filtering | `FILTRATION` exists | NL authoring missing; needs filter-media validation |
| Bottling | Bottling ledger/core exists outside WOs; no `BOTTLE`/`BOTTLING` task in `TASK_VOCABULARY` | **Deferred to Phase 9.4**; surfaced as `future_phase` in 9.3 |
| Sparging / gas blanketing | `GAS` vessel maintenance exists | NL authoring missing; gas as inline dependent task during pressing/filling needs workflow composition |
| Samples for tasting / analysis | sample tools exist; `PANEL` task exists | Need first-class `SAMPLE_PULL`/sample lifecycle WO task, and tasting sample/note task |

## Objective

Make work orders the scheduler for real cellar-floor work:

> "Tomorrow: weigh the Block 7 Merlot, crush it to T12 with enzyme, set T12 to 14 C, press the Syrah in T8
> to T15 and T16, gas T15, clean the press and pump P2, and pull lab samples."

The system should produce a deterministic, typed work-order proposal that names every resolved vessel, block,
material, lot, dependency, cost/supply impact, capacity warning, compliance warning, and unresolved
item. A human confirms. The server creates/issues the WO. Actual ledger/stock/sample writes happen
only when tasks are completed through deterministic server code.

Note: in the north-star sentence above, "clean the press and pump P2" (non-vessel assets) surfaces as
`unsupported` and any bottling clause surfaces as `future_phase` in 9.3 - both are honestly shown and must be
dropped-and-re-signed to commit the rest. Everything else in that sentence is authorable in 9.3.

## Guiding invariant

The invariant from Phase 9.2 is unchanged and stricter here:

**LLM proposes. Deterministic code validates. Human confirms. Server action creates the work order. Crew
completion invokes deterministic cores. No model-originated direct ledger, stock, sample, bottling, or
maintenance writes.**

## Scope

In scope:

- Expand `propose_work_order` from the Phase 9.2 subset to the full current `TASK_VOCABULARY`
  that needs **no schema change**: `TOPPING`, `FILTRATION`, `CAP_MGMT`, `BRIX`, `TEMP_SETPOINT`,
  `CLEAN`, `SANITIZE`, `STEAM`, `GAS`, `OZONE`, `SO2`, `WET_STORAGE`, `CRUSH`, `PRESS`,
  `HARVEST_WEIGH_IN` (plus the existing `RACK`/`ADDITION`/`FINING`/`PANEL`/`NOTE`).
  These all target existing `vesselId`/`lotId`/`blockId` seams. Vessel cleaning/sanitizing/gas
  is fully covered here; only **non-vessel** equipment/floor cleaning is deferred (needs the
  asset lane, Phase 9.5).
- Add first-class sample-pull WO task over the existing idempotent sample core
  (`chemistry/samples.ts`, `pullSampleCore` has `clientRequestId`). Tasting sample/note optional.
- Add workflow aliases over existing task types:
  - `rack_and_return` / `delestage` -> two ordered rack tasks (authored atomically),
  - `press_day` / `crush_day` -> ordered crush/press/addition/gas/vessel-cleaning tasks,
  - `barrel_down` / `rack_barrels_to_tank` -> **one group-aware transfer task** (member
    expansion at execution), NOT one WO task per barrel (see [Groups and barrel fanout](#groups-and-barrel-fanout)).
- Add deterministic dependency references (stable proposal task keys) so a later task can target
  the **actual** output of an earlier task, resolved at completion time.
- Add resolver, warning, proposal diff, and H8 eval coverage for the expanded task set.
- Demo Winery-only verify script and tests.

Out of scope (deferred to explicit sub-plans - see [Deferred sub-plans](#deferred-sub-plans)):

- **Bottling as a WO task -> Phase 9.4.** Wraps the finished-goods/packaging/compliance/COGS
  bottling core, which owns its own SERIALIZABLE tx and is not a `tx`-form. Too large and too
  correctness-sensitive to ride along here.
- **Equipment/facility-area cleaning (non-vessel assets) -> Phase 9.5.** Requires two net-new
  tenant-scoped tables (`FacilityAsset`, `FacilityActivityEvent`) with the full Phase-12 RLS
  checklist. In 9.3 these requests are surfaced as `unsupported` with a clear reason, never faked
  as a `NOTE`.
- **True per-barrel WO task fanout across a group** (one task per member). 9.3 ships a single
  group-aware task; per-member fanout waits on a real group-rack core.

Out of scope (no sub-plan; standing exclusions):

- Full Phase 20 vineyard work-order model beyond `HARVEST_WEIGH_IN`.
- Weighmaster certificates, gross/tare/net, truck delivery grouping, and sold-fruit dispatch.
- Offline-first conflict-resolution sync. Existing idempotency must remain, but full offline is Phase 28.
- Live partner migration adapters.
- Full drag/drop WO calendar.
- Automatic completion of WOs by NL/voice.
- Free-form material or task-type creation by the LLM.
- State excise/compliance calculation beyond conservative warning checks.
- Arbitrary `CUSTOM` operations from voice unless they map to a governed typed task and remain balanced.

## Architecture

### Source-agnostic safe path to preserve

The readiness/proposal layer belongs to normal work-order creation, not to the assistant. Every source feeds
the same deterministic core:

```text
manual UI / template / vessel modal / assistant / voice
  -> TaskBuild[] + metadata
  -> shared WO readiness core
  -> proposal warnings + diff + runtime-required fields
  -> human confirms/creates/issues
  -> deterministic completion cores write real events later
```

The existing creation paths to wire first:

- standalone physical builder: `src/app/(app)/work-orders/new/NewWorkOrderClient.tsx`
- embedded vessel composer: `src/components/vessel/IssueWorkOrderPanel.tsx`
- server composer actions: `src/lib/work-orders/composer-actions.ts`
- lifecycle actions/cores: `src/lib/work-orders/actions.ts`, `src/lib/work-orders/lifecycle.ts`

Flow:

1. A source creates candidate `TaskBuild[]` and metadata.
2. The shared readiness core validates task builds against `TASK_VOCABULARY`.
3. Deterministic resolvers read tenant state.
4. The readiness core emits warnings, unresolved items, cost/supply estimates, runtime-required fields, and a
   diff.
5. Manual UI renders this before create/issue. Assistant renders the same proposal card after NL parsing.
6. Confirmation/submit sends canonical task builds plus metadata.
7. Server revalidates freshness and calls existing `createWorkOrderAction` / `issueWorkOrderAction`.
8. Task completion later calls `completeTaskCore` or a new task-specific completion core.

### New high-level modules

- `src/lib/work-orders/proposal-readiness.ts`
  - Source-agnostic deterministic readiness engine over `TaskBuild[]`.
  - Computes `WorkOrderReadinessProposal`: warnings, cost/supply, capacity, compliance, runtime-required
    fields, unresolved items, diff, freshness fingerprint.
  - Read-only. No reservations, ledger writes, stock movements, sample writes, or maintenance events.
- `src/lib/work-orders/proposal-readiness-actions.ts`
  - Server actions for manual/physical builder preview, create draft, create-and-issue with revalidation.
  - Reuses existing lifecycle cores for writes.
- `src/components/work-orders/WorkOrderReadinessPanel.tsx`
  - Shared renderer used by manual builder and assistant proposal card where practical.
- `src/lib/work-orders/nl-intents.ts`
  - Full intent union for all supported task families. This is only the assistant/voice adapter input.
  - Alias tables: "barrel down", "pump over", "press off", "gas the tank", "wash press".
- `src/lib/work-orders/nl-task-catalog.ts`
  - Deterministic mapping from intent families to `TaskBuild[]`, then delegates to `proposal-readiness`.
  - Generated from `TASK_VOCABULARY` where possible.
  - Explicit allowlist for task types that need special resolver logic.
- `src/lib/work-orders/nl-dependencies.ts`
  - JSON-safe dependency references between tasks.
  - Completion-time resolver for "target is the output of task #N".
- `src/lib/work-orders/nl-workflows.ts`
  - Higher-level workflows that expand to task sequences.
  - Examples: press day, crush day, rack-and-return, barrel down (single group task), vessel sanitation.
- (`src/lib/work-orders/nl-resolve-assets.ts` - the facility/equipment asset resolver - is deferred with the
  Phase 9.5 asset lane.)

## Deterministic proposal schema

Add a source-agnostic readiness schema first:

```ts
type WorkOrderReadinessInput = {
  source: "manual" | "template" | "vessel_modal" | "assistant" | "voice" | "recurring";
  title: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  taskBuilds: TaskBuild[];
  dependencyGraph?: TaskDependency[];
};

type WorkOrderReadinessProposal = {
  schemaVersion: 1;
  source: WorkOrderReadinessInput["source"];
  title: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  status: "ready" | "needs_input" | "blocked";
  taskBuilds: TaskBuild[];
  dependencyGraph: TaskDependency[];
  runtimeInputs: RuntimeInputRequirement[];
  unresolved: UnresolvedItem[];
  warnings: ProposalWarning[];
  cost: ProposalCostSummary;
  diff: ProposalDiff;
  fingerprint: string;
  stateReadAt: string;
};
```

Assistant-specific tokens then wrap this core schema. The assistant may own NL intent parsing and HMAC
confirmation tokens; it does not own the readiness math.

Rev `NL_WORK_ORDER_SCHEMA_VERSION` from `1` to `2`.

Keep the signed commit payload small and authoritative:

```ts
type NlWorkOrderCommitArgsV2 = {
  schemaVersion: 2;
  sourceText: string;
  title: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  taskBuilds: TaskBuild[];
  dependencyGraph: TaskDependency[];
  fingerprint: string;
};
```

Add display-only proposal sections:

- `workflowSummary`: the user's request expanded into typed jobs.
- `coverage`: `supported`, `needs_input`, `unsupported`, `future_phase`.
- `unresolved`: missing/ambiguous vessels, lots, blocks, assets, materials, SKUs, destinations, fractions.
- `warnings`: capacity, supply, compliance, stale data, runtime-required fields, high-risk task warnings.
- `cost`: material/supply/packaging/labor placeholders, with unknown costs explicit.
- `diff`: vessel fill, material ATP, sample queue.
- `runtimeInputs`: fields deliberately left for the execute screen, such as press cuts, harvest weights, or a
  dependent dose finalized against actual predecessor output.

Do not sign explanatory JSON as authority. Sign only canonical task builds, dependency refs, metadata, and a
freshness fingerprint.

### Signed payload is the sole authority

The unsigned display sections (`coverage`, `unresolved`, `warnings`, `cost`, `diff`, `runtimeInputs`) are
advisory only. The committer trusts **only** the HMAC-signed `NlWorkOrderCommitArgsV2` (task builds +
dependency graph + metadata + fingerprint) plus the burned nonce and the recomputed fingerprint. This closes
the partial-commit smuggle path the review flagged (unsigned coverage cannot be trusted to say "everything was
included"):

- A commit token is **only ever minted when the proposal is fully committable** (`status === "ready"`, zero
  unsupported/unresolved required items). Today `propose_work_order` already returns prose instead of a token
  when `status !== "ready"` (`propose-work-order.ts:149`); keep that gate and extend it to the new coverage
  states.
- Dropping a task (see [Partial confirm](#partial-confirm-drop-and-re-sign)) is a **server round-trip that
  re-derives the proposal over the kept set and mints a fresh token**. The client never mutates the signed
  `taskBuilds`.

### Schema version and token compatibility

`NL_WORK_ORDER_SCHEMA_VERSION` is a hard literal `1` typed as `1` in ~6 places (`nl-proposal.ts:3`,
`nl-proposal.ts:92`, `nl-resolve.ts:492`, `propose-work-order.ts:174`, the fingerprint payload
`nl-resolve.ts:274`). Bumping to `2` is a type-level change across those sites.

- **No silent upconversion of v1 tokens.** After v2 ships, the committer accepts only the current version and
  returns the existing friendly stale-proposal error (`"This work-order proposal is stale. Regenerate it
  before confirming."`) for any non-current `schemaVersion`. Signed tokens carry a 5-minute TTL
  (`confirm.ts:9`), so the exposure window for an in-flight v1 token is at most 5 minutes.
- **Version the choice/resume tokens too**, not just the top-level proposal. A `kind:"resume"` token
  (`confirm.ts:49`) minted under v1 must not resolve against a v2 resolver. Stamp and check a schema version
  inside the resume payload as well.

## Parser and LLM boundary

The LLM may:

- split utterances into candidate intents,
- identify rough ordering,
- capture quantities, dates, assignees, and notes,
- classify likely aliases, such as "barrel down" or "wash the press."

The LLM may not:

- invent task types,
- invent materials, assets, vessels, lots, blocks, SKUs, or costs,
- supply trusted IDs unless they came from a signed choice/resume token,
- decide whether a material is doseable,
- decide compliance/capacity safety,
- drop unsupported operations from a multi-intent utterance and still create a partial WO.

Deterministic code owns:

- the task allowlist,
- unit normalization,
- entity resolution and ambiguity,
- material taxonomy constraints,
- workflow expansion,
- dependency graph validation,
- warning/cost/diff generation,
- freshness revalidation,
- final `TaskBuild[]`.

If any required item is unsupported or unresolved, the proposal is non-committable **as a whole**. The user is
not forced to retype (see [Partial confirm](#partial-confirm-drop-and-re-sign)).

### Partial confirm: drop-and-re-sign

Forcing a full regenerate for one bad clause is a dead-end (UX rules 2 and 8) and pushes crews to work
off-system. All review voices converged: let the user drop the unsupported/unresolved tasks and confirm the
rest - **but the drop must be explicit, owned, and re-signed server-side.**

- Each unsupported/unresolved task row carries inline actions: **Resolve** (open the picker in place),
  **Drop** (exclude it), and, where sensible, **Split to a separate work order**.
- Dropping a task calls back to the server, which **re-derives the proposal over the kept set** (re-resolving,
  re-checking coverage, recomputing the fingerprint) and **mints a fresh signed token**. The client never
  edits the signed `taskBuilds`; there is no client-side subsetting of a signed payload.
- Dropped items move to a distinct **"Not included in this work order"** section showing the original
  natural-language phrase, a reason, and a minus/strike affordance. The confirm bar restates the delta in
  plain language: *"Issue 7 tasks now. 3 requested tasks will NOT be created."*
- If dropping a task orphans a dependent task, the cascade is shown, not silent: *"Gas T15 dropped -> its
  source press task was dropped."* The dependent task is dropped or re-flagged as unresolved, never left
  pointing at a missing predecessor.
- The proposal is committable only when zero **kept** tasks are unresolved. Dropped tasks never block.

## Resolver behavior

### Vessels and barrel groups

- Resolve exact codes first, then aliases (`T12`, `tank 12`, `tank T-12`).
- Reject inactive vessels as blocking.
- For group references, resolve deterministically to member vessels at proposal time (sorted by vessel code,
  deduped). Reuse the existing `VesselGroup`/`VesselGroupMember` model (`vessels/groups.ts`); do not invent a
  parallel group notion.
- For barrel-down workflows, warn if the destination set has insufficient total headroom or no clear fill
  allocation rule.

#### Groups and barrel fanout

**Do not fan a group op out to one WO task per member at proposal time.** `NL_WORK_ORDER_MAX_TASKS = 25`
(`nl-proposal.ts:4`) - a 60-barrel group would blow the cap, and dozens of near-identical task rows are
unreviewable on a phone (design rule 3). Instead:

- Represent a group transfer/rack/maintenance as **one group-aware WO task** whose `values` carry the resolved,
  sorted member vessel list. The card shows a single parent row (`"Rack to 10 barrels (B101-B110)"`, collapsed
  by default, expandable to inspect members/exceptions). Execution shows progress (`"4 of 10 done"`) and a
  batch-complete affordance with per-member checkboxes for exceptions.
- Note the current gap honestly: there is **no group-rack core** - `applyToGroup` (`cellar/group-apply.ts`)
  fans ADDITION/FINING/FILTRATION/CAP_MGMT/LOSS/TOPPING but **not RACK**, and it is not wired into the WO
  completion path. So in 9.3, group RACK/barrel-down either (a) stays a single logical task completed via a
  new group-rack completion adapter, or (b) is surfaced as `future_phase` if that adapter is out of budget.
  True per-member WO task fanout is out of scope (see [Deferred sub-plans](#deferred-sub-plans)).
- Whichever path ships, group fanout must mint **one stable task and one stable completion command per real
  floor action** (see [Idempotency](#idempotency)); the resolved member set is part of the signed payload so it
  cannot drift between proposal and completion.

### Lots

- Use `resolveLotTarget` and `LotIdentifier` search.
- Never choose a single lot from a blended vessel without user selection.
- For dependent workflows, reference the producing task by a **stable proposal task key**, not a mutable
  sequence number:

```ts
// taskKey is a proposal-local uuid minted per TaskBuild and carried into the created
// WorkOrderTask; it survives reordering, retries, and fanout. Never use taskSeq.
{ kind: "task_output", taskKey: "tb_3f9c...", output: "destLot" }
```

- Completion-time code must resolve dependency refs through the prior task's **completed attempt's recorded
  output** (the operation/lot/vessel it actually produced), never through model text or a plan-time assumption.
  See [Dependency graph](#dependency-graph-hardened) for the produced-output record and gating rules.

### Blocks / fruit intake

- Use the existing `blockId` seam for `HARVEST_WEIGH_IN`.
- For v1, `HARVEST_WEIGH_IN` may create scheduled placeholders with block/weight unknown if the execute form
  collects them.
- If the user supplies block and weight, validate them and prefill.
- Do not build weighmaster certificates or gross/tare/net here.

### Materials

- Additions/fining:
  - only active `CellarMaterial`,
  - `isDoseableCategory(category)`,
  - no cleaning/sanitizing/packaging materials.
- Cleaning/sanitizing/gas/wet storage:
  - scope through `materialScopeForTask(TASK_VOCABULARY[taskType])`,
  - cleaning chemicals stay overhead and never wine COGS.
- No free-form material writes.
- No auto-created material families.
- Ambiguous material names return signed choice tokens.
- Material category is rechecked on confirm and again on completion where applicable.

### Equipment and facility assets - deferred to Phase 9.5

Non-vessel equipment/floor cleaning ("clean the press", "wash pump P2", "sanitize the crush pad floor") needs
a tenant-scoped asset lane and is **out of scope for 9.3**. In 9.3 these requests resolve to `unsupported` with
a clear reason and no confirm token; they are never faked as a `NOTE`. **Vessel** cleaning/sanitizing/steam/
gas/ozone/SO2/wet-storage stays in scope (those tasks already target `vesselId`).

The schema sketch, RLS checklist, and completion adapter for `FacilityAsset` / `FacilityActivityEvent` move to
the [Phase 9.5 sub-plan](#phase-95---facility-asset-maintenance-deferred), which must also resolve the two
issues the review raised: `WorkOrderTask.assetId` is a single-asset abstraction (real floor actions touch
several assets, forcing fake fanout), and `FacilityActivityEvent` needs optional `vesselId`/`lotId` for
cross-contamination traceability (e.g. a TCA-infected pump touched which wine).

## Workflow expansion

### Press day

Natural language:

> Press T8 to T15 and T16, gas T15, clean the press.

Proposal:

1. `PRESS` task:
   - source vessel/lots if resolvable,
   - op `PRESS` or `SAIGNEE`,
   - fractions may be runtime-required if exact cuts are not supplied.
2. `GAS` task:
   - target vessel `T15`,
   - gas type if supplied, else unresolved/runtime-required.
3. "clean the press" -> **`unsupported` in 9.3** (non-vessel asset, Phase 9.5): surfaced with a reason and no
   confirm token; the user drops it (or splits it out) to commit the press+gas. A vessel-scoped clean
   ("clean T8" after pressing) would instead be a supported `CLEAN` task.

### Crush day

Natural language:

> Weigh Block 7 Merlot, crush to T12, add enzyme, set T12 to 14 C.

Proposal:

1. `HARVEST_WEIGH_IN`.
2. `CRUSH`.
3. `ADDITION` referencing the crush task's output (`{kind:"task_output", taskKey, output:"destLot"}`) or
   targeting vessel `T12` if the vessel is the dosing basis. **The enzyme dose is computed at execution
   against the actual crushed volume, not against a plan-time estimate** (see [Dependent-task
   math](#dependent-task-math-execution-time-not-plan-time)).
4. `TEMP_SETPOINT`.

If enzyme amount is missing, the proposal is `needs_input` or creates a runtime-required addition task only
if the existing execute UI can safely collect it. Do not create a silent "add enzyme" note when a real
addition task was requested.

### Barrel down

Natural language:

> Barrel down T12 into new French barrels B101-B110.

Proposal:

- Expand to one or more `RACK` tasks depending on available core support.
- Use total source volume and destination headroom.
- Warn if no deterministic fill allocation is available.
- If allocation is missing, require input rather than overfilling evenly by assumption.

### Rack and return / delestage

Natural language:

> Rack and return T4 through T20.

Proposal:

1. `RACK` from origin to holding vessel.
2. `RACK` from holding vessel back to origin.

Warnings:

- holding vessel must have enough headroom,
- origin must still be destination for return,
- no-net-gain expectation is shown,
- both tasks must stay together; no partial confirmation.

### Bottling - deferred to Phase 9.4

Bottling is **not** in 9.3. See [Deferred sub-plans](#deferred-sub-plans) for why (own SERIALIZABLE tx, master-data
mutation on SKU create, finished-goods/COGS/compliance surface) and what the 9.4 plan must cover. In 9.3, a
"bottle T15..." request is surfaced as `future_phase`, never faked as a `NOTE`.

### Samples and tasting

Add first-class WO task(s) over the existing sample/tasting primitives:

- `SAMPLE_PULL`: pull/send sample for lab analysis.
- `TASTING_SAMPLE` or `TASTING_NOTE`: pull tasting sample or schedule sensory note.

Completion should call the existing sample/tasting server cores. A `PANEL` task remains a chem-panel
observation, not a full sample lifecycle replacement.

## Cost, supply, capacity, compliance

### Cost

- Addition/fining: same dose math as Phase 9.2 (dependent doses estimated for display, finalized at execution).
- Maintenance: vessel cleaning/sanitizing/gas/wet-storage supply use is overhead, not wine COGS.
- Sampling/lab tasks: show `UNKNOWN` or configured lab fee only if a real fee model exists. Do not invent.
- (Bottling packaging cost and facility supply cost are deferred with their sub-plans; unknown cost is always
  explicit `UNKNOWN`, never `$0`.)

### Supply

- Material ATP for all material-consuming task types:
  - wine doses,
  - cleaning/sanitizing chemicals,
  - SO2 strips/discs,
  - wet-storage reagents,
  - gas/dry ice supplies.
  - (packaging materials arrive with bottling in Phase 9.4.)
- Reservations remain advisory and created on issue only.
- Completion cores still enforce draw-to-zero/shortfall behavior.

### Capacity

- Racking, topping, barrel-down, press fractions, and crush destination all need capacity checks.
- Dependent workflows may compute a **simulated plan state** across ordered tasks (an addition after a rack
  estimated against planned volume, a second transfer against planned headroom) **for display and warnings
  only.** See [Dependent-task math](#dependent-task-math-execution-time-not-plan-time) - simulated state is
  never the committed dose or the authoritative capacity gate for a dependent task.
- Stale confirmations re-read real state (the fingerprint over resolved vessels/lots/materials) and refuse
  material changes.

### Dependent-task math (execution time, not plan time)

Both review lenses flagged this as the top correctness trap. Crush/press/harvest **actuals routinely diverge
from plan** (yields, cuts, weights). If a dependent addition's dose is fixed at plan time against an estimated
volume, completing it later doses a wrong amount against the real volume - ruining wine or breaking a legal
addition limit.

Rules:

- A dependent task's dose/capacity math is **recomputed at execution** from the predecessor's actual recorded
  output, inside the same deterministic completion core that already owns dose math today.
- The proposal shows the estimate as a labeled, non-authoritative preview (e.g. *"~est. against planned volume;
  final dose computed at execution"*).
- **Prohibit committed dependent math when the upstream output is unknown** - i.e. when the predecessor is a
  runtime-required placeholder (`CRUSH`/`PRESS`/`HARVEST_WEIGH_IN` whose real inputs land on the execute
  screen). In that case the dependent addition is itself runtime-required (dose entered/confirmed at execution),
  not pre-baked.

### Compliance

Warnings only unless an existing core already blocks:

- tax-class/bond crossing,
- missing ABV/tax class on source lots,
- fruit intake data missing for compliance artifacts,
- custom-crush/client-owned lots where costs or bill-back may behave differently.

(Bottling in-bond/taxpaid and removal-status compliance move with the bottling task to Phase 9.4.)

Never claim a filing simulation unless the existing compliance engine was actually invoked.

## Server boundaries and transactions

Authoring:

- read-only,
- no reservations,
- no ledger writes,
- no stock movements,
- no samples,
- no bottling runs,
- no maintenance events.

Confirm:

- burn assistant nonce,
- revalidate fingerprint,
- create work order,
- issue work order,
- return created/issued state.

Completion:

- existing `completeTaskCore` for operation/observation/maintenance/note paths (dispatch by `task.kind` then
  `task.opType`, `execute.ts:243`/`:64`),
- one new completion adapter for the new sample-pull task -> `pullSampleCore` (`chemistry/samples.ts`), threading
  the WO attempt's `commandId` into the sample core's `clientRequestId` so idempotency is end-to-end
  (see [Idempotency](#idempotency)),
- dependency-output resolution: a dependent task reads its predecessor's completed-attempt output at completion
  and refuses to run if the predecessor is not yet successfully completed.

(Bottling -> bottling core and facility -> facility-event adapters are deferred with their sub-plans.)

### Authoring atomicity vs execution independence

The review caught an apparent contradiction: "paired workflows must stay together, no partial confirm" vs
"partial floor completion preserves per-task status, no rollback." These are two different layers and both hold:

- **Authoring is atomic.** A `rack_and_return` / `delestage` pair is confirmed as a unit or not at all - you
  cannot confirm just the out-rack. The two tasks are created together in one `createWorkOrderAction`.
- **Execution is independent and irreversible-forward.** On the floor the return can fail after the out-rack
  already posted a real ledger op; you cannot un-rack wine. So per-task status is preserved and earlier real
  operations are never rolled back. A half-done paired workflow surfaces as an **incomplete-workflow warning**
  on the WO, not as a blocked or reversed operation.

Failure mode:

- If create succeeds and issue fails, return `draft_created_not_issued` with a draft link.
- If a later task cannot resolve dependency output because a prior task was skipped/rejected/not-yet-done, block
  that task with a clear dependency error naming the predecessor in winery language.
- If a batch/paired workflow partially completes on the floor, preserve each task's status independently; do not
  rollback earlier real operations; surface the incomplete workflow.

## Dependency graph (hardened)

`taskSeq` is the wrong identifier for a dependency ref: retries, reordering, drop-and-re-sign, and fanout all
break sequence-based resolution and can silently target the wrong lot/vessel. Design:

- **Stable proposal task key.** Each `TaskBuild` gets a proposal-local `taskKey` (uuid). It is carried into the
  created `WorkOrderTask` so completion-time refs survive reordering/retries. Dependency refs use `taskKey`,
  never a sequence number.
- **Produced-output record per attempt.** A successful `WorkOrderTaskAttempt` records the concrete output it
  produced (operation id, resulting lot/vessel). Downstream `task_output` refs resolve against that record, not
  against model text or plan-time assumptions. This reuses the append-only attempt row that already exists
  (`WorkOrderTaskAttempt.commandId @unique`, `schema.prisma:3420`).
- **State-machine gating.** A dependent task is not completable until its predecessor has a *successful*
  attempt. Attempting it earlier returns a clear dependency error (predecessor named in winery language). This
  prevents a crew from executing "add SO2 to the crush destination" before the crush exists.
- **Defined edge cases (must have tests):**
  - predecessor **skipped/rejected** -> dependent blocked, clear error;
  - predecessor **retried** -> ref resolves to the latest *successful* attempt's output;
  - predecessor produces **multiple outputs** -> ref names which output (`output:"destLot"`); ambiguous refs
    are a proposal-time error, not a completion-time guess;
  - predecessor **out of order** -> gating blocks it;
  - predecessor is a **runtime-required placeholder** with unknown output -> dependent math is itself
    runtime-required (see [Dependent-task math](#dependent-task-math-execution-time-not-plan-time)).
- **Pure validation at proposal time:** the dependency graph is a DAG (no cycles), every `taskKey` referenced
  exists in the same proposal, and no ref crosses out of the confirmed task set after a drop.

## Idempotency

- Authoring confirmation remains nonce-bound (nonce burned once in `commit.ts`; `signResume` picker tokens are
  idempotent and not burned).
- `WorkOrderTaskAttempt.commandId @unique` remains the completion idempotency key.
- The new sample completion adapter must thread the WO attempt `commandId` into `pullSampleCore`'s
  `clientRequestId` so a retry after the sample core commits but before the attempt status updates does **not**
  create a duplicate sample. Duplicate-as-success at the adapter boundary is not enough on its own; the
  downstream core must persist the same idempotency key in the same transaction. (Same requirement applies to
  the deferred bottling/facility adapters when they land.)
- Group fanout must mint one stable task and one stable completion command per real floor action; the resolved
  member set is in the signed payload so it cannot drift between proposal and completion.
- Dependency references must resolve by `taskKey`/attempt IDs, not by mutable labels or model text.

## Tenant isolation

- **9.3 adds no new tables** (the asset tables moved to Phase 9.5), so there is no new RLS surface here - a
  meaningful risk reduction. The new sample WO task and dependency refs reuse existing tenant-scoped tables
  (`WorkOrderTask`, `WorkOrderTaskAttempt`, `Sample`).
- When Phase 9.5 adds `FacilityAsset`/`FacilityActivityEvent`, they follow the full Phase-12 checklist
  (`AGENTS.md:59-70`): `tenantId String @default("")` + index, migration FK to `organization` ON DELETE
  RESTRICT, backfill then NOT NULL, per-tenant uniques, composite `(tenantId, id)` FK targets, RLS
  ENABLE+FORCE with USING+WITH CHECK, keep off the `GLOBAL_MODELS` denylist, `app_rls` grants, and a
  `verify:tenant-isolation` case.
- Demo/test fixtures use `org_demo_winery` only. No test data in Bhutan Wine Co.
- Avoid raw SQL. If raw SQL is required for composite FKs/RLS, add raw SQL safety coverage.

## H8 eval and regression gate

Extend the H8 golden set with full-coverage WO prompts:

- "Press T8 to T15 and T16, gas T15, clean the press."
- "Weigh Block 7 Merlot, crush to T12, add 30 ppm SO2, set T12 to 14 C."
- "Punch down T4, T5, and T6 twice today."
- "Rack and return T4 through T20."
- "Barrel down T12 into B101-B110."
- "Rack barrels B101-B110 back to T15."
- "Filter T15 through 0.45 micron pads."
- "Clean and sanitize T15 and T16." -> supported (vessel maintenance).
- "Barrel down T12 into B101-B110." -> one group-aware transfer task, not 10 rows.
- "Pull lab samples from T12 and T15 and send them to ETS."
- "Add sanitizer to T12 as an addition." -> blocked as non-doseable.
- "Press the Syrah" with multiple Syrah lots -> needs input.
- "Clean the destemmer / press / pump P2 / crush pad floor." -> `unsupported` (facility assets, Phase 9.5),
  surfaced with reason, no confirm token; not faked as a NOTE.
- "Bottle T15 into the 2024 Estate Pinot SKU, 56 cases." -> `future_phase` (bottling, Phase 9.4); a mixed
  request containing it is committable only after the bottle task is dropped-and-re-signed.
- "Do everything for harvest tomorrow" -> blocked as too broad.
- Mixed request "press T8 to T15, gas T15, clean the press, bottle T15" -> committable only after the
  unsupported clean-press (asset) and future-phase bottle clauses are dropped; confirm restates the delta.

Regression gates:

- Structural eval: every supported task family has at least one golden.
- Fleet eval: authoring work orders routes to `propose_work_order`, not immediate write tools.
- Parser/resolver eval: no hallucinated IDs or materials.
- Safety eval: unsupported mixed requests are non-committable.
- Staleness eval: changed vessel/material/asset state refuses confirmation.

## Implementation units

> **Progress (2026-07-09):** Units 1-3 shipped on branch `claude/phase-9-3-work-order-authoring-17d114`.
> - [x] **Unit 1** - shared readiness engine (`proposal-readiness.ts`, pure core + coverage table + 15 tests) - `e93760d`
> - [x] **Unit 2** - readiness wired into the manual builder + vessel issuer + server write-gate + `WorkOrderReadinessPanel` - `1a32ae4`
> - [x] **Unit 3** - assistant path on the shared core; schema v1->2; hard-reject old/resume tokens; `taskKey` - `7dc4bca` (verify:work-order-nl 14/14 green)
> - [ ] **Unit 4** - resolver expansion for the remaining no-schema-change task types (NL parsing broadening)
> - [ ] **Unit 5** - hardened dependency graph (execution-time dependent math + gating)
> - [ ] **Unit 6** - group-aware transfer/rack task (DECIDED: wire a real group-rack completion adapter)
> - [ ] **Unit 7** - sample/tasting WO tasks
> - [ ] **Unit 8** - proposal + execute UI expansion (in-place pickers, drop-and-re-sign, floor a11y)
> - [ ] **Unit 9** - H8 evals + `verify:universal-work-order-authoring` + Demo Winery e2e

### Unit 1 - Shared physical work-order readiness engine

- Add `src/lib/work-orders/proposal-readiness.ts` as the single deterministic read model for all work-order
  creation sources.
- Input is already-canonical `TaskBuild[]` plus title/assignee/due/source metadata; no assistant/NL concepts
  are required.
- Output is `WorkOrderReadinessProposal`:
  - readiness status: `ready`, `needs_input`, `blocked`,
  - cost estimates with unknown cost preserved as `UNKNOWN`,
  - material/supply ATP,
  - vessel/lot/source/destination capacity warnings,
  - conservative compliance warnings,
  - runtime-required fields,
  - unresolved items,
  - before/after diff,
  - freshness fingerprint.
- The core is strictly read-only:
  - no `LotOperation`,
  - no `StockMovement`,
  - no `Sample`,
  - no `VesselActivityEvent`,
  - no reservations,
  - no work-order writes.
- Add a machine-readable coverage table over `TASK_VOCABULARY` so the readiness core can classify every task
  type consistently.
- Test that every task type is either:
  - readiness-supported,
  - runtime-only with explicit reason,
  - blocked/unsupported with explicit reason,
  - future-phase with explicit reason.
- Unit tests cover cost/supply/capacity/compliance/readiness without any assistant code.

Initial readiness coverage:

- `RACK`: source volume, destination headroom, active reservations, mixed-lot/compliance review.
- `ADDITION`/`FINING`: material taxonomy, dose conversion, material ATP, unknown cost.
- `TOPPING`: source volume, destination headroom.
- `FILTRATION`: filter media/micron/runtime actual-output requirements.
- `CAP_MGMT`: technique validation, volume-neutral warning surface.
- `BRIX`/`PANEL`: lot/vessel resolution and blended-vessel ambiguity.
- `TEMP_SETPOINT`: target unit/value validation.
- vessel `CLEAN`/`SANITIZE`/`STEAM`/`GAS`/`OZONE`/`SO2`/`WET_STORAGE`: vessel target, scoped material ATP,
  overhead cost classification.
- `CRUSH`/`PRESS`/`HARVEST_WEIGH_IN`: runtime-required fields and supported planning placeholders.
- `NOTE`: no inventory/cost/ledger effect.

### Unit 2 - Wire readiness into physical/manual WO creation

- Update `src/app/(app)/work-orders/new/NewWorkOrderClient.tsx` to call the readiness preview as the user
  changes template, task fields, assignee, or due date.
- Update the embedded vessel issuer in `src/components/vessel/IssueWorkOrderPanel.tsx` to show the same
  readiness panel in locked-vessel mode.
- Add/extend server actions in `src/lib/work-orders/proposal-readiness-actions.ts` or
  `src/lib/work-orders/composer-actions.ts`:
  - `previewWorkOrderReadinessAction`,
  - `createWorkOrderWithReadinessAction`,
  - `createAndIssueWorkOrderWithReadinessAction`.
- Create/issue actions re-run readiness on the server immediately before writing. If the fingerprint is stale
  or a blocker appears, return the refreshed proposal rather than writing.
- Render a shared `WorkOrderReadinessPanel` with:
  - warnings by severity,
  - cost/supply lines,
  - vessel/material diff,
  - runtime-required floor inputs,
  - unresolved/blocking items,
  - issue/create CTA disabled only for true blockers.
- Preserve the existing create path behavior where possible: readiness augments the form; it does not replace
  `createWorkOrderFromTemplateCore` or `issueWorkOrderCore`.
- Add tests that manual creation and the embedded vessel modal receive the same warnings for the same
  `TaskBuild[]`.

### Unit 3 - Assistant intent/schema v2 over shared readiness

- Add `NlWorkOrderIntentV2`.
- Add workflow alias canonicalization.
- Add deterministic task family allowlist.
- Bump `NL_WORK_ORDER_SCHEMA_VERSION` 1 -> 2 across the ~6 literal sites.
- **Hard-reject non-current `schemaVersion`** at commit with the existing stale-proposal error; no
  upconversion. Version the `signResume` choice/resume token payload too.
- Add the proposal-local `taskKey` (uuid per `TaskBuild`) and carry it into `createWorkOrderAction`.
- Refactor `propose_work_order` so it parses NL into `TaskBuild[]`, then calls the shared readiness core.
  It must not maintain a parallel warning/cost/capacity/compliance implementation.
- Update assistant guidance so current `propose_work_order` no longer claims a smaller surface once expanded.

### Unit 4 - Resolver expansion for existing task types

Add readiness/NL resolver-builders for:

- `TOPPING`
- `FILTRATION`
- `CAP_MGMT`
- `BRIX`
- `TEMP_SETPOINT`
- `CLEAN`
- `SANITIZE`
- `STEAM`
- `GAS`
- `OZONE`
- `SO2`
- `WET_STORAGE`
- `CRUSH`
- `PRESS`
- `HARVEST_WEIGH_IN`

CRUSH/PRESS/HARVEST may produce runtime-required placeholders when the execute screen owns the real inputs.

### Unit 5 - Dependency graph (hardened)

- Define `TaskDependency` keyed by `taskKey` (not `taskSeq`).
- Add pure validation: DAG (no cycles), every referenced `taskKey` exists, no ref orphaned after a drop.
- Add produced-output recording on successful `WorkOrderTaskAttempt`.
- Add completion-time resolver reading the predecessor's latest successful attempt output.
- Add state-machine gating (dependent not completable before predecessor success).
- Add the **display-only** simulated plan-state builder (never authoritative for committed dose/capacity).
- Add tests for skipped/rejected/retried/multi-output/out-of-order/runtime-placeholder cases.

### Unit 6 - Group-aware transfer/rack task

- Add a single group-aware transfer/rack/maintenance task (resolved, sorted member list in `values`), reusing
  `VesselGroup`/`VesselGroupMember`.
- Add the `barrel_down` / `rack_barrels_to_tank` aliases mapping to it.
- Either wire a group-rack completion adapter (extend `applyToGroup` to RACK, or a new adapter) OR surface
  group RACK as `future_phase` if the adapter is out of budget. Do not silently fan out to per-barrel tasks.
- Respect `NL_WORK_ORDER_MAX_TASKS`; one group op is one task.

### Unit 7 - Sample/tasting WO tasks

- Add sample pull/send task type over `pullSampleCore` (idempotent, `clientRequestId`).
- Optionally add tasting sample/note task type.
- Completion adapter threads the WO attempt `commandId` into the sample core idempotency key.
- Keep `PANEL` as a chem-panel observation.

### Unit 8 - Proposal + execute UI expansion

- Manual builder and assistant card use the same readiness visual language. Prefer a shared
  `WorkOrderReadinessPanel`; if the assistant needs a compact wrapper, the underlying row/status components
  should still be reused.
- Group the proposal/readiness card by workflow sections; use **full-width rows** (not chips) as the primary
  control.
- Distinguish states explicitly: `Required before issue` (blocking) vs `Later on floor` (runtime, non-blocking);
  `Warning`; `Excluded / Not included`.
- Unresolved items get the picker **in place** on the affected task row (UX rule 1), with a top "Needs
  decisions" summary that jumps to them.
- Drop-and-re-sign affordance per unsupported/unresolved row; sticky confirm bar restating the delta.
- Confirm shows assignee + due date + effect summary; CTA reads **"Issue Work Order"**; destructive diffs need
  an explicit per-task acknowledgment.
- Execute screen: group parent row with progress + batch complete; blocked dependencies visually locked with a
  tappable "Blocked by: <predecessor>" badge that scrolls to it.
- Accessibility: >=44px targets, 7:1 contrast, text labels on every state (no color-only), `aria-live` on
  proposal/exclusion changes, deterministic focus after resolving a picker.

### Unit 9 - H8 evals and verify script

- Extend eval golden files.
- Add unit/integration tests for the shared readiness core independent of assistant prompts.
- Add a manual-builder regression that the physical `/work-orders/new` route surfaces readiness warnings before
  create/issue.
- Add `verify:universal-work-order-authoring`.
- Demo Winery e2e:
  - preview a manual RACK+ADDITION+PANEL work order and assert the same warning set the assistant would show,
  - author a press-day WO,
  - author a crush-day WO,
  - author a vessel-sanitation WO,
  - author a group barrel-down WO (single group task),
  - assert no authoring-created ledger/stock/sample events,
  - confirm and assert only WOs/tasks/reservations were created,
  - complete selected tasks and assert deterministic cores own the writes,
  - complete a dependent addition and assert its dose was computed against the predecessor's **actual** output,
  - attempt a dependent task before its predecessor and assert it is blocked,
  - drop an unsupported task and assert a fresh signed token over the kept set (no client-side subsetting).

## Verification commands

Narrow:

```bash
npx tsc --noEmit --pretty false
npx vitest run test/work-order-readiness.test.ts test/work-order-nl-proposal.test.ts test/work-order-templates.test.ts test/evals/assistant-tools.eval.test.ts test/evals/assistant-fleet.eval.test.ts
npm run verify:work-order-nl
npm run verify:universal-work-order-authoring
```

Domain guards:

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

Findings incorporated:

- **P0: The warning engine must be shared, not assistant-owned.** Manual `/work-orders/new`,
  `IssueWorkOrderPanel`, assistant, voice, templates, and recurring WOs all feed the same readiness core.
  Assistant parsing only creates candidate `TaskBuild[]`.
- **P0: Do not broaden NL by loosening trust.** Expansion must be vocabulary-driven; unsupported operations
  stay non-committable. The signed `TaskBuild[]` is the sole authority; unsigned coverage is advisory; a token
  is only minted for a fully-committable set. See [Signed payload authority](#signed-payload-is-the-sole-authority).
- **P0: Dependent-task math must be execution-time.** Simulated plan state is display-only; a dependent dose is
  computed at completion against the predecessor's actual output. See [Dependent-task
  math](#dependent-task-math-execution-time-not-plan-time). *(Both council eng voices ranked this the top trap.)*
- **P0: Dependency refs use stable `taskKey`, not `taskSeq`**, resolve against a recorded per-attempt output,
  and gate downstream on predecessor success. See [Dependency graph](#dependency-graph-hardened).
- **P0: Bottling is deferred to Phase 9.4.** Too large/correctness-sensitive; its core owns its own tx.
- **P0->deferred: Equipment/floor cleaning -> Phase 9.5.** In 9.3, surfaced as `unsupported`, never faked as a
  note. Vessel cleaning stays in scope.
- **P0: Idempotency end-to-end.** The sample completion adapter threads the WO attempt `commandId` into the
  sample core's key; duplicate-as-success at the adapter alone is insufficient.
- **P1: Multi-intent partials must not commit silently.** No confirm token while any *kept* task is unresolved;
  dropping an unsupported piece re-signs server-side. See [Partial confirm](#partial-confirm-drop-and-re-sign).
- **P1: Group fanout is one group-aware task**, not N per-barrel tasks (would blow `NL_WORK_ORDER_MAX_TASKS`);
  members sorted/deduped and in the signed payload.
- **P1: Cost unknown is not zero.** Lab/cleaning/gas unknowns propagate as unknown.
- **P1: Reservations stay advisory.** No authoring-time holds.
- **P1: Paired-workflow atomicity is authoring-time, not execution-time** - resolves the "stay together" vs
  "no rollback" contradiction. See [Authoring atomicity](#authoring-atomicity-vs-execution-independence).
- **P1 -> DECIDED: v1 tokens hard-rejected after v2**, no upconversion; 5-min TTL bounds exposure; resume
  tokens versioned. See [Schema version](#schema-version-and-token-compatibility).

## Adversarial review

Findings incorporated:

- **Hallucinated press/floor assets:** "the press"/"the floor" are non-vessel assets - deferred to Phase 9.5,
  so in 9.3 they resolve to `unsupported` with a reason and no confirm token (never a note).
- **Hallucinated materials:** "SO2" could mean wine dose, barrel strip, or wet-storage reagent. Route by task
  context and material category; ambiguity blocks.
- **Ambiguous workflows:** "press the Syrah" may match several lots or tanks. Needs input.
- **Unsafe broad prompts:** "do everything for harvest" is too broad and should be blocked.
- **Silent drop risk:** A parser might understand "bottle" but not support it. Mixed unsupported requests are
  non-committable.
- **Stale plan risk:** Headroom, source lots, and material categories can change between proposal and confirm.
  Fingerprint all resolved state and revalidate.
- **LLM overreach:** Fleet eval must catch routing to direct tools like `rack_wine`, `add_addition`,
  `pull_sample`, or bottling tools when the user asked for a work order.
- **Eval blind spots:** Golden prompts need negative cases, mixed-support cases, and ambiguity cases, not just
  happy-path press-day prompts.

## Design review

Findings incorporated (hardened by the cross-model design pass; both design voices converged):

- **Manual builder gets the readiness UI first.** The physical WO creation screen shows cost/supply/capacity/
  compliance warnings before create/issue; the assistant uses the same visual system rather than a bespoke AI
  card.
- **Partial confirm, not dead-end regenerate.** One unsupported clause must not force a full retype (UX rules 2,
  8). Drop-and-re-sign per row; dropped items in a distinct "Not included" section; confirm bar restates the
  delta (*"Issue 7 tasks now. 3 will NOT be created."*). See [Partial confirm](#partial-confirm-drop-and-re-sign).
- **Two distinct blank states, never one ambiguous empty field.** `Required before issue` (blocking,
  high-salience, on the proposal card) vs `Later on floor` (neutral, non-blocking, dashed/clipboard, attached to
  the execute step). A winemaker must never confuse an intentional floor input with an error.
- **Actions live on the thing (UX rule 1).** Pickers/choice controls open **in place** on the affected task row;
  the top "Needs decisions" summary jumps to them. No detached unresolved-items pile.
- **Barrel/group fanout reviews as one parent row.** Collapsed `"Rack to 10 barrels (B101-B110)"` with count +
  exceptions; expand to inspect; execute screen shows `4 of 10 done` + batch complete. Never dump N near-identical
  rows above the fold.
- **Minimum trustworthy confirm.** One confirm may both create and issue, but only if assignee/crew, due
  date/shift, dropped-task count, blocking warnings, and a one-line effect (*"Creates reservations and issues to
  crew now"*) are visible and editable above the CTA. CTA reads **"Issue Work Order"**, not "Confirm".
  Destructive diffs (e.g. blending varietals) require an explicit per-task acknowledgment before the CTA enables.
- **Warnings need severity and plain language.** Text + icon + label; no confidence percentages; no color-only.
- **Partial/failure states are first-class.** After submit show exactly one of `Issued` / `Draft created, not
  issued` / `Issue failed`, each with reason + next action. On the execute screen, blocked tasks are visually
  locked with a tappable `Blocked by: <predecessor>` badge that scrolls to the dependency.
- **Floor conditions.** >=44px touch targets, full-width rows (not chips) as the primary control, 7:1 contrast,
  sticky single-column layout, no horizontal diff tables.
- **Accessibility.** Keyboard-operable controls, `aria-live` on proposal/exclusion changes, deterministic focus
  after resolving a picker, a full-sentence confirm summary for screen readers.
- **Consistency.** Reuse `TASK_VOCABULARY` labels and existing assistant confirmation affordances.

## Product decisions

Resolved by the cross-model review:

1. **Bottling scope -> DECIDED: split to Phase 9.4.** It wraps finished-goods/packaging/compliance/COGS and its
   core owns its own SERIALIZABLE tx. Deferred.
2. **Asset taxonomy -> DECIDED: defer the whole asset lane to Phase 9.5.** The naming/enum question moves with
   it; 9.5 must also reconsider single-`assetId` vs a task-target join and add `vesselId`/`lotId` traceability
   on the event.
3. **Sampling scope -> DECIDED: WO sample tasks create real sample records on completion** via the existing
   idempotent `pullSampleCore`. `PANEL` remains a separate chem-panel observation.
4. **Dependency depth -> DECIDED: true task-output refs by `taskKey`, resolved at completion from actual
   output**, with dependent math finalized at execution and runtime-required fallback when the predecessor's
   output is unknown. See [Dependency graph](#dependency-graph-hardened).

Still to confirm before `/work`:

5. **Group RACK adapter budget:** does 9.3 wire a real group-rack completion adapter (extend `applyToGroup` to
   RACK), or ship group barrel-down as `future_phase` for now? Affects whether "barrel down" is authorable end
   to end in 9.3.

## Deferred sub-plans

### Phase 9.4 - Bottling WO task (deferred)

A schedulable bottling task wrapping the existing bottling core. Must cover: pre-existing SKU only (no
create-SKU-at-execution master-data mutation in the completion path); one WO task == one `executeBottling` run;
route finished-goods/COGS/stock **only** through the bottling core; reconcile the tx-ownership mismatch
(`applyBottling`/`executeBottling` own their own SERIALIZABLE tx, unlike the `tx`-form cores dispatched by
`dispatchOperationTx`); proposal warnings for source volume, SKU/location ambiguity, packaging ATP, unknown
cost, and compliance (in-bond/taxpaid, tax class); command-ID idempotency threaded end-to-end;
no-ledger-on-authoring verify assertion.

### Phase 9.5 - Facility asset maintenance (deferred)

The non-vessel equipment/floor cleaning lane: `FacilityAsset` + `FacilityActivityEvent` (both on the full
Phase-12 tenant checklist), seed fixtures (press, destemmer, pumps, crush pad floor, drains), and a facility-
event completion adapter. Must resolve: single-`assetId` is the wrong abstraction (one floor action can touch
several assets - use a task-target join or explicit multi-asset model); add optional `vesselId`/`lotId` on the
event for cross-contamination traceability; command-ID idempotency in the same tx as the event write.

## Recommended execution

Do not try to land everything in one huge PR. Build in this order (bottling and assets are out - see
[Deferred sub-plans](#deferred-sub-plans)):

1. Shared readiness core + coverage contract - Unit 1.
2. Physical/manual WO creation wiring (`/work-orders/new` and embedded vessel issuer) - Unit 2.
3. Assistant intent/schema v2 over the shared readiness core - Unit 3.
4. Resolver expansion for all existing no-schema-change `TASK_VOCABULARY` types - Unit 4.
5. Dependency graph with execution-time dependent math + gating - Unit 5.
6. Group-aware transfer/rack task - Unit 6.
7. Sample/tasting WO tasks - Unit 7.
8. Shared proposal/readiness + execute UI expansion - Unit 8.
9. Harden H8 coverage and verify gates after each unit - Unit 9.

## Recommended next command

```text
/work docs/plans/2026-07-09-phase-9-3-universal-work-order-authoring-plan.md
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES ADDRESSED | Grounded against Phase-9.2 code; scope cut, dependency-graph + execution-time-math hardening applied; manual-first amendment added |
| Outside Voice | `/council` (Codex gpt-5.4) | Independent 2nd opinion | 1 | ISSUES ADDRESSED | 9 ranked findings; 8 applied (signed-authority, taskKey, sim-state, bottling defer, e2e idempotency, paired-workflow, v1 reject, asset defer) |
| Outside Voice | `/council` (Gemini 3.1 Pro) | Independent 2nd opinion | 1 | ISSUES ADDRESSED | 9 findings; strong convergence with Codex on the same 7 items + drop-at-confirm UX |
| Design Review | `/council` design lens | UI/UX gaps | 1 | ISSUES ADDRESSED | Partial-confirm, distinct runtime/blocking states, confirm affordance, blocked-dep execute UI, floor a11y |

**CROSS-MODEL:** Codex and Gemini converged independently on all P0/P1 structural findings - strongest possible
signal. Applied: (1) scope cut (bottling->9.4, assets->9.5), (2) execution-time dependent math, (3) stable
`taskKey` + produced-output + gating, (4) signed-payload-only authority + drop-and-re-sign partial confirm, (5)
hard v1 token reject + versioned resume tokens, (6) one group-aware task vs per-barrel fanout (MAX_TASKS), (7)
end-to-end idempotency, (8) authoring-atomicity vs execution-independence, (9) design: distinct states + confirm
affordance + blocked-dep UI + floor a11y.

**ONE DECISION LEFT (product):** Group-RACK completion adapter budget - wire a real group-rack adapter in 9.3, or
ship group barrel-down as `future_phase`? See [Product decisions](#product-decisions) item 5.

**NOT in scope (deferred with rationale):** bottling (9.4), facility/equipment-asset cleaning (9.5), true
per-barrel WO task fanout (needs group-rack core). See [Deferred sub-plans](#deferred-sub-plans).

**VERDICT:** ENG + OUTSIDE-VOICE + DESIGN reviewed; convergent hardening applied. One product decision (group-RACK
adapter budget) to confirm before `/work`.
