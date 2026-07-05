import { describe, it, expect } from "vitest";
import { chaptalization, waterDilution } from "@/lib/winemaking-calc/dilution";
import { DomainError } from "@/lib/winemaking-calc/validate";

describe("water dilution", () => {
  it("lowering 1000 L from 25 → 22 °Bx adds a positive, sane water volume (≈150.8 L)", () => {
    const water = waterDilution({ volume: 1000, volumeUnit: "L", currentBrix: 25, targetBrix: 22, outUnit: "L" });
    expect(water).toBeGreaterThan(0);
    expect(water).toBeCloseTo(150.8, 0);
  });
  it("rejects negative current Brix", () => {
    expect(() => waterDilution({ volume: 1000, volumeUnit: "L", currentBrix: -1, targetBrix: 22, outUnit: "L" })).toThrow(
      DomainError,
    );
  });
  it("rejects zero target Brix (division)", () => {
    expect(() => waterDilution({ volume: 1000, volumeUnit: "L", currentBrix: 25, targetBrix: 0, outUnit: "L" })).toThrow(
      DomainError,
    );
  });
});

describe("chaptalization", () => {
  it("raising Brix adds positive sugar", () => {
    const sugar = chaptalization({ volume: 1000, volumeUnit: "L", currentBrix: 20, targetBrix: 23, denom: 100, outUnit: "L" });
    expect(sugar).toBeGreaterThan(0);
  });
  it("rejects negative current Brix (LOCKED #6)", () => {
    expect(() =>
      chaptalization({ volume: 1000, volumeUnit: "L", currentBrix: -2, targetBrix: 23, denom: 100, outUnit: "L" }),
    ).toThrow(DomainError);
  });
  it("rejects denom == target (division)", () => {
    expect(() =>
      chaptalization({ volume: 1000, volumeUnit: "L", currentBrix: 20, targetBrix: 23, denom: 23, outUnit: "L" }),
    ).toThrow(DomainError);
  });
});
