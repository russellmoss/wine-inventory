import { describe, it, expect } from "vitest";
import { pickTaxAbv, assertBottlingAbv } from "@/lib/compliance/abv";

describe("tax-ABV resolver precedence (Unit 2, Fork 1A)", () => {
  it("override wins over a reading", () => {
    expect(pickTaxAbv(14.2, 13.5)).toEqual({ abv: 14.2, source: "override" });
  });
  it("reading is used when there is no override", () => {
    expect(pickTaxAbv(null, 13.5)).toEqual({ abv: 13.5, source: "reading" });
    expect(pickTaxAbv(undefined, 13.5)).toEqual({ abv: 13.5, source: "reading" });
  });
  it("neither → null (fold defaults to class a, S2, and blocks filing)", () => {
    expect(pickTaxAbv(null, null)).toEqual({ abv: null, source: "none" });
  });
  it("an override of 0 is respected (not treated as missing)", () => {
    // 0 is a real value; only null/undefined mean 'not set'.
    expect(pickTaxAbv(0, 13.5)).toEqual({ abv: 0, source: "override" });
  });
});

describe("assertBottlingAbv", () => {
  it("accepts a positive ABV", () => {
    expect(() => assertBottlingAbv(13.5)).not.toThrow();
  });
  it("rejects zero / negative", () => {
    expect(() => assertBottlingAbv(0)).toThrow();
    expect(() => assertBottlingAbv(-1)).toThrow();
  });
});
