import { describe, it, expect } from "vitest";
import { resolveWeightKg, resolveWeightUnit, describeWeight, KG_PER_SHORT_TON } from "@/lib/assistant/weight";

// Issue #311 — the DETERMINISTIC guarantee behind the destem/crush unit fix. The model silently turned
// "2 tons" into 1000 kg; this pins the conversion in code so that class of error can't recur regardless of
// what the model does. If any of these regress, the money/lineage weight is wrong at intake.

describe("resolveWeightKg — the ton conversion the model got wrong", () => {
  it("2 tons is a US short ton (1,814.37 kg), NEVER 1000 kg", () => {
    const r = resolveWeightKg(2, "tons");
    expect(r).not.toBeNull();
    expect(r!.kg).toBeCloseTo(1814.36948, 5);
    // The exact bug: 1000 kg must never be produced for 2 tons.
    expect(r!.kg).not.toBe(1000);
    expect(r!.unitKey).toBe("short ton");
    expect(r!.display).toBe("2 short tons");
  });

  it("2 metric tonnes is 2000 kg (explicit metric word required)", () => {
    expect(resolveWeightKg(2, "tonne")!.kg).toBe(2000);
    expect(resolveWeightKg(2, "tonnes")!.kg).toBe(2000);
    expect(resolveWeightKg(2, "metric ton")!.kg).toBe(2000);
    expect(resolveWeightKg(2, "t")!.kg).toBe(2000);
    expect(resolveWeightKg(2, "mt")!.kg).toBe(2000);
  });

  it("short and metric ton differ (~10%) — they must not collapse onto one factor", () => {
    expect(resolveWeightKg(1, "ton")!.kg).toBeCloseTo(907.18474, 5);
    expect(resolveWeightKg(1, "tonne")!.kg).toBe(1000);
    expect(KG_PER_SHORT_TON).toBeCloseTo(907.18474, 5);
  });
});

describe("resolveWeightKg — the everyday units", () => {
  it("kg is identity and the default when no unit is given", () => {
    expect(resolveWeightKg(1200, "kg")!.kg).toBe(1200);
    expect(resolveWeightKg(1200)!.kg).toBe(1200);
    expect(resolveWeightKg(1200, undefined)!.kg).toBe(1200);
    expect(resolveWeightKg(1200, "")!.kg).toBe(1200);
  });

  it("lb → kg (1200 lb = 544.31 kg)", () => {
    expect(resolveWeightKg(1200, "lb")!.kg).toBeCloseTo(544.310844, 5);
    expect(resolveWeightKg(1200, "lbs")!.kg).toBeCloseTo(544.310844, 5);
    expect(resolveWeightKg(1200, "pounds")!.kg).toBeCloseTo(544.310844, 5);
  });

  it("g and mg convert down", () => {
    expect(resolveWeightKg(500, "g")!.kg).toBe(0.5);
    expect(resolveWeightKg(2000, "mg")!.kg).toBe(0.002);
  });

  it("aliases and casing resolve", () => {
    expect(resolveWeightUnit("Tonnes")).toBe("tonne");
    expect(resolveWeightUnit("TON")).toBe("short ton");
    expect(resolveWeightUnit("Kilograms")).toBe("kg");
    expect(resolveWeightUnit("  lbs ")).toBe("lb");
  });
});

describe("resolveWeightKg — fails closed (never a fabricated number)", () => {
  it("an unknown unit returns null, not a guess", () => {
    expect(resolveWeightKg(2, "barrels")).toBeNull();
    expect(resolveWeightKg(2, "L")).toBeNull(); // volume is not a weight
    expect(resolveWeightUnit("qux")).toBeNull();
  });

  it("a non-finite or negative value returns null", () => {
    expect(resolveWeightKg(NaN, "kg")).toBeNull();
    expect(resolveWeightKg(Infinity, "kg")).toBeNull();
    expect(resolveWeightKg(-5, "ton")).toBeNull();
  });
});

describe("describeWeight — the confirm-card interpretation string", () => {
  it("spells out a ton so a short-vs-metric slip is visible before applying", () => {
    expect(describeWeight(resolveWeightKg(2, "tons")!)).toBe("2 short tons (1,814.37 kg)");
    expect(describeWeight(resolveWeightKg(2, "tonne")!)).toBe("2 tonnes (2,000 kg)");
  });

  it("collapses to plain kg when there is nothing to disambiguate", () => {
    expect(describeWeight(resolveWeightKg(1200, "kg")!)).toBe("1,200 kg");
    expect(describeWeight(resolveWeightKg(1200)!)).toBe("1,200 kg");
  });
});
