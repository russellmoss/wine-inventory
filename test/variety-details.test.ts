import { describe, it, expect } from "vitest";
import {
  parseVarietyDetails,
  cleanDetailText,
  isEmptyVarietyDetails,
  EMPTY_VARIETY_DETAILS,
  MAX_DETAIL_LENGTH,
} from "@/lib/reference/variety-details";

describe("cleanDetailText", () => {
  it("trims and keeps real text", () => {
    expect(cleanDetailText("  Dijon 115 ")).toBe("Dijon 115");
  });

  it("normalizes blank and absent to null so nothing writes an empty string", () => {
    expect(cleanDetailText("")).toBeNull();
    expect(cleanDetailText("   ")).toBeNull();
    expect(cleanDetailText(null)).toBeNull();
    expect(cleanDetailText(undefined)).toBeNull();
  });
});

describe("parseVarietyDetails", () => {
  it("returns all-null when nothing is supplied — the opt-out path", () => {
    const r = parseVarietyDetails({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual(EMPTY_VARIETY_DETAILS);
      expect(isEmptyVarietyDetails(r.value)).toBe(true);
    }
  });

  it("parses a full set the way a winemaker would type it", () => {
    const r = parseVarietyDetails({
      clone: " Dijon 115 ",
      rootstock: "101-14",
      nursery: "Novavine",
      berryColor: "BLACK",
      species: "VINIFERA",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({
        clone: "Dijon 115",
        rootstock: "101-14",
        nursery: "Novavine",
        berryColor: "BLACK",
        species: "VINIFERA",
      });
      expect(isEmptyVarietyDetails(r.value)).toBe(false);
    }
  });

  it("accepts lowercase enum input from a form", () => {
    const r = parseVarietyDetails({ berryColor: "white", species: "hybrid" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.berryColor).toBe("WHITE");
      expect(r.value.species).toBe("HYBRID");
    }
  });

  it("treats an empty select as not-recorded rather than invalid", () => {
    const r = parseVarietyDetails({ berryColor: "", species: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.berryColor).toBeNull();
      expect(r.value.species).toBeNull();
    }
  });

  // A silently-dropped bad enum would look saved to the winemaker but read back empty.
  it("refuses an unknown color instead of dropping it", () => {
    const r = parseVarietyDetails({ berryColor: "PURPLE" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/black or white/i);
  });

  it("refuses an unknown species instead of dropping it", () => {
    const r = parseVarietyDetails({ species: "RUPESTRIS" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/vinifera, hybrid, or other/i);
  });

  it("accepts OTHER as the documented escape hatch", () => {
    const r = parseVarietyDetails({ species: "OTHER" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.species).toBe("OTHER");
  });

  it("rejects over-long free text and names the field", () => {
    const r = parseVarietyDetails({ rootstock: "x".repeat(MAX_DETAIL_LENGTH + 1) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^Rootstock is too long/);
  });

  it("allows free text exactly at the limit", () => {
    const r = parseVarietyDetails({ clone: "x".repeat(MAX_DETAIL_LENGTH) });
    expect(r.ok).toBe(true);
  });

  it("parses a partial set, leaving the rest null", () => {
    const r = parseVarietyDetails({ clone: "FPS 04" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.clone).toBe("FPS 04");
      expect(r.value.rootstock).toBeNull();
      expect(r.value.berryColor).toBeNull();
    }
  });
});
