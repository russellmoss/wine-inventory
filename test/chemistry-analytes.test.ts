import { describe, it, expect } from "vitest";
import {
  ANALYTES,
  ANALYTE_KEYS,
  isAnalyteKey,
  getAnalyte,
  validateMeasurement,
  toDefaultUnit,
} from "@/lib/chemistry/analytes";

describe("analyte registry", () => {
  it("every definition is self-consistent (defaultUnit ∈ units, key matches)", () => {
    for (const key of ANALYTE_KEYS) {
      const def = ANALYTES[key];
      expect(def.key).toBe(key);
      expect(def.units).toContain(def.defaultUnit);
      expect(def.units.length).toBeGreaterThan(0);
    }
  });

  it("isAnalyteKey accepts known keys and rejects everything else", () => {
    expect(isAnalyteKey("PH")).toBe(true);
    expect(isAnalyteKey("FREE_SO2")).toBe(true);
    expect(isAnalyteKey("ph")).toBe(false); // case-sensitive
    expect(isAnalyteKey("UNOBTANIUM")).toBe(false);
    expect(isAnalyteKey(null)).toBe(false);
    expect(isAnalyteKey(42)).toBe(false);
  });

  it("getAnalyte returns the def or undefined for an unknown key", () => {
    expect(getAnalyte("PH")?.label).toBe("pH");
    expect(getAnalyte("NOPE")).toBeUndefined();
  });
});

describe("validateMeasurement", () => {
  it("rejects an unknown analyte key", () => {
    const r = validateMeasurement("NOPE", 1, "x");
    expect(r.ok).toBe(false);
  });

  it("rejects a non-finite value", () => {
    expect(validateMeasurement("PH", NaN, "pH").ok).toBe(false);
    expect(validateMeasurement("PH", Infinity, "pH").ok).toBe(false);
  });

  it("enforces unit membership", () => {
    expect(validateMeasurement("PH", 3.5, "pH").ok).toBe(true);
    expect(validateMeasurement("FREE_SO2", 30, "mg/L").ok).toBe(true);
    const bad = validateMeasurement("FREE_SO2", 30, "g/L");
    expect(bad.ok).toBe(false);
  });

  it("accepts in-range values and rejects out-of-range (in the default unit)", () => {
    expect(validateMeasurement("PH", 3.6, "pH").ok).toBe(true);
    expect(validateMeasurement("PH", 1.0, "pH").ok).toBe(false); // below 2.5
    expect(validateMeasurement("PH", 9.0, "pH").ok).toBe(false); // above 4.5
    expect(validateMeasurement("FREE_SO2", -1, "mg/L").ok).toBe(false);
  });

  it("range-checks an alternate unit by converting to the default first", () => {
    // TA 12 g/L H₂SO₄ → 12 × 1.5306 ≈ 18.4 g/L tartaric, still ≤ 20 → ok
    expect(validateMeasurement("TA", 12, "g/L H2SO4").ok).toBe(true);
    // TA 14 g/L H₂SO₄ → ≈ 21.4 g/L tartaric, above 20 → rejected
    expect(validateMeasurement("TA", 14, "g/L H2SO4").ok).toBe(false);
    // 35 °F → ~1.7 °C, in range; -10 °F → ~-23 °C, below -5 → rejected
    expect(validateMeasurement("TEMP", 35, "°F").ok).toBe(true);
    expect(validateMeasurement("TEMP", -10, "°F").ok).toBe(false);
  });
});

describe("toDefaultUnit", () => {
  it("passes through the default unit and converts alternates", () => {
    expect(toDefaultUnit("PH", 3.5, "pH")).toBe(3.5);
    expect(toDefaultUnit("TEMP", 68, "°F")).toBeCloseTo(20, 5);
    expect(toDefaultUnit("TA", 10, "g/L H2SO4")).toBeCloseTo(15.306, 3);
  });

  it("returns null for an unknown key", () => {
    expect(toDefaultUnit("NOPE", 1, "x")).toBeNull();
  });
});
