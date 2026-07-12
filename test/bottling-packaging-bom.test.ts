import { describe, it, expect } from "vitest";
import { theoreticalConsumption, casesFor, guessPackagingFactor, BOTTLES_PER_CASE } from "@/lib/bottling/packaging-bom";

// Plan 056 — the packaging BoM consumption math (auto-derive from bottle count via a per-line factor).

describe("casesFor", () => {
  it("rounds a partial case up (a fresh box for the 1,201st bottle)", () => {
    expect(casesFor(1200)).toBe(100);
    expect(casesFor(1201)).toBe(101);
    expect(casesFor(0)).toBe(0);
    expect(BOTTLES_PER_CASE).toBe(12);
  });
});

describe("theoreticalConsumption", () => {
  it("per-bottle line: bottles × factor (cork 1/bottle)", () => {
    expect(theoreticalConsumption({ per: "bottle", factor: 1 }, 1200)).toBe(1200);
  });
  it("per-bottle line with a 2/bottle factor (front + back label)", () => {
    expect(theoreticalConsumption({ per: "bottle", factor: 2 }, 1200)).toBe(2400);
  });
  it("per-case line: cases × factor (case box 1/case)", () => {
    expect(theoreticalConsumption({ per: "case", factor: 1 }, 1200)).toBe(100);
    expect(theoreticalConsumption({ per: "case", factor: 1 }, 1201)).toBe(101);
  });
  it("zero/invalid inputs → 0 (never negative or NaN)", () => {
    expect(theoreticalConsumption({ per: "bottle", factor: 1 }, 0)).toBe(0);
    expect(theoreticalConsumption({ per: "bottle", factor: 0 }, 1200)).toBe(0);
  });
});

describe("guessPackagingFactor", () => {
  it("case/box/carton materials → per case, 1 each", () => {
    expect(guessPackagingFactor("Case box 12-slot")).toEqual({ per: "case", factor: 1 });
    expect(guessPackagingFactor("Shipper carton")).toEqual({ per: "case", factor: 1 });
  });
  it("glass/cork/capsule/label → per bottle, 1 each", () => {
    expect(guessPackagingFactor("750ml Bordeaux glass")).toEqual({ per: "bottle", factor: 1 });
    expect(guessPackagingFactor("Natural cork 44x24")).toEqual({ per: "bottle", factor: 1 });
    expect(guessPackagingFactor("Tin capsule burgundy")).toEqual({ per: "bottle", factor: 1 });
    expect(guessPackagingFactor("Front label")).toEqual({ per: "bottle", factor: 1 });
  });
});
