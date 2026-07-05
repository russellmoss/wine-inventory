import { describe, it, expect } from "vitest";
import {
  VOLUME_TO_LITERS,
  RATE_UNITS,
  MASS_OUTPUT_FACTORS,
  LIQUID_OUTPUT_FACTORS,
  CALC_ENGINE_VERSION,
  dose,
  round,
} from "@/lib/winemaking-calc/units";
import {
  DomainError,
  requireFinite,
  requirePositive,
  requireNonNegative,
  requireNonZeroDenominator,
  requireOneOf,
} from "@/lib/winemaking-calc/validate";

describe("unit factor tables", () => {
  it("matches the reference-doc volume factors", () => {
    expect(VOLUME_TO_LITERS.L).toBe(1);
    expect(VOLUME_TO_LITERS.GAL_US).toBe(3.7854);
    expect(VOLUME_TO_LITERS.HL).toBe(100);
    expect(VOLUME_TO_LITERS.GAL_UK).toBe(4.546);
  });

  it("matches the reference-doc rate factors + modes", () => {
    expect(RATE_UNITS.ppm.factor).toBe(1000);
    expect(RATE_UNITS.ppm.mode).toBe("divide");
    expect(RATE_UNITS.lbs_1000gal.factor).toBe(0.12);
    expect(RATE_UNITS.lbs_1000gal.mode).toBe("multiply");
  });

  it("matches the reference-doc mass + liquid output factors", () => {
    expect(MASS_OUTPUT_FACTORS.lb).toBe(454);
    expect(MASS_OUTPUT_FACTORS.kg).toBe(1000);
    expect(LIQUID_OUTPUT_FACTORS.GAL_US).toBe(3785.4);
  });

  it("stamps a version string", () => {
    expect(CALC_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("dose() — the 0.12 sentinel is dead", () => {
  it("divides for a normal g/L rate: 1000 L @ 1 g/L → 1000 g", () => {
    expect(dose({ volume: 1000, volumeUnit: "L", rate: 1, rateUnit: "g_L", outUnit: "g" })).toBeCloseTo(1000, 6);
  });

  it("multiplies for lbs/1000gal (mode branch, not factor equality)", () => {
    // 1000 L × 2 lbs/1000gal × 0.12 = 240 g
    expect(dose({ volume: 1000, volumeUnit: "L", rate: 2, rateUnit: "lbs_1000gal", outUnit: "g" })).toBeCloseTo(240, 6);
  });

  it("a divide-mode rate whose numeric value is 0.12 still DIVIDES (sentinel is gone)", () => {
    // If we branched on `=== 0.12` this would wrongly multiply. g_100ml has factor 0.1; use a
    // rate value of 0.12 g/L to prove the value 0.12 does not trigger the multiply path.
    const grams = dose({ volume: 100, volumeUnit: "L", rate: 0.12, rateUnit: "g_L", outUnit: "g" });
    expect(grams).toBeCloseTo(12, 6); // 100 L × 0.12 g/L = 12 g (divide), not 100×0.12×0.12
  });

  it("respects volume + output unit conversion", () => {
    // 1000 US gal = 3785.4 L; @ 1 g/L = 3785.4 g = 3.7854 kg
    expect(dose({ volume: 1000, volumeUnit: "GAL_US", rate: 1, rateUnit: "g_L", outUnit: "kg" })).toBeCloseTo(3.7854, 6);
  });
});

describe("round()", () => {
  it("rounds to given precision", () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(328.588, 2)).toBe(328.59);
  });
});

describe("validation guards", () => {
  it("requireFinite rejects NaN/Infinity", () => {
    expect(() => requireFinite(NaN, "x")).toThrow(DomainError);
    expect(() => requireFinite(Infinity, "x")).toThrow(DomainError);
    expect(requireFinite(3, "x")).toBe(3);
  });

  it("requirePositive rejects zero and negatives", () => {
    expect(() => requirePositive(0, "volume")).toThrow(/greater than zero/);
    expect(() => requirePositive(-5, "volume")).toThrow(DomainError);
    expect(requirePositive(10, "volume")).toBe(10);
  });

  it("requireNonNegative allows zero, rejects negatives", () => {
    expect(requireNonNegative(0, "rate")).toBe(0);
    expect(() => requireNonNegative(-1, "rate")).toThrow(DomainError);
  });

  it("requireNonZeroDenominator throws with a domain message", () => {
    expect(() => requireNonZeroDenominator(0, "Spirit and target strength must differ.")).toThrow(
      /must differ/,
    );
    expect(requireNonZeroDenominator(2, "msg")).toBe(2);
  });

  it("requireOneOf enforces enum membership", () => {
    expect(requireOneOf("ppm", ["ppm", "g_L"] as const, "unit")).toBe("ppm");
    expect(() => requireOneOf("bogus", ["ppm", "g_L"] as const, "unit")).toThrow(DomainError);
  });
});
