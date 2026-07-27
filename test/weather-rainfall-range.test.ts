import { describe, expect, it } from "vitest";
import { composeRainfallRangeCore, RAINFALL_RANGE_MAX_DAYS, type RainfallRangeRow } from "@/lib/weather/rainfall-range-core";

// Plan 096 U8 — the rainfall range series. Never-blend (primary only, gaps stay gaps), cumulative
// monotone, honest missing-day count, 24-month cap.

const row = (localDate: string, precipMm: number | null, providerKey = "gridmet"): RainfallRangeRow => ({ providerKey, localDate, precipMm });

describe("composeRainfallRangeCore", () => {
  it("emits EVERY day of the range; missing days are null gaps, not zeros", () => {
    const r = composeRainfallRangeCore({
      rows: [row("2026-01-02", 5), row("2026-01-04", 2.5)],
      primaryProviderKey: "gridmet",
      startIso: "2026-01-01",
      endIso: "2026-01-05",
    });
    expect(r.days.map((d) => d.localDate)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"]);
    expect(r.days.map((d) => d.precipMm)).toEqual([null, 5, null, 2.5, null]);
    expect(r.stats.missingDays).toBe(3);
  });

  it("cumulative is monotone and skips nulls without zeroing them", () => {
    const r = composeRainfallRangeCore({
      rows: [row("2026-01-01", 5), row("2026-01-03", 3)],
      primaryProviderKey: "gridmet",
      startIso: "2026-01-01",
      endIso: "2026-01-03",
    });
    expect(r.days.map((d) => d.cumulativeMm)).toEqual([5, 5, 8]);
  });

  it("NEVER blends: rows from a non-primary provider are ignored even on missing days", () => {
    const r = composeRainfallRangeCore({
      rows: [row("2026-01-01", 5), row("2026-01-02", 99, "nasa_power")],
      primaryProviderKey: "gridmet",
      startIso: "2026-01-01",
      endIso: "2026-01-02",
    });
    expect(r.days[1].precipMm).toBeNull();
    expect(r.stats.totalMm).toBe(5);
  });

  it("clips rows outside the range", () => {
    const r = composeRainfallRangeCore({
      rows: [row("2025-12-31", 100), row("2026-01-01", 1), row("2026-01-03", 100)],
      primaryProviderKey: "gridmet",
      startIso: "2026-01-01",
      endIso: "2026-01-02",
    });
    expect(r.stats.totalMm).toBe(1);
    expect(r.days).toHaveLength(2);
  });

  it("daysSinceLastRain: 0 when it rained on the last day; counts back; null when never", () => {
    const rainedLast = composeRainfallRangeCore({ rows: [row("2026-01-03", 4)], primaryProviderKey: "gridmet", startIso: "2026-01-01", endIso: "2026-01-03" });
    expect(rainedLast.stats.daysSinceLastRain).toBe(0);
    const rainedEarlier = composeRainfallRangeCore({ rows: [row("2026-01-01", 4), row("2026-01-02", 0), row("2026-01-03", 0.2)], primaryProviderKey: "gridmet", startIso: "2026-01-01", endIso: "2026-01-03" });
    expect(rainedEarlier.stats.daysSinceLastRain).toBe(2); // 0.2mm is sub-measurable
    const never = composeRainfallRangeCore({ rows: [row("2026-01-01", 0)], primaryProviderKey: "gridmet", startIso: "2026-01-01", endIso: "2026-01-02" });
    expect(never.stats.daysSinceLastRain).toBeNull();
  });

  it("passes through the rainfall-core stats (wet days, wettest, dry streak, lowConfidence)", () => {
    const r = composeRainfallRangeCore({
      rows: [row("2026-01-01", 10), row("2026-01-02", 0), row("2026-01-03", 0), row("2026-01-04", 22)],
      primaryProviderKey: "gridmet",
      startIso: "2026-01-01",
      endIso: "2026-01-04",
    });
    expect(r.stats.totalMm).toBe(32);
    expect(r.stats.wetDays).toBe(2);
    expect(r.stats.wettestDayMm).toBe(22);
    expect(r.stats.longestDryStreakDays).toBe(2);
    expect(r.stats.lowConfidence).toBe(true);
  });

  it("labeled history fallback: a day the primary lacks comes from the history provider, stamped", () => {
    const r2 = composeRainfallRangeCore({
      rows: [row("2026-01-01", 5, "rcc_acis"), row("2026-01-02", 3, "gridmet")],
      primaryProviderKey: "rcc_acis",
      historyProviderKey: "gridmet",
      startIso: "2026-01-01",
      endIso: "2026-01-02",
    });
    expect(r2.days[0]).toMatchObject({ precipMm: 5, source: "primary" });
    expect(r2.days[1]).toMatchObject({ precipMm: 3, source: "history" });
    expect(r2.stats.filledDays).toBe(1);
    expect(r2.stats.missingDays).toBe(0);
    expect(r2.historyProviderKey).toBe("gridmet");
    expect(r2.stats.totalMm).toBe(8);
  });

  it("primary wins over history on the same day; a NON-designated provider is still ignored", () => {
    const r = composeRainfallRangeCore({
      rows: [row("2026-01-01", 5, "rcc_acis"), row("2026-01-01", 99, "gridmet"), row("2026-01-02", 42, "daymet")],
      primaryProviderKey: "rcc_acis",
      historyProviderKey: "gridmet",
      startIso: "2026-01-01",
      endIso: "2026-01-02",
    });
    expect(r.days[0]).toMatchObject({ precipMm: 5, source: "primary" }); // never averaged with gridmet's 99
    expect(r.days[1].precipMm).toBeNull(); // daymet is not the designated history source
    expect(r.stats.filledDays).toBe(0);
    expect(r.historyProviderKey).toBeNull(); // no fills happened
  });

  it("rejects an over-cap range and a backwards range", () => {
    expect(() =>
      composeRainfallRangeCore({ rows: [], primaryProviderKey: "gridmet", startIso: "2020-01-01", endIso: "2026-01-01" }),
    ).toThrow(new RegExp(String(RAINFALL_RANGE_MAX_DAYS)));
    expect(() =>
      composeRainfallRangeCore({ rows: [], primaryProviderKey: "gridmet", startIso: "2026-01-02", endIso: "2026-01-01" }),
    ).toThrow(/before its start/);
  });
});
