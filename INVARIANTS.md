# Ledger Invariants — Lot + Operation Ledger

> The rules the bulk-wine ledger must never violate. The ledger is the **source of
> truth**; the `VesselLot` projection is a transactional fold of it. From VISION §3 +
> the locked decisions D2/D6/D14/D15. Tests live in `test/ledger-math.test.ts` (pure)
> and `test/ledger-projection.test.ts` + `test/ledger-concurrency.test.ts` (DB).

> [!info] Machine-readable mirror + auto-enforcement
> This file is the **narrative**. Each invariant also has a typed note in
> [[docs/architecture/invariants/README|docs/architecture/invariants/]] (severity, `enforcedBy`,
> `verify`, `appliesTo`) that powers a live dashboard, a guard checker
> (`npm run verify:invariants` — fails if any invariant's guard is missing), and a PreToolUse
> hook that injects the relevant rules before an agent edits governed code. Add an invariant?
> Add a note there too, then run the checker.

## The model in one paragraph

A `LotOperation` is an immutable event with a set of signed `LotOperationLine`s. Each
line moves `deltaL` liters of one `lotId` into (`+`) or out of (`-`) one `vesselId`.
`vesselId = NULL` is the **external counter-account** ("outside the cellar") used for
seed-in, loss-out, and bottle-out so every operation conserves volume. The current
state of any vessel/lot is the fold of all lines over time, materialized in `VesselLot`.

## Invariants

### Enforced by the database (not just app code) — D14
1. **`CHECK(volumeL > 0)` on `VesselLot`.** A balance is never zero or negative; a row
   that reaches functional zero is deleted, not stored at 0.
2. **`CHECK(deltaL <> 0)` on `LotOperationLine`.** No no-op lines.
3. **Unique `correctsOperationId` on `LotOperation`.** An operation can be corrected at
   most once — kills the double-correction race.
4. **Vessel capacity.** An operation may not drive a vessel's total holdings above its
   `capacityL`. (Checked under the write lock; a non-negative `VesselLot` can still
   overfill a vessel, so this is a separate guard.)
5. **Writes run at `SERIALIZABLE` isolation** and lock the involved `VesselLot` rows in
   canonical (sorted) order before folding, so concurrent racks can't lose updates or
   overfill. P2034/serialization failures are retried (`withWriteRetry`).
5b. **LEDGER-12 — one lot per vessel.** `UNIQUE (tenantId, vesselId)` on `VesselLot`. A vessel's
   contents are ONE cohesive liquid; two lots in one tank is a state the physical world does not
   have, and permitting it is what forced every per-lot record to ask "which lot?". The INVERSE
   stays unbounded: one lot may occupy MANY vessels (40 barrels is normal), so this keys on the
   vessel and never on the lot. Bottled wine is unaffected — `BOTTLE_STORAGE` legs carry
   `vesselId: null`.
   Identity is resolved at the moment of combination by `decideCombineRoute` (absorb into the
   resident / keep / mint a new blend lot), which refuses absorbing across tax class, bond, form or
   ferment state — but NOT across owner: plan 093 Unit 6 allows a cross-owner absorb and bills the
   consumed minority owner's fraction instead of blocking. The chokepoint's own assertion is
   deliberately **monotone** — it
   refuses an operation that leaves a vessel with MORE lots than it started with, rather than one
   that merely isn't perfect, so an already-mis-recorded vessel can still be racked out and healed
   instead of being frozen unusable. See [[LEDGER-12-one-lot-per-vessel]].

### Enforced in pure code (and asserted in tests)
6. **Balanced operations.** For every operation, `sum(deltaL) == 0` across all its lines
   (in-vessel + external). `assertBalanced()`.
7. **Projection == fold of the ledger.** `VesselLot` always equals `foldLines()` over the
   full operation history. `scripts/verify-projection.ts` recomputes and diffs; any drift
   is a bug, not a tolerated state.
8. **No fabricated volume.** A residual at/below `FUNCTIONAL_ZERO_L` (0.01 L, centiliter
   granularity) is swept to zero (the row drops); balances never accumulate "dust".
9. **Decimal-safe math (LEDGER-9).** Every `deltaL` reaching a ledger line sits ON the
   `Decimal(10,2)` storage grain — integer centiliters — and `assertBalanced` checks conservation
   EXACTLY at that grain, not within a tolerance. Volume shares are allocated by
   **`computeProportionalDraw`** (centiliter-integer, largest-remainder), never by dividing floats.
   **Why the grain is a conservation question:** Postgres rounds each `deltaL` to 2dp on insert, a
   `CHECK` cannot see a cross-row sum, and nothing re-reads the operation — so lines at finer
   precision leave an operation permanently unbalanced. `[3.3333, 3.3333, 3.3334, -10]` sums to 0 and
   stores as **−0.01 L**, breaking invariant #6 silently and forever.
   ⚠️ **Corrected 2026-08-06, and each correction is a way this register can lie while every gate stays
   green.** (a) `verify:` pointed at `verify:reverse` — a reversal-semantics proof with **no** reference
   to rounding, decimals, balance or floats, whose only fractional literals are `0.5` and `13.5`. It
   could not fail this way, and `verify:invariants` only checks that the named script EXISTS. (b) This
   line used to credit **`round2`** as a "centiliter-integer / `Prisma.Decimal` helper"; it is
   `Math.round(n * 100) / 100`, plain IEEE-754, across 287 call sites. It *normalises to the grain*,
   which is necessary but is not exact arithmetic — `computeProportionalDraw` is the exact one. (c)
   `isBalanced` was `|Σ| < 1e-6`, **four orders looser than the 0.01 grain it had to protect**.
   The substance HELD: a probe asserting ≤2dp on every `deltaL` produced **zero trips across 5,992
   tests**. What was missing was enforcement — LEDGER-6 rested on ~50 call sites each remembering to
   round, with no chokepoint check and no guard. Same shape as MONEY-1's structural defect, same fix.
   Now guarded by `npm run verify:ledger-grain`, which drives the real planners with base-10-hostile
   inputs (thirds, sevenths, primes) — reverting the fix fails it.

### Correction semantics — D6 / D15
10. **Operations are immutable.** Undo is never a row reversion or a delete; it is a new
    `CORRECTION` operation whose lines are the inverse of the target, linked via
    `correctsOperationId`.
11. **Conservative correction guard.** A correction is **blocked** if any later
    non-correction operation touched the affected `(vessel, lot)` positions — not merely
    when "enough volume is present". A mathematically-valid inverse could otherwise
    silently rewrite a composition that downstream work (topping, blending, bottling)
    already depended on.

## Identity & provenance
- **Lot identity excludes vintage** (D3); vintage is an attribute.
- **Identity is the surrogate `id` — the ONLY opaque identity.** `id` **and** the
  point-in-time `lotCode`/`vesselCode` **line snapshots** on each `LotOperationLine` are
  **immutable**. Origin (`vineyard`/`block`/`variety`) and `vintageYear` **provenance**
  remain immutable after the first operation.
- **The user-facing labels are a mutable presentation layer.** `code` is a **mutable,
  unique-per-tenant** human label; `displayName` is a **mutable, NON-unique** free-text
  label (see [[#Naming & identity presentation]] — NAMING-1/2). An **opaque system slug is
  NOT used**: the surrogate `id` already provides the opaque stable key, so a second opaque
  slug is redundant and would hide the codes winemakers recognize (Decision 2 — the
  opaque-slug alternative is rejected permanently).
- Every operation carries a **monotonic `sequence`** (deterministic fold ordering —
  `occurredAt` timestamps collide and clocks drift), plus `observedAt`/`enteredAt`/
  `enteredBy`/`captureMethod` provenance (D14).

## Naming & identity presentation
> Machine-readable notes: [[NAMING-1-identity-is-id]], [[NAMING-2-honest-rename]].
> **Status:** planned in Phase 0; verify-guarded in Phase 1 (`verify:naming`).
- **Identity is `id`, never `code` (NAMING-1, planned).** `code`/`displayName` uniqueness is
  a **per-tenant UX constraint, not an identity constraint** — `code` is unique-per-tenant,
  `displayName` has **no** uniqueness constraint. A `code` collision is a **label error** the
  system **OFFERS to auto-disambiguate — it does not silently apply** it; silent
  auto-disambiguation is reserved for **newly generated post-go-live codes only**. Nothing in
  lineage, cost, or the ledger may join on `code`. Phase 1 adds `verify:naming` and flips this
  to `guarded`.
- **Honest rename (NAMING-2, planned).** A rename is an **append-only `LotCodeEvent`**
  (`fromValue`/`toValue`/`actor`/`observedAt`/`commandId`) that **never rewrites
  `LotOperationLine` snapshots**. Current-state reads resolve `id → current code/displayName`;
  historical reads show the code **as-recorded** plus a "renamed → X / also-known-as"
  affordance. **All user-facing filtering/lookup by a human `code` MUST resolve to the
  surrogate `id` first, then read history by `id`** — never join on the mutable `code` (this
  is what keeps `WHERE lotCode = ?` out of the codebase). Will be verify-guarded **like
  LEDGER-10** — guard `verify:naming` lands in Phase 1; currently `status: planned`.

## Day-Zero boundary — D11
- Full vine-to-bottle traceability **starts at cutover.** Pre-cutover wine is wrapped as
  `isLegacy` Lots seeded at current volume with the old tuple in `legacySnapshot`. No
  fabricated lineage; **`BottlingSource.lotId` is not backfilled** on historical rows.

## Cost roll-up — Phase 8 (D5/D9/D10/D13/D14/D17/D19)
The cost engine is a projection over the ledger; it never invents or loses money. Proven end-to-end by
`npm run verify:cost` (runs in the Demo Winery tenant).
- **Cost conservation.** Across blend/split/loss/bottle/reversal, `Σ(cost out) + stranded == cost removed
  from parents`; nothing is created or destroyed except explicit VARIANCE lines. Zero volume ⇒ zero cost.
- **Transferred-volume cost, not lineage fraction (D10).** A blend/split moves `parentTotalCost ×
  transferredL / parentPreOpL` via an immutable `OperationCostTransfer`, never the ambiguous lineage %.
- **Normal vs abnormal loss (D13).** Normal loss reallocates onto surviving volume (per-L rises); abnormal
  loss writes an expense line and leaves per-L unchanged.
- **Completeness contagion (D14).** Unknown unit cost is recorded as `basisCompleteness = UNKNOWN` — never
  a silent `$0` — and any unknown parent taints the child. The trust UI shows a red "estimated" badge.
- **Capitalization is policy, recording is not (D5/Unit 9).** MATERIAL + DOSAGE_LIQUEUR always capitalize;
  FRUIT/BARREL/LABOR/OVERHEAD/PACKAGING fold in only when the tenant's toggle is on. A toggled-off
  component is still recorded as a CostLine, just excluded from cost-per-bottle. `isComponentCapitalized`
  is the single authority (consulted by the roll-up loader `cost/data.ts`).
- **Policy versioning (D17).** Every derived cost row is stamped with the `costingPolicyVersion` at write
  time; a later toggle/method change never re-values closed history. The method in effect for an op is
  resolved at its `observedAt` (`resolveMethodAt`).
- **Reversal by identity-negation (D3/Unit 11).** Undo negates the ORIGINAL `SupplyConsumption` +
  `OperationCostTransfer` rows by identity and restores exact `SupplyLot` qty — never recomputed from
  current ancestry — so an intervening backdated edit can't corrupt the restoration.
- **Client-owned cost is billed, not capitalized (D19/Unit 16).** A `CUSTOM_CRUSH_CLIENT` lot's direct cost
  lines are recorded (for billing) but suppressed from the estate capitalized roll-up; supplies still
  deplete physical stock. Enforced at the single capitalization authority (`cost/data.ts`).
- **The cache is a materialization, not the authority (D4).** `LotCostState` is a lazy, watermark-versioned
  cache of `computeLotCost`; `verify:cost` asserts cache == recompute.
- **Inventory cost is ALWAYS stored in the tenant base currency, and never revalued for FX (COST-4, Plan 073).**
  A foreign-currency supplier invoice is converted at ingestion at a dated ECB rate (never the LLM; a missing
  rate fails loud, never a fabricated 1.0/$0 — D14), so `SupplyLot.unitCost` + `SupplyLot.currency` are always
  the base currency and the roll-up is single-currency. The foreign amount + rate + rate-date + source are
  preserved on the lot for audit but NEVER enter the roll-up. Inventory is a non-monetary asset carried at
  historical cost (IAS 21): once received, a lot's base cost is frozen and a later rate change never revalues
  it. The A/P is DECOUPLED — `ApExportEvent` stores the FOREIGN amount + `exchangeRate`, so QBO owns FX
  gain/loss + revaluation and posts the bill in its own currency; the reconciliation invariant
  `base inventory value == round2(foreign amount × exchangeRate)` ties the two. Proven by `verify:ingest`
  (EUR scenario + reconciliation + historical-cost-not-revalued) and re-proven single-currency by `verify:cost`.
- **An ingested invoice emits its A/P exactly once, as ONE aggregate invoice-level event — never a per-lot
  event (AP-1, Plan 076).** Invoice ingestion passes `skipApEmit` to `receiveSupplyCore` so the per-lot emit is
  suppressed, then calls `emitApExportForInvoice` once after all lots exist — one `ApExportEvent`
  (`postingKey = apinv:<invoiceId>`, multi-line `billLinesJson`) → one multi-line QBO Bill. This keeps a
  supplier invoice a single payable in QuickBooks (no duplicate-DocNumber collision, QBO err 6140) and gives
  payment status one balance to track. Manual (non-ingest) receipts keep the per-lot path unchanged. Proven by
  `verify:ingest` (scenario 1: exactly one aggregate event + zero per-lot events for an applied invoice).

### Phase 8b — advanced cost (D7/D12/D18/D20)
- **Barrel cost is fill-based accelerated + time×space (D7/U8).** A barrel amortizes over its useful life in
  FILLS (sum-of-years-digits: first fill carries the most), allocated to resident wine by `min(1, days/365)
  × min(1, residentVol/capacity)`. A fill OPENS when wine enters an empty barrel and CLOSES (materializing an
  immutable BARREL CostLine) when it leaves — the cost domain's fourth fold at the `writeLotOperation`
  chokepoint. While a fill is open the roll-up derives an accrue-to-date BARREL event; once closed the
  materialized line takes over (never both — no double count). A barrel with no `BarrelAsset` accrues nothing.
- **The COGS snapshot is immutable; corrections after bottling emit variance, never a restate (D12/U13).** A
  backdated correction that changes an already-bottled lot's basis leaves the frozen `BottlingCostSnapshot`
  untouched and appends a `CostVarianceEvent` splitting the per-bottle delta across bottles that LEFT
  inventory (→ period COGS variance) vs still on hand (→ inventory-value adjustment; sold = good − onHand).
  `soldDelta + unsoldDelta == totalDelta`. Immutable snapshot ⇒ closed periods are period-safe by construction
  (D17). Detection is wired into the reversal path (one site, all families); idempotent per (snapshot, trigger).
- **Purchased bulk wine gets a real basis (D20/U16).** `receiveBulkWineCostCore` injects a direct-material
  MATERIAL CostLine (always capitalized) as a mid-DAG cost node on a bulk WINE lot; it rolls up + reverses
  like any other cost. Without it, bought bulk wine would show $0.
- **Accounting export is immutable + idempotent + reversible (D18/U14).** A COGS snapshot expands into one
  `CostExportEvent` per capitalized component, each carrying a per-tenant (component, tax-class) → debit/credit
  account mapping and a deterministic `postingKey` (re-emit is a no-op). Incomplete-basis or unmapped sources
  are WITHHELD, never partially posted (D14); a reversal negates amounts and links back. Reading
  `cost_export_event` IS the per-SKU/per-run export view (Phase 15 posts it, no reshape).

## Work orders — Phase 9 / 9.1 (WORKORDER-1..7)
The work-order engine writes through the SAME ledger + cost machinery, so its invariants are ledger-adjacent.
Machine-readable notes: [[WORKORDER-1-op-is-immutable-approval-is-task-state]],
[[WORKORDER-2-reservations-are-advisory]], [[WORKORDER-3-maintenance-supply-is-overhead]].
- **A completed work-order task's op is an ordinary immutable ledger op; approval is task metadata (WORKORDER-1, Phase 9).**
  Completing an OPERATION task writes a REAL, immutable ledger op immediately through the existing family cores
  (`rackWineTx`/`recordNeutralDoseTx`/`topVesselTx`), owned by an append-only `WorkOrderTaskAttempt` in
  PENDING_APPROVAL. "Pending approval" is task/attempt state, never op state — the projection is truthful the
  moment the crew checks the task off. Approval flips task state (no op mutation); rejection is a
  `reverseOperationCore` CORRECTION (honors LEDGER-10) that negates cost + restores stock, blocked by LEDGER-11
  if a later op touched the same wine. The commandId (idempotency) lives on the attempt, so an offline-drain
  double-tap is a no-op. Guard: `npm run verify:work-orders`.
- **Work-order reservations are advisory; capacity + stock are enforced only at commit (WORKORDER-2, Phase 9).**
  Reservations are soft, expiring holds: available-to-promise = on-hand/capacity − Σ(active holds); a shortfall
  WARNS, never blocks (a cellar's plans change constantly; hard locks grid-lock harvest). The real guarantee stays
  at commit — vessel capacity in `writeLotOperation` (LEDGER-4) + the `SupplyLot` decrement in
  `consumeMaterialCore`. Holds reserve supply at the MATERIAL level (not a specific `SupplyLot`, so the costing
  engine is unaffected); `validUntil` is separate from `dueAt` and a past-due WO does NOT auto-expire its holds.
  Guard: `npm run verify:work-orders`.

- **A consumable MOVE conserves quantity and value (STOCK-2, plan 080).**
  Consumables became per-location in plan 080. A transfer is a FIFO **lot-split**, not a decrement-here /
  increment-there: Σ`qtyRemaining` is unchanged, and each destination lot inherits its SOURCE lot's
  `unitCost`, `receivedAt`, `expiresAt`, `vendorId`, `policyVersion` and FX quintet, so Σ(qty × unitCost) is
  unchanged too. The naive implementation destroys cost lineage — the moved stock either loses its basis
  (valuing at $0/UNKNOWN) or is silently re-priced at today's average, back-dating a cost change onto stock
  whose value never moved. A split lot points back via `splitFromLotId`; provenance derives TRANSITIVELY
  through that edge and is never row-copied, so later-added source documents still resolve. Negative
  `qtyRemaining` is reserved for the CONSUME reconcile path (a dose past a location's on-hand, booked at a
  KNOWN weighted-avg so COGS is never $0 and never cross-pulled from another location); a deliberate user
  transfer or adjustment BLOCKS with the specific shortfall instead.
  Guard: `npm run test -- material-stock`.

- **Vessel-activity (maintenance) supply use is OVERHEAD, never wine COGS (WORKORDER-3, Phase 9.1).**
  A maintenance task (cleaning, sanitizing, steaming, gas, ozone, SO₂ treatment, wet-storage solution change,
  temperature setpoint) that consumes a supply
  decrements the `SupplyLot` and records an append-only `VesselActivitySupplyUse` per depleted lot — but writes
  NO `SupplyConsumption`, NO `CostLine`, and NO `LotOperation`, and never enters the Phase-8 wine cost roll-up.
  A sanitizer/cleaner is overhead, not a cost of any specific wine; routing it through the wine cost DAG would
  corrupt cost conservation (COST-1/COST-2). Overhead depletion draws stock to zero and reports a shortfall — it
  never drives `qtyRemaining` negative — and a reversal (`reverseVesselActivityTx`) restores each lot by identity.
  Guard: `npm run verify:work-orders-enhancements`.

- **Tenant-authored task types are record-only (WORKORDER-4, Plan 053 Phase C).**
  A "Custom Log" (a tenant-authored task type via the task builder) is always a `NOTE` and can NEVER declare a
  ledger `opType`, an `observationType`, or a maintenance `activityType` — it records data onto the task only,
  never touching the immutable ledger, the cost roll-up, or the governed measurement store. Only code-defined
  built-in types in `TASK_VOCABULARY` reach those; a user type can't shadow a built-in key either. Enforced
  structurally (`work_order_task_type` has no kind/opType column), by `assertUserTaskTypeSafe` (before every
  persist AND on every resolve), and by the resolver's built-in-collision skip. Field overlays
  (`WorkOrderTaskTypeOverlay`) are display-only and `assertOverlaySafe` forbids hiding a field a governed core
  needs. Machine-readable note: [[WORKORDER-4-user-types-record-only]]. Guard: `npm run verify:user-types-record-only`.

- **Every work order has a Lead (WORKORDER-5, Plan 070).**
  Every `WorkOrder` carries a non-null Lead (`assigneeEmail`, plus `assigneeId` when a real user is known) —
  the single person accountable for the order. The Lead is resolved at the one create chokepoint
  (`createWorkOrderCore` via `resolveCreateLead`): an explicit Lead passes through, otherwise it defaults to
  the creating actor, so no creation path (builder, template, composer, recurring, assistant, generic) can
  produce a Lead-less order, and the header/print/dashboard always show an owner. Per-task assignees
  (`WorkOrderTask.assigneeId`) stay OPTIONAL — the Lead is order-level, distinct from a per-task assignment.
  Existing Lead-less orders were backfilled once (`scripts/backfill-work-order-lead.ts`: single task
  assignee → issuer → tenant admin). Machine-readable note: [[WORKORDER-5-work-order-has-lead]].
  Guard: `npm run verify:work-orders`.

- **Editing a work order never mutates an executed task's ledger op (WORKORDER-6, Plan 071).**
  In-place editing (`updateWorkOrderCore`, the builder's edit mode) only touches PENDING tasks — it may
  update/add/remove/reassign/reorder them and re-sync their advisory reservations per task. An executed
  task (non-PENDING; it owns an immutable op, WORKORDER-1) is LOCKED: reposition only, never change its
  content/attempts/op or delete it. The core refuses an edit slot that targets a non-PENDING task as
  editable; APPROVED/CANCELLED WOs can't be edited. Issued WOs stay issued. Machine-readable note:
  [[WORKORDER-6-edit-never-mutates-executed-op]]. Guard: `npm run verify:work-orders`.

- **EQUIPMENT + UNCLASSIFIED (and any unknown category) are non-doseable overhead, never wine COGS (WORKORDER-7, Plan 072).**
  `isDoseableCategory` is a DEFAULT-DENY allowlist, not a denylist: only `ADDITIVE` and `OTHER` (the exact
  set doseable pre-072) may be dosed into wine; `EQUIPMENT`, `UNCLASSIFIED`, `CLEANING_SANITIZING`,
  `PACKAGING`, and any unrecognized/typo'd/imported String are non-doseable by default. Because
  `MaterialCategory` is a free-text String column, a denylist was doseable-by-default — a new/garbage string
  would silently capitalize into wine COGS (WORKORDER-3, COST-1/COST-2); the allowlist closes that.
  Unrecognized category INPUT coerces to the non-doseable `UNCLASSIFIED` sink (never the doseable `OTHER`),
  so an import can't become doseable via a typo. Plan 072's `EQUIPMENT` category is a stock home for spare
  parts/fittings that can never be dosed. Transitively protects all WORKORDER-3 call-sites through the
  execute seam (`src/lib/work-orders/execute.ts`). Machine-readable note:
  [[WORKORDER-7-equipment-and-unclassified-never-doseable]]. Guard: `npm run verify:work-orders-enhancements`
  (execute-seam guard) + the exhaustive allowlist snapshot in `test/material-cost-safety.test.ts`.

## Compliance & migration invariants
> Added in Phase 0 from the incumbent teardown (`analysis/incumbent-teardown/SYNTHESIS.md` §B.1(iv);
> `FIX_RUNBOOK.md`). BOND/TAXCLASS/TAXPAID/AMEND are **guarded** as of Phase 2 (`verify:bond` /
> `verify:taxclass` / `verify:taxpaid` / `verify:ttb`); MIGRATE-1 is **guarded** as of Phase 3
> (`verify:migration`).
> Machine-readable notes: [[BOND-1-bond-isolation]], [[TAXCLASS-1-cross-class-blend]],
> [[TAXPAID-1-terminal-state]], [[AMEND-1-amended-chain]], [[CBMA-1-controlled-group]],
> [[MIGRATE-1-seed-not-replay]].

- **Bond isolation, line-scoped + time-aware (BOND-1, guarded — `verify:bond`).** Every tenant-scoped ledger position
  belongs to exactly one bond, and **bond affiliation is posted at the operation/line level and is
  time-aware** (the movement carries source + destination bond) — the authoritative bond of a position is
  derived point-in-time from the ledger, mirroring `deriveTaxClass()`. Any lot-level "home bond" column is a
  **projection only, never the compliance source of truth**. A cross-bond movement posts **symmetric
  Removed-in-Bond (source) / Received-in-Bond (destination)** to both bonds' reports (§A 7/15, §B 3/9),
  **atomically within a single ledger transaction** (one `runLedgerWrite` via a `…Tx` core) — a one-sided
  or two-transaction post is a violation. Guarded by `verify:bond` (Phase 2).

- **Cross-class blend posts symmetrically (TAXCLASS-1, guarded — `verify:taxclass`).** A blend/rack/topping across ≥2 tax
  classes posts **symmetric Produced-by / Used-for-blending** movements (§A 5/20/24/25), **atomic within one
  transaction**; the result carries the **destination (receiving) lot's** tax class and the winemaker is
  warned when sources cross classes. (The mechanism for assigning a class to a brand-new blend lot is a
  Phase-2 design detail — this invariant fixes only that the *class carried* is the receiving lot's.) Guarded
  by `verify:taxclass` (Phase 2).

- **Taxpaid is a terminal one-way state (TAXPAID-1, guarded — `verify:taxpaid`).** `REMOVE_TAXPAID` volume cannot re-enter
  in-bond via an ordinary compensating reversal; only an explicit, **refund-flagged
  Taxpaid-Returned-to-Bond** event re-admits it. This guards the generic reverser
  (`reverseOperationCore`) against silently corrupting the tax-paid boundary. Guarded by `verify:taxpaid` (Phase 2).

- **Amended-chain integrity (AMEND-1, guarded — `verify:ttb`).** Correcting a **FILED** period marks all later FILED
  reports in that **form + bond** chain `NEEDS_AMENDMENT` and regenerates begin-balances down the chain
  (carry-forward makes this cheap). *(Open Phase-2 design question: whether the regeneration runs
  synchronously or as a queued job with a `NEEDS_CALCULATION` lock at scale — the invariant states the rule,
  not the mechanism.)* Guarded by `verify:ttb` (Phase 2) — the AMEND-1 3-period chain. Chosen v1: synchronous, in-transaction marking at the write chokepoint (Key Decision a).

- **Controlled-group CBMA credit (CBMA-1, DEFERRED).** Tenants in a common controlled group cannot each
  independently claim the full 30k/100k/750k CBMA ladder — the credit is apportioned across the group.
  `excise.ts:66-74` already parameterizes this as "v2". **Deferred — no code in these phases; activate when
  multi-entity tenants appear.**

- **Migration is seed-not-replay (MIGRATE-1, guarded - `verify:migration`).** **Exactly one migration `SEED` per lot/vessel
  participates in the volume/cost fold** (cutover balances). **Legacy operational history is ingested ONLY
  into the read-only archive and is NEVER folded** (excluded from `foldLines()` / `VesselLot` / the cost
  DAG). **An import cannot publish to the live tenant while any reconciliation delta remains unresolved** —
  where "unresolved" means neither reconciled to zero nor explicitly accepted by the operator as a **named
  exception** in the reconciliation pack (not a numeric tolerance). Operationalizes **D11** (no fabricated
  ledger history). Guarded by `npm run verify:migration` in Phase 3.

## Ownership — custom-crush (Plan 093)

> Machine-readable note: [[OWNER-1-owner-projection]].

- **ownerId is a maintained projection, never re-derived from lineage (OWNER-1, guarded — `verify:owner-model`).**
  A lot's `ownerId` is SCALAR (one owner; NULL = Estate/facility) and a re-stampable PROJECTION like
  `vessel_component` — the immutable record is the `CHANGE_OWNERSHIP` op. Descendant rows carry their lot's
  CURRENT `ownerId` read from the column at the chokepoint, NEVER walked from lineage (re-deriving would
  resurrect a pre-`CHANGE_OWNERSHIP` owner — eng-review P1). A derived lot takes the dominant owner of its
  sources; a **cross-owner blend is ALLOWED**, the minority billed via `BILLABLE_WINE_CONSUMED` (council C2),
  never refused. `CHANGE_OWNERSHIP` is **conditional on the bond delta**: same bond → title-only, ZERO TTB;
  host↔AP (distinct BWN) → title + symmetric transfer-in-bond (council C1). Compliance keys off BOND, not
  ownerId, but an AP owner's bond wins in `deriveBond`. Owner-scope RLS is plan 092, not this invariant.
  Guarded by `npm run verify:owner-model` (16 assertions, Demo tenant, no RLS).

## Vineyard Intelligence — soil (P4)

> Machine-readable note: [[SOIL-1-no-blended-properties]].

- **No blended block soil properties (SOIL-1, guarded — `verify:soil`).** A block's `BlockSoilSnapshot`
  invents NO property value: area share (%) is the ONLY value we aggregate. Every soil property (pH,
  drainage, AWC, restrictive depth) stays PER-MAP-UNIT, cited to its `mukey` at the level NRCS publishes it
  (labelled via `*Basis`). No block-level averaged pH / drainage / AWC / restrictive depth exists anywhere —
  pH is logarithmic, drainage categorical, and averaged restrictive depth is actively dangerous (the shallow
  half is where the vines die). We inherit NRCS's own published roll-ups (e.g. `muaggatt.drclassdcd`) but
  labelled as such, never re-aggregated. Non-soil map units (Water/Pits/Rock outcrop) are classified
  explicitly and never presented as a soil (spike NEW-1). This is NOT a lint (the design says so); the guard
  proves the positive shape and this note + review checklist enforce the absence. `npm run verify:soil`.

## Spray Intelligence — the application record (S3a)

> Machine-readable notes: [[SPRAY-1-append-only-correction-as-event]] · [[SPRAY-2-facts-as-of-snapshot]] ·
> [[SPRAY-3-gap-renders-unknown]] · [[SPRAY-4-planned-harvest-audited]] · [[SPRAY-5-dried-before-rain-derived]] ·
> [[SPRAY-7-clean-scout-never-closes]].
> SPRAY-1..5 guarded by `npm run verify:spray-record`; SPRAY-6 by `npm run verify:product-facts`; SPRAY-7 by `npm run verify:latent-infection`.

- **Spray history is append-only, corrected as an event (SPRAY-1, critical, database).** A Postgres
  `BEFORE UPDATE` trigger refuses any content change on all six append-only tables (per-table
  bookkeeping allowlists only: `status`+`supersededByApplicationId` on the header, `effectiveTo`+`status`
  on the harvest event, the derived `driedBeforeRain*` on the block line, NOTHING on the override).
  A correction appends a full new revision; `UNIQUE(tenantId, supersedesApplicationId)` makes it
  at-most-once, and a VOID is a SUCCESSOR ROW so the same unique kills the void race (council C2).
  DELETE requires the `app.allow_spray_purge` GUC on a non-app_rls connection (C15) — QA teardown only.
- **Decisions replay under facts-as-of-then (SPRAY-2, critical, core).** Each material line freezes a
  facts snapshot with `factsRevision`+`factsAsOf`. A correction COPIES the snapshot verbatim and
  re-resolves ONLY a line whose product identity changed (KD-14 — council G1 reversed the original
  re-resolve design; do not "fix" it back).
- **A gap renders as UNKNOWN, never clear (SPRAY-3, critical, database).** DB CHECKs make
  `snapshotResistanceGroups=[] ∧ resistanceGroupsKnown=true` impossible and force both knownness flags
  for `factsCompleteness=KNOWN` (council C7). `rotationContribution` keys off knownness, never array
  length; an unconfirmed legacy field-note spray BLOCKS a rotation-OK claim.
- **The planned harvest date is an audited event stream (SPRAY-4, high, database).** Closed-interval
  versions (Shape D), one open row per (block, vintage, passLabel) by partial unique, zero open rows =
  no planned date; point-in-time reads; the stream IS the outbox — S7a consumes
  `plannedHarvestChangesSince(cursor)` as a watermark (council C4). Split picks coexist (G4); PHI reads
  the EARLIEST open date.
- **A clean scouting pass never closes a latent infection event (SPRAY-7, critical, app-code).**
  An open event closes by its resolution rule or by an attributed human append — never by the ABSENCE
  of symptoms, because during the latent period there is by definition nothing to see. Fedele et al.
  2020 scored a Botrytis model at 65% against field assessment but >87% against post-harvest assays of
  SYMPTOMLESS berries. `evaluateResolution` accepts `scoutedCleanOn` and deliberately ignores it;
  `closeInfectionEvent` exposes no parameter that would let a clean scout close an event. Same family
  as SPRAY-3 and PEST-1 (absence of evidence rendering as a clearance), applied to TIME rather than
  coverage. Companion rule (S5a KD-4): `infectiousExpectedAt` takes the SHORTEST plausible latent
  period and the expiry the LONGEST — opposite ends of one interval, each erring toward "the pathogen
  is active", never averaged. NOTE: S5a ships this ledger WITHOUT a powdery risk index; the Unit 0
  probe failed its pre-committed gate at every site and the index moved to S5b behind S1.
- **driedBeforeRain is derived, never self-reported (SPRAY-5, high, core).** Computed from the block's
  own finish time + hourly precip through an injected port, or UNKNOWN; the human correction is an
  attributed append-only override row. A null block `finishedAt` yields REI/residual UNKNOWN and never
  borrows the header timestamp (G2/C14 — worker safety, not data quality).

## Barrel groups — Cellarhand v2 Phase 7 (RFC-001 / ADR 0014)

> Machine-readable notes: [[GROUP-1-one-operational-group-per-vessel]],
> [[GROUP-2-group-is-never-a-vessel]], [[GROUP-3-work-order-member-snapshot-is-frozen]].

- **One operational group per vessel (GROUP-1, high, database).** A vessel belongs to at most one
  `OPERATIONAL` `VesselGroup`; `AD_HOC` membership is unbounded and may overlap freely. Without it
  the same barrel is scheduled into two competing topping rounds and double-topped — a correctness
  gap, not an ergonomics one, and equally wrong at 22 barrels and at 8,142. Enforced by a **partial
  unique index** on `(tenantId, vesselId) WHERE groupType = 'OPERATIONAL'`. The predicate reads the
  DENORMALISED `groupType`, not the group's `type`, because **a partial index predicate cannot
  reference another table**; two triggers — not application discipline — keep that column true, so
  the index is enforced against a column no app code can write. Guarded by
  `npm run verify:group-membership`, which checks the data AND the continued existence of the index
  and both triggers.

- **A group is never a vessel and never a lot (GROUP-2, high, pure-code).** A `VesselGroup` holds no
  volume, has no capacity of its own, appears in no `LotOperationLine`, and never appears in
  `LotLineage`. A group action stays ONE user intent fanned out to member vessels sharing
  `LotOperation.batchId`. This is what keeps the group layer from quietly becoming a second, parallel
  ledger; it pairs with [[LEDGER-12-one-lot-per-vessel]] — the atomic vessel stays 1:1 with its lot,
  while the group above it may *associate* mixed lots without ever holding them. Guarded by
  `npm run verify:group-not-a-vessel`, derived from `Prisma.dmmf` rather than a hand-list.

- **An issued work order's member list is frozen (GROUP-3, high, core).** A work order issued against
  a group **snapshots its member list at issue**, and that list is immutable thereafter. No membership
  edit — add, remove, reorder, split, merge, archive, or retroactive admin correction — may change
  what an already-issued work order covers. **The freeze point is ISSUE, not create:** a `DRAFT` reads
  live membership because nothing has been committed to yet, which is only meaningful because Phase 9
  made *issue* a separate, deliberate human act ([[WORKORDER-1-status-machine]]). Historical reads
  read the snapshot; there is no as-of query on membership.
  **Corollary, and it is a tripwire:** `VesselGroupMember` carries **no** `addedAt`/`removedAt`. The
  owner chose the work-order snapshot over effective-dated membership (ADR 0014) precisely because
  effective-dating plus RFC-001 §4.9's retroactive correction reproduces the failure
  [[SPRAY-2-facts-as-of-snapshot]] forbids — a correction silently repainting what a closed decision
  meant. A membership table that grows date columns later is the sign this has been abandoned; both
  the structural migration and `verify:group-not-a-vessel` fail if either column appears. Guarded by
  `npm run verify:wo-member-snapshot`.

## Knowledge base — the corpus/relational boundary (SKB)

> Machine-readable note: [[KB-1-product-table-is-not-corpus]]. Guarded by `npm run verify:kb-boundary`.

- **A product→fact table is never corpus content (KB-1, critical, pure-code).** The corpus/relational
  line is **tabular vs prose**, not mentions-FRAC vs does-not. A table or matrix keyed by product or
  active ingredient (product × FRAC group, × efficacy, × rate, × REI/PHI) must never be indexed for an
  enforcing source; disease biology and advisory prose that names FRAC groups as context while deferring
  rates to the label both pass. The failure it prevents is a corpus table quoted as authoritative while
  `pesticide_resistance_assignment` says `GAP` — a coverage gap rendering as a confident answer from the
  WRONG ENGINE (runbook §3.6, [[PEST-1-gap-is-not-a-clearance]] from the other side).
  **Three mechanics are load-bearing and none is optional.** The detector reads **raw HTML / PDF
  pre-chunk lines, never post-extraction text** (`extract/pdf.ts` emits no pipe tables and no headings,
  so extracted text disarms it on exactly the documents that matter). The gate is **inline in
  `index-documents.ts`, before both extraction and the idempotency short-circuit**, and signals by
  **returned field, never a throw** — a throw there is read by the re-crawl tombstone pass as "the page
  was removed" and would mass-tombstone a source. And `uncertain` **skips for an enforcing source**
  (fail closed) while being **admitted and counted for a report-only one**, where nothing is gated.
  Enforcement is the DEFAULT; the 25 pre-SKB sources are a frozen report-only census whose deletion is
  how the grandfather clause closes.

## Auth — a redirect is control flow, not an error (REDIRECT-1)

> Machine-readable note: [[REDIRECT-1-redirect-is-not-an-error]]. Guarded by `npm run verify:redirect-passthrough`.

- **A `catch` that wraps a `require*` gate must rethrow the framework's errors (REDIRECT-1, high,
  app-code).** The gates in `src/lib/dal.ts` — `requireReadyUser`, `requireAdmin`, `requireSession`,
  `requireDeveloper`, `requireActiveTenant` — do **not** return an `AccessDecision`. They call Next's
  `redirect()`, which signals by **throwing** an internal `NEXT_REDIRECT` error that the framework is
  meant to catch. So a catch-all around a gate silently converts an auth redirect into a return value:
  the user with an expired session stays on the page and reads the literal digest string
  `NEXT_REDIRECT;replace;/login;307;` as their error message. `getCurrentUser()` also reads `headers()`,
  whose request-time bailout throws the same way, so the same catch can swallow a dynamic-rendering
  signal too. Every such `catch` leads with `unstable_rethrow(e)` (hoisting the gate above the `try` is
  equally accepted); the guard is a static AST scan over `"use server"` files.
  **This is the opposite polarity from `src/lib/action-result.ts`**, where an *expected* `ActionError`
  must be caught and returned as data because production redacts thrown errors. Both hold at once —
  catch YOUR errors, rethrow the FRAMEWORK's — and `unstable_rethrow` is exactly that partition, which
  is why it belongs at the top of the catch rather than as a hand-rolled digest sniff. It shipped broken
  on 21 actions (weather, spray, planned-harvest) before the guard existed.

## Tenancy — the vineyard-membership fence is complete, not partial (VINEYARD-1)

> Machine-readable note: [[VINEYARD-1-vineyard-membership-fence]]. Guarded by `npm run verify:vineyard-scope`.

- **Every vineyard-scoped action applies D9, and an empty membership set reaches nothing (VINEYARD-1,
  high, app-code).** `canAccessVineyard` is an **intra-tenant** control and **Postgres does not enforce
  it** — RLS scopes by TENANT — so it holds only where the action layer applies it. It used to live in 8
  files and be absent from the rest, leaving **53 exported actions** across weather, spray, soil,
  planting areas, NDVI and block CRUD authorized to tenant only: a manager assigned to vineyard A could
  read and mutate vineyard B. The proof this was a bug rather than a choice is internal — `entities.ts`
  marks `Vineyard` and `VineyardBlock` as `vineyardScoped: true` and `db_update` already refused
  out-of-scope edits to them, so the **assistant path was stricter than the GUI path for the same rows**;
  and `harvest/actions.ts` gated all five of its mutations while its sibling `planned-harvest-actions.ts`
  gated none.
  **Two shapes, deliberately different.** A **keyed** action (one vineyard/block/planting area/spray
  record) THROWS `FORBIDDEN` — returning an empty result would disguise a denial as "no data". A **list**
  read (season board, planned-harvest board, block picker) FILTERS to the reachable set, because a
  manager legitimately sees a subset and throwing would blank a working screen. `narrowVineyardFilter` is
  that seam: an explicit id must be in scope (it throws, so a crafted id cannot widen a read); an absent
  id means "everything I reach"; a manager with no memberships gets `[]`, **never `null`**, which callers
  read as "no predicate needed".
  **Spray gates on the footprint, not the header.** A pass may legitimately span sites (`record-core.ts`
  computes `isCrossSite`) and the header `vineyardId` is only "defaulted from the FIRST block line", so
  reads require every vineyard the record's block lines touch and writes gate on the blocks named in the
  payload. Trusting the header would let a manager name their own vineyard while spraying another site.
  **This is not plan 092** — it is app-layer with zero DB enforcement. Phase 23 moves the fence into a
  capability matrix + RESTRICTIVE RLS quad; until then this keeps the existing fence from being partial.

## Tenancy — a tenant-global catalog write is admin-only (GLOBAL-1)

> Machine-readable note: [[GLOBAL-1-global-catalog-is-admin-only]]. Guarded by `npm run verify:global-catalog-admin`.

- **The six `vineyardScoped: false` entities are admin-only to create or edit (GLOBAL-1, high,
  app-code).** This is the **second branch of the same rule** as VINEYARD-1. `assertScoped` (in BOTH
  `db-update.ts` and `db-create.ts`) reads `if (entity.vineyardScoped) { …membership… } else if
  (!isTenantAdminLike(user)) throw "Only an admin or developer can change global records."` — so
  Variety, Location, FinishedGoodCategory, Vessel, WineSku and FinishedGood are admin-only in EVERY write
  path. VINEYARD-1 closed the `if`; this closes the `else`. Before it, **13 GUI writes** let any
  authenticated user rename the tenant's varieties, add or deactivate locations, add or retire a tank, and
  create finished goods — all of which the assistant refused them.
  **The line is CATALOG vs OPERATIONAL**, and the assistant is the reference for that too: editing the
  vessel catalog is admin, racking wine between vessels is not; creating a finished good is admin, moving
  stock is not (`adjust-inventory` / `adjust-consumable` are not `adminOnly`). `findOrCreateWineSku` is
  deliberately untouched — it runs inside a bottling flow, and gating it would block bottling for cellar
  staff. The dedicated creators for entities OUTSIDE the six (`create-grower`, `create-custom-unit`,
  `create-vendor`, `create-material`) are not `adminOnly` either, so those modules are deliberately not
  covered: there, non-admin creation is a product decision, not an oversight.
  **`reference/actions.ts` must stay POLYMORPHIC.** Its `RefKind` is `"variety" | "vineyard"` — one global
  entity, one vineyard-scoped — so a blanket `adminAction` would be wrong in the OTHER direction, locking
  managers out of their own vineyard. Its gate resolves per kind (variety → admin, vineyard → D9
  membership, any create → admin), and the module is listed in VINEYARD-1's guard as well because it
  mutates Vineyard rows — a gap the first VINEYARD-1 sweep missed, since the module name gives no hint.
  **Folded in: the regulatory case.** `upsertTenantProductFacts` writes `worstCaseReiHours` /
  `worstCasePhiDays` / repeat-interval / max-applications — worker re-entry and pre-harvest intervals,
  snapshotted onto every later spray record — and was gated by `requireReadyUser()` alone. That is the
  **authorization side of PEST-1** (critical): PEST-1 stops the DATA path from rendering an unknown as a
  clearance, but an unprivileged user could reach the same outcome by typing a number. Enforced against
  bad data, not against bad authorization. `TenantProductFacts` has no vineyard column, so the fence is
  the admin role, not D9.

## Tenancy — every foreign key is declared somewhere machine-readable (FK-1)

> Machine-readable note: [[FK-1-every-foreign-key-is-declared]]. Guarded by `npm run verify:fk-registry` + `verify:fk-registry-db`.

- **A reference column is a Prisma relation, a declared composite constraint, or an explicit soft
  reference — never none of the three (FK-1, high, app-code + db-constraint).** Cross-tenant-risk FKs are
  composite `(tenantId, refId) → (tenantId, id)`, which makes a cross-tenant reference **structurally
  impossible** — a property worth keeping. But **Prisma cannot express it**, so those FKs live in
  hand-written migration SQL and 42% of models (79 of 188) carry reference columns with no `@relation`.
  Before this invariant, **291 composite constraints existed only as lines inside 186 migration files**:
  nothing checked that a new `*Id` column ever got its constraint, or that a dropped one was noticed, and
  `prisma migrate diff` is documented broken on this schema. A new table could ship with a dangling
  reference column and the whole suite would pass.
  **The proof is three parts.** `gen:fk-registry` replays the migration history tracking ADD/DROP and
  emits the final graph to `prisma/fk-registry.json` (435 constraints; the first run applied **20 drops**,
  so replay was necessary rather than defensive). `verify:fk-registry` asserts every schema reference
  column is declared. `verify:fk-registry-db` proves the registry matches `pg_constraint` **including
  column order** — `(tenantId, lotId)` ≠ `(lotId, tenantId)` — because the parse is the weak link and only
  the database can falsify it. The runtime proof deliberately does NOT auto-rewrite the registry: adopting
  whatever the DB says would turn a detected drift into a laundered one.
  **A foreign key is sometimes impossible, not merely absent.** Actor snapshots (`createdById`,
  `actorUserId`, …) point at the GLOBAL `user` table, where a composite FK cannot exist (no `tenantId`)
  and a simple one would make an account undeletable while history mentions it. External identifiers and
  correlation keys point at nothing. ⚠️ `locationId` is exempted **per column, not by name** — it is a
  genuine composite FK on `cellar_material`/`supply_lot` and a documented plain ref on four other tables,
  so a name-based rule would have excused the real ones.
  **85 columns sit on a shrink-only baseline** (`prisma/fk-baseline.json`) — each a pending decision, not
  an accepted state. The guard fails on a stale entry too, so the ratchet can only tighten.

## Observability — a returned error is a reported error (ERRCAP-1)

> Machine-readable note: [[ERRCAP-1-a-returned-error-is-a-reported-error]]. Guarded by `npm run verify:error-capture`.

- **A `catch` that RETURNS the caught error's message must also CAPTURE it (ERRCAP-1, high,
  app-code).** 40 sites did `catch (e) { return { error: e.message } }` and there were **5**
  `captureException` calls in the whole of `src/`. It reads like careful defensive hygiene; it is the
  opposite — the caller gets a string, the incident leaves no trace, and no engineer ever learns it
  happened. `NOW.md` records the consequence **twice in one week** — *"an error path that logs nothing
  is itself the P0"* — once for the assistant, where a turn that died server-side left only an ABSENCE
  as evidence, and once for the OAuth/Sentry tunnel.
  **The rule is capture, not redact**, and deliberately so. Leaking internals is a real second defect,
  but a blanket redaction rule would be wrong in both directions: a **cron** body lands in cron logs
  where the message is the only diagnostic an on-call human gets, while a **browser-facing** route must
  never emit a Prisma error that names tables, columns and constraints. What is invariant across both
  is that the error reaches Sentry — so that is what the guard asserts, and redaction stays a
  per-surface choice expressed by picking a helper: `settleWithCapture` (server actions, redacts),
  `routeError` (browser routes, redacts, 500) or `cronError` (cron, keeps the message). All three lead
  with `unstable_rethrow` (REDIRECT-1) and pass an **expected** `ActionError` through verbatim without
  capturing — a refusal is not a bug, and capturing refusals buries the real failures in noise.
  **This makes `Error` vs `ActionError` load-bearing rather than stylistic**, because the helpers branch
  on it. The upload and assistant routes had thrown both classes as plain `Error` into one `catch` and
  answered `400` for both, so a blob-store outage was reported to the user as a validation problem and
  to Sentry not at all; the 19 deliberate, user-facing throws behind them are now `ActionError`s with
  codes, and `routeError` maps the code to the status it implies (`FORBIDDEN` → 403, `CONFLICT` → 409).
  **16 sites sit on a shrink-only baseline** (`prisma/error-capture-baseline.json`), down from the 34 it
  opened at — anchored on **file → count**, not `file:line`, because line anchors churn on every
  unrelated edit above a baselined catch and a guard whose diff nobody reads is a guard that stops
  working. `cronAuthorized` landed with it: the constant-time bearer gate had been **inlined
  identically in all 13 cron routes**, and every copy being correct is exactly what made it dangerous —
  nothing forced a 14th route to include one, and a cron endpoint without the gate is an
  unauthenticated way to trigger a tenant-wide sweep.
## Money — a currency conversion is currency-checked (MONEY-1)

> Machine-readable note: [[MONEY-1-a-conversion-is-currency-checked]]. Guarded by `npm run verify:money-fx`.

- **An FX conversion goes through `FxQuote`, and `src/lib/money/**` computes money in `Prisma.Decimal`
  (MONEY-1, high, app-code).** Two defects, and only one of them was arithmetic.
  **The float one, measured.** `convertToBase` was `round2(amountForeign * rate)`. Over a sweep of
  **1,400,000** realistic pairs (cent-scale amounts × seven real ECB rates) the float path disagrees with
  exact decimal on **447 — 0.032%, about 1 in 3,100** — always by a cent, always downward: `11 × 1.085`
  is 11.935 on the nose and came out **11.93**. That is the "cents" grain, the one reconciled against
  QBO's derived home GL debit, so one line in 3,100 is an A/P reconciliation that silently fails to
  balance. ⚠️ **Stated honestly: the `round8` per-unit grain showed 0 of 1,400,000 disagreements** — the
  `Math.round(n * 1e8)` MAX_SAFE_INTEGER hazard needs n above ~90,000,000 to bite. It was converted for
  uniformity, not for an observed bug. The old code also imported `round2` from `@/lib/bottling/draw` —
  money was borrowing the **volume** rounder, which is the tell the guard now forbids.
  **The structural one, which is why the type exists.** `convertToBase(amount: number, rate: number)`
  cannot tell what currency the amount is in, so nothing stopped converting an already-base figure twice
  or applying a NZD→USD rate to a EUR one — and **the result of either is a plausible number**. No
  exception, no bad total, just a wrong one. `FxQuote` carries base, foreign, an exact Decimal rate, the
  quote date and the source; `convert` refuses anything not in `foreign` and names the double-conversion
  case specifically, because that is the likely one.
  **Three consequences worth knowing.** (a) An unsupported currency now THROWS (`requireCurrency`) rather
  than defaulting to USD — `coerceCurrency`'s forgiveness is right for a display symbol and wrong for
  arithmetic, and `ingest-invoice-core.ts` had to hand-roll that gate. (b) A same-currency quote must be
  exactly 1 (a feed round-trip really returns `0.99999998` for X→X); `FxQuote.identity()` is a true
  pass-through, which is what lets the ingest call site drop its `isForeign ?` ternary safely rather than
  luckily. (c) **Σ round(line) ≠ round(Σ line) in exact decimal too** — `0.10 × 0.05` three times is 0.03
  per line and 0.02 as one total. That is a posting decision, not a bug, so `convert` and
  `convertUnsettled` are separate methods instead of one implicit default.
  ⚠️ **`inverse()` is display-only, and the measurements are the argument**: over 20,000 cent-scale
  amounts it round-trips wrong **0 times at 1.085, 7,538 times at 0.6231** (an ordinary USD-per-NZD), and
  **19,870 times at 0.00654** — where small amounts convert to `0.00` and are simply gone. It is exact at
  some rates and lossy at others, so "it worked when I tried it" proves nothing.
  ⚠️ **NOT covered, and deliberately so — the next stage of workstream B.** `src/lib/cost/` is float
  throughout (`round8(totalCost + extended)`, `round8(sum)`, `round8(amt * f)`) and **accumulation** is
  where drift compounds, so it is the bigger fish. `src/lib/ingest/landed-cost.ts` allocates freight with
  float `round2` plus a residual swept onto the last priced line to make Σ tie — which is exactly what
  `Amount.allocateByWeights` already does exactly, so it is a direct swap. `src/lib/accounting/` likewise.
  The `convertToBase` allow-list is shrink-only and currently **empty**, and the guard fails on a stale
  entry too.
