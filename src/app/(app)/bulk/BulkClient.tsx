"use client";

import React from "react";
import Link from "next/link";
import { Card, Button, Badge, Eyebrow, Modal, ExportCsvButton } from "@/components/ui";
import type { BlendInfo } from "@/lib/bulk/blend";
import type { Fill } from "@/lib/vessels/fill";
import { addComponent, updateComponentVolume, removeComponent, setBlendName } from "@/lib/bulk/actions";
import type { CellarMaterialDTO } from "@/lib/cellar/materials";
import type { VesselGroupDTO } from "@/lib/vessels/groups";
import { CellarActions, type KegOption, type ResidentLot } from "./CellarActions";
import { VesselComposition } from "@/components/vessel/VesselComposition";
import { GroupActions, type GroupVessel } from "./GroupActions";

function vesselLabel(type: "BARREL" | "TANK", code: string): string {
  return type === "BARREL" ? `Barrel ${code}` : `Tank ${code}`;
}

export type Option = { id: string; name: string };
export type BlockOption = { id: string; vineyardId: string; blockLabel: string | null; code: string | null };
export type SubblockOption = { id: string; blockId: string; code: string; label: string | null };
export type Comp = { id: string; varietyId: string; varietyName: string; vineyardName: string; vintage: number; volumeL: number };
export type VesselWithContents = {
  id: string; code: string; type: "BARREL" | "TANK"; capacityL: number; blendName: string | null;
  components: Comp[]; blend: BlendInfo; fill: Fill;
  oakOrigin: string | null; cooperageYear: number | null; cooperage: string | null; toastLevel: string | null;
  lotCodes: string[];
  residentLots: ResidentLot[];
};

const selectStyle: React.CSSProperties = {
  height: 38, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-primary)",
};

/**
 * WHAT IS THIS — the first of the three questions a vessel answers (then fill, then composition).
 *
 * This used to say what the vessel was MADE OF ("Blend · 3", "100% Pinot Noir"), because a vessel was
 * a bag of components with no single identity. It holds one wine now (LEDGER-12), so it names that
 * wine — the winemaker's own blend name if they set one, otherwise the lot code. The makeup moved down
 * a line to <VesselComposition>, where it belongs and where it can be expanded.
 */
function WineBadge({ v }: { v: VesselWithContents }) {
  const resident = v.residentLots[0];
  if (!resident) return <Badge tone="neutral" variant="soft">empty</Badge>;
  return (
    <Badge tone={v.blend.isBlend ? "maroon" : "green"} variant="soft">{v.blendName || resident.code}</Badge>
  );
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
    ["Barrel #", v.code],
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

// Add-wine form: variety + vineyard (drives the optional block select) + vintage + litres,
// plus an optional sublot tag (experiments / differential picks). All feed the lot code.
function AddWineForm({
  vesselId,
  varieties,
  vineyards,
  blocks,
  subblocks,
  pending,
  run,
}: {
  vesselId: string;
  varieties: Option[];
  vineyards: Option[];
  blocks: BlockOption[];
  subblocks: SubblockOption[];
  pending: boolean;
  run: (fn: () => Promise<void>, after?: () => void) => void;
}) {
  const [vineyardId, setVineyardId] = React.useState("");
  const [blockId, setBlockId] = React.useState("");
  const vineyardBlocks = blocks.filter((b) => b.vineyardId === vineyardId);
  const blockSubblocks = subblocks.filter((s) => s.blockId === blockId);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        fd.set("vesselId", vesselId);
        run(async () => {
          await addComponent(fd);
          form.reset();
          setVineyardId("");
          setBlockId("");
        });
      }}
      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border-strong)", paddingTop: 14 }}
    >
      <select name="varietyId" style={selectStyle} required defaultValue="">
        <option value="" disabled>Variety</option>
        {varieties.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <select name="vineyardId" style={selectStyle} required value={vineyardId} onChange={(e) => { setVineyardId(e.target.value); setBlockId(""); }}>
        <option value="" disabled>Vineyard</option>
        {vineyards.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <select name="blockId" style={selectStyle} value={blockId} onChange={(e) => setBlockId(e.target.value)} disabled={!vineyardId || vineyardBlocks.length === 0} title="Block (optional)">
        <option value="">Block (optional)</option>
        {vineyardBlocks.map((b) => <option key={b.id} value={b.id}>{b.blockLabel || b.code || "Block"}</option>)}
      </select>
      <select name="subblockId" style={selectStyle} defaultValue="" disabled={!blockId || blockSubblocks.length === 0} title="Subblock (optional)">
        <option value="">Subblock (optional)</option>
        {blockSubblocks.map((s) => <option key={s.id} value={s.id}>{s.code}{s.label ? ` · ${s.label}` : ""}</option>)}
      </select>
      <input name="vintage" type="number" placeholder="Vintage" style={{ ...selectStyle, width: 96 }} required />
      <input name="volumeL" type="number" step="0.01" min="0.01" placeholder="Litres" style={{ ...selectStyle, width: 90 }} required />
      <input name="sublotTag" placeholder="Tag (opt.)" maxLength={8} title="Sublot tag for experiments / differential picks (optional)" style={{ ...selectStyle, width: 96, textTransform: "uppercase" }} />
      <Button type="submit" variant="primary" size="sm" disabled={pending}>Add to vessel</Button>
    </form>
  );
}

