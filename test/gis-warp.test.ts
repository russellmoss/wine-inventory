import { describe, it, expect } from "vitest";
import proj4 from "proj4";
import { warpToDisplayGrid, utmDefFromEpsg, gridConvergenceDeg, type SourceGeotransform } from "@/lib/gis/warp";
import { NO_DATA, isNoData } from "@/lib/gis/ndvi";
import type { Grid } from "@/lib/gis/smooth";

const MERC_3857 =
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs";
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

/**
 * A synthetic 5×5 UTM raster placed AWAY from the zone central meridian so the grid-convergence angle
 * is non-trivial (this is precisely the condition that misregisters a flat overlay). UTM 18N, EPSG 32618
 * (central meridian 75°W); we sit near 73°W, ~2° east → γ ≈ 1.2°.
 */
function syntheticScene(): { src: Grid; geo: SourceGeotransform; utmDef: string } {
  const crsEpsg = 32618;
  const utmDef = utmDefFromEpsg(crsEpsg);
  // Anchor origin at a real UTM location near lon −73, lat 41.
  const [ox, oy] = proj4(WGS84, utmDef, [-73.0, 41.0]) as [number, number];
  const originX = Math.round(ox);
  const originY = Math.round(oy) + 50; // top edge (axisYSign −1); +50 so the 5×50 m grid straddles the anchor
  const geo: SourceGeotransform = { crsEpsg, originX, originY, pixelSizeM: 10, axisYSign: -1 };
  const values = new Float64Array(25).fill(NO_DATA);
  return { src: { width: 5, height: 5, values }, geo, utmDef };
}

/** The absolute UTM centre of source pixel (row, col) under a −1 (row-0-north) geotransform. */
function pixelCenterUtm(geo: SourceGeotransform, row: number, col: number): [number, number] {
  const e = geo.originX + (col + 0.5) * geo.pixelSizeM;
  const n = geo.axisYSign === -1 ? geo.originY - (row + 0.5) * geo.pixelSizeM : geo.originY + (row + 0.5) * geo.pixelSizeM;
  return [e, n];
}

describe("warp: UTM → north-up 3857 display grid", () => {
  it("grid convergence at the test location is non-trivial (the reason a flat overlay misregisters)", () => {
    const { utmDef } = syntheticScene();
    const gamma = Math.abs(gridConvergenceDeg(utmDef, -73.0, 41.0));
    // ~1.2° here; a flat (unwarped) overlay would rotate the raster by this much → ~10 m at the corners.
    expect(gamma).toBeGreaterThan(0.5);
    expect(gamma).toBeLessThan(3);
  });

  it("REGISTRATION GATE: a marked source pixel lands in the geographically-correct 3857 output cell (sub-pixel)", () => {
    const { src, geo } = syntheticScene();
    const MARK = 0.9;
    const mr = 1;
    const mc = 3; // an off-centre pixel so a rotation error would move it measurably
    src.values[mr * src.width + mc] = MARK;

    const out = warpToDisplayGrid(src, geo);

    // Where SHOULD the marked pixel be? Its true UTM centre → WGS84 → 3857 → output cell index.
    const [e0, n0] = pixelCenterUtm(geo, mr, mc);
    const [lon, lat] = proj4(utmDefFromEpsg(geo.crsEpsg), WGS84, [e0, n0]) as [number, number];
    const [x3857, y3857] = proj4(WGS84, MERC_3857, [lon, lat]) as [number, number];
    const cTrue = Math.floor((x3857 - out.originX) / out.pixelSizeM);
    const rTrue = Math.floor((out.originY - y3857) / out.pixelSizeM);

    // The warp must place the marked value at exactly the geographically-correct output cell.
    expect(out.grid.values[rTrue * out.grid.width + cTrue]).toBe(MARK);

    // And the residual between that output cell's centre (back to UTM) and the true source-pixel centre
    // is sub-pixel — proof there is no systematic offset (a flat overlay would be off by the ~10 m γ term).
    const cellX = out.originX + (cTrue + 0.5) * out.pixelSizeM;
    const cellY = out.originY - (rTrue + 0.5) * out.pixelSizeM;
    const [clon, clat] = proj4(MERC_3857, WGS84, [cellX, cellY]) as [number, number];
    const [ce, cn] = proj4(WGS84, utmDefFromEpsg(geo.crsEpsg), [clon, clat]) as [number, number];
    const residualM = Math.hypot(ce - e0, cn - n0);
    expect(residualM).toBeLessThan(geo.pixelSizeM); // < 10 m, i.e. sub-pixel
  });

  it("a no-data hole in the source never bleeds — the warp invents no values", () => {
    const { src, geo } = syntheticScene();
    src.values.fill(0.5); // fully valid...
    const hr = 2;
    const hc = 2;
    src.values[hr * src.width + hc] = NO_DATA; // ...except one interior hole
    const out = warpToDisplayGrid(src, geo);

    // The output cell that samples the holed source pixel must stay NO_DATA (nearest, no interpolation).
    const [e0, n0] = pixelCenterUtm(geo, hr, hc);
    const [lon, lat] = proj4(utmDefFromEpsg(geo.crsEpsg), WGS84, [e0, n0]) as [number, number];
    const [x3857, y3857] = proj4(WGS84, MERC_3857, [lon, lat]) as [number, number];
    const cHole = Math.floor((x3857 - out.originX) / out.pixelSizeM);
    const rHole = Math.floor((out.originY - y3857) / out.pixelSizeM);
    expect(isNoData(out.grid.values[rHole * out.grid.width + cHole])).toBe(true);

    // A valid neighbour is still painted (the hole didn't wipe the scene).
    const validCount = out.grid.values.reduce((k, v) => (isNoData(v) ? k : k + 1), 0);
    expect(validCount).toBeGreaterThan(0);
  });

  it("emits a well-ordered WGS84 bbox and a north-up geotransform", () => {
    const { src, geo } = syntheticScene();
    const out = warpToDisplayGrid(src, geo);
    const [minLon, minLat, maxLon, maxLat] = out.wgs84Bbox;
    expect(minLon).toBeLessThan(maxLon);
    expect(minLat).toBeLessThan(maxLat);
    expect(out.axisYSign).toBe(-1);
    expect(out.crsEpsg).toBe(3857);
    expect(out.grid.width).toBeGreaterThan(0);
    expect(out.grid.height).toBeGreaterThan(0);
  });

  it("rejects a non-UTM EPSG", () => {
    expect(() => utmDefFromEpsg(4326)).toThrow();
    expect(() => utmDefFromEpsg(3857)).toThrow();
  });
});
