import { describe, it, expect } from "vitest";
import { MATERIAL_KINDS } from "@/lib/cellar/additions-math";
import {
  MATERIAL_CATEGORIES,
  CATEGORY_LABELS,
  categoryOf,
  builtinSubLabel,
  effectiveSubcategory,
  kindsForCategory,
  coerceMaterialCategory,
} from "@/lib/cellar/material-taxonomy";

describe("categoryOf", () => {
  it("maps the additive family to ADDITIVE (incl. new SUGAR)", () => {
    for (const k of ["YEAST", "MLF", "SO2", "NUTRIENT", "ACID", "SUGAR", "TANNIN", "FINING", "BENTONITE", "CHITOSAN", "ENZYME"]) {
      expect(categoryOf(k)).toBe("ADDITIVE");
    }
  });

  it("maps cleaning/sanitizer to CLEANING_SANITIZING (WORKORDER-3 overhead split)", () => {
    expect(categoryOf("CLEANING")).toBe("CLEANING_SANITIZING");
    expect(categoryOf("SANITIZER")).toBe("CLEANING_SANITIZING");
  });

  it("maps PACKAGING to PACKAGING and OTHER/unknown to OTHER", () => {
    expect(categoryOf("PACKAGING")).toBe("PACKAGING");
    expect(categoryOf("OTHER")).toBe("OTHER");
    expect(categoryOf("nonsense")).toBe("OTHER");
    expect(categoryOf(null)).toBe("OTHER");
    expect(categoryOf(undefined)).toBe("OTHER");
  });

  it("is case-insensitive", () => {
    expect(categoryOf("yeast")).toBe("ADDITIVE");
    expect(categoryOf(" cleaning ")).toBe("CLEANING_SANITIZING");
  });
});

describe("exhaustiveness", () => {
  it("every MATERIAL_KIND resolves to a known category and a non-empty built-in label", () => {
    for (const k of MATERIAL_KINDS) {
      expect(MATERIAL_CATEGORIES).toContain(categoryOf(k));
      expect(builtinSubLabel(k).length).toBeGreaterThan(0);
    }
  });

  it("every category has a label", () => {
    for (const c of MATERIAL_CATEGORIES) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
  });
});

describe("effectiveSubcategory", () => {
  it("falls back to the built-in kind label when no custom subcategory", () => {
    expect(effectiveSubcategory({ kind: "YEAST" })).toBe("Yeast");
    expect(effectiveSubcategory({ kind: "MLF" })).toBe("Bacteria (MLF)");
    expect(effectiveSubcategory({ kind: "FINING", subcategory: null })).toBe("Fining");
    expect(effectiveSubcategory({ kind: "FINING", subcategory: "   " })).toBe("Fining");
  });

  it("uses the custom subcategory when set (overrides built-in)", () => {
    expect(effectiveSubcategory({ kind: "FINING", subcategory: "Egg white" })).toBe("Egg white");
    expect(effectiveSubcategory({ kind: "PACKAGING", subcategory: "Corks" })).toBe("Corks");
  });

  it("trims the custom subcategory", () => {
    expect(effectiveSubcategory({ kind: "PACKAGING", subcategory: "  Labels  " })).toBe("Labels");
  });
});

describe("kindsForCategory", () => {
  it("returns exactly the additive kinds for ADDITIVE (incl. SUGAR, excl. cleaning/packaging)", () => {
    const additives = kindsForCategory("ADDITIVE");
    expect(additives).toContain("YEAST");
    expect(additives).toContain("SUGAR");
    expect(additives).not.toContain("CLEANING");
    expect(additives).not.toContain("PACKAGING");
    expect(additives).not.toContain("OTHER");
  });

  it("partitions all kinds across the categories with no gaps or overlap", () => {
    const seen = MATERIAL_CATEGORIES.flatMap((c) => kindsForCategory(c));
    expect([...seen].sort()).toEqual([...MATERIAL_KINDS].sort());
  });
});

describe("coerceMaterialCategory", () => {
  it("accepts known categories (incl. Plan 072 EQUIPMENT); routes unknown → UNCLASSIFIED (non-doseable), never OTHER", () => {
    expect(coerceMaterialCategory("ADDITIVE")).toBe("ADDITIVE");
    expect(coerceMaterialCategory("packaging")).toBe("PACKAGING");
    expect(coerceMaterialCategory("equipment")).toBe("EQUIPMENT");
    // ChatGPT #6: a typo'd/unknown category must NOT fall back to the doseable OTHER — it goes to the
    // non-doseable UNCLASSIFIED sink so an unrecognized import can't be dosed into wine.
    expect(coerceMaterialCategory("EQUIPMNET")).toBe("UNCLASSIFIED");
    expect(coerceMaterialCategory("bogus")).toBe("UNCLASSIFIED");
    expect(coerceMaterialCategory(null)).toBe("UNCLASSIFIED");
  });
});
