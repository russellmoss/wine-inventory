"use client";

// Read-only satellite map for a vineyard. Vanilla Leaflet 1.9 (NO react-leaflet —
// react-leaflet v5 needs Leaflet 2.0-alpha, which conflicts with Leaflet-Geoman).
// Esri World Imagery tiles, no API key. The map is imperative by nature (init,
// recolor, fit-bounds, popups), so wrapping it in React would only hide that.
//
// Always loaded via next/dynamic({ ssr:false }) from SatelliteMap.client.tsx —
// Leaflet touches `window`, so it must never run on the server. Leaflet's global
// CSS is imported once in the root layout (App Router only allows global CSS there).
//
// Two modes. Read-only (default): tiles, a location pin, color-coded block
// polygons with permanent labels + detail popups, and auto fit-bounds. Editable
// (`editable`): Leaflet-Geoman drawing/editing with snapping — when an
// `activeBlockId` is set the user draws that block's polygon; existing polygons
// become vertex-editable. Geometry is persisted only on COMMIT (a finished draw,
// or an edit/drag that settles), via `onPolygonSaved`, never on every vertex
// move — one save + one audit row per finished shape.

import React from "react";
import * as L from "leaflet";
// Side-effect import: registers Leaflet-Geoman (`map.pm`, `layer.pm`) on Leaflet
// and augments the `leaflet` type module. Its global CSS is loaded once in the
// root layout, next to leaflet.css (App Router only allows global CSS there).
import "@geoman-io/leaflet-geoman-free";
import { effectiveColor } from "@/lib/vineyard/colors";
import {
  blockArea,
  blockAcres,
  blockHectares,
  formatArea,
  mToFt,
  type Unit,
} from "@/lib/vineyard/units";
import type { SerializedBlock } from "@/lib/vineyard/data";
import {
  GOOGLE_2D_TILE_URL,
  getGoogleAttribution,
  getGoogleMapSession,
} from "@/lib/map/google-tiles";
import { loadWaybackReleases, type WaybackRelease } from "@/lib/map/wayback";

const ESRI_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION = "Esri, Maxar, Earthstar Geographics";

// Google Map Tiles API key (client-exposed by design; restrict by referrer +
// Map Tiles API in Google Cloud). When unset, the map falls back to keyless Esri.
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const MAX_ZOOM = 22;

/** Keyless fallback basemap. maxNativeZoom lets it upscale cleanly past z19. */
function addEsriBasemap(map: L.Map, setBase?: (l: L.TileLayer) => void): L.TileLayer {
  const l = L.tileLayer(ESRI_IMAGERY_URL, {
    attribution: ESRI_ATTRIBUTION,
    maxNativeZoom: 19,
    maxZoom: MAX_ZOOM,
    crossOrigin: true, // let PNG export read the tiles without tainting the canvas
  }).addTo(map);
  setBase?.(l);
  return l;
}

/** Keep the required Google copyright string current as the viewport changes. */
function wireGoogleAttribution(
  map: L.Map,
  key: string,
  session: string,
  isCancelled: () => boolean,
): void {
  let last = "";
  let timer: number | undefined;
  const refresh = async () => {
    const b = map.getBounds();
    const txt = await getGoogleAttribution(
      key,
      session,
      { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() },
      map.getZoom(),
    );
    if (isCancelled() || !txt || txt === last) return;
    if (last) map.attributionControl.removeAttribution(last);
    map.attributionControl.addAttribution(txt);
    last = txt;
  };
  const onMove = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(refresh, 400);
  };
  map.on("moveend", onMove);
  void refresh();
}

/**
 * Add the basemap: Google satellite (sharper, more current) when a key is set,
 * otherwise keyless Esri. If Google tiles never load (bad key / billing off /
 * Map Tiles API not enabled), swap to Esri so the map still works.
 */
