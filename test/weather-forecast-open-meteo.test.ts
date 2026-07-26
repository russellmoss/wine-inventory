import { describe, expect, it } from "vitest";
import { fetchOpenMeteoForecast, parseOpenMeteoDaily } from "@/lib/weather/providers/forecast-open-meteo";

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

describe("fetchOpenMeteoForecast", () => {
  it("requests the six daily vars + forecast_days=7 + timezone=auto + elevation; captures timezone", async () => {
    let seenUrl = "";
    const fetchFx = (async (_key: unknown, url: string) => {
      seenUrl = url;
      return {
        timezone: "Asia/Thimphu",
        daily: { time: ["2026-07-27"], weather_code: [3], temperature_2m_max: [22], temperature_2m_min: [12], precipitation_sum: [0], precipitation_probability_max: [10], wind_speed_10m_max: [9] },
      };
    }) as never;
    const s = await fetchOpenMeteoForecast({ lat: 27.47, lon: 89.64, elevationM: 2302 }, { fetch: fetchFx });
    expect(seenUrl).toContain("forecast_days=7");
    expect(seenUrl).toContain("timezone=auto");
    expect(seenUrl).toContain("elevation=2302");
    expect(seenUrl).toContain("weather_code");
    expect(seenUrl).toContain("precipitation_probability_max");
    expect(s.timeZone).toBe("Asia/Thimphu");
    expect(s.records[0].conditionCode).toBe("CLOUDY");
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
