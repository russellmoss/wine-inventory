"use client";

import React from "react";
import Link from "next/link";
import { Card, Input, Button, Badge, Eyebrow, Modal, ConfirmButton } from "@/components/ui";
import { createVessel, updateVessel, setVesselActive } from "@/lib/vessels/actions";
import { formatVolume, volumeInputToLiters, volumeInputValue, volumeUnitLabel } from "@/lib/units/display";
import { useUnitPrefs } from "@/components/units/UnitsProvider";
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

// The vessel CATALOG is a tenant-global record (`entities.ts` marks `Vessel` `vineyardScoped: false`),
// so `createVessel` / `updateVessel` / `setVesselActive` are all `adminAction` as of the GLOBAL-1 fence.
// This gates the UI on the SAME predicate, so a non-admin no longer sees Add/edit affordances that the
// server will refuse. Operational vessel work (racking, transfers, topping) is elsewhere and stays open.
export function VesselsClient({ vessels, isAdmin }: { vessels: VesselRow[]; isAdmin: boolean }) {
  const vol = useUnitPrefs().volume;
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
        {isAdmin ? (
        <form
          onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const fd = new FormData(f); const cap = volumeInputToLiters(String(fd.get("capacityL") ?? ""), vol); if (cap != null) fd.set("capacityL", String(cap)); run(() => createVessel(fd), () => f.reset()); }}
          style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}
        >
          <input type="hidden" name="type" value={type} />
          <Input label={type === "BARREL" ? "Barrel #" : "Code"} name="code" placeholder={type === "BARREL" ? "1" : "TANK-001"} required style={{ flex: "1 1 150px" }} />
          <Input label={type === "BARREL" ? `Volume (${volumeUnitLabel(vol)})` : `Capacity (${volumeUnitLabel(vol)})`} name="capacityL" type="number" step="0.01" min="0.01" placeholder={type === "BARREL" ? volumeInputValue(225, vol) : volumeInputValue(5000, vol)} iconRight={<span style={{ fontSize: 13 }}>{volumeUnitLabel(vol)}</span>} required style={{ flex: "0 1 130px" }} />
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
        ) : null}

        {items.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No {title.toLowerCase()} yet.</p>
        ) : (
          <div>
            {items.map((v) => (
              <div
                key={v.id}
                id={`vessel-${v.id}`}
                className={v.isActive ? undefined : "bw-inactive"}
                style={{ borderTop: "1px solid var(--border-strong)", scrollMarginTop: 80 }}
              >
                {/* Identical content either way; only the AFFORDANCE differs. A non-admin gets a plain
                    row — no pointer, no focus stop, no "edit ›" — because the modal it opens is an
                    edit form the server would refuse. */}
                {(() => {
                  const rowStyle: React.CSSProperties = {
                    width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px",
                    background: "transparent", border: "none",
                    textAlign: "left", fontFamily: "var(--font-body)", fontSize: 14,
                  };
                  const rowContent = (
                    <>
                      <span style={{ fontWeight: 500, minWidth: 90 }}>{v.code}</span>
                      <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
                        <span style={{ flex: 1, height: 8, background: "var(--paper-200)", borderRadius: 999, overflow: "hidden" }}>
                          <span style={{ display: "block", width: `${Math.min(100, v.pct)}%`, height: "100%", background: v.over ? "var(--danger)" : "var(--accent)" }} />
                        </span>
                        <span style={{ fontSize: 12.5, color: v.over ? "var(--danger)" : "var(--text-muted)", whiteSpace: "nowrap" }}>{formatVolume(v.filledL, vol)} / {formatVolume(v.capacityL, vol)}</span>
                      </span>
                      {!v.isActive ? <Badge tone="neutral" variant="soft">inactive</Badge> : null}
                      {isAdmin ? <span style={{ color: "var(--text-accent)", fontSize: 13 }}>edit ›</span> : null}
                    </>
                  );
                  return isAdmin ? (
                    <button onClick={() => setSelectedId(v.id)} style={{ ...rowStyle, cursor: "pointer" }}>
                      {rowContent}
                    </button>
                  ) : (
                    <div style={rowStyle}>{rowContent}</div>
                  );
                })()}
                {/* The wine, then what it is made of. This was a wrap-around row of one badge per
                    resident lot — a vessel holds one wine now, so it names it and shows its makeup. */}
                {v.wine ? (
                  <div style={{ padding: "0 8px 6px 8px" }}>
                    <Link href={`/lots/${v.wine.lotId}`}>
                      <Badge tone="neutral" variant="soft">{v.wine.code} · {formatVolume(v.filledL, vol)}</Badge>
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
      <p style={{ color: "var(--text-secondary)", marginBottom: isAdmin ? 24 : 6, maxWidth: "60ch" }}>
        {isAdmin
          ? "Barrels and tanks at the winery, managed separately. Click a vessel to edit its code or capacity, or deactivate it."
          : "Barrels and tanks at the winery, and what each one currently holds."}
      </p>
      {isAdmin ? null : (
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24, maxWidth: "60ch" }}>
          An admin adds vessels and edits their codes and capacities. You can record cellar work against
          them from the cellar floor.
        </p>
      )}

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        {renderTypeCard("Barrels", "BARREL", barrels)}
        {renderTypeCard("Tanks", "TANK", tanks)}
      </div>

      {/* Belt-and-braces: only an admin can set `selectedId`, but the modal is an edit form, so it
          stays closed for a non-admin regardless of how the state got there. */}
      <Modal
        open={!!selected && isAdmin}
        onClose={() => setSelectedId(null)}
        title={selected ? `Edit ${selected.code}` : ""}
        subtitle={selected ? `${selected.type === "BARREL" ? "Barrel" : "Tank"} · currently holds ${formatVolume(selected.filledL, vol)}` : null}
        maxWidth={460}
      >
        {selected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <form
              onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const cap = volumeInputToLiters(String(fd.get("capacityL") ?? ""), vol, { display: volumeInputValue(selected.capacityL, vol), liters: selected.capacityL }); if (cap != null) fd.set("capacityL", String(cap)); run(() => updateVessel(selected.id, fd), () => setSelectedId(null)); }}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <input type="hidden" name="type" value={selected.type} />
              <Input label={selected.type === "BARREL" ? "Barrel #" : "Code"} name="code" defaultValue={selected.code} required />
              <Input label={selected.type === "BARREL" ? `Volume (${volumeUnitLabel(vol)})` : `Capacity (${volumeUnitLabel(vol)})`} name="capacityL" type="number" step="0.01" min="0.01" defaultValue={volumeInputValue(selected.capacityL, vol)} iconRight={<span style={{ fontSize: 13 }}>{volumeUnitLabel(vol)}</span>} hint={`${selected.filledL > 0 ? `Can't go below current contents (${formatVolume(selected.filledL, vol)}). ` : ""}${vol !== "L" ? `Stored as ${formatVolume(selected.capacityL, "L")}.` : ""}` || undefined} required />
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