export function BulkClient({ vessels, varieties, vineyards, blocks, subblocks, materials, groups }: { vessels: VesselWithContents[]; varieties: Option[]; vineyards: Option[]; blocks: BlockOption[]; subblocks: SubblockOption[]; materials: CellarMaterialDTO[]; groups: VesselGroupDTO[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({});

  // Keg sources (topping) + group multi-select rows, derived from the vessel list.
  const kegOptions: KegOption[] = vessels.map((v) => ({ id: v.id, label: vesselLabel(v.type, v.code), type: v.type, totalL: v.fill.filledL, lotCodes: v.residentLots.map((r) => r.code) }));
  const groupVessels: GroupVessel[] = vessels.map((v) => ({
    id: v.id,
    code: v.code,
    label: vesselLabel(v.type, v.code),
    type: v.type,
    totalL: v.fill.filledL,
    lotCodes: v.lotCodes,
    varietyNames: [...new Set(v.components.map((c) => c.varietyName))],
    vineyardNames: [...new Set(v.components.map((c) => c.vineyardName))],
  }));

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

  const renderTypeCard = (title: string, items: VesselWithContents[]) => {
    const isOpen = openSections[title] ?? false;
    return (
      <Card style={{ flex: "1 1 380px" }}>
        <button
          type="button"
          onClick={() => setOpenSections((s) => ({ ...s, [title]: !isOpen }))}
          aria-expanded={isOpen}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 8, padding: 0,
            background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
            marginBottom: isOpen ? 12 : 0,
          }}
        >
          <span style={{ color: "var(--text-muted)", fontSize: 13, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform var(--duration-fast, 0.15s) ease", display: "inline-block" }}>▸</span>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22 }}>
            {title} <span style={{ color: "var(--text-muted)", fontSize: 15 }}>({items.length})</span>
          </span>
        </button>
        {!isOpen ? null : items.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No active {title.toLowerCase()}.</p>
        ) : (
          <div>
            {items.map((v) => (
              // The vessel answers three questions, in this order: what wine is this (WineBadge),
              // how much (FillBar), what is it made of (VesselComposition — one line, collapsed).
              <div key={v.id} style={{ borderTop: "1px solid var(--border-strong)", padding: "0 8px" }}>
                <button
                  onClick={() => setSelectedId(v.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                    background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left", fontFamily: "var(--font-body)", fontSize: 14,
                  }}
                >
                  <span style={{ fontWeight: 500, minWidth: 90 }}>{v.code}</span>
                  <FillBar v={v} />
                  <WineBadge v={v} />
                  <span style={{ color: "var(--text-accent)", fontSize: 13 }}>manage ›</span>
                </button>
                <VesselComposition totalVolumeL={v.fill.filledL} components={v.components} style={{ marginTop: -6 }} />
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div>
      <Eyebrow rule>In-process wine · Winery</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Wine in-progress</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 16, maxWidth: "64ch" }}>
        Barrels and tanks at the winery. Click a vessel to see what&rsquo;s inside and add, adjust, or remove wine.
      </p>

      <div style={{ marginBottom: 20 }}>
        <ExportCsvButton
          filename="bulk-wine.csv"
          columns={[
            { key: "vessel", label: "Vessel" },
            { key: "type", label: "Type" },
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

      {vessels.length > 0 ? (
        <GroupActions
          groups={groups}
          vessels={groupVessels}
          materials={materials}
          varietyNames={varieties.map((v) => v.name)}
          vineyardNames={vineyards.map((v) => v.name)}
        />
      ) : null}

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
          {renderTypeCard("Barrels", barrels)}
          {renderTypeCard("Tanks", tanks)}
        </div>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? selected.code : ""}
        subtitle={selected ? <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>{selected.type === "BARREL" ? "Barrel" : "Tank"} · {selected.fill.filledL}/{selected.capacityL} L ({selected.fill.pct}%)<WineBadge v={selected} /></span> : null}
      >
        {selected ? (
          <div>
            <BarrelMeta v={selected} />
            {/* The wine, named and linked, with what it is made of underneath. This replaces a separate
                "Blends in this vessel" list that existed only because the component projection couldn't
                represent an origin-less blend lot — it can now (composeLeaves), so there is one wine. */}
            {selected.residentLots[0] ? (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{selected.residentLots[0].code}</span>
                  {selected.residentLots[0].varietyName ? <span style={{ color: "var(--text-muted)" }}>{selected.residentLots[0].varietyName}</span> : null}
                  <Link href={`/lots/${selected.residentLots[0].lotId}`} style={{ marginLeft: "auto", color: "var(--text-accent)", fontSize: 13 }}>view lot ›</Link>
                </div>
                <VesselComposition totalVolumeL={selected.fill.filledL} components={selected.components} />
              </div>
            ) : null}
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
            ) : null}

            {selected.residentLots.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 14 }}>This vessel is empty.</p>
            ) : null}

            {canFill ? (
              <AddWineForm vesselId={selected.id} varieties={varieties} vineyards={vineyards} blocks={blocks} subblocks={subblocks} pending={pending} run={run} />
            ) : null}

            <CellarActions
              key={selected.id}
              vessel={{ id: selected.id, code: selected.code, type: selected.type, capacityL: selected.capacityL, totalL: selected.fill.filledL, residentLots: selected.residentLots }}
              materials={materials}
              kegOptions={kegOptions}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
