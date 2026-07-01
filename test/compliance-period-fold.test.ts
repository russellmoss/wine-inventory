import { describe, it, expect } from "vitest";
import { foldPeriodCells, type LineContribution, type BeginCell, type OnHand } from "@/lib/compliance/period-fold";
import { LITERS_PER_US_GALLON, litersToGallons } from "@/lib/compliance/gallons";
import type { FormSection, SparklingSub, WineTaxClass } from "@/lib/compliance/types";

// ── helpers ──
const gal = (g: number) => g * LITERS_PER_US_GALLON; // sample values are in gallons → back to liters
const cases = (n: number) => n * 9; // 1 case = 12 × 750 mL = 9 L (TTB uses 2.37753 gal/case)
const contrib = (section: FormSection, line: number, column: WineTaxClass, liters: number, sub: SparklingSub = null): LineContribution => ({ section, line, column, sub, liters });
const onHand = (section: FormSection, column: WineTaxClass, liters: number, sub: SparklingSub = null): OnHand => ({ section, column, sub, liters });
const findCell = (r: ReturnType<typeof foldPeriodCells>, section: FormSection, line: number, column: WineTaxClass, sub: SparklingSub = null) =>
  r.cells.find((c) => c.section === section && c.line === line && c.column === column && c.sub === sub)?.gallons ?? 0;

describe("foldPeriodCells (Unit 6) — mechanics", () => {
  it("month 1: ferment → bottle → remove-taxpaid → loss foots every column, A13==B2", () => {
    const r = foldPeriodCells({
      begin: [],
      contributions: [
        contrib("A", 2, "A_LE16", 1000), // produced by fermentation
        contrib("A", 13, "A_LE16", 400), // bottled (bulk out)
        contrib("A", 14, "A_LE16", 100), // removed taxpaid
        contrib("A", 29, "A_LE16", 10), // loss
        contrib("B", 2, "A_LE16", 400), // bottled (bottled in) == A13
      ],
      endLiters: [onHand("A", "A_LE16", 490), onHand("B", "A_LE16", 400)],
    });

    expect(findCell(r, "A", 2, "A_LE16")).toBe(litersToGallons(1000)); // 264.17
    expect(findCell(r, "A", 13, "A_LE16")).toBe(litersToGallons(400)); // 105.67
    expect(findCell(r, "A", 14, "A_LE16")).toBe(litersToGallons(100)); // 26.42
    expect(findCell(r, "A", 29, "A_LE16")).toBe(litersToGallons(10)); // 2.64
    expect(findCell(r, "A", 31, "A_LE16")).toBe(litersToGallons(490)); // on-hand end
    expect(findCell(r, "B", 20, "A_LE16")).toBe(litersToGallons(400));
    expect(r.balanced).toBe(true);
    expect(r.a13EqualsB2).toBe(true);
    // no phantom inventory gain/loss when the ledger is internally consistent
    expect(findCell(r, "A", 9, "A_LE16")).toBe(0);
    expect(findCell(r, "A", 30, "A_LE16")).toBe(0);
  });

  it("month 2: begin carried forward from month-1 end == prior end; still foots", () => {
    const begin: BeginCell[] = [
      { section: "A", column: "A_LE16", sub: null, gallons: litersToGallons(490) },
      { section: "B", column: "A_LE16", sub: null, gallons: litersToGallons(400) },
    ];
    const r = foldPeriodCells({
      begin,
      contributions: [contrib("A", 14, "A_LE16", 200)], // remove 200 L taxpaid
      endLiters: [onHand("A", "A_LE16", 290), onHand("B", "A_LE16", 400)],
    });
    expect(findCell(r, "A", 1, "A_LE16")).toBe(litersToGallons(490)); // begin == prior end
    expect(findCell(r, "A", 31, "A_LE16")).toBe(litersToGallons(290));
    expect(r.balanced).toBe(true);
  });

  it("rounding drift is posted to A9 (gain) so the column still foots (S1)", () => {
    // A2 1 L → 0.26; A13 0.4 L → 0.11; prelim end 0.15 gal; physical 0.6 L → 0.16 ⇒ +0.01 drift → A9.
    const r = foldPeriodCells({
      begin: [],
      contributions: [contrib("A", 2, "A_LE16", 1), contrib("A", 13, "A_LE16", 0.4), contrib("B", 2, "A_LE16", 0.4)],
      endLiters: [onHand("A", "A_LE16", 0.6), onHand("B", "A_LE16", 0.4)],
    });
    expect(findCell(r, "A", 9, "A_LE16")).toBe(0.01);
    expect(r.balanced).toBe(true);
  });

  it("empty period → balanced, no cells", () => {
    const r = foldPeriodCells({ begin: [], contributions: [], endLiters: [] });
    expect(r.cells).toHaveLength(0);
    expect(r.balanced).toBe(true);
  });

  it("sparkling BF and BP are independent columns that each foot", () => {
    const r = foldPeriodCells({
      begin: [],
      contributions: [
        contrib("B", 2, "E_SPARKLING", 900, "BF"),
        contrib("B", 2, "E_SPARKLING", 450, "BP"),
      ],
      endLiters: [onHand("B", "E_SPARKLING", 900, "BF"), onHand("B", "E_SPARKLING", 450, "BP")],
    });
    expect(findCell(r, "B", 2, "E_SPARKLING", "BF")).toBe(litersToGallons(900));
    expect(findCell(r, "B", 2, "E_SPARKLING", "BP")).toBe(litersToGallons(450));
    expect(findCell(r, "B", 20, "E_SPARKLING", "BF")).toBe(litersToGallons(900));
    expect(r.balanced).toBe(true);
  });
});

