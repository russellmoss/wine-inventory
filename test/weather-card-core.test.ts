import { describe, expect, it } from "vitest";
import { coverageLabel, gddComparisonLabel, providerLabel, sparklinePoints, trustLabel } from "@/lib/weather/card-core";

describe("card-core", () => {
  it("sparkline scales cumulative points into the box", () => {
    const pts = sparklinePoints([{ date: "a", cumC: 0 }, { date: "b", cumC: 50 }, { date: "c", cumC: 100 }], 100, 20, 2);
    // first point at left/bottom-ish, last at right/top.
    expect(pts.split(" ")).toHaveLength(3);
    expect(pts.startsWith("2,")).toBe(true);
    expect(pts.endsWith("2")).toBe(true); // last y at top (cumC max → y=pad=2)
  });
  it("trust label buckets by completeness", () => {
    expect(trustLabel(95)).toBe("High");
    expect(trustLabel(70)).toBe("Partial");
    expect(trustLabel(40)).toBe("Sparse");
  });
  it("coverage + comparison labels are honest", () => {
    expect(coverageLabel("GLOBAL_COARSE")).toMatch(/coarse/i);
    expect(gddComparisonLabel(120)).toMatch(/Warmer/);
    expect(gddComparisonLabel(-120)).toMatch(/Cooler/);
    expect(gddComparisonLabel(10)).toMatch(/same/i);
    expect(gddComparisonLabel(null)).toMatch(/No prior/i);
  });
  it("provider labels fold in the station name and stay human", () => {
    expect(providerLabel("rcc_acis", "Santa Rosa AP")).toBe("Station — Santa Rosa AP");
    expect(providerLabel("rcc_acis", null)).toBe("Nearest station");
    expect(providerLabel("gridmet")).toMatch(/gridMET/);
    expect(providerLabel("nasa_power")).toMatch(/global/i);
  });
});