async function addBasemap(
  map: L.Map,
  isCancelled: () => boolean,
  setBase: (l: L.TileLayer) => void,
): Promise<void> {
  if (GOOGLE_KEY) {
    try {
      const session = await getGoogleMapSession(GOOGLE_KEY, "satellite");
      if (isCancelled()) return;
      const gl = L.tileLayer(
        `${GOOGLE_2D_TILE_URL}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(GOOGLE_KEY)}`,
        { maxZoom: MAX_ZOOM, tileSize: 256, attribution: "Imagery ©Google", crossOrigin: true },
      );
      let loadedOk = false;
      gl.on("tileload", () => {
        loadedOk = true;
      });
      gl.on("tileerror", () => {
        if (!loadedOk && map.hasLayer(gl)) {
          loadedOk = true; // guard against repeated swaps
          map.removeLayer(gl);
          addEsriBasemap(map, setBase);
        }
      });
      gl.addTo(map);
      setBase(gl);
      wireGoogleAttribution(map, GOOGLE_KEY, session, isCancelled);
      return;
    } catch {
      if (isCancelled()) return;
      // fall through to Esri
    }
  }
  if (!isCancelled()) addEsriBasemap(map, setBase);
}

export interface SatelliteMapProps {
  /** Vineyard GPS in decimal degrees; null when not set. */
  lat: number | null;
  lng: number | null;
  /** Blocks (serialized — Decimals already numbers, polygon is GeoJSON or null). */
  blocks: SerializedBlock[];
  /** Active display unit for popup planted-area readouts. */
  unit: Unit;
  /** Map container height. Defaults to 380px. */
  height?: number | string;
  /**
   * Turn on Leaflet-Geoman drawing/editing. When false (default) the map is
   * read-only and all Geoman controls are disabled.
   */
  editable?: boolean;
  /**
   * The block currently being drawn. When set (and `editable`), polygon-draw
   * mode is on; the finished shape is reported via `onPolygonSaved` for THIS
   * block. Clearing it cancels any in-progress draw.
   */
  activeBlockId?: string | null;
  /**
   * Called once per committed shape: a finished new polygon, or an edit/drag of
   * an existing one. `geometry` is null only when a shape is cleared elsewhere.
   * The consumer persists it (Unit 5 `saveBlockPolygon`); the saved geometry
   * then re-renders through the read-only polygon effect.
   */
  onPolygonSaved?: (blockId: string, geometry: PolygonGeometry | null) => void;
  /**
   * Called when a block's polygon (or its row in the on-map key) is clicked.
   * The consumer opens a detail modal for that block. Suppressed while drawing.
   */
  onBlockClick?: (blockId: string) => void;
  /** Cancel the in-progress draw (clears activeBlockId in the parent). */
  onCancelDraw?: () => void;
  /** Vineyard name — used as the export filename stem and a shapefile attribute. */
  exportName?: string;
  /** Vineyard-level metadata copied onto every exported feature (optional). */
  vineyardMeta?: {
    soilType?: string | null;
    manager?: string | null;
    elevationM?: number | null;
  };
}

/** Minimal GeoJSON Polygon shape (a linear ring of [lng, lat] positions). */
type PolygonGeometry = { type: "Polygon"; coordinates: number[][][] };

function isPolygonGeometry(g: unknown): g is PolygonGeometry {
  if (!g || typeof g !== "object") return false;
  const geo = g as { type?: unknown; coordinates?: unknown };
  if (geo.type !== "Polygon" || !Array.isArray(geo.coordinates)) return false;
  const ring = geo.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) return false;
  return ring.every(
    (pt) =>
      Array.isArray(pt) &&
      pt.length >= 2 &&
      Number.isFinite(pt[0]) &&
      Number.isFinite(pt[1]),
  );
}

