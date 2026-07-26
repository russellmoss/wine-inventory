/**
 * Vineyard Intelligence P1 — the governed map layer-stack contract (brief §13.1).
 *
 * PURE: types + a pure resolver. No React, no Leaflet. This is the shared surface P2/P3 (raster NDVI)
 * and P4 (soil overlay) EXTEND rather than forking `SatelliteMap`. P1 renders only `kind: "vector"`;
 * the `kind: "raster"` arm is defined now (so consumers can pattern-match) and wired into the component
 * in P3 via `render.ts` `leafletBounds` + a Leaflet `ImageOverlay`.
 */
import type { VineyardPolygon } from "./geometry";

/** GeoJSON-ish feature collection an overlay carries (kept structural; Leaflet reads it directly). */
export type OverlayFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; geometry: VineyardPolygon; properties?: Record<string, unknown> }>;
};

export type VectorStyle = {
  color: string; // stroke
  weight?: number;
  fillColor?: string;
  fillOpacity?: number;
  dashArray?: string;
};

export type LegendEntry = { label: string; color: string };
export type LegendModel = {
  title: string;
  entries: LegendEntry[];
  /** e.g. "drawn 2026-07-24 · v3" — provenance the legend must always carry (brief §2, §6.2). */
  note?: string;
};

export type MapOverlay =
  | {
      kind: "vector";
      id: string;
      data: OverlayFeatureCollection;
      style: VectorStyle;
      legend?: LegendModel;
      /** Optional short label (e.g. a soil map-unit symbol) painted at the overlay's centroid. */
      label?: string;
    }
  | {
      kind: "raster";
      id: string;
      tileUrl?: string; // P3: a tiles endpoint …
      imageUrl?: string; // … or a single ImageOverlay PNG (the no-worker path)
      bounds: [number, number, number, number]; // WGS84 [minLon,minLat,maxLon,maxLat]
      opacity: number;
      resampling: "nearest" | "bilinear" | "cubic";
      legend?: LegendModel;
    };

/** A layer in the governed stack: an overlay plus its display state + provenance. */
export type StackLayer = {
  overlay: MapOverlay;
  visible: boolean;
  zIndex: number;
  provenance?: string;
  effectiveDate?: string;
  /** freshness/quality signal the UI can badge (e.g. "stale after boundary edit"). */
  quality?: "ok" | "stale" | "pending";
};

export type LayerStack = { layers: StackLayer[] };

/**
 * PURE: resolve a layer stack into the ordered, visible overlays a map should paint (ascending zIndex).
 * Hidden layers drop out. Stable sort keeps declaration order among equal zIndex.
 */
export function resolveLayerStack(stack: LayerStack): MapOverlay[] {
  return stack.layers
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.visible)
    .sort((a, b) => a.l.zIndex - b.l.zIndex || a.i - b.i)
    .map(({ l }) => l.overlay);
}

/** PURE convenience: wrap planting/block polygons into a vector overlay for the stack. */
export function polygonsToVectorOverlay(
  id: string,
  polygons: Array<{ geometry: VineyardPolygon; properties?: Record<string, unknown> }>,
  style: VectorStyle,
  legend?: LegendModel,
): MapOverlay {
  return {
    kind: "vector",
    id,
    data: {
      type: "FeatureCollection",
      features: polygons.map((p) => ({ type: "Feature", geometry: p.geometry, properties: p.properties })),
    },
    style,
    legend,
  };
}
