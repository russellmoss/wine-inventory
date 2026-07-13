"use client";

import React from "react";
import { Badge, Button } from "@/components/ui";
import { FermentChart } from "@/components/ferment/FermentChart";
import { getFermentSeriesAction } from "@/lib/ferment/monitor-actions";
import { transitionStateAction } from "@/lib/ferment/actions";
import { voidPanelAction } from "@/lib/chemistry/actions";
import { addAdditionAction, addFiningAction } from "@/lib/cellar/actions";
import { useSync } from "@/lib/offline/useSync";
import type { FermentSeries, FermentPoint } from "@/lib/ferment/monitor-data";
import { BRIX_HARD_MIN, BRIX_HARD_MAX, TEMP_HARD_MIN, TEMP_HARD_MAX, toBrix } from "@/lib/ferment/sugar";
import { MATERIAL_KINDS, RATE_BASES, RATE_BASIS_LABELS, type MaterialKind, type RateBasis } from "@/lib/cellar/additions-math";
import type { CellarMaterialDTO } from "@/lib/cellar/materials";
import { MaterialPicker } from "@/components/cellar/MaterialPicker";

// Phase 6 (vessel-first): Fermentation monitoring. Log sugar (Brix/Baumé), pH and temperature
// over time, MANY entries at once (backfill the logbook — each row carries its own date/time),
// charted Brix+temp dual-Y + pH companion. Capture flows through the offline outbox (durable on
// a wifi drop). A reading is IMMUTABLE (council S1): "Edit" = void the old + log a new one;
// "Remove" voids it. Voids + the derived stuck signal recompute on reload.

