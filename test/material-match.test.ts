import { describe, it, expect } from "vitest";
import {
  matchMaterials,
  MATCH_CONFIDENCE,
  type MaterialCandidate,
} from "@/lib/cellar/material-match";

// Plan 072 · Unit 6 — the invoice-review material matcher. Pure; tested directly (no DB).

const LAFFORT = "vendor_laffort";
const SCOTT = "vendor_scott";

describe("matchMaterials — vendor-scoped code", () => {
  it("an exact vendor-scoped SKU wins over a plain name match", () => {
    const candidates: MaterialCandidate[] = [
      // Same-vendor SKU on a material whose NAME does not match the line at all.
      { materialId: "m_enzyme", name: "Lafazym Extract", category: "ADDITIVE", vendorCodes: [{ vendorId: LAFFORT, code: "2230517" }] },
      // A different material that would name-match the line.
      { materialId: "m_named", name: "Opti-White", category: "ADDITIVE" },
    ];
    const out = matchMaterials(candidates, { name: "Opti-White", vendorId: LAFFORT, vendorItemCode: "2230517" });
    expect(out[0].materialId).toBe("m_enzyme");
    expect(out[0].confidence).toBe(MATCH_CONFIDENCE.EXACT_VENDOR_CODE);
    expect(out[0].reason).toContain("2230517");
    // The name match still appears, but ranked below the code match.
    expect(out[1].materialId).toBe("m_named");
    expect(out[1].confidence).toBe(MATCH_CONFIDENCE.EXACT_NAME);
  });

  it("normalizes the code (trim / case / spaces / hyphens) before comparing", () => {
    const candidates: MaterialCandidate[] = [
      { materialId: "m1", name: "Some Reagent", category: "ADDITIVE", vendorCodes: [{ vendorId: LAFFORT, code: "AB-100 20" }] },
    ];
    const out = matchMaterials(candidates, { name: "unrelated", vendorId: LAFFORT, vendorItemCode: " ab10020 " });
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(MATCH_CONFIDENCE.EXACT_VENDOR_CODE);
  });

  it("a code match under a DIFFERENT vendorId does NOT count", () => {
    const candidates: MaterialCandidate[] = [
      { materialId: "m1", name: "Reagent A", category: "ADDITIVE", vendorCodes: [{ vendorId: SCOTT, code: "100" }] },
    ];
    // Same code string "100", but the line's vendor is Laffort, not Scott → no code match, and the name
    // ("Widget") doesn't match "Reagent A" → empty.
    const out = matchMaterials(candidates, { name: "Widget", vendorId: LAFFORT, vendorItemCode: "100" });
    expect(out).toHaveLength(0);
  });

  it("does not code-match when the line has no vendorId", () => {
    const candidates: MaterialCandidate[] = [
      { materialId: "m1", name: "Reagent A", category: "ADDITIVE", vendorCodes: [{ vendorId: SCOTT, code: "100" }] },
    ];
    const out = matchMaterials(candidates, { name: "Widget", vendorId: null, vendorItemCode: "100" });
    expect(out).toHaveLength(0);
  });
});

describe("matchMaterials — two-directional fuzzy name", () => {
  it("matches 'Lafazym Extract' against the stored 'LAFFORT LAFAZYM EXTRACT' (stored ⊇ query)", () => {
    const candidates: MaterialCandidate[] = [
      { materialId: "m1", name: "LAFFORT LAFAZYM EXTRACT", category: "ADDITIVE" },
    ];
    const out = matchMaterials(candidates, { name: "Lafazym Extract" });
    expect(out).toHaveLength(1);
    expect(out[0].materialId).toBe("m1");
    expect(out[0].confidence).toBe(MATCH_CONFIDENCE.SUBSTRING_NAME);
  });

  it("matches the other direction too (query ⊇ stored)", () => {
    const candidates: MaterialCandidate[] = [
      { materialId: "m1", name: "Lafazym Extract", category: "ADDITIVE" },
    ];
    const out = matchMaterials(candidates, { name: "LAFFORT LAFAZYM EXTRACT enzyme" });
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(MATCH_CONFIDENCE.SUBSTRING_NAME);
  });

  it("exact normalized name (ignoring spacing/punctuation) ranks above a substring match", () => {
    const candidates: MaterialCandidate[] = [
      { materialId: "m_sub", name: "LAFFORT LAFAZYM EXTRACT", category: "ADDITIVE" },
      { materialId: "m_exact", name: "lafazym-extract", category: "ADDITIVE" },
    ];
    const out = matchMaterials(candidates, { name: "Lafazym Extract" });
    expect(out[0].materialId).toBe("m_exact");
    expect(out[0].confidence).toBe(MATCH_CONFIDENCE.EXACT_NAME);
    expect(out[1].materialId).toBe("m_sub");
    expect(out[1].confidence).toBe(MATCH_CONFIDENCE.SUBSTRING_NAME);
  });
});

describe("matchMaterials — coverage & edge cases", () => {
  it("matches an EQUIPMENT candidate (categories are NOT filtered)", () => {
    const candidates: MaterialCandidate[] = [
      { materialId: "m_part", name: "Bung 50mm Silicone", category: "EQUIPMENT" },
    ];
    const out = matchMaterials(candidates, { name: "Bung 50mm" });
    expect(out).toHaveLength(1);
    expect(out[0].materialId).toBe("m_part");
    expect(out[0].category).toBe("EQUIPMENT");
  });

  it("returns an empty array when nothing matches", () => {
    const candidates: MaterialCandidate[] = [
      { materialId: "m1", name: "Potassium Metabisulfite", category: "ADDITIVE" },
    ];
    expect(matchMaterials(candidates, { name: "Oak Chips" })).toEqual([]);
    expect(matchMaterials([], { name: "anything" })).toEqual([]);
  });

  it("returns multiple ranked candidates in descending confidence order", () => {
    const candidates: MaterialCandidate[] = [
      { materialId: "m_sub", name: "Premium Bentonite Granular", category: "ADDITIVE" },
      { materialId: "m_code", name: "Totally Different Name", category: "ADDITIVE", vendorCodes: [{ vendorId: LAFFORT, code: "B-9" }] },
      { materialId: "m_exact", name: "bentonite", category: "ADDITIVE" },
    ];
    const out = matchMaterials(candidates, { name: "Bentonite", vendorId: LAFFORT, vendorItemCode: "B9" });
    expect(out.map((m) => m.materialId)).toEqual(["m_code", "m_exact", "m_sub"]);
    expect(out.map((m) => m.confidence)).toEqual([
      MATCH_CONFIDENCE.EXACT_VENDOR_CODE,
      MATCH_CONFIDENCE.EXACT_NAME,
      MATCH_CONFIDENCE.SUBSTRING_NAME,
    ]);
  });
});
