# Council Feedback — Phase 8: Supplies Inventory & Cost Roll-up (plan 028)
**Date**: 2026-07-02
**Reviewers**: Codex `gpt-5.4` (correctness + data layer), Gemini `gemini-3.1-pro-preview` (domain + accounting + UX)

The two reviewers converged hard. Net verdict (Codex): the arithmetic isn't the flaw — the flaw is
trying to have **four things at once** that don't compose: recompute-on-read, a strict projection
invariant, frozen bottle snapshots, and cost-agnostic reversal. Net verdict (Gemini): the DAG fold is
elegant but decoupled from physical + GAAP reality; as written it produces "silent, compounding
financial lies." Both are right. Almost every finding is being folded into the plan.

## Critical Issues (folded unless noted)

1. **Projection vs recompute can't both be authoritative** (Codex). An ancestor cost correction
   stales every descendant's `LotCostState`. → **DAG recompute is the authority; `LotCostState` is a
   versioned cache**, not an invariant-bound projection. (FOLDED, D4 rewritten.)
2. **Blend `fraction` is ambiguous** (Codex). "share of parent depleted" ≠ "share of child
   composition"; they give different cost. → Store **`transferredVolumeL` + `parentPreOpVolumeL`** on
   the cost-transfer artifact; cost transfer = `parentTotalCost × transferredL / parentPreOpL`;
   add a conservation invariant. (FOLDED, D10.)
3. **Reversal lacks info to negate BLEND/BOTTLE/SPLIT after later history** (Codex). Deriving the
   negation from *current* ancestry negates the wrong amount. → **Persist immutable per-op cost
   artifacts; reverse by identity, never by recompute.** (FOLDED, D3 rewritten.)
4. **Supply stock can't be restored from a `CostLine`** (Codex); one consume op depletes multiple
   lots. → Add a **`SupplyConsumption`** ledger `(op, supplyLot, qty, unitCost, method)`; CORRECTION
   negates those rows. (FOLDED, D11.)
5. **Frozen COGS vs upstream recompute diverge on backdated edits** (Codex). → Snapshot carries an
   immutable `costBasisAsOfOperationId`; post-bottling upstream changes become **explicit variance
   events split sold/unsold — never silent recompute.** (FOLDED, D12.)
6. **Rounding leaks + zero-volume lot keeps ghost cost** (Codex + Gemini). → **Decimal(18,8)**
   internal; **zero volume ⇒ zero cost** invariant; residual flushed to a **COGS variance** line.
   (FOLDED, D9 rewritten.)
7. **Normal vs abnormal loss** (Gemini). Reallocating *all* loss to survivors is wrong; a dumped
   tank must be **expensed**, not capitalized into remaining wine. → Split **NORMAL loss**
   (reallocate) vs **ABNORMAL loss** (write-off to expense; per-liter cost unchanged). (FOLDED, D13.)
8. **Barrel straight-line-by-time is domain-wrong** (Gemini). First-fill oak imparts most value;
   time alone ignores volume-in-barrel. → **Fill-based accelerated + allocate by (days/365 ×
   residentVol/capacity).** ⚠️ **This revises D7, a decision the user made — surfaced as a fork, not
   silently folded.**
9. **Cost contagion from partial data** (both). `null` cost treated as `$0` silently under-costs a
   blend and spreads down the DAG. → Propagate **`basisCompleteness: known|partial|unknown`**; block
   / hard-warn accounting export when incomplete. (FOLDED, D14.)
10. **Bottling is a Bill-of-Materials, not liquid÷bottles** (Gemini). Glass/cork/capsule/label/case
    often cost more than the wine; breakage means cost ÷ **actual yielded good bottles**. → Bottling
    consumes packaging `SupplyLot`s + liquid (+ labor/oh later); `costPerBottle = totalRunCost /
    goodBottles`. (FOLDED, D15 + Unit 6 rewritten.)

## Design Questions → Forks for the user

- **Q1 (barrel model):** adopt the council's fill-based accelerated + volume×time barrel cost
  (revises your "by time held" pick)?
- **Q2 (custom crush / client-owned wine):** model lot ownership in v1 (client-owned ⇒ fruit cost
  $0, supplies → billable, not inventory asset), or defer?
- **Q3 (bulk wine trading):** let "receive with cost" inject a direct-material cost node onto a BULK
  WINE lot mid-DAG (buy/sell bulk), or defer to a follow-on?
- Post-bottling upstream-correction accounting policy: folded as **immutable snapshot + variance
  events, never silent restate** (the defensible default) — flagged for confirmation.

## Suggested Improvements (folded)

- Split the overloaded `CostLine` into **`SupplyConsumption` / `OperationCostTransfer` /
  `CostLine` (direct absorbed) / `BottlingCostSnapshot`** + a reporting view (Codex).
- **Stamp policy version** (costing method + capitalization toggles) on every derived row; method is
  **effective-dated + period-locked** — toggles never rewrite closed history (both).
