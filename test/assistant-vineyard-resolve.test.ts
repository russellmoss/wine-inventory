import { describe, it, expect } from "vitest";
import { vineyardNameMatches } from "@/lib/assistant/scope";

// Regression for feedback ticket cmrm5x3lq ("vineyard identification"): the assistant
// told an admin "the Bajo vineyard doesn't exist" because resolveVineyards used a
// one-directional SQL `contains` — the stored name "Bajo" does NOT contain the query
// "Bajo Vineyard", so the natural phrasing returned empty. vineyardNameMatches is the
// two-directional matcher that fixes it (mirrors the block matcher).
describe("vineyardNameMatches", () => {
  it("matches the exact / bare name (unchanged behavior)", () => {
    expect(vineyardNameMatches("Bajo", "Bajo")).toBe(true);
    expect(vineyardNameMatches("Bajo", "bajo")).toBe(true);
  });

  it("matches when the query carries a generic word the stored name omits (THE BUG)", () => {
    // Each of these returned [] before the fix (one-directional contains).
    expect(vineyardNameMatches("Bajo", "Bajo Vineyard")).toBe(true);
    expect(vineyardNameMatches("Bajo", "bajo vineyard")).toBe(true);
    expect(vineyardNameMatches("Bajo", "the bajo vineyard")).toBe(true);
    expect(vineyardNameMatches("Bajo", "Bajo vineyard")).toBe(true);
  });

  it("still matches a partial query against a longer stored name", () => {
    expect(vineyardNameMatches("Ser Bhum", "ser")).toBe(true);
    expect(vineyardNameMatches("Lingmethang", "lingme")).toBe(true);
  });

  it("ignores parentheticals and punctuation like the block matcher", () => {
    expect(vineyardNameMatches("Bajo (North)", "Bajo")).toBe(true);
    expect(vineyardNameMatches("Ser-Bhum", "ser bhum")).toBe(true);
  });

  it("does NOT match a different vineyard", () => {
    expect(vineyardNameMatches("Bajo", "Gelephu")).toBe(false);
    expect(vineyardNameMatches("Paro", "Norzinthang")).toBe(false);
  });

  it("does NOT match a bare generic term (ambiguous, no vineyard named it)", () => {
    expect(vineyardNameMatches("Bajo", "vineyard")).toBe(false);
    expect(vineyardNameMatches("Paro", "the vineyard")).toBe(false);
  });

  it("rejects empty inputs on either side", () => {
    expect(vineyardNameMatches("", "Bajo")).toBe(false);
    expect(vineyardNameMatches("Bajo", "")).toBe(false);
    expect(vineyardNameMatches("Bajo", "   ")).toBe(false);
    expect(vineyardNameMatches("()", "Bajo")).toBe(false);
  });
});
