"use client";

// VI-P8 station picker — a clickable Leaflet map of the vineyard + nearby NOAA/ACIS stations. Click a station
// dot to make it the primary weather source. Vanilla Leaflet 1.9 (matches SatelliteMap; no react-leaflet).
// Uses circleMarkers (pure SVG) so there are no broken default-marker image assets. Must be loaded via
// next/dynamic({ ssr:false }) (StationMap.client.tsx) — Leaflet touches `window`. Leaflet CSS is global (root layout).

import React from "react";
import * as L from "leaflet";
import type { StationOption } from "@/lib/weather/actions";

const ESRI_IMAGERY_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION = "Esri, Maxar, Earthstar Geographics";

export default function StationMap({
  center,
  stations,
  activeSid,
  onSelect,
  busy,
}: {
  center: { lat: number; lon: number };
  stations: StationOption[];
  activeSid: string | null;
  onSelect: (sid: string) => void;
  busy?: boolean;
}) {
  const elRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const layerRef = React.useRef<L.LayerGroup | null>(null);

  // Init the map once.
  React.useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer(ESRI_IMAGERY_URL, { attribution: ESRI_ATTRIBUTION, maxZoom: 19 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // (Re)draw markers whenever the data or selection changes.
  React.useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    // Vineyard centroid — a distinct diamond-ish accent marker.
    L.circleMarker([center.lat, center.lon], { radius: 8, color: "#fff", weight: 2, fillColor: "#7a1f2b", fillOpacity: 1 })
      .bindTooltip("This vineyard", { direction: "top" })
      .addTo(layer);

    const pts: L.LatLngExpression[] = [[center.lat, center.lon]];
    for (const s of stations) {
      const isActive = s.sid === activeSid;
      const m = L.circleMarker([s.lat, s.lon], {
        radius: isActive ? 9 : 6,
        color: isActive ? "#111" : "#1f6f43",
        weight: isActive ? 3 : 1.5,
        fillColor: isActive ? "#2ecc71" : "#eaf7ef",
        fillOpacity: 0.95,
      })
        .bindTooltip(`${s.name} · ${s.distanceKm} km${isActive ? " (selected)" : ""}`, { direction: "top" })
        .addTo(layer);
      if (!busy) m.on("click", () => onSelect(s.sid));
      m.on("keypress", () => onSelect(s.sid));
      pts.push([s.lat, s.lon]);
    }
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.2));
    else map.setView([center.lat, center.lon], 11);
  }, [center.lat, center.lon, stations, activeSid, busy, onSelect]);

  return <div ref={elRef} style={{ height: 320, width: "100%", borderRadius: 10, overflow: "hidden", cursor: busy ? "wait" : "pointer" }} role="application" aria-label="Weather station picker map" />;
}
