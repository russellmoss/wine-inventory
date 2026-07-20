"use client";

import * as React from "react";
import { Button, Input, Modal, Badge } from "@/components/ui";
import { unwrap } from "@/lib/action-result";
import { useCurrency } from "@/components/money/CurrencyProvider";
import { materialDisplayName, type CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import type { LocationOnHand } from "@/lib/cellar/materials";
import { receiveConsumableAction, adjustConsumableAction, transferConsumableAction } from "@/lib/cellar/actions";
import { resolveReceiptQuantity } from "@/lib/units/receipt-quantity";
import { VendorPicker } from "@/components/vendors/VendorPicker";
import type { VendorRow } from "@/lib/vendors/vendors-shared";
import { toExtraUnits } from "@/lib/units/custom-units";
import { MEASURE_UNITS, dimensionOf } from "@/lib/units/measure";
import type { CustomUnitRow } from "@/lib/units/custom-unit-core";

// Plan 080 U8 — the consumables Move-stock card: Receive / Adjust / Transfer AT A LOCATION, the same three
// verbs bottled wine already had. This is the payoff of the U1/U2b spine — until now a consumable had one
// flat on-hand number with no idea WHERE it physically was.
//
// Every action here is a `safeAction`, so a legitimate block ("only 3 g there, can't transfer 5") comes back
// SETTLED rather than thrown. `unwrap` re-throws it as a real Error so the caller's runner shows the actual
// reason instead of Next's redacted production error — that specific message is the whole point of the block.

type Mode = "receive" | "adjust" | "transfer";
/** Which verb the panel opens on — the caller ("Receive" vs "Move stock") decides. */
export type MoveMode = Mode;
type LocationOpt = { id: string; name: string };

const MODES: { key: Mode; label: string }[] = [
  { key: "receive", label: "Receive" },
  { key: "adjust", label: "Adjust" },
  { key: "transfer", label: "Transfer" },
];

const seg = (active: boolean): React.CSSProperties => ({
  padding: "6px 14px",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  fontWeight: active ? 600 : 500,
  color: active ? "var(--surface-raised)" : "var(--text-secondary)",
  background: active ? "var(--wine-primary)" : "transparent",
  border: "none",
  borderRadius: "calc(var(--radius-md) - 2px)",
  cursor: "pointer",
  minHeight: 34,
});

const fieldWrap: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 };
const labelStyle: React.CSSProperties = { fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)" };
const selectStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 14,
  padding: "8px 10px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)",
  background: "var(--surface-raised)",
  color: "var(--text-primary)",
  minHeight: 38,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldWrap}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

/** Per-location on-hand. A NEGATIVE balance is real (consumed past stock at that location) and is called
 *  out rather than hidden — it is the "needs a cycle count" signal the reconcile lot exists to raise. */
