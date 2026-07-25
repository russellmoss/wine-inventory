/**
 * Vineyard Intelligence — warp a UTM NDVI raster onto a north-up EPSG:3857 display grid (P3).
 *
 * PURE: no React, no Leaflet, no DOM, no I/O. `proj4` is the one runtime dependency (as in projection.ts).
 *
 * WHY THIS EXISTS — the single load-bearing correctness fix of P3 (council #1, both models agreed).
 * The stored NDVI raster lives on a UTM (metric) grid. The Leaflet basemap is EPSG:3857 web-mercator.
 * Painting the UTM raster as a flat `L.imageOverlay` over its WGS84 bounding box is MISREGISTERED:
 *   - The mercator SCALE curvature across a ~50 ha vineyard is negligible (< 1 mm).
 *   - But UTM grid-north and true north differ by the GRID CONVERGENCE angle γ. Away from the zone's
 *     central meridian γ reaches ~1–2°, which rotates the raster relative to the map by a ~10 m
 *     (≈ one Sentinel-2 pixel) offset at the AOI corners — enough to walk NDVI off block boundaries.
 * A pretty map that is 10 m wrong looks perfect and lies. So we RESAMPLE the raster into a north-up
 * 3857 grid first (nearest-neighbour — display only, invents no data), after which the WGS84 bbox is
 * exact and Leaflet paints it in register. The gate is a sub-pixel REGISTRATION test (see warp.test.ts):
 * histogram/palette/orientation goldens all pass while the raster is misplaced, so only registration catches it.
 *
 * WHY proj4 DIRECTLY, not `Projector.inverse` (council #7). The shared Projector is RECENTRED (it
 * subtracts a whole-metre origin). Feeding it raw absolute UTM easting/northing would be catastrophically
 * wrong. Warp works in ABSOLUTE coordinates end to end, so it composes proj4 EPSG transforms itself.
 */
import proj4 from "proj4";
import { isNoData, NO_DATA } from "./ndvi";
import type { Grid } from "./smooth";

/** EPSG:3857 (web-mercator) as an explicit proj4 definition — no dependence on proj4's built-in registry. */
const MERC_3857 =
  "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs";
const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

/** The source raster's geotransform, in ABSOLUTE UTM metres (as decoded / stored on SpatialDataset). */
export type SourceGeotransform = {
  /** UTM zone EPSG (e.g. 32618). */
  readonly crsEpsg: number;
  /** Grid origin easting (m). Column 0's left edge. */
  readonly originX: number;
  /**
   * Grid origin northing (m). For `axisYSign = -1` (the GeoTIFF norm) this is the TOP edge (max northing,
   * array row 0 = north); for `+1` it is the BOTTOM edge (array row 0 = south).
   */
  readonly originY: number;
  /** Square pixel size (m); 10 m native for Sentinel-2. */
  readonly pixelSizeM: number;
  /** -1 = y-down / row-0-north (GeoTIFF norm); +1 = y-up / row-0-south. */
  readonly axisYSign: number;
};

export type WarpedRaster = {
  /** The warped values on the 3857 grid, row-major, row 0 = north (ImageData top-left). NaN = no-data. */
  readonly grid: Grid;
  readonly crsEpsg: 3857;
  /** NW corner easting in 3857 (m) — min X. */
  readonly originX: number;
  /** NW corner northing in 3857 (m) — max Y (north-up: row 0 is here). */
  readonly originY: number;
  readonly pixelSizeM: number;
  /** Always -1: the display grid is north-up (row 0 = north, y decreases downward). */
  readonly axisYSign: -1;
  /** [minLon, minLat, maxLon, maxLat] — exact once the grid is north-up in 3857. Feeds `leafletBounds`. */
  readonly wgs84Bbox: [number, number, number, number];
};

/** PURE: build the explicit proj4 UTM definition from a UTM EPSG code (326NN north / 327NN south). */
export function utmDefFromEpsg(epsg: number): string {
  const north = epsg >= 32601 && epsg <= 32660;
  const south = epsg >= 32701 && epsg <= 32760;
  if (!north && !south) throw new Error(`warp: crsEpsg ${epsg} is not a WGS84 UTM zone (326NN/327NN)`);
  const zone = epsg % 100;
  return `+proj=utm +zone=${zone} ${north ? "" : "+south "}+datum=WGS84 +units=m +no_defs`;
}

