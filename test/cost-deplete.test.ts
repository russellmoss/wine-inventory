import { describe, it, expect } from "vitest";
import { planDepletion, weightedAvgUnitCost, type SupplyLotView } from "@/lib/cost/deplete";

// Unit 3 — the supply-depletion planner (WA / FIFO lot selection + cost + completeness). Pure.

const lot = (id: string, qtyRemaining: number, unitCost: number | null, receivedAt: number): SupplyLotView => ({
  id,
  qtyRemaining,
  unitCost,
  receivedAt,
});

describe("weightedAvgUnitCost", () => {
  it("weights by remaining quantity across known-cost lots", () => {
    // 100g @ $0.02 + 300g @ $0.06 = (2 + 18)/400 = $0.05/g
    expect(weightedAvgUnitCost([lot("a", 100, 0.02, 1), lot("b", 300, 0.06, 2)])).toBe(0.05);
  });
  it("ignores unknown-cost lots in the average, null when none known", () => {
    expect(weightedAvgUnitCost([lot("a", 100, null, 1), lot("b", 100, 0.04, 2)])).toBe(0.04);
    expect(weightedAvgUnitCost([lot("a", 100, null, 1)])).toBeNull();
  });
});

describe("planDepletion — FIFO", () => {
  it("draws oldest-first and prices each slice at that lot's own cost", () => {
    // Consume 250g. FIFO: 100g from a ($0.02) + 150g from b ($0.06) = 2 + 9 = $11.
    const plan = planDepletion([lot("a", 100, 0.02, 1), lot("b", 300, 0.06, 2)], 250, "FIFO");
    expect(plan.lines).toEqual([
      { supplyLotId: "a", qty: 100, unitCost: 0.02, extendedCost: 2 },
      { supplyLotId: "b", qty: 150, unitCost: 0.06, extendedCost: 9 },
    ]);
    expect(plan.totalCost).toBe(11);
    expect(plan.drawn).toBe(250);
    expect(plan.shortfall).toBe(0);
    expect(plan.completeness).toBe("KNOWN");
  });

  it("an unknown-cost lot in the draw makes the basis PARTIAL, no phantom $0", () => {
    const plan = planDepletion([lot("a", 100, 0.02, 1), lot("b", 300, null, 2)], 250, "FIFO");
    expect(plan.completeness).toBe("PARTIAL");
    expect(plan.lines[1].extendedCost).toBeNull(); // the unknown slice contributes no phantom cost
    expect(plan.totalCost).toBe(2); // only the known slice
  });
});

describe("planDepletion — WEIGHTED_AVG", () => {
  it("prices every slice at the on-hand weighted-average rate", () => {
    // On-hand: 100g @ $0.02 + 300g @ $0.06 → WA $0.05/g. Consume 250g → 250 × 0.05 = $12.50.
    const plan = planDepletion([lot("a", 100, 0.02, 1), lot("b", 300, 0.06, 2)], 250, "WEIGHTED_AVG");
    expect(plan.totalCost).toBe(12.5);
    expect(plan.lines.every((l) => l.unitCost === 0.05)).toBe(true);
    expect(plan.completeness).toBe("KNOWN");
  });

  it("any unknown-cost on-hand lot taints WA completeness to UNKNOWN/PARTIAL", () => {
    const plan = planDepletion([lot("a", 100, 0.02, 1), lot("b", 300, null, 2)], 150, "WEIGHTED_AVG");
    // WA rate computed over the known lot ($0.02), but an unknown lot is on hand → tainted.
    expect(plan.completeness).not.toBe("KNOWN");
  });
});

describe("planDepletion — shortfall (D14: zero/low stock records as unknown-cost)", () => {
  it("reports the unsourced quantity and taints completeness", () => {
    const plan = planDepletion([lot("a", 100, 0.02, 1)], 250, "FIFO");
    expect(plan.drawn).toBe(100);
    expect(plan.shortfall).toBe(150);
    expect(plan.completeness).not.toBe("KNOWN"); // shortfall is unknown-cost
  });

  it("empty stock → full shortfall, UNKNOWN", () => {
    const plan = planDepletion([], 50, "WEIGHTED_AVG");
    expect(plan.drawn).toBe(0);
    expect(plan.shortfall).toBe(50);
    expect(plan.lines).toHaveLength(0);
    expect(plan.completeness).toBe("UNKNOWN");
  });

  it("zero requested qty is a no-op", () => {
    const plan = planDepletion([lot("a", 100, 0.02, 1)], 0, "FIFO");
    expect(plan.lines).toHaveLength(0);
    expect(plan.completeness).toBe("KNOWN");
  });
});
