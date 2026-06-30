"use client";

import React from "react";
import { Badge, Button } from "@/components/ui";
import { FermentChart } from "@/components/ferment/FermentChart";
import { getFermentSeriesAction } from "@/lib/ferment/monitor-actions";
import { submitPanelAction } from "@/lib/ferment/round-actions";
import type { FermentSeries } from "@/lib/ferment/monitor-data";
import { checkBrix, checkTemp, toBrix } from "@/lib/ferment/sugar";

// Phase 6 (vessel-first): the Fermentation monitoring modal body. Logs sugar (Brix or Baumé),
// pH and temperature for the lot resident in this vessel, over time, and charts Brix+temp on a
// dual-Y axis with a pH companion. Writes through the idempotent panel path (reuses Phase 4
// AnalysisPanel, so it also feeds the lot's chemistry trend).

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

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

type Tone = React.ComponentProps<typeof Badge>["tone"];
const afTone = (s: string): Tone => (s === "ACTIVE" ? "gold" : s === "DRY" ? "maroon" : "neutral");
const mlfTone = (s: string): Tone => (s === "ACTIVE" ? "gold" : s === "COMPLETE" ? "green" : "neutral");

export function FermentMonitor({ vesselId, vesselCode, lotId, lotCode }: { vesselId: string; vesselCode: string; lotId: string; lotCode: string }) {
  const [series, setSeries] = React.useState<FermentSeries | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [sugar, setSugar] = React.useState("");
  const [unit, setUnit] = React.useState<"BRIX" | "BAUME">("BRIX");
  const [ph, setPh] = React.useState("");
  const [temp, setTemp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [okMsg, setOkMsg] = React.useState("");

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      setSeries(await getFermentSeriesAction(lotId));
    } finally {
      setLoading(false);
    }
  }, [lotId]);

  // Initial load: only set state AFTER the await (not the synchronous cascade the lint guards).
  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const s = await getFermentSeriesAction(lotId);
      if (alive) {
        setSeries(s);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [lotId]);

  const prevBrix = series?.points.filter((p) => p.brix != null).slice(-1)[0]?.brix ?? null;

  async function logReading() {
    setError("");
    setOkMsg("");
    const readings: { captureId: string; analyte: string; value: number; unit: string }[] = [];
    if (sugar.trim()) {
      const brixVal = toBrix(Number(sugar), unit);
      const g = checkBrix(brixVal, prevBrix);
      if (!g.ok) return setError(g.error);
      if (g.warning && !window.confirm(`${g.warning}\n\nLog it anyway?`)) return;
      readings.push({ captureId: newId(), analyte: "BRIX", value: brixVal, unit: "°Bx" });
    }
    if (ph.trim()) {
      const v = Number(ph);
      if (!Number.isFinite(v) || v < 2 || v > 5) return setError("pH should be between 2 and 5.");
      readings.push({ captureId: newId(), analyte: "PH", value: v, unit: "pH" });
    }
    if (temp.trim()) {
      const v = Number(temp);
      const g = checkTemp(v);
      if (!g.ok) return setError(g.error);
      readings.push({ captureId: newId(), analyte: "TEMP", value: v, unit: "°C" });
    }
    if (readings.length === 0) return setError("Enter at least one of sugar, pH or temperature.");

    setBusy(true);
    try {
      const res = await submitPanelAction({
        panelId: newId(),
        commandId: newId(),
        vesselId,
        lotId,
        occupancyToken: `${vesselId}:${lotId}`,
        deviceObservedAt: new Date().toISOString(),
        readings,
      });
      if (!res.ok) {
        setError(res.error === "STALE_OCCUPANCY" ? "This lot is no longer in this vessel — reopen from the current vessel." : `Couldn't save (${res.error}).`);
      } else {
        setOkMsg("Logged.");
        setSugar("");
        setPh("");
        setTemp("");
        await reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
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
      </div>

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
        <Button variant="primary" disabled={busy} onClick={() => void logReading()} style={{ minHeight: 44 }}>
          {busy ? "Logging…" : "Log reading"}
        </Button>
      </div>
      <div aria-live="polite" style={{ minHeight: 18, fontSize: 13, marginBottom: 12 }}>
        {error ? <span style={{ color: "var(--danger)" }}>{error}</span> : okMsg ? <span style={{ color: "var(--success, #2e7d32)" }}>{okMsg}</span> : null}
      </div>

      {/* Chart */}
      {loading && !series ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Loading…</p>
      ) : (
        <FermentChart points={series?.points ?? []} />
      )}
    </div>
  );
}
