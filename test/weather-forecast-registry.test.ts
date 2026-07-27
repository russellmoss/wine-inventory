import { describe, expect, it } from "vitest";
import { forecastProvidersForLocation } from "@/lib/weather/providers/forecast-registry";

// Plan 096 U10 — forecast coverage routing. The acceptance cases: AK/HI/territories resolve to
// NWS (the legacy CONUS bbox would have missed them); a non-US point gets Open-Meteo only; a US
// point gets both with NWS first.

describe("forecastProvidersForLocation", () => {
  it("Napa → both, NWS first", () => {
    expect(forecastProvidersForLocation(38.5, -122.4).map((p) => p.key)).toEqual(["nws", "open_meteo"]);
  });
  it("Anchorage / Honolulu / San Juan / Guam → NWS covered (live-verified endpoints)", () => {
    for (const [lat, lon] of [
      [61.2, -149.9],
      [21.3, -157.9],
      [18.47, -66.1],
      [13.48, 144.75],
    ]) {
      expect(forecastProvidersForLocation(lat, lon).map((p) => p.key), `${lat},${lon}`).toEqual(["nws", "open_meteo"]);
    }
  });
  it("Thimphu (Bhutan) → Open-Meteo only (NWS /points 404s InvalidPoint there)", () => {
    expect(forecastProvidersForLocation(27.47, 89.64).map((p) => p.key)).toEqual(["open_meteo"]);
  });
});
