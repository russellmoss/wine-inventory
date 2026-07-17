import { describe, it, expect } from "vitest";
import { MATERIAL_KINDS } from "@/lib/cellar/additions-math";
import { MATERIAL_CATEGORIES, categoryOf, kindsForCategory, materialScopeForTask, isDoseableKind, isDoseableCategory, coerceMaterialCategory, coerceFamily, familyLabel, BUILTIN_FAMILIES } from "@/lib/cellar/material-taxonomy";

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

  it("isDoseableKind: additives dose, cleaning/sanitizing + packaging do NOT (server WORKORDER-3 guard)", () => {
    for (const k of kindsForCategory("ADDITIVE")) expect(isDoseableKind(k)).toBe(true);
    expect(isDoseableKind("OTHER")).toBe(true);
    expect(isDoseableKind("CLEANING")).toBe(false);
    expect(isDoseableKind("SANITIZER")).toBe(false);
    expect(isDoseableKind("PACKAGING")).toBe(false);
    expect(isDoseableKind("SUGAR")).toBe(true); // chaptalization is a real additive dose
    expect(isDoseableKind(null)).toBe(true); // unknown → OTHER → doseable (matches picker's OTHER-in-scope)
  });

  it("isDoseableCategory: the stored-category authority (Phase 036)", () => {
    expect(isDoseableCategory("ADDITIVE")).toBe(true);
    expect(isDoseableCategory("OTHER")).toBe(true);
    expect(isDoseableCategory("CLEANING_SANITIZING")).toBe(false);
    expect(isDoseableCategory("PACKAGING")).toBe(false);
  });

  it("a CUSTOM cleaning family must use the STORED category, not kind-derived (WORKORDER-3 regression)", () => {
    // A user-invented family "DRUM WASH" filed under Cleaning: categoryOf(kind) is OTHER (doseable) — the
    // old bug — but the STORED category is CLEANING_SANITIZING (NOT doseable). The guard + picker must read
    // the stored category. This locks why isDoseableKind alone was insufficient.
    const customCleaningKind = coerceFamily("Drum Wash"); // "DRUM WASH"
    expect(categoryOf(customCleaningKind)).toBe("OTHER"); // kind-derived (wrong for cost-safety)
    expect(isDoseableKind(customCleaningKind)).toBe(true); // the trap the old guard fell into
    expect(isDoseableCategory("CLEANING_SANITIZING")).toBe(false); // the correct answer via stored category
  });

  it("coerceFamily: built-ins normalize to their code, customs uppercase, empty → OTHER", () => {
    expect(coerceFamily("Yeast")).toBe("YEAST"); // by label
    expect(coerceFamily("yeast")).toBe("YEAST");
    expect(coerceFamily("FINING")).toBe("FINING"); // by code
    expect(coerceFamily("Bacteria (MLF)")).toBe("MLF"); // by label
    expect(coerceFamily("SO₂")).toBe("SO2"); // subscript label → code
    expect(coerceFamily("Sur Lie")).toBe("SUR LIE"); // custom → uppercased key
    expect(coerceFamily("sur lie")).toBe("SUR LIE"); // same custom collapses
    expect(coerceFamily("")).toBe("OTHER");
    expect(coerceFamily(null)).toBe("OTHER");
  });

  it("familyLabel: built-in label, custom title-cased (not 'Other')", () => {
    expect(familyLabel("YEAST")).toBe("Yeast");
    expect(familyLabel("MLF")).toBe("Bacteria (MLF)");
    expect(familyLabel("SUR LIE")).toBe("Sur Lie"); // custom keeps its name
    expect(familyLabel("")).toBe("Other");
  });

  it("BUILTIN_FAMILIES seeds the dropdown (excludes OTHER, carries category)", () => {
    expect(BUILTIN_FAMILIES.some((f) => f.value === "YEAST" && f.category === "ADDITIVE")).toBe(true);
    expect(BUILTIN_FAMILIES.some((f) => f.value === "CLEANING" && f.category === "CLEANING_SANITIZING")).toBe(true);
    expect(BUILTIN_FAMILIES.some((f) => f.value === "OTHER")).toBe(false);
  });

  it("SUGAR + PACKAGING + EQUIPMENT are the only kinds added beyond the pre-034 set", () => {
    // Guards against an accidental kind addition that would need a category mapping review.
    const pre034 = ["YEAST", "MLF", "SO2", "NUTRIENT", "ACID", "TANNIN", "FINING", "BENTONITE", "CHITOSAN", "ENZYME", "CLEANING", "SANITIZER", "OTHER"];
    const added = MATERIAL_KINDS.filter((k) => !pre034.includes(k));
    expect([...added].sort()).toEqual(["EQUIPMENT", "PACKAGING", "SUGAR"]);
  });
});

// Plan 072: EQUIPMENT category + allowlist dose-safety. The load-bearing council fix is that
// isDoseableCategory is a DEFAULT-DENY allowlist, not a denylist on a free-text String column — so a
// typo / import / future category can never be doseable-by-default and slip into wine COGS.
describe("Plan 072 — EQUIPMENT + default-deny dose safety (allowlist)", () => {
  it("EQUIPMENT is its own category and is NON-doseable (never wine COGS)", () => {
    expect(categoryOf("EQUIPMENT")).toBe("EQUIPMENT");
    expect(isDoseableCategory("EQUIPMENT")).toBe(false);
    expect(isDoseableKind("EQUIPMENT")).toBe(false);
  });

  it("UNCLASSIFIED (the unknown-input sink) is NON-doseable", () => {
    expect(isDoseableCategory("UNCLASSIFIED")).toBe(false);
  });

  it("allowlist: an UNKNOWN/garbage category string is NON-doseable by default (the council fix)", () => {
    // A denylist would let any of these through to wine COGS; the allowlist denies by default.
    for (const bogus of ["WIDGET", "", "packaging ", "EQUIPMNET", "ADDITIVE "]) {
      expect(isDoseableCategory(bogus as never)).toBe(false);
    }
  });

  it("exhaustive snapshot: every known category's doseability is pinned (future categories opt IN explicitly)", () => {
    const snapshot = Object.fromEntries(MATERIAL_CATEGORIES.map((c) => [c, isDoseableCategory(c)]));
    expect(snapshot).toEqual({
      ADDITIVE: true,
      OTHER: true,
      CLEANING_SANITIZING: false,
      PACKAGING: false,
      EQUIPMENT: false,
      UNCLASSIFIED: false,
    });
    // Exactly two categories are doseable — adding a doseable category must be a deliberate edit here.
    expect(MATERIAL_CATEGORIES.filter((c) => isDoseableCategory(c)).sort()).toEqual(["ADDITIVE", "OTHER"]);
  });

  it("a typo'd category coerces to the non-doseable UNCLASSIFIED, closing the OTHER coercion hole (#6)", () => {
    expect(isDoseableCategory(coerceMaterialCategory("EQUIPMNET"))).toBe(false);
    expect(isDoseableCategory(coerceMaterialCategory("random-import-string"))).toBe(false);
  });

  it("materialScopeForTask never admits EQUIPMENT into a doseable (ADDITION/FINING) picker", () => {
    for (const opType of ["ADDITION", "FINING"]) {
      expect(materialScopeForTask({ opType })).not.toContain("EQUIPMENT");
    }
  });
});