const field: React.CSSProperties = {
  height: 42,
  padding: "0 8px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};
const lbl: React.CSSProperties = { fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", display: "block", marginBottom: 3 };

type Tone = React.ComponentProps<typeof Badge>["tone"];
const afTone = (s: string): Tone => (s === "ACTIVE" ? "gold" : s === "DRY" ? "maroon" : "neutral");
const mlfTone = (s: string): Tone => (s === "ACTIVE" ? "gold" : s === "COMPLETE" ? "green" : "neutral");

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

const pad2 = (n: number) => String(n).padStart(2, "0");
/** A <input type=datetime-local> value for a Date, in LOCAL time. */
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

let rowSeq = 0;
type Entry = { key: number; when: string; sugar: string; ph: string; temp: string; editPanelId?: string; editGroupId?: string | null };
const blankEntry = (when?: string): Entry => ({ key: ++rowSeq, when: when ?? toLocalInput(new Date()), sugar: "", ph: "", temp: "" });

export function FermentMonitor({
  vesselId,
  vesselCode,
  lotId,
  lotCode,
  materials = [],
  residentLots = [],
}: {
  vesselId: string;
  vesselCode: string;
  lotId: string;
  lotCode: string;
  materials?: CellarMaterialDTO[];
  /** Plan 060: all lots co-resident in this vessel (incl. the selected one). >1 → offer whole-tank. */
  residentLots?: { lotId: string; code: string }[];
}) {
  const { pending, attention, syncing, capture } = useSync();
  // Plan 060: on a multi-lot (co-ferment) tank, default to recording on the WHOLE tank — one reading
  // fanned out to every co-resident lot — with an opt-out to just this lot. residentLots always
  // includes the selected lot; fall back to [this lot] if the caller didn't pass the list.
  const allLots = residentLots.length > 0 ? residentLots : [{ lotId, code: lotCode }];
  const isMultiLot = allLots.length > 1;
  const [scope, setScope] = React.useState<"tank" | "lot">(isMultiLot ? "tank" : "lot");
  const [series, setSeries] = React.useState<FermentSeries | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [optimistic, setOptimistic] = React.useState<FermentPoint[]>([]);
  const [unit, setUnit] = React.useState<"BRIX" | "BAUME">("BRIX");
  const [entries, setEntries] = React.useState<Entry[]>([blankEntry()]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [okMsg, setOkMsg] = React.useState("");
  const [stBusy, setStBusy] = React.useState(false);
  // Additions (yeast, MLF culture, fining/bentonite, tannin, SO₂, …) — Phase 3 ADDITION/FINING op.
  const [addMat, setAddMat] = React.useState("");
  const [addKind, setAddKind] = React.useState<MaterialKind>("YEAST");
  const [addRate, setAddRate] = React.useState("");
  const [addBasis, setAddBasis] = React.useState<RateBasis>("G_HL");
  const [addNote, setAddNote] = React.useState("");
  const [addBusy, setAddBusy] = React.useState(false);

  const reload = React.useCallback(async () => {
    try {
      setSeries(await getFermentSeriesAction(lotId));
    } catch {
      /* offline — keep current view + optimistic */
    }
  }, [lotId]);

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

  // Once the outbox drains, reload the canonical series + drop optimistic placeholders.
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
  const history = [...serverPoints].filter((p) => p.panelId).sort((a, b) => b.observedAt.localeCompare(a.observedAt)); // newest first

  const setEntry = (key: number, patch: Partial<Entry>) => setEntries((es) => es.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  const addRow = () => setEntries((es) => [...es, blankEntry(es[es.length - 1]?.when)]);
  const removeRow = (key: number) => setEntries((es) => (es.length > 1 ? es.filter((e) => e.key !== key) : es));

  /** Validate one staged entry → its readings, or an error string. */
  function entryReadings(e: Entry): { readings: { analyte: string; value: number; unit: string }[]; iso: string } | string {
    const readings: { analyte: string; value: number; unit: string }[] = [];
    if (!e.when) return "Pick a date/time for each entry.";
    const iso = new Date(e.when).toISOString();
    if (Number.isNaN(Date.parse(e.when))) return "Bad date/time.";
    if (e.sugar.trim()) {
      const brixVal = toBrix(Number(e.sugar), unit);
      if (!Number.isFinite(brixVal) || brixVal < BRIX_HARD_MIN || brixVal > BRIX_HARD_MAX) return `Brix must be ${BRIX_HARD_MIN}–${BRIX_HARD_MAX} °Bx.`;
      readings.push({ analyte: "BRIX", value: brixVal, unit: "°Bx" });
    }
    if (e.ph.trim()) {
      const v = Number(e.ph);
      if (!Number.isFinite(v) || v < 2 || v > 5) return "pH should be 2–5.";
      readings.push({ analyte: "PH", value: v, unit: "pH" });
    }
    if (e.temp.trim()) {
      const v = Number(e.temp);
      if (!Number.isFinite(v) || v < TEMP_HARD_MIN || v > TEMP_HARD_MAX) return `Temp must be ${TEMP_HARD_MIN}–${TEMP_HARD_MAX} °C.`;
      readings.push({ analyte: "TEMP", value: v, unit: "°C" });
    }
    return readings.length ? { readings, iso } : "Enter sugar, pH or temp.";
  }

  async function logAll() {
    setError("");
    setOkMsg("");
    const staged = entries.filter((e) => e.sugar.trim() || e.ph.trim() || e.temp.trim());
    if (staged.length === 0) return setError("Enter at least one reading.");
    // Validate all first (fail the whole batch cleanly).
    const prepared: { e: Entry; readings: { analyte: string; value: number; unit: string }[]; iso: string }[] = [];
    for (const e of staged) {
      const r = entryReadings(e);
      if (typeof r === "string") return setError(r);
      prepared.push({ e, readings: r.readings, iso: r.iso });
    }
    setBusy(true);
    try {
      const newOptimistic: FermentPoint[] = [];
      const voidedPanelIds: string[] = [];
      for (const { e, readings, iso } of prepared) {
        if (e.editPanelId) {
          await voidPanelAction(e.editPanelId); // edit = void the old, then log the new (immutable)
          voidedPanelIds.push(e.editPanelId);
        }
        // Plan 060 fan-out: record on the WHOLE tank when the user chose "whole tank" on a multi-lot
        // vessel, OR when editing a reading that was itself a grouped whole-tank reading (voidPanelAction
        // just voided the ENTIRE group, so we must re-log every lot or the other lots silently lose it).
        const fanout = isMultiLot && (scope === "tank" || !!e.editGroupId);
        if (fanout) {
          const group = `vrg:${newId()}`;
          for (const rl of allLots) {
            await capture({ vesselId, lotId: rl.lotId, occupancyToken: `${vesselId}:${rl.lotId}`, deviceObservedAt: iso, readings, vesselReadingGroupId: group });
          }
        } else {
          await capture({ vesselId, lotId, occupancyToken: `${vesselId}:${lotId}`, deviceObservedAt: iso, readings });
        }
        newOptimistic.push({
          panelId: null,
          observedAt: iso,
          brix: readings.find((x) => x.analyte === "BRIX")?.value ?? null,
          ph: readings.find((x) => x.analyte === "PH")?.value ?? null,
          temp: readings.find((x) => x.analyte === "TEMP")?.value ?? null,
        });
      }
      // Optimistically drop voided rows from the visible series so an edit doesn't double-show.
      if (voidedPanelIds.length) {
        setSeries((s) => (s ? { ...s, points: s.points.filter((p) => !voidedPanelIds.includes(p.panelId ?? "")) } : s));
      }
      setOptimistic((o) => [...o, ...newOptimistic]);
      setEntries([blankEntry()]);
      setOkMsg(`Saved ${staged.length} reading${staged.length === 1 ? "" : "s"} on device`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  function editPoint(p: FermentPoint) {
    const panelId = p.panelId;
    if (!panelId) return;
    setEntries((es) => [
      ...es.filter((e) => e.sugar.trim() || e.ph.trim() || e.temp.trim() || e.editPanelId), // keep any in-progress rows
      {
        key: ++rowSeq,
        when: toLocalInput(new Date(p.observedAt)),
        sugar: p.brix != null ? String(p.brix) : "", // prefilled as Brix
        ph: p.ph != null ? String(p.ph) : "",
        temp: p.temp != null ? String(p.temp) : "",
        editPanelId: panelId,
        editGroupId: p.vesselReadingGroupId ?? null,
      },
    ]);
    setUnit("BRIX");
    setOkMsg(
      p.vesselReadingGroupId
        ? "Editing a whole-tank reading — Log replaces it on every co-fermenting lot."
        : "Editing a reading — change the values and Log to replace it.",
    );
  }

  async function advanceState(kind: "AF" | "MLF", to: string) {
    setStBusy(true);
    setError("");
    try {
      await transitionStateAction({ lotId, kind, to, commandId: newId() });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change state.");
    } finally {
      setStBusy(false);
    }
  }

  async function logAddition() {
    setError("");
    setOkMsg("");
    if (!addMat.trim()) return setError("Name the product (e.g. EC-1118, Opti-White, bentonite).");
    const rate = Number(addRate);
    if (!Number.isFinite(rate) || rate <= 0) return setError("Enter a rate greater than 0.");
    setAddBusy(true);
    try {
      const input = {
        vesselId,
        lotId,
        materialName: addMat.trim(),
        materialKind: addKind,
        rateValue: rate,
        rateBasis: addBasis,
        note: addNote.trim() || undefined,
      };
      await (addKind === "FINING" ? addFiningAction(input) : addAdditionAction(input));
      setAddMat("");
      setAddRate("");
      setAddNote("");
      setOkMsg("Addition logged");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log the addition.");
    } finally {
      setAddBusy(false);
    }
  }

  async function removePoint(panelId: string) {
    if (!window.confirm("Remove this reading? It will be voided (the trend + stuck signal recompute).")) return;
    setBusy(true);
    setError("");
    try {
      await voidPanelAction(panelId);
      setSeries((s) => (s ? { ...s, points: s.points.filter((p) => p.panelId !== panelId) } : s));
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove.");
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
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--text-muted)" }} aria-live="polite">
          {pending > 0 ? `${pending} waiting to sync${syncing ? "…" : ""}` : "All synced"}
        </span>
      </div>

      {/* Advance the ferment state right here (also on the lot timeline) */}
      {series ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {series.afState === "NONE" ? (
            <Button variant="secondary" size="sm" disabled={stBusy} onClick={() => void advanceState("AF", "ACTIVE")}>Start ferment</Button>
          ) : series.afState === "ACTIVE" ? (
            <Button variant="secondary" size="sm" disabled={stBusy} onClick={() => void advanceState("AF", "DRY")}>Mark dry</Button>
          ) : null}
          {series.mlfState === "NONE" ? (
            <Button variant="secondary" size="sm" disabled={stBusy} onClick={() => void advanceState("MLF", "ACTIVE")}>Start MLF</Button>
          ) : series.mlfState === "ACTIVE" ? (
            <Button variant="secondary" size="sm" disabled={stBusy} onClick={() => void advanceState("MLF", "COMPLETE")}>MLF complete</Button>
          ) : null}
        </div>
      ) : null}

      {attention.length > 0 ? (
        <p style={{ fontSize: 13, color: "var(--danger)", margin: "0 0 8px" }}>
          {attention.length} reading(s) couldn&apos;t attach (the vessel changed since capture) — re-check in the cellar.
        </p>
      ) : null}

      {/* Multi-row entry editor (backfill the logbook — each row has its own date/time) */}
      <div style={{ border: "1px solid var(--border-subtle, #eee)", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={lbl}>Log readings{prevBrix != null ? ` · last ${prevBrix} °Bx` : ""}</span>
          <label style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
            sugar in
            <select value={unit} onChange={(e) => setUnit(e.target.value as "BRIX" | "BAUME")} aria-label="Sugar unit" style={{ ...field, height: 32, width: 80 }}>
              <option value="BRIX">°Bx</option>
              <option value="BAUME">°Bé</option>
            </select>
          </label>
        </div>
        {isMultiLot ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Record on</span>
            <div role="radiogroup" aria-label="Record scope" style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                role="radio"
                aria-checked={scope === "tank"}
                onClick={() => setScope("tank")}
                style={{ ...field, width: "auto", minHeight: 40, cursor: "pointer", background: scope === "tank" ? "var(--surface-base)" : "var(--surface-raised)", borderColor: scope === "tank" ? "var(--accent)" : "var(--border-strong)", fontWeight: scope === "tank" ? 600 : 400 }}
              >
                Whole tank · {allLots.length} lots
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={scope === "lot"}
                onClick={() => setScope("lot")}
                style={{ ...field, width: "auto", minHeight: 40, cursor: "pointer", background: scope === "lot" ? "var(--surface-base)" : "var(--surface-raised)", borderColor: scope === "lot" ? "var(--accent)" : "var(--border-strong)", fontWeight: scope === "lot" ? 600 : 400 }}
              >
                Just {lotCode}
              </button>
            </div>
          </div>
        ) : null}
        {entries.map((e) => (
          <div key={e.key} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <input type="datetime-local" value={e.when} onChange={(ev) => setEntry(e.key, { when: ev.target.value })} aria-label="Date and time" style={{ ...field, flex: "0 0 195px" }} />
            <input value={e.sugar} onChange={(ev) => setEntry(e.key, { sugar: ev.target.value })} inputMode="decimal" placeholder={unit === "BAUME" ? "°Bé" : "Brix"} aria-label="Sugar" style={{ ...field, width: 76 }} />
            <input value={e.ph} onChange={(ev) => setEntry(e.key, { ph: ev.target.value })} inputMode="decimal" placeholder="pH" aria-label="pH" style={{ ...field, width: 64 }} />
            <input value={e.temp} onChange={(ev) => setEntry(e.key, { temp: ev.target.value })} inputMode="decimal" placeholder="°C" aria-label="Temp" style={{ ...field, width: 64 }} />
            {e.editPanelId ? <span style={{ fontSize: 11.5, color: "var(--accent)" }}>replacing</span> : null}
            {entries.length > 1 ? (
              <button onClick={() => removeRow(e.key)} aria-label="Remove row" style={{ ...field, width: 36, cursor: "pointer", background: "var(--surface-base)" }}>×</button>
            ) : null}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Button variant="secondary" size="sm" onClick={addRow} style={{ minHeight: 40 }}>+ add day/row</Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={() => void logAll()} style={{ minHeight: 40 }}>
            {busy ? "Saving…" : "Log readings"}
          </Button>
        </div>
        <div aria-live="polite" style={{ minHeight: 16, fontSize: 12.5, marginTop: 6 }}>
          {error ? <span style={{ color: "var(--danger)" }}>{error}</span> : okMsg ? <span style={{ color: "var(--text-muted)" }}>{okMsg}</span> : null}
        </div>
      </div>

      {/* Chart */}
      {loading && !series ? <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Loading…</p> : <FermentChart points={chartPoints} />}

      {/* Additions — yeast / MLF culture / fining / tannin / SO₂ … (Phase 3 op; draws down stock in Phase 8) */}
      <div style={{ border: "1px solid var(--border-subtle, #eee)", borderRadius: "var(--radius-md)", padding: 12, marginTop: 14 }}>
        <span style={lbl}>Additions — yeast, MLF culture, fining, tannin, SO₂…</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
          <MaterialPicker
            materials={materials}
            value={addMat}
            onChange={(name, m) => {
              setAddMat(name);
              if (m) {
                setAddKind(m.kind as MaterialKind);
                if (m.defaultBasis) setAddBasis(m.defaultBasis as RateBasis);
              }
            }}
            defaultKind={addKind}
            placeholder="product (e.g. EC-1118, O. oeni, bentonite)"
            ariaLabel="Product"
            style={{ flex: "1 1 200px" }}
          />
          <select value={addKind} onChange={(e) => setAddKind(e.target.value as MaterialKind)} aria-label="Kind" style={{ ...field, width: 120 }}>
            {MATERIAL_KINDS.map((k) => (
              <option key={k} value={k}>{k.toLowerCase()}</option>
            ))}
          </select>
          <input value={addRate} onChange={(e) => setAddRate(e.target.value)} inputMode="decimal" placeholder="rate" aria-label="Rate" style={{ ...field, width: 72 }} />
          <select value={addBasis} onChange={(e) => setAddBasis(e.target.value as RateBasis)} aria-label="Rate basis" style={{ ...field, width: 110 }}>
            {RATE_BASES.map((b) => (
              <option key={b} value={b}>{RATE_BASIS_LABELS[b]}</option>
            ))}
          </select>
          <input value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="note" aria-label="Addition note" style={{ ...field, flex: "1 1 120px" }} />
          <Button variant="secondary" size="sm" disabled={addBusy} onClick={() => void logAddition()} style={{ minHeight: 42 }}>
            {addBusy ? "Adding…" : "Log addition"}
          </Button>
        </div>
        {series && series.additions.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", fontSize: 12.5, color: "var(--text-secondary)" }}>
            {series.additions.slice(0, 6).map((a) => (
              <li key={a.id} style={{ padding: "3px 0", borderTop: "1px solid var(--border-subtle, #eee)" }}>
                {fmtWhen(a.at)} · <strong>{a.material ?? a.kind.toLowerCase()}</strong>
                {a.total != null ? ` · ${a.total} ${a.unit ?? "g"}` : ""}
                {a.kind === "FINING" ? " · fining" : ""}
                {a.note ? ` · ${a.note}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* History (edit / remove) */}
      {history.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <span style={lbl}>History ({history.length})</span>
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border-subtle, #eee)", borderRadius: "var(--radius-md)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                  <th style={{ padding: "6px 10px", fontWeight: 500 }}>When</th>
                  <th style={{ padding: "6px 10px", fontWeight: 500 }}>Brix</th>
                  <th style={{ padding: "6px 10px", fontWeight: 500 }}>pH</th>
                  <th style={{ padding: "6px 10px", fontWeight: 500 }}>Temp</th>
                  <th style={{ padding: "6px 10px" }} />
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.panelId} style={{ borderTop: "1px solid var(--border-subtle, #eee)", fontVariantNumeric: "tabular-nums" }}>
                    <td style={{ padding: "6px 10px" }}>{fmtWhen(p.observedAt)}</td>
                    <td style={{ padding: "6px 10px" }}>{p.brix ?? "—"}</td>
                    <td style={{ padding: "6px 10px" }}>{p.ph ?? "—"}</td>
                    <td style={{ padding: "6px 10px" }}>{p.temp != null ? `${p.temp}°` : "—"}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => editPoint(p)} disabled={busy} style={{ ...field, height: 30, cursor: "pointer", background: "var(--surface-base)", marginRight: 6 }}>Edit</button>
                      <button onClick={() => p.panelId && void removePoint(p.panelId)} disabled={busy} style={{ ...field, height: 30, cursor: "pointer", background: "var(--surface-base)", color: "var(--danger)" }}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
