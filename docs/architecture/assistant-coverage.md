# Assistant capability coverage

> Living matrix of **what a winemaker can do in the app** vs. **what the AI assistant can do for them**.
> This is a *coverage matrix derived from the code*, not a parallel roadmap — regenerate it by auditing
> the tool registry against the domain cores; do not hand-maintain a wishlist that drifts.
> Last audited: 2026-07-09. Base cellar/ledger surface = 28 tools; plan 040 added a **winemaking
> calculator** (7 read/compute tools, see below); plan 042 added navigation/deep-link tools; Phase 9.2
> added natural-language work-order authoring.

## Why this exists

The assistant (and the MCP surface it becomes) is the "talk to do anything" wedge. Every feature we make
assistant-controllable compounds that wedge *now*. The policy (see the go-forward gate below) is: **a
feature isn't done until its write path has a typed tool + a golden eval case.** This doc tracks the
retrofit backlog for everything built before that policy, and stays the scoreboard afterward.

## How coverage is enforced (the gate is real)

- **Tripwire [[TRIP-AI-EVAL]]** (`docs/architecture/tripwires/TRIP-AI-EVAL.md`, `enforce: guard`, D26/H8):
  no AI write surface ships without an eval.
- **Structural coverage guard** — `test/evals/assistant-tools.eval.test.ts` runs in normal `vitest`/CI and
  **fails when a `kind: "write"` tool has no golden case** in `test/evals/assistant-write-tools.golden.ts`
  and isn't listed in that file's `UNCOVERED_OK` with a reason. Deterministic, zero-cost, drift-proof (it
  reads the real `inputSchema`). This is the teeth: adding an additions tool will red CI until its golden
  case exists.
- **Golden dataset** — `assistant-write-tools.golden.ts`: `{ utterance, tool, args, note? }`, real
  winemaker phrasing → the structured call the model must produce. `args` are NL-shaped (names, not ids;
  the resolver maps them later).
- **Gated LLM eval** — `npm run eval:assistant` (`ASSISTANT_EVAL=1` + `ANTHROPIC_API_KEY`) feeds each
  utterance to the model with the real tool schemas and asserts it selects the expected tool. Run before
  shipping a change to the tools, prompt, or model.

## Fleet / efficiency evals — the second axis (matters at 30+ tools)

The per-tool golden set proves each tool is *reachable*. It does **not** prove the model picks the RIGHT
tool once 50 tools are loaded, or that it doesn't over-call. Selection accuracy degrades and schema token
cost bloats as the tool list grows — non-linearly (adding tool #45 can make tool #12 harder to select). So
we run a second, fleet-level eval axis with the **full** tool set loaded:

- **Discrimination among confusables** — deliberate distractor cases for near-twins (`log_brix` vs a
  future `record_panel`/`submit_panel`; `rack_wine` vs a future generic transfer). Assert the right one
  wins with everything loaded.
- **Economy (call count)** — a direct ask fires ONE tool, not six. Assert `toolCalls ≤ budget` per task;
  flag over-calling and gratuitous reads.
- **Read/write discipline** — "what's the Brix on T5?" must hit a query tool, never a write.
- **Refuse / clarify at scale** — ambiguous questions still ask, not guess, even with 50 tempting tools.
- **Aggregate scorecard** — track *selection accuracy %* + *avg tool-calls* over the suite as numbers.
  A drop is the **canary for the tool-count cliff** and the "record an eval delta on a model/lib bump"
  signal [[TRIP-AI-EVAL]] already asks for. Read/compute tools (e.g. a winemaking calculator) don't trip
  the *write*-coverage guard, but they DO belong in the fleet suite (selection + economy).

**The eval forces the architecture.** When the scorecard drops, that's the signal to shard the tool
surface, not to keep piling tools into one flat list. The seam already exists: `getToolsFor(user)`
(role-scoping) extends to **context/intent-scoped tool exposure** — surface only the relevant subset per
context, or a small always-on core toolset + on-demand retrieval of the long tail (the pattern Claude's
own deferred-tools / tool-search uses for hundreds of tools).

**When to build:** scaffold it with the FIRST Wave-1 tool (one fleet case + a call-count assertion),
grounded in real behavior; flip on the accuracy/economy thresholds as the count climbs past ~30–40. Every
`assistant-coverage-interview` thereafter adds a fleet case + refreshes the economy budget, so it compounds
with each tool instead of becoming a someday-audit.

## Definition of done for one capability

1. A typed tool that **calls the existing core** (`*Core`) — never re-implements domain logic, never uses
   the generic `db_*` tools for a domain write. Writes go through `signProposal` + a `Committer`
   (confirm-nonce, exactly-once); entity names resolve via `tools/resolve.ts` / `scope.ts`.
2. **Golden case(s)** in `assistant-write-tools.golden.ts` — happy-path utterances + at least one that
   should be **refused / clarified** (ambiguous entity, missing required, a domain guard).
3. **A fleet case** — a full-toolset selection case with a call-count budget (+ a read/write-discipline
   check where relevant), so the tool is proven selectable *and economical* among the crowd, not just in
   isolation.
4. **Stop condition** for the build loop: `tsc` clean · the capability's own `verify:*` script green (the
   core already owns the domain invariants) · `vitest`/`eval:assistant` structural guard green · the new
   golden + fleet case present.
