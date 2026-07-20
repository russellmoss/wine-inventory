import { describe, it, expect } from "vitest";
import {
  optStr,
  optInt,
  optFloat,
  optColor,
  readUnitValue,
  spacingToCanonicalM,
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

  // ── The bug, documented before it is fixed ──
  it("BUG (pre-fix): zero silently CLEARS the field instead of erroring", () => {
    // optFloat's `min: 0` admits 0, then toCanonicalSpacing -> pos() maps `<= 0` to null.
    // A user typing 0 into row spacing gets a wiped value and no complaint. Plan 082 R1.
    expect(spacingToCanonicalM("0", "Row spacing", "imperial")).toBeNull();
  });
});
