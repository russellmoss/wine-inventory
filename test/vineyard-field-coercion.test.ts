import { describe, it, expect } from "vitest";
import {
  optStr,
  optInt,
  optFloat,
  optColor,
  readUnitValue,
  spacingToCanonicalM,
  elevationToCanonicalM,
  gpsLatToCanonical,
  gpsLngToCanonical,
  normalizeAbbreviation,
} from "@/lib/vineyard/field-coercion";
import { ftToM } from "@/lib/vineyard/units";

// CHARACTERIZATION SUITE (plan 082, Unit 1, commit 1 of 2).
//
// These assertions encode the behavior of the coercion helpers EXACTLY as they behaved
// while they were file-private inside src/lib/vineyard/actions.ts. They exist to prove the
// extraction is behavior-preserving for the live /reference vineyard editor. One of them
// documents a real bug on purpose; it is flipped in the next commit.

describe("optStr", () => {
  it("trims, and treats empty/whitespace as absent", () => {
    expect(optStr("  Block 1  ")).toBe("Block 1");
    expect(optStr("")).toBeNull();
    expect(optStr("   ")).toBeNull();
    expect(optStr(null)).toBeNull();
    expect(optStr(undefined)).toBeNull();
  });
  it("rejects past the max length", () => {
    expect(optStr("a".repeat(80), 80)).toBe("a".repeat(80));
    expect(() => optStr("a".repeat(81), 80)).toThrow(/too long/i);
  });
});

describe("optInt", () => {
  it("accepts whole numbers inside the bounds", () => {
    expect(optInt("350", "Number of rows", { max: 100000 })).toBe(350);
    expect(optInt("", "Number of rows")).toBeNull();
  });
  it("rejects non-integers and out-of-range values, naming the field", () => {
    expect(() => optInt("3.5", "Number of rows")).toThrow(/Number of rows/);
    expect(() => optInt("1799", "Year planted", { min: 1800, max: 2100 })).toThrow(/Year planted/);
    expect(() => optInt("2101", "Year planted", { min: 1800, max: 2100 })).toThrow(/Year planted/);
  });
  it("defaults min to 0, so negatives are refused", () => {
    expect(() => optInt("-1", "Number of vines")).toThrow(/Number of vines/);
  });
});

describe("optFloat", () => {
  it("accepts finite numbers and honors explicit bounds", () => {
    expect(optFloat("8", "Row spacing", { min: 0 })).toBe(8);
    expect(optFloat("", "Row spacing")).toBeNull();
    expect(() => optFloat("abc", "Row spacing")).toThrow(/must be a number/);
    expect(() => optFloat("-91", "Latitude", { min: -90, max: 90 })).toThrow(/at least/);
    expect(() => optFloat("91", "Latitude", { min: -90, max: 90 })).toThrow(/at most/);
  });
  it("allows negatives when no min is given (longitude, latitude)", () => {
    expect(optFloat("-122.45", "Longitude", { min: -180, max: 180 })).toBe(-122.45);
  });
});

describe("optColor", () => {
  it("passes valid hex through and refuses anything else", () => {
    expect(optColor("#aabbcc")).toBe("#aabbcc");
    expect(optColor("")).toBeNull();
    expect(() => optColor("rebeccapurple")).toThrow(/valid color/i);
  });
});

describe("readUnitValue", () => {
  it("is metric only on an exact match, imperial otherwise", () => {
    expect(readUnitValue("metric")).toBe("metric");
    expect(readUnitValue("imperial")).toBe("imperial");
    expect(readUnitValue("")).toBe("imperial");
    expect(readUnitValue(null)).toBe("imperial");
    expect(readUnitValue("METRIC")).toBe("imperial");
  });
});

