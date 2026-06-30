"use client";

import * as React from "react";
import type { RoundRow } from "@/lib/ferment/round-data";
import { useSync } from "@/lib/offline/useSync";
import { probeStorage } from "@/lib/offline/storage-probe";
import {
  displaySugar,
  checkBrix,
  checkTemp,
  SUGAR_UNITS,
  SUGAR_UNIT_LABEL,
  type SugarUnit,
} from "@/lib/ferment/sugar";

// Phase 6 Unit 8: the Fermentation Round — the offline-first multi-row worksheet. The adoption
// bar (plan): works with zero signal, one row per tank, oversized auto-advancing fields,
// operator/time entered once. Append-per-round (never overwrite). Calm, token-driven, ≥44px.

const FLAGS = ["stuck", "hot", "foam", "H2S", "sample-sent"] as const;
type Flag = (typeof FLAGS)[number];

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

const bigField: React.CSSProperties = {
  ...field,
  height: 60,
  fontSize: 22,
  fontVariantNumeric: "tabular-nums",
  textAlign: "center",
  width: 96,
};

const chip = (bg: string, fg = "var(--text-primary)"): React.CSSProperties => ({
  fontSize: 11.5,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  padding: "2px 7px",
  borderRadius: 999,
  background: bg,
  color: fg,
  whiteSpace: "nowrap",
});

type RowState = "idle" | "saved" | "synced";

