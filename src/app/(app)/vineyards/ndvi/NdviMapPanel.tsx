"use client";

import { useEffect, useState } from "react";
import { Card, MapLayerControl, type LayerRow } from "@/components/ui";
import { SatelliteMap } from "@/components/ui/SatelliteMap.client";
import type { SerializedBlock } from "@/lib/vineyard/data";
import type { MapOverlay } from "@/lib/gis/overlay";
import { PALETTES, type ColorScaleMode } from "@/lib/gis/color";
import { NdviLegend, type DisplayMetaLite } from "./NdviLegend";
import { NdviCompare } from "./NdviCompare";
import { listSpatialStylesAction, saveVineyardStyleAction, type SpatialStylePayload } from "@/lib/spatial/style-actions";
import { getVineyardSoilOverlaysAction } from "@/lib/soil/actions";
import type { VineyardSoilOverlays } from "@/lib/soil/read";
import { SoilUnitPanel } from "../maps/SoilUnitPanel";

type LayerId = "ndvi" | "soil";

export type NdviDataset = { id: string; acquiredAt: string | null };

const PROMINENT: { mode: ColorScaleMode; label: string; hint: string }[] = [
  { mode: "VINEYARD_SCENE", label: "Vineyard relative", hint: "p5–p95 across this vineyard — the default. Shows where vigor differs inside the block." },
  { mode: "ABSOLUTE", label: "Absolute", hint: "A fixed NDVI scale (−0.2 … 0.9). Compare true values across vineyards and dates." },
  { mode: "COMPARISON_LOCKED", label: "Locked", hint: "Locks the scale across dates — turn on Compare for a true two-date lock. On a single map it shows the vineyard-relative scale." },
];
const ADVANCED: { mode: ColorScaleMode; label: string; hint: string }[] = [
  { mode: "BLOCK_SCENE", label: "Block relative", hint: "p5–p95 — same as vineyard-relative here (per-block domains arrive with block masks)." },
  { mode: "VINEYARD_BASELINE", label: "Baseline", hint: "Reads against a saved baseline domain. No baseline set yet → falls back to the vineyard-relative scale." },
  { mode: "CUSTOM", label: "Custom", hint: "Your own fixed min/max." },
];

const label = { fontSize: 12, color: "var(--text-secondary)" } as const;
const control: React.CSSProperties = { padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, background: "var(--surface, #fff)" };

