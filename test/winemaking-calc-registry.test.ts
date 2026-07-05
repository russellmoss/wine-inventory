import { describe, it, expect } from "vitest";
import { CALCULATORS, CALC_DESCRIPTORS, defaultInput, SECTIONS } from "@/lib/winemaking-calc/registry";

describe("calculator registry", () => {
  it("has unique ids", () => {
    const ids = CALCULATORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every descriptor's section is a known section", () => {
    for (const d of CALCULATORS) expect(SECTIONS).toContain(d.section);
  });

  it("includes the 3 static reference calcs (21 / 23 / 51)", () => {
    const statics = CALCULATORS.filter((d) => d.kind === "static");
    expect(statics.length).toBeGreaterThanOrEqual(3);
  });

  it("covers all 8 sections", () => {
    const sectionsWithCalcs = new Set(CALCULATORS.map((d) => d.section));
    expect(sectionsWithCalcs.size).toBe(8);
  });

  // The coverage guard: every computational descriptor must compute on its declared defaults
  // and return finite numbers. Proves no descriptor is wired to a missing/throwing function.
  it.each(CALC_DESCRIPTORS.map((d) => [d.id, d] as const))(
    "%s computes finite values on its defaults",
    (_id, d) => {
      const result = d.compute(defaultInput(d));
      expect(result.values.length).toBeGreaterThan(0);
      for (const v of result.values) expect(Number.isFinite(v.value)).toBe(true);
      expect(typeof result.formula).toBe("string");
    },
  );

  it("surfaces the molecular-SO₂ low-target warning path", () => {
    const molecular = CALC_DESCRIPTORS.find((d) => d.id === "so2-molecular")!;
    const r = molecular.compute({ molecularTarget: 0.08, pH: 3.4 });
    expect(r.warning).toMatch(/0\.8/);
  });

  it("flags advisory + danger descriptors", () => {
    const reduction = CALCULATORS.find((d) => d.id === "so2-reduction")!;
    expect(reduction.kind === "calc" && reduction.advisory).toBe(true);
    expect(reduction.kind === "calc" && reduction.danger).toBe(true);
    const copper = CALCULATORS.find((d) => d.id === "copper-anhydrous")!;
    expect(copper.kind === "calc" && copper.danger).toBe(true);
  });
});
