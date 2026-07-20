"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Badge, Eyebrow } from "@/components/ui";
import { EQUIPMENT_KINDS, EQUIPMENT_STATUSES, equipmentKindLabel, type EquipmentRow } from "@/lib/equipment/vocab";
import { createCostedEquipmentAction, updateEquipmentAction, archiveEquipmentAction } from "@/lib/equipment/actions";
import { unwrap } from "@/lib/action-result";
import { useCurrency } from "@/components/money/CurrencyProvider";
import { LocationOnHandList } from "@/components/inventory/MaterialMovePanel";
import type { LocationOnHand } from "@/lib/cellar/materials";
import type { CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import { materialDisplayName } from "@/lib/cellar/materials-shared";

type LocationRow = { id: string; name: string; kind: string | null };
const field: React.CSSProperties = { fontSize: 14, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 };
const STATUS_TONE: Record<string, "green" | "gold" | "neutral" | "red"> = { available: "green", in_use: "gold", maintenance: "neutral", retired: "red" };

export function EquipmentSection({
  equipment,
  locations,
  isAdmin,
  parts = [],
  partsOnHand = {},
}: {
  equipment: EquipmentRow[];
  locations: LocationRow[];
  isAdmin: boolean;
  /** Plan 080 U9: quantity-tracked EQUIPMENT-category materials — the "& parts" half of the section. */
  parts?: CellarMaterialDTO[];
  partsOnHand?: Record<string, LocationOnHand[]>;
}) {
  const { format } = useCurrency();
  const router = useRouter();
  const [editing, setEditing] = React.useState<EquipmentRow | null>(null);
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<string>("press");
  const [status, setStatus] = React.useState<string>("available");
  const [locationId, setLocationId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  // Plan 080 U9: capitalize an asset at intake (U3 cost columns).
  const [purchaseCost, setPurchaseCost] = React.useState("");
  const [vendor, setVendor] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const locName = (id: string | null) => (id ? locations.find((l) => l.id === id)?.name ?? null : null);

  function reset() {
    setEditing(null); setName(""); setKind("press"); setStatus("available"); setLocationId(""); setNotes(""); setPurchaseCost(""); setVendor(""); setError(null);
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
        else
          unwrap(
            await createCostedEquipmentAction({
              name,
              kind,
              status,
              locationId: locationId || null,
              notes,
              // blank cost stays UNKNOWN rather than becoming a fabricated $0 (COST-2)
              purchaseCostBase: purchaseCost.trim() === "" ? null : Number(purchaseCost),
              vendorName: vendor.trim() || null,
            }),
          );
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
          {!editing ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
              <label style={labelStyle}>Purchase cost
                <Input inputMode="decimal" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} placeholder="leave blank if unknown" />
              </label>
              <label style={labelStyle}>Vendor
                <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="optional" />
              </label>
            </div>
          ) : null}
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
                      {equipmentKindLabel(e.kind)}{locName(e.locationId) ? ` · ${locName(e.locationId)}` : ""}
                      {e.purchaseCostBase != null ? ` · ${format(e.purchaseCostBase)}` : ""}
                      {e.vendorName ? ` · ${e.vendorName}` : ""}{e.notes ? ` · ${e.notes}` : ""}
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

      {/* Plan 080 U9: the "& parts" half — quantity-tracked EQUIPMENT-category consumables (clamps, gaskets,
          fittings bought by the box). They are NOT assets: they live as CellarMaterial + SupplyLot and are
          expensed, not capitalized (WORKORDER-7). Surfaced here by CATEGORY, so no data moves. */}
      <section style={{ marginTop: 28 }}>
        <Eyebrow>Parts ({parts.length})</Eyebrow>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          Quantity-tracked spares — clamps, gaskets, fittings. Manage stock under Consumables; shown here so
          &ldquo;equipment &amp; parts&rdquo; is one place.
        </p>
        {parts.length === 0 ? (
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 10 }}>No parts tracked yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {parts.map((p) => (
              <Card key={p.id} padding="10px 14px">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{materialDisplayName(p)}</span>
                    <span style={{ fontSize: 12.5, color: "var(--text-muted)", marginLeft: 8 }}>
                      {p.onHand ?? 0} {p.stockUnit ?? ""} on hand
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, minWidth: 180 }}>
                    <LocationOnHandList rows={partsOnHand[p.id] ?? []} unit={p.stockUnit ?? ""} />
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