describe("spacingToCanonicalM", () => {
  it("converts an imperial value to canonical meters", () => {
    expect(spacingToCanonicalM("8", "Row spacing", "imperial")).toBeCloseTo(ftToM(8), 9);
  });
  it("passes a metric value through unconverted", () => {
    expect(spacingToCanonicalM("2.5", "Vine spacing", "metric")).toBeCloseTo(2.5, 9);
  });
  it("treats absent as absent", () => {
    expect(spacingToCanonicalM("", "Row spacing", "imperial")).toBeNull();
    expect(spacingToCanonicalM(null, "Row spacing", "imperial")).toBeNull();
  });
  it("refuses a negative outright (optFloat's min: 0 bound)", () => {
    expect(() => spacingToCanonicalM("-1", "Row spacing", "imperial")).toThrow(/Row spacing/);
  });

  // ── R1: previously, zero silently cleared the field ──
  it("REFUSES zero rather than silently clearing the field (R1)", () => {
    // Before the fix: optFloat's `min: 0` admitted 0, then toCanonicalSpacing -> pos()
    // mapped `<= 0` to null, so the value was wiped with no complaint — and the derived
    // planted acreage went quietly wrong.
    expect(() => spacingToCanonicalM("0", "Row spacing", "imperial")).toThrow(
      /Row spacing must be greater than 0/,
    );
    expect(() => spacingToCanonicalM("0", "Vine spacing", "metric")).toThrow(
      /Vine spacing must be greater than 0/,
    );
  });
});

describe("elevationToCanonicalM", () => {
  it("converts feet to meters, and passes metric through", () => {
    expect(elevationToCanonicalM("1000", "imperial")).toBeCloseTo(ftToM(1000), 9);
    expect(elevationToCanonicalM("305", "metric")).toBeCloseTo(305, 9);
    expect(elevationToCanonicalM("", "imperial")).toBeNull();
  });
  it("accepts zero — unlike spacing, sea level is a real elevation", () => {
    expect(elevationToCanonicalM("0", "imperial")).toBe(0);
    expect(elevationToCanonicalM("0", "metric")).toBe(0);
  });
  it("refuses below sea level — inherited from the form's existing min: 0 rule", () => {
    // Real sub-sea-level vineyards exist (Death Valley, the Dead Sea). Whether to admit
    // them is a product decision, raised as an open question on plan 082 rather than
    // changed inside a refactor. Both write paths agree today, which is the point.
    expect(() => elevationToCanonicalM("-50", "metric")).toThrow(/Elevation/);
  });
});

describe("gps coercion", () => {
  it("accepts in-range coordinates including negatives", () => {
    expect(gpsLatToCanonical("38.29")).toBeCloseTo(38.29, 9);
    expect(gpsLngToCanonical("-122.45")).toBeCloseTo(-122.45, 9);
    expect(gpsLatToCanonical("")).toBeNull();
  });
  it("refuses out-of-range coordinates", () => {
    expect(() => gpsLatToCanonical("91")).toThrow(/Latitude/);
    expect(() => gpsLatToCanonical("-91")).toThrow(/Latitude/);
    expect(() => gpsLngToCanonical("181")).toThrow(/Longitude/);
    expect(() => gpsLngToCanonical("-181")).toThrow(/Longitude/);
  });
  it("accepts the exact bounds", () => {
    expect(gpsLatToCanonical("90")).toBe(90);
    expect(gpsLatToCanonical("-90")).toBe(-90);
    expect(gpsLngToCanonical("180")).toBe(180);
  });
});

describe("normalizeAbbreviation", () => {
  it("uppercases, so 'abv' and 'ABV' cannot both be stored", () => {
    expect(normalizeAbbreviation("abv")).toBe("ABV");
    expect(normalizeAbbreviation("  es  ")).toBe("ES");
    expect(normalizeAbbreviation("")).toBeNull();
  });
  it("enforces the 2-4 character lot-code slot", () => {
    expect(normalizeAbbreviation("ES")).toBe("ES");
    expect(normalizeAbbreviation("ESTA")).toBe("ESTA");
    expect(() => normalizeAbbreviation("E")).toThrow(/2-4 characters/);
    expect(() => normalizeAbbreviation("ESTATE")).toThrow(/too long/i);
  });
  it("refuses anything that isn't alphanumeric", () => {
    expect(() => normalizeAbbreviation("E-S")).toThrow(/letters and numbers/);
    expect(() => normalizeAbbreviation("E S")).toThrow(/letters and numbers/);
  });
  it("allows digits, which real vineyard tokens use", () => {
    expect(normalizeAbbreviation("B1")).toBe("B1");
  });
});
