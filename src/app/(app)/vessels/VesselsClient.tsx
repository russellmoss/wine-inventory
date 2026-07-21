"use client";

import React from "react";
import Link from "next/link";
import { Card, Input, Button, Badge, Eyebrow, Modal, ConfirmButton } from "@/components/ui";
import { createVessel, updateVessel, setVesselActive } from "@/lib/vessels/actions";
import { formatL } from "@/lib/lot/timeline";
import { VesselComposition } from "@/components/vessel/VesselComposition";
import type { CompositionComponent } from "@/lib/vessel/composition";

export type VesselRow = {
  id: string;
  code: string;
  type: "BARREL" | "TANK";
  capacityL: number;
  isActive: boolean;
  componentCount: number;
  filledL: number;
  pct: number;
  over: boolean;
  oakOrigin: string | null;
  cooperageYear: number | null;
  cooperage: string | null;
  toastLevel: string | null;
  /** The vessel's wine — one, or none when it's empty (LEDGER-12). */
  wine: { lotId: string; code: string } | null;
  /** What that wine is made of, for the composition line. */
  components: CompositionComponent[];
};

export function VesselsClient({ vessels }: { vessels: VesselRow[] }) {
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

  const barrels = vessels.filter((v) => v.type === "BARREL");
  const tanks = vessels.filter((v) => v.type === "TANK");
  const selected = vessels.find((v) => v.id === selectedId) ?? null;

  const renderTypeCard = (title: string, type: "BARREL" | "TANK", items: VesselRow[]) => {
    return (
      <Card style={{ flex: "1 1 380px" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, marginBottom: 12 }}>
          {title} <span style={{ color: "var(--text-muted)", fontSize: 15 }}>({items.length})</span>
        </h2>
        <form
          onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; run(() => createVessel(new FormData(f)), () => f.reset()); }}
          style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}
        >
          <input type="hidden" name="type" value={type} />
          <Input label={type === "BARREL" ? "Barrel #" : "Code"} name="code" placeholder={type === "BARREL" ? "1" : "TANK-001"} required style={{ flex: "1 1 150px" }} />
          <Input label={type === "BARREL" ? "Volume (L)" : "Capacity (L)"} name="capacityL" type="number" step="0.01" min="0.01" placeholder={type === "BARREL" ? "225" : "5000"} required style={{ flex: "0 1 130px" }} />
          {type === "BARREL" ? (
            <>
              <Input label="Oak origin" name="oakOrigin" placeholder="French" style={{ flex: "1 1 120px" }} />
              <Input label="Year of cooperage" name="cooperageYear" type="number" step="1" min="1900" placeholder="2024" style={{ flex: "0 1 120px" }} />
              <Input label="Cooperage" name="cooperage" placeholder="Seguin Moreau" style={{ flex: "1 1 140px" }} />
              <Input label="Toast level" name="toastLevel" placeholder="Medium+" style={{ flex: "1 1 120px" }} />
            </>
          ) : null}
          <Button type="submit" variant="primary" disabled={pending}>Add</Button>
        </form>

        {items.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No {title.toLowerCase()} yet.</p>
        ) : (
          <div>
            {items.map((v) => (
              <div
                key={v.id}
                id={`vessel-${v.id}`}
                style={{ borderTop: "1px solid var(--border-strong)", scrollMarginTop: 80, opacity: v.isActive ? 1 : 0.55 }}
              >
                <button
                  onClick={() => setSelectedId(v.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px",
                    background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left", fontFamily: "var(--font-body)", fontSize: 14,
                  }}
                >
                  <span style={{ fontWeight: 500, minWidth: 90 }}>{v.code}</span>
                  <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
                    <span style={{ flex: 1, height: 8, background: "var(--paper-200)", borderRadius: 999, overflow: "hidden" }}>
                      <span style={{ display: "block", width: `${Math.min(100, v.pct)}%`, height: "100%", background: v.over ? "var(--danger)" : "var(--accent)" }} />
                    </span>
                    <span style={{ fontSize: 12.5, color: v.over ? "var(--danger)" : "var(--text-muted)", whiteSpace: "nowrap" }}>{v.filledL}/{v.capacityL} L</span>
                  </span>
                  {!v.isActive ? <Badge tone="neutral" variant="soft">inactive</Badge> : null}
                  <span style={{ color: "var(--text-accent)", fontSize: 13 }}>edit ›</span>
                </button>
                {/* The wine, then what it is made of. This was a wrap-around row of one badge per
                    resident lot — a vessel holds one wine now, so it names it and shows its makeup. */}
                {v.wine ? (
                  <div style={{ padding: "0 8px 6px 8px" }}>
                    <Link href={`/lots/${v.wine.lotId}`}>
                      <Badge tone="neutral" variant="soft">{v.wine.code} · {formatL(v.filledL)} L</Badge>
                    </Link>
                    <VesselComposition totalVolumeL={v.filledL} components={v.components} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div>
      <Eyebrow rule>Cellar</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Vessels</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "60ch" }}>
        Barrels and tanks at the winery, managed separately. Click a vessel to edit its code or capacity, or deactivate it.
      </p>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        {renderTypeCard("Barrels", "BARREL", barrels)}
        {renderTypeCard("Tanks", "TANK", tanks)}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? `Edit ${selected.code}` : ""}
        subtitle={selected ? `${selected.type === "BARREL" ? "Barrel" : "Tank"} · currently holds ${selected.filledL} L` : null}
        maxWidth={460}
      >
        {selected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <form
              onSubmit={(e) => { e.preventDefault(); run(() => updateVessel(selected.id, new FormData(e.currentTarget)), () => setSelectedId(null)); }}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <input type="hidden" name="type" value={selected.type} />
              <Input label={selected.type === "BARREL" ? "Barrel #" : "Code"} name="code" defaultValue={selected.code} required />
              <Input label={selected.type === "BARREL" ? "Volume (L)" : "Capacity (L)"} name="capacityL" type="number" step="0.01" min="0.01" defaultValue={selected.capacityL} hint={selected.filledL > 0 ? `Can't go below current contents (${selected.filledL} L)` : undefined} required />
              {selected.type === "BARREL" ? (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Input label="Oak origin" name="oakOrigin" defaultValue={selected.oakOrigin ?? ""} style={{ flex: "1 1 130px" }} />
                  <Input label="Year of cooperage" name="cooperageYear" type="number" step="1" min="1900" defaultValue={selected.cooperageYear ?? ""} style={{ flex: "0 1 120px" }} />
                  <Input label="Cooperage" name="cooperage" defaultValue={selected.cooperage ?? ""} style={{ flex: "1 1 150px" }} />
                  <Input label="Toast level" name="toastLevel" defaultValue={selected.toastLevel ?? ""} style={{ flex: "1 1 120px" }} />
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                <Button type="submit" variant="primary" disabled={pending}>Save changes</Button>
                {selected.isActive ? (
                  <ConfirmButton confirmLabel="Deactivate" onConfirm={() => run(() => setVesselActive(selected.id, false), () => setSelectedId(null))} disabled={pending}>Deactivate</ConfirmButton>
                ) : (
                  <Button variant="secondary" disabled={pending} onClick={() => run(() => setVesselActive(selected.id, true), () => setSelectedId(null))}>Reactivate</Button>
                )}
              </div>
            </form>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
