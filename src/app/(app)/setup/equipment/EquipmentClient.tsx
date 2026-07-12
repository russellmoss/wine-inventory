"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Badge, Eyebrow } from "@/components/ui";
import { EQUIPMENT_KINDS, EQUIPMENT_STATUSES, equipmentKindLabel, type EquipmentRow } from "@/lib/equipment/vocab";
import { createEquipmentAction, updateEquipmentAction, archiveEquipmentAction } from "@/lib/equipment/actions";

type LocationRow = { id: string; name: string; kind: string | null };
const field: React.CSSProperties = { fontSize: 14, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 };
const STATUS_TONE: Record<string, "green" | "gold" | "neutral" | "red"> = { available: "green", in_use: "gold", maintenance: "neutral", retired: "red" };

export function EquipmentClient({ equipment, locations, isAdmin }: { equipment: EquipmentRow[]; locations: LocationRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<EquipmentRow | null>(null);
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<string>("press");
  const [status, setStatus] = React.useState<string>("available");
  const [locationId, setLocationId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const locName = (id: string | null) => (id ? locations.find((l) => l.id === id)?.name ?? null : null);

  function reset() {
    setEditing(null); setName(""); setKind("press"); setStatus("available"); setLocationId(""); setNotes(""); setError(null);
  }
  function startEdit(e: EquipmentRow) {
    setEditing(e); setName(e.name); setKind(e.kind); setStatus(e.status); setLocationId(e.locationId ?? ""); setNotes(e.notes ?? ""); setError(null);
  }
  function save() {
    setError(null);
    if (!name.trim()) { setError("Give the equipment a name."); return; }
    startTransition(async () => {
      try {
        if (editing) await updateEquipmentAction({ id: editing.id, name, kind, status, locationId: locationId || null, notes });
        else await createEquipmentAction({ name, kind, status, locationId: locationId || null, notes });
        reset();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the equipment.");
      }
    });
  }
  function toggleActive(e: EquipmentRow) {
    startTransition(async () => {
      try { await archiveEquipmentAction({ id: e.id, active: !e.isActive }); router.refresh(); }
      catch (err) { setError(err instanceof Error ? err.message : "Couldn't update."); }
    });
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 4px 60px" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "8px 0 4px" }}>Equipment</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>Presses, filters, pumps, and other gear. Referenced on work-order tasks as advisory required equipment.</p>

      {isAdmin ? (
        <Card style={{ padding: 16, marginTop: 12 }}>
          <Eyebrow>{editing ? "Edit equipment" : "Add equipment"}</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
            <label style={labelStyle}>Name<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bucher XPlus 22" /></label>
            <label style={labelStyle}>Kind
              <select style={field} value={kind} onChange={(e) => setKind(e.target.value)}>
                {EQUIPMENT_KINDS.map((k) => <option key={k} value={k}>{equipmentKindLabel(k)}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Status
              <select style={field} value={status} onChange={(e) => setStatus(e.target.value)}>
                {EQUIPMENT_STATUSES.map((s) => <option key={s} value={s}>{equipmentKindLabel(s)}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Location
              <select style={field} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">— none —</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          </div>
          <label style={{ ...labelStyle, marginTop: 10 }}>Notes<Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" /></label>
          {error ? <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button disabled={pending} onClick={save}>{editing ? "Save changes" : "Add equipment"}</Button>
            {editing ? <Button variant="ghost" onClick={reset}>Cancel</Button> : null}
          </div>
        </Card>
      ) : null}

      <section style={{ marginTop: 20 }}>
        <Eyebrow>Registry ({equipment.length})</Eyebrow>
        {equipment.length === 0 ? (
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 10 }}>No equipment yet.{isAdmin ? " Add your first above." : ""}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {equipment.map((e) => (
              <Card key={e.id} padding="10px 14px" style={{ opacity: e.isActive ? 1 : 0.6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{e.name}</span>
                    <span style={{ fontSize: 12.5, color: "var(--text-muted)", marginLeft: 8 }}>
                      {equipmentKindLabel(e.kind)}{locName(e.locationId) ? ` · ${locName(e.locationId)}` : ""}{e.notes ? ` · ${e.notes}` : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge tone={STATUS_TONE[e.status] ?? "neutral"}>{equipmentKindLabel(e.status)}</Badge>
                    {isAdmin ? (
                      <>
                        <Button variant="ghost" onClick={() => startEdit(e)}>Edit</Button>
                        <Button variant="ghost" onClick={() => toggleActive(e)}>{e.isActive ? "Archive" : "Restore"}</Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
