import { describe, expect, it } from "vitest";
import { C_TO_F_GDD } from "@/lib/weather/normals-core";
import {
  cToF,
  formatGdd,
  formatPrecip,
  formatSpeed,
  formatTemp,
  gddCToF,
  kphToMph,
  mmToInches,
  normalizeUnitSystem,
} from "@/lib/weather/units-core";

// Plan 096 U3 — one conversion surface. The GDD family MUST scale by C_TO_F_GDD (a degree-day is a
// difference: ×1.8, never +32) while point temps use the full affine °C→°F.

describe("raw converters", () => {
  it("point temperature uses the affine map (0 °C → 32 °F, 35 °C → 95 °F, −2 °C → 28.4 °F)", () => {
    expect(cToF(0)).toBe(32);
    expect(cToF(35)).toBe(95);
    expect(cToF(-2)).toBeCloseTo(28.4, 5);
  });
  it("GDD scale by C_TO_F_GDD only — no 32 offset", () => {
    expect(gddCToF(100)).toBeCloseTo(100 * C_TO_F_GDD, 9);
    expect(gddCToF(0)).toBe(0);
  });
  it("precip and speed", () => {
    expect(mmToInches(25.4)).toBeCloseTo(1, 9);
    expect(kphToMph(1.609344)).toBeCloseTo(1, 9);
  });
});

describe("formatters carry their unit and handle null", () => {
  it("formatTemp", () => {
    expect(formatTemp(35, "IMPERIAL")).toBe("95 °F");
    expect(formatTemp(35, "METRIC")).toBe("35 °C");
    expect(formatTemp(-2, "IMPERIAL")).toBe("28 °F");
    expect(formatTemp(null, "METRIC")).toBe("—");
  });
  it("formatPrecip", () => {
    expect(formatPrecip(25.4, "IMPERIAL")).toBe("1.00 in");
    expect(formatPrecip(12.34, "METRIC")).toBe("12.3 mm");
    expect(formatPrecip(null, "IMPERIAL")).toBe("—");
  });
  it("formatSpeed", () => {
    expect(formatSpeed(16.09344, "IMPERIAL")).toBe("10 mph");
    expect(formatSpeed(24, "METRIC")).toBe("24 km/h");
  });
  it("formatGdd rounds and labels both systems", () => {
    expect(formatGdd(686, "IMPERIAL")).toBe(`${Math.round(686 * C_TO_F_GDD).toLocaleString("en-US")} °F-GDD`);
    expect(formatGdd(686.4, "METRIC")).toBe("686 °C-GDD");
    expect(formatGdd(null, "METRIC")).toBe("—");
  });
});

describe("normalizeUnitSystem", () => {
  it("IMPERIAL passes; anything else (legacy/null) reads METRIC", () => {
    expect(normalizeUnitSystem("IMPERIAL")).toBe("IMPERIAL");
    expect(normalizeUnitSystem("METRIC")).toBe("METRIC");
    expect(normalizeUnitSystem("bogus")).toBe("METRIC");
    expect(normalizeUnitSystem(null)).toBe("METRIC");
  });
});
