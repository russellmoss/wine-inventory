import { describe, expect, it } from "vitest";
import { composeForecastViewCore, isForecastStale, selectPrimaryForecastSeries, type ForecastRow } from "@/lib/weather/forecast-read-core";

// Plan 096 U16 core — the ONE primary-series selector (council C3) + the strip DTO: day 6–7
// reduced confidence, null-high day-1 passthrough, spread-not-blend, stale detection.

const row = (providerKey: string, targetDate: string, over: Partial<ForecastRow> = {}): ForecastRow => ({
  providerKey,
  targetDate,
  issuedAt: "2026-07-27T06:00:00.000Z",
  tmaxC: 30,
  tminC: 12,
  precipMm: 1,
  precipProbabilityPct: 20,
  conditionCode: "PARTLY_CLOUDY",
  windMaxKph: 10,
  ...over,
});

describe("selectPrimaryForecastSeries (council C3 — THE selector)", () => {
  it("NWS wins when both providers have future rows", () => {
    const sel = selectPrimaryForecastSeries([row("open_meteo", "2026-07-27"), row("nws", "2026-07-27")], "2026-07-27");
    expect(sel?.providerKey).toBe("nws");
  });
  it("falls to Open-Meteo when NWS has no future rows; null when nothing does", () => {
    const sel = selectPrimaryForecastSeries([row("nws", "2026-07-25"), row("open_meteo", "2026-07-28")], "2026-07-27");
    expect(sel?.providerKey).toBe("open_meteo");
    expect(selectPrimaryForecastSeries([row("nws", "2026-07-20")], "2026-07-27")).toBeNull();
  });
});

describe("composeForecastViewCore", () => {
  const week = (provider: string, over: (i: number) => Partial<ForecastRow> = () => ({})) =>
    Array.from({ length: 7 }, (_, i) => row(provider, `2026-07-2${7 + i > 9 ? 7 : 7 + i}`, over(i))).map((r, i) => ({
      ...r,
      targetDate: `2026-08-0${i + 1}`,
    }));

  it("7 days ascending; days 6–7 flagged reduced-confidence", () => {
    const view = composeForecastViewCore(week("open_meteo"), "2026-08-01");
    expect(view?.days).toHaveLength(7);
    expect(view?.days.map((d) => d.reducedConfidence)).toEqual([false, false, false, false, false, true, true]);
  });

  it("day-1 with null high passes through untouched (never a zero)", () => {
    const rows = [row("open_meteo", "2026-08-01", { tmaxC: null })];
    const view = composeForecastViewCore(rows, "2026-08-01");
    expect(view?.days[0].tmaxC).toBeNull();
  });

  it("spread vs the secondary provider is a RANGE (max deltas), never an average", () => {
    const primary = week("nws");
    const secondary = week("open_meteo", () => ({ tmaxC: 33, tminC: 9 })); // +3 / −3 vs primary
    const view = composeForecastViewCore([...primary, ...secondary], "2026-08-01");
    expect(view?.providerKey).toBe("nws");
    expect(view?.days[0].tmaxC).toBe(30); // primary's number untouched — no blending
    expect(view?.spread).toMatchObject({ maxTmaxDeltaC: 3, maxTminDeltaC: 3, days: 7 });
  });

  it("single provider → spread null", () => {
    const view = composeForecastViewCore(week("open_meteo"), "2026-08-01");
    expect(view?.spread).toBeNull();
  });
});

describe("isForecastStale", () => {
  it("6-hour cadence boundary", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    expect(isForecastStale("2026-08-01T07:00:00.000Z", now)).toBe(false);
    expect(isForecastStale("2026-08-01T05:00:00.000Z", now)).toBe(true);
    expect(isForecastStale("garbage", now)).toBe(true);
  });
});
