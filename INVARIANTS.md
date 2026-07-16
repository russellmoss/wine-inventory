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

### Enforced in pure code (and asserted in tests)
6. **Balanced operations.** For every operation, `sum(deltaL) == 0` across all its lines
   (in-vessel + external). `assertBalanced()`.
7. **Projection == fold of the ledger.** `VesselLot` always equals `foldLines()` over the
   full operation history. `scripts/verify-projection.ts` recomputes and diffs; any drift
   is a bug, not a tolerated state.
8. **No fabricated volume.** A residual at/below `FUNCTIONAL_ZERO_L` (0.01 L, centiliter
   granularity) is swept to zero (the row drops); balances never accumulate "dust".
9. **Decimal-safe math.** All volume arithmetic uses centiliter-integer / `Prisma.Decimal`
   helpers (`computeProportionalDraw`, `round2`) — never raw `parseFloat`/IEEE-754, which
   would randomly break invariant #6.

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

## Work orders — Phase 9 / 9.1 (WORKORDER-1..6)
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
