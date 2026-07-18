import { describe, it, expect } from "vitest";
import { convert, dimensionOf, canonicalUnitFor, toCanonical, resolveUnit, MEASURE_UNITS, type ExtraUnits } from "@/lib/units/measure";
import { toExtraUnits } from "@/lib/units/custom-units";

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

  it("ton is the US short ton (2000 lb), not the metric tonne", () => {
    expect(convert(1, "ton", "g")).toBe(907184.74);
    expect(convert(1, "ton", "kg")).toBe(907.18474);
    expect(convert(1, "ton", "lb")).toBe(2000);
    expect(resolveUnit("tons")).toBe("ton");
    expect(dimensionOf("ton")).toBe("mass");
    // the ambiguous metric spellings must NOT silently resolve to the short ton
    expect(resolveUnit("tonne")).toBeNull();
    expect(resolveUnit("mt")).toBeNull();
    expect(resolveUnit("t")).toBeNull();
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

describe("custom units (extraUnits registry, plan 075)", () => {
  const extra: ExtraUnits = {
    drum: { dimension: "mass", perCanonical: 200000 }, // 200 kg
    tote: { dimension: "volume", perCanonical: 1_000_000 }, // 1000 L
    roll: { dimension: "count", perCanonical: 500 }, // 500 labels / roll
  };

  it("resolves + classifies a custom unit only when the registry is passed", () => {
    expect(dimensionOf("drum")).toBeNull(); // unknown without the registry (fail-safe)
    expect(dimensionOf("drum", extra)).toBe("mass");
    expect(resolveUnit("drum", extra)).toBe("drum");
    expect(resolveUnit("DRUM", extra)).toBe("drum"); // case-insensitive
    expect(resolveUnit("drum")).toBeNull();
  });

  it("converts a custom unit to/from canonical + built-ins", () => {
    expect(convert(2, "drum", "g", extra)).toBe(400000); // 2 × 200 kg
    expect(convert(1, "drum", "kg", extra)).toBe(200);
    expect(convert(1000, "g", "drum", extra)).toBe(0.005); // built-in → custom
    expect(convert(1, "tote", "L", extra)).toBe(1000);
    expect(convert(3, "roll", "unit", extra)).toBe(1500); // 3 rolls × 500 labels
    expect(toCanonical(2, "drum", extra)).toEqual({ amount: 400000, unit: "g" });
  });

  it("still refuses cross-dimension + unknown customs", () => {
    expect(convert(1, "drum", "L", extra)).toBeNull(); // mass↔volume
    expect(convert(1, "drum", "g")).toBeNull(); // registry omitted
    expect(convert(1, "bogus", "g", extra)).toBeNull();
  });

  it("built-ins always win over a custom of the same name (no shadowing)", () => {
    const shady: ExtraUnits = { kg: { dimension: "count", perCanonical: 1 } };
    expect(convert(1, "kg", "g", shady)).toBe(1000); // built-in kg, NOT the custom
    expect(dimensionOf("kg", shady)).toBe("mass");
  });

  it("toExtraUnits maps rows + skips malformed (defensive)", () => {
    const rows = [
      { normalizedName: "Drum", dimension: "mass", perCanonical: "200000" },
      { normalizedName: "bad-dim", dimension: "furlong", perCanonical: 5 },
      { normalizedName: "bad-factor", dimension: "mass", perCanonical: 0 },
      { normalizedName: "roll", dimension: "count", perCanonical: 500 },
    ];
    const mapped = toExtraUnits(rows);
    expect(mapped).toEqual({
      drum: { dimension: "mass", perCanonical: 200000 },
      roll: { dimension: "count", perCanonical: 500 },
    });
    expect(convert(1, "drum", "g", mapped)).toBe(200000);
  });
});

describe("MEASURE_UNITS", () => {
  it("exposes the known units for dropdowns", () => {
    expect(MEASURE_UNITS).toContain("gal");
    expect(MEASURE_UNITS).toContain("fl oz");
    expect(MEASURE_UNITS).toContain("g");
    expect(MEASURE_UNITS).toContain("unit");
    expect(MEASURE_UNITS).toContain("ton");
  });
});
