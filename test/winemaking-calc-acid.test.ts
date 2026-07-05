import { describe, it, expect } from "vitest";
import { acidAddition, deacidification } from "@/lib/winemaking-calc/acid";
import { DomainError } from "@/lib/winemaking-calc/validate";

describe("acid addition", () => {
  it("1000 L @ 3 g/L → 3000 g", () => {
    expect(acidAddition({ volume: 1000, volumeUnit: "L", rate: 3, rateUnit: "g_L", outUnit: "g" })).toBeCloseTo(3000, 6);
  });
  it("rejects non-positive volume", () => {
    expect(() => acidAddition({ volume: 0, volumeUnit: "L", rate: 3, rateUnit: "g_L", outUnit: "g" })).toThrow(DomainError);
  });
});

describe("deacidification (advisory — revised 0.67/0.673/0.62 trio)", () => {
  it("1000 L, TA 6 → 5 g/L: CaCO₃ 670 g, KHCO₃ 673 g, alt 620 g", () => {
    const r = deacidification({
      volume: 1000, volumeUnit: "L", currentTA: 6, currentTAUnit: "g_L", targetTA: 5, targetTAUnit: "g_L", outUnit: "g",
    });
    expect(r.caco3).toBeCloseTo(670, 4);
    expect(r.khco3).toBeCloseTo(673, 4);
    expect(r.kbicarbAlt).toBeCloseTo(620, 4);
    expect(r.advisory).toBe(true);
  });
  it("reagents stay in the right ratio", () => {
    const r = deacidification({
      volume: 500, volumeUnit: "L", currentTA: 8, currentTAUnit: "g_L", targetTA: 6, targetTAUnit: "g_L", outUnit: "g",
    });
    expect(r.khco3 / r.caco3).toBeCloseTo(0.673 / 0.67, 4);
  });
  it("rejects non-positive volume", () => {
    expect(() =>
      deacidification({ volume: 0, volumeUnit: "L", currentTA: 8, currentTAUnit: "g_L", targetTA: 6, targetTAUnit: "g_L", outUnit: "g" }),
    ).toThrow(DomainError);
  });
});
