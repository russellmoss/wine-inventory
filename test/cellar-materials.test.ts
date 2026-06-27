import { describe, it, expect } from "vitest";
import {
  cleanMaterialName,
  normalizeMaterialKey,
  coerceMaterialKind,
  coerceRateBasis,
} from "@/lib/cellar/material-normalize";

describe("material normalize / dedup", () => {
  it("dedup key collapses case + punctuation + spacing", () => {
    // "KMBS" == "kmbs" == "K-M-B-S" all map to one catalog row
    expect(normalizeMaterialKey("KMBS")).toBe("KMBS");
    expect(normalizeMaterialKey("kmbs")).toBe("KMBS");
    expect(normalizeMaterialKey("K-M-B-S")).toBe("KMBS");
    expect(normalizeMaterialKey("Potassium Metabisulfite")).toBe(
      normalizeMaterialKey("potassium metabisulfite"),
    );
  });

  it("display name trims, collapses whitespace, UPPERCASEs", () => {
    expect(cleanMaterialName("  bentonite  ")).toBe("BENTONITE");
    expect(cleanMaterialName("DAP nutrient")).toBe("DAP NUTRIENT");
  });

  it("throws on empty / punctuation-only input", () => {
    expect(() => normalizeMaterialKey("   ")).toThrow();
    expect(() => cleanMaterialName("!!!")).toThrow();
  });
});

describe("kind + basis coercion", () => {
  it("coerces known kinds, defaults unknown/empty to OTHER", () => {
    expect(coerceMaterialKind("SO2")).toBe("SO2");
    expect(coerceMaterialKind("fining")).toBe("FINING");
    expect(coerceMaterialKind("widget")).toBe("OTHER");
    expect(coerceMaterialKind(undefined)).toBe("OTHER");
  });

  it("coerces a valid basis, nulls an unknown one", () => {
    expect(coerceRateBasis("G_HL")).toBe("G_HL");
    expect(coerceRateBasis("mg_l")).toBe("MG_L");
    expect(coerceRateBasis("PCT")).toBeNull();
    expect(coerceRateBasis(null)).toBeNull();
  });
});
