"use client";

import React from "react";
import { Modal, Button, MapLegend } from "@/components/ui";
import { effectiveColor } from "@/lib/vineyard/colors";
import { blockArea, formatArea, mToFt, type Unit } from "@/lib/vineyard/units";
import { loadVineyardDetail } from "@/lib/vineyard/actions";
import type { VineyardDetailPayload } from "@/lib/vineyard/data";
import { VineyardSetup } from "./VineyardSetup";

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

  const totalArea = React.useMemo(
    () =>
      blocks.reduce((sum, b) => {
        const a = blockArea(b.rowSpacingM, b.vineSpacingM, b.vineCount, unit);
        return a != null ? sum + a : sum;
      }, 0),
    [blocks, unit],
  );

  const breakdown = React.useMemo(() => {
    const map = new Map<string, { name: string; color: string; area: number }>();
    for (const b of blocks) {
      const key = b.varietyId ?? "__none__";
      const name = b.variety?.name ?? "Unassigned";
      const color = effectiveColor({ varietyColor: b.variety?.color, varietyId: b.varietyId });
      const a = blockArea(b.rowSpacingM, b.vineSpacingM, b.vineCount, unit) ?? 0;
      const cur = map.get(key) ?? { name, color, area: 0 };
      cur.area += a;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.area - a.area || a.name.localeCompare(b.name));
  }, [blocks, unit]);

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

          {/* Map slot (satellite map arrives in a later update) + variety key */}
          <section>
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
              Satellite map arrives in a later update.
            </div>
            <div style={{ marginTop: 12 }}>
              <MapLegend blocks={blocks} unit={unit} />
            </div>
          </section>

          {/* Per-variety breakdown */}
          {breakdown.length ? (
            <section>
              <SectionTitle>Varieties by planted area</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {breakdown.map((e) => {
                  const pct = totalArea > 0 ? Math.round((e.area / totalArea) * 100) : 0;
                  return (
                    <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid var(--border-subtle)" }}>
                      <span aria-hidden style={{ width: 14, height: 14, borderRadius: "var(--radius-xs)", background: e.color, border: "1px solid var(--border-subtle)", flex: "0 0 auto" }} />
                      <span style={{ flex: 1 }}>{e.name}</span>
                      <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{formatArea(e.area, unit)}</span>
                      <span style={{ width: 48, textAlign: "right", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Block list */}
          <section>
            <SectionTitle>Blocks</SectionTitle>
            {blocks.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>No blocks yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {blocks.map((b) => {
                  const color = effectiveColor({ blockColor: b.color, varietyColor: b.variety?.color, varietyId: b.varietyId });
                  const area = blockArea(b.rowSpacingM, b.vineSpacingM, b.vineCount, unit);
                  return (
                    <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid var(--border-subtle)", fontSize: 14 }}>
                      <span aria-hidden style={{ width: 12, height: 12, borderRadius: "var(--radius-xs)", background: color, border: "1px solid var(--border-subtle)", flex: "0 0 auto" }} />
                      <span style={{ minWidth: 100 }}>{b.blockLabel || "Untitled block"}</span>
                      <span style={{ flex: 1, color: "var(--text-secondary)" }}>{b.variety?.name ?? "—"}</span>
                      <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{area != null ? formatArea(area, unit) : "—"}</span>
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
