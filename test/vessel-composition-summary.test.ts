import { describe, it, expect } from "vitest";
import { summarizeVesselComposition, compositionAriaLabel } from "@/lib/vessel/composition";

const c = (varietyName: string, volumeL: number, vineyardName = "Estate", vintage: number | null = 2024) =>
  ({ varietyName, vineyardName, vintage, volumeL });

describe("summarizeVesselComposition — the tank says what it is made of", () => {
  it("single origin reads 100%, not a bare variety name", () => {
    const r = summarizeVesselComposition(5000, [c("Pinot Noir", 5000)]);
    expect(r.summary).toBe("100% Pinot Noir");
    expect(r.byVariety).toHaveLength(1);
    expect(r.provenanceComplete).toBe(true);
  });

  // The case the whole unit exists for: rack Cab into a Pinot tank, and the Cab must still be visible
  // or the absorb reads as theft.
  it("an absorb shows the minority component instead of losing it", () => {
    const r = summarizeVesselComposition(5000, [c("Pinot Noir", 4100), c("Cabernet Sauvignon", 900)]);
    expect(r.summary).toBe("82% Pinot Noir · 18% Cabernet Sauvignon");
  });

  it("shares are ordered largest first, whatever order the components arrive in", () => {
    const r = summarizeVesselComposition(1000, [c("Merlot", 200), c("Syrah", 500), c("Grenache", 300)]);
    expect(r.byVariety.map((s) => s.label)).toEqual(["Syrah", "Grenache", "Merlot"]);
  });

  it("percentages always sum to exactly 100 — a third each never reads 33/33/33", () => {
    const thirds = summarizeVesselComposition(900, [c("A", 300), c("B", 300), c("C", 300)]);
    expect(thirds.byVariety.reduce((a, s) => a + s.pct, 0)).toBe(100);
    // Awkward remainders too: 1/7ths.
    const sevenths = summarizeVesselComposition(700, [c("A", 100), c("B", 200), c("C", 400)]);
    expect(sevenths.byVariety.reduce((a, s) => a + s.pct, 0)).toBe(100);
  });

  it("folds vineyards and vintages together for the collapsed line, keeps them in the detail", () => {
    const r = summarizeVesselComposition(1000, [
      c("Pinot Noir", 400, "Russian River", 2024),
      c("Pinot Noir", 300, "Oak Knoll", 2023),
      c("Chardonnay", 300, "Estate", 2024),
    ]);
    // Collapsed: the winemaker asks "how much Pinot", not "how much 2023 Oak Knoll Pinot".
    expect(r.summary).toBe("70% Pinot Noir · 30% Chardonnay");
    // Expanded: the joint tuple survives, so provenance is still answerable.
    expect(r.detail).toHaveLength(3);
    expect(r.detail[0]).toMatchObject({ label: "Pinot Noir", vineyardName: "Russian River", vintage: 2024, pct: 40 });
    expect(r.detail.reduce((a, s) => a + s.pct, 0)).toBe(100);
  });

  // Real shape found on live data (plan 088, Unit 18): a lot seeded with no origin and no lineage has
  // NO vessel_component rows, so the components cover less wine than the vessel holds.
  it("wine with no recorded origin surfaces as its own share, never renormalised away", () => {
    const r = summarizeVesselComposition(1000, [c("Syrah", 600)]);
    expect(r.provenanceComplete).toBe(false);
    expect(r.unrecordedL).toBe(400);
    expect(r.summary).toBe("60% Syrah · 40% Source unrecorded");
    expect(r.byVariety.find((s) => s.unrecorded)).toMatchObject({ pct: 40 });
  });

  it("a vessel with NO components at all is all-unrecorded, not empty", () => {
    const r = summarizeVesselComposition(1650, []);
    expect(r.provenanceComplete).toBe(false);
    expect(r.summary).toBe("100% Source unrecorded");
  });

  it("an empty vessel has no composition to state", () => {
    const r = summarizeVesselComposition(0, []);
    expect(r.summary).toBe("");
    expect(r.byVariety).toEqual([]);
    expect(r.provenanceComplete).toBe(true); // nothing is missing from nothing
  });

  it("ignores Decimal-rounding dust rather than showing a 0% component", () => {
    // The composition fold stores fractions at Decimal(6,5); a 5,000 L tank can carry ~0.02 L of drift.
    const r = summarizeVesselComposition(5000, [c("Pinot Noir", 4999.98), c("Ghost", 0.02)]);
    expect(r.byVariety.map((s) => s.label)).toEqual(["Pinot Noir"]);
    expect(r.provenanceComplete).toBe(true);
    expect(r.summary).toBe("100% Pinot Noir");
  });

  it("writes a real sub-1% component as <1%, never as 0% next to a 100%", () => {
    const r = summarizeVesselComposition(10000, [c("Syrah", 9970), c("Viognier", 30)]);
    // Co-fermented Viognier at 0.3% is a real winemaking fact — it stays in the list…
    expect(r.byVariety.map((s) => s.label)).toEqual(["Syrah", "Viognier"]);
    // …never steals a point from the majority…
    expect(r.byVariety.reduce((a, s) => a + s.pct, 0)).toBe(100);
    // …and reads as present rather than as a contradiction.
    expect(r.summary).toBe("100% Syrah · <1% Viognier");
    expect(compositionAriaLabel(r.byVariety[1])).toBe("less than 1 percent Viognier");
  });

  it("gives every slice a screen-reader label, not just a bar", () => {
    const r = summarizeVesselComposition(1000, [c("Merlot", 820), c("Cabernet Franc", 180)]);
    expect(compositionAriaLabel(r.byVariety[0])).toBe("82 percent Merlot");
  });
});
