import { describe, it, expect } from "vitest";
import {
  ftToM,
  mToFt,
  acresToHa,
  haToAcres,
  blockAreaSqM,
  blockAcres,
  blockHectares,
  blockArea,
  toCanonicalSpacing,
  fromCanonicalSpacing,
  formatSpacing,
  formatArea,
  vinesPerRow,
  FT_PER_M,
} from "@/lib/vineyard/units";

describe("length conversion", () => {
  it("round-trips ft -> m -> ft within tolerance", () => {
    for (const ft of [1, 5, 7, 100.5]) {
      expect(mToFt(ftToM(ft))).toBeCloseTo(ft, 9);
    }
  });
  it("uses the documented constant", () => {
    expect(mToFt(1)).toBeCloseTo(FT_PER_M, 9);
  });
});

describe("area conversion", () => {
  it("round-trips acres <-> hectares", () => {
    expect(haToAcres(acresToHa(1))).toBeCloseTo(1, 9);
    expect(acresToHa(haToAcres(0.5))).toBeCloseTo(0.5, 9);
  });
  it("1 hectare ~= 2.4711 acres", () => {
    expect(haToAcres(1)).toBeCloseTo(2.4710538, 4);
  });
});

describe("blockAcres (imperial reference case)", () => {
  it("7ft x 5ft x 1245 vines ~= 1.00 acre", () => {
    // spacing stored canonically in meters
    const r = toCanonicalSpacing(7, "imperial")!;
    const v = toCanonicalSpacing(5, "imperial")!;
    const acres = blockAcres(r, v, 1245)!;
    expect(acres).toBeCloseTo(1.0, 2); // 7*5*1245/43560 = 1.0003 acre
  });
});

describe("blockHectares (metric reference case)", () => {
  it("2m x 1.5m x 1245 = 0.3735 ha", () => {
    expect(blockHectares(2, 1.5, 1245)).toBeCloseTo(0.3735, 4);
  });
  it("blockAreaSqM matches 2*1.5*1245", () => {
    expect(blockAreaSqM(2, 1.5, 1245)).toBe(3735);
  });
});

describe("blockArea dispatches on unit", () => {
  it("imperial -> acres, metric -> hectares for the same inputs", () => {
    const r = 2;
    const v = 1.5;
    expect(blockArea(r, v, 1245, "metric")).toBeCloseTo(0.3735, 4);
    expect(blockArea(r, v, 1245, "imperial")).toBeCloseTo(haToAcres(0.3735), 4);
  });
});

describe("null / zero / negative guards", () => {
  it("returns null when any input is missing or non-positive", () => {
    expect(blockAreaSqM(null, 1.5, 1245)).toBeNull();
    expect(blockAreaSqM(2, undefined, 1245)).toBeNull();
    expect(blockAreaSqM(2, 1.5, 0)).toBeNull();
    expect(blockAreaSqM(-2, 1.5, 1245)).toBeNull();
    expect(blockAcres(2, 1.5, null)).toBeNull();
    expect(blockHectares(2, 1.5, undefined)).toBeNull();
    expect(toCanonicalSpacing(0, "imperial")).toBeNull();
    expect(fromCanonicalSpacing(NaN, "metric")).toBeNull();
    expect(vinesPerRow(1245, 0)).toBeNull();
  });
});

describe("canonical spacing conversion", () => {
  it("imperial input converts to meters and back", () => {
    const m = toCanonicalSpacing(7, "imperial")!;
    expect(m).toBeCloseTo(ftToM(7), 9);
    expect(fromCanonicalSpacing(m, "imperial")).toBeCloseTo(7, 9);
  });
  it("metric input is stored as-is", () => {
    expect(toCanonicalSpacing(2.13, "metric")).toBe(2.13);
    expect(fromCanonicalSpacing(2.13, "metric")).toBe(2.13);
  });
});

describe("display formatting", () => {
  it("formats spacing with 2dp and the right unit label", () => {
    expect(formatSpacing(ftToM(7), "imperial")).toBe("7.00 ft");
    expect(formatSpacing(2.131, "metric")).toBe("2.13 m");
    expect(formatSpacing(null, "imperial")).toBe("—");
  });
  it("formats area with 2dp and the right unit label", () => {
    expect(formatArea(1.0003, "imperial")).toBe("1.00 acres");
    expect(formatArea(0.3735, "metric")).toBe("0.37 ha");
    expect(formatArea(null, "metric")).toBe("—");
  });
});

describe("vinesPerRow", () => {
  it("divides vines by rows", () => {
    expect(vinesPerRow(1200, 40)).toBe(30);
  });
});
