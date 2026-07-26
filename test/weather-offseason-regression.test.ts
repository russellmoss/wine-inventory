import { describe, expect, it } from "vitest";
import { FULL_YEAR_WINDOW_YEARS, keepBackfillDay } from "@/lib/weather/backfill-window-core";
import { composeClimateSummaryCore, type ClimateConfig, type DailyRow } from "@/lib/weather/read-core";

// Plan 096 U6 — year-round ingest, bounded. Two guarantees:
// 1. keepBackfillDay: full-year retention inside the recent window, season-only beyond (both hemispheres).
// 2. The council-R1 belt: STORING winter rows never changes the season climate math — the cores filter
//    to season at COMPUTE time (filterToSeason), so a summary over rows including off-season days is
//    identical to one over season-only rows. (The two locked test files —
//    weather-climate-math.test.ts / weather-normals.test.ts — stay byte-unmodified; this file is new.)

describe("keepBackfillDay — retention window", () => {
  const toYear = 2025; // most recent COMPLETE year of a backfill
  it(`keeps every month for the recent ${FULL_YEAR_WINDOW_YEARS} years (NH)`, () => {
    expect(keepBackfillDay("2025-01-15", toYear, true)).toBe(true); // winter, recent → kept
    expect(keepBackfillDay("2023-12-31", toYear, true)).toBe(true); // oldest full-year year
    expect(keepBackfillDay("2023-07-01", toYear, true)).toBe(true);
  });
  it("keeps only season months beyond the window (NH Apr–Oct)", () => {
    expect(keepBackfillDay("2022-01-15", toYear, true)).toBe(false); // winter, old → dropped
    expect(keepBackfillDay("2022-04-01", toYear, true)).toBe(true); // season edge
    expect(keepBackfillDay("2022-10-31", toYear, true)).toBe(true);
    expect(keepBackfillDay("2022-11-01", toYear, true)).toBe(false);
    expect(keepBackfillDay("2010-07-15", toYear, true)).toBe(true); // deep history, mid-season
  });
  it("southern hemisphere season months (Oct–Apr) beyond the window", () => {
    expect(keepBackfillDay("2022-12-15", toYear, false)).toBe(true); // SH mid-season
    expect(keepBackfillDay("2022-06-15", toYear, false)).toBe(false); // SH winter
    expect(keepBackfillDay("2024-06-15", toYear, false)).toBe(true); // recent → full-year
  });
});

describe("council-R1 belt — off-season rows cannot contaminate the season math", () => {
  const config: ClimateConfig = {
    primaryProviderKey: "gridmet",
    primaryProviderOverride: null,
    coverageState: "US_HIGH_RES",
    stationId: null,
    stationName: null,
    stationDistanceM: null,
    stationElevationDeltaM: null,
    siteElevationM: null,
    attribution: null,
    lastRefreshAt: null,
  };
  const seasonRows: DailyRow[] = [
    { providerKey: "gridmet", localDate: "2025-05-01", tmaxC: 25, tminC: 12, precipMm: 0, rhMaxPct: null, rhMinPct: null },
    { providerKey: "gridmet", localDate: "2025-05-02", tmaxC: 28, tminC: 14, precipMm: 2, rhMaxPct: null, rhMinPct: null },
    { providerKey: "gridmet", localDate: "2025-06-10", tmaxC: 32, tminC: 16, precipMm: 0, rhMaxPct: null, rhMinPct: null },
  ];
  // WARM winter days — if these ever leaked into the accumulator, GDD would inflate visibly.
  const winterRows: DailyRow[] = [
    { providerKey: "gridmet", localDate: "2025-01-15", tmaxC: 22, tminC: 15, precipMm: 30, rhMaxPct: null, rhMinPct: null },
    { providerKey: "gridmet", localDate: "2025-02-20", tmaxC: 24, tminC: 16, precipMm: 18, rhMaxPct: null, rhMinPct: null },
    { providerKey: "gridmet", localDate: "2024-12-05", tmaxC: 20, tminC: 12, precipMm: 25, rhMaxPct: null, rhMinPct: null },
  ];
  const today = "2025-07-01";
  const latitude = 38.5; // NH

  it("season GDD / Winkler / GST / frost / heat / season rainfall identical with winter rows stored", () => {
    const withWinter = composeClimateSummaryCore({ vineyardId: "v1", rows: [...winterRows, ...seasonRows], config, latitude, today });
    const seasonOnly = composeClimateSummaryCore({ vineyardId: "v1", rows: seasonRows, config, latitude, today });
    expect(withWinter.headline.seasonGddC).toBe(seasonOnly.headline.seasonGddC);
    expect(withWinter.headline.winkler).toEqual(seasonOnly.headline.winkler);
    expect(withWinter.headline.gst).toEqual(seasonOnly.headline.gst);
    expect(withWinter.headline.frost).toEqual(seasonOnly.headline.frost);
    expect(withWinter.headline.heat).toEqual(seasonOnly.headline.heat);
    expect(withWinter.headline.rainfall).toEqual(seasonOnly.headline.rainfall); // SEASON rainfall — winter mm excluded
    expect(withWinter.headline.gddCumulative).toEqual(seasonOnly.headline.gddCumulative);
  });
});
