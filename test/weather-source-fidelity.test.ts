import { describe, expect, it } from "vitest";
import {
  assessSourceFidelity,
  gapFillCandidates,
  CLASSIFICATION_REFUSE_DELTA_M,
  DEGRADED_DELTA_M,
} from "@/lib/weather/source-fidelity-core";
import { parsePowerCellElevationM } from "@/lib/weather/providers/nasa-power";
import { normalizeArchiveResponse, buildArchiveUrl } from "@/lib/weather/providers/open-meteo-archive";
import { composeClimateSummaryCore, type DailyRow, type ClimateConfig } from "@/lib/weather/read-core";
import { providersForLocation } from "@/lib/weather/providers/registry";
import { assertAllowedHost } from "@/lib/weather/config";

// Regression suite for docs/analysis/bhutan-nasa-power-elevation-bias.md — a ~50 km grid product
// reported the temperature of a cell 1.8 km above the vineyard, and the app rendered Winkler Region I
// at a Region V site. These are the REAL measured numbers from that investigation.

describe("NASA POWER publishes its grid-cell elevation — and we now read it", () => {
  it("parses geometry.coordinates[2] (the Bajo cell: 3038.4 m for a 1229 m vineyard)", () => {
    expect(parsePowerCellElevationM({ geometry: { type: "Point", coordinates: [89.9, 27.493, 3038.4] } })).toBe(3038.4);
  });
  it("treats the -999 fill and a missing third element as unknown, never as sea level", () => {
    expect(parsePowerCellElevationM({ geometry: { coordinates: [89.9, 27.493, -999] } })).toBeNull();
    expect(parsePowerCellElevationM({ geometry: { coordinates: [89.9, 27.493] } })).toBeNull();
    expect(parsePowerCellElevationM({})).toBeNull();
  });
});

describe("source fidelity — the delta that decides whether a classification may render", () => {
  it("Bhutan Bajo: a 1809 m mismatch is UNUSABLE and refuses the classification", () => {
    const f = assessSourceFidelity({ siteElevationM: 1229, sourceElevationM: 3038.4, providerKey: "nasa_power" });
    expect(f.deltaM).toBe(1809);
    expect(f.band).toBe("UNUSABLE");
    expect(f.classificationAllowed).toBe(false);
    expect(f.impliedTempErrorC).toBeCloseTo(11.8, 1);
    // The measured bias at Bajo was 9.7 °C — the lapse-rate estimate is the right order.
    expect(f.reason).toMatch(/above the vineyard/);
    expect(f.reason).toMatch(/withheld/);
  });

  it("Ser Bhum: a 265 m mismatch still classifies, but says so", () => {
    const f = assessSourceFidelity({ siteElevationM: 2773, sourceElevationM: 3038.4, providerKey: "nasa_power" });
    expect(f.band).toBe("DEGRADED");
    expect(f.classificationAllowed).toBe(true);
    expect(f.reason).toMatch(/approximate/);
  });

  it("an elevation-downscaled source lands on the site → OK and silent", () => {
    const f = assessSourceFidelity({ siteElevationM: 1229, sourceElevationM: 1229, providerKey: "open_meteo_archive" });
    expect(f.band).toBe("OK");
    expect(f.deltaM).toBe(0);
    expect(f.reason).toBeNull();
  });

  it("a source BELOW the site reads too warm, and the prose says so", () => {
    const f = assessSourceFidelity({ siteElevationM: 2000, sourceElevationM: 500 });
    expect(f.deltaM).toBe(-1500);
    expect(f.reason).toMatch(/below the vineyard/);
    expect(f.reason).toMatch(/too warm/);
  });

  it("UNKNOWN (provider publishes no elevation) still classifies — refusing everything unmeasured helps nobody", () => {
    const f = assessSourceFidelity({ siteElevationM: 100, sourceElevationM: null });
    expect(f.band).toBe("UNKNOWN");
    expect(f.classificationAllowed).toBe(true);
    expect(f.reason).toBeNull();
    expect(assessSourceFidelity({ siteElevationM: null, sourceElevationM: 3038 }).band).toBe("UNKNOWN");
  });

  it("the thresholds are exclusive at the boundary (no off-by-one flip-flop)", () => {
    const at = (d: number) => assessSourceFidelity({ siteElevationM: 0, sourceElevationM: d });
    expect(at(DEGRADED_DELTA_M).band).toBe("OK");
    expect(at(DEGRADED_DELTA_M + 1).band).toBe("DEGRADED");
    expect(at(CLASSIFICATION_REFUSE_DELTA_M).band).toBe("DEGRADED");
    expect(at(CLASSIFICATION_REFUSE_DELTA_M + 1).band).toBe("UNUSABLE");
    expect(at(-(CLASSIFICATION_REFUSE_DELTA_M + 1)).band).toBe("UNUSABLE"); // symmetric in sign
  });
});