// ── The anti-circularity oracle (Phase-0 gate b): the TTB-published "Explanation of Sample Report"
// (docs/ttb-5120-17/TTB-5120.17-explanation-of-sample.pdf, wine_report_explanation_of_sample.pdf on
// ttb.gov). These assertions transcribe THAT independent source — an interpretation check I did not
// author, not just self-consistency. ──
describe("foldPeriodCells — TTB sample-report oracle", () => {
  it("1,000 cases bottled: §A line 13 == §B line 2 (ftn 3); exact L→gal vs TTB's per-case factor", () => {
    const r = foldPeriodCells({
      begin: [],
      contributions: [contrib("A", 13, "A_LE16", cases(1000)), contrib("B", 2, "A_LE16", cases(1000))],
      endLiters: [],
    });
    // The core ftn-3 interpretation: the two lines carry the identical volume.
    expect(r.a13EqualsB2).toBe(true);
    // Our value converts the ACTUAL liters (9000 L, VISION D8) → 2377.55 gal.
    expect(findCell(r, "A", 13, "A_LE16")).toBeCloseTo(2377.55, 2);
    expect(findCell(r, "B", 2, "A_LE16")).toBe(findCell(r, "A", 13, "A_LE16"));
    // ORACLE FINDING: TTB's sample uses a published per-case factor 2.37753 gal/case → 2377.53 gal.
    // The 0.02 gal delta over 1,000 cases is a rounding-convention difference (< 0.001%), immaterial
    // and well within the form's tolerance. We convert real liters, which is the auditable source.
    const ttbPerCaseFactorTotal = 2.37753 * 1000;
    expect(Math.abs(findCell(r, "A", 13, "A_LE16") - ttbPerCaseFactorTotal)).toBeLessThan(0.03);
  });

  it("cross-class Angelica blend: 115 gal (class a) + 115 gal (class b) → produced 230 == used 230 (ftn 5)", () => {
    // Sample: "produced 230 gallons of Angelica by blending 115 gal dry white + 115 gal higher alcohol.
    // ...'blending' means mixing wines of two or more tax classes. Notice the components equal the whole."
    const r = foldPeriodCells({
      begin: [
        { section: "A", column: "A_LE16", sub: null, gallons: 115 },
        { section: "A", column: "B_16_21", sub: null, gallons: 115 },
      ],
      contributions: [
        contrib("A", 20, "A_LE16", gal(115)), // used for blending, out of class a
        contrib("A", 20, "B_16_21", gal(115)), // used for blending, out of class b
        contrib("A", 5, "B_16_21", gal(230)), // produced by blending, into the (higher-alcohol) Angelica class
      ],
      endLiters: [onHand("A", "B_16_21", gal(230))], // the whole blended volume ends on hand
    });
    const producedTotal = r.cells.filter((c) => c.section === "A" && c.line === 5).reduce((a, c) => a + c.gallons, 0);
    const usedTotal = r.cells.filter((c) => c.section === "A" && c.line === 20).reduce((a, c) => a + c.gallons, 0);
    expect(producedTotal).toBeCloseTo(230, 2); // produced == the whole
    expect(usedTotal).toBeCloseTo(230, 2); // components == the whole
    expect(r.balanced).toBe(true); // every column still foots after the cross-class move
  });

  it("bottled removals from the sample foot in §B (500+2 cases taxpaid, 3 tasting, 50 export)", () => {
    // Section B: begin from a prior period, +1000 cases bottled, −(502 taxpaid + 3 tasting + 50 export),
    // book end reconciles. Uses TTB's exact case counts.
    const beginCases = 600; // arbitrary carry-forward so the column has stock to remove from
    const r = foldPeriodCells({
      begin: [{ section: "B", column: "A_LE16", sub: null, gallons: litersToGallons(cases(beginCases)) }],
      contributions: [
        contrib("B", 2, "A_LE16", cases(1000)), // bottled
        contrib("B", 8, "A_LE16", cases(502)), // removed taxpaid (500 dry + 2 port simplified to one class)
        contrib("B", 11, "A_LE16", cases(3)), // tasting
        contrib("B", 12, "A_LE16", cases(50)), // export
      ],
      endLiters: [onHand("B", "A_LE16", cases(600 + 1000 - 502 - 3 - 50))],
    });
    expect(findCell(r, "B", 8, "A_LE16")).toBeCloseTo(litersToGallons(cases(502)), 2);
    expect(findCell(r, "B", 12, "A_LE16")).toBeCloseTo(litersToGallons(cases(50)), 2);
    expect(r.balanced).toBe(true);
    expect(findCell(r, "B", 19, "A_LE16")).toBe(0); // no phantom shortage
  });
});
