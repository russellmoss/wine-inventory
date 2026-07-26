import { describe, expect, it } from "vitest";
import { fetchOpenMeteoForecast, parseOpenMeteoDaily, parseOpenMeteoHourly } from "@/lib/weather/providers/forecast-open-meteo";

// Plan 096 U13 — Open-Meteo forecast normalization + request shape (elevation downscaling param,
// timezone capture, apikey passthrough when configured).

describe("parseOpenMeteoDaily", () => {
  it("normalizes parallel arrays into per-day records; missing slots → null never 0", () => {
    const records = parseOpenMeteoDaily({
      time: ["2026-07-27", "2026-07-28"],
      weather_code: [61, null],
      temperature_2m_max: [24.1, null],
      temperature_2m_min: [12.3, 11.0],
      precipitation_sum: [5.6, null],
      precipitation_probability_max: [80, null],
      wind_speed_10m_max: [18.4, 12.0],
    });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ targetDate: "2026-07-27", tmaxC: 24.1, tminC: 12.3, precipMm: 5.6, precipProbabilityPct: 80, conditionCode: "LIGHT_RAIN", windMaxKph: 18.4 });
    expect(records[1]).toMatchObject({ targetDate: "2026-07-28", tmaxC: null, precipMm: null, precipProbabilityPct: null, conditionCode: "UNKNOWN", windMaxKph: 12.0 });
  });
});

describe("parseOpenMeteoHourly (plan 097 U1)", () => {
  it("maps local wall-clock slots to UTC instants + local keys; per-hour amounts get durationH=1", () => {
    // Asia/Thimphu is UTC+6 — 13:00 local = 07:00Z; the local keys come straight off the string.
    const out = parseOpenMeteoHourly(
      {
        time: ["2026-07-27T13:00", "2026-07-27T14:00"],
        temperature_2m: [22.4, null],
        precipitation: [1.2, 0],
        precipitation_probability: [90, 85],
        weather_code: [61, 3],
        wind_speed_10m: [9.4, 8],
      },
      "Asia/Thimphu",
    );
    expect(out[0]).toMatchObject({
      hourStartUtc: "2026-07-27T07:00:00.000Z",
      localDate: "2026-07-27",
      localHour: 13,
      tempC: 22.4,
      popPct: 90,
      precipMm: 1.2,
      precipDurationH: 1,
      conditionCode: "LIGHT_RAIN",
      windKph: 9.4,
    });
    expect(out[1].tempC).toBeNull(); // missing stays null, never 0
  });

  it("negative-offset zone: 22:00 local in LA = 05:00Z next UTC day, local keys unchanged", () => {
    const out = parseOpenMeteoHourly({ time: ["2026-01-15T22:00"], temperature_2m: [4] }, "America/Los_Angeles");
    expect(out[0].hourStartUtc).toBe("2026-01-16T06:00:00.000Z"); // PST −8
    expect(out[0].localDate).toBe("2026-01-15");
    expect(out[0].localHour).toBe(22);
  });
});

describe("fetchOpenMeteoForecast", () => {
  it("requests the six daily vars + forecast_days=7 + timezone=auto + elevation; captures timezone", async () => {
    let seenUrl = "";
    const fetchFx = (async (_key: unknown, url: string) => {
      seenUrl = url;
      return {
        timezone: "Asia/Thimphu",
        daily: { time: ["2026-07-27"], weather_code: [3], temperature_2m_max: [22], temperature_2m_min: [12], precipitation_sum: [0], precipitation_probability_max: [10], wind_speed_10m_max: [9] },
        hourly: { time: ["2026-07-27T00:00"], temperature_2m: [14], precipitation: [0.3], precipitation_probability: [40], weather_code: [51], wind_speed_10m: [5] },
      };
    }) as never;
    const s = await fetchOpenMeteoForecast({ lat: 27.47, lon: 89.64, elevationM: 2302 }, { fetch: fetchFx });
    expect(seenUrl).toContain("forecast_days=7");
    expect(seenUrl).toContain("timezone=auto");
    expect(seenUrl).toContain("elevation=2302");
    expect(seenUrl).toContain("weather_code");
    expect(seenUrl).toContain("precipitation_probability_max");
    expect(seenUrl).toContain("hourly=temperature_2m"); // plan 097 — ONE request carries both blocks
    expect(s.timeZone).toBe("Asia/Thimphu");
    expect(s.records[0].conditionCode).toBe("CLOUDY");
    expect(s.hourly).toHaveLength(1);
    expect(s.hourly?.[0]).toMatchObject({ localDate: "2026-07-27", localHour: 0, precipMm: 0.3, precipDurationH: 1 });
  });

  it("omits elevation when unknown; throws typed on an empty response", async () => {
    let seenUrl = "";
    const fetchFx = (async (_key: unknown, url: string) => {
      seenUrl = url;
      return { timezone: "UTC", daily: {} };
    }) as never;
    await expect(fetchOpenMeteoForecast({ lat: 1, lon: 1, elevationM: null }, { fetch: fetchFx })).rejects.toThrow(/no days/);
    expect(seenUrl).not.toContain("elevation=");
  });
});
