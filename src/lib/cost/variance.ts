// Phase 8b (Unit 13, D12/D17) — post-bottling cost variance: PURE math, unit-tested directly. When a
// backdated correction changes a bottled lot's cost basis AFTER its COGS snapshot froze, we NEVER
// silently restate the snapshot (D4 — it stays immutable). Instead we emit an explicit, auditable
// variance that splits the per-bottle delta across bottles that have LEFT inventory (sold/consumed →
// a period COGS variance) and bottles STILL on hand (→ an inventory-value adjustment). This is the
// GAAP-defensible sold/unsold split (council C5): you can't recapitalize wine you already shipped.
//
// "Sold" has no dedicated sales ledger yet (StockMovement models RECEIVE/ADJUST/TRANSFER, not SALE), so
// sold/removed is derived honestly as goodBottles − onHandBottles (bottles that left inventory). When a
// real sales ledger lands, this input sharpens with no reshape.

const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

export type BottlingVarianceInput = {
  /** the frozen snapshot's cost-per-bottle (cents). */
  frozenCostPerBottle: number;
  /** the recomputed cost-per-bottle under the corrected basis (cents). */
  newCostPerBottle: number;
  /** bottles the run yielded (the snapshot's goodBottles). */
  goodBottles: number;
  /** bottles STILL on hand for this SKU (from BottledInventory). */
  onHandBottles: number;
};

export type BottlingVarianceResult = {
  deltaPerBottle: number;
  soldBottles: number; // goodBottles − onHand, clamped ≥ 0
  onHandBottles: number;
  soldDelta: number; // → period COGS variance (already-shipped bottles)
  unsoldDelta: number; // → on-hand inventory-value adjustment
  totalDelta: number; // soldDelta + unsoldDelta
};

/**
 * Split the post-bottling cost delta across sold vs on-hand bottles. Sold bottles = goodBottles −
 * onHand (never negative, and never more than goodBottles). The frozen snapshot is untouched; this is
 * the delta an explicit variance event records. A zero delta yields zeros (caller skips emitting).
 */
export function computeBottlingVariance(input: BottlingVarianceInput): BottlingVarianceResult {
  const deltaPerBottle = round8(input.newCostPerBottle - input.frozenCostPerBottle);
  const onHand = Math.max(0, Math.min(input.goodBottles, Math.floor(input.onHandBottles)));
  const soldBottles = Math.max(0, input.goodBottles - onHand);
  const soldDelta = round8(deltaPerBottle * soldBottles);
  const unsoldDelta = round8(deltaPerBottle * onHand);
  return {
    deltaPerBottle,
    soldBottles,
    onHandBottles: onHand,
    soldDelta,
    unsoldDelta,
    totalDelta: round8(soldDelta + unsoldDelta),
  };
}
