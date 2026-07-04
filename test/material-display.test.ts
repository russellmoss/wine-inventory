import { describe, it, expect } from "vitest";
import { materialDisplayName } from "@/lib/cellar/materials-shared";

describe("materialDisplayName (Phase 036 brand vs generic)", () => {
  it("preferGeneric=false → brand name wins, falls back to generic then name", () => {
    expect(materialDisplayName({ name: "X", genericName: "Bentonite", brandName: "Nadalie", preferGeneric: false })).toBe("Nadalie");
    expect(materialDisplayName({ name: "X", genericName: "Bentonite", brandName: null, preferGeneric: false })).toBe("Bentonite");
    expect(materialDisplayName({ name: "Fallback", genericName: null, brandName: null, preferGeneric: false })).toBe("Fallback");
  });

  it("preferGeneric=true → generic wins, falls back to brand then name", () => {
    expect(materialDisplayName({ name: "X", genericName: "Bentonite", brandName: "Nadalie", preferGeneric: true })).toBe("Bentonite");
    expect(materialDisplayName({ name: "X", genericName: null, brandName: "Nadalie", preferGeneric: true })).toBe("Nadalie");
    expect(materialDisplayName({ name: "Fallback", genericName: null, brandName: null, preferGeneric: true })).toBe("Fallback");
  });

  it("trims + ignores blank generic/brand", () => {
    expect(materialDisplayName({ name: "X", genericName: "  ", brandName: "  EC-1118 ", preferGeneric: false })).toBe("EC-1118");
    expect(materialDisplayName({ name: "X", preferGeneric: true })).toBe("X");
  });
});
