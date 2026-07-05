import { describe, it, expect } from "vitest";
import { isCapKind, CAP_KINDS } from "@/lib/cellar/treatments";
import { isColdSoak, isExtendedMaceration, skinContactLabel } from "@/lib/ferment/phases";

// Phase 6 Unit 11: cold soak + extended maceration as extended CAP_MGMT kinds (validated string,
// no migration) and as points in the orthogonal (form × afState) space (no linear phase enum).

describe("cap kind validation (extended for Phase 6)", () => {
  it("accepts the kinds incl. cold soak, maceration, pulse-air", () => {
    expect(CAP_KINDS).toContain("COLD_SOAK");
    expect(CAP_KINDS).toContain("MACERATION");
    expect(CAP_KINDS).toContain("PULSE_AIR"); // plan 043
    for (const k of ["PUMPOVER", "PUNCHDOWN", "COLD_SOAK", "MACERATION", "PULSE_AIR"]) expect(isCapKind(k)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isCapKind("SPARGE")).toBe(false);
    expect(isCapKind("")).toBe(false);
    expect(isCapKind(null)).toBe(false);
  });
});

describe("skin-contact phases derive from form × afState (no linear enum)", () => {
  it("cold soak = MUST + AF:NONE", () => {
    expect(isColdSoak({ form: "MUST", afState: "NONE" })).toBe(true);
    expect(isColdSoak({ form: "MUST", afState: "ACTIVE" })).toBe(false);
    expect(isColdSoak({ form: "JUICE", afState: "NONE" })).toBe(false);
  });
  it("extended maceration = MUST + AF:DRY (dry but still on skins)", () => {
    expect(isExtendedMaceration({ form: "MUST", afState: "DRY" })).toBe(true);
    expect(isExtendedMaceration({ form: "WINE", afState: "DRY" })).toBe(false);
  });
  it("labels the MUST skin-contact phases, null for non-MUST", () => {
    expect(skinContactLabel({ form: "MUST", afState: "NONE" })).toBe("Cold soak");
    expect(skinContactLabel({ form: "MUST", afState: "ACTIVE" })).toBe("On skins (primary)");
    expect(skinContactLabel({ form: "MUST", afState: "DRY" })).toBe("Extended maceration");
    expect(skinContactLabel({ form: "WINE", afState: "DRY" })).toBeNull();
  });
});
