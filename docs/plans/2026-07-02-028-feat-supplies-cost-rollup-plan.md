---
title: Phase 8 — Supplies Inventory & Cost Roll-up
type: feat
status: draft
date: 2026-07-02
branch: main (see Decision D1 — this plan MUST be built on main, not the amazing-black worktree)
depth: deep
units: 17
---

## Overview

Track the consumables that make wine (additives, fining agents, dry/bottling goods, tirage/dosage
materials) with real stock + cost, then compute a true, auditable **cost-per-lot** and
**cost-per-bottle** by traversing the append-only ledger DAG. Physical tracking works first; cost is
layered onto the same records. The output is shaped so Phase 15 (QuickBooks/Xero) is a mapping layer,
not a reshape.

## Problem Frame

A winery cannot price wine, value inventory, or file accurate books without knowing what each bottle
cost to make. Today the app records *what* was added and *how much* (via `LotTreatment`) but attaches
no stock or money. Every prior phase deferred cost here and left explicit hooks (the typed op
vocabulary, the `LedgerBucket` discriminator, honest loss capture) precisely so cost roll-up is a
projection over data that already exists. Doing nothing blocks Phase 15 (accounting is the
beat-both-incumbents differentiator, and its own runbook requires Phase 8's cost shape) and leaves
the "true cost per bottle" value prop unbuilt. The user is the winemaker/owner; the job is "tell me
what this wine costs me, defensibly, so my CPA and my books can trust it."

## Requirements

- MUST: Receive a supply with a cost; consuming it via the EXISTING addition/fining ops draws down
  stock and writes a cost onto the operation. No parallel consumption path.
- MUST: Compute cost-per-bottle for a bottling that traces through at least one blend and one loss
  (the ROADMAP exit criterion).
- MUST: Cost roll-up honors D2 (append-only) — it is a deterministic projection/traversal of the
  ledger + lineage DAG, never a mutable running total. Corrections/undo (plan 024) reverse cost too.
- MUST: Every new table is tenant-scoped + RLS per the AGENTS.md Phase-12 checklist.
- MUST: Physical tracking must function with cost fields empty (cost is additive, not required).
- MUST: Reconcile with Phase 14 — cost attaches to the `LotOperation` chokepoint that Phase 14
  already touched, without collision (see Research; Phase 14 added nothing cost-adjacent to the op).
- SHOULD: Cost output is queryable per-SKU and per-run (the Phase 15 output contract), tax-class
  aware where needed, tagged by cost component so a winery can include/exclude components.
- SHOULD: Costing method is a per-tenant setting (weighted-average default; FIFO optional).
- SHOULD: Barrels amortize as depreciating assets, allocating carrying cost to the lots aging in them.
- NICE: Cost-by-vineyard / by-variety / by-vintage slices (reuse the `composeRollup` pattern).
- NICE: Labor/overhead capitalization (deferred to Phase 11; the component tag + toggle ship now).

## Scope Boundaries

**In scope:**
- Supply catalog (extend `CellarMaterial`) + costed receipts (`SupplyLot`, weighted-avg/FIFO) + draw-down.
- `CostLine` cost model on `LotOperation`, tagged by component; currency setting.
- Cost roll-up engine: blend (by volume share), loss (reallocate onto remaining), bottling (divide
  across bottles), SPLIT children (inherit by fraction). A materialized `LotCostState` fold + a frozen
  COGS snapshot at BOTTLE/FINISH.
- Barrel-as-asset amortization allocated to resident lots.
- Fruit/harvest cost entry at CRUSH.
- UI: Setup → winemaking expendables; Inventory page per-kind stock receive/adjust; cost-per-bottle
  surface; picker upgrade to a stock dropdown with "create new… (cost + %active + opening stock)".
- Per-SKU/per-run COGS read API shaped for Phase 15.
- Lot `ownership` (ESTATE | CUSTOM_CRUSH_CLIENT) — client-owned wine suppresses inventory-asset cost;
  supply draw-downs on client lots route to a billable-expense ledger (D19).
- `receive-with-cost` onto a BULK WINE lot (buy/sell bulk wine mid-DAG) (D20).
- Reversal integration + `verify:cost` script + tests.

**Out of scope (with reason):**
- The QuickBooks/Xero integration itself (Phase 15 — we only shape the output).
- Labor/overhead *allocation logic* (Phase 11 — we ship the component tag + capitalization toggle
  so it drops in without a reshape).
- GAAP/tax treatment (§263A/UNICAP) — the winery's CPA + their books own this; we feed a defensible
  cost basis, we do not compute tax treatment. Not accounting advice.
- Purchasing/AP workflow (supplier POs/bills) beyond receive-with-cost — a later Phase 8 follow-on / Phase 15.
- **Fruit-sourcing CONTRACTS (follow-on phase, recorded in ROADMAP):** a "Contracts" section to capture
  vineyard/grower contract terms — per-acre (with acreage) vs per-ton pricing, the lots covered, and
  payment schedule/terms. Phase 8 records fruit COST at CRUSH (D+); deriving that cost FROM a structured
  contract is the follow-on. Flagged by the user as worth a quick phase after this one.

## Phasing (D21) — 8a core / 8b advanced

Deliver in two shippable PRs. **8a is the sellable "true cost-per-bottle" core; 8b adds accounting
depth.** The rule that makes this safe: **all load-bearing schema seams ship in 8a** so 8b is
logic-only, no table reshape.

- **8a (core, sellable):** Units 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 15, 17 — PLUS the custom-crush
  ownership piece of Unit 16 (`Lot.ownership` column + billable-vs-inventory routing). Custom-crush
  routing is in 8a *because the user already has custom-crush clients* — deferring it would
  mis-capitalize client-owned cost in the interim (Codex Q3 caveat).
- **8b (advanced):** Unit 8 (barrel amortization logic), Unit 13 (post-bottling variance events),
  Unit 14 (export-seam emit logic + account mapping), and the bulk-wine-receive piece of Unit 16.
- **Seams that MUST ship in 8a even though their logic waits (Codex Q3):** `BottlingCostSnapshot`
  columns `costBasisAsOfOperationId` + the full Phase-15 export set (`postingKey`, `sourceSnapshotId`,
  `reversalOfSnapshotId`, `postedAt`, `externalSystemId`); `Lot.ownership`; `CostLine.component` incl.
  `BARREL` + `VARIANCE`; generic direct-material `CostLine` onto a lot/op (so 8b bulk-wine is additive).
  These live in Unit 2's migration.

## Research Summary

### Codebase Patterns
- **Ledger chokepoint:** `writeLotOperation()` in `src/lib/ledger/write.ts` is the ONLY writer of
  `LotOperation` + `LotOperationLine`. It already folds THREE projections in-tx (`VesselLot`,
  `BottledLotState`, legacy `VesselComponent`). Cost is a **fourth deterministic fold** here. The
  chokepoint does not take `metadata`; cores stamp it post-write (pattern: `removal-core.ts:65`).
- **Reversal:** `reverseOperationCore()` in `src/lib/ledger/reverse.ts` dispatches to 7 families
  (cellar/rack/sparkling/bottle/transform/blend); the cellar path writes a CORRECTION op with
  exact-negated lines via `correctOperationCore` (`src/lib/cellar/correct.ts`).
- **Lineage DAG:** `LotLineage` (`prisma/schema.prisma`) stores `parentLotId → childLotId` with a
  `fraction` (0–1) and `kind` (SPLIT|BLEND|TRANSFORM). Pure walkers in `src/lib/lot/lineage.ts` —
  `buildAncestry`, `composeRollup` — multiply fractions down each path. **`composeRollup` is the
  cost-traversal template: swap `weight` → `cost`.** Loader: `loadLineageGraph` in `src/lib/lot/data.ts`.
- **Projection = fold of the ledger** (INVARIANT #7; `src/lib/ledger/math.ts` `foldLines`, dust-swept
  to `FUNCTIONAL_ZERO_L`). `scripts/verify-projection.ts` recomputes + diffs — mirror this for cost.
- **`LedgerBucket`** (VESSEL | EXTERNAL | BOTTLE_STORAGE) on each line tells wine-in-vessel from
  wine-in-bottle from wine-gone — built for exactly this cost roll-up.
- **Additions substrate exists:** `LotTreatment` (`materialId`, `materialName` snapshot, `rateValue`,
  `rateBasis`, `computedTotal`, `computedUnit`, `volumeLAtAddition`) records every ADDITION/FINING
  (Phase 3/6), plus TIRAGE (liqueur de tirage) and DOSAGE (liqueur d'expédition). Cost + stock
  draw-down attach to these rows. `CellarMaterial` (name/normalizedKey/kind/defaultBasis/percentActive)
  is the light catalog, commented "cost/inventory deferred to Phase 8."
- **Material picker:** HTML5 `<datalist>` with free-text upsert in `DoseForm`
  (`src/app/(app)/bulk/CellarActions.tsx:320`), `StagedAdditions.tsx`, `FermentMonitor.tsx`.
- **Setup surface pattern to emulate:** `src/app/(app)/reference/ReferenceClient.tsx` (Varieties/
  Vineyards list + add form + inline edit + active toggle). Settings page today only holds a sparkling
  toggle. Finished-goods **Inventory** page (`src/app/(app)/inventory/`) manages bottled stock only —
  supplies stock is a new, separate surface.
- **Tenant plumbing (copy-paste ready):** `runLedgerWrite`/`runInTenantTx`/`runAsTenant`/`runAsSystem`
  in `src/lib/tenant/*`; RLS pattern (ENABLE+FORCE+`tenant_isolation` USING+WITH CHECK on
  `current_setting('app.tenant_id', true)`) in migration `20260701001000_rls_policies` with a DO-block
  completeness check; `Lot` model is the gold-standard checklist model. `AppSettings` is per-tenant
  (`@@unique([tenantId])`), currently only `sparklingEnabled`.
- **Money/units today:** `Decimal(12,2)` used for `ComplianceReport.taxDollars`; volumes `Decimal(10,2)`
  liters; volume display unit is per-vineyard (`VineyardDetail.defaultUnit`, imperial|metric). No
  `CostLine`/`Supply`/`costPerBottle`/barrel-asset/QBO code exists — greenfield.

### Prior Learnings
- **BRANCH BASE (critical):** This worktree (`claude/amazing-black-a0a8f4`) is 22 commits behind
  `main` and lacks ALL of Phase 14/15 (no compliance tables, no `REMOVE_TAXPAID`, no tax-class
  inputs). Phase 14's schema — which the "reconcile" constraint depends on — exists ONLY on `main`.
  Plans 025/026/027 are main-only. → Build Phase 8 on `main` (see D1). Verified by direct diff.
- One pending (unconfirmed) context-ledger item `q_1782862455_0f` is tagged `phase8-ready`: "wire
  ADDITION/FINING ops to draw down stock and carry cost; turn the free-text catalog into a stock
  dropdown by kind." Directional only — not a settled precedent.
- Windows/Prisma (MEMORY): `migrate dev` is interactive + injects a phantom `search_vector` diff;
  use `migrate diff → deploy`, stop the dev server before `generate`; enum values in isolated migrations.
- K12: never read the ALS tenant inside a cached fn — pass `tenantId` explicitly (relevant if cost
  reads get cached). Append-only discipline: corrections void + re-log; cost mirrors this.
- `StockMovement` (finished-goods bottle ledger) is DISTINCT from the supplies stock Phase 8 adds —
  do not conflate.

### External Research
None needed — this is an internal projection over the existing ledger. The costing stance
(weighted-average absorption; component-tagged; winery owns GAAP/tax) is settled in the ROADMAP runbook.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|-------------------------|-----------|
| D1 Branch base | **Build on `main`** | This worktree | Worktree is 22 commits behind and lacks Phase 14; the reconcile constraint needs Phase 14's schema; user prefers main. **USER GATE.** |
| D2 Cost storage | **Append-only `CostLine` table, FK → `LotOperation` (composite tenant FK), tagged by `component`** | JSON on `LotOperation.metadata` | Phase 15 needs queryable per-SKU/per-run COGS aggregation; JSON isn't aggregatable. A table is auditable (D14) and append-only (D2). |
| D3 Reversal of cost | **Reverse IMMUTABLE per-op cost artifacts by identity, keyed off `correctsOperationId` (the reversed op), running IN the family reversal's tx.** Requires a **uniform reversal contract**: every one of the 7 families must return its compensating op id + set a consistent back-link | "Cost-agnostic dispatcher-only post-hook keyed on `type===CORRECTION`" | Codex Q2: the post-hook alone SILENTLY MISSES — BOTTLE's compensating op is `SEED` not CORRECTION (`run.ts:207`); RACK+BOTTLE return `correctionId:null` (`reverse.ts:128,138`); legacy FINISH writes `correctsOperationId=null` (`sparkling/correct.ts:182`). Cores still don't COMPUTE cost, but they MUST expose the reversal op id. **Prereq sub-task, see Unit 11.** |
| D4 Compute model | **DAG recompute is the AUTHORITY; `LotCostState` is a LAZY cache keyed by a watermark `computedThroughOpId` = max cost-affecting opId across the lot's ancestry; recompute on read when the current max exceeds the watermark. FROZEN, immutable COGS snapshot at BOTTLE/FINISH carries `costBasisAsOfOperationId`** | Projection == fold hard invariant (Codex C1); EAGER descendant-version bumps in the chokepoint (Codex Q1: unbounded fan-out → SERIALIZABLE chokepoint collapse) | Lazy watermark keeps `writeLotOperation` bounded and preserves "recompute is authority." Optional async warm-behind refresh for hot descendants — never in the foreground tx. |
| D5 Costing method | **Weighted-average absorption (default), FIFO optional — per-tenant setting; cost lines tagged by component (MATERIAL always capitalized; LABOR/OVERHEAD/BARREL/FRUIT toggle)** | Hard-code weighted-avg | Blends *are* weighted-average by volume share; matches wine reality + GAAP-style capitalization; winery sets policy. |
| D6 SPLIT child cost | **Inherit parent cost by volume fraction** (PRESS fractions, SAIGNEE, partial-disgorgement children) | Assign cost to one child | Symmetric with blend (weighted-avg down the DAG); the `LotLineage.fraction` already exists. |
| D7 Barrel amortization | **RESOLVED (fork Q1 → council model):** fill-based accelerated depreciation (e.g. 50/25/15/10 by fill) allocated to resident lots by `(days/365 × residentVol/capacity)` | Pure time-held; per-use; defer | First-fill oak imparts most value; time-only ignores volume-in-barrel. User adopted the council recommendation over the earlier time-held pick. |
| D19 Lot ownership (custom crush) | **IN v1:** a lot `ownership` tag (ESTATE \| CUSTOM_CRUSH_CLIENT); client-owned ⇒ fruit/wine cost suppressed from inventory asset, but supply draw-downs route to a BILLABLE-EXPENSE ledger (billed back to the client) | Defer to follow-on | User confirmed: custom-crush wineries + estates with custom-crush clients need this. Ledger already isolates lots, so it's additive. |
| D20 Bulk wine receive | **IN v1:** `receive-with-cost` can target a BULK WINE lot, injecting a direct-material cost node mid-DAG | Defer | User confirmed; reuses the receive mechanism; without it purchased bulk wine shows $0 cost. |
| D8 Labor/overhead in v1 | **Defer allocation to Phase 11; ship the component tag + capitalization toggle now** | Build allocation now | Labor is a Phase 11 concern; shipping the tag means no reshape later. **USER GATE** (confirm defer). |
| D9 Currency + precision | **Per-tenant `currency` on `AppSettings` (default USD); store cost `Decimal(18,8)` internally; round cost-per-bottle to cents at snapshot; INVARIANT: zero volume ⇒ zero cost — any residual flushed to a named COGS-variance line, never stranded on a zero-volume lot** | Decimal(12,4) + "reconcile on the run" | Council C6/G6: 12,4 leaks sub-cent cost across deep DAGs; delete-at-zero strands "ghost value." 18,8 + explicit variance flush closes both. |
| D10 Blend/split cost transfer | **Store `transferredVolumeL` + `parentPreOpVolumeL` on an immutable `OperationCostTransfer` artifact; cost moved = `parentTotalCost × transferredL / parentPreOpL`; conservation invariant per op** | Reuse `LotLineage.fraction` directly | Council C2: `fraction` is ambiguous (share-of-parent-depleted ≠ share-of-child-composition) → wrong cost. Explicit transferred volume + pre-op basis is unambiguous and conserves cost. |
| D11 Supply depletion ledger | **`SupplyConsumption(op, supplyLot, qty, unitCost, extendedCost, methodUsed, reversalOf)`** — one consume op may deplete many lots | Derive stock from a single `sourceSupplyLotId` on `CostLine` | Council C4: a `CostLine` can't restore multi-lot stock on reversal; a real depletion ledger can (identity-negated). |
| D12 Post-bottling upstream edits | **RESOLVED:** immutable snapshot + explicit VARIANCE events splitting the delta across SOLD (→ COGS variance) and UNSOLD (→ on-hand inventory value); NEVER silent recompute-restate | Whole delta to current-period COGS; silent recompute | User chose the GAAP-defensible sold/unsold split (Council C5). Snapshot stays frozen; corrections are auditable variance events. |
| D21 Phasing | **Split 8a (core) + 8b (advanced); load-bearing schema seams ship in 8a** (see Phasing section) | One-shot 17-unit build | User + Codex Q3: ship sellable cost-per-bottle sooner, smaller blast radius per PR; seams-first avoids any 8b retrofit. |
| D13 Loss classification | **Split loss into NORMAL (evap/lees/filtration → reallocate onto remaining volume, per-L cost rises) vs ABNORMAL (spill/dump → write-off to an expense CostLine, per-L cost unchanged)** | Reallocate ALL loss to survivors | Council G1: capitalizing a dumped tank into remaining wine is an accounting violation + overstates inventory value. |
| D14 Cost completeness | **Propagate `basisCompleteness: known \| partial \| unknown`; `null` cost is UNKNOWN, never `$0`; block/hard-warn accounting export when incomplete** | Treat empty cost as `$0` | Council C+G3 "cost contagion": a `$0`-treated parent silently under-costs a blend and spreads down the DAG. |
| D15 Bottling = Bill-of-Materials | **Bottling consumes packaging `SupplyLot`s (glass/cork/capsule/label/case) + liquid (+ labor/oh later); `costPerBottle = totalRunCost / ACTUAL yielded good bottles`** | `accumulatedLiquidCost / bottleCount` | Council G4: dry goods often cost more than the wine; breakage means good-bottle yield, not staged count. |
| D16 Schema separation | **Split concerns: `SupplyConsumption` (physical+cost depletion) · `OperationCostTransfer` (lot→lot inherited cost) · `CostLine` (direct absorbed cost by component) · `BottlingCostSnapshot` (frozen COGS) + a reporting/export VIEW** | One overloaded `CostLine` table | Codex: different identity/audit/reversal rules; one table conflates them. |
| D17 Policy versioning | **Stamp costing-method + capitalization-toggle VERSION on every derived cost row; method is effective-dated + period-locked; toggles never rewrite closed history** | Recompute uses current settings | Council + G5: flipping WA→FIFO or a toggle must not re-value audited prior years. |
| D18 Phase 15 accounting seam | **Add now: `postingKey`, `sourceSnapshotId`, `reversalOfSnapshotId`, `postedAt`, `externalSystemId` + a component/tax-class → debit/credit account MAP; export is a view over immutable export events** | Ship only per-SKU/per-run/tax-class fields | Codex: without export identity + idempotency + reversal linkage + account seam, Phase 15 forces a reshape. |

## Implementation Units

### Unit 1: Supply catalog + costed stock schema
**Goal:** Model supplies with stock + cost without breaking the existing free-text catalog.
**Files:** `prisma/schema.prisma`; new migration(s) under `prisma/migrations/`.
**Approach:** Extend `CellarMaterial` with `packagingSize`/`stockUnit` and `isStockTracked`. Add a
`SupplyLot` model (a costed receipt: `materialId`, `qtyReceived`, `qtyRemaining`, `unitCost`,
`receivedAt`, optional `lotCode`/supplier note) for weighted-avg/FIFO. Add per-kind category grouping
(reuse `CellarMaterial.kind`). All new tables follow the Phase-12 checklist (tenantId `@default("")`,
`@@unique([tenantId, …])`, `@@unique([tenantId, id])` where FK'd, `@@index([tenantId])`, RLS
ENABLE+FORCE+policy, added to the RLS DO-block checklist, kept out of `GLOBAL_MODELS`). Enum values
(e.g. a `CostComponent`, `CostingMethod`) in isolated migrations.
**Tests:** schema compiles; `verify:isolation` extended; a `test/supply-lot.test.ts` tenant-isolation case.
**Depends on:** none
**Verification:** `npm run db:generate` clean; RLS DO-block passes; new tables reject foreign-tenant insert.

### Unit 2: Cost schema (separated concerns) + settings (D16, D9, D11, D17)
**Goal:** Purpose-built cost tables with the right identity/audit/reversal rules, not one overloaded table.
**Files:** `prisma/schema.prisma`; migration(s); `src/lib/settings/data.ts`.
**Approach:** Four tables, all `Decimal(18,8)` for money, all Phase-12 tenant-scoped + RLS, each row
stamped with `policyVersion` (D17):
- `CostLine` — direct absorbed cost on an op: `{ operationId (composite FK), lotId?, component
  (MATERIAL|FRUIT|BARREL|LABOR|OVERHEAD|DOSAGE_LIQUEUR|PACKAGING|VARIANCE), amount, currency, note }`.
- `SupplyConsumption` (D11) — physical+cost depletion: `{ operationId, supplyLotId, qty, unitCost,
  extendedCost, methodUsed, reversalOfConsumptionId? }` (one op → many rows).
- `OperationCostTransfer` (D10) — immutable lot→lot inherited-cost artifact: `{ operationId,
  fromLotId, toLotId, transferredVolumeL, parentPreOpVolumeL, transferredCost, reversalOf? }`.
- `BottlingCostSnapshot` (D15, D18) — frozen COGS per run+line: `{ runId, skuId, taxClass?,
  goodBottles, costBasisAsOfOperationId, componentBreakdown, postingKey, sourceSnapshotId?,
  reversalOfSnapshotId?, postedAt?, externalSystemId? }`.
Define `BottlingCostSnapshot` with ALL export-seam columns (D18) up front so Units 6/13/14 populate,
never re-migrate it. Add `AppSettings.currency` (USD), `costingMethod` (WEIGHTED_AVG default | FIFO,
effective-dated), capitalization toggles + a `costingPolicyVersion`. Reconcile with Phase 14: confirmed
Phase 14 added nothing cost-adjacent to `LotOperation` — clean namespace.
**Indexes (Codex):** `CostLine(tenantId, operationId, component)`; `SupplyLot` partial `WHERE
qtyRemaining > 0` on `(tenantId, materialId, receivedAt)` (FIFO); `OperationCostTransfer(tenantId,
toLotId)` + `(tenantId, fromLotId)`; snapshot `(tenantId, skuId, runId)` + `(tenantId, taxClass,
bottledAt)`; and on the EXISTING `LotLineage` (Phase-5 table) `(tenantId, parentLotId)` + `(tenantId,
childLotId)` for the recursive-CTE walk — flag as a change to an existing table.
**Contracts to pin (no guessing at /work):** `methodUsed` resolves from the effective-dated setting at
the op's `observedAt`; `basisCompleteness` is computed by the roll-up and cached on `LotCostState` +
frozen on the snapshot; `policyVersion` is the settings version at row-creation time.
**Tests:** `test/cost-schema.test.ts` isolation for all tables; settings read/write; policyVersion stamped.
**Depends on:** Unit 1
**Verification:** rows FK correctly (composite tenant FKs); RLS enforced; `Decimal(18,8)` round-trips.

### Unit 3: Draw-down + cost on addition/fining ops (D11, D14)
**Goal:** Consuming a material via the existing ADDITION/FINING ops draws down `SupplyLot` stock and
records depletion + cost — with no parallel consumption path.
**Files:** `src/lib/cellar/addition.ts` (addAdditionCore/addFiningCore), `src/lib/cellar/actions.ts`,
new `src/lib/cost/consume.ts`.
**Approach:** In the same `runLedgerWrite` tx, after the op is written, resolve consumed quantity from
`LotTreatment.computedTotal`, deplete `SupplyLot`(s) by the tenant's effective costing method writing
one `SupplyConsumption` row per depleted lot (D11), and stamp a MATERIAL `CostLine`. If `unitCost` is
unknown, mark `basisCompleteness = unknown` — never treat null as `$0` (D14). Reversal negates the
`SupplyConsumption`/`CostLine` rows by identity (Unit 11).
**Tests:** addition depletes the right SupplyLot(s); multi-lot depletion; WA vs FIFO; unknown-cost path
sets completeness, does NOT record `$0`.
**Depends on:** Units 1, 2
**Verification:** receive a supply → add to a lot → stock drops, SupplyConsumption + CostLine created.

### Unit 4: Cost roll-up engine — the AUTHORITY (D4, D10, D13, D14)
**Goal:** Deterministic, conserving cost-per-lot / cost-per-bottle over the ledger + lineage DAG.
**Files:** new `src/lib/cost/rollup.ts` (pure), `src/lib/cost/data.ts` (loaders, batched recursive CTE).
**Approach:** Pure functions modeled on `composeRollup`/`buildAncestry`. Blend/split cost moves via the
`OperationCostTransfer` artifact: cost moved = `parentTotalCost × transferredL / parentPreOpL` (D10),
NOT the ambiguous lineage `fraction`. NORMAL loss reallocates onto remaining volume (per-L rises);
ABNORMAL loss writes a VARIANCE/expense `CostLine` and leaves per-L unchanged (D13). Propagate
`basisCompleteness` up the DAG — any `unknown` parent taints the child (D14). **Conservation invariant:**
per op, `Σ(cost out) + stranded = cost removed from parents`; zero volume ⇒ zero cost. Reads are a
batched recursive CTE, not per-node app walks (Codex perf). No DB writes in the pure layer.
**Tests:** `test/cost-rollup.test.ts` — exit scenario (blend + loss → cost-per-bottle); the C2 blend
ambiguity fixture (20L from A + 20L from B ≠ 50/50 unless volumes equal); normal vs abnormal loss;
completeness taint; conservation holds; zero-volume ⇒ zero cost.
**Depends on:** Units 2, 3
**Verification:** hand-computed fixtures match to the cent; conservation asserted on every fixture.

### Unit 5: LotCostState — a VERSIONED CACHE (not an invariant projection) (D4)
**Goal:** Cheap reads without pretending the cache is authoritative.
**Files:** `src/lib/ledger/write.ts`, `src/lib/cost/cache.ts`, `prisma/schema.prisma` (`LotCostState`
with `basisVersion`), migration.
**Approach:** LAZY watermark (Codex Q1): each cache row stores `computedThroughOpId`. On read, cheaply
compute `max(cost-affecting opId)` over the lot's ancestry (same recursive CTE as Unit 4); if it exceeds
the watermark, recompute (Unit 4 is the authority) and refresh the cache. NO eager descendant fan-out in
`writeLotOperation` (that would turn one backdated correction into an O(descendants) SERIALIZABLE write).
Optional: an async warm-behind refresher for hot lots, never in the foreground tx. Zero volume ⇒ zero
cost; deletion requires zero remaining cost first (D9).
**Tests:** ancestor correction ⇒ descendant read recomputes (watermark stale); cache == recompute; the
chokepoint write stays O(1) in descendants under a high-fan-out correction.
**Depends on:** Unit 4
**Verification:** `scripts/verify-cost.ts` proves cache == recompute across a backdated-edit fixture.

### Unit 6: Bottling COGS snapshot — Bill-of-Materials + yield (D15, D9, D18)
**Goal:** Freeze a trustworthy cost-per-good-bottle that includes dry goods, per run + line.
**Files:** `src/lib/bottling/run.ts`, `src/lib/bottling/materialize.ts`, `src/lib/cost/cogs.ts`,
`prisma/schema.prisma`, migration.
**Approach:** Bottling is an assembly (BOM): consume packaging `SupplyLot`s (glass/cork/capsule/label/
case) AND liquid, so `totalRunCost = liquid + dryGoods (+ labor/oh later)`; `costPerBottle =
totalRunCost / ACTUAL good bottles` (not staged count) (D15). Write an IMMUTABLE `BottlingCostSnapshot`
per run+line (SKU/pack/tax-class) carrying `costBasisAsOfOperationId` + `componentBreakdown` +
`postingKey` (D18). Residual rounding → VARIANCE line, never stranded (D9). Stable run + per-line
identity (Codex DQ).
**Tests:** dry-goods included in cost-per-bottle; yield < staged raises per-bottle cost; snapshot
immutable under a later backdated upstream edit (variance path, D12); per-SKU/per-run aggregation.
**Depends on:** Units 4, 5
**Verification:** bottle a lot → snapshot sums to lot cost + dry goods ± residual-to-variance.

### Unit 7: Fruit/harvest cost at CRUSH
**Goal:** Grape/fruit cost enters the lot's basis at origination.
**Files:** `src/lib/transform/crush-core.ts`, crush form component, `src/lib/cost/consume.ts`.
**Approach:** Capture fruit cost (per kg or lump) at CRUSH; write a FRUIT `CostLine` on the CRUSH op.
Optional/skippable (physical tracking unaffected if absent).
**Tests:** crush with fruit cost → FRUIT CostLine; roll-up includes it.
**Depends on:** Units 2, 4
**Verification:** cost-per-bottle reflects fruit cost through the DAG.

### Unit 8: Barrel-as-asset amortization
**Goal:** Barrels depreciate and allocate carrying cost to the lots aging in them.
**Files:** `prisma/schema.prisma` (barrel-asset fields on `Vessel` or a `BarrelAsset` sidecar +
amortization schedule), migration, new `src/lib/cost/barrel.ts`.
**Approach:** Per D7 (pending fork Q1). Council-recommended default: **fill-based accelerated**
depreciation (e.g. 50/25/15/10 by fill number) with each fill's cost allocated to resident lots by
`(daysInBarrel / 365) × (residentVolumeL / barrelCapacityL)`, written as BARREL `CostLine`s (handles
partial fills + two lots sharing a barrel). A barrel is a `Vessel`; add a `BarrelAsset` sidecar
(purchase cost, fill count, useful-life fills). Falls back to pure time-held only if the user keeps the
earlier pick.
**Tests:** fill 1 costs more than fill 4; two lots sharing a barrel split cost by volume×time; a 5 L
topping in a 225 L barrel absorbs ~2% not 100%.
**Depends on:** Units 2, 4
**Verification:** a lot aged N months in a barrel accrues the fill-and-volume-weighted BARREL cost.

### Unit 9: Costing-method + component-capitalization settings
**Goal:** Per-tenant control of method + which components capitalize.
**Files:** `src/app/(app)/settings/` (SettingsClient), `src/lib/settings/*`.
**Approach:** Surface `costingMethod` + component toggles from Unit 2. Roll-up + snapshot respect the
toggles (exclude a component = omit from capitalized cost, still recorded).
**Tests:** toggling OVERHEAD off drops it from cost-per-bottle but leaves the CostLine.
**Depends on:** Units 2, 4
**Verification:** setting change reflects in the cost surface.

### Unit 10: Stock-item picker upgrade
**Goal:** Replace the free-text datalist with a stock dropdown by kind + "create new… (cost + %active
+ opening stock)".
**Files:** `src/app/(app)/bulk/CellarActions.tsx` (DoseForm), `src/components/ferment/StagedAdditions.tsx`,
`src/components/ferment/FermentMonitor.tsx`, shared picker component, `src/lib/cellar/materials.ts`.
**Approach:** A kind-filtered dropdown backed by the catalog; an inline "create new" modal capturing
cost + %active + opening stock (seeds a `SupplyLot`). DESIGN.md tokens; datalist remains a graceful
fallback for untracked materials.
**Design specs (design-review fold):** the picker shows current on-hand next to each item (e.g. "KMBS
· 1.2 kg on hand"); selecting an item with ZERO stock is allowed but shows an inline hint ("no stock on
hand — this addition will record as unknown-cost") so cost incompleteness (D14) is visible at entry, not
just at bottling. The "create new" modal reuses the `Modal` + `Input` components; cost/%active/opening
stock are optional (physical tracking works without them). Keyboard-navigable dropdown, 44px min targets.
**Tests:** component test — create-from-picker seeds stock; kind filter; zero-stock hint renders.
**Depends on:** Units 1, 3
**Verification:** add a new fining agent from the picker → appears in stock with opening qty + cost.

### Unit 11: Reversal by identity-negation of cost artifacts (D3)
**Goal:** Reversing an op reverses its EXACT recorded cost + stock, even after later history.
**Files:** `src/lib/ledger/reverse.ts`, `src/lib/cellar/correct.ts`, `src/lib/cost/reverse.ts`.
**Approach:** Per D3. **Prereq (Codex Q2): establish a UNIFORM reversal contract first** — every family
core reachable from `reverseOperationCore` must (a) return its compensating op id and (b) set a
consistent back-link to the reversed op. Fix the known gaps: BOTTLE's compensating op is a `SEED`
(`run.ts:207`); RACK+BOTTLE discard the id (`reverse.ts:128,138` return `correctionId:null`); legacy
FINISH may write `correctsOperationId=null` (`sparkling/correct.ts:182`). Then a shared
`negateCostForReversedOp(reversedOpId)` runs IN the family reversal's tx, negating the ORIGINAL
`SupplyConsumption` + `OperationCostTransfer` rows by identity and restoring exact `SupplyLot` qty —
never recomputed from current ancestry. Cores still don't COMPUTE cost. Cover all 7 families.
**Tests:** undo after an intervening backdated ancestor edit still restores the ORIGINAL amounts (C3);
undo BLEND/BOTTLE/SPLIT/RACK each restores stock + negates cost exactly; a family that forgets the
back-link FAILS a contract test (so the miss is never silent).
**Depends on:** Units 3, 4, 5
**Verification:** `verify:cost` asserts cost + stock neutrality after undo across every family, incl. C3.

### Unit 12: Setup → winemaking expendables + Inventory supply surface
**Goal:** Manage the supply catalog + receive/adjust stock by kind.
**Files:** `src/app/(app)/settings/` or a new `src/app/(app)/setup/expendables/`; the Inventory page
(`src/app/(app)/inventory/`) gains per-kind supply categories; server actions in `src/lib/cost/actions.ts`.
**Approach:** Emulate `ReferenceClient.tsx` (list + add form + inline edit + active toggle) for the
catalog; receive-with-cost + adjust-stock actions write `SupplyLot`s. DESIGN.md tokens throughout.
**Design specs (design-review fold):** group stock by `kind` (per-kind category sections, matching the
Inventory page's category pattern). Empty state is a feature — not "No supplies found." but a warm
prompt + primary action ("No expendables yet. Add your first supply to start tracking stock and cost."
with a `Button variant="primary"`). Low/'out-of-stock' rows flagged with a `Badge` (neutral/red).
Stock quantities `tabular-nums`. Reuse `Input`/`Button`/`Card` components, `--space-5` gutter.
**Tests:** action tests for receive/adjust; tenant scoping; empty-state renders the primary action.
**Depends on:** Units 1, 3, 10
**Verification:** receive a supply with cost in the UI; stock reflects it; empty state shows the CTA.

### Unit 13: Post-bottling variance/adjustment events (D12, D17)
**Goal:** A backdated upstream edit after bottling produces an explicit, auditable variance — never a silent restate.
**Files:** `src/lib/cost/variance.ts`, `prisma/schema.prisma` (a `CostVarianceEvent` or VARIANCE
`CostLine`s), migration.
**Approach:** When an appended correction changes cost basis for a lot that is already bottled/finished,
emit an explicit VARIANCE event splitting the delta across sold vs on-hand (the frozen snapshot stays
immutable, D4/D12). Respect the period lock (D17): closed periods only accept variance events, never
retroactive recompute.
**Tests:** backdated ancestor edit after bottling → variance event with correct sold/unsold split;
closed-period edit refused as a recompute, accepted as a variance.
**Depends on:** Units 4, 6
**Verification:** the C5 scenario yields a variance, not a changed snapshot.

### Unit 14: Phase 15 accounting export seam (D18)
**Goal:** Emit immutable, idempotent, reversible accounting events so Phase 15 is a mapping layer.
**Files:** `src/lib/cost/export.ts`, `prisma/schema.prisma` (export-event view/table + component/
tax-class → account map), migration.
**Approach:** Expose COGS + inventory + variance as immutable export events carrying `postingKey`
(idempotency), `sourceSnapshotId`, `reversalOfSnapshotId`, `postedAt`, `externalSystemId`, and a
per-tenant component/tax-class → debit/credit account mapping seam. The per-SKU/per-run query is a VIEW
over these events. No QBO/Xero calls (Phase 15).
**Tests:** re-running export is idempotent (same postingKey); a reversal emits a linked reversal event;
incomplete-basis events are withheld from export (D14).
**Depends on:** Units 6, 13
**Verification:** export event set round-trips to a mock chart-of-accounts mapping without reshape.

### Unit 15: Cost-per-bottle trust UI (D14, G7)
**Goal:** Make cost-per-bottle trusted and auditable (Unit 12 owns supply-stock management UI).
**Files:** a cost surface on the bottled-SKU / lot pages; `src/lib/cost/data.ts` (read models).
**Approach:** Cost-per-bottle shown as a DECOMPOSED stack (`$X = FRUIT + BARREL + PACKAGING + MATERIAL …`)
with an "as-of" date (the snapshot's `costBasisAsOfOperationId`), which components are included (per the
capitalization toggles), an incomplete-basis warning (D14), and drill-down to the underlying cost lines
+ `OperationCostTransfer` chain (G7). Read-only surface — no writes.
**Design specs (design-review fold):** headline cost uses the existing `Metric` component;
`font-variant-numeric: tabular-nums` on all money; component stack rows aligned, each with its `$`/
bottle + % of total. Incomplete basis = `Badge tone="red"` ("Estimated — incomplete cost basis") NOT a
silent number (the `gold` tone renders burgundy per DESIGN.md drift, so use `red`); components that are
recorded-but-not-capitalized shown in `--text-muted` with a "not capitalized" tag. Drill-down is a
disclosure/expand on each component row (keyboard-accessible, `aria-expanded`) revealing the cost lines
+ transfer chain. **Interaction states:** loading (skeleton rows) · no-cost-yet (before bottling: "Cost
basis accrues as operations are recorded" + link to the lot) · incomplete (red badge + which inputs are
unknown) · complete (as-of date + "matches snapshot"). All spacing/color via `--space-*`/`--wine-primary`
tokens, no hardcoded values. **Placement:** a panel on BOTH the lot detail and the bottled-SKU/inventory
detail (recommended) — same read model, two entry points.
**Tests:** stack sums to total; `Badge tone="red"` renders when `basisCompleteness ≠ known`; excluded
components shown muted as "recorded, not capitalized"; drill-down toggles via keyboard.
**Depends on:** Units 4, 6, 9
**Verification:** open a bottled SKU → see the decomposed, dated cost stack with a keyboard-openable drill-down.

### Unit 16: Lot ownership (custom crush) + bulk-wine receive (D19, D20)
**Goal:** Support client-owned wine + purchased bulk wine without distorting the winery's cost basis.
**Files:** `prisma/schema.prisma` (`Lot.ownership` enum + a billable-expense ledger; bulk-receive path),
migration, `src/lib/cost/consume.ts`, `src/lib/cost/receive.ts`, receive UI (Unit 15 surfaces).
**Approach:** Add `Lot.ownership` (ESTATE default | CUSTOM_CRUSH_CLIENT). For client-owned lots,
suppress fruit/wine cost from inventory-asset roll-up and route supply `SupplyConsumption` to a
BILLABLE-EXPENSE ledger (billed back, not capitalized) (D19). Extend receive-with-cost to target a
BULK WINE lot, writing a direct-material `CostLine` as a mid-DAG cost node (D20). Both respect
completeness (D14) + tenancy.
**Tests:** client-owned lot → no inventory-asset fruit cost, supplies land in billable ledger;
purchased bulk wine lot carries its $/L basis through a downstream blend + bottling.
**Depends on:** Units 1, 3, 4
**Verification:** a custom-crush lot bills supplies without inflating estate COGS; bought bulk wine
shows its purchase cost per bottle downstream.

### Unit 17: verify:cost (conservation proof) + full test sweep + docs
**Goal:** Prove correctness end-to-end and lock the invariants.
**Files:** `scripts/verify-cost.ts`, `package.json` (`verify:cost`), `test/*`, `INVARIANTS.md`, ROADMAP.
**Approach:** `verify:cost` proves COST CONSERVATION (nothing created/destroyed across blend/split/
loss/bottle/reversal except explicit VARIANCE lines), exact stock restoration on reversal, cache ==
recompute, and that every `BottlingCostSnapshot` traces to immutable source artifacts (Codex DQ).
Wrapped in `runAsTenant`/`runAsSystem`. Add the cost invariants to INVARIANTS.md.
**Tests:** whole suite green; exit-criterion scenario as an integration test.
**Depends on:** all
**Verification:** `npm run verify:cost` passes on synthetic multi-tenant data.

## Test Strategy

**Unit tests (vitest, `test/`):** pure cost fold + roll-up (`foldCost`, `composeRollup`-style), the
blend+loss→cost-per-bottle exit scenario, SPLIT inheritance, weighted-avg vs FIFO depletion, rounding
residual, reversal neutrality. Pattern: DB-free pure logic like `test/ledger-math.test.ts`.
**Integration/DB (gated):** tenant isolation for `SupplyLot`/`CostLine`/`LotCostState` (extend
`test/tenant-isolation.test.ts`); `scripts/verify-cost.ts` as the projection-equals-fold proof.
**Manual verification:** receive supply → add to lot (stock drops, CostLine) → blend → record loss →
bottle → read cost-per-bottle; undo the addition and confirm cost + stock restore.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Built on stale worktree missing Phase 14 | HIGH if not addressed | HIGH | D1 — build on `main`; confirm at gate before `/work`. |
| Cost drifts from ledger (mutable-total temptation) | MED | HIGH | Recompute-on-read + `verify:cost` projection-equals-fold proof (D4). |
| Reversal negation silently misses a family (BOTTLE=SEED, RACK/BOTTLE null id, legacy FINISH) | MED | HIGH | Unit 11 uniform reversal contract + a per-family contract test that FAILS on a missing back-link. |
| Rounding drift on cost-per-bottle | MED | MED | Decimal(18,8) internal, cents at snapshot, zero-vol⇒zero-cost residual to a VARIANCE line (D9). |
| Cache write-amplification from eager descendant invalidation | MED | MED | D4 lazy watermark — no descendant fan-out in the chokepoint tx. |
| Barrel amortization model wrong for the winery | MED | MED | D7 is a user gate; council recommends fill-based + volume×time; method configurable. |
| Scope creep into Phase 15/11 | MED | MED | Explicit out-of-scope; ship tags/toggles/seam, not allocation/integration. |
| Silent under-costing from partial cost data (contagion) | MED | HIGH | D14 completeness flag propagates; incomplete basis blocked from accounting export + surfaced in UI. |
| Abnormal loss capitalized into remaining wine (overstated inventory) | MED | HIGH | D13 splits normal (reallocate) vs abnormal (expense write-off). |
| Dry-goods cost omitted from cost-per-bottle | MED | HIGH | D15 bottling-as-BOM consumes packaging SupplyLots; cost ÷ good bottles. |
| Method/toggle change silently re-values audited history | LOW | HIGH | D17 policy-version stamping + effective-dating + period lock. |
| Reversal negates wrong amount after later history | MED | HIGH | D3 identity-negation of immutable artifacts, not recompute. |

## Success Criteria

- [ ] Receive a supply with a cost; an addition draws it down (SupplyConsumption) and writes a CostLine.
- [ ] Cost-per-bottle computed for a bottling tracing through ≥1 blend and ≥1 loss (exit criterion),
      INCLUDING dry-goods, divided by actual good bottles.
- [ ] `verify:cost` proves COST CONSERVATION + cache == recompute on synthetic multi-tenant data.
- [ ] Undo of a cost-bearing op restores exact stock + negates exact cost, even after later history.
- [ ] Abnormal loss expenses (per-L unchanged); normal loss reallocates (per-L rises).
- [ ] Incomplete cost basis is flagged in the UI and blocked from accounting export.
- [ ] Backdated upstream edit after bottling yields a variance event, not a changed snapshot.
- [ ] Export events are idempotent + reversible (Phase-15-ready, no reshape).
- [ ] All new tables pass the Phase-12 RLS checklist + isolation tests.
- [ ] All tests pass; no regressions.

## Engineering Review Notes

**What already exists (reuse, don't rebuild):** the append-only ledger + `writeLotOperation` chokepoint
(4th projection hooks here); `LotLineage` DAG + pure `composeRollup`/`buildAncestry` walkers (cost
traversal template — keep for single-lot drill-down/tests; bulk reporting uses a recursive CTE);
`LotTreatment` (materialId/computedTotal/volumeLAtAddition — cost + `SupplyConsumption` attach here);
`CellarMaterial` catalog (extend, don't replace); `reverseOperationCore` 7-family dispatcher (Unit 11
adds the uniform contract); tenant/RLS plumbing + `Lot` checklist model; `ReferenceClient.tsx` (UI
pattern); `AppSettings` per-tenant (add currency/method/toggles). `StockMovement` (finished-goods) is
separate — do NOT conflate with supply stock.

**Migration ordering (hazards):** (1) enum-only migrations FIRST and committed (CostComponent,
CostingMethod, LedgerBucket-adjacent, Lot ownership) — Postgres can't use a new enum value in the
same tx that adds it. (2) Then tables (Decimal(18,8)). (3) `Lot.ownership` ships as `NOT NULL DEFAULT
'ESTATE'` — trivial backfill. (4) The `LotLineage` index additions touch an EXISTING Phase-5 table —
call it out. (5) Follow the repo procedure: `migrate diff → strip the phantom search_vector diff →
deploy → generate`, dev server stopped before generate.

**Failure modes (each has a test + explicit handling; none silent):** blend fraction ambiguity → wrong
cost (D10 explicit transferred volume; conservation test); backdated ancestor edit → stale cache
(D4 watermark recompute) / wrong reversal (D3 identity) / snapshot drift (D12 variance); abnormal loss
mis-capitalized (D13); null cost read as $0 (D14 completeness, export blocked); reversal family miss
(Unit 11 contract test fails loudly); rounding leak to a zero-volume ghost lot (D9 variance flush);
method/toggle re-values history (D17 period lock).

**Parallelization (worktree lanes):** Lane A (schema spine, sequential): Unit 1 → Unit 2. Then fan out:
Lane B = Units 3→11 (ledger/cost engine, shared `src/lib/cost` + chokepoint — sequential within lane);
Lane C = Units 12,15 (UI, `src/app`); Lane D = Unit 10 (picker). Units 13,14,16 depend on 4/6 (Lane B
tail). Unit 17 (verify) is last, depends on all. Conflict flag: Lanes B and C both eventually touch
`src/lib/cost/actions.ts` — coordinate or sequence that file.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Council | `/council` | Cost model + DAG traversal + schema | 1 | ✅ folded | 10 CRITICAL + 7 SHOULD-FIX; all folded (barrel → fork Q1, adopted). Codex `gpt-5.4` + Gemini `gemini-3.1-pro-preview`. See `council-feedback.md`. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ✅ folded | Unit 12/15 dedup; lazy-watermark cache (D4); uniform reversal contract (D3/Unit 11 — BOTTLE/RACK/FINISH id gaps); indexes + pinned contracts (Unit 2); migration ordering; +2 forks (phasing, variance-policy). Outside voice: Codex `gpt-5.4`. |
| Design Review | `/plan-design-review` | Expendables/Inventory/cost UI (light) | 1 | ✅ folded | 6/10 → 9/10. Folded: trust-UI states + `Badge tone="red"` incomplete-basis affordance (not silent), keyboard drill-down, `Metric`/tabular-nums, dual placement; supply empty-state + CTA + per-kind grouping; picker on-hand + zero-stock hint. No forks. Tokens verified vs DESIGN.md (gold→burgundy drift noted). |

**Council fold summary (added D10–D18):** DAG recompute is authority + versioned cache (was strict
projection); explicit `OperationCostTransfer` (blend fraction ambiguity); identity-negation reversal;
`SupplyConsumption` depletion ledger; immutable snapshot + variance events; Decimal(18,8) + zero-vol⇒
zero-cost; normal vs abnormal loss; completeness propagation; bottling-as-BOM + yield; schema split;
policy versioning; Phase 15 export seam. Barrel model surfaced as fork Q1 (revises user's D7).

**Eng-review fold summary:** deduped Unit 12/15; D4 → lazy watermark cache (no chokepoint fan-out);
D3/Unit 11 → uniform reversal contract fixing the BOTTLE(SEED)/RACK/BOTTLE(null id)/legacy-FINISH gaps
Codex found; Unit 2 → concrete indexes + pinned contracts (methodUsed effective-dating, basisCompleteness
storage, policyVersion) + snapshot defined once with export-seam columns; migration-ordering + failure-mode
+ parallelization notes added. Two genuine forks remain for the user: **phasing (8a/8b)** and
**post-bottling variance policy (D12)**.

**Design-review fold summary:** trust-UI interaction states + red incomplete-basis badge (never a silent
number) + keyboard drill-down + `Metric`/tabular-nums + dual placement (lot + SKU); supply UI empty-state
CTA + per-kind grouping; picker shows on-hand + zero-stock cost-incompleteness hint. All via DESIGN.md
tokens.

**VERDICT:** ALL REVIEWS CLEARED — Council + Eng (required) + Design (light) done, every CRITICAL +
SHOULD-FIX folded, all forks resolved (barrel=council model, custom-crush+bulk-wine in v1, phasing 8a/8b,
variance split sold/unsold). Build target = `main` (D1). Ready for `/work` on `main`, starting with 8a.
