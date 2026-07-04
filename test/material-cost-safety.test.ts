import { describe, it, expect } from "vitest";
import { MATERIAL_KINDS } from "@/lib/cellar/additions-math";
import { categoryOf, kindsForCategory, materialScopeForTask } from "@/lib/cellar/material-taxonomy";

// Cost-safety guards for Phase 034. The design keeps new material kinds cost-inert:
//  - consumeMaterialCore ALWAYS writes a MATERIAL cost line (never branches on kind), so a dosed SUGAR
//    capitalizes exactly like any additive.
//  - cleaning/sanitizing is routed as OVERHEAD by the vessel-activity MAINTENANCE path (by activity kind),
//    never by material kind (WORKORDER-3).
// These tests lock the taxonomy relationships those two facts depend on, so a future edit can't silently
// let a non-additive be dosed into wine or move the overhead boundary.

describe("additions picker scope never admits non-additives", () => {
  it("ADDITION / FINING scope is Additive + Other only (no cleaning, no packaging)", () => {
    for (const opType of ["ADDITION", "FINING"]) {
      const scope = materialScopeForTask({ opType });
      expect(scope).toEqual(["ADDITIVE", "OTHER"]);
      expect(scope).not.toContain("CLEANING_SANITIZING");
      expect(scope).not.toContain("PACKAGING");
    }
  });

  it("cleaning/sanitizing tasks scope to Cleaning + Other", () => {
    expect(materialScopeForTask({ activityType: "CLEAN" })).toEqual(["CLEANING_SANITIZING", "OTHER"]);
    expect(materialScopeForTask({ activityType: "SANITIZE" })).toEqual(["CLEANING_SANITIZING", "OTHER"]);
  });

  it("other tasks (rack, gas, temp) impose no material scope", () => {
    expect(materialScopeForTask({ opType: "RACK" })).toBeUndefined();
    expect(materialScopeForTask({ activityType: "GAS" })).toBeUndefined();
    expect(materialScopeForTask({})).toBeUndefined();
  });
});

describe("new kinds are cost-inert", () => {
  it("SUGAR is an additive (dosed → MATERIAL cost line → capitalized)", () => {
    expect(categoryOf("SUGAR")).toBe("ADDITIVE");
  });

  it("PACKAGING is neither an additive nor an overhead (cleaning) kind", () => {
    expect(categoryOf("PACKAGING")).toBe("PACKAGING");
    expect(kindsForCategory("ADDITIVE")).not.toContain("PACKAGING");
    expect(kindsForCategory("CLEANING_SANITIZING")).not.toContain("PACKAGING");
  });

  it("CLEANING/SANITIZER remain the ONLY overhead-category kinds", () => {
    expect([...kindsForCategory("CLEANING_SANITIZING")].sort()).toEqual(["CLEANING", "SANITIZER"]);
  });

  it("SUGAR + PACKAGING are the only kinds added beyond the pre-034 set", () => {
    // Guards against an accidental kind addition that would need a category mapping review.
    const pre034 = ["YEAST", "MLF", "SO2", "NUTRIENT", "ACID", "TANNIN", "FINING", "BENTONITE", "CHITOSAN", "ENZYME", "CLEANING", "SANITIZER", "OTHER"];
    const added = MATERIAL_KINDS.filter((k) => !pre034.includes(k));
    expect([...added].sort()).toEqual(["PACKAGING", "SUGAR"]);
  });
});
