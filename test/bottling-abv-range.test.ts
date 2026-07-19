import { describe, it, expect } from "vitest";
import {
  validateBottlingAbv,
  MIN_BOTTLING_ABV,
  MAX_BOTTLING_ABV,
  ABV_REQUIRED_MESSAGE,
  ABV_TOO_HIGH_MESSAGE,
} from "@/lib/bottling/abv-range";

// P0 data-integrity guard (issue #263): bottling accepted absurd ABV (e.g. 140%), corrupting the
// finished-goods/tax record. ABV is a %-by-volume, physically bounded to (0, 100].

describe("validateBottlingAbv", () => {
  it("accepts a normal still-wine ABV", () => {
    expect(validateBottlingAbv(13.5)).toBeNull();
  });

  it("accepts the review band above 24% (tax-class flags it, we don't reject it)", () => {
    expect(validateBottlingAbv(25.5)).toBeNull();
    expect(validateBottlingAbv(40)).toBeNull();
  });

  it("accepts the exact physical maximum (100%)", () => {
    expect(validateBottlingAbv(MAX_BOTTLING_ABV)).toBeNull();
    expect(validateBottlingAbv(99.99)).toBeNull();
  });

  it("rejects the reported bug value (140%)", () => {
    expect(validateBottlingAbv(140)).toBe(ABV_TOO_HIGH_MESSAGE);
  });

  it("rejects anything above 100%", () => {
    expect(validateBottlingAbv(100.01)).toBe(ABV_TOO_HIGH_MESSAGE);
    expect(validateBottlingAbv(1000)).toBe(ABV_TOO_HIGH_MESSAGE);
  });

  it("rejects zero and negatives as missing/invalid", () => {
    expect(validateBottlingAbv(MIN_BOTTLING_ABV)).toBe(ABV_REQUIRED_MESSAGE);
    expect(validateBottlingAbv(0)).toBe(ABV_REQUIRED_MESSAGE);
    expect(validateBottlingAbv(-5)).toBe(ABV_REQUIRED_MESSAGE);
  });

  it("rejects non-finite input (NaN / Infinity) as invalid", () => {
    expect(validateBottlingAbv(Number.NaN)).toBe(ABV_REQUIRED_MESSAGE);
    // Infinity is non-finite → caught by the same guard, never treated as a valid value.
    expect(validateBottlingAbv(Number.POSITIVE_INFINITY)).toBe(ABV_REQUIRED_MESSAGE);
  });

  it("accepts the smallest positive value just above the lower bound", () => {
    expect(validateBottlingAbv(0.1)).toBeNull();
  });
});