describe("gap-fill never reintroduces the uncorrected coarse grid", () => {
  it("drops nasa_power when the elevation-corrected archive is available", () => {
    expect(gapFillCandidates(["open_meteo_archive", "nasa_power"], "open_meteo_archive")).toEqual([]);
    expect(gapFillCandidates(["gridmet", "open_meteo_archive", "nasa_power"], "rcc_acis")).toEqual([
      "gridmet",
      "open_meteo_archive",
    ]);
  });
  it("keeps nasa_power as a fallback when nothing better exists (US sites are unaffected)", () => {
    expect(gapFillCandidates(["rcc_acis", "nasa_power"], "rcc_acis")).toEqual(["nasa_power"]);
  });
  it("never offers the primary back to itself", () => {
    expect(gapFillCandidates(["gridmet", "nasa_power"], "gridmet")).toEqual(["nasa_power"]);
  });
});

describe("Open-Meteo ERA5 archive adapter", () => {
  it("normalizes parallel arrays and echoes the downscale elevation", () => {
    const { records, sourceElevationM } = normalizeArchiveResponse({
      elevation: 1229,
      daily: {
        time: ["2026-04-06", "2026-04-07"],
        temperature_2m_max: [23.8, 22.2],
        temperature_2m_min: [11.8, 10.1],
        precipitation_sum: [0, 3.1],
        relative_humidity_2m_max: [95, null],
        relative_humidity_2m_min: [40, 42],
      },
    });
    expect(sourceElevationM).toBe(1229);
    expect(records[0]).toMatchObject({ sourceDate: "2026-04-06", tmaxC: 23.8, tminC: 11.8, precipMm: 0, rhMaxPct: 95 });
    expect(records[1].rhMaxPct).toBeNull(); // a missing slot is null, never 0 (R11)
  });

  it("throws a typed fault rather than returning a partial series", () => {
    expect(() => normalizeArchiveResponse({ daily: {} })).toThrow(/missing daily.time/);
  });

  it("passes the site elevation as the downscale target, and is SSRF-allowlisted", () => {
    const url = buildArchiveUrl(27.492544, 89.900364, "2026-04-01", "2026-04-30", { siteElevationM: 1229.4 });
    expect(url).toContain("elevation=1229"); // rounded to the metre
    expect(url).toContain("timezone=auto"); // local civil-day bucketing
    expect(() => assertAllowedHost("open_meteo_archive", url)).not.toThrow();
  });

  it("omits elevation= entirely when the site elevation is unknown (Open-Meteo then uses its own DEM)", () => {
    expect(buildArchiveUrl(27.5, 89.9, "2026-04-01", "2026-04-02", { siteElevationM: null })).not.toContain("elevation=");
  });
});

describe("registry: the corrected global source outranks the uncorrected one", () => {
  it("at a non-US point, open_meteo_archive comes before nasa_power", () => {
    const keys = providersForLocation(27.492544, 89.900364).map((p) => p.key);
    expect(keys).toContain("open_meteo_archive");
    expect(keys.indexOf("open_meteo_archive")).toBeLessThan(keys.indexOf("nasa_power"));
  });
});

// ── The end-to-end regression: the exact shape that shipped wrong ──

