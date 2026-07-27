import { describe, expect, it } from "vitest";
import {
  fetchNwsForecast,
  mergeQpfIntoHourly,
  pairNwsPeriods,
  parseIsoDurationHours,
  parseNwsHourly,
  parseWindMaxKph,
  sumQpfToLocalDays,
  type NwsHourlyPeriod,
  type NwsPeriod,
} from "@/lib/weather/providers/forecast-nws";

// Plan 096 U12 — the NWS adapter's fiddly parts, fixture-driven: day/night pairing (incl. the
// afternoon-fetch edge where day-1 has a low and NO high), QPF ISO-duration summing with
// interval-END day assignment (council S6 — a bucket straddling local midnight lands WHOLE on the
// day it ends, never pro-rata), non-PT6H buckets, °F-arrival defense.

const day = (date: string, temp: number, over: Partial<NwsPeriod> = {}): NwsPeriod => ({
  startTime: `${date}T06:00:00-07:00`,
  endTime: `${date}T18:00:00-07:00`,
  isDaytime: true,
  temperature: temp,
  temperatureUnit: "C",
  probabilityOfPrecipitation: { value: 20 },
  windSpeed: "10 to 15 km/h",
  icon: "https://api.weather.gov/icons/land/day/sct",
  shortForecast: "Partly Cloudy",
  ...over,
});
const night = (date: string, temp: number, over: Partial<NwsPeriod> = {}): NwsPeriod => ({
  startTime: `${date}T18:00:00-07:00`,
  endTime: `${date}T06:00:00-07:00`,
  isDaytime: false,
  temperature: temp,
  temperatureUnit: "C",
  probabilityOfPrecipitation: { value: 40 },
  windSpeed: "5 km/h",
  icon: "https://api.weather.gov/icons/land/night/rain",
  shortForecast: "Rain",
  ...over,
});

describe("pairNwsPeriods", () => {
  it("pairs 14 half-day periods into 7 daily cards (day + FOLLOWING night)", () => {
    const periods: NwsPeriod[] = [];
    for (let d = 1; d <= 7; d++) {
      const date = `2026-07-0${d}`;
      periods.push(day(date, 30 + d), night(date, 10 + d));
    }
    const cards = pairNwsPeriods(periods);
    expect(cards).toHaveLength(7);
    expect(cards[0]).toMatchObject({ targetDate: "2026-07-01", tmaxC: 31, tminC: 11 });
    expect(cards[6]).toMatchObject({ targetDate: "2026-07-07", tmaxC: 37, tminC: 17 });
  });

  it("AFTERNOON-FETCH EDGE: leading night period → day-1 has a low and NO high (null, not 0, not dropped)", () => {
    const periods = [night("2026-07-01", 12), day("2026-07-02", 33), night("2026-07-02", 14)];
    const cards = pairNwsPeriods(periods);
    expect(cards[0]).toMatchObject({ targetDate: "2026-07-01", tmaxC: null, tminC: 12 });
    expect(cards[1]).toMatchObject({ targetDate: "2026-07-02", tmaxC: 33, tminC: 14 });
  });

  it("card probability is the MAX of its two periods; condition is the more consequential", () => {
    const cards = pairNwsPeriods([day("2026-07-01", 30), night("2026-07-01", 12)]);
    expect(cards[0].precipProbabilityPct).toBe(40);
    expect(cards[0].conditionCode).toBe("RAIN"); // night rain beats day partly-cloudy
  });

  it("°F-arriving defense: temperatureUnit F converts to °C", () => {
    const cards = pairNwsPeriods([day("2026-07-01", 95, { temperatureUnit: "F" })]);
    expect(cards[0].tmaxC).toBe(35);
  });
});

describe("parseWindMaxKph", () => {
  it("takes the max of a range; converts mph; null on absence", () => {
    expect(parseWindMaxKph("15 to 20 km/h")).toBe(20);
    expect(parseWindMaxKph("10 mph")).toBeCloseTo(16.1, 1);
    expect(parseWindMaxKph("10 to 15 mph")).toBeCloseTo(24.1, 1);
    expect(parseWindMaxKph(null)).toBeNull();
  });
});

