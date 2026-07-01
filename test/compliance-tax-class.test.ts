import { describe, it, expect } from "vitest";
import { deriveTaxClass, sparklingSubFor, type DeriveTaxClassInput } from "@/lib/compliance/tax-class";

const still = (abv: number | null): DeriveTaxClassInput => ({
  abv,
  productType: "WINE",
  carbonation: "NONE",
  sparklingMethod: null,
});

describe("deriveTaxClass (Unit 3)", () => {
  it("classifies still wine by ABV band with exact boundaries", () => {
    // a ≤ 16.000
    expect(deriveTaxClass(still(13.5)).taxClass).toBe("A_LE16");
    expect(deriveTaxClass(still(16.0)).taxClass).toBe("A_LE16"); // 16.000 → a
    // b > 16.000 and ≤ 21.000
    expect(deriveTaxClass(still(16.001)).taxClass).toBe("B_16_21"); // 16.001 → b
    expect(deriveTaxClass(still(18)).taxClass).toBe("B_16_21");
    expect(deriveTaxClass(still(21.0)).taxClass).toBe("B_16_21"); // 21.000 → b
    // c > 21.000 and ≤ 24.000
    expect(deriveTaxClass(still(21.001)).taxClass).toBe("C_21_24"); // 21.001 → c
    expect(deriveTaxClass(still(22.5)).taxClass).toBe("C_21_24");
    expect(deriveTaxClass(still(24.0)).taxClass).toBe("C_21_24"); // 24.000 → c
  });

  it("null ABV defaults to class a and flags review (S2 — never drops the volume)", () => {
    const r = deriveTaxClass(still(null));
    expect(r.taxClass).toBe("A_LE16");
    expect(r.needsAbvReview).toBe(true);
  });

  it("over 24% stays visible in class c but flags review", () => {
    const r = deriveTaxClass(still(25));
    expect(r.taxClass).toBe("C_21_24");
    expect(r.needsAbvReview).toBe(true);
  });

  it("artificial carbonation → class d regardless of ABV", () => {
    const r = deriveTaxClass({ abv: 12, productType: "WINE", carbonation: "ARTIFICIAL", sparklingMethod: null });
    expect(r.taxClass).toBe("D_CARBONATED");
    expect(r.sparklingSub).toBeNull();
  });

  it("sparkling by method → class e with BF/BP sub", () => {
    const trad = deriveTaxClass({ abv: 12.5, productType: "WINE", carbonation: "NATURAL", sparklingMethod: "TRADITIONAL" });
    expect(trad.taxClass).toBe("E_SPARKLING");
    expect(trad.sparklingSub).toBe("BF");

    const petnat = deriveTaxClass({ abv: 11, productType: "WINE", carbonation: "NATURAL", sparklingMethod: "PETNAT" });
    expect(petnat.sparklingSub).toBe("BF");

    const tank = deriveTaxClass({ abv: 12, productType: "WINE", carbonation: "NATURAL", sparklingMethod: "TANK" });
    expect(tank.taxClass).toBe("E_SPARKLING");
    expect(tank.sparklingSub).toBe("BP");
  });

  it("sparklingSubFor: TANK=BP, others=BF", () => {
    expect(sparklingSubFor("TANK")).toBe("BP");
    expect(sparklingSubFor("TRADITIONAL")).toBe("BF");
    expect(sparklingSubFor("PETNAT")).toBe("BF");
  });

  it("hard cider in the 0.5–8.5% window → class f", () => {
    const r = deriveTaxClass({ abv: 6, productType: "HARD_CIDER", carbonation: "NONE", sparklingMethod: null });
    expect(r.taxClass).toBe("F_HARD_CIDER");
    expect(r.needsAbvReview).toBe(false);
  });

  it("hard cider with unknown ABV → class f but flags review", () => {
    const r = deriveTaxClass({ abv: null, productType: "HARD_CIDER", carbonation: "NONE", sparklingMethod: null });
    expect(r.taxClass).toBe("F_HARD_CIDER");
    expect(r.needsAbvReview).toBe(true);
  });

  it("a 'cider' at 10% (out of the cider band) falls through to the wine ABV bands + flags review", () => {
    const r = deriveTaxClass({ abv: 10, productType: "HARD_CIDER", carbonation: "NONE", sparklingMethod: null });
    expect(r.taxClass).toBe("A_LE16");
    expect(r.needsAbvReview).toBe(true);
  });

  it("artificial carbonation takes precedence over a sparkling method (class d, not e)", () => {
    const r = deriveTaxClass({ abv: 12, productType: "WINE", carbonation: "ARTIFICIAL", sparklingMethod: "TANK" });
    expect(r.taxClass).toBe("D_CARBONATED");
  });
});
