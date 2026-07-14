import { describe, it, expect } from "vitest";
import { resolveSo2Dose } from "@/lib/cellar/so2-dose";

// Golden values are the winery's Formulas-and-Conversions.pdf "10% Solution of Metabisulfite" table
// (10 g KMBS / 100 mL; KMBS = 57.6% active SO₂). These are the source of truth for the convention;
// if this table and the code ever disagree, the code is wrong.

const GAL_L = 3.785; // 1 US gallon (the PDF's conversion)

describe("resolveSo2Dose — PDF 10% KMBS solution dosing table", () => {
  const cases: Array<{ gal: number; ppm: number; expectedMl: number }> = [
    { gal: 1, ppm: 20, expectedMl: 1.3 },
    { gal: 1, ppm: 30, expectedMl: 2.0 },
    { gal: 1, ppm: 50, expectedMl: 3.3 },
    { gal: 25, ppm: 30, expectedMl: 49.3 },
  ];
  for (const c of cases) {
    it(`${c.gal} gal @ ${c.ppm} ppm with a 10% KMBS solution → ~${c.expectedMl} mL`, () => {
      const r = resolveSo2Dose({ ppm: c.ppm, volumeL: c.gal * GAL_L, solutionPercentKmbs: 10 });
      expect(r.solutionMl).not.toBeNull();
      expect(Math.abs((r.solutionMl as number) - c.expectedMl)).toBeLessThanOrEqual(0.1);
    });
  }
});

describe("resolveSo2Dose — KMBS powder path (÷0.576)", () => {
  it("1 gal @ 30 ppm → ~0.197 g KMBS (NOT 0.114 g of raw SO₂)", () => {
    const r = resolveSo2Dose({ ppm: 30, volumeL: 1 * GAL_L });
    expect(r.so2Grams).toBeCloseTo(0.1136, 3); // raw SO₂ mass
    expect(r.kmbsGrams).toBeCloseTo(0.1971, 3); // KMBS is 1.736× heavier — the bug this fixes
    expect(r.solutionMl).toBeNull();
  });

  it("applies the 0.576 active fraction — KMBS grams = SO₂ grams / 0.576", () => {
    const r = resolveSo2Dose({ ppm: 50, volumeL: 100 });
    expect(r.kmbsGrams).toBeCloseTo(r.so2Grams / 0.576, 4);
  });
});

describe("resolveSo2Dose — a 10% KMBS solution is NOT a true-10%-active solution", () => {
  it("distinguishes the two conventions (guards the 1.74× trap)", () => {
    const kmbs10 = resolveSo2Dose({ ppm: 30, volumeL: GAL_L, solutionPercentKmbs: 10 });
    // If someone mistakenly treated 10 as % active SO₂, they'd get ~1.14 mL — under-dosing by 1.74×.
    expect(kmbs10.solutionMl).toBeGreaterThan(1.9);
    expect(kmbs10.solutionMl).toBeLessThan(2.1);
  });
});

describe("resolveSo2Dose — guards", () => {
  it("rejects non-positive volume", () => {
    expect(() => resolveSo2Dose({ ppm: 30, volumeL: 0 })).toThrow();
  });
  it("rejects negative ppm", () => {
    expect(() => resolveSo2Dose({ ppm: -1, volumeL: 100 })).toThrow();
  });
  it("ignores a zero/invalid solution strength (falls back to powder-only)", () => {
    const r = resolveSo2Dose({ ppm: 30, volumeL: 100, solutionPercentKmbs: 0 });
    expect(r.solutionMl).toBeNull();
    expect(r.kmbsGrams).toBeGreaterThan(0);
  });
});
