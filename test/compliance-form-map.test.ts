import { describe, it, expect } from "vitest";
import { mapLineToForm, type MovementInput } from "@/lib/compliance/form-map";
import type { WineTaxClass } from "@/lib/compliance/types";

const base = (over: Partial<MovementInput>): MovementInput => ({
  opType: "RACK",
  reason: null,
  source: "BULK",
  deltaSign: -1,
  taxClass: "A_LE16" as WineTaxClass,
  sparklingSub: null,
  ...over,
});

describe("mapLineToForm (Unit 5)", () => {
  it("CRUSH → null (crushed fruit/juice is NOT §A wine, C2)", () => {
    expect(mapLineToForm(base({ opType: "CRUSH", reason: "crush_origination", deltaSign: 1 })).target).toBeNull();
  });

  it("MUST/JUICE→WINE transition → A2 produced by fermentation (C2)", () => {
    const r = mapLineToForm(base({ opType: "FERMENT_TO_WINE", deltaSign: 1 }));
    expect(r.target).toEqual({ section: "A", line: 2, sub: null });
  });

  it("BOTTLE: bulk-out → A13, bottle-in → B2 (ftn 3, same volume ⇒ A13==B2)", () => {
    expect(mapLineToForm(base({ opType: "BOTTLE", source: "BULK" })).target).toEqual({ section: "A", line: 13, sub: null });
    expect(mapLineToForm(base({ opType: "BOTTLE", source: "BOTTLED" })).target).toEqual({ section: "B", line: 2, sub: null });
  });

  it("REMOVE_TAXPAID section chosen by bucket/source (S5): A14 bulk, B8 bottled", () => {
    expect(mapLineToForm(base({ opType: "REMOVE_TAXPAID", reason: "TAXPAID", source: "BULK", deltaSign: 1 })).target).toEqual({ section: "A", line: 14, sub: null });
    expect(mapLineToForm(base({ opType: "REMOVE_TAXPAID", reason: "TAXPAID", source: "BOTTLED", deltaSign: 1 })).target).toEqual({ section: "B", line: 8, sub: null });
  });

  it("REMOVE_TAXPAID dispositions map to the right lines", () => {
    const m = (reason: string, source: "BULK" | "BOTTLED") =>
      mapLineToForm(base({ opType: "REMOVE_TAXPAID", reason, source, deltaSign: 1 })).target;
    expect(m("DISTILLING_MATERIAL", "BULK")).toEqual({ section: "A", line: 16, sub: null });
    expect(m("VINEGAR", "BULK")).toEqual({ section: "A", line: 17, sub: null });
    expect(m("SWEETENING", "BULK")).toEqual({ section: "A", line: 18, sub: null });
    expect(m("SPIRITS", "BULK")).toEqual({ section: "A", line: 19, sub: null });
    expect(m("AMELIORATION", "BULK")).toEqual({ section: "A", line: 21, sub: null });
    expect(m("EFFERVESCENT", "BULK")).toEqual({ section: "A", line: 22, sub: null });
    expect(m("TESTING", "BULK")).toEqual({ section: "A", line: 23, sub: null });
    expect(m("EXPORT", "BOTTLED")).toEqual({ section: "B", line: 12, sub: null });
    expect(m("FAMILY_USE", "BOTTLED")).toEqual({ section: "B", line: 13, sub: null });
    expect(m("TASTING", "BOTTLED")).toEqual({ section: "B", line: 11, sub: null });
    expect(m("TESTING", "BOTTLED")).toEqual({ section: "B", line: 14, sub: null });
  });

  it("a bulk-only disposition against bottled wine → null + Part X (no matching line)", () => {
    const r = mapLineToForm(base({ opType: "REMOVE_TAXPAID", reason: "VINEGAR", source: "BOTTLED", deltaSign: 1 }));
    expect(r.target).toBeNull();
    expect(r.partXReason).toBeTruthy();
  });

  it("BLEND same-class → null; cross-class → A5 (produced) / A20 (used) + Part X flag (ftn 5)", () => {
    expect(mapLineToForm(base({ opType: "BLEND", crossesTaxClass: false, deltaSign: 1 })).target).toBeNull();
    const child = mapLineToForm(base({ opType: "BLEND", crossesTaxClass: true, deltaSign: 1 }));
    expect(child.target).toEqual({ section: "A", line: 5, sub: null });
    expect(child.partXReason).toBeTruthy();
    const parent = mapLineToForm(base({ opType: "BLEND", crossesTaxClass: true, deltaSign: -1 }));
    expect(parent.target).toEqual({ section: "A", line: 20, sub: null });
  });

  it("LOSS → A29 (bulk) / B18 (bottled breakage)", () => {
    expect(mapLineToForm(base({ opType: "LOSS", reason: "loss", source: "BULK", deltaSign: 1 })).target).toEqual({ section: "A", line: 29, sub: null });
    expect(mapLineToForm(base({ opType: "LOSS", reason: "loss", source: "BOTTLED", deltaSign: 1 })).target).toEqual({ section: "B", line: 18, sub: null });
  });

  it("a lees/filtration loss on any op → A29 bulk / B18 bottled", () => {
    expect(mapLineToForm(base({ opType: "RACK", reason: "loss", source: "BULK", deltaSign: 1 })).target).toEqual({ section: "A", line: 29, sub: null });
    expect(mapLineToForm(base({ opType: "FILTRATION", reason: "filtration", source: "BULK", deltaSign: 1 })).target).toEqual({ section: "A", line: 29, sub: null });
  });

  it("internal in-bond moves → null (RACK/TOPPING/FINING/CAP_MGMT/RIDDLING/DOSAGE)", () => {
    for (const opType of ["RACK", "TOPPING", "FINING", "CAP_MGMT", "RIDDLING", "DOSAGE", "ADDITION"] as const) {
      expect(mapLineToForm(base({ opType })).target).toBeNull();
    }
  });

  it("sparkling class carries the BF/BP sub onto its line", () => {
    const r = mapLineToForm(base({ opType: "BOTTLE", source: "BOTTLED", taxClass: "E_SPARKLING", sparklingSub: "BF" }));
    expect(r.target).toEqual({ section: "B", line: 2, sub: "BF" });
  });
});
