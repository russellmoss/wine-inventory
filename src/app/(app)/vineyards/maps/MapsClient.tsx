"use client";

import React from "react";
import { Card, Button, Eyebrow, Modal, MapLegend } from "@/components/ui";
import { SatelliteMap } from "@/components/ui/SatelliteMap.client";
import { effectiveColor } from "@/lib/vineyard/colors";
import { blockArea, formatArea, mToFt, type Unit } from "@/lib/vineyard/units";
import { loadVineyardDetail } from "@/lib/vineyard/actions";
import type { VineyardDetailPayload } from "@/lib/vineyard/data";
import { BlockDetails } from "../../reference/BlockDetails";

type Vineyard = { id: string; name: string };

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 0",
  borderTop: "1px solid var(--border-strong)",
};

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

function ListShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card padding="var(--space-5)" style={{ flex: 1, minWidth: 280 }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, marginBottom: 14 }}>
        {title}
      </h2>
      {children}
    </Card>
  );
}

function elevationText(elevationM: number, unit: Unit): string {
  if (unit === "metric") return `${elevationM.toFixed(0)} m`;
  return `${mToFt(elevationM).toFixed(0)} ft`;
}

function MapModal({
  vineyardId,
  vineyardName,
  open,
  onClose,
}: {
  vineyardId: string;
  vineyardName: string;
  open: boolean;
  onClose: () => void;
}) {
  // Mounted only while open (parent unmounts on close), so it loads fresh on
  // mount and resets its own state naturally — no reset effect.
  const [unit, setUnit] = React.useState<Unit>("imperial");
  const [infoBlockId, setInfoBlockId] = React.useState<string | null>(null);
  const [openBlockId, setOpenBlockId] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<VineyardDetailPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  // Seed the unit from the persisted default only on the first successful load.
  const seededUnit = React.useRef(false);

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

  const infoBlock = infoBlockId ? blocks.find((b) => b.id === infoBlockId) ?? null : null;

  // Esc closes the block detail modal first; with no overlay, Esc closes the
  // whole modal. Capture phase + stopPropagation so it beats the outer Modal.
  React.useEffect(() => {
    if (!infoBlockId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setInfoBlockId(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [infoBlockId]);

  return (
    <>
      <Modal open={open} onClose={onClose} maxWidth={960} title={vineyardName} subtitle="Vineyard summary">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <UnitToggle unit={unit} onChange={setUnit} />
        </div>

        {loadError ? (
          <div style={{ marginBottom: 14 }}>
            <p style={{ color: "var(--danger)", fontSize: 13.5 }}>{loadError}</p>
            <Button variant="secondary" size="sm" onClick={refetch}>Retry</Button>
          </div>
        ) : null}

        {loading && !payload ? (
          <SummarySkeleton />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {/* Stat line */}
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "baseline" }}>
              <Stat label="Planted area (spacing-based)" value={blocks.length ? formatArea(totalArea, unit) : "—"} />
              <Stat label="Blocks" value={String(blocks.length)} />
            </div>

            {/* Location & site */}
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
                  No location set for this vineyard yet.
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
                onBlockClick={setInfoBlockId}
                exportName={vineyardName}
                vineyardMeta={{ soilType: detail?.soilType, manager: detail?.manager, elevationM: detail?.elevationM }}
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
                    const isOpen = openBlockId === b.id;
                    return (
                      <div key={b.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <button
                          type="button"
                          onClick={() => setOpenBlockId((cur) => (cur === b.id ? null : b.id))}
                          aria-expanded={isOpen}
                          title="Show block details"
                          style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                            background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
                            font: "inherit", color: "inherit", fontSize: 14,
                          }}
                        >
                          <span aria-hidden style={{ width: 12, height: 12, borderRadius: "var(--radius-xs)", background: color, border: "1px solid var(--border-subtle)", flex: "0 0 auto" }} />
                          <span aria-hidden style={{ width: 10, flex: "0 0 auto", color: "var(--text-muted)", fontSize: 13, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform var(--duration-fast, 0.15s) ease", display: "inline-block" }}>▸</span>
                          <span style={{ width: 70, flex: "0 0 auto" }}>{b.blockLabel || "—"}</span>
                          <span style={{ flex: 1, minWidth: 110, color: "var(--text-secondary)" }}>{b.variety?.name ?? "—"}</span>
                          <span style={{ width: 80, flex: "0 0 auto", color: "var(--text-secondary)" }}>{b.clone ?? "—"}</span>
                          <span style={{ width: 100, flex: "0 0 auto", textAlign: "right", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{area != null ? formatArea(area, unit) : "—"}</span>
                          <span style={{ width: 90, flex: "0 0 auto", textAlign: "right", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{b.yearPlanted ?? "—"}</span>
                        </button>
                        {isOpen ? (
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

      {/* Block detail modal — opened by clicking a polygon or its on-map key row. Read-only. */}
      {infoBlock ? (
        <Modal
          open
          onClose={() => setInfoBlockId(null)}
          maxWidth={640}
          title={infoBlock.blockLabel ? `Block ${infoBlock.blockLabel}` : "Block"}
          subtitle={infoBlock.variety?.name ?? "Block details"}
        >
          <BlockDetails block={infoBlock} unit={unit} />
        </Modal>
      ) : null}
    </>
  );
}

export function MapsClient({
  vineyards,
  memberVineyardIds,
}: {
  vineyards: Vineyard[];
  memberVineyardIds: string[];
}) {
  // Pin the user's member vineyards to the top of the directory (D9 membership set).
  const sorted = React.useMemo(() => {
    if (memberVineyardIds.length === 0) return vineyards;
    const mine = new Set(memberVineyardIds);
    const assigned = vineyards.filter((v) => mine.has(v.id));
    const rest = vineyards.filter((v) => !mine.has(v.id));
    return [...assigned, ...rest];
  }, [vineyards, memberVineyardIds]);

  const [openId, setOpenId] = React.useState<string | null>(null);
  const openRow = sorted.find((v) => v.id === openId) ?? null;

  return (
    <div>
      <Eyebrow rule>Vineyards</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>
        Vineyard maps
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "60ch" }}>
        View each vineyard&rsquo;s satellite map, block layout, and planting details.
        Select a vineyard to open its interactive map and block summary.
      </p>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <ListShell title="Vineyards">
          <div style={{ display: "flex", flexDirection: "column" }}>
            {sorted.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>None yet.</p>
            ) : (
              sorted.map((v) => (
                <div key={v.id} style={rowStyle}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Button variant="link" size="sm" onClick={() => setOpenId(v.id)} style={{ fontSize: 15 }}>
                      {v.name}
                    </Button>
                  </span>
                </div>
              ))
            )}
          </div>
        </ListShell>
      </div>
      {openRow ? (
        <MapModal
          vineyardId={openRow.id}
          vineyardName={openRow.name}
          open={openId !== null}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
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