5. Flip the row here to 🟨/✅.

## Cross-cutting risk to close during the retrofit

The generic **`db_create` / `db_update` / `db_delete`** tools are a raw-write escape hatch that can bypass
the cores (ledger balance, RLS, cost rules). They're allow-listed in `UNCOVERED_OK` as "generic CRUD
catch-all." As each typed core-routed tool lands, **fence the generics to read-mostly / non-domain use**
so the model can't route a domain write around a core.

## Coverage matrix

Legend: ✅ tool exists · 🟨 partial · ❌ missing

### Cellar operations — daily floor
| Capability | Core | Tool |
|---|---|---|
| Rack / transfer | `rackWineCore` | ✅ `rack_wine` |
| Whole-vessel rack | `rackVesselCore` | 🟨 lot-rack only |
| Additions (SO₂, nutrients, acid…) | `addAdditionCore` | ✅ `add_addition` |
| Fining | `addFiningCore` | ✅ `add_addition` (fining flag) |
| Topping | `topVesselCore` | ✅ `top_up` |
| Filtration | `filterVesselCore` | ✅ `filter_vessel` |
| Cap management (punch-down / pump-over) | `capManagementCore` | ✅ `log_cap_management` |
| Loss / evaporation | `recordLossCore` | ❌ (Wave 2 — deferred by user) |
| Correct / edit / delete an op | `correctOperationCore`, `editNeutralOperationCore`, `deleteNeutralOperationCore` | ❌ |

### Chemistry & tasting — high frequency
| Capability | Core | Tool |
|---|---|---|
| Brix reading (block ripeness, harvest) | harvest | ✅ `log_brix` / `delete_brix` |
| pH / TA / full chem panel (lot) | `recordMeasurementsCore` | ✅ `record_measurement` |
| Tasting notes | `recordTastingNoteCore`, `voidTastingNoteCore` | ✅ `record_tasting_note` (void = ❌) |
| Lab samples (pull / send / attach results / cancel) | `pullSampleCore` + 3 | ✅ `pull_sample` · `record_sample_results` · `manage_sample` (Wave 3 slice B) |
| Ferment panel submit | `submitPanelCore` | 🟨 overlaps Brix |
| Lot state transitions (AF/MLF done, dry) | `transitionStateCore` | ✅ `transition_lot_state` |

### Transforms — seasonal, high value
| Capability | Core | Tool |
|---|---|---|
| De-stem / crush | `crushLotCore` | ❌ |
| Press / saignée | `pressLotCore` | ❌ |
| Blend | `blendLotsCore` | ✅ `blend_lots` (simple by chat; complex → deep-links /blend) |
| Universal undo ("undo that last op") | `reverseOperationCore` | ✅ `undo_operation` (any op; `revert_transfer` stays the rack fast-path) |

### Work orders — author, run, review, and manage by chat (Wave 1 #3 complete)
| Capability | Core | Tool |
|---|---|---|
| Template CRUD | `createTemplateCore` + 5 | ✅ 6 tools |
| Create / issue a WO from a template | `createWorkOrderFromTemplateCore`, `issueWorkOrderCore` | ✅ `create_work_order` (create + issue) |
| Natural-language WO authoring | `createWorkOrderCore`, `issueWorkOrderCore` | ✅ `propose_work_order` (LLM proposes; deterministic validation; human confirms; no ledger write) |
| Start / assign / schedule / cancel a WO | `startTaskCore`, `assignWorkOrderCore`, `scheduleWorkOrderCore`, `cancelWorkOrderCore` | ✅ `manage_work_order` (action-discriminated) |
| Complete a task (rack/add/top/filt/obs/note/maint) | `completeTaskCore` | ✅ `complete_task` |
| Complete a crush/press task | `completeTaskCore` (transform) | ✅ `complete_task` (simple by chat; complex → deep-links the execute form) |
| Approve / reject | `approveTaskCore`, `rejectTaskCore` | ✅ `review_task` (admin; reject reverses via plan-024) |
| Bulk-approve | `bulkApproveTasksCore` | ❌ (later — needs "today's racks" resolution) |
| Recurring WO generation | `generateRecurringInstanceCore` | ❌ |

