"use client";

// next/dynamic({ ssr:false }) wrapper for the Leaflet map. Leaflet touches
// `window`, so the real component must never render on the server. Importing the
// type only (erased at build) keeps Leaflet out of this wrapper's bundle until
// the chunk loads on the client. Consumers import SatelliteMap from HERE.
//
// Not re-exported from components/ui/index.ts on purpose: index.ts is imported by
// server components, and dynamic(..., { ssr:false }) is illegal in a server module.

import dynamic from "next/dynamic";
import type { SatelliteMapProps } from "./SatelliteMap";

function MapLoading() {
  return (
    <div
      style={{
        height: 380,
        width: "100%",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-strong)",
        background: "var(--surface-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        fontSize: 13.5,
      }}
    >
      Loading map…
    </div>
  );
}

export const SatelliteMap = dynamic(
  () => import("./SatelliteMap").then((m) => m.SatelliteMap),
  { ssr: false, loading: MapLoading },
);

export type { SatelliteMapProps };
