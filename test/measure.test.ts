import { describe, it, expect } from "vitest";
import { convert, dimensionOf, canonicalUnitFor, toCanonical, resolveUnit, MEASURE_UNITS } from "@/lib/units/measure";

describe("dimensionOf / resolveUnit", () => {
  it("classifies mass, volume, count", () => {
    for (const u of ["mg", "g", "kg", "oz", "lb"]) expect(dimensionOf(u)).toBe("mass");
    for (const u of ["mL", "L", "fl oz", "gal"]) expect(dimensionOf(u)).toBe("volume");
    expect(dimensionOf("unit")).toBe("count");
    expect(dimensionOf("nonsense")).toBeNull();
    expect(dimensionOf(null)).toBeNull();
  });

  it("resolves aliases + casing", () => {
    expect(resolveUnit("ml")).toBe("mL");
    expect(resolveUnit("Gallon")).toBe("gal");
    expect(resolveUnit("floz")).toBe("fl oz");
    expect(resolveUnit("ounces")).toBe("oz");
    expect(resolveUnit("POUNDS")).toBe("lb");
    expect(resolveUnit("each")).toBe("unit");
    expect(resolveUnit("bogus")).toBeNull();
  });

  it("canonicalUnitFor", () => {
    expect(canonicalUnitFor("mass")).toBe("g");
    expect(canonicalUnitFor("volume")).toBe("mL");
    expect(canonicalUnitFor("count")).toBe("unit");
  });
});

describe("convert (same-dimension only)", () => {
  it("mass conversions (exact intl factors)", () => {
    expect(convert(1, "kg", "g")).toBe(1000);
    expect(convert(1000, "mg", "g")).toBe(1);
    expect(convert(1, "lb", "g")).toBe(453.59237);
    expect(convert(1, "oz", "g")).toBe(28.34952313); // round8 of 28.349523125
    expect(convert(16, "oz", "lb")).toBe(1);
  });

  it("volume conversions (US gallon / fl oz)", () => {
    expect(convert(1, "L", "mL")).toBe(1000);
    expect(convert(1, "gal", "mL")).toBe(3785.411784);
    expect(convert(1, "fl oz", "mL")).toBe(29.57352956); // round8 of 29.5735295625
    expect(convert(128, "fl oz", "gal")).toBe(1); // 128 fl oz = 1 US gallon
  });

  it("returns null across dimensions (mass↔volume needs density)", () => {
    expect(convert(1, "g", "mL")).toBeNull();
    expect(convert(1, "gal", "kg")).toBeNull();
    expect(convert(1, "unit", "g")).toBeNull();
    expect(convert(1, "g", "unit")).toBeNull();
  });

  it("count only converts to itself", () => {
    expect(convert(5, "unit", "unit")).toBe(5);
  });

  it("rejects unknown units + bad amounts", () => {
    expect(convert(1, "g", "bogus")).toBeNull();
    expect(convert(1, "bogus", "g")).toBeNull();
    expect(convert(-1, "kg", "g")).toBeNull();
    expect(convert(Number.NaN, "kg", "g")).toBeNull();
  });
});

describe("toCanonical", () => {
  it("maps to g / mL / unit", () => {
    expect(toCanonical(1, "gal")).toEqual({ amount: 3785.411784, unit: "mL" });
    expect(toCanonical(2, "lb")).toEqual({ amount: 907.18474, unit: "g" });
    expect(toCanonical(3, "unit")).toEqual({ amount: 3, unit: "unit" });
    expect(toCanonical(1, "bogus")).toBeNull();
  });

  it("the '2 oz of a gallon' shape works via canonical mL", () => {
    // 1 gallon = 3785.411784 mL; 2 fl oz = 59.147 mL → fraction of the gallon
    const gal = toCanonical(1, "gal")!.amount;
    const use = toCanonical(2, "fl oz")!.amount;
    expect(Number((use / gal).toFixed(6))).toBe(0.015625); // 2/128
  });
});

describe("MEASURE_UNITS", () => {
  it("exposes the known units for dropdowns", () => {
    expect(MEASURE_UNITS).toContain("gal");
    expect(MEASURE_UNITS).toContain("fl oz");
    expect(MEASURE_UNITS).toContain("g");
    expect(MEASURE_UNITS).toContain("unit");
  });
});
