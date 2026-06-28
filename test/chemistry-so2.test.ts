import { describe, it, expect } from "vitest";
import { molecularSO2, SO2_PKA } from "@/lib/chemistry/so2";

describe("molecularSO2", () => {
  it("uses pKa 1.81 by default and echoes it back", () => {
    const r = molecularSO2({ freeSO2: 40, pH: 3.5 });
    expect(r).not.toBeNull();
    expect(r!.pKa).toBe(SO2_PKA);
    expect(r!.freeSO2).toBe(40);
    expect(r!.pH).toBe(3.5);
  });

  it("matches reference points (free 40 @ pH 3.5 ≈ 0.80; free 30 @ pH 3.0 ≈ 1.82)", () => {
    expect(molecularSO2({ freeSO2: 40, pH: 3.5 })!.molecularSO2).toBeCloseTo(0.8, 2);
    expect(molecularSO2({ freeSO2: 30, pH: 3.0 })!.molecularSO2).toBeCloseTo(1.82, 2);
  });

  it("at pH == pKa the active fraction is exactly half the free SO₂", () => {
    expect(molecularSO2({ freeSO2: 40, pH: SO2_PKA })!.molecularSO2).toBeCloseTo(20, 6);
  });

  it("matches the closed-form formula for an arbitrary point", () => {
    const free = 55;
    const pH = 3.62;
    const expected = free / (1 + Math.pow(10, pH - SO2_PKA));
    expect(molecularSO2({ freeSO2: free, pH })!.molecularSO2).toBeCloseTo(expected, 10);
  });

  it("honors a custom pKa", () => {
    const r = molecularSO2({ freeSO2: 40, pH: 3.5, pKa: 1.9 });
    expect(r!.pKa).toBe(1.9);
    expect(r!.molecularSO2).toBeCloseTo(40 / (1 + Math.pow(10, 3.5 - 1.9)), 10);
  });

  it("returns null on missing / non-finite / negative inputs", () => {
    expect(molecularSO2({ freeSO2: null, pH: 3.5 })).toBeNull();
    expect(molecularSO2({ freeSO2: 40, pH: null })).toBeNull();
    expect(molecularSO2({ freeSO2: undefined, pH: undefined })).toBeNull();
    expect(molecularSO2({ freeSO2: NaN, pH: 3.5 })).toBeNull();
    expect(molecularSO2({ freeSO2: 40, pH: Infinity })).toBeNull();
    expect(molecularSO2({ freeSO2: -5, pH: 3.5 })).toBeNull();
  });
});