export function LocationOnHandList({ rows, unit }: { rows: LocationOnHand[]; unit: string }) {
  if (rows.length === 0) return <span style={{ color: "var(--text-secondary)" }}>Nothing on hand anywhere</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map((r) => (
        <div key={r.locationId} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <span>{r.locationName}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontVariantNumeric: "tabular-nums", color: r.qty < 0 ? "var(--danger, #b3261e)" : undefined }}>
              {r.qty} {unit}
            </span>
            {r.qty < 0 ? <Badge tone="red" variant="soft">needs reconcile</Badge> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MaterialMovePanel({
  material,
  locations,
  onHand,
  pending,
  run,
  initialMode = "receive",
  customUnits = [],
  vendors = [],
  onVendorCreated,
  onClose,
}: {
  material: CellarMaterialDTO | null;
  locations: LocationOpt[];
  onHand: LocationOnHand[];
  pending: boolean;
  run: (fn: () => Promise<unknown>, after?: () => void) => void;
  /** Which tab to open on. The caller keys this panel by material id, so it applies fresh on each open. */
  initialMode?: Mode;
  /** Plan 080 U15: the tenant's own units ("roll", "case"), selectable when receiving. */
  customUnits?: CustomUnitRow[];
  /** Plan 080 U17: the tenant's vendors for the receipt vendor picker. */
  vendors?: VendorRow[];
  onVendorCreated?: (vendor: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [qty, setQty] = React.useState("");
  const [delta, setDelta] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");
  // Default to the material's own stock unit, so an untouched form behaves exactly as it did pre-U15.
  const [qtyUnit, setQtyUnit] = React.useState(() => material?.stockUnit ?? "g");
  const [lotCode, setLotCode] = React.useState("");
  const [vendorId, setVendorId] = React.useState<string | null>(null);
  // Sensible defaults, computed ONCE on mount (the caller keys this panel by material id, so it remounts
  // per item). Lazy initial state rather than a syncing effect — no setState-in-effect, no extra render.
  // Default to where the stock actually IS, so the common "top up / move what's here" case is one click.
  const stockedHere = onHand[0]?.locationId ?? locations[0]?.id ?? "";
  const [locationId, setLocationId] = React.useState(() => stockedHere);
  const [fromLocationId, setFromLocationId] = React.useState(() => stockedHere);
  const [toLocationId, setToLocationId] = React.useState(() => locations.find((l) => l.id !== stockedHere)?.id ?? "");
  const { symbol } = useCurrency();

  if (!material) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;

  const m = material;
  const unit = m.stockUnit ?? "g";
  const display = materialDisplayName(m);

  // Plan 080 U15: you buy labels by the roll, not the label. Offer every unit that measures the SAME thing
  // this item is tracked in — anything else would need a density we don't have, so it isn't offered at all
  // rather than being offered and refused. The server re-resolves the conversion; this is only a preview.
  const extraUnits = toExtraUnits(customUnits);
  const stockDim = dimensionOf(unit, extraUnits);
  const unitOptions = [
    ...MEASURE_UNITS.filter((u) => dimensionOf(u, extraUnits) === stockDim),
    ...customUnits.filter((u) => dimensionOf(u.name, extraUnits) === stockDim).map((u) => u.name),
  ];
  const receiptPreview =
    qtyUnit !== unit && qty.trim() !== "" && Number(qty) > 0
      ? resolveReceiptQuantity({
          qty: Number(qty),
          qtyUnit,
          unitCost: unitCost.trim() === "" ? null : Number(unitCost),
          stockUnit: unit,
          extraUnits,
        })
      : null;

  const qtyValid = qty.trim() !== "" && Number(qty) > 0;
  const deltaValid = delta.trim() !== "" && Number(delta) !== 0 && Number.isFinite(Number(delta));
  const canSubmit =
    mode === "receive"
      ? qtyValid && !!locationId && receiptPreview?.ok !== false
      : mode === "adjust"
        ? deltaValid && !!locationId && reason.trim() !== ""
        : qtyValid && !!fromLocationId && !!toLocationId && fromLocationId !== toLocationId;

  function submit() {
    if (!canSubmit) return;
    if (mode === "receive") {
      run(
        async () =>
          unwrap(
            await receiveConsumableAction({
              materialId: m.id,
              qty: Number(qty),
              qtyUnit,
              locationId,
              unitCost: unitCost.trim() === "" ? undefined : Number(unitCost),
              lotCode: lotCode.trim() || undefined,
              vendorId: vendorId ?? undefined,
            }),
          ),
        onClose,
      );
    } else if (mode === "adjust") {
      run(async () => unwrap(await adjustConsumableAction({ materialId: m.id, locationId, delta: Number(delta), reason: reason.trim() })), onClose);
    } else {
      run(
        async () =>
          unwrap(await transferConsumableAction({ materialId: m.id, fromLocationId, toLocationId, qty: Number(qty), reason: reason.trim() || undefined })),
        onClose,
      );
    }
  }

  const locationSelect = (value: string, onChange: (v: string) => void, opts: LocationOpt[]) => (
    <select style={selectStyle} value={value} onChange={(e) => onChange(e.target.value)}>
      {opts.length === 0 ? <option value="">No locations</option> : null}
      {opts.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  );

  return (
    <Modal open onClose={onClose} title={display} subtitle="Move stock" maxWidth="min(520px, 96vw)">
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 14, padding: 12, background: "var(--paper-100)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
          <div style={{ ...labelStyle, marginBottom: 6 }}>On hand by location</div>
          <LocationOnHandList rows={onHand} unit={unit} />
        </div>

        <div role="tablist" aria-label="Move type" style={{ display: "inline-flex", gap: 2, padding: 3, background: "var(--paper-100)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", marginBottom: 14, alignSelf: "flex-start" }}>
          {MODES.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={mode === x.key} style={seg(mode === x.key)} onClick={() => setMode(x.key)}>
              {x.label}
            </button>
          ))}
        </div>

        {mode === "receive" ? (
          <>
            <Field label="Quantity received">
              <div style={{ display: "flex", gap: 8 }}>
                <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" style={{ flex: 1 }} />
                {unitOptions.length > 1 ? (
                  <select value={qtyUnit} onChange={(e) => setQtyUnit(e.target.value)} style={{ ...selectStyle, flex: "0 0 auto" }} aria-label="Unit received in">
                    {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                ) : (
                  <span style={{ alignSelf: "center", color: "var(--text-secondary)", fontSize: 14 }}>{unit}</span>
                )}
              </div>
            </Field>
            {receiptPreview ? (
              <p style={{ fontSize: 12.5, color: receiptPreview.ok ? "var(--text-muted)" : "var(--wine-primary)", margin: "-4px 0 0" }}>
                {receiptPreview.ok
                  ? `Books ${receiptPreview.qty.toLocaleString()} ${unit}${receiptPreview.unitCost != null ? ` at ${symbol}${receiptPreview.unitCost.toFixed(4)}/${unit}` : ""}.`
                  : receiptPreview.error}
              </p>
            ) : null}
            <Field label="Into location">{locationSelect(locationId, setLocationId, locations)}</Field>
            <Field label={`Cost per ${qtyUnit} (optional)`}>
              <Input inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder={`${symbol}0.00 — leave blank if unknown`} />
            </Field>
            <Field label="Lot code (optional)">
              <Input value={lotCode} onChange={(e) => setLotCode(e.target.value)} />
            </Field>
            {/* Plan 080 U17 (#373): this screen had free-text vendor entry even though vendors have been
                first-class since plan 069. The picker persists the immutable vendorId; the name is only
                ever presentation, so renaming a vendor never re-keys the receipts already booked against
                it (NAMING-1/2). The vendor list is tenant-scoped by its loader, so the lookup cannot see
                another winery's vendors (TENANT-1). */}
            <Field label="Vendor (optional)">
              <VendorPicker
                vendors={vendors}
                value={vendorId}
                onSelect={(v) => setVendorId(v?.id ?? null)}
                onVendorCreated={onVendorCreated}
              />
            </Field>
          </>
        ) : null}

        {mode === "adjust" ? (
          <>
            <Field label={`Change (${unit}) — negative removes, positive adds`}>
              <Input inputMode="decimal" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="-2" />
            </Field>
            <Field label="At location">{locationSelect(locationId, setLocationId, locations)}</Field>
            <Field label="Reason">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="cycle count, spillage, found stock…" />
            </Field>
          </>
        ) : null}

        {mode === "transfer" ? (
          <>
            <Field label={`Quantity (${unit})`}>
              <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
            </Field>
            <Field label="From">{locationSelect(fromLocationId, setFromLocationId, locations)}</Field>
            <Field label="To">{locationSelect(toLocationId, setToLocationId, locations.filter((l) => l.id !== fromLocationId))}</Field>
            <Field label="Note (optional)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {fromLocationId && fromLocationId === toLocationId ? (
              <div style={{ color: "var(--danger, #b3261e)", fontSize: 13, marginBottom: 8 }}>Pick two different locations.</div>
            ) : null}
          </>
        ) : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" disabled={pending || !canSubmit} onClick={submit}>
            {pending ? "Saving…" : mode === "receive" ? "Receive" : mode === "adjust" ? "Adjust" : "Transfer"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