describe("parseIsoDurationHours", () => {
  it("handles PT6H, PT1H, PT30M, P1D, P1DT6H", () => {
    expect(parseIsoDurationHours("PT6H")).toBe(6);
    expect(parseIsoDurationHours("PT1H")).toBe(1);
    expect(parseIsoDurationHours("PT30M")).toBe(0.5);
    expect(parseIsoDurationHours("P1D")).toBe(24);
    expect(parseIsoDurationHours("P1DT6H")).toBe(30);
  });
});

describe("sumQpfToLocalDays — council S6: interval END day, whole amount, never pro-rata", () => {
  it("a bucket straddling LOCAL midnight lands whole on the day it ENDS", () => {
    // America/Los_Angeles: 2026-07-02T06:00Z = Jul 1 23:00 local; +PT6H ends Jul 2 05:00 local.
    const out = sumQpfToLocalDays([{ validTime: "2026-07-02T06:00:00+00:00/PT6H", value: 6 }], "America/Los_Angeles");
    expect(out.get("2026-07-02")).toBe(6);
    expect(out.get("2026-07-01")).toBeUndefined(); // NOT split
  });
  it("sums multiple buckets into their end days; skips nulls/zeros; handles the live PT1H bucket", () => {
    const out = sumQpfToLocalDays(
      [
        { validTime: "2026-07-01T12:00:00+00:00/PT1H", value: 1.5 }, // ends Jul 1 06:00 local (LA)
        { validTime: "2026-07-01T18:00:00+00:00/PT6H", value: 2.5 }, // ends Jul 1 17:00 local
        { validTime: "2026-07-02T00:00:00+00:00/PT6H", value: null },
        { validTime: "2026-07-02T06:00:00+00:00/PT6H", value: 0 },
      ],
      "America/Los_Angeles",
    );
    expect(out.get("2026-07-01")).toBe(4);
    expect(out.size).toBe(1);
  });
});

describe("parseNwsActiveAlerts (plan 096 U22 — verbatim, severity-desc, ends??expires)", () => {
  it("keeps ALL alerts ordered by severity; falls back to expires when ends is null (live-verified)", async () => {
    const { parseNwsActiveAlerts } = await import("@/lib/weather/providers/nws-alerts");
    const out = parseNwsActiveAlerts({
      features: [
        { id: "u1", properties: { event: "Frost Advisory", headline: "Frost Advisory until 9 AM", severity: "Minor", ends: null, expires: "2026-04-04T09:00:00-07:00" } },
        { id: "u2", properties: { event: "Freeze Warning", headline: "Freeze Warning tonight", severity: "Severe", ends: "2026-04-04T08:00:00-07:00", expires: "2026-04-04T09:00:00-07:00" } },
        { properties: {} }, // no event → dropped
      ],
    });
    expect(out.map((a) => a.event)).toEqual(["Freeze Warning", "Frost Advisory"]); // Severe before Minor
    expect(out[0].endsAt).toBe("2026-04-04T08:00:00-07:00"); // ends wins
    expect(out[1].endsAt).toBe("2026-04-04T09:00:00-07:00"); // expires fallback
    expect(out[1].headline).toBe("Frost Advisory until 9 AM"); // verbatim
  });
  it("empty features → empty (a quiet point)", async () => {
    const { parseNwsActiveAlerts } = await import("@/lib/weather/providers/nws-alerts");
    expect(parseNwsActiveAlerts({ features: [] })).toEqual([]);
    expect(parseNwsActiveAlerts({})).toEqual([]);
  });
});

