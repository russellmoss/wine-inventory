import { describe, it, expect } from "vitest";
import { parseRegistrationNumber } from "@/lib/pesticide/reg-number";

// Spray S2 Unit 2 — the safety gate whose whole value is in the rejections (K6, council C6/G4).
// A malformed reg number must NEVER resolve to a product; an adjuvant must never be CALLED malformed;
// and no result variant may be readable as a permission. The parser returns ok|malformed only —
// not-found is the lookup's result, not the parser's (C6).

describe("parseRegistrationNumber — accepts (with format tag)", () => {
  it("canonicalizes a two-segment EPA number", () => {
    expect(parseRegistrationNumber("100-1234")).toEqual({ ok: true, format: "EPA_FEDERAL", canonical: "100-1234" });
  });

  it("canonicalizes a three-segment (distributor) EPA number", () => {
    expect(parseRegistrationNumber("264-1152-2217")).toEqual({ ok: true, format: "EPA_FEDERAL", canonical: "264-1152-2217" });
  });

  it("trims surrounding whitespace but never repairs the interior", () => {
    expect(parseRegistrationNumber("  100-1234 ")).toEqual({ ok: true, format: "EPA_FEDERAL", canonical: "100-1234" });
  });

  it("strips per-segment leading zeros in the canonical form (cross-source join key)", () => {
    // CDPR's fixed-width dumps zero-pad segments; APPRIL does not. Canonical joins them.
    expect(parseRegistrationNumber("00100-01234")).toEqual({ ok: true, format: "EPA_FEDERAL", canonical: "100-1234" });
  });

  it("a CA-state-only number (letter-suffix segment) is CA_STATE_ONLY, not malformed (G4)", () => {
    // Adjuvants are federally exempt but CA-state-registered; many labels legally REQUIRE one in the
    // tank. Calling this malformed would make a required tank component unloggable for S3a.
    const r = parseRegistrationNumber("40989-50001-AA");
    expect(r).toEqual({ ok: true, format: "CA_STATE_ONLY", canonical: "40989-50001-AA" });
  });

  it("a FIFRA 25(b) marker is EXEMPT_25B, not malformed (G4)", () => {
    for (const input of ["25(b)", "25B", "FIFRA 25(b) exempt", "exempt"]) {
      const r = parseRegistrationNumber(input);
      expect(r.ok, `${input} accepted`).toBe(true);
      if (r.ok) expect(r.format).toBe("EXEMPT_25B");
    }
  });
});

describe("parseRegistrationNumber — rejections (the point of the unit)", () => {
  const MALFORMED = [
    "1001234", // no separator
    "100-1234x", // trailing character fused to a digit segment — NOT a CA letter-suffix segment
    "100‑1234", // U+2011 non-breaking hyphen — never silently repaired to ASCII
    "100-", // empty product segment
    "-1234", // empty company segment
    "", // empty
    "   ", // whitespace only
    "100--1234", // empty interior segment
    "0-1234", // all-zero company segment
    "abc-def", // letters where digits are required
    "100-1234-5678-9012", // too many segments
    "a".repeat(200), // absurd length
  ];
  for (const input of MALFORMED) {
    it(`rejects ${JSON.stringify(input.length > 30 ? input.slice(0, 30) + "…" : input)}`, () => {
      expect(parseRegistrationNumber(input)).toEqual({ ok: false, reason: "malformed" });
    });
  }

  it("no result variant is truthy-coercible into 'permitted'", () => {
    // The union carries ok + format/canonical or ok + reason — never a field a consumer could
    // mistake for a legality answer. This is a runtime backstop for the type-level contract.
    const results = [
      parseRegistrationNumber("100-1234"),
      parseRegistrationNumber("40989-50001-AA"),
      parseRegistrationNumber("garbage"),
    ];
    for (const r of results) {
      expect(r).not.toHaveProperty("permitted");
      expect(r).not.toHaveProperty("registered");
      expect(r).not.toHaveProperty("legal");
      if (!r.ok) {
        expect(r.reason).toBe("malformed");
        expect(r).not.toHaveProperty("canonical");
      }
    }
  });
});
