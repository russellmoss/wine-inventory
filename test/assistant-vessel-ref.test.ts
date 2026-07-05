import { describe, it, expect } from "vitest";
import { vesselCodeCandidates, normVesselCode } from "@/lib/assistant/scope";

// Regression for the live-QA bug (2026-07-05): the assistant couldn't resolve "T3" / "tank 3" because
// parseVesselRef yields code "3" and the resolver did an EXACT match against the real code "T3". The fix
// matches on a normalized code, trying the bare token AND the type-lettered form ("tank 3" → "t3").

describe("vesselCodeCandidates — tolerant vessel reference matching", () => {
  it('"tank 3" offers "t3" so it matches a vessel coded "T3"', () => {
    const { type, wanted } = vesselCodeCandidates("tank 3");
    expect(type).toBe("TANK");
    expect(wanted).toContain("t3");
    expect(wanted).toContain("3");
    expect(wanted).toContain(normVesselCode("T3"));
  });

  it('bare "T3" (no type word) matches code "T3"', () => {
    const { wanted } = vesselCodeCandidates("T3");
    expect(wanted).toContain("t3");
  });

  it('"tank T3" matches "T3"', () => {
    expect(vesselCodeCandidates("tank T3").wanted).toContain("t3");
  });

  it('"barrel 1" offers "b1" for a vessel coded "B1"', () => {
    const { type, wanted } = vesselCodeCandidates("barrel 1");
    expect(type).toBe("BARREL");
    expect(wanted).toContain("b1");
  });

  it("handles hyphenated codes like QBO-T1 and ZZ-COST-TANK", () => {
    expect(vesselCodeCandidates("QBO-T1").wanted).toContain("qbot1");
    expect(vesselCodeCandidates("ZZ-COST-TANK").wanted).toContain("zzcosttank");
  });

  it("empty/garbage yields no candidates", () => {
    expect(vesselCodeCandidates("").wanted).toEqual([]);
  });
});
