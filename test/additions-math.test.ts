import { describe, it, expect } from "vitest";
import {
  computeAdditionTotal,
  RATE_BASES,
  RATE_BASIS_LABELS,
  VOLUME_EFFECT,
} from "@/lib/cellar/additions-math";

describe("computeAdditionTotal", () => {
  it("g/hL → grams: rate * V / 100", () => {
    // 30 g/hL into 450 L = 30 * 450 / 100 = 135 g (the canonical example from the plan)
    expect(computeAdditionTotal(30, "G_HL", 450)).toEqual({ total: 135, unit: "g" });
    expect(computeAdditionTotal(50, "G_HL", 225)).toEqual({ total: 112.5, unit: "g" });
  });

  it("mg/L (ppm) → grams: rate * V / 1000", () => {
    // 40 ppm SO₂ into 1000 L = 40 * 1000 / 1000 = 40 g
    expect(computeAdditionTotal(40, "MG_L", 1000)).toEqual({ total: 40, unit: "g" });
    // 50 ppm into 225 L = 11.25 g
    expect(computeAdditionTotal(50, "MG_L", 225)).toEqual({ total: 11.25, unit: "g" });
  });

  it("g/L → grams: rate * V", () => {
    expect(computeAdditionTotal(2, "G_L", 225)).toEqual({ total: 450, unit: "g" });
  });

  it("mL/L → milliliters: rate * V (unit is mL, not g)", () => {
    expect(computeAdditionTotal(0.5, "ML_L", 450)).toEqual({ total: 225, unit: "mL" });
  });

  it("1 g/hL == 10 mg/L == 10 ppm (domain identity holds through the math)", () => {
    const V = 600;
    const aGhl = computeAdditionTotal(1, "G_HL", V).total;
    const aPpm = computeAdditionTotal(10, "MG_L", V).total;
    expect(aGhl).toBe(aPpm);
  });

  it("rounds to centiliter/centigram exactly (no float drift)", () => {
    // 33 g/hL into 333 L = 109.89 g
    expect(computeAdditionTotal(33, "G_HL", 333).total).toBe(109.89);
  });

  it("zero rate yields zero total", () => {
    expect(computeAdditionTotal(0, "G_HL", 450)).toEqual({ total: 0, unit: "g" });
  });

  it("throws on an unknown basis", () => {
    // @ts-expect-error deliberately invalid basis
    expect(() => computeAdditionTotal(10, "PCT", 100)).toThrow();
  });

  it("throws on a negative rate or non-positive volume", () => {
    expect(() => computeAdditionTotal(-1, "G_HL", 100)).toThrow();
    expect(() => computeAdditionTotal(10, "G_HL", 0)).toThrow();
    expect(() => computeAdditionTotal(10, "G_HL", -5)).toThrow();
  });
});

describe("RATE_BASES vocabulary", () => {
  it("exposes the four supported bases with labels", () => {
    expect([...RATE_BASES]).toEqual(["G_HL", "MG_L", "G_L", "ML_L"]);
    for (const b of RATE_BASES) {
      expect(typeof RATE_BASIS_LABELS[b]).toBe("string");
      expect(RATE_BASIS_LABELS[b].length).toBeGreaterThan(0);
    }
  });
});

describe("VOLUME_EFFECT classification", () => {
  it("classifies each Phase 3 op by its volume effect", () => {
    expect(VOLUME_EFFECT.ADDITION).toBe("neutral");
    expect(VOLUME_EFFECT.FINING).toBe("neutral");
    expect(VOLUME_EFFECT.CAP_MGMT).toBe("neutral");
    expect(VOLUME_EFFECT.TOPPING).toBe("adds");
    expect(VOLUME_EFFECT.FILTRATION).toBe("removes");
    expect(VOLUME_EFFECT.LOSS).toBe("removes");
  });
});
