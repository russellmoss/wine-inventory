import { describe, it, expect } from "vitest";
import { buildLotCode, buildBlendLotCode, disambiguate, type LotCodeParts } from "@/lib/lot/code";
import {
  renderLotCode,
  renderBlendLotCode,
  assertValidTemplateSpec,
  specReferencesOriginToken,
  BUILTIN_DEFAULT_SPEC,
  type NamingTemplateSpec,
} from "@/lib/lot/naming-template";
import { canonicalizeDisplayName } from "@/lib/lot/rename";

// Phase 1 (V2) — pure tests: the built-in default renders byte-for-byte like buildLotCode; a custom
// template renders from tokens; the blend anti-single-origin rule holds as a template constraint;
// collision OFFERS a disambiguation (never auto-applies); displayName canonicalization.

// Zero-width / BOM chars built from escapes (never literal, to keep the source clean).
const ZWSP = "​"; // zero-width space
const ZWNJ = "‌"; // zero-width non-joiner
const BOM = "﻿"; // byte-order mark

// Fixtures spanning the shapes buildLotCode handles (mirrors lot-code.test.ts).
const LOT_FIXTURES: LotCodeParts[] = [
  { vintage: 2024, vineyardAbbr: "GS", blockToken: "1", varietyAbbr: "PN" },
  { vintage: 2023, vineyardAbbr: "GS", varietyAbbr: "PN" },
  { vintage: 2024, vineyardAbbr: "GS", blockToken: "1", subblockToken: "A", varietyAbbr: "PN" },
  { vintage: 2024, vineyardAbbr: "GS", blockToken: "1", varietyAbbr: "PN", tag: "EXP" },
  { vintage: 2022, vineyardAbbr: "SKY", varietyAbbr: "CH" },
];

describe("default template renderer reproduces buildLotCode byte-for-byte (Q6 parity)", () => {
  for (const parts of LOT_FIXTURES) {
    it(`matches for ${JSON.stringify(parts)}`, () => {
      expect(renderLotCode(BUILTIN_DEFAULT_SPEC, parts)).toBe(buildLotCode(parts));
    });
  }
  it("blend default matches buildBlendLotCode", () => {
    expect(renderBlendLotCode(BUILTIN_DEFAULT_SPEC, { vintage: 2024, token: "EST" })).toBe(
      buildBlendLotCode({ vintage: 2024, token: "EST" }),
    );
    expect(renderBlendLotCode(BUILTIN_DEFAULT_SPEC, { token: "RES" })).toBe(buildBlendLotCode({ token: "RES" }));
  });
});

describe("custom template renders from its ordered token spec", () => {
  const custom: NamingTemplateSpec = {
    kind: "custom",
    engineVersion: 1,
    separator: "-",
    lot: [{ token: "VINTAGE" }, { literal: "EST" }, { token: "VARIETY" }],
  };
  it("resolves tokens + literals in order, dropping empties", () => {
    expect(renderLotCode(custom, { vintage: 2024, vineyardAbbr: "GS", varietyAbbr: "PN" })).toBe("2024-EST-PN");
  });
  it("drops an empty optional token instead of leaving a dangling separator", () => {
    const spec: NamingTemplateSpec = {
      kind: "custom",
      engineVersion: 1,
      lot: [{ token: "VINTAGE" }, { token: "SUBBLOCK" }, { token: "VARIETY" }],
    };
    expect(renderLotCode(spec, { vintage: 2024, vineyardAbbr: "GS", varietyAbbr: "PN" })).toBe("2024-PN");
  });
});

describe("blend anti-single-origin is a template constraint (council G8)", () => {
  it("detects origin tokens in a spec", () => {
    const withOrigin: NamingTemplateSpec = {
      kind: "custom",
      engineVersion: 1,
      isBlend: true,
      lot: [{ token: "VINTAGE" }, { token: "VINEYARD" }],
    };
    expect(specReferencesOriginToken(withOrigin)).toBe(true);
    expect(() => assertValidTemplateSpec(withOrigin)).toThrow(/origin/i);
  });
  it("accepts a blend template with no origin tokens", () => {
    const ok: NamingTemplateSpec = {
      kind: "custom",
      engineVersion: 1,
      isBlend: true,
      lot: [{ token: "VINTAGE" }, { literal: "BL" }, { token: "FRACTION" }],
    };
    expect(() => assertValidTemplateSpec(ok)).not.toThrow();
    expect(specReferencesOriginToken(ok)).toBe(false);
  });
});

describe("collision OFFERS a disambiguation, never silently applies (NAMING-1)", () => {
  it("suggests -2 for a taken code (the offer the rename core throws)", () => {
    // renameLotCore computes exactly this suggestion and throws CodeCollisionError with it.
    expect(disambiguate("2024-GS-1-PN", new Set(["2024-GS-1-PN"]))).toBe("2024-GS-1-PN-2");
  });
});

describe("canonicalizeDisplayName (council G6)", () => {
  it("trims and returns the cleaned value", () => {
    expect(canonicalizeDisplayName("  Reserve Pinot  ")).toBe("Reserve Pinot");
  });
  it("strips control + zero-width characters", () => {
    expect(canonicalizeDisplayName(`Res${ZWSP}er${ZWNJ}ve`)).toBe("Reserve");
    expect(canonicalizeDisplayName(`${BOM}Blend`)).toBe("Blend");
    expect(canonicalizeDisplayName("TankOne")).toBe("TankOne");
  });
  it("normalizes empty / whitespace-only to null", () => {
    expect(canonicalizeDisplayName("")).toBeNull();
    expect(canonicalizeDisplayName("   ")).toBeNull();
    expect(canonicalizeDisplayName(null)).toBeNull();
    expect(canonicalizeDisplayName(undefined)).toBeNull();
  });
  it("caps length at 60", () => {
    const long = "x".repeat(100);
    expect(canonicalizeDisplayName(long)).toHaveLength(60);
  });
  it("accepts duplicates (non-unique) — same value in, same value out", () => {
    expect(canonicalizeDisplayName("Estate")).toBe("Estate");
    expect(canonicalizeDisplayName("Estate")).toBe("Estate");
  });
});
