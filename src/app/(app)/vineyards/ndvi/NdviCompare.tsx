"use client";

import { useEffect, useState } from "react";
import { SatelliteMap } from "@/components/ui/SatelliteMap.client";
import type { SerializedBlock } from "@/lib/vineyard/data";
import type { MapOverlay } from "@/lib/gis/overlay";
import type { NdviDataset } from "./NdviMapPanel";
import { MAP_EXPLORER_COMPARE_HEIGHT } from "./map-height";

type SideMeta = { bbox: [number, number, number, number] | null; min: number; max: number };

const control: React.CSSProperties = { padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface, #fff)" };
const labelS = { fontSize: 12, color: "var(--text-secondary)" } as const;

async function fetchSide(datasetId: string): Promise<SideMeta> {
  const r = await fetch(`/api/spatial/ndvi/${datasetId}/display?mode=VINEYARD_SCENE&meta=1`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const m = await r.json();
  return { bbox: m.wgs84Bbox, min: m.domain.min, max: m.domain.max };
}

/**
 * Side-by-side date comparison on a LOCKED domain (Q4, council #5): both scenes are painted with the SAME
 * fixed domain — the span across the two dates' vineyard-relative domains — so a colour difference between
 * the maps is a REAL vigour change, never an artefact of two independent auto-scales.
 */
export function NdviCompare({
  datasets,
  blocks,
  center,
  vineyardName,
  paletteId,
  reverse,
  initialA,
  initialB,
}: {
  datasets: NdviDataset[];
  blocks: SerializedBlock[];
  center: { lat: number; lng: number } | null;
  vineyardName: string;
  paletteId: string;
  reverse: boolean;
  initialA: string | null;
  initialB: string | null;
}) {
  const [aId, setAId] = useState<string | null>(initialA ?? datasets[1]?.id ?? null);
  const [bId, setBId] = useState<string | null>(initialB ?? datasets[0]?.id ?? null);
  const [aMeta, setAMeta] = useState<SideMeta | null>(null);
  const [bMeta, setBMeta] = useState<SideMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!aId || !bId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the prior error when a new comparison loads
    setError(null);
    Promise.all([fetchSide(aId), fetchSide(bId)])
      .then(([a, b]) => {
        if (cancelled) return;
        setAMeta(a);
        setBMeta(b);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load comparison.");
      });
    return () => {
      cancelled = true;
    };
  }, [aId, bId]);

  // The locked domain = the span across both dates' vineyard-relative domains.
  const lockedMin = aMeta && bMeta ? Math.min(aMeta.min, bMeta.min) : null;
  const lockedMax = aMeta && bMeta ? Math.max(aMeta.max, bMeta.max) : null;

  const overlayFor = (id: string | null, m: SideMeta | null): MapOverlay[] => {
    if (!id || !m?.bbox || lockedMin == null || lockedMax == null) return [];
    const q = new URLSearchParams({ mode: "CUSTOM", paletteId, reverse: reverse ? "1" : "0", fmin: String(lockedMin), fmax: String(lockedMax) });
    return [{ kind: "raster", id: `cmp-${id}-${lockedMin.toFixed(3)}-${lockedMax.toFixed(3)}`, imageUrl: `/api/spatial/ndvi/${id}/display?${q}`, bounds: m.bbox, opacity: 0.85, resampling: "bilinear" }];
  };

  const acqOf = (id: string | null) => datasets.find((d) => d.id === id)?.acquiredAt?.slice(0, 10) ?? "—";

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label style={{ ...labelS, display: "flex", alignItems: "center", gap: 6 }}>
          A (earlier)
          <select value={aId ?? ""} onChange={(e) => setAId(e.target.value)} style={control}>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>{d.acquiredAt?.slice(0, 10) ?? d.id.slice(0, 8)}</option>
            ))}
          </select>
        </label>
        <label style={{ ...labelS, display: "flex", alignItems: "center", gap: 6 }}>
          B (later)
          <select value={bId ?? ""} onChange={(e) => setBId(e.target.value)} style={control}>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>{d.acquiredAt?.slice(0, 10) ?? d.id.slice(0, 8)}</option>
            ))}
          </select>
        </label>
        {lockedMin != null && lockedMax != null && (
          <span style={{ ...labelS, alignSelf: "center", fontVariantNumeric: "tabular-nums" }}>
            Locked domain {lockedMin.toFixed(2)} – {lockedMax.toFixed(2)}
          </span>
        )}
      </div>

      {error && <p style={{ color: "var(--danger, #b00020)", fontSize: 13, margin: 0 }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ ...labelS, marginBottom: 4 }}>A · {acqOf(aId)}</div>
          <SatelliteMap lat={center?.lat ?? null} lng={center?.lng ?? null} blocks={blocks} unit="imperial" overlays={overlayFor(aId, aMeta)} height={MAP_EXPLORER_COMPARE_HEIGHT} exportName={`${vineyardName}-A`} />
        </div>
        <div>
          <div style={{ ...labelS, marginBottom: 4 }}>B · {acqOf(bId)}</div>
          <SatelliteMap lat={center?.lat ?? null} lng={center?.lng ?? null} blocks={blocks} unit="imperial" overlays={overlayFor(bId, bMeta)} height={MAP_EXPLORER_COMPARE_HEIGHT} exportName={`${vineyardName}-B`} />
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)" }}>
        Both maps share one locked NDVI scale, so a colour difference is a real change. For the per-block delta, ask the
        assistant to “compare NDVI dates”. Pixel diff map (B−A) is a planned follow-on.
      </p>
    </div>
  );
}
