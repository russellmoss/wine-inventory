import { describe, it, expect } from "vitest";
import { finingDose, copperAsSulfate, copperAsSulfateSolution, CU_TO_CUSO4 } from "@/lib/winemaking-calc/additions";

describe("fining / oak dosing", () => {
  it("1000 L @ 1 g/L → 1000 g", () => {
    expect(finingDose({ volume: 1000, volumeUnit: "L", rate: 1, rateUnit: "g_L", outUnit: "g" })).toBeCloseTo(1000, 6);
  });
  it("lbs/1000gal uses the multiply mode: 1000 L @ 2 → 240 g", () => {
    expect(finingDose({ volume: 1000, volumeUnit: "L", rate: 2, rateUnit: "lbs_1000gal", outUnit: "g" })).toBeCloseTo(240, 6);
  });
});

describe("copper (danger + TTB limit)", () => {
  it("uses the 3.93 elemental-Cu → CuSO₄ factor", () => {
    expect(CU_TO_CUSO4).toBe(3.93);
  });
  it("1000 L, 0.3 mg/L Cu → 1.179 g CuSO₄, no TTB warning", () => {
    const r = copperAsSulfate({ volume: 1000, volumeUnit: "L", rate: 0.3, rateUnit: "mg_L", outUnit: "g" });
    expect(r.mass).toBeCloseTo(1.179, 3);
    expect(r.danger).toBe(true);
    expect(r.ttbWarning).toBeUndefined();
  });
  it("flags a target above the 0.5 mg/L TTB limit", () => {
    const r = copperAsSulfate({ volume: 1000, volumeUnit: "L", rate: 0.6, rateUnit: "mg_L", outUnit: "g" });
    expect(r.ttbWarning).toMatch(/TTB/);
  });
  it("copper solution returns a positive volume + danger flag", () => {
    const r = copperAsSulfateSolution({ volume: 1000, volumeUnit: "L", rate: 0.3, rateUnit: "mg_L", concentrationPct: 1, outUnit: "mL" });
    expect(r.mass).toBeGreaterThan(0);
    expect(r.danger).toBe(true);
  });
});
