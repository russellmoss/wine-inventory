import { describe, it, expect } from "vitest";
import { rankMaterials } from "@/lib/inventory/material-search";

// A representative additive catalog.
const NAMES = [
  "Potassium Metabisulfite (KMBS)",
  "Bentonite",
  "Tartaric Acid",
  "DAP Nutrient",
  "Fermaid O",
  "EC-1118 Yeast",
  "Egg White",
];

const rank = (q: string, opts?: { threshold?: number }) => rankMaterials(q, NAMES, (n) => n, opts);

describe("rankMaterials", () => {
  it("empty query returns the list unchanged (identity order)", () => {
    expect(rank("")).toEqual(NAMES);
    expect(rank("   ")).toEqual(NAMES);
  });

  it("exact substring wins (case-insensitive)", () => {
    expect(rank("bentonite")[0]).toBe("Bentonite");
    expect(rank("BENTONITE")[0]).toBe("Bentonite");
  });

  it("abbreviation inside parentheses matches via substring ('kmbs')", () => {
    const r = rank("kmbs");
    expect(r[0]).toBe("Potassium Metabisulfite (KMBS)");
  });

  it("prefix match ranks the item first ('tartar' -> Tartaric Acid)", () => {
    expect(rank("tartar")[0]).toBe("Tartaric Acid");
  });

  it("typo still finds the product via fuzzy fallback ('bentonit')", () => {
    expect(rank("bentonit")).toContain("Bentonite");
  });

  it("mid-word substring matches ('acid')", () => {
    expect(rank("acid")).toContain("Tartaric Acid");
  });

  it("no match returns empty", () => {
    expect(rank("zzzqqq", { threshold: 0.6 })).toEqual([]);
  });

  it("is stable for ties (preserves original order among equal scores)", () => {
    // Two names both contain "a" as a substring — order should follow the input order.
    const r = rank("a");
    const idxTartaric = r.indexOf("Tartaric Acid");
    const idxDap = r.indexOf("DAP Nutrient");
    // both are substring hits (score 0.9); Tartaric Acid appears before DAP Nutrient in NAMES
    expect(idxTartaric).toBeGreaterThanOrEqual(0);
    expect(idxDap).toBeGreaterThanOrEqual(0);
    expect(idxTartaric).toBeLessThan(idxDap);
  });
});
