"use client";

// next/dynamic({ ssr:false }) wrapper for the Leaflet station map — Leaflet touches `window`, so the map must
// never render on the server. Import THIS from the card, never StationMap directly.

import dynamic from "next/dynamic";

export const StationMapClient = dynamic(() => import("./StationMap"), {
  ssr: false,
  loading: () => <div style={{ height: 320, display: "grid", placeItems: "center", color: "var(--color-text-muted)" }}>Loading map…</div>,
});
