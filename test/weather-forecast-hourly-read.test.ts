import { describe, expect, it } from "vitest";
import { composeForecastHoursCore, type ForecastHourRow } from "@/lib/weather/forecast-hourly-read-core";

// Plan 097 U4 — the modal's day composer: day slicing, one-provider discipline (C3),
// threshold-crossing hours, spanning-bucket flag, honest null on empty.

const row = (localHour: number, over: Partial<ForecastHourRow> = {}): ForecastHourRow => ({
  providerKey: "open_meteo",
  hourStartUtc: `2026-07-27T${String(localHour).padStart(2, "0")}:00:00.000Z`,
  localDate: "2026-07-27",
  localHour,
  tempC: 20,
  popPct: 10,
  precipMm: 0,
  precipDurationH: 1,
  conditionCode: "PARTLY_CLOUDY",
  windKph: 8,
  ...over,
});

describe("composeForecastHoursCore", () => {
  it("slices the requested local day, ordered by hour; other days ignored", () => {
    const day = composeForecastHoursCore(
      [row(14), row(2), row(9), row(9, { localDate: "2026-07-28" })],
      { targetDate: "2026-07-27" },
    );
    expect(day?.slots.map((s) => s.localHour)).toEqual([2, 9, 14]);
  });

  it("ONE provider only — NWS outranks Open-Meteo when both have rows (C3)", () => {
    const day = composeForecastHoursCore(
      [row(9), row(9, { providerKey: "nws", tempC: 33 }), row(10, { providerKey: "nws", tempC: 34 })],
      { targetDate: "2026-07-27" },
    );
    expect(day?.providerKey).toBe("nws");
    expect(day?.slots).toHaveLength(2);
    expect(day?.slots[0].tempC).toBe(33); // never the open_meteo 20
  });

  it("crossing hours: FIRST hour at/below frost-warn and at/above heat-watch, custom thresholds", () => {
    const day = composeForecastHoursCore(
      [row(0, { tempC: 3 }), row(1, { tempC: 0 }), row(2, { tempC: -1 }), row(14, { tempC: 35 }), row(15, { tempC: 36 })],
      { targetDate: "2026-07-27", frostWarnC: 0, heatWatchC: 35 },
    );
    expect(day?.summary.firstFrostHour).toBe(1); // first ≤ 0
    expect(day?.summary.firstHeatHour).toBe(14); // first ≥ 35
    const custom = composeForecastHoursCore([row(0, { tempC: 3 })], { targetDate: "2026-07-27", frostWarnC: 4 });
    expect(custom?.summary.firstFrostHour).toBe(0);
  });

  it("min/max ignore nulls; precip totals the day's STARTING intervals; spanning bucket flagged", () => {
    const day = composeForecastHoursCore(
      [
        row(6, { tempC: null, precipMm: 2 }),
        row(12, { tempC: 28 }),
        row(23, { tempC: 15, precipMm: 6, precipDurationH: 6 }), // 23:00 + 6h spans past midnight
      ],
      { targetDate: "2026-07-27" },
    );
    expect(day?.summary.minTempC).toBe(15);
    expect(day?.summary.maxTempC).toBe(28);
    expect(day?.summary.totalPrecipMm).toBe(8);
    expect(day?.slots[2].spansPastMidnight).toBe(true);
    expect(day?.summary.hasSpanningBucket).toBe(true);
  });

  it("no rows for the day → null (the modal's honest empty state); bad date throws", () => {
    expect(composeForecastHoursCore([row(9)], { targetDate: "2026-07-28" })).toBeNull();
    expect(() => composeForecastHoursCore([], { targetDate: "nope" })).toThrow(/Invalid/);
  });
});
