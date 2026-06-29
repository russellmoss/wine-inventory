import { describe, it, expect } from "vitest";
import {
  normalizeAbbr,
  normalizeToken,
  blockToken,
  buildLotCode,
  disambiguate,
} from "@/lib/lot/code";

describe("normalizeAbbr (variety/vineyard abbreviations: 2-4 uppercase alnum)", () => {
  it("uppercases and trims", () => {
    expect(normalizeAbbr("pn")).toBe("PN");
    expect(normalizeAbbr(" Cab ")).toBe("CAB");
  });
  it("strips non-alphanumerics then validates length", () => {
    expect(normalizeAbbr("c-f")).toBe("CF");
    expect(normalizeAbbr("p.n.")).toBe("PN");
  });
  it("rejects too short / too long / empty", () => {
    expect(() => normalizeAbbr("P")).toThrow();
    expect(() => normalizeAbbr("ABCDE")).toThrow();
    expect(() => normalizeAbbr("")).toThrow();
    expect(() => normalizeAbbr("---")).toThrow();
  });
});

describe("normalizeToken (block/subblock/tag: uppercase alnum, any length, '' if empty)", () => {
  it("uppercases and strips punctuation/space", () => {
    expect(normalizeToken("a")).toBe("A");
    expect(normalizeToken("exp")).toBe("EXP");
    expect(normalizeToken("a 1")).toBe("A1");
  });
  it("returns '' for empty/nullish", () => {
    expect(normalizeToken("")).toBe("");
    expect(normalizeToken(null)).toBe("");
    expect(normalizeToken(undefined)).toBe("");
  });
});

describe("blockToken (code wins; else strip leading 'Block' from the label)", () => {
  it("derives from a free-text block label", () => {
    expect(blockToken(null, "Block 1")).toBe("1");
    expect(blockToken(null, "A")).toBe("A");
    expect(blockToken(null, "block 3")).toBe("3");
  });
  it("prefers an explicit block code", () => {
    expect(blockToken("B2", "Block 1")).toBe("B2");
  });
  it("empty when neither present", () => {
    expect(blockToken(null, null)).toBe("");
    expect(blockToken(undefined, undefined)).toBe("");
  });
});

describe("buildLotCode — YEAR-VINEYARD-BLOCK[-SUBBLOCK]-VARIETY[-TAG]", () => {
  it("full code with block + variety", () => {
    expect(buildLotCode({ vintage: 2024, vineyardAbbr: "GS", blockToken: "1", varietyAbbr: "PN" })).toBe(
      "2024-GS-1-PN",
    );
  });
  it("legacy shape: no block", () => {
    expect(buildLotCode({ vintage: 2023, vineyardAbbr: "GS", varietyAbbr: "PN" })).toBe("2023-GS-PN");
  });
  it("with subblock", () => {
    expect(
      buildLotCode({ vintage: 2024, vineyardAbbr: "GS", blockToken: "1", subblockToken: "A", varietyAbbr: "PN" }),
    ).toBe("2024-GS-1-A-PN");
  });
  it("with a sublot tag", () => {
    expect(
      buildLotCode({ vintage: 2024, vineyardAbbr: "GS", blockToken: "1", varietyAbbr: "PN", tag: "EXP" }),
    ).toBe("2024-GS-1-PN-EXP");
  });
  it("normalizes case on every part", () => {
    expect(
      buildLotCode({ vintage: 2024, vineyardAbbr: "gs", blockToken: "1", varietyAbbr: "pn", tag: "exp" }),
    ).toBe("2024-GS-1-PN-EXP");
  });
  it("throws on missing required parts", () => {
    expect(() => buildLotCode({ vintage: 2024, vineyardAbbr: "", varietyAbbr: "PN" })).toThrow();
    expect(() => buildLotCode({ vintage: 2024, vineyardAbbr: "GS", varietyAbbr: "" })).toThrow();
    // @ts-expect-error vintage required
    expect(() => buildLotCode({ vineyardAbbr: "GS", varietyAbbr: "PN" })).toThrow();
  });
});

describe("disambiguate — auto numeric suffix on collision", () => {
  it("returns the base when free", () => {
    expect(disambiguate("2024-GS-1-PN", new Set())).toBe("2024-GS-1-PN");
  });
  it("appends -2 on first collision", () => {
    expect(disambiguate("2024-GS-1-PN", new Set(["2024-GS-1-PN"]))).toBe("2024-GS-1-PN-2");
  });
  it("appends -3 when base and -2 are taken", () => {
    expect(disambiguate("2024-GS-1-PN", new Set(["2024-GS-1-PN", "2024-GS-1-PN-2"]))).toBe("2024-GS-1-PN-3");
  });
  it("accepts an array too", () => {
    expect(disambiguate("X", ["X", "X-2"])).toBe("X-3");
  });
});

// ─────────────────────── Phase 5: blend lot codes ───────────────────────
import { normalizeBlendToken, buildBlendLotCode } from "@/lib/lot/code";

describe("normalizeBlendToken (2–4 letters, uppercased)", () => {
  it("uppercases and trims punctuation/whitespace", () => {
    expect(normalizeBlendToken("est")).toBe("EST");
    expect(normalizeBlendToken(" e.s.t ")).toBe("EST");
    expect(normalizeBlendToken("Re")).toBe("RE");
  });
  it("rejects too short / too long", () => {
    expect(() => normalizeBlendToken("a")).toThrow();
    expect(() => normalizeBlendToken("ESTAT")).toThrow(); // 5 letters
    expect(() => normalizeBlendToken("")).toThrow();
  });
  it("rejects tokens with no letters", () => {
    expect(() => normalizeBlendToken("12")).toThrow();
    expect(() => normalizeBlendToken("--")).toThrow();
  });
});

describe("buildBlendLotCode ([vintage]-BL-<TOKEN>, no vineyard/variety)", () => {
  it("composes with a vintage", () => {
    expect(buildBlendLotCode({ vintage: 2024, token: "est" })).toBe("2024-BL-EST");
  });
  it("uses NV when no vintage (NV/multi-vintage blends — D3)", () => {
    expect(buildBlendLotCode({ token: "RES" })).toBe("NV-BL-RES");
    expect(buildBlendLotCode({ vintage: null, token: "RES" })).toBe("NV-BL-RES");
  });
  it("never carries a vineyard/variety segment", () => {
    const code = buildBlendLotCode({ vintage: 2023, token: "GSM" });
    expect(code).toBe("2023-BL-GSM");
    expect(code.split("-")).toHaveLength(3);
  });
  it("propagates token validation", () => {
    expect(() => buildBlendLotCode({ vintage: 2024, token: "TOOLONG" })).toThrow();
  });
});
