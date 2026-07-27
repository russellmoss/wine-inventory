import { describe, expect, it } from "vitest";
import { conditionFromNws, conditionFromWmo, nwsIconToken, worseCondition, type UnmappedLogger } from "@/lib/weather/condition-core";

// Plan 096 U14 — condition mapping. Every one of the 28 documented WMO codes must map to a
// non-UNKNOWN condition; unmapped values log (never silent); NWS icon-token parse with
// shortForecast fallback.

const ALL_WMO = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];

describe("conditionFromWmo", () => {
  it("maps ALL 28 documented WMO codes to a non-UNKNOWN condition", () => {
    for (const code of ALL_WMO) {
      expect(conditionFromWmo(code), `WMO ${code}`).not.toBe("UNKNOWN");
    }
  });
  it("spot checks", () => {
    expect(conditionFromWmo(0)).toBe("CLEAR");
    expect(conditionFromWmo(3)).toBe("CLOUDY");
    expect(conditionFromWmo(45)).toBe("FOG");
    expect(conditionFromWmo(65)).toBe("HEAVY_RAIN");
    expect(conditionFromWmo(66)).toBe("SLEET");
    expect(conditionFromWmo(75)).toBe("SNOW");
    expect(conditionFromWmo(95)).toBe("THUNDERSTORM");
  });
  it("unmapped code → UNKNOWN + one structured log line", () => {
    const logged: unknown[] = [];
    const log: UnmappedLogger = (p) => logged.push(p);
    expect(conditionFromWmo(42, log)).toBe("UNKNOWN");
    expect(logged).toEqual([{ evt: "weather.condition.unmapped", source: "wmo", value: "42" }]);
    expect(conditionFromWmo(null, log)).toBe("UNKNOWN"); // null doesn't log — it's absence, not a gap in our table
    expect(logged).toHaveLength(1);
  });
});

describe("nwsIconToken", () => {
  it("extracts the first token from day and night icon URLs", () => {
    expect(nwsIconToken("https://api.weather.gov/icons/land/day/tsra_sct,40?size=medium")).toBe("tsra_sct");
    expect(nwsIconToken("https://api.weather.gov/icons/land/night/skc?size=medium")).toBe("skc");
    expect(nwsIconToken("https://api.weather.gov/icons/land/day/rain_showers,30/tsra,60")).toBe("rain_showers");
    expect(nwsIconToken(null)).toBeNull();
    expect(nwsIconToken("https://example.com/other")).toBeNull();
  });
});

describe("conditionFromNws", () => {
  it("icon token wins", () => {
    expect(conditionFromNws("https://api.weather.gov/icons/land/day/bkn", "Sunny")).toBe("CLOUDY");
    expect(conditionFromNws("https://api.weather.gov/icons/land/night/tsra_hi,20", null)).toBe("THUNDERSTORM");
    expect(conditionFromNws("https://api.weather.gov/icons/land/day/wind_sct", null)).toBe("WINDY");
    expect(conditionFromNws("https://api.weather.gov/icons/land/day/fzra", null)).toBe("SLEET");
  });
  it("falls back to shortForecast text when the token is unknown or missing", () => {
    expect(conditionFromNws(null, "Slight Chance Rain Showers")).toBe("LIGHT_RAIN");
    expect(conditionFromNws(null, "Mostly Sunny")).toBe("MOSTLY_CLEAR");
    expect(conditionFromNws(null, "Patchy Fog")).toBe("FOG");
    expect(conditionFromNws(null, "Wintry Mix")).toBe("SLEET");
  });
  it("unmapped → UNKNOWN + structured log", () => {
    const logged: unknown[] = [];
    const log: UnmappedLogger = (p) => logged.push(p);
    expect(conditionFromNws(null, "Zorp", log)).toBe("UNKNOWN");
    expect(logged).toEqual([{ evt: "weather.condition.unmapped", source: "nws", value: "Zorp" }]);
  });
});

describe("worseCondition", () => {
  it("picks the more consequential of two half-day conditions", () => {
    expect(worseCondition("CLEAR", "RAIN")).toBe("RAIN");
    expect(worseCondition("THUNDERSTORM", "LIGHT_RAIN")).toBe("THUNDERSTORM");
    expect(worseCondition("PARTLY_CLOUDY", "CLOUDY")).toBe("CLOUDY");
    expect(worseCondition("CLEAR", "CLEAR")).toBe("CLEAR");
  });
});
