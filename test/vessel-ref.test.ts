import { describe, it, expect } from "vitest";
import { parseVesselRef } from "@/lib/vessels/ref";

describe("parseVesselRef", () => {
  it("parses barrel + numeric code", () => {
    expect(parseVesselRef("barrel 14")).toEqual({ type: "BARREL", code: "14" });
    expect(parseVesselRef("Barrel 16")).toEqual({ type: "BARREL", code: "16" });
  });

  it("parses tank + alphanumeric code", () => {
    expect(parseVesselRef("tank 1")).toEqual({ type: "TANK", code: "1" });
    expect(parseVesselRef("Tank T1")).toEqual({ type: "TANK", code: "T1" });
    expect(parseVesselRef("vat A")).toEqual({ type: "TANK", code: "A" });
  });

  it("handles #, 'no', and 'number' before the code", () => {
    expect(parseVesselRef("barrel #14")).toEqual({ type: "BARREL", code: "14" });
    expect(parseVesselRef("barrel no. 14")).toEqual({ type: "BARREL", code: "14" });
    expect(parseVesselRef("barrel number 7")).toEqual({ type: "BARREL", code: "7" });
  });

  it("accepts abbreviations", () => {
    expect(parseVesselRef("bbl 9")).toEqual({ type: "BARREL", code: "9" });
  });

  it("returns null when there is no vessel keyword or no code", () => {
    expect(parseVesselRef("14")).toBeNull();
    expect(parseVesselRef("the merlot")).toBeNull();
    expect(parseVesselRef("barrel")).toBeNull();
    expect(parseVesselRef("")).toBeNull();
  });
});
