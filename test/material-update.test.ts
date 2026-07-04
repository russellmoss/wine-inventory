import { describe, it, expect } from "vitest";
import {
  planMaterialUpdate,
  resolveUpdateStockUnit,
  deriveMaterialFields,
  findCorrectableOpeningLot,
  openingLotTotalCost,
  resolveOpeningCostCorrection,
  type ExistingMaterialForUpdate,
  type SupplyLotForCost,
} from "@/lib/cellar/material-fields";
import { weightedAvgUnitCost } from "@/lib/cost/intake-cost";
import { ActionError } from "@/lib/action-error";

// Phase 037: the pure decision logic behind editing an existing material's base data (updateMaterialCore
// delegates to these). The DB-level bits (the actual collision query, the audit row, no-re-cost of lots)
// are proven by the page's revalidate + manual QA / verify scripts; here we lock the branches that decide
// WHAT gets written and WHEN an edit is refused.

// A stock-tracked additive with grams on hand: gram stock unit, "Bentonite" identity under the FINING family.
const existingBentonite: ExistingMaterialForUpdate = {
  kind: "FINING",
  normalizedKey: "BENTONITE",
  stockUnit: "g",
};

const baseInput = {
  genericName: "Bentonite",
  brandName: "",
  category: "ADDITIVE",
  kind: "Fining",
  packageAmount: 25,
  packageUnit: "kg",
};

describe("planMaterialUpdate — free-tier (display / supplier) edits", () => {
  it("persists a corrected vendor URL + brand without changing identity", () => {
    const plan = planMaterialUpdate(
      existingBentonite,
      { ...baseInput, brand: "Scott Labs", vendorUrl: "scottlab.com/bentonite" },
      /* hasLots */ true,
    );
    expect(plan.fields.brand).toBe("Scott Labs");
    expect(plan.fields.vendorUrl).toBe("https://scottlab.com/bentonite"); // bare domain → https
    expect(plan.identityChanged).toBe(false); // vendor/brand don't move the (kind, normalizedKey) key
  });

  it("drops a javascript: vendor URL (defense-in-depth, matches create)", () => {
    const plan = planMaterialUpdate(
      existingBentonite,
      { ...baseInput, vendorUrl: "javascript:alert(1)" },
      true,
    );
    expect(plan.fields.vendorUrl).toBeNull();
  });

  it("preferGeneric + generic/brand names are written through", () => {
    const plan = planMaterialUpdate(
      existingBentonite,
      { ...baseInput, brandName: "Bentonite", preferGeneric: false },
      true,
    );
    expect(plan.fields.preferGeneric).toBe(false);
    expect(plan.fields.genericName).toBe("Bentonite");
  });
});

describe("planMaterialUpdate — category is the stored cost-safety authority", () => {
  it("re-categorizing to CLEANING_SANITIZING persists that stored category verbatim", () => {
    // The execute-seam WORKORDER-3 guard reads this stored category via isDoseableCategory, so persisting
    // CLEANING_SANITIZING is exactly what stops the material from being dosed into wine afterward.
    const plan = planMaterialUpdate(
      existingBentonite,
      { ...baseInput, category: "CLEANING_SANITIZING", kind: "Cleaning" },
      false,
    );
    expect(plan.fields.category).toBe("CLEANING_SANITIZING");
  });

  it("an unknown category coerces to OTHER (never silently doseable-by-accident)", () => {
    const plan = planMaterialUpdate(existingBentonite, { ...baseInput, category: "BOGUS" }, false);
    expect(plan.fields.category).toBe("OTHER");
  });
});

describe("planMaterialUpdate — identity change flags the unique re-check", () => {
  it("changing the family (kind) flags identityChanged", () => {
    const plan = planMaterialUpdate(existingBentonite, { ...baseInput, kind: "Bentonite" }, false);
    expect(plan.fields.kind).toBe("BENTONITE");
    expect(plan.identityChanged).toBe(true);
  });

  it("changing the product name flags identityChanged", () => {
    const plan = planMaterialUpdate(existingBentonite, { ...baseInput, genericName: "Sodium Bentonite" }, false);
    expect(plan.identityChanged).toBe(true);
  });
});

describe("planMaterialUpdate — stock-unit fences", () => {
  it("refuses a cross-dimension unit change (mass → volume) while stock is on hand", () => {
    let err: unknown;
    try {
      planMaterialUpdate(existingBentonite, { ...baseInput, packageUnit: "gal" }, /* hasLots */ true);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ActionError);
    expect((err as ActionError).code).toBe("CONFLICT");
  });

  it("allows a same-dimension unit change while stock is on hand; stock unit stays pinned", () => {
    const plan = planMaterialUpdate(existingBentonite, { ...baseInput, packageUnit: "lb" }, true);
    expect(plan.fields.packageUnit).toBe("lb");
    expect(plan.fields.stockUnit).toBe("g"); // pinned to the existing canonical unit
  });

  it("with NO stock, a unit change re-derives the canonical stock unit from the package dimension", () => {
    const plan = planMaterialUpdate(existingBentonite, { ...baseInput, packageUnit: "gal" }, /* hasLots */ false);
    expect(plan.fields.stockUnit).toBe("mL"); // gal → volume → mL
  });
});

