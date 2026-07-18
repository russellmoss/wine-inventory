import { describe, it, expect } from "vitest";
import { deriveOpeningLot, costPerPackageUnit, costForUse } from "@/lib/cost/intake-cost";
import { round8 } from "@/lib/cost/rollup";
import { convert, type ExtraUnits } from "@/lib/units/measure";
import { normalizeLineToStock } from "@/lib/ingest/normalize-line";

describe("deriveOpeningLot", () => {
  it("1-gallon package for $10, stockUnit mL → qty in mL + per-mL cost", () => {
    const r = deriveOpeningLot({ packageAmount: 1, packageUnit: "gal", totalCost: 10, stockUnit: "mL" });
    expect(r.qtyInStockUnit).toBe(3785.411784);
    expect(r.unitCost).toBe(round8(10 / 3785.411784));
  });

  it("100-gallon drum for $500, stockUnit mL", () => {
    const r = deriveOpeningLot({ packageAmount: 100, packageUnit: "gal", totalCost: 500, stockUnit: "mL" });
    expect(r.qtyInStockUnit).toBe(378541.1784);
    expect(r.unitCost).toBe(round8(500 / 378541.1784));
  });

  it("mass: a 25 lb bag for $50, stockUnit g", () => {
    const r = deriveOpeningLot({ packageAmount: 25, packageUnit: "lb", totalCost: 50, stockUnit: "g" });
    expect(r.qtyInStockUnit).toBe(round8(25 * 453.59237));
    expect(r.unitCost).toBe(round8(50 / (25 * 453.59237)));
  });

  it("cross-dimension package (gal into a g stock) → unknown (D14), no fabricated cost", () => {
    const r = deriveOpeningLot({ packageAmount: 1, packageUnit: "gal", totalCost: 10, stockUnit: "g" });
    expect(r.qtyInStockUnit).toBeNull();
    expect(r.unitCost).toBeNull();
  });

  it("missing/zero cost → known qty but unknown unitCost", () => {
    const r = deriveOpeningLot({ packageAmount: 1, packageUnit: "gal", totalCost: null, stockUnit: "mL" });
    expect(r.qtyInStockUnit).toBe(3785.411784);
    expect(r.unitCost).toBeNull();
  });

  it("count units pass through (unit → unit)", () => {
    const r = deriveOpeningLot({ packageAmount: 500, packageUnit: "unit", totalCost: 175, stockUnit: "unit" });
    expect(r.qtyInStockUnit).toBe(500);
    expect(r.unitCost).toBe(round8(175 / 500)); // $0.35 each
  });
});

describe("costPerPackageUnit", () => {
  it("total / package amount", () => {
    expect(costPerPackageUnit(500, 100)).toBe(5); // $5/gallon on a 100-gal drum
    expect(costPerPackageUnit(null, 100)).toBeNull();
    expect(costPerPackageUnit(500, 0)).toBeNull();
  });
});

describe("costForUse", () => {
  it("a 2 fl oz use of a per-mL-priced liquid is costed via conversion", () => {
    const { unitCost } = deriveOpeningLot({ packageAmount: 1, packageUnit: "gal", totalCost: 10, stockUnit: "mL" });
    const cost = costForUse({ unitCost, useAmount: 2, useUnit: "fl oz", stockUnit: "mL" });
    // 2 fl oz = 59.147 mL; of a 3785.41 mL gallon that cost $10 → ~$0.15625
    expect(cost).toBe(round8(convert(2, "fl oz", "mL")! * unitCost!));
  });

  it("unknown unit cost or cross-dimension use → null", () => {
    expect(costForUse({ unitCost: null, useAmount: 2, useUnit: "fl oz", stockUnit: "mL" })).toBeNull();
    expect(costForUse({ unitCost: 0.01, useAmount: 2, useUnit: "oz", stockUnit: "mL" })).toBeNull(); // mass use, volume stock
  });
});

describe("custom units in intake cost (plan 075)", () => {
  const extraUnits: ExtraUnits = {
    drum: { dimension: "mass", perCanonical: 200000 }, // 200 kg / drum
  };

  it("a 'drum' (200 kg) invoice line costs correctly per canonical gram", () => {
    // 2 drums for $400 → 400000 g at $0.001/g. Registry MUST be passed, else it falls to UNKNOWN.
    const withReg = deriveOpeningLot({ packageAmount: 2, packageUnit: "drum", totalCost: 400, stockUnit: "g", extraUnits });
    expect(withReg.qtyInStockUnit).toBe(400000);
    expect(withReg.unitCost).toBe(round8(400 / 400000));
  });

  it("an UNRESOLVED custom unit degrades to UNKNOWN cost, never a fabricated number (D14)", () => {
    const noReg = deriveOpeningLot({ packageAmount: 2, packageUnit: "drum", totalCost: 400, stockUnit: "g" });
    expect(noReg.qtyInStockUnit).toBeNull();
    expect(noReg.unitCost).toBeNull();
  });

  it("normalizeLineToStock converts a custom pack unit end-to-end", () => {
    // invoice: 2 lines of "1 drum" each, landed $400 total → 400000 g at $0.001/g.
    const norm = normalizeLineToStock({ qty: 2, unit: "drum", landedLineTotal: 400, stockUnit: "g", extraUnits });
    expect(norm.stockQty).toBe(400000);
    expect(norm.unitCost).toBe(round8(400 / 400000));
    expect(norm.dimensionMismatch).toBe(false);
    // without the registry the same line is a flagged mismatch (never a silent raw-qty pass-through).
    const bad = normalizeLineToStock({ qty: 2, unit: "drum", landedLineTotal: 400, stockUnit: "g" });
    expect(bad.stockQty).toBeNull();
    expect(bad.dimensionMismatch).toBe(true);
  });
});
