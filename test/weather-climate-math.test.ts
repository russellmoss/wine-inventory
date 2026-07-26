import { describe, expect, it } from "vitest";
import { accumulateGdd, dailyGdd } from "@/lib/weather/gdd-core";
import { winklerRegion } from "@/lib/weather/winkler-core";
import { growingSeasonTemp, jonesGroup } from "@/lib/weather/gst-core";
import { frostEvents } from "@/lib/weather/frost-core";
import { heatDays } from "@/lib/weather/heat-core";
import { rainfall } from "@/lib/weather/rainfall-core";
import { seasonWindowFor, seasonYearFor, seasonCompleteness } from "@/lib/weather/season-core";
import type { LocalDailyRecord } from "@/lib/weather/obs-time-core";

function d(localDate: string, tmaxC: number | null, tminC: number | null, precipMm: number | null = 0): LocalDailyRecord {
  return { localDate, tmaxC, tminC, precipMm, rhMaxPct: null, rhMinPct: null };
}

describe("GDD — cap the AVERAGE not Tmax (R5)", () => {
  it("basic daily GDD, base 10", () => {
    expect(dailyGdd(30, 10)).toBe(10); // mean 20 − 10
    expect(dailyGdd(12, 6)).toBe(0); // mean 9 − 10 → clamped to 0
    expect(dailyGdd(null, 10)).toBeNull();
  });
  it("cap applies to the mean, so a hot day differs capped vs uncapped", () => {
    // tmax 40, tmin 24 → mean 32.
    expect(dailyGdd(40, 24, { capC: 30 })).toBe(20); // min(30,32)=30 −10
    expect(dailyGdd(40, 24, { capC: null })).toBe(22); // 32 −10
    // Capping Tmax instead would give min(30,40)=35 mean → 17.5 (wrong). Assert we did NOT do that.
    expect(dailyGdd(40, 24, { capC: 30 })).not.toBe(17.5);
  });
  it("accumulates only paired-temp days and reports the count", () => {
    const acc = accumulateGdd([d("2026-04-01", 30, 10), d("2026-04-02", null, 12), d("2026-04-03", 28, 14)]);
    expect(acc.daysCounted).toBe(2);
    expect(acc.gddTotal).toBe(10 + 11); // (20-10) + (21-10)
  });
});

describe("Winkler regions + boundary honesty", () => {
  it("classifies by season GDD (°C)", () => {
    expect(winklerRegion(1000).region).toBe("I");
    expect(winklerRegion(1500).region).toBe("II");
    expect(winklerRegion(1800).region).toBe("III");
    expect(winklerRegion(2100).region).toBe("IV");
    expect(winklerRegion(2500).region).toBe("V");
  });
  it("flags near-boundary totals so the UI shows the number", () => {
    expect(winklerRegion(1400).nearBoundary).toBe(true); // 11 above the I/II line
    expect(winklerRegion(1500).nearBoundary).toBe(false); // comfortably mid-region II
  });
});

describe("GST + Jones grouping", () => {
  it("means the daily means and groups", () => {
    const r = growingSeasonTemp([d("2026-07-01", 30, 10), d("2026-07-02", 28, 12)]);
    expect(r.gstC).toBe(20); // means 20 and 20
    expect(r.group).toBe("Hot"); // 19–21
    expect(r.daysCounted).toBe(2);
  });
  it("jones bands", () => {
    expect(jonesGroup(14)).toBe("Cool");
    expect(jonesGroup(16)).toBe("Intermediate");
    expect(jonesGroup(22)).toBe("Very hot");
  });
});

describe("Frost — vulnerable-window events (R6/R15)", () => {
  const recs = [
    d("2026-03-15", 8, -5), // dormancy — outside window, NOT an event, but a raw spring frost
    d("2026-04-20", 14, 0), // in window, light
    d("2026-05-01", 16, -3), // in window, killing
    d("2026-06-20", 25, 5), // after window
    d("2026-10-05", 12, -1), // fall frost (secondary)
  ];
  const f = frostEvents(recs, 38, 2026);
  it("only counts sub-threshold nights inside Apr1–Jun15", () => {
    expect(f.vulnerableWindow).toEqual({ startIso: "2026-04-01", endIso: "2026-06-15" });
    expect(f.events.map((e) => e.localDate)).toEqual(["2026-04-20", "2026-05-01"]);
    expect(f.lightCount).toBe(1);
    expect(f.killingCount).toBe(1);
  });
  it("keeps raw last-spring / first-fall dates as secondary stats", () => {
    expect(f.lastSpringFrostDate).toBe("2026-05-01");
    expect(f.firstFallFrostDate).toBe("2026-10-05");
  });
});

describe("Heat days", () => {
  it("counts days over each threshold", () => {
    const h = heatDays([d("2026-07-01", 36, 20), d("2026-07-02", 31, 18), d("2026-07-03", 39, 22)], [30, 35, 38]);
    expect(h.daysOverByThreshold["30"]).toBe(3);
    expect(h.daysOverByThreshold["35"]).toBe(2);
    expect(h.daysOverByThreshold["38"]).toBe(1);
    expect(h.hottestDayC).toBe(39);
  });
});

describe("Rainfall + dry streak (low-confidence)", () => {
  it("totals, wet days, and the longest dry streak", () => {
    const r = rainfall([d("2026-07-01", 30, 15, 0), d("2026-07-02", 31, 16, 0), d("2026-07-03", 29, 14, 12), d("2026-07-04", 30, 15, 0)]);
    expect(r.totalMm).toBe(12);
    expect(r.wetDays).toBe(1);
    expect(r.longestDryStreakDays).toBe(2); // 07-01,07-02 then reset, then 07-04 = 1
    expect(r.lowConfidence).toBe(true);
  });
});

describe("Season window + SeasonYear (R4, hemisphere-aware)", () => {
  it("NH: window is Apr–Oct of the calendar year", () => {
    expect(seasonWindowFor(38, 2026)).toEqual({ startIso: "2026-04-01", endIso: "2026-10-31" });
    expect(seasonYearFor(38, "2026-07-01")).toBe(2026);
  });
  it("SH: the season crosses the calendar year and is labelled by its END year", () => {
    expect(seasonWindowFor(-33, 2024)).toEqual({ startIso: "2023-10-01", endIso: "2024-04-30" });
    expect(seasonYearFor(-33, "2023-11-15")).toBe(2024); // Oct–Dec → next year's season
    expect(seasonYearFor(-33, "2024-03-01")).toBe(2024); // Jan–Apr → same year
  });
  it("completeness is a fraction of window days with paired temps", () => {
    const recs = [d("2026-04-01", 20, 8), d("2026-04-02", 22, 9)];
    const c = seasonCompleteness(recs, 38, 2026, "2026-04-02");
    expect(c.daysWithTemps).toBe(2);
    expect(c.windowDays).toBe(2); // Apr 1–2 season-to-date
    expect(c.fraction).toBe(1);
  });
});
