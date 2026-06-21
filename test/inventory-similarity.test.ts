import { describe, it, expect } from "vitest";
import { normalize, closestMatch } from "@/lib/inventory/similarity";

describe("normalize", () => {
  it("lowercases, trims, and collapses inner whitespace", () => {
    expect(normalize("  Wine   Bar ")).toBe("wine bar");
  });
  it("strips trailing punctuation and surrounding noise", () => {
    expect(normalize("Merch.")).toBe("merch");
    expect(normalize("T-Shirt!")).toBe("t-shirt");
  });
  it("treats a hyphen/space/case mix as the same shape", () => {
    expect(normalize("t shirt")).toBe(normalize("T Shirt"));
  });
});

describe("closestMatch", () => {
  it("returns null when the value exactly matches an existing name (case-insensitive)", () => {
    expect(closestMatch("Wine", ["Wine", "Merchandise"])).toBeNull();
    expect(closestMatch("wine", ["Wine"])).toBeNull();
  });

  it("suggests a near-duplicate (abbreviation)", () => {
    const r = closestMatch("Merch", ["Merchandise", "Wine"]);
    expect(r?.match).toBe("Merchandise");
    expect(r!.score).toBeGreaterThanOrEqual(0.8);
  });

  it("suggests across spacing/case/punctuation differences", () => {
    const r = closestMatch("t shirt", ["T-Shirt", "Wine"]);
    expect(r?.match).toBe("T-Shirt");
  });

  it("suggests on a single-character typo", () => {
    const r = closestMatch("Merchadise", ["Merchandise"]);
    expect(r?.match).toBe("Merchandise");
  });

  it("returns null for unrelated values below threshold", () => {
    expect(closestMatch("Barrel", ["Apparel"])).toBeNull();
    expect(closestMatch("Glassware", ["Wine"])).toBeNull();
  });

  it("returns null when there are no candidates", () => {
    expect(closestMatch("Merch", [])).toBeNull();
  });

  it("picks the highest-scoring candidate deterministically", () => {
    // "Merch" is closer to "Merchandise" than to "Merlot"
    const r = closestMatch("Merch", ["Merlot", "Merchandise"]);
    expect(r?.match).toBe("Merchandise");
  });

  it("respects a custom threshold", () => {
    // "Cabernet" vs "Cabernay": two substitutions over 8 chars -> ~0.75 similarity,
    // below the 0.8 default but above a loosened 0.7.
    expect(closestMatch("Cabernet", ["Cabernay"])).toBeNull();
    const loose = closestMatch("Cabernet", ["Cabernay"], { threshold: 0.7 });
    expect(loose?.match).toBe("Cabernay");
  });
});
