"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow, Modal, ExportCsvButton } from "@/components/ui";
import type { BlendInfo } from "@/lib/bulk/blend";
import type { Fill } from "@/lib/vessels/fill";
import { addComponent, updateComponentVolume, removeComponent, setBlendName } from "@/lib/bulk/actions";

export type Option = { id: string; name: string };
export type Comp = { id: string; varietyId: string; varietyName: string; vineyardName: string; vintage: number; volumeL: number };
export type VesselWithContents = {
  id: string; code: string; type: "BARREL" | "TANK"; capacityL: number; blendName: string | null;
  components: Comp[]; blend: BlendInfo; fill: Fill;
  barrelNumber: number | null; oakOrigin: string | null; cooperageYear: number | null; cooperage: string | null; toastLevel: string | null;
};

const selectStyle: React.CSSProperties = {
  height: 38, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-primary)",
};

function StatusBadge({ v }: { v: VesselWithContents }) {
  if (v.components.length === 0) return <Badge tone="neutral" variant="soft">empty</Badge>;
  if (v.blend.isBlend) return <Badge tone="maroon" variant="soft">{v.blendName || `Blend · ${v.blend.varieties.length}`}</Badge>;
  return <Badge tone="green" variant="soft">{v.blendName || `100% ${v.blend.varieties[0]?.varietyName}`}</Badge>;
}

function FillBar({ v }: { v: VesselWithContents }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 160, flex: 1 }}>
      <div style={{ flex: 1, height: 8, background: "var(--paper-200)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, v.fill.pct)}%`, height: "100%", background: v.fill.over ? "var(--danger)" : "var(--accent)" }} />
      </div>
      <span style={{ fontSize: 12.5, color: v.fill.over ? "var(--danger)" : "var(--text-muted)", whiteSpace: "nowrap" }}>
        {v.fill.filledL}/{v.capacityL} L{v.fill.over ? " ⚠" : ""}
      </span>
    </div>
  );
}

