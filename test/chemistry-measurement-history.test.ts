import { describe, it, expect } from "vitest";
import {
  DRY_BRIX_THRESHOLD,
  ageDays,
  analyteLabel,
  drynessLabel,
  expandVesselRange,
  expandVesselRefs,
  formatReading,
  latestPerAnalyte,
  rankVessels,
  stalenessVerdict,
  type FlatReading,
  type RankRow,
} from "@/lib/chemistry/measurement-history";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 22, 12, 0, 0); // 2026-07-22T12:00:00Z — fixed clock, no Date.now()

function reading(analyte: string, value: number, daysAgo: number, unit = "°Bx"): FlatReading {
  return { analyte, value, unit, observedAt: NOW - daysAgo * DAY, panelId: `p-${analyte}-${daysAgo}` };
}

describe("drynessLabel", () => {
  it("calls a wine dry only at or below the sub-zero threshold", () => {
    // A fully-fermented red parks NEGATIVE (alcohol is less dense than water). 0.0 is not dry yet.
    expect(drynessLabel(-2.0)).toBe("dry");
    expect(drynessLabel(DRY_BRIX_THRESHOLD)).toBe("dry");
    expect(drynessLabel(-1.4)).toBe("nearly dry");
    expect(drynessLabel(0)).toBe("nearly dry");
    expect(drynessLabel(1.0)).toBe("nearly dry");
    expect(drynessLabel(1.1)).toBe("fermenting");
    expect(drynessLabel(12)).toBe("fermenting");
  });
});

describe("ageDays", () => {
  it("reports whole and fractional days, clamping future timestamps to 0", () => {
    expect(ageDays(NOW, NOW)).toBe(0);
    expect(ageDays(NOW - 4 * DAY, NOW)).toBe(4);
    expect(ageDays(NOW - DAY / 2, NOW)).toBe(0.5);
    expect(ageDays(NOW + DAY, NOW)).toBe(0); // clock skew never reads as "negative age"
  });
});

describe("latestPerAnalyte", () => {
  it("keeps the newest reading per analyte regardless of input order", () => {
    const out = latestPerAnalyte([
      reading("BRIX", 12, 3),
      reading("BRIX", 2.1, 0),
      reading("BRIX", 22, 9),
      reading("PH", 3.55, 1, "pH"),
    ]);
    expect(out).toHaveLength(2);
    const brix = out.find((r) => r.analyte === "BRIX")!;
    expect(brix.value).toBe(2.1);
    expect(out.find((r) => r.analyte === "PH")!.value).toBe(3.55);
  });

  it("orders output by the analyte registry so two vessels' rows read the same way", () => {
    const out = latestPerAnalyte([
      reading("BRIX", 2, 0),
      reading("FREE_SO2", 28, 0, "mg/L"),
      reading("PH", 3.4, 0, "pH"),
    ]);
    // Registry order is pH, TA, VA, free SO₂, … then sugar.
    expect(out.map((r) => r.analyte)).toEqual(["PH", "FREE_SO2", "BRIX"]);
  });

  it("returns nothing for an empty stream", () => {
    expect(latestPerAnalyte([])).toEqual([]);
  });
});

describe("rankVessels", () => {
  const rows: RankRow[] = [
    { vesselLabel: "Tank T5", lotCode: "2026-SY-2", reading: reading("BRIX", 2.1, 0) },
    { vesselLabel: "Tank T9", lotCode: "2026-CS-1", reading: reading("BRIX", -1.8, 1) },
    { vesselLabel: "Tank T2", lotCode: "2026-PN-4", reading: reading("BRIX", 11.4, 0) },
    { vesselLabel: "Tank T7", lotCode: null, reading: null },
  ];

  it("ranks closest-to-dry by ascending Brix, so a negative reading beats zero", () => {
    const { ranked } = rankVessels(rows, "lowest");
    expect(ranked.map((r) => r.vesselLabel)).toEqual(["Tank T9", "Tank T5", "Tank T2"]);
    expect(ranked[0].reading!.value).toBe(-1.8);
  });

  it("ranks highest-first in the other direction", () => {
    const { ranked } = rankVessels(rows, "highest");
    expect(ranked.map((r) => r.vesselLabel)).toEqual(["Tank T2", "Tank T5", "Tank T9"]);
  });

  it("separates vessels with no reading instead of sorting them to the bottom", () => {
    // A no-data vessel is a different answer, not a worse value. Dropping it silently would let
    // "lowest Brix is T9" be stated off a partial set.
    const { ranked, noData } = rankVessels(rows, "lowest");
    expect(noData).toEqual(["Tank T7"]);
    expect(ranked.map((r) => r.vesselLabel)).not.toContain("Tank T7");
  });

  it("breaks a tie on the fresher reading, then the label", () => {
    const tied: RankRow[] = [
      { vesselLabel: "Barrel B2", lotCode: null, reading: reading("PH", 3.4, 5, "pH") },
      { vesselLabel: "Barrel B1", lotCode: null, reading: reading("PH", 3.4, 0, "pH") },
    ];
    const { ranked } = rankVessels(tied, "lowest");
    expect(ranked.map((r) => r.vesselLabel)).toEqual(["Barrel B1", "Barrel B2"]);
  });

  it("handles an all-empty set", () => {
    const { ranked, noData } = rankVessels([{ vesselLabel: "Tank T1", lotCode: null, reading: null }], "lowest");
    expect(ranked).toEqual([]);
    expect(noData).toEqual(["Tank T1"]);
  });
});

