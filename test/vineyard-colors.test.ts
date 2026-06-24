import { describe, it, expect } from "vitest";
import {
  PALETTE,
  FALLBACK_COLOR,
  isValidHex,
  defaultColorFor,
  effectiveColor,
} from "@/lib/vineyard/colors";

describe("isValidHex", () => {
  it("accepts #rrggbb and #rgb", () => {
    expect(isValidHex("#722F37")).toBe(true);
    expect(isValidHex("#abc")).toBe(true);
    expect(isValidHex("  #FFF8F1  ")).toBe(true);
  });
  it("rejects junk", () => {
    expect(isValidHex("722F37")).toBe(false);
    expect(isValidHex("#12")).toBe(false);
    expect(isValidHex("#gggggg")).toBe(false);
    expect(isValidHex("red")).toBe(false);
    expect(isValidHex(null)).toBe(false);
    expect(isValidHex(123)).toBe(false);
  });
});

describe("defaultColorFor", () => {
  it("is deterministic — same id yields same color across calls", () => {
    const a = defaultColorFor("clx123");
    const b = defaultColorFor("clx123");
    expect(a).toBe(b);
  });
  it("outputs a valid hex string", () => {
    for (const id of ["a", "b", "variety-1", "zzz", "clabcdef0001", "9", "x".repeat(40)]) {
      expect(isValidHex(defaultColorFor(id))).toBe(true);
    }
  });
  it("uses the editorial palette for base-tier ids", () => {
    const hexes = new Set(PALETTE.map((p) => p.hex));
    // at least some ids land directly on base tokens
    const landed = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].some((id) =>
      hexes.has(defaultColorFor(id)),
    );
    expect(landed).toBe(true);
  });
  it("returns the neutral fallback when there is no variety", () => {
    expect(defaultColorFor(null)).toBe(FALLBACK_COLOR);
    expect(defaultColorFor(undefined)).toBe(FALLBACK_COLOR);
    expect(defaultColorFor("")).toBe(FALLBACK_COLOR);
  });
});

describe("effectiveColor precedence", () => {
  it("block override wins over variety color and default", () => {
    expect(
      effectiveColor({ blockColor: "#111111", varietyColor: "#222222", varietyId: "v1" }),
    ).toBe("#111111");
  });
  it("variety color wins over default when no block override", () => {
    expect(effectiveColor({ blockColor: null, varietyColor: "#222222", varietyId: "v1" })).toBe(
      "#222222",
    );
  });
  it("falls back to the deterministic default", () => {
    expect(effectiveColor({ varietyId: "v1" })).toBe(defaultColorFor("v1"));
  });
  it("ignores invalid stored colors", () => {
    expect(effectiveColor({ blockColor: "nope", varietyColor: "#222222", varietyId: "v1" })).toBe(
      "#222222",
    );
    expect(effectiveColor({ blockColor: "nope", varietyColor: "bad", varietyId: "v1" })).toBe(
      defaultColorFor("v1"),
    );
  });
});

describe("rename stability", () => {
  it("color follows the id, not the name (renaming keeps the color)", () => {
    // The id is the only input; a rename never reaches this function.
    const id = "variety-stable-id";
    const before = defaultColorFor(id);
    const after = defaultColorFor(id);
    expect(after).toBe(before);
  });
});
