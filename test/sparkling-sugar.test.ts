import { describe, it, expect } from "vitest";
import {
  tirageSugarForPressure,
  pressureForSugar,
  abvBumpForSugar,
  dosageSugarGpl,
  finalRS,
  doseMlForTargetRS,
  classifyStyle,
  nearStyleBandEdge,
} from "@/lib/sparkling/sugar";

describe("tirage sugar ↔ pressure", () => {
  it("6 atm target → ~24 g/L at the default 4 g/L/atm", () => {
    expect(tirageSugarForPressure(6)).toBe(24);
  });
  it("round-trips through pressureForSugar", () => {
    expect(pressureForSugar(24)).toBe(6);
  });
  it("honors an overridden g/L-per-atm", () => {
    expect(tirageSugarForPressure(6, 4.3)).toBeCloseTo(25.8, 1);
  });
});

describe("abvBumpForSugar", () => {
  it("~24 g/L tirage sugar adds ~1.2–1.4 % ABV (g/L ÷ 16.8)", () => {
    const bump = abvBumpForSugar(24);
    expect(bump).toBeGreaterThanOrEqual(1.2);
    expect(bump).toBeLessThanOrEqual(1.5);
    expect(bump).toBeCloseTo(1.43, 1);
  });
});

describe("dosage → residual sugar", () => {
  it("600 g/L liqueur × 15 mL / 750 mL ≈ +12 g/L", () => {
    expect(dosageSugarGpl(15, 600, 750)).toBe(12);
  });

  it("finalRS folds in a measured base RS + leftover tirage sugar + dosage", () => {
    // base 2 g/L; 24 g/L tirage all fermented; dosage 12 g/L → 14 g/L
    expect(finalRS({ baseRS: 2, tirageSugar: 24, fermentedSugar: 24, doseMl: 15, liqueurGPerL: 600, bottleMl: 750 })).toBe(14);
    // leftover tirage sugar carries through when the 2nd ferment doesn't finish
    expect(finalRS({ baseRS: 2, tirageSugar: 24, fermentedSugar: 20, doseMl: 0, liqueurGPerL: 0 })).toBe(6);
  });

  it("doseMlForTargetRS solves for the dose and clamps at zero", () => {
    // want 9 g/L, pre-dosage 2 g/L, need +7 g/L from a 600 g/L liqueur into 750 mL → 8.75 mL
    expect(doseMlForTargetRS({ targetRS: 9, baseRS: 2, liqueurGPerL: 600, bottleMl: 750 })).toBe(8.75);
    // already above target → no dose
    expect(doseMlForTargetRS({ targetRS: 1, baseRS: 2, liqueurGPerL: 600 })).toBe(0);
  });
});

describe("classifyStyle (EU sweetness bands)", () => {
  it("Brut Nature ⇔ 0 g/L sugar dosage — even with a real DOSAGE op and non-trivial RS", () => {
    expect(classifyStyle(2.9, 0)).toBe("BRUT_NATURE");
    expect(classifyStyle(5, 0)).toBe("BRUT_NATURE"); // dry/SO₂-only top-up still Brut Nature
  });

  it("a sugar dosage at low RS is Extra Brut, not Brut Nature", () => {
    expect(classifyStyle(2.9, 5)).toBe("EXTRA_BRUT");
  });

  it("12 g/L dosage lands Extra Dry (edge lands on the higher band)", () => {
    expect(classifyStyle(12, 12)).toBe("EXTRA_DRY");
  });

  it("band edges: 5.9/6.0 (Extra Brut→Brut), 11.9/12.0, 16.9/17.0, 31.9/32.0, 49.9/50.0", () => {
    expect(classifyStyle(5.9, 5)).toBe("EXTRA_BRUT");
    expect(classifyStyle(6.0, 5)).toBe("BRUT");
    expect(classifyStyle(11.9, 8)).toBe("BRUT");
    expect(classifyStyle(12.0, 8)).toBe("EXTRA_DRY");
    expect(classifyStyle(16.9, 8)).toBe("EXTRA_DRY");
    expect(classifyStyle(17.0, 8)).toBe("SEC");
    expect(classifyStyle(31.9, 8)).toBe("SEC");
    expect(classifyStyle(32.0, 8)).toBe("DEMI_SEC");
    expect(classifyStyle(49.9, 8)).toBe("DEMI_SEC");
    expect(classifyStyle(50.0, 8)).toBe("DOUX");
  });
});

describe("nearStyleBandEdge", () => {
  it("flags RS within ±3 g/L of a band edge", () => {
    expect(nearStyleBandEdge(11)).toBe(true); // near the 12 edge
    expect(nearStyleBandEdge(9)).toBe(true); // 3 from 12 and 3 from 6
    expect(nearStyleBandEdge(24)).toBe(false); // between 17 and 32, >3 from either
  });
});
