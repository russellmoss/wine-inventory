import { describe, expect, it } from "vitest";
import { normalizePowerResponse } from "@/lib/weather/providers/nasa-power";
import { normalizeAcisRows, cleanAcis } from "@/lib/weather/providers/gridmet";
import { nearestStation } from "@/lib/weather/providers/rcc-acis";
import { normalizeDaymetCsv, leapDec31 } from "@/lib/weather/providers/daymet";
import { normalizeCdoResults } from "@/lib/weather/providers/noaa-cdo";
import { parseEpqsElevationM } from "@/lib/weather/providers/usgs-epqs";
import { coverageStateFor, providersForLocation } from "@/lib/weather/providers/registry";
import { assertAllowedHost } from "@/lib/weather/config";

describe("NASA POWER normalization", () => {
  it("parses wide params and treats -999 as null", () => {
    const json = {
      properties: {
        parameter: {
          T2M_MAX: { "20260701": 28.5, "20260702": -999 },
          T2M_MIN: { "20260701": 12.3, "20260702": 11.1 },
          PRECTOTCORR: { "20260701": 0, "20260702": 4.2 },
        },
      },
    };
    const recs = normalizePowerResponse(json);
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ sourceDate: "2026-07-01", tmaxC: 28.5, tminC: 12.3, precipMm: 0 });
    expect(recs[1].tmaxC).toBeNull(); // -999 → null (never fabricated as a value)
  });
});

describe("ACIS row normalization (gridMET/station shared)", () => {
  it("handles M (missing), T (trace→0), and RH columns", () => {
    expect(cleanAcis("M")).toBeNull();
    expect(cleanAcis("T")).toBe(0);
    expect(cleanAcis(-999)).toBeNull();
    const json = { data: [["2026-07-01", "28.5", "12.3", "T", "88", "40"], ["2026-07-02", "M", "11.0", "5.1", "M", "M"]] };
    const recs = normalizeAcisRows(json, true);
    expect(recs[0]).toMatchObject({ sourceDate: "2026-07-01", tmaxC: 28.5, tminC: 12.3, precipMm: 0, rhMaxPct: 88, rhMinPct: 40 });
    expect(recs[1].tmaxC).toBeNull();
    expect(recs[1].rhMaxPct).toBeNull();
  });
});

describe("ACIS nearest-station selection", () => {
  it("picks the closest station to the point", () => {
    const json = {
      meta: [
        { name: "FAR", ll: [-123.5, 39.0], sids: ["040001 2"] },
        { name: "NEAR", ll: [-122.81, 38.5], sids: ["047109 2"] },
      ],
    };
    const s = nearestStation(json, 38.5, -122.8);
    expect(s?.name).toBe("NEAR");
    expect(s?.sid).toBe("047109");
  });
});

describe("Daymet CSV + leap-year Dec 31 padding (R7)", () => {
  it("null-pads Dec 31 in a leap year", () => {
    expect(leapDec31(2024)).toBe("2024-12-31");
    expect(leapDec31(2026)).toBeNull();
    const csv = ["year,yday,tmax (deg c),tmin (deg c),prcp (mm/day)", "2024,364,5.0,-2.0,0.0", "2024,365,4.0,-3.0,1.0"].join("\n");
    const recs = normalizeDaymetCsv(csv);
    const dec31 = recs.find((r) => r.sourceDate === "2024-12-31");
    expect(dec31).toBeDefined();
    expect(dec31?.tmaxC).toBeNull(); // padded, not fabricated
    // yday 365 in a leap year maps to Dec 30 (365-day calendar), so Dec 31 is the pad.
    expect(recs.some((r) => r.sourceDate === "2024-12-30")).toBe(true);
  });
});

describe("NOAA CDO long→wide fold (tenths)", () => {
  it("converts °C×10 / mm×10 and folds by date", () => {
    const json = {
      results: [
        { date: "2026-07-01T00:00:00", datatype: "TMAX", value: 285 },
        { date: "2026-07-01T00:00:00", datatype: "TMIN", value: 123 },
        { date: "2026-07-01T00:00:00", datatype: "PRCP", value: 51 },
      ],
    };
    const recs = normalizeCdoResults(json);
    expect(recs[0]).toMatchObject({ sourceDate: "2026-07-01", tmaxC: 28.5, tminC: 12.3, precipMm: 5.1 });
  });
});

describe("USGS EPQS elevation parse", () => {
  it("parses v1 and legacy shapes", () => {
    expect(parseEpqsElevationM({ value: "123.45" })).toBe(123.45);
    expect(parseEpqsElevationM({ USGS_Elevation_Point_Query_Service: { Elevation_Query: { Elevation: 200 } } })).toBe(200);
    expect(parseEpqsElevationM({ value: -1000000 })).toBeNull(); // fill
  });
});

describe("coverage classification + registry", () => {
  it("CONUS → US_HIGH_RES, Bhutan → GLOBAL_COARSE", () => {
    expect(coverageStateFor(38.5, -122.8)).toBe("US_HIGH_RES"); // Russian River
    expect(coverageStateFor(27.5, 89.6)).toBe("GLOBAL_COARSE"); // Bhutan → POWER only
  });
  it("Bhutan resolves only the global provider", () => {
    const provs = providersForLocation(27.5, 89.6).map((p) => p.key);
    expect(provs).toContain("nasa_power");
    expect(provs).not.toContain("gridmet");
  });
});

describe("SSRF host guard", () => {
  it("accepts the allowlisted host and rejects anything else", () => {
    expect(() => assertAllowedHost("nasa_power", "https://power.larc.nasa.gov/api/x")).not.toThrow();
    expect(() => assertAllowedHost("nasa_power", "https://evil.example.com/api/x")).toThrow(/SSRF guard/);
    expect(() => assertAllowedHost("gridmet", "https://data.rcc-acis.org/GridData")).not.toThrow();
  });
});
