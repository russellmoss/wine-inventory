import { describe, expect, it } from "vitest";
import { FieldNoteParseError } from "@/lib/fieldnotes/types";
import {
  EMPTY_PHENOLOGY_OBSERVATIONS,
  clusterDamageApplies,
  isScoutedClean,
  parseClusterDamage,
  parseFruitZoneLeafRemoval,
  parseHedgedThisWeek,
  parsePhenologyObservations,
  parseShootLengthBand,
  parseShootLengthCm,
  parseVinegarFlyPressure,
  vinegarFlyApplies,
  wasScouted,
} from "@/lib/phenology/observation-types";

describe("S4 observation parsers", () => {
  it("accepts every legal value", () => {
    expect(parseShootLengthCm(24.5)).toBe(24.5);
    expect(parseShootLengthBand("CM_10_30")).toBe("CM_10_30");
    expect(parseHedgedThisWeek(true)).toBe(true);
    expect(parseFruitZoneLeafRemoval("PARTIAL")).toBe("PARTIAL");
    expect(parseClusterDamage("SEVERE")).toBe("SEVERE");
    expect(parseVinegarFlyPressure("HIGH")).toBe("HIGH");
  });

  it("maps undefined AND null to null (legacy rows parse unchanged)", () => {
    for (const absent of [undefined, null]) {
      expect(parseShootLengthCm(absent)).toBeNull();
      expect(parseShootLengthBand(absent)).toBeNull();
      expect(parseHedgedThisWeek(absent)).toBeNull();
      expect(parseFruitZoneLeafRemoval(absent)).toBeNull();
      expect(parseClusterDamage(absent)).toBeNull();
      expect(parseVinegarFlyPressure(absent)).toBeNull();
    }
  });

  it("rejects garbage with FieldNoteParseError", () => {
    expect(() => parseShootLengthCm("24")).toThrow(FieldNoteParseError);
    expect(() => parseShootLengthCm(Number.NaN)).toThrow(FieldNoteParseError);
    expect(() => parseShootLengthBand("CM_10_20")).toThrow(FieldNoteParseError);
    expect(() => parseHedgedThisWeek("yes")).toThrow(FieldNoteParseError);
    expect(() => parseHedgedThisWeek(1)).toThrow(FieldNoteParseError);
    expect(() => parseFruitZoneLeafRemoval("SOME")).toThrow(FieldNoteParseError);
    expect(() => parseClusterDamage("BAD")).toThrow(FieldNoteParseError);
    expect(() => parseVinegarFlyPressure("EXTREME")).toThrow(FieldNoteParseError);
  });

  it("rejects a NEGATIVE shoot length — the growth model divides by this number", () => {
    expect(() => parseShootLengthCm(-1)).toThrow(FieldNoteParseError);
  });

  it("keeps shootLengthCm 0 and hedgedThisWeek false — falsy but MEANINGFUL", () => {
    expect(parseShootLengthCm(0)).toBe(0);
    expect(parseHedgedThisWeek(false)).toBe(false);
  });

  it("parses all six from one raw object, absent keys -> null", () => {
    expect(parsePhenologyObservations({})).toEqual(EMPTY_PHENOLOGY_OBSERVATIONS);
    expect(
      parsePhenologyObservations({ shootLengthCm: 0, hedgedThisWeek: false, clusterDamage: "NONE" }),
    ).toEqual({
      ...EMPTY_PHENOLOGY_OBSERVATIONS,
      shootLengthCm: 0,
      hedgedThisWeek: false,
      clusterDamage: "NONE",
    });
  });
});

// The contract this file exists for. A gap must never reach a model as a clean bill of health.
describe("NOT_ASSESSED, NONE, and null are three DISTINCT values", () => {
  it("parses to three distinct outcomes, never collapsed", () => {
    const gap = parseClusterDamage(null);
    const looked = parseClusterDamage("NOT_ASSESSED");
    const clean = parseClusterDamage("NONE");
    expect(gap).toBeNull();
    expect(looked).toBe("NOT_ASSESSED");
    expect(clean).toBe("NONE");
    expect(new Set([String(gap), String(looked), String(clean)]).size).toBe(3);
  });

  it("the same three-way split holds for vinegar-fly pressure", () => {
    expect(parseVinegarFlyPressure(null)).toBeNull();
    expect(parseVinegarFlyPressure("NOT_ASSESSED")).toBe("NOT_ASSESSED");
    expect(parseVinegarFlyPressure("NONE")).toBe("NONE");
  });

  it("wasScouted(): only an ANSWERED control counts as someone having looked", () => {
    expect(wasScouted(null)).toBe(false);
    expect(wasScouted("NOT_ASSESSED")).toBe(false);
    expect(wasScouted("NONE")).toBe(true);
    expect(wasScouted("SEVERE")).toBe(true);
  });

  it("isScoutedClean(): ONLY 'NONE' is a clean bill of health", () => {
    expect(isScoutedClean("NONE")).toBe(true);
    expect(isScoutedClean(null)).toBe(false);
    expect(isScoutedClean("NOT_ASSESSED")).toBe(false);
    expect(isScoutedClean("TRACE")).toBe(false);
  });

  it("a truthiness check would collapse null and NOT_ASSESSED — the helpers must not", () => {
    // "NOT_ASSESSED" is a TRUTHY string, so `if (v)` reads it as an answer. That is the bug.
    expect(Boolean("NOT_ASSESSED")).toBe(true);
    expect(wasScouted("NOT_ASSESSED")).toBe(false);
  });
});

describe("stage gating (council S6)", () => {
  it("cluster damage opens at FRUIT_SET, not VERAISON — botrytis exploits EARLY wounds", () => {
    expect(clusterDamageApplies("FRUIT_SET")).toBe(true);
    expect(clusterDamageApplies("VERAISON")).toBe(true);
    expect(clusterDamageApplies("FLOWERING")).toBe(false);
    expect(clusterDamageApplies("BUD_BREAK")).toBe(false);
    expect(clusterDamageApplies(null)).toBe(false);
  });

  it("vinegar-fly pressure stays at VERAISON — flies are a ripening-sugar phenomenon", () => {
    expect(vinegarFlyApplies("VERAISON")).toBe(true);
    expect(vinegarFlyApplies("HARVEST")).toBe(true);
    expect(vinegarFlyApplies("FRUIT_SET")).toBe(false);
  });
});
