import { describe, expect, it } from "vitest";
import { defaultUnitSystemFor, isUsForecastCoverage } from "@/lib/weather/us-coverage";

// Plan 096 U1 (council S2) — the US-forecast predicate must cover what NWS actually covers
// (live-verified: Anchorage/Honolulu/San Juan/Guam all resolve), which the CONUS-only
// coverageStateFor deliberately does not.

describe("isUsForecastCoverage", () => {
  it("covers CONUS (Napa)", () => {
    expect(isUsForecastCoverage(38.5, -122.4)).toBe(true);
  });
  it("covers Alaska (Anchorage) — the legacy CONUS bbox misses this", () => {
    expect(isUsForecastCoverage(61.2, -149.9)).toBe(true);
  });
  it("covers Hawaii (Honolulu)", () => {
    expect(isUsForecastCoverage(21.3, -157.9)).toBe(true);
  });
  it("covers Puerto Rico (San Juan)", () => {
    expect(isUsForecastCoverage(18.47, -66.1)).toBe(true);
  });
  it("covers Guam", () => {
    expect(isUsForecastCoverage(13.48, 144.75)).toBe(true);
  });
  it("covers American Samoa (Pago Pago)", () => {
    expect(isUsForecastCoverage(-14.28, -170.7)).toBe(true);
  });
  it("does NOT cover Bhutan (Thimphu) — live /points returns 404 InvalidPoint", () => {
    expect(isUsForecastCoverage(27.47, 89.64)).toBe(false);
  });
  it("does NOT cover southern France", () => {
    expect(isUsForecastCoverage(43.6, 3.9)).toBe(false);
  });
});

describe("defaultUnitSystemFor", () => {
  it("US point → IMPERIAL", () => {
    expect(defaultUnitSystemFor(38.5, -122.4)).toBe("IMPERIAL");
  });
  it("Alaska → IMPERIAL (the council-S2 fix: coverageState would have said METRIC)", () => {
    expect(defaultUnitSystemFor(61.2, -149.9)).toBe("IMPERIAL");
  });
  it("Bhutan → METRIC", () => {
    expect(defaultUnitSystemFor(27.47, 89.64)).toBe("METRIC");
  });
});
