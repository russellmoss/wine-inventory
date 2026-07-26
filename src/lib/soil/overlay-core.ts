/**
 * Vineyard Intelligence P4 (soil overlay) — turn a stored snapshot into colored map overlays.
 *
 * PURE: no React, no Leaflet. Builds ONE `kind:"vector"` MapOverlay per map unit (each with its own
 * color) so the soil layer paints per-map-unit colors through P1's governed `overlays` prop WITHOUT
 * touching `SatelliteMap` internals. Non-soil (water) gets a fixed distinct blue; ordinary soils cycle a
 * color-vision-safe categorical palette (Okabe–Ito). A combined `LegendModel` maps color → soil + share.
 */
import type { LegendModel, MapOverlay, VectorStyle } from "../gis/overlay";
import type { SoilComponent } from "./schema";
import type { SoilDisplayGeometry } from "./wkt-parse";

// Okabe–Ito color-vision-safe categorical palette (skips its blue/black — reserved below).
const SOIL_PALETTE = ["#E69F00", "#009E73", "#D55E00", "#CC79A7", "#F0E442", "#56B4E9", "#999933", "#882255"];
const WATER_COLOR = "#0072B2"; // distinct blue — never a soil
const NONSOIL_COLOR = "#7F7F7F"; // grey — rock/urban/pit/not-surveyed

function styleFor(color: string): VectorStyle {
  return { color, weight: 1, fillColor: color, fillOpacity: 0.45 };
}

export type SoilOverlayResult = { overlays: MapOverlay[]; legend: LegendModel };

/** Build the soil map overlays + legend for a block, or null if the snapshot carries no display geometry. */
export function buildSoilOverlays(input: {
  blockId: string;
  components: SoilComponent[];
  displayGeometry: SoilDisplayGeometry | null;
  pulledLabel?: string;
}): SoilOverlayResult | null {
  const geom = input.displayGeometry;
  if (!geom || geom.features.length === 0) return null;

  const byMukey = new Map<string, SoilDisplayGeometry["features"]>();
  for (const f of geom.features) {
    const list = byMukey.get(f.properties.mukey) ?? [];
    list.push(f);
    byMukey.set(f.properties.mukey, list);
  }

  const overlays: MapOverlay[] = [];
  const legendEntries: LegendModel["entries"] = [];
  let soilIdx = 0;

  // Components are already largest-share-first; colour + legend follow that order.
  for (const c of input.components) {
    if (c.class === "uncovered") continue;
    const feats = byMukey.get(c.mukey);
    if (!feats || feats.length === 0) continue;
    const color = c.class === "water" ? WATER_COLOR : c.class === "non-soil" ? NONSOIL_COLOR : SOIL_PALETTE[soilIdx++ % SOIL_PALETTE.length];
    overlays.push({
      kind: "vector",
      id: `soil:${input.blockId}:${c.mukey}`,
      data: { type: "FeatureCollection", features: feats },
      style: styleFor(color),
    });
    const share = `${(c.areaPct * 100).toFixed(c.areaPct < 0.1 ? 1 : 0)}%`;
    legendEntries.push({ label: `${share} · ${c.muname}`, color });
  }

  if (overlays.length === 0) return null;
  return {
    overlays,
    legend: { title: "Soil (NRCS SSURGO)", entries: legendEntries, note: input.pulledLabel },
  };
}
