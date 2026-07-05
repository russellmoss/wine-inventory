import { describe, it, expect } from "vitest";
import {
  so2AsKmbs, so2AsLiquidSolution, freeSO2ForMolecularTarget, so2Reduction, so2AdditionPlan, KMBS_SO2_FRACTION,
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
  it("rejects a negative molecular target and a non-positive pH", () => {
    expect(() => freeSO2ForMolecularTarget({ molecularTarget: -1, pH: 3.4 })).toThrow(DomainError);
    expect(() => freeSO2ForMolecularTarget({ molecularTarget: 0.8, pH: 0 })).toThrow(DomainError);
  });
});

describe("SO₂ addition planner (composed workflow)", () => {
  it("0.8 molecular @ pH 3.4, 20 free, 1000 US gal, 10% → target 31.9, addition 11.9, and matching doses", () => {
    const p = so2AdditionPlan({
      volume: 1000, volumeUnit: "GAL_US", molecularTarget: 0.8, pH: 3.4, currentFree: 20,
      concentrationPct: 10, outUnit: "g",
    });
    expect(p.freeTarget).toBeCloseTo(31.9, 1);
    expect(p.additionNeeded).toBeCloseTo(11.9, 1);
    // Composition must equal the single-step calcs for the SAME addition.
    expect(p.kmbsMass).toBeCloseTo(so2AsKmbs({ volume: 1000, volumeUnit: "GAL_US", target: p.additionNeeded, targetUnit: "ppm", outUnit: "g" }), 6);
    expect(p.solutionVolume).toBeCloseTo(so2AsLiquidSolution({ volume: 1000, volumeUnit: "GAL_US", rate: p.additionNeeded, rateUnit: "ppm", concentrationPct: 10, outUnit: "mL" }), 6);
  });
  it("floors the addition at 0 and warns when current free already meets the target", () => {
    const p = so2AdditionPlan({
      volume: 1000, volumeUnit: "GAL_US", molecularTarget: 0.8, pH: 3.4, currentFree: 40,
      concentrationPct: 10, outUnit: "g",
    });
    expect(p.additionNeeded).toBe(0);
    expect(p.kmbsMass).toBe(0);
    expect(p.solutionVolume).toBe(0);
    expect(p.warning).toMatch(/no addition needed/i);
  });
  it("carries the low-molecular-target guard through the plan", () => {
    const p = so2AdditionPlan({
      volume: 1000, volumeUnit: "GAL_US", molecularTarget: 0.08, pH: 3.4, currentFree: 0,
      concentrationPct: 10, outUnit: "g",
    });
    expect(p.warning).toMatch(/0\.8/);
  });
  it("rejects negative current free SO₂", () => {
    expect(() => so2AdditionPlan({ volume: 1000, volumeUnit: "GAL_US", molecularTarget: 0.8, pH: 3.4, currentFree: -5, concentrationPct: 10, outUnit: "g" })).toThrow(DomainError);
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
  it("rejects zero peroxide concentration", () => {
    expect(() =>
      so2Reduction({ actual: 60, actualUnit: "ppm", target: 30, targetUnit: "ppm", concentration: 0, concentrationUnit: "ppm" }),
    ).toThrow(DomainError);
  });
});
