import { describe, expect, it } from "vitest";
import { assertNeverBlended, computeSpreadCore, gapFillCore } from "@/lib/weather/source-selection-core";
import { mapRecordsToLocalDaily } from "@/lib/weather/obs-time-core";
import { composeClimateSummaryCore, type DailyRow } from "@/lib/weather/read-core";
import type { DailyRecord } from "@/lib/weather/providers/types";

// VI-P8 Unit 11 — the honesty CONTRACTS as pure assertions (the DB e2e lives in scripts/verify-weather.ts).

describe("CONTRACT: never blend — the only ensemble output is a spread (range), never an average", () => {
  it("computeSpreadCore returns a range and no mean field", () => {
    const s = computeSpreadCore([{ source: "a", value: 1450 }, { source: "b", value: 1520 }])!;
    expect(s).toMatchObject({ min: 1450, max: 1520, range: 70 });
    expect(s).not.toHaveProperty("mean");
    expect(s).not.toHaveProperty("average");
  });
  it("assertNeverBlended rejects a headline that carries a blended number", () => {
    expect(() => assertNeverBlended({ gdd: 1500, source: "rcc_acis" })).not.toThrow();
    expect(() => assertNeverBlended({ gdd: 1500, mean: 1485 })).toThrow();
  });
});

describe("CONTRACT: gap-fill is composed on read and never overwrites a real primary day", () => {
  it("a present primary day is untouched; only a gap is filled + stamped", () => {
    const primary = [{ localDate: "2026-04-01", tmaxC: 20, tminC: 8, precipMm: 0, rhMaxPct: null, rhMinPct: null }];
    const grid = [
      { localDate: "2026-04-01", tmaxC: 99, tminC: 99, precipMm: 0, rhMaxPct: null, rhMinPct: null },
      { localDate: "2026-04-02", tmaxC: 18, tminC: 6, precipMm: 0, rhMaxPct: null, rhMinPct: null },
    ];
    const composed = gapFillCore(primary, grid, "gridmet");
    expect(composed.find((r) => r.localDate === "2026-04-01")!.tmaxC).toBe(20); // untouched
    expect(composed.find((r) => r.localDate === "2026-04-01")!.filledFromProvider).toBeNull();
    expect(composed.find((r) => r.localDate === "2026-04-02")!.filledFromProvider).toBe("gridmet");
  });
});

describe("CONTRACT: obs-time bucketing puts a frost on the right local day", () => {
  it("an AM-obs Tmin on the 04-11 morning report lands on local 04-11, not 04-10", () => {
    const recs: DailyRecord[] = [
      { sourceDate: "2026-04-10", tmaxC: 20, tminC: 5, precipMm: 0, rhMaxPct: null, rhMinPct: null },
      { sourceDate: "2026-04-11", tmaxC: 22, tminC: -1, precipMm: 0, rhMaxPct: null, rhMinPct: null },
    ];
    const local = mapRecordsToLocalDaily(recs, "AM_LST");
    const byDate = Object.fromEntries(local.map((r) => [r.localDate, r]));
    expect(byDate["2026-04-11"].tminC).toBe(-1); // the freeze is on 04-11
    expect(byDate["2026-04-10"].tminC).toBe(5);
  });
});

describe("CONTRACT: every headline value carries provenance (a primary source is always named)", () => {
  it("the summary names a primary provider and a coverage state", () => {
    const rows: DailyRow[] = [
      { providerKey: "rcc_acis", localDate: "2026-04-01", tmaxC: 20, tminC: 8, precipMm: 0, rhMaxPct: null, rhMinPct: null },
      { providerKey: "rcc_acis", localDate: "2026-04-02", tmaxC: 22, tminC: 9, precipMm: 0, rhMaxPct: null, rhMinPct: null },
      { providerKey: "nasa_power", localDate: "2026-04-01", tmaxC: 19, tminC: 7, precipMm: 0, rhMaxPct: null, rhMinPct: null },
    ];
    const s = composeClimateSummaryCore({
      vineyardId: "v1",
      rows,
      config: { primaryProviderKey: "rcc_acis", coverageState: "US_HIGH_RES", stationId: "TEST1", stationName: "Test Stn", stationDistanceM: 3000, stationElevationDeltaM: null, siteElevationM: 20, attribution: "x", lastRefreshAt: null },
      latitude: 38.5,
      today: "2026-04-02",
    });
    expect(s.primaryProviderKey).toBe("rcc_acis");
    expect(s.coverageState).toBe("US_HIGH_RES");
    // The spread is present (2 sources), and it is a range, not an average.
    expect(s.spread).not.toBeNull();
    expect(s.spread).not.toHaveProperty("mean");
    // per-source completeness present (R3).
    expect(s.perSource.every((p) => typeof p.completenessPct === "number")).toBe(true);
  });
});