/** Warm wine location pin — a divIcon so we never depend on Leaflet's (404-prone) marker assets. */
function makePinIcon(): L.DivIcon {
  return L.divIcon({
    className: "bw-map-pin",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** File-system-safe stem from a vineyard name. */
function slugify(name: string | undefined): string {
  const s = (name ?? "vineyard")
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "vineyard";
}

/** Kick off a client-side download for a data URL or object URL. */
function triggerDownload(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function num(v: number | null | undefined, dp = 4): number | null {
  return v == null || !Number.isFinite(v) ? null : Number(v.toFixed(dp));
}

/**
 * Build a WGS84 GeoJSON FeatureCollection of every block with a drawn polygon,
 * each feature carrying ALL of that block's metadata as DBF-friendly attributes
 * (≤10-char field names; planted area in both acres and hectares regardless of
 * the on-screen unit). This is the attribute table the exported shapefile gets.
 */
function blocksToFeatureCollection(
  blocks: SerializedBlock[],
  meta: SatelliteMapProps["vineyardMeta"],
  vineyardName: string | undefined,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const b of blocks) {
    if (!isPolygonGeometry(b.polygon)) continue;
    features.push({
      type: "Feature",
      geometry: b.polygon as GeoJSON.Polygon,
      properties: {
        vineyard: vineyardName ?? "",
        block: b.blockLabel ?? "",
        variety: b.variety?.name ?? "",
        clone: b.clone ?? "",
        rootstock: b.rootstock ?? "",
        vines: b.vineCount ?? null,
        rows: b.numRows ?? null,
        rowspc_m: num(b.rowSpacingM),
        vinespc_m: num(b.vineSpacingM),
        rowspc_ft: b.rowSpacingM != null ? num(mToFt(b.rowSpacingM)) : null,
        vinespc_ft: b.vineSpacingM != null ? num(mToFt(b.vineSpacingM)) : null,
        yr_plant: b.yearPlanted ?? null,
        irrig: b.irrigated == null ? "" : b.irrigated ? "Yes" : "No",
        acres: num(blockAcres(b.rowSpacingM, b.vineSpacingM, b.vineCount), 3),
        hectares: num(blockHectares(b.rowSpacingM, b.vineSpacingM, b.vineCount), 4),
        color: effectiveColor({ blockColor: b.color, varietyColor: b.variety?.color, varietyId: b.varietyId }),
        varietyid: b.varietyId ?? "",
        soil: meta?.soilType ?? "",
        manager: meta?.manager ?? "",
        elev_m: meta?.elevationM != null ? num(meta.elevationM, 2) : null,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function SatelliteMap({
  lat,
  lng,
  blocks,
  unit,
  height = 380,
  editable = false,
  activeBlockId = null,
  onPolygonSaved,
  onBlockClick,
  onCancelDraw,
  exportName,
  vineyardMeta,
}: SatelliteMapProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // The relative wrapper around the map AND its HTML overlays (key, controls).
  // PNG export captures this, not just the Leaflet container, so the on-map key
  // is included; the filter drops the control chrome.
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const overlayRef = React.useRef<L.FeatureGroup | null>(null);
  const markerRef = React.useRef<L.Marker | null>(null);
  const baseLayerRef = React.useRef<L.TileLayer | null>(null);
  const waybackLayerRef = React.useRef<L.TileLayer | null>(null);
  const historyModeRef = React.useRef(false);
  const [markerVisible, setMarkerVisible] = React.useState(true);

  // Export menu (PNG image / shapefile).
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState<null | "png" | "shp">(null);
  const [exportError, setExportError] = React.useState<string | null>(null);

  // Fullscreen (maximize). Same map instance — we just restyle the frame.
  const [expanded, setExpanded] = React.useState(false);
  const onCancelDrawRef = React.useRef(onCancelDraw);
  React.useEffect(() => {
    onCancelDrawRef.current = onCancelDraw;
  }, [onCancelDraw]);

  // Keep the save callback in a ref so the Geoman effects don't re-run (and
  // tear down draw/edit state) every time the parent passes a new closure.
  const onPolygonSavedRef = React.useRef(onPolygonSaved);
  React.useEffect(() => {
    onPolygonSavedRef.current = onPolygonSaved;
  }, [onPolygonSaved]);

  // Same trick for the click-for-details callback, plus a flag the polygon click
  // handler reads to avoid hijacking clicks while the user is drawing.
  const onBlockClickRef = React.useRef(onBlockClick);
  React.useEffect(() => {
    onBlockClickRef.current = onBlockClick;
  }, [onBlockClick]);
  const drawingRef = React.useRef(false);
  React.useEffect(() => {
    drawingRef.current = editable && activeBlockId != null;
  }, [editable, activeBlockId]);

  // Bridge between the two Geoman effects: the polygon effect tags each editable
  // layer with its block id; the edit effect's map-level commit handler reads it
  // back. lastSaved holds the last persisted geometry per block so an edit that
  // ends unchanged (or a commit event that fires twice) writes nothing — one
  // save + one audit row per finished shape.
  const layerBlockIdRef = React.useRef(new WeakMap<L.Layer, string>());
  const lastSavedRef = React.useRef(new Map<string, string>());

  // Opt-in imagery history (Esri Wayback). Google stays the default basemap.
  const [historyMode, setHistoryMode] = React.useState(false);
  const [releases, setReleases] = React.useState<WaybackRelease[]>([]);
  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  const hasCoords = lat != null && lng != null;
  const hasGeometry = blocks.some((b) => isPolygonGeometry(b.polygon));
  const showMap = hasCoords || hasGeometry;

  // Init once. Cleanup (map.remove) makes React StrictMode's mount→unmount→mount
  // safe: the first map is fully torn down before the second is created.
  React.useEffect(() => {
    if (!showMap) return;
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    let cancelled = false;
    const map = L.map(el, {
      scrollWheelZoom: true,
      attributionControl: true,
      maxZoom: MAX_ZOOM,
    }).setView([20, 0], 2);
    mapRef.current = map;

    // Google satellite when keyed, else keyless Esri (async: needs a session token).
    void addBasemap(map, () => cancelled, (l) => {
      baseLayerRef.current = l;
      // If history mode is already on when the base resolves, keep it hidden.
      if (historyModeRef.current && map.hasLayer(l)) map.removeLayer(l);
    });

    // Leaflet renders blank/offset when its container had no size at init (common
    // inside a modal). Invalidate once layout settles, and on every resize.
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => map.invalidateSize())
        : null;
    if (ro) ro.observe(el);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      markerRef.current = null;
      baseLayerRef.current = null;
      waybackLayerRef.current = null;
    };
    // showMap toggles whether the container exists at all; re-init if it flips on.
  }, [showMap]);

  // Keep a ref mirror so the async setBase callback can read the latest mode.
  React.useEffect(() => {
    historyModeRef.current = historyMode;
  }, [historyMode]);

  // History mode: swap the default basemap for the selected Esri Wayback vintage,
  // and restore the default when history is turned off. View/zoom is untouched.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (waybackLayerRef.current) {
      map.removeLayer(waybackLayerRef.current);
      waybackLayerRef.current = null;
    }

    const release = releases[selectedIdx];
    if (historyMode && release) {
      if (baseLayerRef.current && map.hasLayer(baseLayerRef.current)) {
        map.removeLayer(baseLayerRef.current);
      }
      const wl = L.tileLayer(release.tileUrl, {
        maxNativeZoom: 19,
        maxZoom: MAX_ZOOM,
        attribution: `Esri World Imagery (${release.date}) — Wayback`,
        crossOrigin: true,
      });
      wl.addTo(map);
      wl.bringToBack(); // sit under polygons/markers
      waybackLayerRef.current = wl;
    } else if (baseLayerRef.current && !map.hasLayer(baseLayerRef.current)) {
      baseLayerRef.current.addTo(map);
      baseLayerRef.current.bringToBack();
    }
  }, [historyMode, selectedIdx, releases, showMap]);

  // The location pin is its own layer so toggling it never disturbs the polygons
  // or the current pan/zoom (it's not part of the fit-bounds group).
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (markerVisible && lat != null && lng != null) {
      markerRef.current = L.marker([lat, lng], {
        icon: makePinIcon(),
        interactive: false,
      }).addTo(map);
    }
  }, [markerVisible, lat, lng, showMap]);

  // Rebuild polygon overlays + fit the view whenever the data or unit changes.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (overlayRef.current) {
      overlayRef.current.remove();
      overlayRef.current = null;
    }
    const group = L.featureGroup().addTo(map);
    overlayRef.current = group;

    let polyCount = 0;
    for (const b of blocks) {
      if (!isPolygonGeometry(b.polygon)) continue;
      const color = effectiveColor({
        blockColor: b.color,
        varietyColor: b.variety?.color,
        varietyId: b.varietyId,
      });
      const layer = L.geoJSON(b.polygon, {
        style: { color, weight: 2, fillColor: color, fillOpacity: 0.35 },
      });
      // No on-polygon text labels — they congest and overlap. Identity comes from
      // the color + the on-map key (below) + click-for-details. Clicking a polygon
      // opens its detail modal (suppressed mid-draw so it can't hijack vertices).
      const blockId = b.id;
      layer.on("click", () => {
        if (drawingRef.current) return;
        onBlockClickRef.current?.(blockId);
      });
      if (editable) {
        // Tag the actual editable polygon(s) so the commit handler (in the edit
        // effect) can map a pm:update/pm:dragend back to this block, and seed the
        // dedupe baseline from Geoman's own serialization of the current shape.
        layer.eachLayer((child) => {
          layerBlockIdRef.current.set(child, b.id);
          const geom = (child as L.Polygon).toGeoJSON();
          lastSavedRef.current.set(b.id, JSON.stringify((geom as GeoJSON.Feature).geometry));
        });
      }
      layer.addTo(group);
      polyCount++;
    }

    if (polyCount > 0) {
      map.fitBounds(group.getBounds(), { padding: [28, 28], maxZoom: 18 });
    } else if (lat != null && lng != null) {
      map.setView([lat, lng], 16);
    }
    map.invalidateSize();
  }, [blocks, unit, lat, lng, editable]);

  // Geoman edit setup: snapping, a token-styled toolbar (edit + drag only —
  // drawing is per-block via the buttons below, removal is the block's Clear
  // shape button), and commit handlers. pm:update fires when a layer's edit
  // session ends with changed coordinates; pm:dragend when a drag settles. Both
  // persist exactly once per finished shape (deduped against lastSaved). All
  // handlers/controls are torn down in cleanup so toggling editable off (the
  // summary view) leaves no live Geoman controls behind.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !editable) return;

    map.pm.setGlobalOptions({ snappable: true, snapDistance: 20, allowSelfIntersection: false });
    if (!map.pm.controlsVisible()) {
      map.pm.addControls({
        position: "topleft",
        drawMarker: false,
        drawCircle: false,
        drawCircleMarker: false,
        drawPolyline: false,
        drawRectangle: false,
        drawPolygon: false,
        drawText: false,
        cutPolygon: false,
        rotateMode: false,
        removalMode: false,
        editMode: true,
        dragMode: true,
      });
    }

    const commit = (e: { layer: L.Layer }) => {
      const blockId = layerBlockIdRef.current.get(e.layer);
      if (!blockId) return;
      const geometry = (e.layer as L.Polygon).toGeoJSON();
      const geom = (geometry as GeoJSON.Feature).geometry;
      if (!isPolygonGeometry(geom)) return;
      const key = JSON.stringify(geom);
      if (lastSavedRef.current.get(blockId) === key) return; // unchanged → no write
      lastSavedRef.current.set(blockId, key);
      onPolygonSavedRef.current?.(blockId, geom);
    };
    map.on("pm:update", commit);
    map.on("pm:dragend", commit);

    return () => {
      map.off("pm:update", commit);
      map.off("pm:dragend", commit);
      map.pm.disableGlobalEditMode();
      map.pm.disableGlobalDragMode();
      if (map.pm.controlsVisible()) map.pm.removeControls();
    };
  }, [editable, showMap]);

  // Draw mode: when a block is active, enter polygon-draw. On pm:create read the
  // finished geometry, hand it to the consumer (→ saveBlockPolygon), drop the
  // temporary draw layer (the saved shape re-renders via the polygon effect),
  // and leave draw mode. Cancelling (activeBlockId → null) tears the draw down.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !editable || !activeBlockId) return;

    const blockId = activeBlockId;
    map.pm.enableDraw("Polygon");

    const onCreate = (e: { layer: L.Layer }) => {
      const feature = (e.layer as L.Polygon).toGeoJSON();
      const geom = (feature as GeoJSON.Feature).geometry;
      e.layer.remove();
      map.pm.disableDraw();
      if (isPolygonGeometry(geom)) onPolygonSavedRef.current?.(blockId, geom);
    };
    map.on("pm:create", onCreate);

    return () => {
      map.off("pm:create", onCreate);
      map.pm.disableDraw();
    };
  }, [editable, activeBlockId, showMap]);

  // Starting a draw maximizes the map so there's room to work. Detect the
  // transition into draw during render (React's sanctioned "adjust state on prop
  // change" pattern) and expand once — never auto-collapse, so the user finishes
  // and exits fullscreen themselves (returning to the modal they came from).
  const prevActiveRef = React.useRef(activeBlockId);
  if (activeBlockId !== prevActiveRef.current) {
    prevActiveRef.current = activeBlockId;
    if (editable && activeBlockId) setExpanded(true);
  }

  // The map was resized by the fullscreen toggle — let Leaflet recompute.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const raf = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(raf);
  }, [expanded]);

  // Esc exits fullscreen (when not drawing — drawing's own Esc-to-cancel is the
  // parent's). Capture + stopPropagation so it doesn't reach the outer Modal's
  // close-on-Escape. The Exit button is the primary affordance; this is parity.
  React.useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editable && activeBlockId) return; // let the parent cancel the draw
      e.stopPropagation();
      setExpanded(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [expanded, editable, activeBlockId]);

  const exitFullscreen = React.useCallback(() => {
    setExpanded(false);
    if (onCancelDrawRef.current) onCancelDrawRef.current(); // end any draw on exit
  }, []);

  const toggleHistory = React.useCallback(async () => {
    if (historyMode) {
      setHistoryMode(false);
      return;
    }
    if (releases.length === 0) {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const rs = await loadWaybackReleases();
        setReleases(rs);
        setSelectedIdx(Math.max(0, rs.length - 1)); // newest first
      } catch {
        setHistoryError("Couldn't load imagery history.");
        setHistoryLoading(false);
        return;
      }
      setHistoryLoading(false);
    }
    setHistoryMode(true);
  }, [historyMode, releases.length]);

  const stem = slugify(exportName);

  // PNG: capture the live map DOM (tiles + polygons + key) via html-to-image.
  // Tiles carry crossOrigin so the capture isn't tainted. The map controls
  // (zoom, Geoman toolbar, our button cluster) are filtered out; attribution
  // stays for legal credit.
  const exportPng = React.useCallback(async () => {
    const el = frameRef.current;
    if (!el) return;
    setExportOpen(false);
    setExporting("png");
    setExportError(null);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        cacheBust: true,
        filter: (node) => {
          const cl = (node as HTMLElement).classList;
          if (!cl) return true;
          return !(
            cl.contains("bw-export-exclude") ||
            cl.contains("leaflet-control-zoom") ||
            cl.contains("leaflet-pm-toolbar")
          );
        },
      });
      triggerDownload(dataUrl, `${stem}-map.png`);
    } catch {
      setExportError("Couldn't export the image — map tiles may have blocked capture.");
    } finally {
      setExporting(null);
    }
  }, [stem]);

  // Shapefile: zip a WGS84 polygon shapefile (.shp/.shx/.dbf/.prj) of every drawn
  // block, with all block metadata in the DBF attribute table.
  const exportShapefile = React.useCallback(async () => {
    setExportOpen(false);
    const fc = blocksToFeatureCollection(blocks, vineyardMeta, exportName);
    if (fc.features.length === 0) {
      setExportError("No drawn block shapes to export yet.");
      return;
    }
    setExporting("shp");
    setExportError(null);
    try {
      const shpwrite = await import("@mapbox/shp-write");
      await shpwrite.download(fc, {
        filename: `${stem}-blocks`,
        outputType: "blob",
        compression: "DEFLATE",
        types: { polygon: "blocks", multipolygon: "blocks" },
      });
    } catch {
      setExportError("Couldn't export the shapefile.");
    } finally {
      setExporting(null);
    }
  }, [blocks, vineyardMeta, exportName, stem]);

  const controlBtnStyle: React.CSSProperties = {
    minHeight: 32,
    padding: "6px 10px",
    fontFamily: "var(--font-body)",
    fontSize: 12.5,
    color: "var(--text-primary)",
    background: "var(--surface-raised)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "0 1px 3px rgba(43, 42, 38, 0.18)",
    cursor: "pointer",
  };

  const menuItemStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    textAlign: "left",
    color: "var(--text-primary)",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border-subtle)",
    cursor: "pointer",
  };

  const selectedRelease = releases[selectedIdx];

  // Blocks with a drawn shape — the on-map key. Carries the text identity that
  // used to live in the (removed) on-polygon labels: block #, variety, acreage.
  const keyedBlocks = blocks.filter((b) => isPolygonGeometry(b.polygon));

  const drawing = editable && activeBlockId != null;
  const activeBlock = activeBlockId ? blocks.find((b) => b.id === activeBlockId) ?? null : null;

  if (!showMap) {
    return (
      <div
        style={{
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-md)",
          background: "var(--surface-sunken)",
          padding: "var(--space-5)",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 13.5,
        }}
      >
        Add a location in Set up to place this vineyard on the map.
      </div>
    );
  }

  return (
    <div>
      <div
        ref={frameRef}
        style={
          expanded
            ? {
                position: "fixed",
                inset: 0,
                zIndex: 1500,
                background: "var(--surface-page)",
                padding: 10,
                boxSizing: "border-box",
              }
            : { position: "relative" }
        }
      >
        <div
          ref={containerRef}
          role="application"
          aria-label="Vineyard satellite map"
          style={{
            height: expanded ? "100%" : typeof height === "number" ? `${height}px` : height,
            width: "100%",
            borderRadius: expanded ? "var(--radius-sm)" : "var(--radius-md)",
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
            boxShadow: "var(--shadow-sm)",
          }}
        />
        {/* Draw-mode pill — lives on the map so it shows in fullscreen too. */}
        {drawing ? (
          <div
            className="bw-export-exclude"
            style={{
              position: "absolute",
              top: 10,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 1200,
              display: "flex",
              alignItems: "center",
              gap: 12,
              maxWidth: "calc(100% - 20px)",
              padding: "8px 12px",
              background: "var(--accent-soft)",
              border: "1px solid var(--wine-primary)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 2px 8px rgba(43, 42, 38, 0.18)",
            }}
          >
            <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)" }}>
              Drawing <strong>{activeBlock?.blockLabel || "this block"}</strong> — click to add points,
              double-click to finish, Esc to cancel.
            </span>
            {onCancelDraw ? (
              <button
                type="button"
                onClick={() => onCancelDraw()}
                style={{
                  ...controlBtnStyle,
                  minHeight: 28,
                  padding: "4px 10px",
                  background: "var(--surface-raised)",
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        ) : null}
        {/* On-map key: block # · variety · acreage. Doubles as the colorblind-safe
            text key now that polygons carry no label. Hidden in history mode (the
            timeline owns the bottom) and when nothing is drawn yet. */}
        {keyedBlocks.length > 0 && !historyMode ? (
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              zIndex: 1000,
              // Size to content — no scroll/clip — so the key is always fully
              // visible (on screen and in PNG export). Stays within the map width.
              maxWidth: "calc(100% - 20px)",
              overflow: "visible",
              padding: "6px 8px",
              background: "rgba(255, 248, 241, 0.94)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 1px 3px rgba(43, 42, 38, 0.18)",
            }}
          >
            <table style={{ borderCollapse: "collapse", fontFamily: "var(--font-body)", fontSize: 12.5 }}>
              <tbody>
                {keyedBlocks.map((b) => {
                  const c = effectiveColor({
                    blockColor: b.color,
                    varietyColor: b.variety?.color,
                    varietyId: b.varietyId,
                  });
                  const area = blockArea(b.rowSpacingM, b.vineSpacingM, b.vineCount, unit);
                  return (
                    <tr
                      key={b.id}
                      onClick={() => onBlockClickRef.current?.(b.id)}
                      style={{ cursor: onBlockClick ? "pointer" : "default" }}
                      title="Show block details"
                    >
                      <td style={{ padding: "2px 6px", verticalAlign: "middle" }}>
                        <span
                          aria-hidden
                          style={{
                            display: "inline-block",
                            width: 12,
                            height: 12,
                            borderRadius: "var(--radius-xs)",
                            background: c,
                            border: "1px solid var(--border-subtle)",
                          }}
                        />
                      </td>
                      <td style={{ padding: "2px 6px", color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                        {b.blockLabel || "—"}
                      </td>
                      <td style={{ padding: "2px 6px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {b.variety?.name ?? "—"}
                      </td>
                      <td
                        style={{
                          padding: "2px 6px",
                          color: "var(--text-muted)",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {area != null ? formatArea(area, unit) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {/* Top-right control cluster (bw-export-exclude → kept out of PNG export) */}
        <div
          className="bw-export-exclude"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          <button
            type="button"
            onClick={() => (expanded ? exitFullscreen() : setExpanded(true))}
            aria-pressed={expanded}
            title={expanded ? "Exit fullscreen" : "View the map fullscreen"}
            style={
              expanded
                ? { ...controlBtnStyle, background: "var(--wine-primary)", color: "var(--cream)", borderColor: "var(--wine-primary)" }
                : controlBtnStyle
            }
          >
            {expanded ? "Exit fullscreen ✕" : "⤢ Fullscreen"}
          </button>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              disabled={exporting != null}
              title="Export the map"
              style={{ ...controlBtnStyle, cursor: exporting != null ? "wait" : "pointer" }}
            >
              {exporting === "png" ? "Exporting…" : exporting === "shp" ? "Zipping…" : "Export ▾"}
            </button>
            {exportOpen ? (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  minWidth: 168,
                  display: "flex",
                  flexDirection: "column",
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "0 4px 14px rgba(43, 42, 38, 0.18)",
                  overflow: "hidden",
                }}
              >
                <button type="button" role="menuitem" onClick={exportPng} style={menuItemStyle}>
                  PNG image
                </button>
                <button type="button" role="menuitem" onClick={exportShapefile} style={menuItemStyle}>
                  Shapefile (.zip)
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={toggleHistory}
            aria-pressed={historyMode}
            disabled={historyLoading}
            title="Browse past satellite imagery (Esri Wayback)"
            style={{
              ...controlBtnStyle,
              ...(historyMode
                ? { background: "var(--wine-primary)", color: "var(--cream)", borderColor: "var(--wine-primary)" }
                : null),
              cursor: historyLoading ? "wait" : "pointer",
            }}
          >
            {historyLoading ? "Loading…" : historyMode ? "Exit history" : "History"}
          </button>
          {hasCoords ? (
            <button
              type="button"
              onClick={() => setMarkerVisible((v) => !v)}
              aria-pressed={markerVisible}
              title={markerVisible ? "Hide the location pin" : "Show the location pin"}
              style={controlBtnStyle}
            >
              {markerVisible ? "Hide pin" : "Show pin"}
            </button>
          ) : null}
        </div>

        {/* History timeline */}
        {historyMode && releases.length > 0 ? (
          <div
            className="bw-export-exclude"
            style={{
              position: "absolute",
              left: 10,
              right: 10,
              bottom: 10,
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 12px",
              background: "rgba(255, 248, 241, 0.94)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              boxShadow: "0 2px 8px rgba(43, 42, 38, 0.18)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-primary)",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {selectedRelease?.date ?? "—"}
            </span>
            <input
              type="range"
              min={0}
              max={releases.length - 1}
              value={selectedIdx}
              onChange={(e) => setSelectedIdx(Number(e.target.value))}
              aria-label="Imagery date"
              style={{ flex: 1, accentColor: "var(--wine-primary)", cursor: "pointer" }}
            />
            <span style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              {releases[0]?.date} – {releases[releases.length - 1]?.date}
            </span>
          </div>
        ) : null}
      </div>
      {historyError ? (
        <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}>{historyError}</p>
      ) : null}
      {exportError ? (
        <p style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}>{exportError}</p>
      ) : null}
      {hasCoords ? (
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          <a
            href={googleMapsUrl(lat!, lng!)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text-accent)", textDecoration: "none" }}
          >
            Open in Google Maps ↗
          </a>
        </div>
      ) : null}
    </div>
  );
}
