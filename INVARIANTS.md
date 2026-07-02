# Ledger Invariants — Lot + Operation Ledger

> The rules the bulk-wine ledger must never violate. The ledger is the **source of
> truth**; the `VesselLot` projection is a transactional fold of it. From VISION §3 +
> the locked decisions D2/D6/D14/D15. Tests live in `test/ledger-math.test.ts` (pure)
> and `test/ledger-projection.test.ts` + `test/ledger-concurrency.test.ts` (DB).

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
- **Lot identity excludes vintage** (D3); vintage is an attribute. Lot provenance
  metadata (`code`, origin, `vintageYear`) is **immutable after the first operation**.
- Every operation carries a **monotonic `sequence`** (deterministic fold ordering —
  `occurredAt` timestamps collide and clocks drift), plus `observedAt`/`enteredAt`/
  `enteredBy`/`captureMethod` provenance (D14).

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
