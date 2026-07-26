import { describe, expect, it } from "vitest";
import {
  compassLabel,
  compassToDeg,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  galPerAcreToLPerHa,
  lPerHaToGalPerAcre,
  kphToMph,
  mphToKph,
  toCanonicalQuantity,
  acresToHectares,
  hectaresToAcres,
} from "@/lib/spray/units-core";

describe("S3a units — canonical quantity (KD-5)", () => {
  it("converts volumes to liters", () => {
    expect(toCanonicalQuantity(1, "GAL")!.value).toBeCloseTo(3.785411784, 9);
    expect(toCanonicalQuantity(4, "QT")!.value).toBeCloseTo(3.785411784, 9);
    expect(toCanonicalQuantity(8, "PT")!.value).toBeCloseTo(3.785411784, 9);
    expect(toCanonicalQuantity(128, "FLOZ")!.value).toBeCloseTo(3.785411784, 9);
    expect(toCanonicalQuantity(1000, "ML")!.value).toBeCloseTo(1, 9);
    expect(toCanonicalQuantity(2, "L")).toEqual({ value: 2, dimension: "VOLUME" });
  });

  it("converts masses to kilograms", () => {
    expect(toCanonicalQuantity(1, "LB")!.value).toBeCloseTo(0.45359237, 9);
    expect(toCanonicalQuantity(16, "OZ")!.value).toBeCloseTo(0.45359237, 9);
    expect(toCanonicalQuantity(500, "G")!.value).toBeCloseTo(0.5, 9);
    expect(toCanonicalQuantity(3, "KG")).toEqual({ value: 3, dimension: "MASS" });
  });

  it("an unknown unit returns null — never 0 (rule §3.6)", () => {
    expect(toCanonicalQuantity(5, "BUSHEL" as never)).toBeNull();
    expect(toCanonicalQuantity(5, "" as never)).toBeNull();
  });

  it("unusable values return null — never 0", () => {
    expect(toCanonicalQuantity(0, "GAL")).toBeNull();
    expect(toCanonicalQuantity(-2, "LB")).toBeNull();
    expect(toCanonicalQuantity(NaN, "L")).toBeNull();
    expect(toCanonicalQuantity(null, "L")).toBeNull();
  });
});

describe("S3a units — round trips", () => {
  it("gal/acre ↔ L/ha", () => {
    expect(lPerHaToGalPerAcre(galPerAcreToLPerHa(50))).toBeCloseTo(50, 9);
    // 100 gal/acre ≈ 935.4 L/ha (the standard dilute reference)
    expect(galPerAcreToLPerHa(100)).toBeCloseTo(935.396, 1);
  });
  it("mph ↔ kph", () => {
    expect(kphToMph(mphToKph(12.5))).toBeCloseTo(12.5, 9);
  });
  it("°F ↔ °C", () => {
    expect(fahrenheitToCelsius(95)).toBeCloseTo(35, 9);
    expect(celsiusToFahrenheit(fahrenheitToCelsius(88))).toBeCloseTo(88, 9);
  });
  it("acres ↔ hectares", () => {
    expect(acresToHectares(1)).toBeCloseTo(0.40468564224, 6);
    expect(hectaresToAcres(acresToHectares(7.3))).toBeCloseTo(7.3, 9);
  });
});

describe("S3a units — compass (KD-15)", () => {
  it("boundary cases: 0° → N, 348.75° → N, 11.25° → NNE", () => {
    expect(compassLabel(0)).toBe("N");
    expect(compassLabel(348.75)).toBe("N");
    expect(compassLabel(11.25)).toBe("NNE");
  });
  it("cardinal centers", () => {
    expect(compassLabel(90)).toBe("E");
    expect(compassLabel(180)).toBe("S");
    expect(compassLabel(270)).toBe("W");
    expect(compassLabel(315)).toBe("NW");
  });
  it("wraps and rejects unusable input", () => {
    expect(compassLabel(360)).toBe("N");
    expect(compassLabel(-45)).toBe("NW");
    expect(compassLabel(null)).toBeNull();
    expect(compassLabel(NaN)).toBeNull();
  });
  it("CALM and VARIABLE have no bearing (the reason the enum is primary)", () => {
    expect(compassToDeg("CALM")).toBeNull();
    expect(compassToDeg("VARIABLE")).toBeNull();
    expect(compassToDeg("NNE")).toBeCloseTo(22.5, 9);
  });
});
