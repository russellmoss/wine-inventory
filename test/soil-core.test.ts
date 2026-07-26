import { describe, it, expect } from "vitest";
import {
  parseSdaTable,
  parseCompositionRows,
  parsePropertyRows,
  type SdaCompositionRow,
  type SdaPropertyRow,
} from "@/lib/soil/parse-sda-core";
import { classifyMapUnit, componentIsNonSoil, majorComponents } from "@/lib/soil/classify-core";
import { computeSoilComposition, COVERAGE_EPSILON, SHARE_FLOOR } from "@/lib/soil/composition-core";
import { toWkt, blockAreaSqM } from "@/lib/soil/wkt-core";
import { buildPropertyQuery, buildCompositionQuery, isValidMukey } from "@/lib/soil/sda-query";
import { validateVineyardPolygon, type VineyardPolygon } from "@/lib/gis/geometry";

// A recorded-shape SDA composition table (array-of-arrays, all strings) mirroring the live spike.
function compTable(rows: Array<[string, string, string, string, string, string, string, string, string]>) {
  return {
    Table: [
      ["mukey", "muname", "mukind", "drclassdcd", "aws025wta", "areasymbol", "saverest", "isect_sqdeg", "block_sqdeg"],
      ...rows,
    ],
  };
}
function prop(mukey: string, cokey: string, compname: string, comppct: string, maj: string, tax: string | null, ph: string | null, res: string | null): SdaPropertyRow {
  return { mukey, cokey, compname, comppct: comppct === "" ? null : Number(comppct), majcompflag: maj, taxclname: tax, phTop: ph == null ? null : Number(ph), resdept: res == null ? null : Number(res) };
}

describe("parse-sda-core — array-of-arrays, all-strings, explicit coercion", () => {
  it("coerces numbers and maps '' / missing columns to null (never NaN)", () => {
    const table = parseSdaTable(compTable([["100", "Lima loam", "Consociation", "Well drained", "", "NY001", "9/2/2025", "5.0E-05", "1.0E-04"]]));
    const rows = parseCompositionRows(table);
    expect(rows).toHaveLength(1);
    expect(rows[0].aws025wta).toBeNull(); // "" -> null
    expect(rows[0].isectSqDeg).toBeCloseTo(5e-5, 10);
    expect(rows[0].blockSqDeg).toBeCloseTo(1e-4, 10);
    expect(rows[0].surveyAreaSymbol).toBe("NY001");
  });
  it("throws on a non-table body (never treated as 0 soils)", () => {
    expect(() => parseSdaTable("<html>503</html>")).toThrow();
    expect(() => parseSdaTable({ nope: 1 })).toThrow();
  });
  it("empty Table -> zero rows", () => {
    expect(parseCompositionRows(parseSdaTable({ Table: [] }))).toEqual([]);
  });
});

describe("classify-core — spike NEW-1: Water is a map unit, not a gap", () => {
  it("classifies a water/misc map unit (no taxonomic class) as non-soil / water", () => {
    const waterComp = prop("3250410", "c1", "Water", "100", "Yes", null, null, null);
    expect(componentIsNonSoil(waterComp)).toBe(true);
    expect(classifyMapUnit("Water", [waterComp])).toBe("water");
    expect(classifyMapUnit("Pits, gravel", [prop("9", "c", "Pits", "100", "Yes", null, null, null)])).toBe("non-soil");
  });
  it("classifies a real soil as soil", () => {
    expect(classifyMapUnit("Mardin channery silt loam", [prop("1", "c", "Mardin", "85", "Yes", "Coarse-loamy Typic Fragiudepts", "6.6", "51")])).toBe("soil");
  });
  it("[C9] a real soil with a minor water inclusion stays soil (mixed), not suppressed", () => {
    const majorSoil = prop("1", "c1", "Mardin", "85", "Yes", "Coarse-loamy Typic Fragiudepts", "6.6", "51");
    const minorWater = prop("1", "c2", "Water", "10", "No", null, null, null);
    // minor water is NOT a major component, so the unit is plain soil
    expect(classifyMapUnit("Mardin silt loam", [majorSoil, minorWater])).toBe("soil");
    // when BOTH are major, it is mixed (keeps soil), never collapsed to water
    const majorWater = { ...minorWater, majcompflag: "Yes" };
    expect(classifyMapUnit("Mardin-Water complex", [majorSoil, majorWater])).toBe("mixed");
  });
  it("falls back to a muname denylist when no component rows exist", () => {
    expect(classifyMapUnit("Water", [])).toBe("water");
    expect(classifyMapUnit("Rock outcrop", [])).toBe("non-soil");
    expect(classifyMapUnit("Lima loam", [])).toBe("soil");
  });
  it("majorComponents: flagged Yes, else the single highest percent", () => {
    expect(majorComponents([prop("1", "a", "A", "85", "Yes", "x", "6", "40"), prop("1", "b", "B", "10", "No", "y", "6", "40")]).map((c) => c.cokey)).toEqual(["a"]);
    expect(majorComponents([prop("1", "a", "A", "60", "", "x", "6", "40"), prop("1", "b", "B", "40", "", "y", "6", "40")]).map((c) => c.cokey)).toEqual(["a"]);
  });
});

