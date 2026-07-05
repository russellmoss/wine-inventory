import { describe, it, expect } from "vitest";
import {
  brixToAlcohol, brixToSG, brixToSugarGL, sgToScales, sgTemperatureCorrection, yanDose, YAN_PRODUCTS,
} from "@/lib/winemaking-calc/sugar";
import { DomainError } from "@/lib/winemaking-calc/validate";

describe("Brix ↔ SG (261.3 model — differs from ferment/sugar.ts cubic by design)", () => {
  it("brixToSG(0) = 1", () => {
    expect(brixToSG(0)).toBeCloseTo(1, 6);
  });
  it("SG 1.090 → Brix ≈ 21.6", () => {
    expect(sgToScales(1.09).brix).toBeCloseTo(21.6, 1);
  });
  it("Baumé, Oechsle, alt scales from SG 1.09", () => {
    const s = sgToScales(1.09);
    expect(s.baume).toBeCloseTo(145 - 145 / 1.09, 4);
    expect(s.oechsle).toBeCloseTo(90, 4);
    expect(s.altScale).toBeCloseTo(259 - 259 / 1.09, 4);
  });
  it("sugar g/L from Brix", () => {
    expect(brixToSugarGL(24)).toBeCloseTo(24 * brixToSG(24) * 10, 6);
  });
  it("rejects NaN Brix and Brix at/above the 261.3 pole (no NaN/Infinity)", () => {
    expect(() => brixToSG(NaN)).toThrow(DomainError);
    expect(() => brixToSG(261.3)).toThrow(DomainError);
  });
});

describe("Brix → alcohol (user factor)", () => {
  it("24 °Bx × 0.59 = 14.16", () => {
    expect(brixToAlcohol(24, 0.59)).toBeCloseTo(14.16, 2);
  });
  it("rejects a non-positive factor", () => {
    expect(() => brixToAlcohol(24, 0)).toThrow(DomainError);
  });
});

describe("SG temperature correction", () => {
  it("adds the quadratic correction (80°F reading → +0.027)", () => {
    const c = sgTemperatureCorrection({ measuredSG: 1.09, temp: 80, tempUnit: "F" });
    expect(c).toBeGreaterThan(1.09);
    expect(c).toBeCloseTo(1.11704, 4);
  });
  it("°C input converts to °F first", () => {
    const cCelsius = sgTemperatureCorrection({ measuredSG: 1.09, temp: 26.67, tempUnit: "C" });
    const cFahrenheit = sgTemperatureCorrection({ measuredSG: 1.09, temp: 80, tempUnit: "F" });
    expect(cCelsius).toBeCloseTo(cFahrenheit, 3);
  });
});

describe("YAN dosing", () => {
  it("DAP, 1000 L, +100 mg/L YAN ≈ 470 g (literal port; ~matches real ~476 g)", () => {
    const g = yanDose({ volume: 1000, volumeUnit: "L", yanIncrease: 100, yanUnit: "mg_L", product: "DAP", outUnit: "g" });
    expect(g).toBeCloseTo(470.15, 0);
  });
  it("has the reference product-factor table", () => {
    expect(YAN_PRODUCTS["DAP"]).toBe(0.2127);
    expect(YAN_PRODUCTS["Nutrient Vit End"]).toBe(0.028);
  });
  it("rejects an unknown product", () => {
    expect(() =>
      yanDose({ volume: 1000, volumeUnit: "L", yanIncrease: 100, yanUnit: "mg_L", product: "Snake Oil", outUnit: "g" }),
    ).toThrow(DomainError);
  });
});
