"use client";

import React from "react";
import { Card, Button, Input, Eyebrow, Badge } from "@/components/ui";
import { issueWeighTag, voidWeighTag } from "./actions";

// Plan 093 Unit 10b (design-reviewed): the weigh-tag entry screen. Wet-hands crush-pad receiving. Tag
// header (net is the anchor figure) → add-a-bin repeater (each defaults to "needs assignment" so a
// weighmaster can log a bin with only a weight) → issue (a gap-free certificate number). Tokens only,
// sentence-case, tabular weights, 44px targets. Owner renders NULL as "Estate (facility)", distinct from
// the "Needs assignment" default.

type Ref = { id: string; name: string };
type BlockRef = { id: string; label: string };

export type RecentTag = {
  id: string;
  tagNumber: number;
  truck: string | null;
  weighmaster: string | null;
  netKg: number | null;
  issuedAt: string;
  voided: boolean;
  voidedReason: string | null;
  lineCount: number;
  needsAssignmentCount: number;
};

const OWNER_NEEDS = "__needs__";
const OWNER_ESTATE = "__estate__";

type BinRow = { key: string; binOrGroup: string; netKg: string; growerId: string; ownerSel: string; blockId: string };

const emptyBin = (): BinRow => ({ key: Math.random().toString(36).slice(2), binOrGroup: "", netKg: "", growerId: "", ownerSel: OWNER_NEEDS, blockId: "" });
const numOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));

const label: React.CSSProperties = { fontSize: "var(--text-caption)", color: "var(--text-secondary)", fontWeight: "var(--weight-medium)" as unknown as number, display: "block", marginBottom: 4 };
const selectStyle: React.CSSProperties = { height: 44, padding: "0 12px", fontSize: 15, fontFamily: "var(--font-body)", color: "var(--text-primary)", background: "var(--surface-raised)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--border-strong)", borderRadius: "var(--radius-md)", width: "100%" };
const tabular: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

