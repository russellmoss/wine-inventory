"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow, ConfirmButton } from "@/components/ui";
import { createBottlingRun, editBottlingRun, deleteBottlingRun } from "@/lib/bottling/actions";
import { suggestBottles, consumedForBottles, casesAndLoose } from "@/lib/bottling/draw";

export type VesselOpt = { id: string; code: string; type: "BARREL" | "TANK"; availableL: number; contents: string[] };
export type LocOpt = { id: string; name: string };
export type RunRow = {
  id: string;
  date: string;
  skuName: string;
  skuVintage: number;
  bottlesProduced: number;
  destinationLocationId: string;
  location: string;
  vesselIds: string[];
  sources: string[];
};

const sel: React.CSSProperties = {
  height: 44, padding: "0 12px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-primary)", width: "100%",
};

type Initial = { vesselIds: string[]; skuName: string; skuVintage: number | ""; bottles: number | ""; destinationLocationId: string; date: string };

function BottlingForm({
  vessels, locations, initial, mode, onSubmit, onCancel, pending,
}: {
  vessels: VesselOpt[]; locations: LocOpt[]; initial: Initial; mode: "create" | "edit";
  onSubmit: (fd: FormData) => void; onCancel?: () => void; pending: boolean;
}) {
  const [picked, setPicked] = React.useState<string[]>(initial.vesselIds);
  const [bottles, setBottles] = React.useState<number | "">(initial.bottles);

  const availableL = Math.round(vessels.filter((v) => picked.includes(v.id)).reduce((a, v) => a + v.availableL, 0) * 100) / 100;
  const max = mode === "create" ? suggestBottles(availableL) : undefined;
  const consumed = consumedForBottles(Number(bottles) || 0);
  const split = casesAndLoose(Number(bottles) || 0);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {picked.map((id) => <input key={id} type="hidden" name="vesselIds" value={id} />)}

      <div>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Vessels (pick one or more)</span>
        <div style={{ marginTop: 6, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", maxHeight: 200, overflowY: "auto" }}>
          {vessels.length === 0 ? (
            <p style={{ padding: 12, margin: 0, color: "var(--text-muted)", fontSize: 14 }}>No vessels with wine.</p>
          ) : (
            vessels.map((v) => {
              const on = picked.includes(v.id);
              return (
                <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderTop: "1px solid var(--border-subtle)", cursor: "pointer", background: on ? "var(--accent-soft)" : "transparent" }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(v.id)} />
                  <Badge tone={v.type === "BARREL" ? "maroon" : "gold"} variant="soft">{v.type === "BARREL" ? "Barrel" : "Tank"}</Badge>
                  <span style={{ flex: 1, fontSize: 14 }}>{v.type === "BARREL" ? `Barrel ${v.code}` : v.code}</span>
                  <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{v.availableL} L</span>
                </label>
              );
            })
          )}
        </div>
        {picked.length > 0 ? <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>{picked.length} vessel{picked.length > 1 ? "s" : ""} · {availableL} L available</div> : null}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Input label="Wine name" name="skuName" defaultValue={initial.skuName} required style={{ flex: "1 1 200px" }} />
        <Input label="Vintage" name="skuVintage" type="number" defaultValue={initial.skuVintage} required style={{ flex: "0 1 110px" }} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "0 1 170px" }}>
          <Input label={max !== undefined ? `Bottles (max ${max})` : "Bottles"} name="bottlesProduced" type="number" min="1" max={max} value={bottles} onChange={(e) => setBottles(e.target.value === "" ? "" : Number(e.target.value))} required />
        </div>
        <span style={{ fontSize: 13, color: "var(--text-muted)", paddingBottom: 12 }}>= {split.cases}c + {split.loose} · uses {consumed} L</span>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 220px" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Destination</span>
          <select name="destinationLocationId" defaultValue={initial.destinationLocationId} style={sel} required>
            <option value="" disabled>Choose location</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <Input label="Date" name="date" type="date" defaultValue={initial.date} style={{ flex: "0 1 170px" }} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Button type="submit" variant="primary" disabled={pending || picked.length === 0}>
          {pending ? "Working..." : mode === "create" ? "Record bottling run" : "Save changes"}
        </Button>
        {onCancel ? <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  );
}

export function BottlingClient({ vessels, locations, runs }: { vessels: VesselOpt[]; locations: LocOpt[]; runs: RunRow[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const withWine = vessels.filter((v) => v.availableL > 0);

  function run(fn: () => Promise<void>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try { await fn(); after?.(); }
      catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    });
  }

  return (
    <div>
      <Eyebrow rule>Bottling</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Bottle vessels</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "64ch" }}>
        Pick one or more vessels and bottle them into a single SKU. Wine is drawn proportionally
        across every component of the selected vessels, and the run stays traceable. Edit or delete
        a run; deleting puts the wine back.
      </p>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}

      {withWine.length === 0 ? (
        <Card><p style={{ margin: 0, color: "var(--text-secondary)" }}>No vessels have wine to bottle. Fill one in <strong>Bulk wine</strong> first.</p></Card>
      ) : (
        <Card style={{ maxWidth: 640, marginBottom: 32 }}>
          <BottlingForm
            vessels={withWine} locations={locations} mode="create" pending={pending}
            initial={{ vesselIds: [], skuName: "", skuVintage: "", bottles: "", destinationLocationId: "", date: today }}
            onSubmit={(fd) => run(() => createBottlingRun(fd))}
          />
        </Card>
      )}

      <Eyebrow rule>Recent runs</Eyebrow>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {runs.length === 0 ? <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No bottling runs yet.</p> :
          runs.map((r) => {
            const s = casesAndLoose(r.bottlesProduced);
            const editing = editingId === r.id;
            return (
              <Card key={r.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <strong>{r.skuName} {r.skuVintage}</strong>
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <Badge tone="gold" variant="soft">{r.bottlesProduced} bottles · {s.cases}c + {s.loose}</Badge>
                    {!editing ? <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditingId(r.id)}>edit</Button> : null}
                    <ConfirmButton onConfirm={() => run(() => deleteBottlingRun(r.id))} disabled={pending}>delete</ConfirmButton>
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{r.date} → {r.location}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>{r.sources.map((src, i) => <div key={i}>↳ {src}</div>)}</div>
                {editing ? (
                  <div style={{ marginTop: 14, borderTop: "1px solid var(--border-strong)", paddingTop: 14 }}>
                    <BottlingForm
                      vessels={vessels} locations={locations} mode="edit" pending={pending}
                      initial={{ vesselIds: r.vesselIds, skuName: r.skuName, skuVintage: r.skuVintage, bottles: r.bottlesProduced, destinationLocationId: r.destinationLocationId, date: r.date }}
                      onSubmit={(fd) => run(() => editBottlingRun(r.id, fd), () => setEditingId(null))}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                ) : null}
              </Card>
            );
          })}
      </div>
    </div>
  );
}
