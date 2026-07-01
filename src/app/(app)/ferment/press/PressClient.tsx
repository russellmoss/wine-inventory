"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PressablePosition, PressDestVessel } from "@/lib/ferment/press-data";
import type { CrushBlockOption } from "@/lib/ferment/crush-data";
import type { CellarMaterialDTO } from "@/lib/cellar/materials";
import { pressAction, wholeClusterPressAction, createPressCycleAction } from "@/lib/transform/actions";
import { StagedAdditions, applyStagedAdditions, type StagedAddition } from "@/components/ferment/StagedAdditions";

// Phase 6 press. TWO sources:
//  • A MUST lot already in a vessel → split into free-run + press fraction lots (reds press off
//    skins when dry; a saignée bleeds juice off a must). Whites/reds that were crushed go here.
//  • Whole-cluster FRUIT straight from harvest → press the clusters to JUICE, SKIPPING crush.
//    Consumes the picks (the shared LotHarvestSource ledger then keeps that fruit out of crush).
// expectedRevision guards a concurrent change on the must-lot path (council S7).

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
type Source = "LOT" | "FRUIT";

export function PressClient({ positions, vessels, blocks, materials, pressCycles }: { positions: PressablePosition[]; vessels: PressDestVessel[]; blocks: CrushBlockOption[]; materials: CellarMaterialDTO[]; pressCycles: string[] }) {
  const router = useRouter();
  const [source, setSource] = React.useState<Source>(positions.length > 0 ? "LOT" : "FRUIT");
  // Cycle pick-list is shared across both press forms; a cycle added in one shows up in the other.
  const [cycles, setCycles] = React.useState<string[]>(pressCycles);
  const createCycle = React.useCallback(async (name: string) => {
    const { name: canonical } = await createPressCycleAction(name);
    setCycles((cs) => (cs.includes(canonical) ? cs : [...cs, canonical].sort((a, b) => a.localeCompare(b))));
    return canonical;
  }, []);

  if (positions.length === 0 && blocks.length === 0) {
    return (
      <div style={{ maxWidth: "var(--container-md)", margin: "0 auto", padding: "var(--space-5)", color: "var(--text-muted)" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300 }}>Press</h1>
        <p>Nothing to press. Record a harvest pick (press fruit direct from harvest) or de-stem fruit into a must lot first.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "var(--container-md)", margin: "0 auto", padding: "var(--space-5)", paddingBottom: 120 }}>
      <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 26 }}>Press</h1>

      {/* Source toggle */}
      <div style={{ display: "flex", gap: 8, margin: "8px 0 16px" }}>
        <button onClick={() => setSource("LOT")} style={{ ...field, cursor: "pointer", background: source === "LOT" ? "var(--accent)" : "var(--surface-base)", color: source === "LOT" ? "#fff" : "var(--text-primary)", border: source === "LOT" ? "none" : "1px solid var(--border-strong)" }}>
          A must lot {positions.length ? `(${positions.length})` : ""}
        </button>
        <button onClick={() => setSource("FRUIT")} style={{ ...field, cursor: "pointer", background: source === "FRUIT" ? "var(--accent)" : "var(--surface-base)", color: source === "FRUIT" ? "#fff" : "var(--text-primary)", border: source === "FRUIT" ? "none" : "1px solid var(--border-strong)" }}>
          Fruit from harvest {blocks.length ? `(${blocks.length})` : ""}
        </button>
      </div>

      {source === "LOT" ? (
        <PressLotForm positions={positions} vessels={vessels} router={router} cycles={cycles} createCycle={createCycle} />
      ) : (
        <FruitPressForm blocks={blocks} vessels={vessels} materials={materials} router={router} cycles={cycles} createCycle={createCycle} />
      )}
    </div>
  );
}

