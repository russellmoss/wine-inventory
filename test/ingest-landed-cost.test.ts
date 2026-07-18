import { describe, it, expect } from "vitest";
import { allocateLandedCost, allocatableCharges } from "@/lib/ingest/landed-cost";
import { parsePackagingUnit, normalizeLineToStock } from "@/lib/ingest/normalize-line";

// Plan 072 Unit 5 (MONEY-CRITICAL): landed-cost allocation + UOM normalization. These prove the two facts
// that keep inventory + cost correct: (1) charges are absorbed proportionally with EXACT conservation, and
// (2) an invoice line in "2 × 25 kg" becomes 50000 g at the freight-inclusive per-g cost — never qty=2.

describe("allocatableCharges — tax excluded", () => {
  it("sums shipping + handling + surcharge, excludes tax", () => {
    expect(allocatableCharges({ shipping: 100, handling: 20, surcharge: 5, tax: 50 })).toBe(125);
  });
  it("treats missing/negative as zero", () => {
    expect(allocatableCharges({ shipping: 40 })).toBe(40);
    expect(allocatableCharges({ shipping: -10, handling: null })).toBe(0);
    expect(allocatableCharges(null)).toBe(0);
  });
});

describe("allocateLandedCost — proportional split + conservation", () => {
  it("splits charges by subtotal and conserves to the cent (residual on last priced line)", () => {
    const res = allocateLandedCost([300, 100], { shipping: 40 });
    // 40 split 3:1 → 30 / 10
    expect(res[0]).toEqual({ allocatedCharge: 30, landedLineTotal: 330 });
    expect(res[1]).toEqual({ allocatedCharge: 10, landedLineTotal: 110 });
    const totalCharge = res.reduce((a, r) => a + (r.allocatedCharge ?? 0), 0);
    expect(totalCharge).toBe(40); // exact conservation
  });

  it("rounding residual lands on the last priced line so the sum ties exactly", () => {
    // 3 equal lines, $10 shipping → 3.33 each rounds to 9.99; residual 0.01 → last line 3.34
    const res = allocateLandedCost([100, 100, 100], { shipping: 10 });
    const charges = res.map((r) => r.allocatedCharge);
    expect(charges[0]).toBe(3.33);
    expect(charges[1]).toBe(3.33);
    expect(charges[2]).toBe(3.34); // absorbs the residual cent
    expect(charges.reduce<number>((a, b) => a + (b ?? 0), 0)).toBe(10);
  });

  it("zero charges → passthrough (landed = subtotal)", () => {
    const res = allocateLandedCost([50, 25], { shipping: 0 });
    expect(res).toEqual([
      { allocatedCharge: 0, landedLineTotal: 50 },
      { allocatedCharge: 0, landedLineTotal: 25 },
    ]);
  });

  it("single line absorbs all charges", () => {
    expect(allocateLandedCost([200], { shipping: 15, handling: 5 })).toEqual([{ allocatedCharge: 20, landedLineTotal: 220 }]);
  });

  it("unknown-price line (null subtotal) absorbs NO charge and stays unknown (D14)", () => {
    const res = allocateLandedCost([100, null], { shipping: 20 });
    expect(res[0]).toEqual({ allocatedCharge: 20, landedLineTotal: 120 }); // all charge to the known line
    expect(res[1]).toEqual({ allocatedCharge: null, landedLineTotal: null }); // never fabricated $0
  });

  it("all-unknown or zero base → no fabricated costs", () => {
    expect(allocateLandedCost([null, null], { shipping: 20 })).toEqual([
      { allocatedCharge: null, landedLineTotal: null },
      { allocatedCharge: null, landedLineTotal: null },
    ]);
  });
});

describe("parsePackagingUnit", () => {
  it("splits a compound package unit into amount + base unit", () => {
    expect(parsePackagingUnit("25 kg")).toEqual({ amount: 25, unit: "kg" });
    expect(parsePackagingUnit("500 g")).toEqual({ amount: 500, unit: "g" });
    expect(parsePackagingUnit("kg")).toEqual({ amount: 1, unit: "kg" });
    expect(parsePackagingUnit("")).toEqual({ amount: 1, unit: "" });
  });
  it("normalizes count synonyms to the canonical unit", () => {
    expect(parsePackagingUnit("ea")).toEqual({ amount: 1, unit: "unit" });
    expect(parsePackagingUnit("each")).toEqual({ amount: 1, unit: "unit" });
    expect(parsePackagingUnit("12 pcs")).toEqual({ amount: 12, unit: "unit" });
  });
});

describe("normalizeLineToStock — invoice UOM → stock unit + per-stock-unit cost", () => {
  it("'2 × 25 kg' into a g-stock material → 50000 g at the freight-inclusive per-g cost", () => {
    // 2 packages of 25 kg = 50 kg = 50000 g. landedLineTotal $100 → $0.002/g.
    const r = normalizeLineToStock({ qty: 2, unit: "25 kg", landedLineTotal: 100, stockUnit: "g" });
    expect(r.stockQty).toBe(50000);
    expect(r.unitCost).toBe(0.002);
    expect(r.dimensionMismatch).toBe(false);
  });

  it("simple '500 g' line, stock unit g", () => {
    const r = normalizeLineToStock({ qty: 500, unit: "g", landedLineTotal: 25, stockUnit: "g" });
    expect(r.stockQty).toBe(500);
    expect(r.unitCost).toBe(0.05);
  });

  it("cross-dimension unit (kg into a mL-stock material) is FLAGGED, never silently passed", () => {
    const r = normalizeLineToStock({ qty: 2, unit: "25 kg", landedLineTotal: 100, stockUnit: "mL" });
    expect(r.dimensionMismatch).toBe(true);
    expect(r.stockQty).toBeNull();
    expect(r.unitCost).toBeNull();
  });

  it("unknown price → unknown unitCost (D14) but quantity still normalizes", () => {
    const r = normalizeLineToStock({ qty: 1, unit: "1 kg", landedLineTotal: null, stockUnit: "g" });
    expect(r.stockQty).toBe(1000);
    expect(r.unitCost).toBeNull();
    expect(r.dimensionMismatch).toBe(false);
  });

  it("non-positive qty yields no stock (not a dimension error)", () => {
    const r = normalizeLineToStock({ qty: 0, unit: "kg", landedLineTotal: 10, stockUnit: "g" });
    expect(r.stockQty).toBeNull();
    expect(r.unitCost).toBeNull();
    expect(r.dimensionMismatch).toBe(false);
  });
});
