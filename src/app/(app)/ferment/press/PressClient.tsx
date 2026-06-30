"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PressablePosition, PressDestVessel } from "@/lib/ferment/press-data";
import { pressAction } from "@/lib/transform/actions";

// Phase 6 Unit 9: press a must/wine lot into fractions. Pick a pressable position (vessel-first),
// add N fraction rows {destination vessel, volume, estimated?, label, merge-into?} with a running
// total + derived lees loss. SAIGNEE = pick a MUST position + one juice fraction. On success →
// the parent lot detail. expectedRevision guards a concurrent change (council S7).

const field: React.CSSProperties = {
  height: 44,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};
const label: React.CSSProperties = { fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", display: "block", marginBottom: 4 };

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

type Fraction = { destVesselId: string; volumeL: string; label: string; estimated: boolean; mergeIntoLotId: string };

export function PressClient({ positions, vessels }: { positions: PressablePosition[]; vessels: PressDestVessel[] }) {
  const router = useRouter();
  const [posKey, setPosKey] = React.useState(positions[0] ? `${positions[0].vesselId}:${positions[0].lotId}` : "");
  const pos = positions.find((p) => `${p.vesselId}:${p.lotId}` === posKey);
  const [op, setOp] = React.useState<"PRESS" | "SAIGNEE">("PRESS");
  const [fractions, setFractions] = React.useState<Fraction[]>([
    { destVesselId: vessels[0]?.id ?? "", volumeL: "", label: "free-run", estimated: false, mergeIntoLotId: "" },
  ]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const fractionTotal = fractions.reduce((a, f) => a + (Number(f.volumeL) || 0), 0);
  const available = pos?.volumeL ?? 0;
  const lees = Math.round((available - fractionTotal) * 100) / 100;

  const setFraction = (i: number, patch: Partial<Fraction>) =>
    setFractions((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const addFraction = () => setFractions((fs) => [...fs, { destVesselId: vessels[0]?.id ?? "", volumeL: "", label: "press", estimated: false, mergeIntoLotId: "" }]);
  const removeFraction = (i: number) => setFractions((fs) => fs.filter((_, j) => j !== i));

  async function submit() {
    setError("");
    if (!pos) return setError("Pick a lot to press.");
    const fr = fractions.filter((f) => Number(f.volumeL) > 0 && f.destVesselId);
    if (fr.length === 0) return setError("Add at least one fraction with a volume.");
    if (fractionTotal > available + 1e-6) return setError(`Fractions (${fractionTotal} L) exceed what the lot holds (${available} L).`);
    setBusy(true);
    try {
      await pressAction({
        commandId: newId(),
        parentLotId: pos.lotId,
        sourceVesselId: pos.vesselId,
        expectedRevision: pos.revision,
        op,
        lossL: lees > 0 ? lees : 0,
        fractions: fr.map((f) => ({
          destVesselId: f.destVesselId,
          volumeL: Number(f.volumeL),
          label: f.label,
          estimated: f.estimated,
          mergeIntoLotId: f.mergeIntoLotId || null,
        })),
      });
      router.push(`/lots/${pos.lotId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Press failed.");
      setBusy(false);
    }
  }

  if (positions.length === 0) {
    return (
      <div style={{ maxWidth: "var(--container-md)", margin: "0 auto", padding: "var(--space-5)", color: "var(--text-muted)" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300 }}>Press</h1>
        <p>No must lots to press. Crush fruit first — then press a white must immediately, or a red must once it&apos;s fermented dry on skins.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "var(--container-md)", margin: "0 auto", padding: "var(--space-5)", paddingBottom: 120 }}>
      <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 26 }}>Press</h1>

      <label style={label}>Lot to press</label>
      <select value={posKey} onChange={(e) => setPosKey(e.target.value)} style={{ ...field, width: "100%" }}>
        {positions.map((p) => (
          <option key={`${p.vesselId}:${p.lotId}`} value={`${p.vesselId}:${p.lotId}`}>
            {p.vesselCode} · {p.lotCode} · {p.form} ({p.volumeL} L)
          </option>
        ))}
      </select>

      <div style={{ marginTop: 12 }}>
        <label style={label}>Operation</label>
        <select value={op} onChange={(e) => setOp(e.target.value as "PRESS" | "SAIGNEE")} style={{ ...field, width: 220 }}>
          <option value="PRESS">Press (free-run + press cuts)</option>
          <option value="SAIGNEE">Saignée (bleed juice off must)</option>
        </select>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={label}>Fractions</label>
        {fractions.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <input value={f.label} onChange={(e) => setFraction(i, { label: e.target.value })} placeholder="label" aria-label="Fraction label" style={{ ...field, width: 110 }} />
            <select value={f.destVesselId} onChange={(e) => setFraction(i, { destVesselId: e.target.value })} aria-label="Destination vessel" style={{ ...field, width: 140 }}>
              {vessels.map((v) => (
                <option key={v.id} value={v.id}>{v.code}</option>
              ))}
            </select>
            <input value={f.volumeL} onChange={(e) => setFraction(i, { volumeL: e.target.value })} inputMode="decimal" placeholder="L" aria-label="Fraction volume" style={{ ...field, width: 90, textAlign: "right" }} />
            <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center", color: "var(--text-muted)" }}>
              <input type="checkbox" checked={f.estimated} onChange={(e) => setFraction(i, { estimated: e.target.checked })} /> est.
            </label>
            {fractions.length > 1 ? (
              <button onClick={() => removeFraction(i)} aria-label="Remove fraction" style={{ ...field, width: 40, cursor: "pointer", background: "var(--surface-base)" }}>×</button>
            ) : null}
          </div>
        ))}
        <button onClick={addFraction} style={{ ...field, cursor: "pointer", background: "var(--surface-base)", paddingInline: 14 }}>+ fraction</button>
      </div>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginTop: 12 }}>{error}</p> : null}

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--surface-base)",
          borderTop: "1px solid var(--border-strong)",
          padding: "var(--space-3) var(--space-5)",
          display: "flex",
          gap: 16,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
          {fractionTotal} L into {fractions.filter((f) => Number(f.volumeL) > 0).length} fraction(s)
          {lees > 0 ? ` · ${lees} L lees` : ""}{available > 0 ? ` · of ${available} L` : ""}
        </div>
        <button onClick={() => void submit()} disabled={busy} style={{ ...field, cursor: "pointer", background: "var(--accent)", color: "#fff", border: "none", paddingInline: 20 }}>
          {busy ? "Pressing…" : op === "SAIGNEE" ? "Bleed" : "Press"}
        </button>
      </div>
    </div>
  );
}