describe("plan 097 U2 — NWS hourly arm", () => {
  const hourlyP = (startTime: string, temp: number | null, over: Partial<NwsHourlyPeriod> = {}): NwsHourlyPeriod => ({
    startTime,
    temperature: temp,
    temperatureUnit: "C",
    probabilityOfPrecipitation: { value: 30 },
    windSpeed: "10 km/h",
    icon: "https://api.weather.gov/icons/land/day/sct",
    shortForecast: "Partly Cloudy",
    ...over,
  });

  it("parseNwsHourly: offset startTime → UTC instant; local keys off the string; °F defense; durationH=1", () => {
    const out = parseNwsHourly([hourlyP("2026-07-26T22:00:00-07:00", 20), hourlyP("2026-07-26T23:00:00-07:00", 68, { temperatureUnit: "F" })]);
    expect(out[0]).toMatchObject({ hourStartUtc: "2026-07-27T05:00:00.000Z", localDate: "2026-07-26", localHour: 22, tempC: 20, precipMm: null, precipDurationH: 1 });
    expect(out[1].tempC).toBe(20); // 68 °F → 20 °C
  });

  it("mergeQpfIntoHourly: a PT6H bucket lands WHOLE at its start hour with native duration", () => {
    const hourly = parseNwsHourly([hourlyP("2026-07-26T11:00:00-07:00", 25)]);
    const merged = mergeQpfIntoHourly(hourly, [{ validTime: "2026-07-26T18:00:00+00:00/PT6H", value: 4.5 }], "America/Los_Angeles");
    // 18:00Z = 11:00 PDT — merges onto the existing temp slot.
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ tempC: 25, precipMm: 4.5, precipDurationH: 6 });
  });

  it("a bucket with no matching temp slot creates a precip-only record with local keys from the tz", () => {
    const merged = mergeQpfIntoHourly([], [{ validTime: "2026-07-27T06:00:00+00:00/PT3H", value: 2 }], "America/Los_Angeles");
    // 06:00Z Jul 27 = 23:00 PDT Jul 26 — a bucket STARTING late evening belongs to that local day (timing view).
    expect(merged[0]).toMatchObject({ localDate: "2026-07-26", localHour: 23, precipMm: 2, precipDurationH: 3, tempC: null });
  });

  it("zero/null buckets are skipped; output stays sorted by instant", () => {
    const hourly = parseNwsHourly([hourlyP("2026-07-26T10:00:00-07:00", 24), hourlyP("2026-07-26T11:00:00-07:00", 25)]);
    const merged = mergeQpfIntoHourly(hourly, [
      { validTime: "2026-07-26T17:00:00+00:00/PT1H", value: 0 },
      { validTime: "2026-07-26T18:00:00+00:00/PT1H", value: null },
    ], "America/Los_Angeles");
    expect(merged.every((r) => r.precipMm === null)).toBe(true);
    expect(merged.map((r) => r.localHour)).toEqual([10, 11]);
  });
});

describe("fetchNwsForecast (fixture fetch)", () => {
  it("resolves grid, pairs periods, attaches QPF amounts by local end-day, reports timeZone", async () => {
    const fixtures: Record<string, unknown> = {
      points: { properties: { gridId: "STO", gridX: 40, gridY: 60, timeZone: "America/Los_Angeles" } },
      forecast: { properties: { periods: [day("2026-07-01", 30), night("2026-07-01", 12), day("2026-07-02", 31), night("2026-07-02", 13)] } },
      raw: { properties: { quantitativePrecipitation: { values: [{ validTime: "2026-07-01T18:00:00+00:00/PT6H", value: 3.2 }] } } },
    };
    const fetchFx = (async (_key: unknown, url: string) => {
      if (url.includes("/points/")) return fixtures.points;
      if (url.includes("/forecast/hourly")) return { properties: { periods: [] } }; // hourly arm exercised in its own describe
      if (url.includes("/forecast")) return fixtures.forecast;
      return fixtures.raw;
    }) as never;
    const s = await fetchNwsForecast({ lat: 38.5, lon: -121.5 }, { fetch: fetchFx, now: new Date("2026-07-01T00:00:00Z") });
    expect(s.grid).toMatchObject({ gridId: "STO", gridX: 40, gridY: 60 });
    expect(s.timeZone).toBe("America/Los_Angeles");
    expect(s.records[0]).toMatchObject({ targetDate: "2026-07-01", tmaxC: 30, tminC: 12, precipMm: 3.2 });
    expect(s.records[1]).toMatchObject({ targetDate: "2026-07-02", precipMm: null }); // no QPF that day → null, not 0
  });

  it("grid cache short-circuits /points", async () => {
    let pointsCalls = 0;
    const fetchFx = (async (_key: unknown, url: string) => {
      if (url.includes("/points/")) {
        pointsCalls += 1;
        return {};
      }
      if (url.includes("/forecast/hourly")) return { properties: { periods: [] } };
      if (url.includes("/forecast")) return { properties: { periods: [day("2026-07-01", 30)] } };
      return { properties: {} };
    }) as never;
    const s = await fetchNwsForecast(
      { lat: 38.5, lon: -121.5 },
      { fetch: fetchFx, grid: { gridId: "STO", gridX: 40, gridY: 60, timeZone: "America/Los_Angeles" } },
    );
    expect(pointsCalls).toBe(0);
    expect(s.records).toHaveLength(1);
  });
});
