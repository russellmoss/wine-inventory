import { describe, it, expect } from "vitest";
import { detectRestrictions } from "@/lib/pesticide/restrictions";

// Spray S2 Unit 7 — the four verified sentence structures (plan 086 measured /Nassau|Suffolk/ at
// 4/4 with zero false positives), plus the two cases that make a boolean flag wrong: Luna's 24(c)
// SLN carve-out and its SEPARATE aerial prohibition.

const PHRASING_1 = "Not for sale, sale into, distribution and/or use in Nassau and Suffolk Counties of New York State, except as permitted under FIFRA Section 24(c), Special Local Need registration.";
const PHRASING_2 = "Do not use in Nassau and Suffolk Counties of New York State.";
const PHRASING_3 = "Not for use in Nassau and Suffolk Counties, New York.";
const PHRASING_4 = "This product is not registered for use in Nassau and Suffolk Counties in New York State.";
const LUNA_AERIAL = "Aerial Application Prohibited in New York State.";

describe("county restriction detection", () => {
  it("catches all four verified phrasings with both counties", () => {
    for (const p of [PHRASING_1, PHRASING_2, PHRASING_3, PHRASING_4]) {
      const r = detectRestrictions(p);
      expect(r, p).toHaveLength(1);
      expect(r[0].kind).toBe("county-prohibition");
      expect(r[0].state).toBe("NY");
      expect(r[0].counties.sort()).toEqual(["Nassau", "Suffolk"]);
      expect(r[0].quote).toBe(p); // verbatim — the citation is the source, not our paraphrase
    }
  });

  it("Luna Experience yields exception 24c-sln, NOT a plain ban", () => {
    const r = detectRestrictions(PHRASING_1);
    expect(r[0].exception).toBe("24c-sln");
  });

  it("a phrasing without the SLN carve-out has exception null", () => {
    expect(detectRestrictions(PHRASING_2)[0].exception).toBeNull();
  });

  it("Luna's aerial prohibition is captured as its OWN distinct restriction, not folded into the county one", () => {
    const label = `${PHRASING_1}\n${LUNA_AERIAL}\nApply in a minimum of 10 gallons of water per acre.`;
    const r = detectRestrictions(label);
    expect(r).toHaveLength(2);
    const aerial = r.find((x) => x.kind === "aerial-application-prohibited");
    expect(aerial).toBeTruthy();
    expect(aerial?.counties).toEqual([]);
    expect(aerial?.quote).toBe(LUNA_AERIAL);
    const county = r.find((x) => x.kind === "county-prohibition");
    expect(county?.exception).toBe("24c-sln");
  });

  it("a county named without a prohibition verb is NOT a restriction (false-positive guard)", () => {
    expect(detectRestrictions("Field trials were conducted in Suffolk County, New York in 2019.")).toEqual([]);
  });

  it("benign label text yields nothing", () => {
    expect(detectRestrictions("Apply at 14-day intervals. Do not apply more than 4 times per season.")).toEqual([]);
  });
});