### Harvest — best covered
| Capability | Core | Tool |
|---|---|---|
| Log a pick / weigh-in (pH/TA, plan 039) | harvest actions | ✅ `log_harvest_pick` |
| Yield estimate | `recordYieldEstimate` | ✅ `set_yield_estimate` |
| Field / vineyard notes | fieldnotes | ✅ `save_field_report` / query |

### Specialized — lower frequency
| Capability | Core | Tool |
|---|---|---|
| Sparkling: tirage / riddling / disgorgement (+ reverses) | `tirageCore` + 8 | ✅ `sparkling_tirage` · `log_riddling` · `sparkling_disgorge` (Wave 3 slice D; gated on sparklingEnabled) · dose+finish deep-links En Tirage · reverses via `undo_operation` |
| Bottling / taxpaid & bottled removal | `removeTaxpaidCore`, `removeBottledCore` | ✅ `remove_bulk_wine` · `remove_bottled_wine` (Wave 3 slice C; admin-only) |
| Materials: create / receive / activate | `createStockMaterialCore`, `receiveSupplyCore`, `setMaterialActiveCore` | ✅ `create_material` · `receive_supply` · `set_material_active` (Wave 3 slice A) |
| Cost: receive bulk-wine cost | `receiveBulkWineCostCore` | ✅ `record_bulk_wine_cost` (Wave 3 slice E). `consumeMaterialCore` is internal (the op/dosing consumption side, never a standalone user op) |
| Blend trials | `createTrialCore` + 5 | 🟨 **deferred to UI** — an interactive bench workflow (iterate components → taste → promote); `calc_blending` already covers the blend math. Not chat-shaped. |
| Vessel groups | `createGroupCore` + 4 | 🟨 **deferred to UI** — a batch-op convenience; the value is applying ops across a group, not creating an empty group by chat. |

### Reads (query tools present)
`query_brix`, `query_yield`, `query_recent_harvests`, `query_transfers`, `query_vineyard_status`,
`query_field_reports`, `query_audit`, `report_anomalies`, `get_field_report_form`, plus the template reads.

### Winemaking calculator — read/compute (plan 040, ✅ shipped)
Pure-compute tools over `src/lib/winemaking-calc/*`; `kind: "read"`, **no ledger write, no confirm gate**,
each run logged to `calculation_log` for traceability. They correctly don't trip the *write*-coverage
guard, and `test/winemaking-calc-tools.test.ts` covers their compute behavior (read-only schema, defaults
run, the SO₂ motivating case, `DomainError` instead of a silent NaN).

| Capability | Engine | Tool |
|---|---|---|
| SO₂ (free / molecular / addition to target) | `winemaking-calc/so2` | ✅ `calc_so2` |
| Sugar / chaptalization | `.../sugar` | ✅ `calc_sugar` |
| Additions (generic rate ↔ volume) | `.../additions` | ✅ `calc_additions` |
| Blending (Pearson square, target blends) | `.../blending` | ✅ `calc_blending` |
| Fortification | `.../fortification` | ✅ `calc_fortification` |
| Unit conversions | `.../conversions`, `units` | ✅ `calc_convert` |
| Calculation history | `.../log` | ✅ `query_calculation_history` (read) |

> **Fleet coverage owed.** These shipped in parallel, before the fleet-eval axis existed, so they have no
> selection/economy case yet. They're the ideal FIRST fleet-suite entries — read/compute, low-risk — so
> **scaffold the fleet suite on them** (e.g. an SO₂ question → `calc_so2`, one call, never a write; a
> conversion → `calc_convert`) as part of the first Wave-1 build. Calculator = **compute**, not a ledger
> write: it never doses; a winemaker who says "add" (not "calculate") should route to the future
> `add_addition` write tool, not the calculator. That read-vs-write boundary is itself a fleet assertion.

## Prioritized retrofit backlog

