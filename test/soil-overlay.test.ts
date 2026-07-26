import { describe, it, expect } from "vitest";
import { wktToPolygon, soilDisplayFromRows } from "@/lib/soil/wkt-parse";
import { buildSoilOverlays } from "@/lib/soil/overlay-core";
import type { SoilComponent } from "@/lib/soil/schema";

const comp = (mukey: string, muname: string, klass: SoilComponent["class"], areaPct: number, belowFloor = false): SoilComponent => ({
  mukey, muname, class: klass, areaPct, areaSqM: areaPct * 40000, comppct: 85, drainageClass: null, drainageBasis: null, awc: null, awcUnit: null, ph: null, phBasis: null, restrictiveDepthCm: null, belowFloor,
});

describe("wkt-parse — SDA clipped-geometry WKT → GeoJSON", () => {
  it("parses a POLYGON preserving lng lat order", () => {
    const g = wktToPolygon("POLYGON ((-77.05 42.55, -77.04 42.55, -77.04 42.56, -77.05 42.56, -77.05 42.55))");
    expect(g?.type).toBe("Polygon");
    expect(g && g.type === "Polygon" && g.coordinates[0][0]).toEqual([-77.05, 42.55]); // [lng, lat]
  });
  it("parses a POLYGON with a hole (two rings)", () => {
    const g = wktToPolygon("POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0),(1 1, 1 2, 2 2, 2 1, 1 1))");
    expect(g?.type).toBe("Polygon");
    expect(g && g.type === "Polygon" && g.coordinates.length).toBe(2);
  });
  it("parses a MULTIPOLYGON", () => {
    const g = wktToPolygon("MULTIPOLYGON (((0 0, 1 0, 1 1, 0 1, 0 0)),((2 2, 3 2, 3 3, 2 3, 2 2)))");
    expect(g?.type).toBe("MultiPolygon");
    expect(g && g.type === "MultiPolygon" && g.coordinates.length).toBe(2);
  });
  it("returns null for EMPTY / non-polygon geometry (dropped, never rendered wrong)", () => {
    expect(wktToPolygon("POLYGON EMPTY")).toBeNull();
    expect(wktToPolygon("GEOMETRYCOLLECTION EMPTY")).toBeNull();
    expect(wktToPolygon("POINT (1 2)")).toBeNull();
    expect(wktToPolygon(null)).toBeNull();
  });
  it("soilDisplayFromRows groups rows into a FeatureCollection and drops unparseable", () => {
    const fc = soilDisplayFromRows([
      { mukey: "1", wkt: "POLYGON ((0 0, 1 0, 1 1, 0 1, 0 0))" },
      { mukey: "1", wkt: "POLYGON EMPTY" }, // dropped
      { mukey: "2", wkt: "POLYGON ((2 2, 3 2, 3 3, 2 3, 2 2))" },
    ]);
    expect(fc?.features.length).toBe(2);
    expect(fc?.features.map((f) => f.properties.mukey)).toEqual(["1", "2"]);
    expect(soilDisplayFromRows([{ mukey: "1", wkt: "POLYGON EMPTY" }])).toBeNull();
  });
});

describe("overlay-core — one colored vector overlay per map unit + legend", () => {
  const geom = soilDisplayFromRows([
    { mukey: "1", wkt: "POLYGON ((0 0, 1 0, 1 1, 0 1, 0 0))" },
    { mukey: "2", wkt: "POLYGON ((2 2, 3 2, 3 3, 2 3, 2 2))" },
    { mukey: "W", wkt: "POLYGON ((4 4, 5 4, 5 5, 4 5, 4 4))" },
  ]);
  const components = [comp("1", "Mardin", "soil", 0.6), comp("2", "Volusia", "soil", 0.3), comp("W", "Water", "water", 0.1)];

  it("builds one vector overlay per mukey that has geometry, water in a distinct blue", () => {
    const r = buildSoilOverlays({ blockId: "blk", components, displayGeometry: geom });
    expect(r).toBeTruthy();
    expect(r!.overlays.length).toBe(3);
    expect(r!.overlays.every((o) => o.kind === "vector")).toBe(true);
    const waterOverlay = r!.overlays.find((o) => o.id.endsWith(":W"))!;
    expect(waterOverlay.kind === "vector" && waterOverlay.style.color).toBe("#0072B2"); // WATER_COLOR
    // the two soils get DIFFERENT palette colors
    const soilColors = r!.overlays.filter((o) => !o.id.endsWith(":W")).map((o) => (o.kind === "vector" ? o.style.color : ""));
    expect(new Set(soilColors).size).toBe(2);
  });

  it("legend labels carry share + soil name, ordered largest-first", () => {
    const r = buildSoilOverlays({ blockId: "blk", components, displayGeometry: geom })!;
    expect(r.legend.entries[0].label).toContain("Mardin");
    expect(r.legend.entries[0].label).toContain("60%");
    expect(r.legend.title).toBe("Soil (NRCS SSURGO)");
  });

  it("returns null when the snapshot has no display geometry", () => {
    expect(buildSoilOverlays({ blockId: "blk", components, displayGeometry: null })).toBeNull();
  });

  it("skips map units that have no geometry feature", () => {
    const partial = soilDisplayFromRows([{ mukey: "1", wkt: "POLYGON ((0 0, 1 0, 1 1, 0 1, 0 0))" }]);
    const r = buildSoilOverlays({ blockId: "blk", components, displayGeometry: partial })!;
    expect(r.overlays.length).toBe(1);
    expect(r.overlays[0].id).toContain(":1");
  });
});
