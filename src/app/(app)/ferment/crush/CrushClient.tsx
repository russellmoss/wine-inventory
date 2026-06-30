"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { CrushBlockOption, CrushVesselOption } from "@/lib/ferment/crush-data";
import { crushAction } from "@/lib/transform/actions";

// Phase 6 Unit 9: crush picks → a must lot. Single page + sticky summary (Phase 5 precedent).
// Per-pick consumed-kg (default = full remaining; partial allowed); NEW lot OR sequential-fill
// ADD into an existing must lot; MEASURED output liters (yield computes live, never entered);
// %whole-cluster / must-temp / notes. On success → navigate to the lot detail.

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

export function CrushClient({ blocks, vessels }: { blocks: CrushBlockOption[]; vessels: CrushVesselOption[] }) {
  const router = useRouter();
  const [blockId, setBlockId] = React.useState(blocks[0]?.blockId ?? "");
  const block = blocks.find((b) => b.blockId === blockId);
  const [consumed, setConsumed] = React.useState<Record<string, string>>({});
  const [destVesselId, setDestVesselId] = React.useState(vessels[0]?.id ?? "");
  const dest = vessels.find((v) => v.id === destVesselId);
  const [mode, setMode] = React.useState<"NEW" | "ADD">("NEW");
  const [addLotId, setAddLotId] = React.useState("");
  const [outputL, setOutputL] = React.useState("");
  const [wholeCluster, setWholeCluster] = React.useState("");
  const [mustTemp, setMustTemp] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  // Each pick's consumed-kg defaults to its full remaining until the operator edits it (derived
  // in render — no effect needed). The chosen vessel's must lots drive whether ADD is available.
  const consumedFor = (pickId: string, remainingKg: number) => consumed[pickId] ?? String(remainingKg);
  const canAdd = (dest?.mustLots.length ?? 0) > 0;
  const effMode: "NEW" | "ADD" = canAdd && mode === "ADD" ? "ADD" : "NEW";

  const selectedPicks = (block?.picks ?? [])
    .map((p) => ({ pick: p, kg: Number(consumedFor(p.pickId, p.remainingKg)) }))
    .filter((x) => x.kg > 0);
  const totalKg = selectedPicks.reduce((a, x) => a + x.kg, 0);
  const outL = Number(outputL) || 0;
  const yieldLPerTonne = totalKg > 0 && outL > 0 ? Math.round((outL / totalKg) * 1000 * 100) / 100 : null;

  async function submit() {
    setError("");
    if (selectedPicks.length === 0) return setError("Enter consumed kg for at least one pick.");
    if (!(outL > 0)) return setError("Enter the measured must volume (liters).");
    if (effMode === "ADD" && !addLotId) return setError("Pick the must lot to add into.");
    // Over-consume guard (UI-side; the core re-checks against live LotHarvestSource).
    for (const { pick, kg } of selectedPicks) {
      if (kg > pick.remainingKg + 1e-6) return setError(`Pick ${pick.pickDate}: only ${pick.remainingKg} kg remain.`);
    }
    setBusy(true);
    try {
      const result = await crushAction({
        commandId: newId(),
        picks: selectedPicks.map((x) => ({ pickId: x.pick.pickId, consumedKg: x.kg })),
        destVesselId,
        outputVolumeL: outL,
        target:
          effMode === "NEW"
            ? { mode: "NEW", varietyId: block?.varietyId ?? null, vintage: block!.vintageYear, wholeClusterPct: wholeCluster ? Number(wholeCluster) : null }
            : { mode: "ADD", lotId: addLotId },
        mustTempC: mustTemp ? Number(mustTemp) : null,
        note: note.trim() || null,
      });
      router.push(`/lots/${result.lotId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Crush failed.");
      setBusy(false);
    }
  }

  if (blocks.length === 0) {
    return (
      <div style={{ maxWidth: "var(--container-md)", margin: "0 auto", padding: "var(--space-5)", color: "var(--text-muted)" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300 }}>Crush</h1>
        <p>No harvest picks with fruit remaining. Record picks under Harvest first.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "var(--container-md)", margin: "0 auto", padding: "var(--space-5)", paddingBottom: 120 }}>
      <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 26 }}>Crush</h1>

      <label style={label}>Block (vintage)</label>
      <select value={blockId} onChange={(e) => setBlockId(e.target.value)} style={{ ...field, width: "100%" }}>
        {blocks.map((b) => (
          <option key={b.blockId} value={b.blockId}>
            {b.label} — {b.vintageYear}
          </option>
        ))}
      </select>

      <div style={{ marginTop: 16 }}>
        <label style={label}>Picks — consumed kg (default = remaining; partial allowed)</label>
        {block?.picks.map((p) => (
          <div key={p.pickId} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <span style={{ flex: 1, fontSize: 13 }}>
              {p.pickDate} · {p.remainingKg} kg left{p.brixAtPick != null ? ` · ${p.brixAtPick} °Bx` : ""}
            </span>
            <input
              value={consumedFor(p.pickId, p.remainingKg)}
              onChange={(e) => setConsumed((c) => ({ ...c, [p.pickId]: e.target.value }))}
              inputMode="decimal"
              aria-label={`Consumed kg for pick ${p.pickDate}`}
              style={{ ...field, width: 120, textAlign: "right" }}
            />
            <span style={{ fontSize: 12, color: "var(--text-muted)", width: 24 }}>kg</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px" }}>
          <label style={label}>Destination vessel</label>
          <select value={destVesselId} onChange={(e) => setDestVesselId(e.target.value)} style={{ ...field, width: "100%" }}>
            {vessels.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} ({v.capacityL} L)
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 240px" }}>
          <label style={label}>Target lot</label>
          <select value={effMode === "ADD" ? addLotId : "NEW"} onChange={(e) => { if (e.target.value === "NEW") setMode("NEW"); else { setMode("ADD"); setAddLotId(e.target.value); } }} style={{ ...field, width: "100%" }}>
            <option value="NEW">New must lot</option>
            {dest?.mustLots.map((l) => (
              <option key={l.lotId} value={l.lotId}>
                Add into {l.code} ({l.volumeL} L)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px" }}>
          <label style={label}>Measured must (L)</label>
          <input value={outputL} onChange={(e) => setOutputL(e.target.value)} inputMode="decimal" placeholder="e.g. 2350" style={{ ...field, width: "100%" }} />
        </div>
        {effMode === "NEW" ? (
          <div style={{ flex: "1 1 120px" }}>
            <label style={label}>Whole cluster %</label>
            <input value={wholeCluster} onChange={(e) => setWholeCluster(e.target.value)} inputMode="decimal" placeholder="0" style={{ ...field, width: "100%" }} />
          </div>
        ) : null}
        <div style={{ flex: "1 1 120px" }}>
          <label style={label}>Must temp °C</label>
          <input value={mustTemp} onChange={(e) => setMustTemp(e.target.value)} inputMode="decimal" placeholder="optional" style={{ ...field, width: "100%" }} />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={label}>Note</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" style={{ ...field, width: "100%" }} />
      </div>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginTop: 12 }}>{error}</p> : null}

      {/* Sticky summary bar */}
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
          <strong style={{ color: "var(--text-primary)" }}>{effMode === "NEW" ? `New ${block?.vintageYear ?? ""} must lot` : `Adding to ${dest?.mustLots.find((l) => l.lotId === addLotId)?.code ?? "lot"}`}</strong>
          {" · "}
          {totalKg > 0 ? `${Math.round(totalKg * 1000) / 1000} kg` : "no picks"}
          {yieldLPerTonne != null ? ` → ${outL} L (${yieldLPerTonne} L/t)` : ""}
        </div>
        <button onClick={() => void submit()} disabled={busy} style={{ ...field, cursor: "pointer", background: "var(--accent)", color: "#fff", border: "none", paddingInline: 20 }}>
          {busy ? "Crushing…" : "Crush"}
        </button>
      </div>
    </div>
  );
}