describe("resolveUpdateStockUnit", () => {
  it("pins to the current stock unit when lots exist", () => {
    expect(resolveUpdateStockUnit({ hasLots: true, currentStockUnit: "mL", packageUnit: "lb" })).toBe("mL");
  });
  it("derives from the package unit when no lots exist", () => {
    expect(resolveUpdateStockUnit({ hasLots: false, currentStockUnit: "g", packageUnit: "gal" })).toBe("mL");
    expect(resolveUpdateStockUnit({ hasLots: false, currentStockUnit: "g", packageUnit: "unit" })).toBe("unit");
  });
  it("falls back to the requested/current unit when the package unit is unknown", () => {
    expect(resolveUpdateStockUnit({ hasLots: false, currentStockUnit: "kg", packageUnit: null })).toBe("kg");
  });
});

describe("planMaterialUpdate — rejects empty identity", () => {
  it("throws when neither generic nor brand nor name is present", () => {
    expect(() =>
      planMaterialUpdate(existingBentonite, { genericName: "", brandName: "", category: "ADDITIVE", kind: "Fining" }, false),
    ).toThrow();
  });
});

describe("weightedAvgUnitCost — cost display (D14: unknown, never $0)", () => {
  it("weights by remaining quantity across priced lots", () => {
    // 100g @ $2 + 300g @ $1 → (100*2 + 300*1)/400 = 1.25
    expect(
      weightedAvgUnitCost([
        { qtyRemaining: 100, unitCost: 2 },
        { qtyRemaining: 300, unitCost: 1 },
      ]),
    ).toBe(1.25);
  });

  it("skips unknown-cost lots and non-positive quantities", () => {
    expect(
      weightedAvgUnitCost([
        { qtyRemaining: 100, unitCost: null }, // unknown cost → excluded, not $0
        { qtyRemaining: 0, unitCost: 5 }, // depleted → excluded
        { qtyRemaining: 50, unitCost: 4 },
      ]),
    ).toBe(4);
  });

  it("returns null when no priced stock remains", () => {
    expect(weightedAvgUnitCost([{ qtyRemaining: 100, unitCost: null }])).toBeNull();
    expect(weightedAvgUnitCost([])).toBeNull();
  });
});

describe("opening-lot cost correction (Phase 037.1)", () => {
  const lot = (o: Partial<SupplyLotForCost> & { id: string }): SupplyLotForCost => ({
    qtyReceived: 500, qtyRemaining: 500, unitCost: null, ...o,
  });

  describe("findCorrectableOpeningLot", () => {
    it("returns the single fully-unused lot", () => {
      const l = lot({ id: "a" });
      expect(findCorrectableOpeningLot([l])).toBe(l);
    });
    it("null when the lot has been partly consumed", () => {
      expect(findCorrectableOpeningLot([lot({ id: "a", qtyReceived: 500, qtyRemaining: 300 })])).toBeNull();
    });
    it("null when two lots are unused (ambiguous)", () => {
      expect(findCorrectableOpeningLot([lot({ id: "a" }), lot({ id: "b" })])).toBeNull();
    });
    it("null for no lots", () => {
      expect(findCorrectableOpeningLot([])).toBeNull();
    });
  });

  describe("openingLotTotalCost", () => {
    it("is unitCost × qtyReceived", () => {
      expect(openingLotTotalCost(lot({ id: "a", unitCost: 0.12, qtyReceived: 500 }))).toBe(60);
    });
    it("null when cost unknown or no lot", () => {
      expect(openingLotTotalCost(lot({ id: "a", unitCost: null }))).toBeNull();
      expect(openingLotTotalCost(null)).toBeNull();
    });
  });

  describe("resolveOpeningCostCorrection", () => {
    it("undefined desired → no action (cost field not submitted)", () => {
      expect(resolveOpeningCostCorrection([lot({ id: "a" })], undefined)).toEqual({ action: "none" });
    });
    it("sets the per-unit cost from the package total on a single unused lot", () => {
      // $60 for a 500g unused bag → 0.12/g
      expect(resolveOpeningCostCorrection([lot({ id: "a", qtyReceived: 500 })], 60)).toEqual({
        action: "set", lotId: "a", unitCost: 0.12,
      });
    });
    it("no action when the desired total equals the current total", () => {
      expect(resolveOpeningCostCorrection([lot({ id: "a", unitCost: 0.12, qtyReceived: 500 })], 60)).toEqual({ action: "none" });
    });
    it("clears the cost to unknown when desired is null and a cost was set", () => {
      expect(resolveOpeningCostCorrection([lot({ id: "a", unitCost: 0.12, qtyReceived: 500 })], null)).toEqual({
        action: "set", lotId: "a", unitCost: null,
      });
    });
    it("CONFLICT when the stock has been used and the price would change", () => {
      expect(resolveOpeningCostCorrection([lot({ id: "a", qtyReceived: 500, qtyRemaining: 300 })], 60)).toEqual({ action: "conflict" });
    });
    it("CONFLICT when multiple lots exist and the price would change", () => {
      expect(resolveOpeningCostCorrection([lot({ id: "a" }), lot({ id: "b" })], 60)).toEqual({ action: "conflict" });
    });
  });
});

// deriveMaterialFields is re-exported and reused by the create path; a smoke test keeps the edit path honest.
describe("deriveMaterialFields (shared with create)", () => {
  it("derives name/normalizedKey/kind/category from an intake input", () => {
    const f = deriveMaterialFields({ genericName: "Bentonite", category: "ADDITIVE", kind: "Fining" });
    expect(f.name).toBe("BENTONITE");
    expect(f.normalizedKey).toBe("BENTONITE");
    expect(f.kind).toBe("FINING");
    expect(f.category).toBe("ADDITIVE");
  });
});