export function RoundClient({ initialRows }: { initialRows: RoundRow[] }) {
  const { pending, attention, syncing, capture, drain, discard } = useSync();
  const [operator, setOperator] = React.useState("");
  const [unit, setUnit] = React.useState<SugarUnit>("BRIX");
  const [storageOk, setStorageOk] = React.useState<boolean | null>(null);
  const [brix, setBrix] = React.useState<Record<string, string>>({});
  const [temp, setTemp] = React.useState<Record<string, string>>({});
  const [flags, setFlags] = React.useState<Record<string, Set<Flag>>>({});
  const [rowState, setRowState] = React.useState<Record<string, RowState>>({});
  const [rowError, setRowError] = React.useState<Record<string, string>>({});

  // Sticky operator + sugar unit (the "winery setting" without a new table).
  React.useEffect(() => {
    setOperator(localStorage.getItem("ferment.operator") ?? "");
    const u = localStorage.getItem("ferment.sugarUnit") as SugarUnit | null;
    if (u && SUGAR_UNITS.includes(u)) setUnit(u);
    void probeStorage().then((p) => setStorageOk(p.ok));
  }, []);
  React.useEffect(() => {
    localStorage.setItem("ferment.operator", operator);
  }, [operator]);
  React.useEffect(() => {
    localStorage.setItem("ferment.sugarUnit", unit);
  }, [unit]);

  // When the queue drains to empty, flip optimistic "saved" rows to "synced" (calm green check).
  React.useEffect(() => {
    if (pending === 0 && !syncing) {
      setRowState((s) => {
        const next = { ...s };
        for (const k of Object.keys(next)) if (next[k] === "saved") next[k] = "synced";
        return next;
      });
    }
  }, [pending, syncing]);

  const rowKey = (r: RoundRow) => `${r.vesselId}:${r.lotId}`;
  const brixRefs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const tempRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const toggleFlag = (key: string, f: Flag) =>
    setFlags((prev) => {
      const set = new Set(prev[key] ?? []);
      if (set.has(f)) set.delete(f);
      else set.add(f);
      return { ...prev, [key]: set };
    });

  async function commitRow(r: RoundRow) {
    const key = rowKey(r);
    const bRaw = brix[key]?.trim();
    const tRaw = temp[key]?.trim();
    if (!bRaw && !tRaw) return; // nothing to log
    setRowError((e) => ({ ...e, [key]: "" }));

    const readings: { analyte: string; value: number; unit: string }[] = [];
    if (bRaw) {
      const v = Number(bRaw);
      const g = checkBrix(v, r.previousBrix);
      if (!g.ok) return setRowError((e) => ({ ...e, [key]: g.error }));
      if (g.warning && !window.confirm(`${g.warning}\n\nLog it anyway?`)) return;
      readings.push({ analyte: "BRIX", value: v, unit: "°Bx" });
    }
    if (tRaw) {
      const v = Number(tRaw);
      const g = checkTemp(v);
      if (!g.ok) return setRowError((e) => ({ ...e, [key]: g.error }));
      readings.push({ analyte: "TEMP", value: v, unit: "°C" });
    }
    if (readings.length === 0) return;

    const flagList = [...(flags[key] ?? [])];
    const noteParts = [operator ? `op:${operator}` : "", flagList.length ? `flags:${flagList.join(",")}` : ""].filter(Boolean);

    try {
      await capture({
        vesselId: r.vesselId,
        lotId: r.lotId,
        occupancyToken: r.occupancyToken,
        deviceObservedAt: new Date().toISOString(),
        readings,
        note: noteParts.join(" · ") || undefined,
      });
      setRowState((s) => ({ ...s, [key]: "saved" }));
      setBrix((b) => ({ ...b, [key]: "" }));
      setTemp((t) => ({ ...t, [key]: "" }));
      setFlags((f) => ({ ...f, [key]: new Set() }));
    } catch (e) {
      setRowError((er) => ({ ...er, [key]: e instanceof Error ? e.message : "Couldn't save." }));
    }
  }

  const rows = initialRows;

  return (
    <div style={{ maxWidth: "var(--container-lg)", margin: "0 auto", padding: "var(--space-4)" }}>
      {/* Sticky top bar: operator / pending / sync / unit */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          background: "var(--surface-base)",
          borderBottom: "1px solid var(--border-strong)",
          padding: "var(--space-3) 0",
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-3)",
          alignItems: "center",
        }}
      >
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 24, margin: 0 }}>Fermentation round</h1>
        <input
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
          placeholder="Operator"
          aria-label="Operator (sticky)"
          style={{ ...field, flex: "0 1 160px" }}
        />
        <select value={unit} onChange={(e) => setUnit(e.target.value as SugarUnit)} aria-label="Sugar unit" style={{ ...field, width: 130 }}>
          {SUGAR_UNITS.map((u) => (
            <option key={u} value={u}>
              {SUGAR_UNIT_LABEL[u]}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        <span aria-live="polite" style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {pending > 0 ? `${pending} waiting to sync` : "All synced"}
        </span>
        <button
          onClick={() => void drain()}
          disabled={syncing}
          style={{ ...field, cursor: "pointer", background: "var(--surface-base)", paddingInline: 14 }}
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {storageOk === false ? (
        <div style={{ margin: "var(--space-3) 0", padding: "var(--space-3)", borderRadius: "var(--radius-md)", background: "var(--warning-surface, #fdf6e3)", color: "var(--text-primary)", fontSize: 13.5 }}>
          ⚠ This device is blocking local storage (private mode?). Readings are kept in memory only —
          <strong> don&apos;t close this tab</strong> until everything syncs.
        </div>
      ) : null}

      {/* Needs-attention tray (rejected/stale captures) */}
      {attention.length > 0 ? (
        <div style={{ margin: "var(--space-3) 0", padding: "var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--danger)", background: "var(--surface-raised)" }}>
          <strong style={{ color: "var(--danger)", fontSize: 13.5 }}>Needs attention ({attention.length})</strong>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 8px" }}>
            These couldn&apos;t attach to a lot (the vessel changed since capture). Re-check and discard, or fix in the cellar.
          </p>
          {attention.map(({ panel }) => (
            <div key={panel.panelId} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "4px 0" }}>
              <span style={{ flex: 1 }}>
                {new Date(panel.deviceObservedAt).toLocaleString()} · {panel.lastError ?? "stale"}
              </span>
              <button onClick={() => void discard(panel.panelId)} style={{ ...field, height: 36, cursor: "pointer", background: "var(--surface-base)" }}>
                Discard
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "var(--space-8) var(--space-4)", color: "var(--text-muted)" }}>
          <p style={{ fontSize: 16, margin: 0 }}>No active ferments</p>
          <p style={{ fontSize: 13.5, marginTop: 8 }}>Start one when a tank kicks off — set a lot’s alcoholic ferment to active.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "var(--space-3)" }}>
          {rows.map((r, i) => {
            const key = rowKey(r);
            const prev = r.previousBrix != null ? displaySugar(r.previousBrix, unit) : null;
            const st = rowState[key] ?? "idle";
            const set = flags[key] ?? new Set<Flag>();
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "var(--space-3)",
                  alignItems: "center",
                  padding: "var(--space-3)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-base)",
                }}
              >
                <div style={{ minWidth: 130 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.vesselCode}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{r.lotCode}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <span style={chip("var(--surface-raised)")}>AF {r.afState}</span>
                  <span style={chip("var(--surface-raised)")}>MLF {r.mlfState}</span>
                  <span style={chip("var(--surface-raised)")}>{r.form}</span>
                  {r.stuck ? <span style={chip("var(--danger)", "#fff")}>⚠ stuck</span> : null}
                </div>
                <div style={{ textAlign: "right", minWidth: 64, fontSize: 12, color: "var(--text-muted)" }}>
                  prev
                  <div style={{ fontSize: 15, color: "var(--text-secondary, var(--text-muted))", fontVariantNumeric: "tabular-nums" }}>
                    {prev ? `${prev.value} ${prev.label}` : "—"}
                  </div>
                </div>
                <input
                  ref={(el) => { brixRefs.current[key] = el; }}
                  value={brix[key] ?? ""}
                  onChange={(e) => setBrix((b) => ({ ...b, [key]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); tempRefs.current[key]?.focus(); } }}
                  inputMode="decimal"
                  placeholder="Brix"
                  aria-label={`Brix for ${r.vesselCode}`}
                  style={bigField}
                />
                <input
                  ref={(el) => { tempRefs.current[key] = el; }}
                  value={temp[key] ?? ""}
                  onChange={(e) => setTemp((t) => ({ ...t, [key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void commitRow(r).then(() => brixRefs.current[rows[i + 1] ? rowKey(rows[i + 1]) : ""]?.focus());
                    }
                  }}
                  inputMode="decimal"
                  placeholder="°C"
                  aria-label={`Temp for ${r.vesselCode}`}
                  style={{ ...bigField, width: 72 }}
                />
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {FLAGS.map((f) => (
                    <button
                      key={f}
                      onClick={() => toggleFlag(key, f)}
                      aria-pressed={set.has(f)}
                      style={{
                        ...chip(set.has(f) ? "var(--accent)" : "var(--surface-raised)", set.has(f) ? "#fff" : "var(--text-muted)"),
                        height: 30,
                        cursor: "pointer",
                        border: "1px solid var(--border-strong)",
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => void commitRow(r)}
                  style={{ ...field, cursor: "pointer", background: "var(--accent)", color: "#fff", border: "none", paddingInline: 16 }}
                >
                  Log
                </button>
                <div aria-live="polite" style={{ width: "100%", minHeight: 18, fontSize: 12.5 }}>
                  {rowError[key] ? (
                    <span style={{ color: "var(--danger)" }}>{rowError[key]}</span>
                  ) : st === "saved" ? (
                    <span style={{ color: "var(--text-muted)" }}>Saved on device ↑</span>
                  ) : st === "synced" ? (
                    <span style={{ color: "var(--success, #2e7d32)" }}>✓ Synced</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
