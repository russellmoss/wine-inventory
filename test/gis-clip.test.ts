import { describe, it, expect } from "vitest";
import proj4 from "proj4";
import { toWgsPolygons, pointInAnyPolygon, blockCoverageMask } from "@/lib/gis/clip";

const MERC = "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs";
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

// A ~0.01°×0.01° square block near Napa.
const BLOCK = {
  type: "Polygon",
  coordinates: [[[-122.41, 38.44], [-122.40, 38.44], [-122.40, 38.45], [-122.41, 38.45], [-122.41, 38.44]]],
};

describe("clip: block coverage mask", () => {
  it("normalizes a GeoJSON Polygon into rings", () => {
    const polys = toWgsPolygons(BLOCK);
    expect(polys).toHaveLength(1);
    expect(polys[0].rings[0].length).toBe(5);
  });

  it("point-in-polygon: inside vs outside", () => {
    const polys = toWgsPolygons(BLOCK);
    expect(pointInAnyPolygon(-122.405, 38.445, polys)).toBe(true); // centre
    expect(pointInAnyPolygon(-122.50, 38.445, polys)).toBe(false); // west, outside
    expect(pointInAnyPolygon(-122.405, 38.50, polys)).toBe(false); // north, outside
  });

  it("empty polygons → all-ones mask (unclipped fallback)", () => {
    const m = blockCoverageMask(0, 0, 10, 4, 4, []);
    expect(Array.from(m).every((v) => v === 1)).toBe(true);
  });

  it("masks a 3857 grid to the block: inside=1, outside=0", () => {
    // Build a 3857 grid centred on the block, wide enough to include area OUTSIDE the block.
    const polys = toWgsPolygons(BLOCK);
    // NW corner of the grid at (−122.42, 38.46), covering ~0.03° each way.
    const [x0, y1] = proj4(WGS84, MERC, [-122.42, 38.46]) as [number, number]; // NW → min X, max Y
    const [x1] = proj4(WGS84, MERC, [-122.39, 38.46]) as [number, number];
    const px = (x1 - x0) / 30;
    const mask = blockCoverageMask(x0, y1, px, 30, 30, polys);
    const inCount = Array.from(mask).filter((v) => v > 0).length;
    // Some pixels inside the block, but NOT all (the grid is bigger than the block).
    expect(inCount).toBeGreaterThan(0);
    expect(inCount).toBeLessThan(30 * 30);
  });
});
