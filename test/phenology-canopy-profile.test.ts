import { describe, expect, it } from "vitest";
import {
  resolveClusterCompactness,
  describeClusterCompactness,
} from "@/lib/phenology/canopy-profile";

// S4/D12 — block override → variety default → unknown. The all-null case is the one that
// matters: it must resolve to `unknown`, never to a silent default (standing rule §3.6).

describe("resolveClusterCompactness (D12 precedence)", () => {
  it("prefers the block override over the variety default", () => {
    expect(resolveClusterCompactness("LOOSE", "TIGHT")).toEqual({ value: "LOOSE", source: "BLOCK" });
  });

  it("falls back to the variety default when the block has no override", () => {
    expect(resolveClusterCompactness(null, "TIGHT")).toEqual({ value: "TIGHT", source: "VARIETY" });
    expect(resolveClusterCompactness(undefined, "MODERATE")).toEqual({
      value: "MODERATE",
      source: "VARIETY",
    });
  });

  it("resolves to unknown — never a default — when nothing is recorded", () => {
    expect(resolveClusterCompactness(null, null)).toEqual({ value: null, source: "UNKNOWN" });
    expect(resolveClusterCompactness(undefined, undefined)).toEqual({
      value: null,
      source: "UNKNOWN",
    });
  });

  it("a block override still wins when the variety default is missing", () => {
    expect(resolveClusterCompactness("TIGHT", null)).toEqual({ value: "TIGHT", source: "BLOCK" });
  });
});

describe("describeClusterCompactness", () => {
  it("names the provenance so an inherited value is never read as a block measurement", () => {
    expect(describeClusterCompactness({ value: "TIGHT", source: "BLOCK" })).toContain("this block");
    expect(describeClusterCompactness({ value: "TIGHT", source: "VARIETY" })).toContain(
      "variety default",
    );
  });

  it("renders unknown as 'not recorded' — never as a clean value", () => {
    const text = describeClusterCompactness({ value: null, source: "UNKNOWN" });
    expect(text).toContain("not recorded");
    expect(text.toLowerCase()).not.toContain("loose");
    expect(text.toLowerCase()).not.toContain("moderate");
  });
});
