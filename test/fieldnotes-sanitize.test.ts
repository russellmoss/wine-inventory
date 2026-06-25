import { describe, it, expect } from "vitest";
import { cleanInputName, normalizeInputKey } from "@/lib/fieldnotes/sanitize";
import {
  parseWeatherData,
  parseBlockStatus,
  parseInputApplication,
  parseInputApplications,
  parseBlockStatuses,
  DEFAULT_HEALTHY_BLOCK_STATUS,
  FieldNoteParseError,
} from "@/lib/fieldnotes/types";

describe("cleanInputName", () => {
  it("trims, strips punctuation, and uppercases", () => {
    expect(cleanInputName(" mancozeb! ")).toBe("MANCOZEB");
  });
  it("keeps internal spaces but collapses doubles", () => {
    expect(cleanInputName("Epsom Salts")).toBe("EPSOM SALTS");
    expect(cleanInputName("Neem  Oil")).toBe("NEEM OIL");
  });
  it("keeps hyphens", () => {
    expect(cleanInputName("neem-oil")).toBe("NEEM-OIL");
  });
  it("strips unicode/emoji", () => {
    expect(cleanInputName("Sulfur🌿")).toBe("SULFUR");
    expect(cleanInputName("Coppér")).toBe("COPPER");
  });
  it("throws when nothing usable remains", () => {
    expect(() => cleanInputName("@@@")).toThrow();
    expect(() => cleanInputName("   ")).toThrow();
    expect(() => cleanInputName("")).toThrow();
  });
});

describe("normalizeInputKey", () => {
  it("collapses spacing/punctuation variants to one key", () => {
    expect(normalizeInputKey("NEEM OIL")).toBe("NEEMOIL");
    expect(normalizeInputKey("NEEM-OIL")).toBe("NEEMOIL");
    expect(normalizeInputKey("neem  oil")).toBe("NEEMOIL");
    expect(normalizeInputKey("Neem Oil!")).toBe("NEEMOIL");
  });
  it("matches plain names too", () => {
    expect(normalizeInputKey("Mancozeb")).toBe("MANCOZEB");
  });
  it("throws when no alphanumeric content", () => {
    expect(() => normalizeInputKey("---")).toThrow();
  });
});

describe("parseWeatherData", () => {
  it("round-trips a good payload", () => {
    expect(parseWeatherData({ rainfallMm: 40, maxTempC: 28, minTempC: 12 })).toEqual({
      rainfallMm: 40,
      maxTempC: 28,
      minTempC: 12,
    });
  });
  it("allows nulls", () => {
    expect(parseWeatherData({ rainfallMm: null, maxTempC: null, minTempC: null })).toEqual({
      rainfallMm: null,
      maxTempC: null,
      minTempC: null,
    });
  });
  it("throws on a non-object", () => {
    expect(() => parseWeatherData(42)).toThrow(FieldNoteParseError);
  });
  it("throws on a non-numeric reading", () => {
    expect(() => parseWeatherData({ rainfallMm: "lots", maxTempC: 1, minTempC: 1 })).toThrow(
      FieldNoteParseError,
    );
  });
});

describe("parseInputApplication", () => {
  it("keeps WHOLE-scope with no blocks", () => {
    expect(parseInputApplication({ name: "MANCOZEB", scope: "WHOLE", blockIds: ["x"] })).toEqual({
      name: "MANCOZEB",
      scope: "WHOLE",
      blockIds: [], // forced empty when WHOLE
    });
  });
  it("keeps block list for BLOCKS scope", () => {
    expect(parseInputApplication({ name: "NEEM", scope: "BLOCKS", blockIds: ["a", "b"] })).toEqual({
      name: "NEEM",
      scope: "BLOCKS",
      blockIds: ["a", "b"],
    });
  });
  it("throws on missing name or bad scope", () => {
    expect(() => parseInputApplication({ scope: "WHOLE" })).toThrow(FieldNoteParseError);
    expect(() => parseInputApplication({ name: "X", scope: "EVERYWHERE" })).toThrow(
      FieldNoteParseError,
    );
  });
  it("parses arrays", () => {
    expect(parseInputApplications([{ name: "X", scope: "WHOLE" }])).toHaveLength(1);
    expect(() => parseInputApplications({} as unknown)).toThrow(FieldNoteParseError);
  });
});

describe("parseBlockStatus", () => {
  it("round-trips the default healthy status", () => {
    expect(parseBlockStatus(DEFAULT_HEALTHY_BLOCK_STATUS)).toEqual(DEFAULT_HEALTHY_BLOCK_STATUS);
  });
  it("validates enum members and arrays", () => {
    const s = parseBlockStatus({
      phenoStage: "VERAISON",
      shootTip: "STAGNANT",
      canopyDensity: "DENSE",
      waterStress: "MILD",
      weedPressure: "HIGH",
      leafConditions: ["YELLOWING", "EDGE_BURN"],
      diseasePestSpotted: true,
      diseaseDescription: "spots on lower leaves",
      photoUrls: ["https://blob/x.jpg"],
    });
    expect(s.phenoStage).toBe("VERAISON");
    expect(s.leafConditions).toEqual(["YELLOWING", "EDGE_BURN"]);
    expect(s.diseasePestSpotted).toBe(true);
  });
  it("throws on an invalid enum value", () => {
    expect(() => parseBlockStatus({ ...DEFAULT_HEALTHY_BLOCK_STATUS, phenoStage: "WINTER" })).toThrow(
      FieldNoteParseError,
    );
    expect(() =>
      parseBlockStatus({ ...DEFAULT_HEALTHY_BLOCK_STATUS, leafConditions: ["SPARKLY"] }),
    ).toThrow(FieldNoteParseError);
  });
  it("parses a map of statuses", () => {
    const map = parseBlockStatuses({ b1: DEFAULT_HEALTHY_BLOCK_STATUS });
    expect(map.b1).toEqual(DEFAULT_HEALTHY_BLOCK_STATUS);
    expect(() => parseBlockStatuses([] as unknown)).toThrow(FieldNoteParseError);
  });
});