**Fleet suite scaffolded (2026-07-05):** `test/evals/assistant-fleet.{golden,eval.test}.ts` — the second
axis is live, seeded with the calculate-vs-dose boundary (`add_addition` write vs `calc_so2` read) +
within-tool op selection (calc_so2's planner/kmbs/molecular). Structural layer runs in CI; the gated LLM
layer (`ASSISTANT_EVAL=1`) asserts tool+operation selection with the full set loaded. Call-count economy
is the next layer (needs the run loop). Every new tool adds a fleet case.

**Wave 1 — daily floor, highest frequency (confirmed 2026-07-05):**
1. ~~**Additions + fining**~~ ✅ **DONE** — `add_addition` (one tool, `fining` flag) wraps
   `addAdditionCore`/`addFiningCore`; additive-scoped material resolve (`isDoseableCategory` refuses
   packaging/cleaning), whole-vessel dose, confirm-nonce; golden + fleet cases landed.
2. ~~**Chem panels beyond Brix (pH/TA/full)** + **tasting notes**~~ ✅ **DONE** — `record_measurement`
   (pH/TA/SO₂/VA/RS/malic/alcohol + free-form) and `record_tasting_note`, both per-lot (blend → ask which
   lot), values accepted-as-typed. Fleet case guards the block-Brix (`log_brix`) vs lot-chem confusable.
3. **Work-order execution** — closes the author→run loop. Sliced:
   - **Slice A ✅ DONE** — `create_work_order` (create + issue from a template) + `complete_task`
     (rack/addition/topping/filtration/observation/note/maintenance; defaults to planned, crew states
     diffs). Fleet guards issue-instance (`create_work_order`) vs author-template (`create_template`).
   - **Slice B ✅ DONE** — `complete_task` handles crush (block + kg + dest + output; resolves the covering
     pick, asks if ambiguous) and press (must lot + short fraction list). Complex/underspecified/multi-pick/
     merge-into → deep-links the plan-035 execute form (a navigation, not a guess).
   - **Slice C ✅ DONE** — `review_task` (approve/reject, admin; reject's confirm warns it reverses the
     ledger op) + `manage_work_order` (start/assign/schedule/cancel, one action-discriminated tool).
     Bulk-approve ("approve all today's racks") deferred — needs a task-set resolver.

**Wave 2 — frequent cellar + transforms** (reordered: simple ops first):
5. ~~**Topping, filtration, cap management**~~ ✅ **DONE** — `top_up`, `filter_vessel`,
   `log_cap_management` (one tool each). Loss deferred (user trimmed it this pass).
4. ~~**Blend**~~ ✅ **DONE** — `blend_lots` (simple multi-source by chat; empty dest → new tagged lot,
   resident dest → grow; complex → deep-links `/blend`). Standalone crush/press left to the WO lane +
   /ferment screens (largely duplicate the WO-lane completion).
6. ~~**Lot state transitions** + **universal undo**~~ ✅ **DONE** — `transition_lot_state` (AF/MLF,
   per-lot) + `undo_operation` (reverses any op via a plan-024 correction; resolves an explicit id or the
   most recent reversible op on a vessel/lot, strong confirm, core fails closed; deep-links the timeline
   when nothing resolves). **Wave 2 complete** (loss deferred).

**Wave 3 — specialized:**
7. ~~**Materials (create / receive / activate)**~~ ✅ **DONE (slice A)** — `create_material`,
   `receive_supply` (restock, resolves via the shared deterministic material picker), `set_material_active`.
   Wrap `createStockMaterialCore`/`receiveSupplyCore`/`setMaterialActiveCore`; golden + fleet cases guard
   create-new vs restock-existing vs dose. **Follow-up:** now fence the generic `db_create`/`db_update` so a
   material write can't route around these typed tools (the cross-cutting risk above).
8. ~~**Lab samples (pull / send / attach results / cancel)**~~ ✅ **DONE (slice B)** — `pull_sample`
   (pull + optional send), `record_sample_results` (attach RETURNED readings to the open sample, reusing
   the record_measurement analyte vocabulary + inheriting the sample's captured lot), `manage_sample`
   (send | cancel, action-discriminated). Sample resolves via `resolveOpenSample` (most-recent open on a
   lot/vessel, or an id). Fleet case guards the record_sample_results vs record_measurement confusable.
9. ~~**Bottling + compliance removals**~~ ✅ **DONE (slice C)** — `remove_bulk_wine` (the §A
   tax-determination event; wraps `removeTaxpaidCore`, resolves the vessel, disposition-tagged, reversible
   via undo) and `remove_bottled_wine` (§B finished-goods removal; wraps `removeBottledCore`, resolves SKU
   + location). Both **admin-only** (a removal is a tax event) via new typed `adminAction` wrappers
   (`compliance/removal-actions.ts`). Fleet guards removal-vs-rack and removal-with-disposition vs a plain
   `adjust_inventory` correction. **Follow-up:** `adjust_inventory` and `remove_bottled_wine` overlap on
   "remove N bottles" — narrow `adjust_inventory` to plain corrections (found/lost/recount) so a
   disposition-bearing removal always routes to the compliance path.
10. ~~**Sparkling family**~~ ✅ **DONE (slice D)** — `sparkling_tirage` (bottle a base cuvée to tirage),
    `log_riddling` (remuage), `sparkling_disgorge` (disgorge-only by chat; `finish:true` deep-links the En
    Tirage worklist for the dose→finish flow). All gated on the `sparklingEnabled` setting (refused early
    when off). Reverses ride the universal `undo_operation` (→ `reverseSparklingOperationCore`). Fleet guards
    tirage-vs-bottling and riddling-vs-cap-management. **Partial:** the full DISGORGE→DOSAGE→FINISH (liqueur/
    target RS + SKU + destination) stays on the En Tirage screen by design (deep-linked).
11. ~~**Cost + trials/groups/recurring**~~ ✅ **DONE (slice E) — Wave 3 COMPLETE.** Built
    `record_bulk_wine_cost` (wraps `receiveBulkWineCostCore` — the D20 bulk-wine cost node; resolves the
    lot, KNOWN-cost). Deliberately **NOT built as chat tools** (fleet economy — we're at ~40 tools, and the
    doc's own tool-count-cliff warning applies): blend **trials** (interactive bench workflow; `calc_blending`
    covers the math), vessel **groups** (batch-op UI convenience), **recurring** WO generation (automation/
    cron, not conversational), and `consumeMaterialCore` (internal consumption side of ops). These stay in
    the UI/automation; revisit only if real usage shows a chat demand.

## Workflow

Use the **`assistant-coverage-interview`** skill per capability: it interviews for the assistant-specific
"what passes / what stops it / what it refuses," emits the tool spec + golden case(s) + a loop stop
condition, and flips the row here. Then `/work` (or a `/loop`) builds it against the named core.

## Core → tool reachability (generated)

<!-- BEGIN GENERATED: ai-native core→tool coverage (npm run verify:ai-native -- --write) -->

_Auto-generated by `npm run verify:ai-native -- --write` — do not hand-edit between the markers._

| Core | `*Core` exports | AI-reachable | Via tool | Exemption |
|------|-----------------|--------------|----------|-----------|
| `src/lib/blend/blend-core.ts` | blendLotsCore | ✅ | `blend-lots` | — |
| `src/lib/cellar/split-core.ts` | splitLotInPlaceCore | ✅ | `add-addition` | — |
| `src/lib/compliance/bottled-removal-core.ts` | removeBottledCore | ✅ | `remove-bottled-wine` | — |
| `src/lib/compliance/removal-core.ts` | removeTaxpaidCore | ✅ | `remove-bottled-wine` | — |
| `src/lib/compliance/return-to-bond-core.ts` | returnToBondCore | ❌ | — | deferred gap |
| `src/lib/compliance/tax-class-event-core.ts` | changeTaxClassCore | ❌ | — | deferred gap |
| `src/lib/compliance/transfer-in-bond-core.ts` | transferInBondCore, reverseTransferInBondCore | ✅ | `undo-operation` | — |
| `src/lib/ferment/panel-core.ts` | submitPanelCore | ❌ | — | internal |
| `src/lib/ferment/transition-core.ts` | transitionStateCore | ✅ | `transition-lot-state` | — |
| `src/lib/sparkling/disgorgement-core.ts` | disgorgementCore | ✅ | `log-riddling` | — |
| `src/lib/sparkling/dosage-core.ts` | dosageCore | ✅ | `log-riddling` | — |
| `src/lib/sparkling/finalize-core.ts` | finalizeSparklingCore | ✅ | `log-riddling` | — |
| `src/lib/sparkling/riddling-core.ts` | riddlingCore | ✅ | `log-riddling` | — |
| `src/lib/sparkling/tirage-core.ts` | tirageCore | ✅ | `sparkling-tirage` | — |
| `src/lib/transform/crush-core.ts` | crushLotCore | ✅ | `complete-task` | — |
| `src/lib/transform/press-core.ts` | pressLotCore | ✅ | `complete-task` | — |
| `src/lib/vessels/group-rack-core.ts` | groupRackCore, reverseGroupRackCore | ✅ | `complete-task` | — |
| `src/lib/vessels/rack-core.ts` | rackWineCore, rackVesselCore, revertTransferCore | ✅ | `add-addition` | — |
| `src/lib/work-orders/update-core.ts` | updateWorkOrderCore | ✅ | `complete-task` | — |

Coverage: **16/19** cores reachable by an assistant tool (1 internal, 2 deferred gap).

<!-- END GENERATED -->
