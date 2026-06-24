"use client";

import React from "react";
import { Modal, Button, MapLegend } from "@/components/ui";
import { SatelliteMap } from "@/components/ui/SatelliteMap.client";
import { effectiveColor } from "@/lib/vineyard/colors";
import { blockArea, formatArea, mToFt, type Unit } from "@/lib/vineyard/units";
import { loadVineyardDetail } from "@/lib/vineyard/actions";
import type { VineyardDetailPayload } from "@/lib/vineyard/data";
import { VineyardSetup } from "./VineyardSetup";
import { BlockDetails } from "./BlockDetails";

type VarietyOption = { id: string; name: string; color: string | null };

export interface VineyardModalProps {
  vineyardId: string;
  vineyardName: string;
  varietyOptions: VarietyOption[];
  open: boolean;
  onClose: () => void;
}

type Mode = "summary" | "setup";

function UnitToggle({ unit, onChange }: { unit: Unit; onChange: (u: Unit) => void }) {
  return (
    <div style={{ display: "inline-flex", gap: 6 }}>
      {(["imperial", "metric"] as Unit[]).map((u) => (
        <Button key={u} variant={unit === u ? "primary" : "secondary"} size="sm" onClick={() => onChange(u)}>
          {u === "imperial" ? "Feet / acres" : "Meters / hectares"}
        </Button>
      ))}
    </div>
  );
}