export function NdviMapPanel({
  vineyardId,
  datasets,
  blocks,
  center,
  vineyardName,
}: {
  vineyardId: string | null;
  datasets: NdviDataset[];
  blocks: SerializedBlock[];
  center: { lat: number; lng: number } | null;
  vineyardName: string;
}) {
  const [datasetId, setDatasetId] = useState<string | null>(datasets[0]?.id ?? null);
  const [mode, setMode] = useState<ColorScaleMode>("VINEYARD_SCENE");
  const [paletteId, setPaletteId] = useState<string>("vigor-classic");
  const [reverse, setReverse] = useState(false);
  const [opacity, setOpacity] = useState(0.8);
  const [nearest, setNearest] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [meta, setMeta] = useState<DisplayMetaLite | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [styles, setStyles] = useState<SpatialStylePayload[]>([]);
  const [styleMsg, setStyleMsg] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  // Layer stack: NDVI raster + soil vector, each toggleable + reorderable. `layerOrder` is TOP→BOTTOM.
  const [soilData, setSoilData] = useState<VineyardSoilOverlays | null>(null);
  const [soilLoading, setSoilLoading] = useState(false);
  const [selectedSoilMukey, setSelectedSoilMukey] = useState<string | null>(null);
  const [layerOrder, setLayerOrder] = useState<LayerId[]>(["soil", "ndvi"]);
  const [layerVisible, setLayerVisible] = useState<Record<LayerId, boolean>>({ ndvi: true, soil: false });

  const resampling = nearest ? "nearest" : "bilinear";

  // Fetch the vineyard's soil overlays once (lazily painted only when the soil layer is toggled on).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset + lazy-fetch soil when the vineyard changes
    setSoilData(null);
    setSelectedSoilMukey(null);
    if (!vineyardId) return;
    let cancelled = false;
    setSoilLoading(true);
    getVineyardSoilOverlaysAction(vineyardId)
      .then((r) => {
        if (!cancelled && r.ok) setSoilData(r.data);
      })
      .finally(() => {
        if (!cancelled) setSoilLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vineyardId]);

  const moveLayer = (id: string, dir: -1 | 1) => {
    setLayerOrder((order) => {
      const i = order.indexOf(id as LayerId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return order;
      const next = [...order];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const toggleLayer = (id: string) => setLayerVisible((v) => ({ ...v, [id as LayerId]: !v[id as LayerId] }));

  // Load saved styles (SYSTEM presets + this vineyard's) for the dropdown.
  useEffect(() => {
    if (!vineyardId) return;
    let cancelled = false;
    listSpatialStylesAction(vineyardId)
      .then((r) => {
        if (!cancelled) setStyles(r.styles);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vineyardId]);

  const applyStyle = (s: SpatialStylePayload) => {
    setMode(s.mode as ColorScaleMode);
    setPaletteId(s.paletteId);
    setReverse(s.reverse);
    if (["BLOCK_SCENE", "VINEYARD_BASELINE", "CUSTOM"].includes(s.mode)) setShowAdvanced(true);
  };

  const saveStyle = async () => {
    if (!vineyardId) return;
    const name = window.prompt("Save this style as (name):", "Vineyard default");
    if (!name) return;
    try {
      const r = await saveVineyardStyleAction({ vineyardId, name, mode, paletteId, reverse });
      setStyles((prev) => [...prev.filter((s) => s.id !== r.style.id), r.style]);
      setStyleMsg(`Saved “${r.style.name}”.`);
    } catch (e) {
      setStyleMsg(e instanceof Error ? e.message : "Could not save style.");
    }
  };

  // React Compiler auto-memoizes; keep these as plain derived values (manual useMemo would fight it).
  // opacity + resampling are display-only (Leaflet opacity / CSS image-rendering) — NOT in the server query,
  // so dragging opacity or toggling Nearest never refetches the PNG or the legend.
  const styleParams = new URLSearchParams({ mode, paletteId, reverse: reverse ? "1" : "0" });
  if (mode === "ABSOLUTE") {
    styleParams.set("fmin", "-0.2");
    styleParams.set("fmax", "0.9");
  }
  const query = styleParams.toString();
  const imageUrl = datasetId ? `/api/spatial/ndvi/${datasetId}/display?${query}` : null;

  // Fetch the legend metadata (domain + histogram + bbox) whenever the dataset/style changes.
  useEffect(() => {
    if (!datasetId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the layer when no scene is selected
      setMeta(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/spatial/ndvi/${datasetId}/display?${query}&meta=1`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((m: DisplayMetaLite) => {
        if (!cancelled) setMeta(m);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the NDVI layer.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, query]);

  const ndviOverlays: MapOverlay[] =
    imageUrl && meta?.wgs84Bbox
      ? [{ kind: "raster", id: `ndvi-${datasetId}-${query}`, imageUrl, bounds: meta.wgs84Bbox, opacity, resampling }]
      : [];
  const soilOverlays: MapOverlay[] = soilData?.overlays ?? [];
  const layerOverlays: Record<LayerId, MapOverlay[]> = { ndvi: ndviOverlays, soil: soilOverlays };

  // Paint bottom→top: `layerOrder` is top→bottom, and SatelliteMap paints later-in-array on top, so reverse.
  const overlays: MapOverlay[] = [...layerOrder].reverse().flatMap((id) => (layerVisible[id] ? layerOverlays[id] : []));
  const soilShown = layerVisible.soil && soilOverlays.length > 0;

  const layerRows: LayerRow[] = layerOrder.map((id) =>
    id === "ndvi"
      ? { id, label: "NDVI (vigor)", visible: layerVisible.ndvi, available: ndviOverlays.length > 0, note: ndviOverlays.length ? undefined : "select a scene" }
      : { id, label: "Soil (NRCS)", visible: layerVisible.soil, available: soilOverlays.length > 0, note: soilOverlays.length ? undefined : soilLoading ? "loading…" : "no soil pulled" },
  );
  const selectedSoil = selectedSoilMukey && soilData ? soilData.units.find((u) => u.mukey === selectedSoilMukey) : null;

  const pickMode = (m: ColorScaleMode) => setMode(m);

  if (datasets.length === 0) {
    return (
      <Card>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 6px" }}>NDVI map</h2>
        <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: 14 }}>
          No processed NDVI scene yet. Queue a look above; once it processes, the map appears here.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: 0 }}>NDVI map</h2>
        <label style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}>
          Scene
          <select value={datasetId ?? ""} onChange={(e) => setDatasetId(e.target.value)} style={control}>
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.acquiredAt ? d.acquiredAt.slice(0, 10) : d.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Scale-mode selector — 3 prominent + Advanced disclosure (Q2). */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "12px 0 6px" }}>
        {PROMINENT.map((m) => (
          <button key={m.mode} onClick={() => pickMode(m.mode)} title={m.hint} style={modeBtn(mode === m.mode)}>
            {m.label}
          </button>
        ))}
        <button onClick={() => setShowAdvanced((s) => !s)} style={modeBtn(false)}>
          {showAdvanced ? "Advanced ▲" : "Advanced ▾"}
        </button>
      </div>
      {showAdvanced && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {ADVANCED.map((m) => (
            <button key={m.mode} onClick={() => pickMode(m.mode)} title={m.hint} style={modeBtn(mode === m.mode)}>
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Palette + display controls. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", margin: "8px 0 12px" }}>
        <label style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}>
          Palette
          <select value={paletteId} onChange={(e) => setPaletteId(e.target.value)} style={control}>
            {PALETTES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} /> Reverse
        </label>
        <label style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={nearest} onChange={(e) => setNearest(e.target.checked)} /> Nearest (raw pixels)
        </label>
        <label style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}>
          Opacity
          <input type="range" min={0.2} max={1} step={0.1} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
        </label>
      </div>

      {/* Saved styles (SYSTEM presets + per-vineyard) + comparison toggle. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", margin: "0 0 12px" }}>
        <label style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}>
          Style
          <select
            defaultValue=""
            onChange={(e) => {
              const s = styles.find((x) => x.id === e.target.value);
              if (s) applyStyle(s);
            }}
            style={control}
          >
            <option value="">Custom…</option>
            {styles.filter((s) => s.scope === "SYSTEM").length > 0 && (
              <optgroup label="Presets">
                {styles.filter((s) => s.scope === "SYSTEM").map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </optgroup>
            )}
            {styles.filter((s) => s.scope === "VINEYARD").length > 0 && (
              <optgroup label="This vineyard">
                {styles.filter((s) => s.scope === "VINEYARD").map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <button onClick={saveStyle} style={modeBtn(false)}>Save as vineyard default</button>
        <label style={{ ...label, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare dates
        </label>
        {styleMsg && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{styleMsg}</span>}
      </div>

      {compare && datasets.length >= 2 ? (
        <NdviCompare datasets={datasets} blocks={blocks} center={center} vineyardName={vineyardName} paletteId={paletteId} reverse={reverse} initialA={datasets[1]?.id ?? null} initialB={datasetId} />
      ) : (
        <>
          {compare && datasets.length < 2 && (
            <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "0 0 10px" }}>Need two processed scenes to compare — only one is available.</p>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <MapLayerControl layers={layerRows} onToggle={toggleLayer} onMove={moveLayer} />
          </div>
          <SatelliteMap
            lat={center?.lat ?? null}
            lng={center?.lng ?? null}
            blocks={blocks}
            unit="imperial"
            overlays={overlays}
            onOverlayFeatureClick={soilShown ? (props) => setSelectedSoilMukey(props.mukey ? String(props.mukey) : null) : undefined}
            height={420}
            exportName={vineyardName}
          />
          {error && <p style={{ color: "var(--danger, #b00020)", fontSize: 13, margin: "10px 0 0" }}>{error}</p>}
          {loading && !meta && <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: "10px 0 0" }}>Loading NDVI…</p>}
          {soilShown && soilData ? (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
              {soilData.legend.entries.map((e) => (
                <span key={e.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)" }}>
                  <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: e.color, border: "1px solid var(--border-subtle)" }} />
                  {e.label}
                </span>
              ))}
            </div>
          ) : null}
          {selectedSoil ? <SoilUnitPanel unit={selectedSoil} displayUnit="imperial" onClose={() => setSelectedSoilMukey(null)} /> : null}
          {meta && <NdviLegend meta={meta} paletteId={paletteId} reverse={reverse} mode={mode} />}
        </>
      )}
    </Card>
  );
}

function modeBtn(active: boolean): React.CSSProperties {
  return {
    padding: "5px 11px",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
    border: "1px solid var(--border)",
    background: active ? "var(--accent, #1a1a1a)" : "transparent",
    color: active ? "var(--accent-contrast, #fff)" : "var(--text-primary)",
    fontWeight: active ? 600 : 400,
  };
}
