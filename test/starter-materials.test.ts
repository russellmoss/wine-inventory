import { describe, it, expect } from "vitest";
import { MATERIAL_KINDS, type MaterialKind } from "@/lib/cellar/additions-math";
import { coerceMaterialKind } from "@/lib/cellar/material-normalize";
import { STOCK_UNITS } from "@/lib/cellar/materials-shared";
import { STARTER_MATERIALS } from "@/lib/onboarding/seed-starter-materials";

describe("Phase 9.1 material kinds", () => {
  it("adds BENTONITE / CHITOSAN / CLEANING / SANITIZER to the controlled vocabulary", () => {
    for (const k of ["BENTONITE", "CHITOSAN", "CLEANING", "SANITIZER"] as const) {
      expect(MATERIAL_KINDS as readonly string[]).toContain(k);
    }
  });

  it("resolves the new kinds without falling back to OTHER (post const edit)", () => {
    expect(coerceMaterialKind("CLEANING")).toBe("CLEANING");
    expect(coerceMaterialKind("sanitizer")).toBe("SANITIZER"); // case-insensitive
    expect(coerceMaterialKind("BENTONITE")).toBe("BENTONITE");
    expect(coerceMaterialKind("chitosan")).toBe("CHITOSAN");
    expect(coerceMaterialKind("widget")).toBe("OTHER"); // still falls back
  });
});

describe("starter material catalog", () => {
  it("uses only controlled kinds and valid stock units", () => {
    for (const m of STARTER_MATERIALS) {
      expect(MATERIAL_KINDS as readonly string[], m.name).toContain(m.kind);
      expect(STOCK_UNITS as readonly string[], m.name).toContain(m.stockUnit);
    }
  });

  it("has no duplicate (kind, name) entries", () => {
    const keys = STARTER_MATERIALS.map((m) => `${m.kind}::${m.name.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers every generic-Addition family so the picker resolves for each", () => {
    const kinds = new Set<MaterialKind>(STARTER_MATERIALS.map((m) => m.kind));
    for (const k of ["YEAST", "MLF", "SO2", "NUTRIENT", "ACID", "TANNIN", "FINING", "BENTONITE", "CHITOSAN", "ENZYME"] as const) {
      expect(kinds, `missing starter for ${k}`).toContain(k);
    }
  });

  it("includes both overhead families (cleaning + sanitizer) for the maintenance lane", () => {
    const kinds = new Set(STARTER_MATERIALS.map((m) => m.kind));
    expect(kinds).toContain("CLEANING");
    expect(kinds).toContain("SANITIZER");
  });

  it("includes KHT (cold-stab seeding) so cold-stabilization rides the generic templates", () => {
    expect(STARTER_MATERIALS.some((m) => /bitartrate|KHT/i.test(m.name))).toBe(true);
  });

  it("gives dosing materials a rate basis and leaves overhead chemicals basis-less", () => {
    for (const m of STARTER_MATERIALS) {
      if (m.kind === "CLEANING" || m.kind === "SANITIZER") {
        expect(m.defaultBasis, `${m.name} is overhead — no dose basis`).toBeNull();
      } else {
        expect(m.defaultBasis, `${m.name} is a dosing material — needs a basis`).not.toBeNull();
      }
    }
  });
});
