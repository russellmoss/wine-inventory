"use client";

import React from "react";
import { Badge, Button } from "@/components/ui";
import { FermentChart } from "@/components/ferment/FermentChart";
import { getFermentSeriesAction } from "@/lib/ferment/monitor-actions";
import { useSync } from "@/lib/offline/useSync";
import type { FermentSeries, FermentPoint } from "@/lib/ferment/monitor-data";
import { checkBrix, checkTemp, toBrix } from "@/lib/ferment/sugar";

// Phase 6 (vessel-first): the Fermentation monitoring modal body. Logs sugar (Brix or Baumé),
// pH and temperature for the lot resident in this vessel, over time, and charts Brix+temp on a
// dual-Y axis with a pH companion. Capture goes through the OFFLINE OUTBOX (Dexie → idempotent
// drain) so a reading survives a wifi drop on the crush pad; the row is durable on the device
// the instant you tap Log, then syncs in the background. Optimistic points show on the chart
// immediately; once everything syncs we reload the canonical server series.

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
const lbl: React.CSSProperties = { fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", display: "block", marginBottom: 4 };

type Tone = React.ComponentProps<typeof Badge>["tone"];
const afTone = (s: string): Tone => (s === "ACTIVE" ? "gold" : s === "DRY" ? "maroon" : "neutral");
const mlfTone = (s: string): Tone => (s === "ACTIVE" ? "gold" : s === "COMPLETE" ? "green" : "neutral");

export function FermentMonitor({ vesselId, vesselCode, lotId, lotCode }: { vesselId: string; vesselCode: string; lotId: string; lotCode: string }) {
  const { pending, attention, syncing, capture } = useSync();
  const [series, setSeries] = React.useState<FermentSeries | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [optimistic, setOptimistic] = React.useState<FermentPoint[]>([]); // logged this session, awaiting sync
  const [sugar, setSugar] = React.useState("");
  const [unit, setUnit] = React.useState<"BRIX" | "BAUME">("BRIX");
  const [ph, setPh] = React.useState("");
  const [temp, setTemp] = React.useState("");
  const [error, setError] = React.useState("");
  const [okMsg, setOkMsg] = React.useState("");

  const reload = React.useCallback(async () => {
    try {
      const s = await getFermentSeriesAction(lotId);
      setSeries(s);
      return s;
    } catch {
      return null; // offline — keep showing what we have + optimistic points
    }
  }, [lotId]);

  // Initial load (set state only after the await — not the synchronous cascade the lint guards).
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const s = await getFermentSeriesAction(lotId).catch(() => null);
      if (alive) {
        setSeries(s);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [lotId]);

  // When the outbox drains to empty, the server now has everything we logged — reload the
  // canonical series and drop the optimistic placeholders (setState only after the awaits).
  React.useEffect(() => {
    if (!(pending === 0 && !syncing && optimistic.length > 0)) return;
    void (async () => {
      await reload();
      setOptimistic([]);
    })();
  }, [pending, syncing, optimistic.length, reload]);

  const serverPoints = series?.points ?? [];
  const prevBrix = [...serverPoints, ...optimistic].filter((p) => p.brix != null).slice(-1)[0]?.brix ?? null;
  const chartPoints = [...serverPoints, ...optimistic].sort((a, b) => a.observedAt.localeCompare(b.observedAt));

  async function logReading() {
    setError("");
    setOkMsg("");
    const readings: { analyte: string; value: number; unit: string }[] = [];
    let brixVal: number | null = null;
    let phVal: number | null = null;
    let tempVal: number | null = null;
    if (sugar.trim()) {
      brixVal = toBrix(Number(sugar), unit);
      const g = checkBrix(brixVal, prevBrix);
      if (!g.ok) return setError(g.error);
      if (g.warning && !window.confirm(`${g.warning}\n\nLog it anyway?`)) return;
      readings.push({ analyte: "BRIX", value: brixVal, unit: "°Bx" });
    }
    if (ph.trim()) {
      phVal = Number(ph);
      if (!Number.isFinite(phVal) || phVal < 2 || phVal > 5) return setError("pH should be between 2 and 5.");
      readings.push({ analyte: "PH", value: phVal, unit: "pH" });
    }
    if (temp.trim()) {
      tempVal = Number(temp);
      const g = checkTemp(tempVal);
      if (!g.ok) return setError(g.error);
      readings.push({ analyte: "TEMP", value: tempVal, unit: "°C" });
    }
    if (readings.length === 0) return setError("Enter at least one of sugar, pH or temperature.");

    const observedAt = new Date().toISOString();
    try {
      await capture({ vesselId, lotId, occupancyToken: `${vesselId}:${lotId}`, deviceObservedAt: observedAt, readings });
      setOptimistic((o) => [...o, { observedAt, brix: brixVal, ph: phVal, temp: tempVal }]);
      setOkMsg("Saved on device");
      setSugar("");
      setPh("");
      setTemp("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{vesselCode}</span>
        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 13 }}>{lotCode}</span>
        {series ? (
          <>
            <Badge tone={afTone(series.afState)} variant="soft">AF {series.afState.toLowerCase()}</Badge>
            <Badge tone={mlfTone(series.mlfState)} variant="soft">MLF {series.mlfState.toLowerCase()}</Badge>
            <Badge tone="neutral" variant="soft">{series.form.toLowerCase()}</Badge>
            {series.stuck.stuck ? <Badge tone="maroon" variant="soft">⚠ stuck</Badge> : null}
          </>
        ) : null}
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--text-muted)" }} aria-live="polite">
          {pending > 0 ? `${pending} waiting to sync${syncing ? "…" : ""}` : "All synced"}
        </span>
      </div>

      {attention.length > 0 ? (
        <p style={{ fontSize: 13, color: "var(--danger)", margin: "0 0 8px" }}>
          {attention.length} reading(s) couldn&apos;t attach (the vessel changed since capture) — re-check in the cellar.
        </p>
      ) : null}

      {/* Capture row */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <label style={lbl}>Sugar{prevBrix != null ? ` (prev ${prevBrix} °Bx)` : ""}</label>
          <div style={{ display: "flex", gap: 4 }}>
            <input value={sugar} onChange={(e) => setSugar(e.target.value)} inputMode="decimal" placeholder="sugar" aria-label="Sugar" style={{ ...field, width: 90 }} />
            <select value={unit} onChange={(e) => setUnit(e.target.value as "BRIX" | "BAUME")} aria-label="Sugar unit" style={{ ...field, width: 92 }}>
              <option value="BRIX">°Bx</option>
              <option value="BAUME">°Bé</option>
            </select>
          </div>
        </div>
        <div>
          <label style={lbl}>pH</label>
          <input value={ph} onChange={(e) => setPh(e.target.value)} inputMode="decimal" placeholder="pH" aria-label="pH" style={{ ...field, width: 80 }} />
        </div>
        <div>
          <label style={lbl}>Temp °C</label>
          <input value={temp} onChange={(e) => setTemp(e.target.value)} inputMode="decimal" placeholder="°C" aria-label="Temperature" style={{ ...field, width: 80 }} />
        </div>
        <Button variant="primary" onClick={() => void logReading()} style={{ minHeight: 44 }}>
          Log reading
        </Button>
      </div>
      <div aria-live="polite" style={{ minHeight: 18, fontSize: 13, marginBottom: 12 }}>
        {error ? <span style={{ color: "var(--danger)" }}>{error}</span> : okMsg ? <span style={{ color: "var(--text-muted)" }}>{okMsg} ↑</span> : null}
      </div>

      {/* Chart */}
      {loading && !series ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Loading…</p>
      ) : (
        <FermentChart points={chartPoints} />
      )}
    </div>
  );
}
