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
// Interactive drawing/editing (Leaflet-Geoman) arrives in a later unit; this is
// the read-only base: tiles, a location pin, color-coded block polygons with
// permanent labels + detail popups, and auto fit-bounds.

import React from "react";
import * as L from "leaflet";
import { effectiveColor } from "@/lib/vineyard/colors";
import { blockArea, formatArea, type Unit } from "@/lib/vineyard/units";
import type { SerializedBlock } from "@/lib/vineyard/data";

const ESRI_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION = "Esri, Maxar, Earthstar Geographics";

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

function esc(v: unknown): string {
  if (v == null) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Permanent on-polygon label: block # / variety (never color-only — a11y). */
function labelText(b: SerializedBlock): string {
  const parts = [b.blockLabel, b.variety?.name].filter(Boolean) as string[];
  return parts.length ? esc(parts.join(" · ")) : "Block";
}

/** Detail popup HTML for a block, styled with tokens so it matches the app. */
function popupHtml(b: SerializedBlock, unit: Unit): string {
  const area = blockArea(b.rowSpacingM, b.vineSpacingM, b.vineCount, unit);
  const fields: Array<[string, string | number | null]> = [
    ["Variety", b.variety?.name ?? null],
    ["Planted area (spacing-based)", area != null ? formatArea(area, unit) : null],
    ["Clone", b.clone],
    ["Rootstock", b.rootstock],
    ["# of vines", b.vineCount],
    ["# of rows", b.numRows],
    ["Year planted", b.yearPlanted],
    ["Irrigation", b.irrigated == null ? null : b.irrigated ? "Yes" : "No"],
  ];
  const rows = fields
    .filter(([, v]) => v != null && v !== "")
    .map(
      ([k, v]) =>
        `<div style="display:flex;justify-content:space-between;gap:14px;font-size:13px;padding:1px 0;">` +
        `<span style="color:var(--text-muted);">${esc(k)}</span>` +
        `<span style="color:var(--text-primary);font-variant-numeric:tabular-nums;">${esc(v)}</span>` +
        `</div>`,
    )
    .join("");
  const title = b.blockLabel ? `Block ${esc(b.blockLabel)}` : "Block";
  return (
    `<div style="font-family:var(--font-body);min-width:180px;">` +
    `<div style="font-family:var(--font-heading);font-weight:500;font-size:14.5px;margin-bottom:6px;">${title}</div>` +
    (rows || `<div style="font-size:13px;color:var(--text-muted);">No details yet.</div>`) +
    `</div>`
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

export function SatelliteMap({ lat, lng, blocks, unit, height = 380 }: SatelliteMapProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const overlayRef = React.useRef<L.FeatureGroup | null>(null);

  const hasCoords = lat != null && lng != null;
  const hasGeometry = blocks.some((b) => isPolygonGeometry(b.polygon));
  const showMap = hasCoords || hasGeometry;

  // Init once. Cleanup (map.remove) makes React StrictMode's mount→unmount→mount
  // safe: the first map is fully torn down before the second is created.
  React.useEffect(() => {
    if (!showMap) return;
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, { scrollWheelZoom: true, attributionControl: true }).setView(
      [20, 0],
      2,
    );
    mapRef.current = map;

    L.tileLayer(ESRI_IMAGERY_URL, {
      attribution: ESRI_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    // Leaflet renders blank/offset when its container had no size at init (common
    // inside a modal). Invalidate once layout settles, and on every resize.
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => map.invalidateSize())
        : null;
    if (ro) ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
    // showMap toggles whether the container exists at all; re-init if it flips on.
  }, [showMap]);

  // Rebuild pin + polygon overlays whenever the data or unit changes.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (overlayRef.current) {
      overlayRef.current.remove();
      overlayRef.current = null;
    }
    const group = L.featureGroup().addTo(map);
    overlayRef.current = group;

    if (lat != null && lng != null) {
      L.marker([lat, lng], { icon: makePinIcon(), interactive: false }).addTo(group);
    }

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
      layer.bindTooltip(labelText(b), {
        permanent: true,
        direction: "center",
        className: "bw-poly-label",
        opacity: 1,
      });
      layer.bindPopup(popupHtml(b, unit), { className: "bw-map-popup", maxWidth: 260 });
      layer.addTo(group);
      polyCount++;
    }

    if (polyCount > 0) {
      map.fitBounds(group.getBounds(), { padding: [28, 28], maxZoom: 18 });
    } else if (lat != null && lng != null) {
      map.setView([lat, lng], 16);
    }
    map.invalidateSize();
  }, [blocks, unit, lat, lng]);

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
        ref={containerRef}
        role="application"
        aria-label="Vineyard satellite map"
        style={{
          height: typeof height === "number" ? `${height}px` : height,
          width: "100%",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          border: "1px solid var(--border-strong)",
          boxShadow: "var(--shadow-sm)",
        }}
      />
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
