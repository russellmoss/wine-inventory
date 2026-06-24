import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { serializeBlock, serializeDetail, type RawBlock } from "@/lib/vineyard/data";

const baseBlock: RawBlock = {
  id: "blk1",
  vineyardId: "vy1",
  blockLabel: "Block 1",
  numRows: 40,
  rowSpacingM: new Prisma.Decimal("2.1336"),
  vineSpacingM: new Prisma.Decimal("1.5240"),
  varietyId: "var1",
  clone: "115",
  rootstock: "3309C",
  vineCount: 1245,
  yearPlanted: 2018,
  irrigated: true,
  polygon: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
  color: null,
  sortOrder: 0,
  variety: { id: "var1", name: "Merlot", color: "#6B484D" },
};

describe("serializeBlock", () => {
  it("maps Decimal spacing to number, preserving precision", () => {
    const s = serializeBlock(baseBlock);
    expect(s.rowSpacingM).toBeCloseTo(2.1336, 6);
    expect(s.vineSpacingM).toBeCloseTo(1.524, 6);
    expect(typeof s.rowSpacingM).toBe("number");
  });

  it("passes GeoJSON polygon geometry through untouched", () => {
    const s = serializeBlock(baseBlock);
    expect(s.polygon).toEqual({
      type: "Polygon",
      coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]],
    });
  });

  it("keeps the joined variety { id, name, color }", () => {
    const s = serializeBlock(baseBlock);
    expect(s.variety).toEqual({ id: "var1", name: "Merlot", color: "#6B484D" });
  });

  it("handles null spacing / missing variety / missing polygon", () => {
    const s = serializeBlock({
      ...baseBlock,
      rowSpacingM: null,
      vineSpacingM: null,
      polygon: null,
      variety: null,
    });
    expect(s.rowSpacingM).toBeNull();
    expect(s.vineSpacingM).toBeNull();
    expect(s.polygon).toBeNull();
    expect(s.variety).toBeNull();
  });

  it("accepts plain numbers and strings too (DB-agnostic)", () => {
    const s = serializeBlock({ ...baseBlock, rowSpacingM: 2.5, vineSpacingM: "1.8" });
    expect(s.rowSpacingM).toBe(2.5);
    expect(s.vineSpacingM).toBe(1.8);
  });
});

describe("serializeDetail", () => {
  it("maps lat/lng/elevation Decimals to numbers", () => {
    const s = serializeDetail({
      id: "d1",
      vineyardId: "vy1",
      gpsLat: new Prisma.Decimal("27.472600"),
      gpsLng: new Prisma.Decimal("89.639200"),
      elevationM: new Prisma.Decimal("2300.00"),
      soilType: "schist",
      manager: "Dorji",
      defaultUnit: "imperial",
    });
    expect(s.gpsLat).toBeCloseTo(27.4726, 6);
    expect(s.gpsLng).toBeCloseTo(89.6392, 6);
    expect(s.elevationM).toBe(2300);
    expect(s.soilType).toBe("schist");
  });

  it("handles all-null optional metadata", () => {
    const s = serializeDetail({
      id: "d1",
      vineyardId: "vy1",
      gpsLat: null,
      gpsLng: null,
      elevationM: null,
      soilType: null,
      manager: null,
      defaultUnit: "metric",
    });
    expect(s.gpsLat).toBeNull();
    expect(s.elevationM).toBeNull();
    expect(s.defaultUnit).toBe("metric");
  });
});