describe("composition-core — coverage 3-branch, share floor, no blending, one row per mukey", () => {
  const B = 1e-4; // block_sqdeg
  const comp = (mukey: string, muname: string, dr: string, awc: string, isect: number): SdaCompositionRow => ({
    mukey, muname, mukind: "Consociation", drclassdcd: dr, aws025wta: awc === "" ? null : Number(awc), isectSqDeg: isect, blockSqDeg: B, surveyAreaSymbol: "NY123", surveyAreaVersion: "9/2/2025",
  });

  it("within 1±ε -> covered; shares normalize to 1 against the intersection sum", () => {
    const out = computeSoilComposition({
      composition: [comp("1", "Lima loam", "Well drained", "4.6", 0.6e-4), comp("2", "Kendaia loam", "Somewhat poorly drained", "5.0", 0.4e-4)],
      properties: [prop("1", "c1", "Lima", "90", "Yes", "tax", "6.5", "80"), prop("2", "c2", "Kendaia", "85", "Yes", "tax", "6.8", "45")],
      blockAreaSqM: 40000,
    });
    expect(out.coverageState).toBe("covered");
    expect(out.coveredPct).toBeCloseTo(1, 6);
    const soils = out.components.filter((c) => c.class !== "uncovered");
    expect(soils.reduce((s, c) => s + c.areaPct, 0)).toBeCloseTo(1, 6);
    // areaSqM is share × geodesic block area (council C3), not a cos(lat)-scaled SDA value
    expect(soils[0].areaSqM).toBeCloseTo(0.6 * 40000, 2);
    // NO blended block property — each soil keeps its own pH cited at the horizon level
    expect(soils[0].ph).toBe(6.5);
    expect(soils[0].phBasis).toBe("topmost mineral horizon");
    expect(soils[0].drainageBasis).toBe("map-unit dominant condition");
  });

  it("< 1-ε -> partial; normalizes against block area and emits an explicit uncovered row", () => {
    const out = computeSoilComposition({
      composition: [comp("1", "Lima loam", "Well drained", "4.6", 0.7e-4)], // covered = 0.70
      properties: [prop("1", "c1", "Lima", "90", "Yes", "tax", "6.5", "80")],
      blockAreaSqM: 40000,
    });
    expect(out.coverageState).toBe("partial");
    expect(out.coveredPct).toBeCloseTo(0.7, 6);
    const uncovered = out.components.find((c) => c.class === "uncovered");
    expect(uncovered).toBeTruthy();
    expect(uncovered!.areaPct).toBeCloseTo(0.3, 6);
    // soil share is against BLOCK area, not the intersection sum
    expect(out.components.find((c) => c.mukey === "1")!.areaPct).toBeCloseTo(0.7, 6);
  });

  it("> 1+ε -> over; flagged, NOT normalized away", () => {
    const out = computeSoilComposition({
      composition: [comp("1", "A", "Well drained", "4", 0.8e-4), comp("2", "B", "Well drained", "4", 0.8e-4)], // covered = 1.6
      properties: [],
      blockAreaSqM: 40000,
    });
    expect(out.coverageState).toBe("over");
    expect(out.coveredPct).toBeGreaterThan(1 + COVERAGE_EPSILON);
  });

  it("0 rows -> none", () => {
    expect(computeSoilComposition({ composition: [], properties: [], blockAreaSqM: 40000 }).coverageState).toBe("none");
  });

  it("single map unit is a valid answer (100% one soil)", () => {
    const out = computeSoilComposition({ composition: [comp("1", "Lima loam", "Well drained", "4.6", 1e-4)], properties: [prop("1", "c", "Lima", "100", "Yes", "tax", "6.5", "80")], blockAreaSqM: 40000 });
    expect(out.coverageState).toBe("covered");
    expect(out.components.filter((c) => c.class !== "uncovered")).toHaveLength(1);
    expect(out.components[0].areaPct).toBeCloseTo(1, 6);
  });

  it("[C8] sub-1% sliver is marked belowFloor but its mukey + properties stay in the JSON", () => {
    const out = computeSoilComposition({
      composition: [comp("1", "Lima loam", "Well drained", "4.6", 0.997e-4), comp("2", "Touchet silt loam", "Well drained", "3", 0.003e-4)],
      properties: [prop("1", "c1", "Lima", "90", "Yes", "tax", "6.5", "80"), prop("2", "c2", "Touchet", "90", "Yes", "tax", "7.1", "60")],
      blockAreaSqM: 40000,
    });
    const sliver = out.components.find((c) => c.mukey === "2")!;
    expect(sliver.areaPct).toBeLessThan(SHARE_FLOOR);
    expect(sliver.belowFloor).toBe(true);
    expect(sliver.ph).toBe(7.1); // properties retained, not dropped
    expect(out.components.some((c) => c.mukey === "2")).toBe(true);
  });

  it("[C2] one mukey with many components/horizons -> a SINGLE area contribution, major-component property", () => {
    // The property table has 3 components for the mukey; the core must NOT multiply the area, and must
    // take the dominant MAJOR component's pH (Chippewa 85%, pH 5.4), not a minor's.
    const out = computeSoilComposition({
      composition: [comp("1407752", "Chippewa silt loam", "Poorly drained", "6", 1e-4)],
      properties: [
        prop("1407752", "c1", "Chippewa", "85", "Yes", "Typic Fragiaquepts", "5.4", "38"),
        prop("1407752", "c2", "Chippewa", "10", "No", "Typic Fragiaquepts", "5.4", "38"),
        prop("1407752", "c3", "Volusia", "5", "No", "Aeric Fragiaquepts", "6", "43"),
      ],
      blockAreaSqM: 40000,
    });
    const soils = out.components.filter((c) => c.class !== "uncovered");
    expect(soils).toHaveLength(1); // single area contribution, not 3
    expect(soils[0].areaPct).toBeCloseTo(1, 6);
    expect(soils[0].ph).toBe(5.4);
    expect(soils[0].comppct).toBe(85);
    expect(soils[0].restrictiveDepthCm).toBe(38);
  });

  it("water map unit: drainage/pH/AWC left null (never presented as a soil property)", () => {
    const out = computeSoilComposition({
      composition: [comp("3250410", "Water", "", "", 1e-4)],
      properties: [prop("3250410", "c", "Water", "100", "Yes", null, null, null)],
      blockAreaSqM: 40000,
    });
    const w = out.components[0];
    expect(w.class).toBe("water");
    expect(w.ph).toBeNull();
    expect(w.drainageClass).toBeNull();
    expect(w.awc).toBeNull();
  });
});