function BarrelMeta({ v }: { v: VesselWithContents }) {
  if (v.type !== "BARREL") return null;
  const rows: Array<[string, React.ReactNode]> = [
    ["Barrel #", v.barrelNumber != null ? `#${v.barrelNumber}` : null],
    ["Volume", `${v.capacityL} L`],
    ["Oak origin", v.oakOrigin],
    ["Year of cooperage", v.cooperageYear],
    ["Cooperage", v.cooperage],
    ["Toast level", v.toastLevel],
  ];
  const shown = rows.filter(([, val]) => val != null && val !== "");
  if (shown.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px 18px", padding: "12px 0 14px", borderBottom: "1px solid var(--border-strong)", marginBottom: 14 }}>
      {shown.map(([label, val]) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>{label}</span>
          <span style={{ fontSize: 14, color: "var(--text-primary)" }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

export function BulkClient({ vessels, varieties, vineyards }: { vessels: VesselWithContents[]; varieties: Option[]; vineyards: Option[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  function run(fn: () => Promise<void>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try { await fn(); after?.(); }
      catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    });
  }

  const canFill = varieties.length > 0 && vineyards.length > 0;
  const barrels = vessels.filter((v) => v.type === "BARREL");
  const tanks = vessels.filter((v) => v.type === "TANK");
  const selected = vessels.find((v) => v.id === selectedId) ?? null;

  function TypeCard({ title, items }: { title: string; items: VesselWithContents[] }) {
    return (
      <Card style={{ flex: "1 1 380px" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, marginBottom: 12 }}>
          {title} <span style={{ color: "var(--text-muted)", fontSize: 15 }}>({items.length})</span>
        </h2>
        {items.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No active {title.toLowerCase()}.</p>
        ) : (
          <div>
            {items.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelectedId(v.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 8px",
                  borderTop: "1px solid var(--border-strong)", background: "transparent", border: "none",
                  borderBottom: "none", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-body)", fontSize: 14,
                }}
              >
                <span style={{ fontWeight: 500, minWidth: 90 }}>{v.code}</span>
                <FillBar v={v} />
                <StatusBadge v={v} />
                <span style={{ color: "var(--text-accent)", fontSize: 13 }}>manage ›</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div>
      <Eyebrow rule>In-process wine · Winery</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Bulk wine</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 16, maxWidth: "64ch" }}>
        Barrels and tanks at the winery. Click a vessel to see what&rsquo;s inside and add, adjust, or remove wine.
      </p>

      <div style={{ marginBottom: 20 }}>
        <ExportCsvButton
          filename="bulk-wine.csv"
          columns={[
            { key: "vessel", label: "Vessel" },
            { key: "type", label: "Type" },
            { key: "barrelNumber", label: "Barrel #" },
            { key: "oakOrigin", label: "Oak origin" },
            { key: "cooperageYear", label: "Year of cooperage" },
            { key: "cooperage", label: "Cooperage" },
            { key: "toastLevel", label: "Toast level" },
            { key: "variety", label: "Variety" },
            { key: "vineyard", label: "Vineyard" },
            { key: "vintage", label: "Vintage" },
            { key: "volumeL", label: "Volume (L)" },
          ]}
          rows={vessels.flatMap((v) => v.components.map((c) => ({
            vessel: v.code,
            type: v.type,
            barrelNumber: v.barrelNumber ?? "",
            oakOrigin: v.oakOrigin ?? "",
            cooperageYear: v.cooperageYear ?? "",
            cooperage: v.cooperage ?? "",
            toastLevel: v.toastLevel ?? "",
            variety: c.varietyName,
            vineyard: c.vineyardName,
            vintage: c.vintage,
            volumeL: c.volumeL,
          })))}
        />
      </div>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}
      {!canFill ? (
        <Card style={{ marginBottom: 20 }}>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Add at least one variety and one vineyard in <strong>Setup → Varieties &amp; vineyards</strong> before filling vessels.
          </p>
        </Card>
      ) : null}
      {vessels.length === 0 ? (
        <Card><p style={{ color: "var(--text-secondary)", margin: 0 }}>No active vessels. Register barrels/tanks in <strong>Setup → Vessels</strong> first.</p></Card>
      ) : (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <TypeCard title="Barrels" items={barrels} />
          <TypeCard title="Tanks" items={tanks} />
        </div>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? selected.code : ""}
        subtitle={selected ? <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>{selected.type === "BARREL" ? "Barrel" : "Tank"} · {selected.fill.filledL}/{selected.capacityL} L ({selected.fill.pct}%)<StatusBadge v={selected} /></span> : null}
      >
        {selected ? (
          <div>
            <BarrelMeta v={selected} />
            {selected.components.length > 1 ? (
              <form
                key={`bn-${selected.id}-${selected.blendName ?? ""}`}
                onSubmit={(e) => { e.preventDefault(); run(() => setBlendName(selected.id, new FormData(e.currentTarget))); }}
                style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}
              >
                <input name="blendName" defaultValue={selected.blendName ?? ""} placeholder="Name this blend (e.g. Reserve Red)" style={{ ...selectStyle, flex: 1, height: 40 }} />
                <Button type="submit" variant="secondary" size="sm" disabled={pending}>Save name</Button>
              </form>
            ) : null}
            {selected.components.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 12.5 }}>
                    <th style={{ padding: "6px" }}>Variety</th><th style={{ padding: "6px" }}>Vineyard</th><th style={{ padding: "6px" }}>Vintage</th><th style={{ padding: "6px" }}>Volume</th><th />
                  </tr>
                </thead>
                <tbody>
                  {selected.components.map((c) => (
                    <tr key={c.id} style={{ borderTop: "1px solid var(--border-strong)" }}>
                      <td style={{ padding: "8px 6px" }}>{c.varietyName}</td>
                      <td style={{ padding: "8px 6px", color: "var(--text-muted)" }}>{c.vineyardName}</td>
                      <td style={{ padding: "8px 6px", color: "var(--text-muted)" }}>{c.vintage}</td>
                      <td style={{ padding: "8px 6px" }}>
                        <form onSubmit={(e) => { e.preventDefault(); run(() => updateComponentVolume(c.id, new FormData(e.currentTarget))); }} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <input name="volumeL" type="number" step="0.01" min="0.01" defaultValue={c.volumeL} style={{ ...selectStyle, width: 88, height: 32 }} />
                          <span style={{ color: "var(--text-muted)" }}>L</span>
                          <Button type="submit" variant="ghost" size="sm" disabled={pending}>save</Button>
                        </form>
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removeComponent(c.id))}>remove</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 14 }}>This vessel is empty.</p>
            )}

            {canFill ? (
              <form
                onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; const fd = new FormData(form); fd.set("vesselId", selected.id); run(async () => { await addComponent(fd); form.reset(); }); }}
                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border-strong)", paddingTop: 14 }}
              >
                <select name="varietyId" style={selectStyle} required defaultValue=""><option value="" disabled>Variety</option>{varieties.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
                <select name="vineyardId" style={selectStyle} required defaultValue=""><option value="" disabled>Vineyard</option>{vineyards.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
                <input name="vintage" type="number" placeholder="Vintage" style={{ ...selectStyle, width: 96 }} required />
                <input name="volumeL" type="number" step="0.01" min="0.01" placeholder="Litres" style={{ ...selectStyle, width: 96 }} required />
                <Button type="submit" variant="primary" size="sm" disabled={pending}>Add to vessel</Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