/** PURE: the grid convergence angle γ (degrees) at a lon/lat in a UTM zone — grid-north minus true-north. */
export function gridConvergenceDeg(utmDef: string, lon: number, lat: number): number {
  // γ ≈ atan2( dEast/dLat-step at fixed lon ). Empirically: project a tiny due-north step and read its
  // easting drift. A robust closed form is γ = atan(tan(Δλ)·sin(φ)) with Δλ = lon − centralMeridian, but
  // measuring keeps this independent of parsing the def's central meridian.
  const p0 = proj4(WGS84, utmDef, [lon, lat]) as [number, number];
  const p1 = proj4(WGS84, utmDef, [lon, lat + 1e-4]) as [number, number];
  // A due-north geographic step should point along grid-north; its easting drift encodes γ.
  return (Math.atan2(p1[0] - p0[0], p1[1] - p0[1]) * 180) / Math.PI;
}

/**
 * PURE: warp a UTM NDVI grid onto a north-up EPSG:3857 display grid (nearest-neighbour).
 *
 * Output resolution is chosen to preserve ground resolution: a 3857 "metre" is inflated by sec(latitude),
 * so the output pixel size is `pixelSizeM / cos(latCenter)` — this keeps the output roughly source-sized
 * (no wasteful upsampling) and the ground sampling ≈ the native 10 m.
 */
export function warpToDisplayGrid(src: Grid, geo: SourceGeotransform): WarpedRaster {
  const { width: w, height: h } = src;
  const utmDef = utmDefFromEpsg(geo.crsEpsg);
  const px = geo.pixelSizeM;

  // 1) Source extent in absolute UTM metres.
  const eastMin = geo.originX;
  const eastMax = geo.originX + w * px;
  const northMax = geo.axisYSign === -1 ? geo.originY : geo.originY + h * px;
  const northMin = geo.axisYSign === -1 ? geo.originY - h * px : geo.originY;

  // 2) Project the four UTM corners → 3857 and take their bounding box (covers the mildly-rotated quad).
  const corners: Array<[number, number]> = [
    [eastMin, northMin],
    [eastMin, northMax],
    [eastMax, northMin],
    [eastMax, northMax],
  ];
  let minX3857 = Infinity;
  let minY3857 = Infinity;
  let maxX3857 = -Infinity;
  let maxY3857 = -Infinity;
  let latSum = 0;
  for (const [e, n] of corners) {
    const [lon, lat] = proj4(utmDef, WGS84, [e, n]) as [number, number];
    latSum += lat;
    const [x, y] = proj4(WGS84, MERC_3857, [lon, lat]) as [number, number];
    if (x < minX3857) minX3857 = x;
    if (y < minY3857) minY3857 = y;
    if (x > maxX3857) maxX3857 = x;
    if (y > maxY3857) maxY3857 = y;
  }
  const latCenter = latSum / 4;

  // 3) Output pixel size in 3857 metres (preserve ground resolution) + grid dimensions.
  const p3857 = px / Math.max(0.1, Math.cos((latCenter * Math.PI) / 180));
  const outW = Math.max(1, Math.ceil((maxX3857 - minX3857) / p3857));
  const outH = Math.max(1, Math.ceil((maxY3857 - minY3857) / p3857));

  // 4) Resample: for each output cell centre (3857) → UTM → nearest source pixel.
  const out = new Float64Array(outW * outH).fill(NO_DATA);
  for (let r = 0; r < outH; r++) {
    const y3857 = maxY3857 - (r + 0.5) * p3857; // row 0 = north
    for (let c = 0; c < outW; c++) {
      const x3857 = minX3857 + (c + 0.5) * p3857;
      const [lon, lat] = proj4(MERC_3857, WGS84, [x3857, y3857]) as [number, number];
      const [e, n] = proj4(WGS84, utmDef, [lon, lat]) as [number, number];
      const col = Math.floor((e - geo.originX) / px);
      const row = geo.axisYSign === -1 ? Math.floor((geo.originY - n) / px) : Math.floor((n - geo.originY) / px);
      if (col < 0 || col >= w || row < 0 || row >= h) continue;
      const v = src.values[row * w + col];
      if (!isNoData(v)) out[r * outW + c] = v;
    }
  }

  // 5) Exact WGS84 bbox from the 3857 bbox corners (north-up → axis-aligned, corner-to-corner).
  const [minLon, minLat] = proj4(MERC_3857, WGS84, [minX3857, minY3857]) as [number, number];
  const [maxLon, maxLat] = proj4(MERC_3857, WGS84, [maxX3857, maxY3857]) as [number, number];

  return {
    grid: { width: outW, height: outH, values: out },
    crsEpsg: 3857,
    originX: minX3857,
    originY: maxY3857,
    pixelSizeM: p3857,
    axisYSign: -1,
    wgs84Bbox: [minLon, minLat, maxLon, maxLat],
  };
}
