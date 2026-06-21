import { describe, it, expect } from "vitest";
import { normalize, closestMatch, canonicalKey, canonicalNameMap } from "@/lib/inventory/similarity";

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
  it("keeps accented and non-Latin letters (Unicode-aware)", () => {
    expect(normalize("Café")).toBe("café");
    expect(normalize("  Éire ")).toBe("éire");
  });
  it("reduces an all-punctuation/empty name to the empty string", () => {
    expect(normalize("!!!")).toBe("");
    expect(normalize("   ")).toBe("");
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

  it("returns null when the value normalizes to nothing", () => {
    expect(closestMatch("!!!", ["Merchandise"])).toBeNull();
  });

  it("skips candidates that normalize to nothing", () => {
    // The only real candidate is too far -> no suggestion, and the empty one is ignored.
    expect(closestMatch("Glassware", ["!!!", "Wine"])).toBeNull();
  });

  it("does not give a prefix bonus to a sub-minimum (3-char) prefix", () => {
    // "Bar" is a prefix of "Barrel" but too short to count as an abbreviation,
    // so plain edit-distance (0.5) keeps it below the 0.8 threshold.
    expect(closestMatch("Barrel", ["Bar"])).toBeNull();
  });

  it("picks the highest-scoring candidate deterministically", () => {
    // "Merch" is closer to "Merchandise" than to "Merlot"
    const r = closestMatch("Merch", ["Merlot", "Merchandise"]);
    expect(r?.match).toBe("Merchandise");
  });

  it("keeps the first candidate on a genuine score tie", () => {
    // "Cat" -> "Bat" and "Cat" -> "Hat" are both one substitution (same score);
    // strict '>' comparison keeps the first-listed candidate.
    const r = closestMatch("Cat", ["Bat", "Hat"], { threshold: 0.6 });
    expect(r?.match).toBe("Bat");
  });

  it("includes a match exactly at the threshold (inclusive boundary)", () => {
    // "abcde" vs "abcdX": one substitution over 5 chars -> similarity exactly 0.8.
    const r = closestMatch("abcde", ["abcdX"], { threshold: 0.8 });
    expect(r?.match).toBe("abcdX");
    expect(r!.score).toBeCloseTo(0.8, 5);
  });

  it("respects a custom threshold", () => {
    // "Cabernet" vs "Cabernay": two substitutions over 8 chars -> ~0.75 similarity,
    // below the 0.8 default but above a loosened 0.7.
    expect(closestMatch("Cabernet", ["Cabernay"])).toBeNull();
    const loose = closestMatch("Cabernet", ["Cabernay"], { threshold: 0.7 });
    expect(loose?.match).toBe("Cabernay");
  });
});

describe("canonicalKey", () => {
  it("lowercases and trims (case + surrounding whitespace insensitive)", () => {
    expect(canonicalKey("  Wine Bar ")).toBe("wine bar");
    expect(canonicalKey("CELLAR")).toBe("cellar");
  });
  it("keeps internal punctuation and spacing (only case/edges fold)", () => {
    expect(canonicalKey("T-Shirt")).toBe("t-shirt");
    expect(canonicalKey("Wine  Bar")).not.toBe(canonicalKey("Wine Bar")); // internal spacing preserved
  });
});

describe("canonicalNameMap", () => {
  it("uses existing registry casing when a value matches case-insensitively", () => {
    const m = canonicalNameMap(["Wine Bar"], ["wine bar"]);
    expect(m.get("wine bar")).toBe("Wine Bar");
  });

  it("collapses within-upload case variants to the first-seen casing", () => {
    const m = canonicalNameMap([], ["Cellar", "cellar", "CELLAR"]);
    expect(m.get("cellar")).toBe("Cellar");
  });

  it("prefers existing casing over upload casing", () => {
    const m = canonicalNameMap(["Cellar"], ["CELLAR", "cellar"]);
    expect(m.get("cellar")).toBe("Cellar");
  });

  it("ignores empty / whitespace-only names", () => {
    const m = canonicalNameMap(["", "   ", "Wine"], []);
    expect(m.has("")).toBe(false);
    expect(m.get("wine")).toBe("Wine");
  });

  it("lets a lookup of any casing resolve to the canonical display name", () => {
    const m = canonicalNameMap(["Wine Bar"], ["Tasting Room", "tasting room"]);
    expect(m.get(canonicalKey("WINE BAR"))).toBe("Wine Bar");
    expect(m.get(canonicalKey("TASTING ROOM"))).toBe("Tasting Room");
  });
});
