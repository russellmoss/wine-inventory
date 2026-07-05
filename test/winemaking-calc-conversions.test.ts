import { describe, it, expect } from "vitest";
import { convert, convertAll, convertTemp, unitsFor } from "@/lib/winemaking-calc/conversions";
import { DomainError } from "@/lib/winemaking-calc/validate";

describe("factor-based conversions", () => {
  it("volume: 1 US gal → 3.78541 L", () => {
    expect(convert("volume", 1, "gal", "L")).toBeCloseTo(3.78541178, 5);
  });
  it("area: 1 acre → 4046.856 m²", () => {
    expect(convert("area", 1, "acre", "m²")).toBeCloseTo(4046.85642, 3);
  });
  it("mass: 1 kg → 1000 g and round-trips", () => {
    expect(convert("mass", 1, "kg", "g")).toBeCloseTo(1000, 6);
    expect(convert("mass", convert("mass", 5, "lb", "g"), "g", "lb")).toBeCloseTo(5, 6);
  });
  it("distance: 1 mi → 1609.344 m", () => {
    expect(convert("distance", 1, "mi", "m")).toBeCloseTo(1609.344, 3);
  });
  it("pressure: 1 atm → 101325 Pa", () => {
    expect(convert("pressure", 1, "atm", "Pa")).toBeCloseTo(101325, 3);
  });
  it("convertAll fills every field", () => {
    const all = convertAll("volume", 1, "L");
    expect(all.mL).toBeCloseTo(1000, 6);
    expect(all.hL).toBeCloseTo(0.01, 6);
    expect(Object.keys(all)).toEqual(unitsFor("volume"));
  });
  it("throws on unknown units", () => {
    expect(() => convert("volume", 1, "furlong", "L")).toThrow(DomainError);
  });
  it("convertAll rejects a non-finite value (no silent NaN)", () => {
    expect(() => convertAll("volume", NaN, "L")).toThrow(DomainError);
  });
});

describe("temperature", () => {
  it("32°F = 0°C", () => {
    expect(convertTemp(32, "F", "C")).toBeCloseTo(0, 6);
  });
  it("100°C = 212°F", () => {
    expect(convertTemp(100, "C", "F")).toBeCloseTo(212, 6);
  });
  it("identity when from === to", () => {
    expect(convertTemp(15, "C", "C")).toBe(15);
  });
  it("rejects an invalid temperature unit", () => {
    // @ts-expect-error — exercising the runtime guard with a bad unit
    expect(() => convertTemp(20, "K", "C")).toThrow(DomainError);
  });
});
