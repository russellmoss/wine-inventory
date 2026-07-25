import "server-only";

/**
 * Vineyard Intelligence P3 — the NDVI display render core (Unit 7 logic; the route + verify both call this).
 *
 * Given a dataset + a resolved style, produce the overlay PNG (warped, registered) + the legend metadata
 * (domain, value histogram, WGS84 bbox, badges). Kept out of the HTTP handler so `verify:ndvi-display` can
 * prove the whole render chain under `runAsTenant` without a live request (the route is a thin auth wrapper).
 */
import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import { ensureDisplayDerivative, DISPLAY_RECIPE_VERSION } from "./display-derivative-core";
import { getPrivateDerivativeBytes } from "@/lib/gis/satellite/raster-store";
import { bytesToInt16, dequantizeFromInt16 } from "@/lib/gis/quantize";
import { resolveDomain, toWeightedSamples, type ResolvedDomain } from "@/lib/gis/domain";
import { ndviHistogram, type NdviHistogram } from "@/lib/gis/histogram";
import { rasterToRgba } from "@/lib/gis/render";
import { PALETTES, VIGOR_CLASSIC, reversePalette, buildPaletteLut, type ColorScaleMode, type Palette, type ColorStop } from "@/lib/gis/color";
import { encodePng } from "@/lib/gis/png";

export type DisplayStyle = {
  readonly mode: ColorScaleMode;
  readonly paletteId?: string;
  readonly reverse?: boolean;
  readonly opacity?: number;
  readonly percentileLow?: number;
  readonly percentileHigh?: number;
  /** ABSOLUTE / CUSTOM / locked-comparison fixed bounds. */
  readonly fixedMin?: number;
  readonly fixedMax?: number;
  /** CUSTOM palette stops (overrides paletteId when present). */
  readonly customStops?: ColorStop[] | null;
};

export type DisplayMeta = {
  readonly datasetId: string;
  readonly recipeVersion: number;
  readonly width: number;
  readonly height: number;
  readonly pixelSizeM: number;
  readonly sourceResolutionM: number;
  readonly wgs84Bbox: [number, number, number, number] | null;
  readonly acquiredAt: string | null;
  readonly domain: ResolvedDomain;
  readonly histogram: NdviHistogram;
  readonly validPixelCount: number;
};

export type DisplayRender = { readonly png: Uint8Array; readonly meta: DisplayMeta; readonly etag: string };

function resolvePalette(style: DisplayStyle): Palette {
  if (style.customStops && style.customStops.length >= 2) {
    const base: Palette = { id: "custom", label: "Custom", colorVisionSafe: false, stops: style.customStops };
    return style.reverse ? reversePalette(base) : base;
  }
  const found = PALETTES.find((p) => p.id === style.paletteId) ?? VIGOR_CLASSIC;
  return style.reverse ? reversePalette(found) : found;
}

function etagFor(datasetId: string, style: DisplayStyle): string {
  const key = JSON.stringify({
    d: datasetId,
    v: DISPLAY_RECIPE_VERSION,
    m: style.mode,
    p: style.paletteId ?? null,
    r: !!style.reverse,
    o: style.opacity ?? 1,
    lo: style.percentileLow ?? null,
    hi: style.percentileHigh ?? null,
    fn: style.fixedMin ?? null,
    fx: style.fixedMax ?? null,
    cs: style.customStops ?? null,
  });
  return `"${createHash("sha256").update(key).digest("hex").slice(0, 24)}"`;
}

/** Load the derivative + dequantized values + resolved domain + histogram + meta ONCE (one blob read). */
async function loadDisplay(datasetId: string, style: DisplayStyle): Promise<{
  values: Float64Array;
  width: number;
  height: number;
  domain: ResolvedDomain;
  meta: DisplayMeta;
}> {
  const derivative = await ensureDisplayDerivative(datasetId);
  const bytes = await getPrivateDerivativeBytes(derivative.blobUrl as string);
  if (!bytes) throw new Error(`ndvi-display: derivative blob missing for dataset ${datasetId}`);
  const values = dequantizeFromInt16(bytesToInt16(bytes), derivative.quantScale, derivative.noDataSentinel);
  const width = derivative.gridWidth ?? 0;
  const height = derivative.gridHeight ?? 0;

  const samples = toWeightedSamples(values);
  const domain = resolveDomain({
    mode: style.mode,
    pixels: samples,
    percentileLow: style.percentileLow,
    percentileHigh: style.percentileHigh,
    fixed: style.fixedMin != null && style.fixedMax != null ? { min: style.fixedMin, max: style.fixedMax } : undefined,
  });
  const histogram = ndviHistogram(samples, domain);

  const dataset = await prisma.spatialDataset.findUnique({ where: { id: datasetId }, select: { sceneId: true } });
  let acquiredAt: string | null = null;
  if (dataset) {
    const scene = await prisma.spatialScene.findUnique({ where: { id: dataset.sceneId }, select: { acquiredAt: true } });
    acquiredAt = scene?.acquiredAt.toISOString() ?? null;
  }

  const meta: DisplayMeta = {
    datasetId,
    recipeVersion: derivative.recipeVersion,
    width,
    height,
    pixelSizeM: Number(derivative.pixelSizeM ?? 0),
    sourceResolutionM: 10,
    wgs84Bbox: (derivative.wgs84Bbox as [number, number, number, number] | null) ?? null,
    acquiredAt,
    domain,
    histogram,
    validPixelCount: samples.length,
  };
  return { values, width, height, domain, meta };
}

/** Build the metadata (domain + histogram + bbox + badges) for a dataset under a style — no PNG. */
export async function buildDisplayMeta(datasetId: string, style: DisplayStyle): Promise<DisplayMeta> {
  return (await loadDisplay(datasetId, style)).meta;
}

/** Build the overlay PNG + metadata + ETag for a dataset under a style. */
export async function buildDisplayRender(datasetId: string, style: DisplayStyle): Promise<DisplayRender> {
  const { values, width, height, domain, meta } = await loadDisplay(datasetId, style);
  const palette = resolvePalette(style);
  const lut = buildPaletteLut(palette);
  const rgba = rasterToRgba(values, width, height, domain, palette, { lut, opacity: style.opacity ?? 1 });
  const png = encodePng(rgba.data, width, height);
  return { png, meta, etag: etagFor(datasetId, style) };
}
