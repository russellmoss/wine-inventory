import { describe, it, expect } from "vitest";
import {
  so2AsKmbs, so2AsLiquidSolution, freeSO2ForMolecularTarget, so2Reduction, KMBS_SO2_FRACTION,
} from "@/lib/winemaking-calc/so2";
import { DomainError } from "@/lib/winemaking-calc/validate";

describe("SO₂ as KMBS", () => {
  it("1000 US gal, +50 ppm → 328.59 g (doc worked example)", () => {
    const g = so2AsKmbs({ volume: 1000, volumeUnit: "GAL_US", target: 50, targetUnit: "ppm", outUnit: "g" });
    expect(g).toBeCloseTo(328.59, 1);
  });
  it("uses the 0.576 SO₂ fraction", () => {
    expect(KMBS_SO2_FRACTION).toBe(0.576);
  });
  it("rejects non-positive volume", () => {
    expect(() => so2AsKmbs({ volume: 0, volumeUnit: "L", target: 50, targetUnit: "ppm", outUnit: "g" })).toThrow(
      DomainError,
    );
  });
});

describe("SO₂ as liquid solution", () => {
  it("1000 US gal, +50 ppm, 6% → 3154.5 mL (doc worked example)", () => {
    const mL = so2AsLiquidSolution({
      volume: 1000, volumeUnit: "GAL_US", rate: 50, rateUnit: "ppm", concentrationPct: 6, outUnit: "mL",
    });
    expect(mL).toBeCloseTo(3154.5, 1);
  });
  it("rejects zero concentration", () => {
    expect(() =>
      so2AsLiquidSolution({ volume: 100, volumeUnit: "L", rate: 50, rateUnit: "ppm", concentrationPct: 0, outUnit: "mL" }),
    ).toThrow(DomainError);
  });
});

describe("free SO₂ for a molecular target", () => {
  it("0.8 mg/L @ pH 3.4 → 31.9 ppm free (doc worked example)", () => {
    const r = freeSO2ForMolecularTarget({ molecularTarget: 0.8, pH: 3.4 });
    expect(r.freeSO2).toBeCloseTo(31.9, 1);
    expect(r.warning).toBeUndefined();
  });
  it("warns on a suspiciously low target (0.08 → did you mean 0.8?)", () => {
    const r = freeSO2ForMolecularTarget({ molecularTarget: 0.08, pH: 3.4 });
    expect(r.warning).toMatch(/0\.8/);
  });
});

describe("SO₂ reduction (advisory)", () => {
  it("returns a finite non-negative number for sane input (value not asserted — advisory)", () => {
    const r = so2Reduction({
      actual: 60, actualUnit: "ppm", target: 30, targetUnit: "ppm", concentration: 3, concentrationUnit: "ppm",
    });
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThanOrEqual(0);
  });
});
