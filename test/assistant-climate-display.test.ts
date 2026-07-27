import { describe, expect, it } from "vitest";
import { climateDisplay, forecastDayDisplay, precipDisplay, tempDisplay } from "@/lib/assistant/tools/climate-display";
import { composeClimateSummaryCore, resolveWeatherUnitSystem, type ClimateConfig, type DailyRow } from "@/lib/weather/read-core";

// Plan 098 U11 (council gate) — the two payload behaviors the D26/H8 harness can't pin from
// tool-selection goldens, pinned deterministically instead:
//   1. IMPERIAL-TENANT: an imperial-resolved site emits °F / inches display strings.
//   2. AUTO-INHERIT: a vineyard with a NULL override inherits the tenant master through the chain.

const NBSP = " ";

const config = (unitSystem: string | null): ClimateConfig => ({
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
  unitSystem,
});

const rows: DailyRow[] = [
  { providerKey: "gridmet", localDate: "2026-07-01", tmaxC: 30, tminC: 12, precipMm: 5, rhMaxPct: null, rhMinPct: null },
  { providerKey: "gridmet", localDate: "2026-07-02", tmaxC: 32, tminC: 14, precipMm: 0, rhMaxPct: null, rhMinPct: null },
];

// An Oregon point (inside US forecast coverage → geo default IMPERIAL).
const OREGON = { lat: 45.3, lon: -123.0 };

describe("auto-inherit — the U6 chain flows into the tool payload", () => {
  it("NULL override + tenant IMPERIAL → the summary resolves IMPERIAL", () => {
    const s = composeClimateSummaryCore({
      vineyardId: "v1", rows, config: config(null), latitude: OREGON.lat, longitude: OREGON.lon,
      today: "2026-07-03", tenantUnitSystem: "IMPERIAL",
    });
    expect(s.unitSystem).toBe("IMPERIAL");
    expect(s.unitSystemOverride).toBeNull();
  });
  it("explicit METRIC override beats an imperial tenant AND the US geo default", () => {
    const s = composeClimateSummaryCore({
      vineyardId: "v1", rows, config: config("METRIC"), latitude: OREGON.lat, longitude: OREGON.lon,
      today: "2026-07-03", tenantUnitSystem: "IMPERIAL",
    });
    expect(s.unitSystem).toBe("METRIC");
    expect(s.unitSystemOverride).toBe("METRIC");
  });
  it("unconfigured tenant + NULL override → the geo default (the pre-098 seed, now resolved on read)", () => {
    expect(resolveWeatherUnitSystem(null, null, OREGON.lat, OREGON.lon)).toBe("IMPERIAL");
    expect(resolveWeatherUnitSystem(null, null, 27.4, 90.4)).toBe("METRIC"); // Bhutan
  });
});

describe("imperial-tenant — display strings the model uses verbatim", () => {
  const s = composeClimateSummaryCore({
    vineyardId: "v1", rows, config: config(null), latitude: OREGON.lat, longitude: OREGON.lon,
    today: "2026-07-03", tenantUnitSystem: "IMPERIAL",
  });
  it("climateDisplay speaks °F-GDD / °F / inches", () => {
    const d = climateDisplay(s);
    expect(d.unitSystem).toBe("IMPERIAL");
    expect(d.gddSeasonToDate).toMatch(/°F-GDD$/);
    expect(d.growingSeasonTemp).toMatch(/°F$/);
    expect(d.seasonRainfall).toMatch(/in$/);
  });
  it("forecast day + point temps format in °F / inches ('a high around 73', not 23)", () => {
    const fd = forecastDayDisplay({ tmaxC: 23, tminC: 10, precipMm: 12.7 }, s.unitSystem);
    expect(fd.high).toBe(`73${NBSP}°F`);
    expect(fd.low).toBe(`50${NBSP}°F`);
    expect(fd.expectedRain).toBe(`0.50${NBSP}in`);
    expect(tempDisplay(-2, "IMPERIAL")).toBe(`28.4${NBSP}°F`);
    expect(precipDisplay(25.4, "METRIC")).toBe(`25.4${NBSP}mm`);
  });
});