- Concrete **indexes** + **batched recursive CTE** for DAG walks / per-SKU-per-run reporting (Codex).
- **Phase 15 accounting seam now:** `postingKey`, `sourceSnapshotId`, `reversalOfSnapshotId`,
  `postedAt`, `externalSystemId`, component/tax-class → debit/credit account mapping; export query is
  a **view over immutable export events** (Codex).
- Stable **run identity + per-line (SKU/pack/tax-class)** identity in the snapshot (Codex).
- `verify:cost` proves **cost conservation** (nothing created/destroyed except explicit variance;
  exact stock restoration on reversal; every snapshot traces to immutable artifacts) (Codex).
- **Trust UX:** decomposed cost stack (`$X total = FRUIT + BARREL + PACKAGING + MATERIAL`),
  as-of date, incomplete-basis warning, drill-down to cost lines (Gemini).

---
## Raw Response — Codex (gpt-5.4)

CRITICAL: (1) LotCostState cannot equal DAG recompute without descendant propagation — ancestor
correction stales descendants; pick one authority (DAG recompute authoritative; LotCostState = cache
with version/hash). (2) Blend math under-specified: fraction = "share of parent depleted" vs "share of
child composition" differ; store transferredVolumeL, cost transfer = parent_pre_op_total_cost ×
transferredL / parent_pre_op_volumeL; conservation invariant. (3) Reversal lacks info to reverse
BLEND/BOTTLE/SPLIT exactly after later history; persist immutable per-op allocation artifacts, reverse
by identity. (4) Supply restoration can't come from CostLine (one op depletes multiple lots); add
SupplyConsumption(op, supplyLot, seq, qty, unitCost, extendedCost, methodUsed, reversalOf). (5) Frozen
bottling COGS + upstream recompute inconsistent on backdated edits; snapshot carries
cost_basis_as_of_operation_id; define policy: restate sold vs adjust unsold vs variance — never silent
recompute. (6) Rounding leaks; Decimal(12,4) too weak for deep DAG; use Decimal(18,8)+; zero-volume ⇒
zero-cost with residual to a named variance line.
SHOULD FIX: method switch unsafe mid-stream (effective-dated, immutable per depletion row, cutover or
forbid while open lots exist); current settings must not rewrite history (stamp policy version on rows);
"cost empty" needs unknown not implicit zero (known/partial/unknown; block export); missing indexes +
recursive CTE (LotLineage(tenantId,parentLotId)/(childLotId), SupplyLot partial remainingQty>0,
CostLine(tenantId,operationId,component), snapshot (tenantId,skuId,runId)/(tenantId,taxClass,bottledAt));
Phase 15 output not sync-ready (postingKey, sourceSnapshotId, reversalOfSnapshotId, postedAt,
externalSystemId, account mapping; query as a view over immutable events); CostLine overloaded — split
into SupplyConsumption / OperationCostTransfer / BottlingCostSnapshot + reporting view.
DESIGN Qs: accounting treatment for post-bottling upstream corrections? unit of a "run" (multi SKU/pack/
tax class)? prove cost conservation end-to-end (not just recompute==fold). Net: recompute-on-read + strict
projection invariant + frozen snapshots + cost-agnostic reversal do not compose as written.

## Raw Response — Gemini (gemini-3.1-pro-preview)

CRITICAL: (1) Normal vs abnormal loss — reallocating ALL loss to survivors violates accounting; normal
(evap/lees/filtration) concentrates cost, abnormal (spill/dump) must be expensed immediately; split the
Loss op. (2) Barrel amortization fallacy — straight-line time is disastrous; new French oak (~$1,200)
imparts most value on fill 1, neutral by fill 4; also time-only ignores volume (5L topping in a 225L
barrel shouldn't absorb 100% daily depreciation). Use fill-based/accelerated (50/25/15/10) allocated by
(days/365)×(residentVol/capacity). (3) Cost contagion — null/empty cost = $0 averages a blend down
silently and spreads down the DAG; propagate hasIncompleteBasis, block/warn at bottling. (4) Bottling
BOM & yield — "cost/bottleCount" ignores dry goods (glass/cork/capsule/label/case, often > wine cost)
and breakage; Total Run Cost = liquid + dry goods + labor/oh; CostPerBottle = TotalRunCost / ACTUAL
yielded good bottles.
SHOULD FIX: (5) historical mutability of the method toggle — switching WA→FIFO must not re-evaluate
closed years; lock by financial year / as-of lock date. (6) rounding residual trapped in a zero-volume
lot = ghost value; flush to COGS variance. (7) trust UX — show decomposed cost stack ($15 = $8 FRUIT +
$2.50 BARREL + $4 PACKAGING + $0.50 MATERIAL); without drill-down it generates support tickets.
DESIGN Qs: (8) custom crush / client-owned wine — fruit cost $0 but supplies billed back; add an
Ownership tag; client-owned ⇒ supplies → billable expenses, not inventory asset. (9) bulk wine trading —
buying/selling bulk wine injects a direct-material cost node mid-DAG, not at CRUSH; ensure Receive-with-
cost applies to BULK WINE lots too.
