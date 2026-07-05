import { describe, it, expect } from "vitest";
import { fortificationPearson, sweetSpotLadder } from "@/lib/winemaking-calc/fortification";
import { DomainError } from "@/lib/winemaking-calc/validate";

describe("Pearson's square fortification", () => {
  it("1000 L wine 12% → 18% with 96% spirit → 76.92 L", () => {
    const v = fortificationPearson({ volume: 1000, volumeUnit: "L", initAlc: 96, actualAlc: 12, targetAlc: 18, outUnit: "L" });
    expect(v).toBeCloseTo(76.92, 2);
  });
  it("throws when spirit is not stronger than the target (no division by zero / negative)", () => {
    expect(() =>
      fortificationPearson({ volume: 1000, volumeUnit: "L", initAlc: 18, actualAlc: 12, targetAlc: 18, outUnit: "L" }),
    ).toThrow(DomainError);
  });
  it("throws when wine already meets the target", () => {
    expect(() =>
      fortificationPearson({ volume: 1000, volumeUnit: "L", initAlc: 96, actualAlc: 18, targetAlc: 18, outUnit: "L" }),
    ).toThrow(DomainError);
  });
});

describe("sweet-spot ladder", () => {
  it("returns 29 rows stepping alc down 0.1%/row", () => {
    const rows = sweetSpotLadder({ highAlc: 20, lowAlc: 10, startAlc: 15, targetAlc: 14, batchVolume: 100 });
    expect(rows).toHaveLength(29);
    expect(rows[0].alc).toBeCloseTo(15, 2);
    expect(rows[1].alc).toBeCloseTo(14.9, 2);
  });
  it("splits the batch into high + low components summing to the batch", () => {
    const rows = sweetSpotLadder({ highAlc: 20, lowAlc: 10, startAlc: 15, targetAlc: 14, batchVolume: 100 });
    expect(rows[0].highComponent + rows[0].lowComponent).toBeCloseTo(100, 6);
    // At 15% between 10 and 20: half high, half low.
    expect(rows[0].highComponent).toBeCloseTo(50, 6);
  });
  it("rejects equal high/low alcohol (division) and non-positive batch volume", () => {
    expect(() => sweetSpotLadder({ highAlc: 15, lowAlc: 15, startAlc: 15, targetAlc: 14, batchVolume: 100 })).toThrow(DomainError);
    expect(() => sweetSpotLadder({ highAlc: 20, lowAlc: 10, startAlc: 15, targetAlc: 14, batchVolume: 0 })).toThrow(DomainError);
  });
});