function bhutanRows(providerKey: string, tmax: number, tmin: number): DailyRow[] {
  const rows: DailyRow[] = [];
  for (let m = 4; m <= 10; m++) {
    for (let d = 1; d <= 28; d++) {
      rows.push({
        providerKey,
        localDate: `2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        tmaxC: tmax,
        tminC: tmin,
        precipMm: 0,
        rhMaxPct: null,
        rhMinPct: null,
      });
    }
  }
  return rows;
}

const baseConfig = (over: Partial<ClimateConfig>): ClimateConfig => ({
  primaryProviderKey: "nasa_power",
  primaryProviderOverride: null,
  coverageState: "GLOBAL_COARSE",
  stationId: null,
  stationName: null,
  stationDistanceM: null,
  stationElevationDeltaM: null,
  siteElevationM: 1229,
  primarySourceElevationM: null,
  attribution: null,
  lastRefreshAt: null,
  unitSystem: null,
  ...over,
});

describe("REGRESSION: a grid cell 1.8 km above the vines must not produce a confident Winkler region", () => {
  const rows = bhutanRows("nasa_power", 17.2, 10.6); // the real stored Bajo values for late July

  it("BEFORE-shape (no source elevation recorded) still classifies — the pre-fix behaviour", () => {
    const s = composeClimateSummaryCore({
      vineyardId: "v1",
      rows,
      config: baseConfig({ primarySourceElevationM: null }),
      latitude: 27.492544,
      today: "2026-10-31",
    });
    expect(s.sourceFidelity.band).toBe("UNKNOWN");
    expect(s.headline.winkler).not.toBeNull();
  });

  it("AFTER: with POWER's own cell elevation recorded, the classifications are WITHHELD, not wrong", () => {
    const s = composeClimateSummaryCore({
      vineyardId: "v1",
      rows,
      config: baseConfig({ primarySourceElevationM: 3038.4 }),
      latitude: 27.492544,
      today: "2026-10-31",
    });
    expect(s.sourceFidelity.band).toBe("UNUSABLE");
    expect(s.sourceFidelity.deltaM).toBe(1809);
    // The refusals — this is the whole point.
    expect(s.headline.winkler).toBeNull();
    expect(s.headline.gst.group).toBeNull();
    expect(s.normals.winkler10).toBeNull();
    expect(s.normals.winkler20).toBeNull();
    expect(s.honesty.winklerNearBoundary).toBe(false);
    // …but the underlying numbers still render: a refusal is not a blackout.
    expect(s.headline.seasonGddC).toBeGreaterThan(0);
    expect(s.headline.gst.gstC).not.toBeNull();
    expect(s.sourceFidelity.reason).toBeTruthy();
  });

  it("the elevation-corrected archive at the same site classifies normally", () => {
    const s = composeClimateSummaryCore({
      vineyardId: "v1",
      rows: bhutanRows("open_meteo_archive", 31.0, 20.5), // ERA5 at the vineyard's own elevation
      config: baseConfig({ primaryProviderKey: "open_meteo_archive", primarySourceElevationM: 1229 }),
      latitude: 27.492544,
      today: "2026-10-31",
    });
    expect(s.sourceFidelity.band).toBe("OK");
    expect(s.headline.winkler).not.toBeNull();
    // A subtropical valley is a hot region — the pre-fix card said Region I.
    expect(s.headline.winkler!.region).toBe("V");
    expect(s.headline.gst.group).toBe("Very hot");
  });

  it("gridFilledGddC does not fall back to the uncorrected grid when the archive is present", () => {
    const s = composeClimateSummaryCore({
      vineyardId: "v1",
      rows: [...bhutanRows("open_meteo_archive", 31.0, 20.5), ...bhutanRows("nasa_power", 17.2, 10.6)],
      config: baseConfig({ primaryProviderKey: "open_meteo_archive", primarySourceElevationM: 1229 }),
      latitude: 27.492544,
      today: "2026-10-31",
    });
    expect(s.headline.gridFilledGddC).toBeNull();
    // POWER is still visible in the compare-sources view — withheld from the headline, not deleted.
    expect(s.perSource.map((p) => p.provider)).toContain("nasa_power");
  });
});
