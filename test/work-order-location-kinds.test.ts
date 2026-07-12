import { describe, it, expect } from "vitest";
import { normalizeLocationKind, isLocationKind, locationKindLabel, LOCATION_KINDS } from "@/lib/work-orders/location-kinds";

// Plan 053 B9: Location.kind is a validated string (no enum). Nullable = unclassified is always allowed.

describe("location kinds", () => {
  it("accepts every declared kind", () => {
    for (const k of LOCATION_KINDS) expect(normalizeLocationKind(k)).toBe(k);
  });
  it("empty/absent → null (unclassified)", () => {
    expect(normalizeLocationKind("")).toBeNull();
    expect(normalizeLocationKind(null)).toBeNull();
    expect(normalizeLocationKind(undefined)).toBeNull();
  });
  it("throws on an unknown kind", () => {
    expect(() => normalizeLocationKind("garage")).toThrow(/invalid location kind/i);
  });
  it("isLocationKind guards", () => {
    expect(isLocationKind("crush_pad")).toBe(true);
    expect(isLocationKind("nope")).toBe(false);
  });
  it("labels are human-readable", () => {
    expect(locationKindLabel("crush_pad")).toBe("Crush pad");
    expect(locationKindLabel(null)).toBe("Unclassified");
  });
});
