import { describe, it, expect } from "vitest";
import { expandVesselRange } from "@/lib/vessels/range";

describe("expandVesselRange", () => {
  it("expands a barrel range preserving prefix", () => {
    expect(expandVesselRange("B101-B110")).toEqual([
      "B101", "B102", "B103", "B104", "B105", "B106", "B107", "B108", "B109", "B110",
    ]);
  });

  it("expands a tank range", () => {
    expect(expandVesselRange("T4-T20")).toHaveLength(17);
    expect(expandVesselRange("T4-T20")![0]).toBe("T4");
    expect(expandVesselRange("T4-T20")!.at(-1)).toBe("T20");
  });

  it("preserves zero-padding to the widest endpoint", () => {
    expect(expandVesselRange("B01-B10")).toEqual([
      "B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B09", "B10",
    ]);
  });

  it("accepts the second endpoint without a repeated prefix and 'to'/spaces", () => {
    expect(expandVesselRange("B101 - 103")).toEqual(["B101", "B102", "B103"]);
    expect(expandVesselRange("barr 1 to 3".replace("barr", "B"))).toEqual(["B1", "B2", "B3"]);
  });

  it("returns null when the text is not a range (fall through to group/list)", () => {
    expect(expandVesselRange("north barrels")).toBeNull();
    expect(expandVesselRange("T12")).toBeNull();
    expect(expandVesselRange("")).toBeNull();
  });

  it("rejects incoherent prefixes", () => {
    expect(expandVesselRange("B1-T10")).toBeNull();
  });

  it("throws on an inverted range", () => {
    expect(() => expandVesselRange("B110-B101")).toThrow(/backward/i);
  });

  it("throws on an oversized range", () => {
    expect(() => expandVesselRange("B1-B9999")).toThrow(/too many/i);
  });
});
