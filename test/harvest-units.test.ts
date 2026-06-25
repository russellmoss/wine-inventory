import { describe, it, expect } from "vitest";
import { toKg, fromKg, formatWeightFromKg, KG_PER_LB } from "@/lib/harvest/units";

describe("toKg / fromKg", () => {
  it("metric is identity", () => {
    expect(toKg(500, "metric")).toBe(500);
    expect(fromKg(500, "metric")).toBe(500);
  });
  it("imperial converts lb <-> kg and round-trips", () => {
    expect(toKg(100, "imperial")).toBeCloseTo(100 * KG_PER_LB, 9);
    expect(fromKg(toKg(2204.6, "imperial")!, "imperial")).toBeCloseTo(2204.6, 6);
  });
  it("guards invalid / negative input", () => {
    expect(toKg(null, "metric")).toBeNull();
    expect(toKg(-5, "metric")).toBeNull();
    expect(fromKg(NaN, "imperial")).toBeNull();
  });
});

describe("formatWeightFromKg", () => {
  it("metric rolls up to tonnes at 1000 kg", () => {
    expect(formatWeightFromKg(999, "metric")).toBe("999.0 kg");
    expect(formatWeightFromKg(1000, "metric")).toBe("1.00 t");
    expect(formatWeightFromKg(2500, "metric")).toBe("2.50 t");
  });
  it("imperial rolls up to short tons at 2000 lb", () => {
    expect(formatWeightFromKg(100 * KG_PER_LB, "imperial")).toBe("100.0 lb");
    // 1000 kg = 2204.6 lb -> short tons
    expect(formatWeightFromKg(1000, "imperial")).toBe("1.10 short tons");
  });
  it("renders a dash for null", () => {
    expect(formatWeightFromKg(null, "metric")).toBe("—");
  });
});
