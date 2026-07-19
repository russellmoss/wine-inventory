import { describe, it, expect } from "vitest";
import {
  theoreticalConsumption,
  casesFor,
  guessPackagingFactor,
  BOTTLES_PER_CASE,
  classifyPackagingRole,
  missingRequiredPackaging,
  missingRolesForMaterials,
} from "@/lib/bottling/packaging-bom";

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

// P0 — mandatory packaging: a bottling run must include a bottle, a closure (cork/screwcap/…) and a label.
describe("classifyPackagingRole", () => {
  it("classifies bottles (glass/flute/magnum/split)", () => {
    expect(classifyPackagingRole("750ml Bordeaux glass")).toBe("bottle");
    expect(classifyPackagingRole("Champagne flute bottle")).toBe("bottle");
    expect(classifyPackagingRole("Magnum 1.5L")).toBe("bottle");
    expect(classifyPackagingRole("Split 187ml")).toBe("bottle");
  });
  it("classifies closures (cork/screwcap/stelvin/crown/zork)", () => {
    expect(classifyPackagingRole("Natural cork 44x24")).toBe("closure");
    expect(classifyPackagingRole("Stelvin screwcap")).toBe("closure");
    expect(classifyPackagingRole("Screw cap 30x60")).toBe("closure");
    expect(classifyPackagingRole("Crown cap")).toBe("closure");
    expect(classifyPackagingRole("Zork closure")).toBe("closure");
  });
  it("classifies labels", () => {
    expect(classifyPackagingRole("Front label")).toBe("label");
    expect(classifyPackagingRole("Back labels gloss")).toBe("label");
  });
  it("a capsule/foil is NOT a closure (and not any mandatory role)", () => {
    expect(classifyPackagingRole("Tin capsule burgundy")).toBeNull();
    expect(classifyPackagingRole("Foil sleeve")).toBeNull();
  });
  it("other dry goods (case box) are no mandatory role", () => {
    expect(classifyPackagingRole("Case box 12-slot")).toBeNull();
    expect(classifyPackagingRole("Shipper carton")).toBeNull();
  });
});

describe("missingRequiredPackaging", () => {
  it("all three present ⇒ nothing missing", () => {
    expect(missingRequiredPackaging(["bottle", "closure", "label"])).toEqual([]);
  });
  it("reports the missing roles in display order", () => {
    expect(missingRequiredPackaging(["bottle"]).map((m) => m.role)).toEqual(["closure", "label"]);
    expect(missingRequiredPackaging(["bottle", "label"]).map((m) => m.role)).toEqual(["closure"]);
    expect(missingRequiredPackaging([]).map((m) => m.role)).toEqual(["bottle", "closure", "label"]);
  });
});

describe("missingRolesForMaterials (server guard)", () => {
  const bottle = { name: "750ml glass", kind: "PACKAGING" };
  const cork = { name: "Natural cork", kind: "PACKAGING" };
  const label = { name: "Front label", kind: "PACKAGING" };
  const capsule = { name: "Tin capsule", kind: "PACKAGING" };
  it("passes when a bottle, a closure and a label are all consumed", () => {
    expect(missingRolesForMaterials([bottle, cork, label])).toEqual([]);
  });
  it("blocks a run with a bottle + label but NO closure (the Big Mike Big Red bug)", () => {
    expect(missingRolesForMaterials([bottle, label]).map((m) => m.role)).toEqual(["closure"]);
  });
  it("a capsule does not satisfy the closure requirement", () => {
    expect(missingRolesForMaterials([bottle, capsule, label]).map((m) => m.role)).toEqual(["closure"]);
  });
  it("an empty packaging BoM is missing all three", () => {
    expect(missingRolesForMaterials([]).map((m) => m.role)).toEqual(["bottle", "closure", "label"]);
  });
});