describe("wkt-core — injection-safe, all rings, axis order", () => {
  const validPoly = (input: unknown): VineyardPolygon => {
    const r = validateVineyardPolygon(input);
    if (!r.ok) throw new Error(`fixture invalid: ${r.code}`);
    return r.value;
  };

  it("emits 'lng lat' order (GeoJSON [lng,lat] -> WKT lng lat)", () => {
    const poly = validPoly({ type: "Polygon", coordinates: [[[-77.05, 42.55], [-77.04, 42.55], [-77.04, 42.56], [-77.05, 42.56], [-77.05, 42.55]]] });
    const wkt = toWkt(poly);
    expect(wkt.startsWith("POLYGON((")).toBe(true);
    expect(wkt).toContain("-77.05 42.55"); // lng first, lat second
    expect(wkt).not.toContain("42.55 -77.05");
  });

  it("[donut] emits ALL rings so a hole is subtracted, not ignored", () => {
    const outer = [[-77.06, 42.54], [-77.03, 42.54], [-77.03, 42.57], [-77.06, 42.57], [-77.06, 42.54]];
    const hole = [[-77.05, 42.55], [-77.05, 42.56], [-77.04, 42.56], [-77.04, 42.55], [-77.05, 42.55]];
    const wkt = toWkt(validPoly({ type: "Polygon", coordinates: [outer, hole] }));
    expect((wkt.match(/\(\(/g) || []).length + (wkt.match(/\),\s*\(/g) || []).length).toBeGreaterThan(0);
    expect(wkt).toContain("-77.04 42.56"); // a hole vertex is present
  });

  it("blockAreaSqM returns a plausible geodesic area for a ~1 km × ~1 km block (deg-scale sanity)", () => {
    // 0.01deg lat ~ 1.11km; 0.01deg lng at 42.5N ~ 0.82km -> ~0.9 km^2 ~ 9e5 m^2
    const area = blockAreaSqM(validPoly({ type: "Polygon", coordinates: [[[-77.05, 42.55], [-77.04, 42.55], [-77.04, 42.56], [-77.05, 42.56], [-77.05, 42.55]]] }));
    expect(area).toBeGreaterThan(7e5);
    expect(area).toBeLessThan(1.1e6);
  });
});

describe("sda-query — injection guard", () => {
  it("[injection] buildPropertyQuery refuses a non-numeric mukey", () => {
    expect(() => buildPropertyQuery(["1407835"])).not.toThrow();
    expect(() => buildPropertyQuery(["1'; DROP TABLE mapunit;--"])).toThrow(/non-numeric/);
    expect(isValidMukey("1407835")).toBe(true);
    expect(isValidMukey("abc")).toBe(false);
  });
  it("composition query embeds MakeValid on every spatial method (council C6)", () => {
    const q = buildCompositionQuery("POLYGON((0 0, 1 0, 1 1, 0 0))");
    expect((q.match(/MakeValid\(\)/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(q).toContain("STIntersects");
    expect(q).toContain("block_sqdeg");
  });
});