describe("stalenessVerdict", () => {
  it("stays quiet when the compared readings are close together in time", () => {
    const v = stalenessVerdict(
      [
        { vesselLabel: "Tank T5", observedAt: NOW },
        { vesselLabel: "Tank T9", observedAt: NOW - DAY },
      ],
      NOW,
    );
    expect(v!.warning).toBeNull();
    expect(v!.spreadDays).toBe(1);
    expect(v!.staleVessels).toEqual([]);
  });

  it("warns — and names the stale vessel — when a ranking spans days", () => {
    // The exact trap: T5 measured today at 2.1 Bx "wins" closest-to-dry, but T9's number is four
    // days old and that wine has had four days to ferment.
    const v = stalenessVerdict(
      [
        { vesselLabel: "Tank T5", observedAt: NOW },
        { vesselLabel: "Tank T9", observedAt: NOW - 4 * DAY },
      ],
      NOW,
    );
    expect(v!.spreadDays).toBe(4);
    expect(v!.oldestVessel).toBe("Tank T9");
    expect(v!.staleVessels).toEqual(["Tank T9"]);
    expect(v!.warning).toContain("Tank T9");
    expect(v!.warning).toContain("4 days old");
  });

  it("never warns on a single vessel (there is no cross-vessel comparison to distort)", () => {
    const v = stalenessVerdict([{ vesselLabel: "Tank T5", observedAt: NOW - 30 * DAY }], NOW);
    expect(v!.warning).toBeNull();
    expect(v!.oldestDays).toBe(30);
  });

  it("returns null for an empty set", () => {
    expect(stalenessVerdict([], NOW)).toBeNull();
  });
});

describe("expandVesselRange", () => {
  it("expands the spoken range form", () => {
    expect(expandVesselRange("barrels 1 through 5")).toEqual([
      "barrel 1",
      "barrel 2",
      "barrel 3",
      "barrel 4",
      "barrel 5",
    ]);
  });

  it("expands hyphen, en-dash, and 'to' forms", () => {
    expect(expandVesselRange("tanks 1-3")).toEqual(["tank 1", "tank 2", "tank 3"]);
    expect(expandVesselRange("tanks 1–3")).toEqual(["tank 1", "tank 2", "tank 3"]);
    expect(expandVesselRange("barrels 2 to 4")).toEqual(["barrel 2", "barrel 3", "barrel 4"]);
  });

  it("expands a code-to-code range", () => {
    expect(expandVesselRange("B1-B5")).toEqual(["B 1", "B 2", "B 3", "B 4", "B 5"]);
  });

  it("passes a non-range reference through untouched", () => {
    expect(expandVesselRange("tank 5")).toEqual(["tank 5"]);
    expect(expandVesselRange("T5")).toEqual(["T5"]);
    expect(expandVesselRange("QBO-T1")).toEqual(["QBO-T1"]);
  });

  it("does not mangle a lot code that merely contains digits and dashes", () => {
    expect(expandVesselRange("2026-SY-2")).toEqual(["2026-SY-2"]);
  });

  it("refuses an inverted or absurd span rather than inventing lookups", () => {
    expect(expandVesselRange("barrels 5-1")).toEqual(["barrels 5-1"]);
    expect(expandVesselRange("barrels 1-9999")).toEqual(["barrels 1-9999"]);
  });

  it("returns nothing for empty input", () => {
    expect(expandVesselRange("")).toEqual([]);
  });
});

describe("expandVesselRefs", () => {
  it("expands every entry and de-duplicates across them", () => {
    expect(expandVesselRefs(["barrels 1-3", "barrel 2", "tank 5"])).toEqual([
      "barrel 1",
      "barrel 2",
      "barrel 3",
      "tank 5",
    ]);
  });

  it("treats differently-typed spellings of the same code as one vessel", () => {
    expect(expandVesselRefs(["T5", "t-5", "T 5"])).toEqual(["T5"]);
  });
});

describe("formatReading / analyteLabel", () => {
  it("formats at the analyte's registry precision", () => {
    expect(formatReading("PH", 3.4, "pH")).toBe("3.40 pH");
    expect(formatReading("BRIX", 2.14, "°Bx")).toBe("2.1 °Bx");
    expect(formatReading("FREE_SO2", 28.4, "mg/L")).toBe("28 mg/L");
  });

  it("falls back gracefully for an unknown stored analyte key", () => {
    expect(analyteLabel("PH")).toBe("pH");
    expect(analyteLabel("UNOBTANIUM")).toBe("UNOBTANIUM");
    expect(formatReading("UNOBTANIUM", 1.5, "g/L")).toBe("1.50 g/L");
  });
});
