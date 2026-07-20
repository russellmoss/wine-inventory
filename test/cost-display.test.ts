import { describe, it, expect } from "vitest";
import { summarizeConsumableCost, type ConsumableCostShipment } from "@/lib/cost/cost-display";
import { weightedAvgUnitCost } from "@/lib/cost/intake-cost";

// Feedback #372 ("pricing") — Mike: "I don't see the price I entered" + "are we averaging across shipments?".
// The fix SURFACES what receipts already booked. These lock the two things the UI now claims: (1) the price
// shown per shipment IS the receipt's unitCost, and (2) the single "cost" figure IS the weighted average of
// those prices across the shipments still in stock — the SAME number the depletion engine draws at (COST-1).

const ship = (unitCost: number | null, qtyReceived: number, qtyRemaining: number): ConsumableCostShipment => ({ unitCost, qtyReceived, qtyRemaining });

describe("summarizeConsumableCost — surfacing receipt price + weighted average (#372)", () => {
  it("averages two shipments at different prices, weighted by remaining qty — the reported ask", () => {
    // Shipment 1: 100 units @ $2 ; shipment 2: 300 units @ $6, both fully in stock.
    const shipments = [ship(2, 100, 100), ship(6, 300, 300)];
    const s = summarizeConsumableCost(shipments);
    // (100×2 + 300×6) / 400 = 2000/400 = 5.00
    expect(s.weightedAvgUnitCost).toBe(5);
    expect(s.pricedShipmentCount).toBe(2);
    expect(s.unpricedShipmentCount).toBe(0);
    // The per-shipment prices the panel shows ARE the receipts (nothing invented).
    expect(shipments.map((x) => x.unitCost)).toEqual([2, 6]);
  });

  it("the summarized average is EXACTLY the engine's weightedAvgUnitCost (one source of truth, COST-1)", () => {
    const shipments = [ship(1.25, 40, 40), ship(3.5, 10, 7), ship(9, 5, 5)];
    expect(summarizeConsumableCost(shipments).weightedAvgUnitCost).toBe(weightedAvgUnitCost(shipments));
  });

  it("weights by REMAINING qty — a mostly-depleted expensive shipment barely moves the average", () => {
    // 500 units @ $1 remaining, plus only 1 unit left of a $100 shipment.
    const s = summarizeConsumableCost([ship(1, 500, 500), ship(100, 20, 1)]);
    // (500×1 + 1×100) / 501 = 600/501 ≈ 1.1976...
    expect(s.weightedAvgUnitCost).toBeCloseTo(600 / 501, 8);
    expect(s.pricedShipmentCount).toBe(2);
  });

  it("a fully-depleted shipment drops out of the average and the in-stock counts", () => {
    // Shipment 1 drawn to zero; only shipment 2 remains → the average is shipment 2's price alone.
    const s = summarizeConsumableCost([ship(2, 100, 0), ship(6, 300, 300)]);
    expect(s.weightedAvgUnitCost).toBe(6);
    expect(s.pricedShipmentCount).toBe(1);
  });

  it("in-stock shipments with NO price are counted as unpriced and EXCLUDED from the average (COST-2, never $0)", () => {
    const s = summarizeConsumableCost([ship(2, 100, 100), ship(null, 50, 50)]);
    expect(s.weightedAvgUnitCost).toBe(2); // the $0-price shipment does NOT drag it to ~1.33
    expect(s.pricedShipmentCount).toBe(1);
    expect(s.unpricedShipmentCount).toBe(1);
  });

  it("no priced stock → unknown cost (null), never a fabricated $0", () => {
    const s = summarizeConsumableCost([ship(null, 50, 50), ship(-3, 10, 10)]);
    expect(s.weightedAvgUnitCost).toBeNull();
    expect(s.pricedShipmentCount).toBe(0);
    expect(s.unpricedShipmentCount).toBe(2); // both are in stock but carry no usable price
  });

  it("empty / no shipments → null cost and zero counts", () => {
    const s = summarizeConsumableCost([]);
    expect(s).toEqual({ weightedAvgUnitCost: null, pricedShipmentCount: 0, unpricedShipmentCount: 0 });
  });
});