export function VineyardModal({ vineyardId, vineyardName, varietyOptions, open, onClose }: VineyardModalProps) {
  // This component is mounted only while open (parent unmounts on close), so it
  // loads fresh on mount and resets its own state naturally — no reset effect.
  const [mode, setMode] = React.useState<Mode>("summary");
  const [unit, setUnit] = React.useState<Unit>("imperial");
  const [payload, setPayload] = React.useState<VineyardDetailPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  // Seed the unit from the persisted default only on the first successful load.
  const seededUnit = React.useRef(false);

  // Event-handler refetch (after a mutation, or Retry) — setState here is fine.
  const refetch = React.useCallback(() => {
    setLoading(true);
    setLoadError(null);
    loadVineyardDetail(vineyardId)
      .then((p) => {
        setPayload(p);
        if (!seededUnit.current) {
          setUnit(p.detail?.defaultUnit === "metric" ? "metric" : "imperial");
          seededUnit.current = true;
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load this vineyard."))
      .finally(() => setLoading(false));
  }, [vineyardId]);

  // Lazy-load on mount / vineyard change (async-only state updates).
  React.useEffect(() => {
    let cancelled = false;
    loadVineyardDetail(vineyardId)
      .then((p) => {
        if (cancelled) return;
        setPayload(p);
        if (!seededUnit.current) {
          setUnit(p.detail?.defaultUnit === "metric" ? "metric" : "imperial");
          seededUnit.current = true;
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't load this vineyard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vineyardId]);

  const blocks = React.useMemo(() => payload?.blocks ?? [], [payload]);
  const detail = payload?.detail ?? null;
  const [openBlockId, setOpenBlockId] = React.useState<string | null>(null);

  const totalArea = React.useMemo(
    () =>
      blocks.reduce((sum, b) => {
        const a = blockArea(b.rowSpacingM, b.vineSpacingM, b.vineCount, unit);
        return a != null ? sum + a : sum;
      }, 0),
    [blocks, unit],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={960}
      title={vineyardName}
      subtitle={mode === "summary" ? "Vineyard summary" : "Set up vineyard"}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <UnitToggle unit={unit} onChange={setUnit} />
        <Button
          variant={mode === "setup" ? "ghost" : "secondary"}
          size="sm"
          onClick={() => setMode(mode === "setup" ? "summary" : "setup")}
        >
          {mode === "setup" ? "Back to summary" : "Set up"}
        </Button>
      </div>

      {loadError ? (
        <div style={{ marginBottom: 14 }}>
          <p style={{ color: "var(--danger)", fontSize: 13.5 }}>{loadError}</p>
          <Button variant="secondary" size="sm" onClick={refetch}>Retry</Button>
        </div>
      ) : null}

      {loading && !payload ? (
        <SummarySkeleton />
      ) : mode === "setup" ? (
        <VineyardSetup
          vineyardId={vineyardId}
          detail={detail}
          blocks={blocks}
          varietyOptions={varietyOptions}
          unit={unit}
          drawEnabled={false}
          onChanged={refetch}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Stat line */}
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "baseline" }}>
            <Stat label="Planted area (spacing-based)" value={blocks.length ? formatArea(totalArea, unit) : "—"} />
            <Stat label="Blocks" value={String(blocks.length)} />
          </div>

          {/* Location & site — summary metadata, kept near the top */}
          <section>
            <SectionTitle>Location & site</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <Meta label="Vineyard manager" value={detail?.manager} />
              <Meta label="Soil type" value={detail?.soilType} />
              <Meta
                label="Elevation"
                value={detail?.elevationM != null ? elevationText(detail.elevationM, unit) : null}
              />
              <Meta
                label="Coordinates"
                value={detail?.gpsLat != null && detail?.gpsLng != null ? `${detail.gpsLat.toFixed(5)}, ${detail.gpsLng.toFixed(5)}` : null}
              />
            </div>
            {detail?.gpsLat == null || detail?.gpsLng == null ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 10 }}>
                Add a location in Set up to place this vineyard on the map.
              </p>
            ) : null}
          </section>

          {/* Satellite map + variety key */}
          <section>
            <SatelliteMap
              lat={detail?.gpsLat ?? null}
              lng={detail?.gpsLng ?? null}
              blocks={blocks}
              unit={unit}
            />
            <div style={{ marginTop: 12 }}>
              <MapLegend blocks={blocks} unit={unit} />
            </div>
          </section>

          {/* Blocks — click a row for full details */}
          <section>
            <SectionTitle>Blocks</SectionTitle>
            {blocks.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>No blocks yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {/* Column header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 0 6px", fontSize: 12.5, color: "var(--text-muted)" }}>
                  <span aria-hidden style={{ width: 12, flex: "0 0 auto" }} />
                  <span aria-hidden style={{ width: 10, flex: "0 0 auto" }} />
                  <span style={{ width: 70, flex: "0 0 auto" }}>Block #</span>
                  <span style={{ flex: 1, minWidth: 110 }}>Variety</span>
                  <span style={{ width: 80, flex: "0 0 auto" }}>Clone</span>
                  <span style={{ width: 100, flex: "0 0 auto", textAlign: "right" }}>Planted area</span>
                  <span style={{ width: 90, flex: "0 0 auto", textAlign: "right" }}>Year planted</span>
                </div>
                {blocks.map((b) => {
                  const color = effectiveColor({ blockColor: b.color, varietyColor: b.variety?.color, varietyId: b.varietyId });
                  const area = blockArea(b.rowSpacingM, b.vineSpacingM, b.vineCount, unit);
                  const open = openBlockId === b.id;
                  return (
                    <div key={b.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <button
                        type="button"
                        onClick={() => setOpenBlockId((cur) => (cur === b.id ? null : b.id))}
                        aria-expanded={open}
                        title="Show block details"
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                          background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                          font: "inherit", color: "inherit", fontSize: 14,
                        }}
                      >
                        <span aria-hidden style={{ width: 12, height: 12, borderRadius: "var(--radius-xs)", background: color, border: "1px solid var(--border-subtle)", flex: "0 0 auto" }} />
                        <span aria-hidden style={{ width: 10, flex: "0 0 auto", color: "var(--text-muted)", fontSize: 13, transform: open ? "rotate(90deg)" : "none", transition: "transform var(--duration-fast, 0.15s) ease", display: "inline-block" }}>▸</span>
                        <span style={{ width: 70, flex: "0 0 auto" }}>{b.blockLabel || "—"}</span>
                        <span style={{ flex: 1, minWidth: 110, color: "var(--text-secondary)" }}>{b.variety?.name ?? "—"}</span>
                        <span style={{ width: 80, flex: "0 0 auto", color: "var(--text-secondary)" }}>{b.clone ?? "—"}</span>
                        <span style={{ width: 100, flex: "0 0 auto", textAlign: "right", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{area != null ? formatArea(area, unit) : "—"}</span>
                        <span style={{ width: 90, flex: "0 0 auto", textAlign: "right", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{b.yearPlanted ?? "—"}</span>
                      </button>
                      {open ? (
                        <div style={{ padding: "4px 0 16px", background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", margin: "0 0 8px" }}>
                          <div style={{ padding: "8px 14px 0" }}>
                            <BlockDetails block={b} unit={unit} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

function elevationText(elevationM: number, unit: Unit): string {
  if (unit === "metric") return `${elevationM.toFixed(0)} m`;
  return `${mToFt(elevationM).toFixed(0)} ft`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 26, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 18, margin: "0 0 8px" }}>
      {children}
    </h3>
  );
}

function Meta({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 14.5, color: value ? "var(--text-primary)" : "var(--text-muted)" }}>{value || "—"}</div>
    </div>
  );
}

function SummarySkeleton() {
  const bar = (w: string) => (
    <div style={{ height: 14, width: w, borderRadius: "var(--radius-xs)", background: "var(--surface-muted)" }} />
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 28 }}>{bar("120px")}{bar("80px")}</div>
      <div style={{ height: 120, borderRadius: "var(--radius-md)", background: "var(--surface-muted)" }} />
      {bar("60%")}
      {bar("45%")}
    </div>
  );
}
