import { describe, expect, it } from "vitest";
import {
  assertNeverBlended,
  computeSpreadCore,
  effectivePrimary,
  gapFillCore,
  selectPrimaryCore,
  type PrimaryCandidate,
} from "@/lib/weather/source-selection-core";
import type { LocalDailyRecord } from "@/lib/weather/obs-time-core";

function d(localDate: string, tmaxC: number | null, tminC: number | null): LocalDailyRecord {
  return { localDate, tmaxC, tminC, precipMm: 0, rhMaxPct: null, rhMinPct: null };
}

describe("effectivePrimary = override ?? resolvedDefault (R14)", () => {
  it("uses the override when set, else the resolved default", () => {
    expect(effectivePrimary({ primaryProviderKey: "gridmet" })).toBe("gridmet");
    expect(effectivePrimary({ primaryProviderKey: "gridmet", primaryProviderOverride: "rcc_acis" })).toBe("rcc_acis");
    expect(effectivePrimary({ primaryProviderKey: "gridmet", primaryProviderOverride: null })).toBe("gridmet");
  });
});

describe("selectPrimaryCore", () => {
  const grid: PrimaryCandidate = { providerKey: "gridmet", kind: "grid", stationDistanceM: null, stationElevationDeltaM: null, completeness: 1 };
  it("prefers the closer quality station within ~10mi", () => {
    const near: PrimaryCandidate = { providerKey: "rcc_acis", kind: "station", stationDistanceM: 4000, stationElevationDeltaM: 20, completeness: 0.95 };
    const far: PrimaryCandidate = { providerKey: "noaa_cdo", kind: "station", stationDistanceM: 9000, stationElevationDeltaM: 5, completeness: 1 };
    expect(selectPrimaryCore([grid, far, near])).toBe("rcc_acis");
  });
  it("falls back to a grid when no station is within range", () => {
    const farStation: PrimaryCandidate = { providerKey: "rcc_acis", kind: "station", stationDistanceM: 40000, stationElevationDeltaM: 5, completeness: 1 };
    expect(selectPrimaryCore([grid, farStation])).toBe("gridmet");
  });
});

describe("gapFillCore — read-time composition, never overwrites, stamps the fill (R3)", () => {
  const primary = [d("2026-04-01", 20, 8), d("2026-04-03", 22, 9)]; // 04-02 missing
  const fallback = [d("2026-04-01", 99, 99), d("2026-04-02", 18, 6), d("2026-04-03", 99, 99)];
  const composed = gapFillCore(primary, fallback, "gridmet");
  const byDate = Object.fromEntries(composed.map((r) => [r.localDate, r]));

  it("fills only the missing date and stamps it", () => {
    expect(composed).toHaveLength(3);
    expect(byDate["2026-04-02"].tmaxC).toBe(18);
    expect(byDate["2026-04-02"].filledFromProvider).toBe("gridmet");
  });
  it("never overwrites a present primary day", () => {
    expect(byDate["2026-04-01"].tmaxC).toBe(20); // primary, not the 99 fallback
    expect(byDate["2026-04-01"].filledFromProvider).toBeNull();
    expect(byDate["2026-04-03"].tmaxC).toBe(22);
  });
});

describe("spread — a range, never an average", () => {
  it("computes min/max/range across sources", () => {
    const s = computeSpreadCore([
      { source: "rcc_acis", value: 1450 },
      { source: "gridmet", value: 1520 },
    ]);
    expect(s).toMatchObject({ min: 1450, max: 1520, range: 70 });
    expect(s?.sources).toEqual(["rcc_acis", "gridmet"]);
  });
  it("assertNeverBlended throws if a headline carries a blended field", () => {
    expect(() => assertNeverBlended({ gdd: 1500, source: "gridmet" })).not.toThrow();
    expect(() => assertNeverBlended({ gdd: 1500, mean: 1485 })).toThrow(/forbidden blended field/);
    expect(() => assertNeverBlended({ average: 1485 })).toThrow();
  });
});
