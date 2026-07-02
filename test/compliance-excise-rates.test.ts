import { describe, it, expect } from "vitest";
import { RATE_BY_CLASS, rateForClass, hasRate, RATES_EFFECTIVE_DATE } from "@/lib/compliance/excise-rates";
import { WINE_TAX_CLASSES } from "@/lib/compliance/types";

describe("excise-rates (plan-026 Unit 2)", () => {
  it("maps each of the six tax classes to its 27 CFR 24.270 per-gallon rate", () => {
    expect(rateForClass("A_LE16")).toBe(1.07);
    expect(rateForClass("B_16_21")).toBe(1.57);
    expect(rateForClass("C_21_24")).toBe(3.15);
    expect(rateForClass("D_CARBONATED")).toBe(3.3);
    expect(rateForClass("E_SPARKLING")).toBe(3.4);
    expect(rateForClass("F_HARD_CIDER")).toBe(0.226);
  });

  it("covers every WineTaxClass (no class without a rate)", () => {
    for (const c of WINE_TAX_CLASSES) {
      expect(typeof RATE_BY_CLASS[c]).toBe("number");
      expect(RATE_BY_CLASS[c]).toBeGreaterThan(0);
    }
    expect(Object.keys(RATE_BY_CLASS).sort()).toEqual([...WINE_TAX_CLASSES].sort());
  });

  it("hasRate is a type guard for real classes only", () => {
    expect(hasRate("A_LE16")).toBe(true);
    expect(hasRate("F_HARD_CIDER")).toBe(true);
    expect(hasRate("Z_NONSENSE")).toBe(false);
    expect(hasRate("")).toBe(false);
  });

  it("a synthetic gallons×rate sums correctly per class", () => {
    // 100 gal class a + 50 gal class b = 100×1.07 + 50×1.57 = 107 + 78.5 = 185.5
    const tax = 100 * rateForClass("A_LE16") + 50 * rateForClass("B_16_21");
    expect(tax).toBeCloseTo(185.5, 6);
  });

  it("carries a re-verify effective date", () => {
    expect(RATES_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