// ── Press a MUST lot into fractions ──
function PressLotForm({ positions, vessels, router, cycles, createCycle }: { positions: PressablePosition[]; vessels: PressDestVessel[]; router: ReturnType<typeof useRouter>; cycles: string[]; createCycle: (name: string) => Promise<string> }) {
  const [posKey, setPosKey] = React.useState(positions[0] ? `${positions[0].vesselId}:${positions[0].lotId}` : "");
  const pos = positions.find((p) => `${p.vesselId}:${p.lotId}` === posKey);
  const [op, setOp] = React.useState<"PRESS" | "SAIGNEE">("PRESS");
  const [fractions, setFractions] = React.useState<Fraction[]>([{ destVesselId: vessels[0]?.id ?? "", volumeL: "", label: "free-run", estimated: false, mergeIntoLotId: "" }]);
  const [pressCycle, setPressCycle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const fractionTotal = fractions.reduce((a, f) => a + (Number(f.volumeL) || 0), 0);
  const available = pos?.volumeL ?? 0;
  const lees = Math.round((available - fractionTotal) * 100) / 100;

  const setFraction = (i: number, patch: Partial<Fraction>) => setFractions((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
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
        pressCycle: pressCycle || null,
        fractions: fr.map((f) => ({ destVesselId: f.destVesselId, volumeL: Number(f.volumeL), label: f.label, estimated: f.estimated, mergeIntoLotId: f.mergeIntoLotId || null })),
      });
      router.push(`/lots/${pos.lotId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Press failed.");
      setBusy(false);
    }
  }

  return (
    <>
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
        <select value={op} onChange={(e) => setOp(e.target.value as "PRESS" | "SAIGNEE")} style={{ ...field, width: 240 }}>
          <option value="PRESS">Press (free-run + press cuts)</option>
          <option value="SAIGNEE">Saignée (bleed juice off must)</option>
        </select>
      </div>

      <PressCycleField cycles={cycles} value={pressCycle} onChange={setPressCycle} createCycle={createCycle} />

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
            {fractions.length > 1 ? <button onClick={() => removeFraction(i)} aria-label="Remove fraction" style={{ ...field, width: 40, cursor: "pointer", background: "var(--surface-base)" }}>×</button> : null}
          </div>
        ))}
        <button onClick={addFraction} style={{ ...field, cursor: "pointer", background: "var(--surface-base)", paddingInline: 14 }}>+ fraction</button>
      </div>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginTop: 12 }}>{error}</p> : null}

      <StickyBar
        left={`${fractionTotal} L into ${fractions.filter((f) => Number(f.volumeL) > 0).length} fraction(s)${lees > 0 ? ` · ${lees} L lees` : ""}${available > 0 ? ` · of ${available} L` : ""}`}
        button={busy ? "Pressing…" : op === "SAIGNEE" ? "Bleed" : "Press"}
        disabled={busy}
        onClick={() => void submit()}
      />
    </>
  );
}

// ── Press fruit direct from harvest → JUICE, skipping the must-lot stage ──
// The fruit can be whole cluster, a partial whole-cluster/destemmed mix, or fully destemmed
// (destemmed fruit that never became a must). We record that composition on the press op.
type Composition = "WHOLE" | "PARTIAL" | "DESTEMMED";

const compositionLabel = (c: Composition, pct: number): string =>
  c === "WHOLE" ? "whole cluster" : c === "DESTEMMED" ? "destemmed" : `${pct}% whole cluster`;

function FruitPressForm({ blocks, vessels, materials, router, cycles, createCycle }: { blocks: CrushBlockOption[]; vessels: PressDestVessel[]; materials: CellarMaterialDTO[]; router: ReturnType<typeof useRouter>; cycles: string[]; createCycle: (name: string) => Promise<string> }) {
  const [blockId, setBlockId] = React.useState(blocks[0]?.blockId ?? "");
  const block = blocks.find((b) => b.blockId === blockId);
  const [consumed, setConsumed] = React.useState<Record<string, string>>({});
  const [dests, setDests] = React.useState<{ key: number; vesselId: string; volumeL: string }[]>([{ key: 1, vesselId: vessels[0]?.id ?? "", volumeL: "" }]);
  const [additions, setAdditions] = React.useState<StagedAddition[]>([]);
  const [composition, setComposition] = React.useState<Composition>("WHOLE");
  const [wcPct, setWcPct] = React.useState("50");
  const [pressCycle, setPressCycle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  // Whole-cluster fraction of the pressed fruit: 100 whole cluster / 0 destemmed / N partial.
  const wholeClusterPct = composition === "WHOLE" ? 100 : composition === "DESTEMMED" ? 0 : Math.max(0, Math.min(100, Number(wcPct) || 0));

  const consumedFor = (pickId: string, remainingKg: number) => consumed[pickId] ?? String(remainingKg);
  const selected = (block?.picks ?? []).map((p) => ({ pick: p, kg: Number(consumedFor(p.pickId, p.remainingKg)) })).filter((x) => x.kg > 0);
  const totalKg = selected.reduce((a, x) => a + x.kg, 0);
  const outL = Math.round(dests.reduce((a, d) => a + (Number(d.volumeL) || 0), 0) * 100) / 100;
  const yieldLPerTonne = totalKg > 0 && outL > 0 ? Math.round((outL / totalKg) * 1000 * 100) / 100 : null;

  const setDest = (key: number, patch: Partial<{ vesselId: string; volumeL: string }>) => setDests((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const addDest = () => setDests((ds) => [...ds, { key: Math.max(0, ...ds.map((d) => d.key)) + 1, vesselId: vessels[0]?.id ?? "", volumeL: "" }]);
  const removeDest = (key: number) => setDests((ds) => (ds.length > 1 ? ds.filter((d) => d.key !== key) : ds));

  async function submit() {
    setError("");
    if (!block) return setError("Pick a block.");
    if (selected.length === 0) return setError("Enter consumed kg for at least one pick.");
    const destinations = dests.filter((d) => Number(d.volumeL) > 0 && d.vesselId).map((d) => ({ vesselId: d.vesselId, volumeL: Number(d.volumeL) }));
    if (destinations.length === 0) return setError("Add at least one juice destination with a volume.");
    if (composition === "PARTIAL" && !(wholeClusterPct > 0 && wholeClusterPct < 100)) {
      return setError("For a partial press, enter a whole-cluster % between 1 and 99.");
    }
    for (const { pick, kg } of selected) if (kg > pick.remainingKg + 1e-6) return setError(`Pick ${pick.pickDate}: only ${pick.remainingKg} kg remain.`);
    setBusy(true);
    try {
      const result = await wholeClusterPressAction({
        commandId: newId(),
        picks: selected.map((x) => ({ pickId: x.pick.pickId, consumedKg: x.kg })),
        destVesselId: destinations[0].vesselId, // primary (label/ADD) — destinations[] drives the split
        outputVolumeL: outL,
        destinations,
        pressCycle: pressCycle || null,
        target: { mode: "NEW", varietyId: block.varietyId ?? null, vintage: block.vintageYear, wholeClusterPct },
      });
      // Chain any press-pad additions (enzyme, SO₂, bentonite for juice…) onto the new juice lot.
      await applyStagedAdditions(additions, destinations[0].vesselId, result.lotId);
      router.push(`/lots/${result.lotId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Press failed.");
      setBusy(false);
    }
  }

  return (
    <>
      <label style={label}>Block (vintage)</label>
      <select value={blockId} onChange={(e) => setBlockId(e.target.value)} style={{ ...field, width: "100%" }}>
        {blocks.map((b) => (
          <option key={b.blockId} value={b.blockId}>
            {b.label} — {b.vintageYear}
          </option>
        ))}
      </select>

      <div style={{ marginTop: 16 }}>
        <label style={label}>Picks — consumed kg (whole-cluster; default = remaining)</label>
        {block?.picks.map((p) => (
          <div key={p.pickId} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <span style={{ flex: 1, fontSize: 13 }}>
              {p.pickDate} · {p.remainingKg} kg left{p.brixAtPick != null ? ` · ${p.brixAtPick} °Bx` : ""}
            </span>
            <input value={consumedFor(p.pickId, p.remainingKg)} onChange={(e) => setConsumed((c) => ({ ...c, [p.pickId]: e.target.value }))} inputMode="decimal" aria-label={`Consumed kg for pick ${p.pickDate}`} style={{ ...field, width: 120, textAlign: "right" }} />
            <span style={{ fontSize: 12, color: "var(--text-muted)", width: 24 }}>kg</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={label}>Fruit going into the press</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([
            ["WHOLE", "Whole cluster"],
            ["PARTIAL", "Partial"],
            ["DESTEMMED", "Destemmed"],
          ] as [Composition, string][]).map(([c, lbl]) => {
            const on = composition === c;
            return (
              <button key={c} type="button" onClick={() => setComposition(c)} style={{ ...field, flex: "1 1 120px", cursor: "pointer", background: on ? "var(--accent)" : "var(--surface-base)", color: on ? "#fff" : "var(--text-primary)", border: on ? "none" : "1px solid var(--border-strong)" }}>
                {lbl}
              </button>
            );
          })}
        </div>
        {composition === "PARTIAL" ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <input value={wcPct} onChange={(e) => setWcPct(e.target.value)} inputMode="decimal" aria-label="Percent whole cluster" style={{ ...field, width: 90, textAlign: "right" }} />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>% whole cluster (rest destemmed)</span>
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={label}>Juice destinations — measured liters per vessel (one juice lot, split across tanks)</label>
        {dests.map((d) => (
          <div key={d.key} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <select value={d.vesselId} onChange={(e) => setDest(d.key, { vesselId: e.target.value })} aria-label="Destination vessel" style={{ ...field, flex: "1 1 200px" }}>
              {vessels.map((v) => (
                <option key={v.id} value={v.id}>{v.code} ({v.capacityL} L)</option>
              ))}
            </select>
            <input value={d.volumeL} onChange={(e) => setDest(d.key, { volumeL: e.target.value })} inputMode="decimal" placeholder="L" aria-label="Measured juice into this vessel" style={{ ...field, width: 110, textAlign: "right" }} />
            {dests.length > 1 ? <button onClick={() => removeDest(d.key)} aria-label="Remove destination" style={{ ...field, width: 40, cursor: "pointer", background: "var(--surface-base)" }}>×</button> : null}
          </div>
        ))}
        <button onClick={addDest} style={{ ...field, cursor: "pointer", background: "var(--surface-base)", paddingInline: 14 }}>+ destination vessel</button>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={label}>Press-pad additions (optional) — enzyme, SO₂, bentonite, tannin…</label>
        <StagedAdditions value={additions} onChange={setAdditions} materials={materials} idBase="wcpress" />
      </div>

      <PressCycleField cycles={cycles} value={pressCycle} onChange={setPressCycle} createCycle={createCycle} />

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginTop: 12 }}>{error}</p> : null}

      <StickyBar
        left={`New ${block?.vintageYear ?? ""} juice lot · ${compositionLabel(composition, wholeClusterPct)}${totalKg > 0 ? ` · ${Math.round(totalKg * 1000) / 1000} kg` : " · no picks"}${outL > 0 ? ` → ${outL} L across ${dests.filter((d) => Number(d.volumeL) > 0).length} vessel(s)` : ""}${yieldLPerTonne != null ? ` (${yieldLPerTonne} L/t)` : ""}`}
        button={busy ? "Pressing…" : "Press fruit"}
        disabled={busy}
        onClick={() => void submit()}
      />
    </>
  );
}

// Optional named press program. Pick an existing cycle, or "+ add press cycle" to name a new one
// (persisted via createPressCycleAction so it's offered on the next pressing). Empty = no cycle.
function PressCycleField({ cycles, value, onChange, createCycle }: { cycles: string[]; value: string; onChange: (v: string) => void; createCycle: (name: string) => Promise<string> }) {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  async function add() {
    const name = draft.trim();
    if (!name) return setAdding(false);
    setBusy(true);
    setErr("");
    try {
      const canonical = await createCycle(name);
      onChange(canonical);
      setDraft("");
      setAdding(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add cycle.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <label style={label}>Press cycle (optional)</label>
      {adding ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void add(); }
              if (e.key === "Escape") { setAdding(false); setErr(""); }
            }}
            placeholder="e.g. Champagne cycle"
            aria-label="New press cycle name"
            style={{ ...field, width: 260 }}
          />
          <button onClick={() => void add()} disabled={busy} style={{ ...field, cursor: "pointer", background: "var(--surface-base)", paddingInline: 14 }}>
            {busy ? "Adding…" : "Add"}
          </button>
          <button onClick={() => { setAdding(false); setErr(""); }} disabled={busy} style={{ ...field, cursor: "pointer", background: "var(--surface-base)", paddingInline: 14 }}>
            Cancel
          </button>
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => (e.target.value === "__add__" ? setAdding(true) : onChange(e.target.value))}
          aria-label="Press cycle"
          style={{ ...field, width: 300 }}
        >
          <option value="">— none —</option>
          {cycles.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value="__add__">+ add press cycle…</option>
        </select>
      )}
      {err ? <p style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 6 }}>{err}</p> : null}
    </div>
  );
}

function StickyBar({ left, button, disabled, onClick }: { left: string; button: string; disabled: boolean; onClick: () => void }) {
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "var(--surface-base)", borderTop: "1px solid var(--border-strong)", padding: "var(--space-3) var(--space-5)", display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>{left}</div>
      <button onClick={onClick} disabled={disabled} style={{ ...field, cursor: "pointer", background: "var(--accent)", color: "#fff", border: "none", paddingInline: 20 }}>
        {button}
      </button>
    </div>
  );
}
