import { describe, it, expect } from "vitest";
import { coerceBrix, coercePh, coerceTa, PH_MIN, PH_MAX, TA_MIN, TA_MAX, BRIX_MAX } from "@/lib/harvest/pick-fields";

// Plan 039 Unit 2: the pure field coercion shared by the harvest action, the assistant weigh-in tool, and
// the WO HARVEST_WEIGH_IN completion handler. Ranges mirror the analyte registry.

describe("coerceBrix / coercePh / coerceTa — optional readings", () => {
  it("treat null / undefined / empty string as absent (returns null)", () => {
    for (const fn of [coerceBrix, coercePh, coerceTa]) {
      expect(fn(null)).toBeNull();
      expect(fn(undefined)).toBeNull();
      expect(fn("")).toBeNull();
    }
  });

  it("coerce numeric strings to numbers", () => {
    expect(coerceBrix("24.5")).toBe(24.5);
    expect(coercePh("3.4")).toBe(3.4);
    expect(coerceTa("6.2")).toBe(6.2);
  });

  it("accept in-range values", () => {
    expect(coerceBrix(24)).toBe(24);
    expect(coercePh(PH_MIN)).toBe(PH_MIN);
    expect(coercePh(PH_MAX)).toBe(PH_MAX);
    expect(coerceTa(TA_MIN)).toBe(TA_MIN);
    expect(coerceTa(TA_MAX)).toBe(TA_MAX);
  });

  it("reject non-numeric values", () => {
    expect(() => coercePh("abc")).toThrow(/numeric pH/i);
    expect(() => coerceTa("x")).toThrow(/numeric TA/i);
  });

  it("reject out-of-range readings with a registry-consistent message", () => {
    expect(() => coerceBrix(BRIX_MAX + 1)).toThrow(/Brix/);
    expect(() => coercePh(PH_MAX + 0.5)).toThrow(/pH/);
    expect(() => coercePh(PH_MIN - 0.5)).toThrow(/pH/);
    expect(() => coerceTa(-1)).toThrow(/TA/);
    expect(() => coerceTa(TA_MAX + 1)).toThrow(/TA/);
  });
});