export function WeighTagIntake({ owners, growers, blocks, recent }: { owners: Ref[]; growers: Ref[]; blocks: BlockRef[]; recent: RecentTag[] }) {
  const [truck, setTruck] = React.useState("");
  const [weighmaster, setWeighmaster] = React.useState("");
  const [grossKg, setGrossKg] = React.useState("");
  const [tareKg, setTareKg] = React.useState("");
  const [netKg, setNetKg] = React.useState("");
  const [bins, setBins] = React.useState<BinRow[]>([emptyBin()]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<{ tagNumber: number; needs: number } | null>(null);

  // Net auto-derives from gross − tare (the scale ticket), but stays editable (some scales print net).
  const derivedNet = grossKg.trim() !== "" && tareKg.trim() !== "" ? String(Math.round((Number(grossKg) - Number(tareKg)) * 1000) / 1000) : "";
  const effectiveNet = netKg.trim() !== "" ? netKg : derivedNet;

  const setBin = (key: string, patch: Partial<BinRow>) => setBins((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const addBin = () => setBins((bs) => [...bs, emptyBin()]);
  const removeBin = (key: string) => setBins((bs) => (bs.length === 1 ? bs : bs.filter((b) => b.key !== key)));

  const needsCount = bins.filter((b) => b.ownerSel === OWNER_NEEDS).length;

  async function issue() {
    setError(null);
    setIssued(null);
    setBusy(true);
    try {
      const lines = bins.map((b) => ({
        binOrGroup: b.binOrGroup.trim() || null,
        netKg: numOrNull(b.netKg),
        growerId: b.growerId || null,
        blockId: b.blockId || null,
        ownerId: b.ownerSel !== OWNER_NEEDS && b.ownerSel !== OWNER_ESTATE ? b.ownerSel : null,
        estate: b.ownerSel === OWNER_ESTATE,
      }));
      const res = await issueWeighTag({
        truck: truck.trim() || null,
        weighmaster: weighmaster.trim() || null,
        grossKg: numOrNull(grossKg),
        tareKg: numOrNull(tareKg),
        netKg: numOrNull(effectiveNet),
        lines,
      });
      if (!res.ok) { setError(res.error); return; }
      setIssued({ tagNumber: res.data.tagNumber, needs: res.data.needsAssignmentCount });
      // Reset for the next truck; keep weighmaster (same person weighs the shift).
      setTruck(""); setGrossKg(""); setTareKg(""); setNetKg(""); setBins([emptyBin()]);
    } catch {
      setError("Something went wrong issuing the tag. Your entries are still here — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
      <div>
        <Eyebrow>Harvest intake</Eyebrow>
        <h1 style={{ margin: "4px 0 0", fontFamily: "var(--font-heading)", fontWeight: 300 }}>Weigh-tags</h1>
        <p style={{ color: "var(--text-secondary)", margin: "6px 0 0", maxWidth: 620 }}>
          Weigh-tags certify fruit as it arrives. One tag per truck; add a line per bin. A bin can be issued
          with only a weight — assign its owner later.
        </p>
      </div>

      {issued ? (
        <Card style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}>
          <strong style={tabular}>Weigh-tag #{issued.tagNumber} issued.</strong>{" "}
          {issued.needs > 0 ? <span style={{ color: "var(--text-secondary)" }}>{issued.needs} line{issued.needs === 1 ? "" : "s"} need an owner assigned.</span> : <span style={{ color: "var(--text-secondary)" }}>All lines assigned.</span>}
        </Card>
      ) : null}

      <Card>
        <Eyebrow>Tag header</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginTop: 12 }}>
          <Input label="Truck" value={truck} onChange={(e) => setTruck(e.target.value)} placeholder="Hauler / plate" />
          <Input label="Weighmaster" value={weighmaster} onChange={(e) => setWeighmaster(e.target.value)} placeholder="Who weighed it" />
          <Input label="Gross (kg)" type="number" inputMode="decimal" value={grossKg} onChange={(e) => setGrossKg(e.target.value)} inputStyle={tabular} />
          <Input label="Tare (kg)" type="number" inputMode="decimal" value={tareKg} onChange={(e) => setTareKg(e.target.value)} inputStyle={tabular} />
          <Input label="Net (kg)" type="number" inputMode="decimal" value={effectiveNet} onChange={(e) => setNetKg(e.target.value)} hint={netKg.trim() === "" && derivedNet !== "" ? "auto (gross − tare)" : undefined} inputStyle={{ ...tabular, fontWeight: 600 }} />
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <Eyebrow>Bins</Eyebrow>
          {needsCount > 0 ? <Badge>{needsCount} need assignment</Badge> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          {bins.map((b, i) => (
            <div key={b.key} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr)) auto", gap: 10, alignItems: "end", paddingBottom: 12, borderBottom: i < bins.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
              <Input label="Bin / group" value={b.binOrGroup} onChange={(e) => setBin(b.key, { binOrGroup: e.target.value })} placeholder={`Bin ${i + 1}`} />
              <Input label="Net (kg)" type="number" inputMode="decimal" value={b.netKg} onChange={(e) => setBin(b.key, { netKg: e.target.value })} inputStyle={tabular} />
              <div>
                <span style={label}>Grower</span>
                <select style={selectStyle} value={b.growerId} onChange={(e) => setBin(b.key, { growerId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {growers.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <span style={label}>Owner</span>
                <select style={selectStyle} value={b.ownerSel} onChange={(e) => setBin(b.key, { ownerSel: e.target.value })}>
                  <option value={OWNER_NEEDS}>Needs assignment</option>
                  <option value={OWNER_ESTATE}>Estate (facility)</option>
                  {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <span style={label}>Block</span>
                <select style={selectStyle} value={b.blockId} onChange={(e) => setBin(b.key, { blockId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {blocks.map((bl) => <option key={bl.id} value={bl.id}>{bl.label}</option>)}
                </select>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeBin(b.key)} disabled={bins.length === 1} style={{ height: 44 }} aria-label={`Remove bin ${i + 1}`}>Remove</Button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Button variant="secondary" onClick={addBin}>Add bin</Button>
        </div>
      </Card>

      {error ? <Card style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{error}</Card> : null}

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Button onClick={issue} disabled={busy} size="lg">{busy ? "Issuing…" : "Issue tag"}</Button>
        {owners.length === 0 ? <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-body-sm)" }}>No clients yet — bins default to Estate or Needs assignment. Add clients in setup.</span> : null}
      </div>

      <Card>
        <Eyebrow>Recent weigh-tags</Eyebrow>
        {recent.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", margin: "12px 0 0" }}>No weigh-tags yet. Issue the first one above when a truck arrives.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-body-sm)" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-secondary)" }}>
                  <th style={{ padding: "6px 10px 6px 0" }}>#</th>
                  <th style={{ padding: "6px 10px" }}>Truck</th>
                  <th style={{ padding: "6px 10px" }}>Bins</th>
                  <th style={{ padding: "6px 10px", textAlign: "right" }}>Net (kg)</th>
                  <th style={{ padding: "6px 10px" }}>Status</th>
                  <th style={{ padding: "6px 0 6px 10px" }} />
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <RecentRow key={t.id} tag={t} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function RecentRow({ tag }: { tag: RecentTag }) {
  const [voiding, setVoiding] = React.useState(false);
  const [voided, setVoided] = React.useState(tag.voided);
  async function doVoid() {
    const reason = window.prompt(`Void weigh-tag #${tag.tagNumber}? Give a reason (it stays visible, never deleted):`);
    if (!reason || !reason.trim()) return;
    setVoiding(true);
    try {
      const res = await voidWeighTag({ weighTagId: tag.id, reason: reason.trim() });
      if (res.ok) setVoided(true);
      else window.alert(res.error);
    } finally {
      setVoiding(false);
    }
  }
  return (
    <tr style={{ borderTop: "1px solid var(--border-subtle)", opacity: voided ? 0.55 : 1, textDecoration: voided ? "line-through" : "none" }}>
      <td style={{ padding: "8px 10px 8px 0", ...tabular, fontWeight: 600 }}>{tag.tagNumber}</td>
      <td style={{ padding: "8px 10px" }}>{tag.truck ?? "—"}</td>
      <td style={{ padding: "8px 10px", ...tabular }}>{tag.lineCount}</td>
      <td style={{ padding: "8px 10px", textAlign: "right", ...tabular }}>{tag.netKg == null ? "—" : tag.netKg.toLocaleString()}</td>
      <td style={{ padding: "8px 10px" }}>{voided ? "Voided" : tag.needsAssignmentCount > 0 ? `${tag.needsAssignmentCount} to assign` : "Assigned"}</td>
      <td style={{ padding: "8px 0 8px 10px", textAlign: "right" }}>{voided ? null : <Button variant="ghost" size="sm" onClick={doVoid} disabled={voiding}>{voiding ? "Voiding…" : "Void"}</Button>}</td>
    </tr>
  );
}
