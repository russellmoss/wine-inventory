"use client";

import React from "react";
import { Modal, Input, Button } from "@/components/ui";
import {
  MATERIAL_KINDS,
  RATE_BASES,
  RATE_BASIS_LABELS,
  type MaterialKind,
  type RateBasis,
} from "@/lib/cellar/additions-math";
import { STOCK_UNITS, type CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import { createStockMaterialAction } from "@/lib/cellar/actions";

// Phase 8 (Unit 10): the stock-aware material picker. Replaces the free-text datalist with a
// kind-filtered dropdown that shows on-hand next to each item, a "Create new…" modal that seeds a
// costed opening SupplyLot, and a graceful free-text fallback for untracked materials. It emits the
// material NAME (+ the matched DTO) so the addition/fining path is unchanged — the core resolves and
// depletes by name. Selecting a zero-stock item is allowed but flags unknown-cost at entry (D14).

const CREATE = "__create__";
const OTHER = "__other__";

const KIND_LABELS: Record<MaterialKind, string> = {
  YEAST: "Yeast",
  MLF: "Malolactic culture",
  SO2: "SO₂",
  NUTRIENT: "Nutrient",
  ACID: "Acid",
  TANNIN: "Tannin",
  FINING: "Fining agent",
  ENZYME: "Enzyme",
  OTHER: "Other",
};

const controlStyle: React.CSSProperties = {
  height: 44,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

function stockLabel(m: CellarMaterialDTO): string {
  if (!m.isStockTracked) return m.name;
  const qty = m.onHand ?? 0;
  return `${m.name} · ${qty} ${m.stockUnit ?? ""} on hand`.trimEnd();
}

export function MaterialPicker({
  materials,
  value,
  onChange,
  kind,
  defaultKind,
  placeholder = "Material",
  ariaLabel = "Material",
  style,
}: {
  materials: CellarMaterialDTO[];
  value: string;
  /** name is what the addition path consumes; dto is the matched material (basis prefill + stock). */
  onChange: (name: string, dto?: CellarMaterialDTO) => void;
  /** filter the dropdown to one kind (e.g. FINING on the fine form, or a staged row's kind). */
  kind?: MaterialKind;
  /** the kind pre-selected in the create modal when the picker isn't kind-filtered. */
  defaultKind?: MaterialKind;
  placeholder?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
}) {
  const list = React.useMemo(
    () => (kind ? materials.filter((m) => m.kind === kind) : materials),
    [materials, kind],
  );
  const matched = React.useMemo(
    () => materials.find((m) => m.name.toLowerCase() === value.trim().toLowerCase()),
    [materials, value],
  );
  // Typing mode: user chose "type a name" or the current value isn't a known material.
  const [typing, setTyping] = React.useState(false);
  const inFreetext = typing || (value.trim().length > 0 && !matched);

  const [modalOpen, setModalOpen] = React.useState(false);

  function handleSelect(v: string) {
    if (v === CREATE) {
      setModalOpen(true);
      return;
    }
    if (v === OTHER) {
      setTyping(true);
      onChange("", undefined);
      return;
    }
    const m = list.find((x) => x.id === v);
    if (m) {
      setTyping(false);
      onChange(m.name, m);
    }
  }

  const zeroStock = matched?.isStockTracked && (matched.onHand ?? 0) <= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      {inFreetext ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value, undefined)}
            placeholder={placeholder}
            aria-label={ariaLabel}
            style={{ ...controlStyle, flex: 1 }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setTyping(false);
              onChange("", undefined);
            }}
            style={{ minHeight: 44 }}
          >
            Pick from stock
          </Button>
        </div>
      ) : (
        <select
          value={matched ? matched.id : ""}
          onChange={(e) => handleSelect(e.target.value)}
          aria-label={ariaLabel}
          style={{ ...controlStyle, width: "100%" }}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {list.map((m) => (
            <option key={m.id} value={m.id}>
              {stockLabel(m)}
            </option>
          ))}
          <option value={CREATE}>＋ Create new stock item…</option>
          <option value={OTHER}>Type a name (untracked)…</option>
        </select>
      )}

      {zeroStock ? (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          No stock on hand — this addition will record as unknown-cost.
        </span>
      ) : null}

      <CreateStockMaterialModal
        key={modalOpen ? "create-open" : "create-closed"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultKind={kind ?? defaultKind ?? "OTHER"}
        lockKind={!!kind}
        onCreated={(dto) => {
          setModalOpen(false);
          setTyping(false);
          onChange(dto.name, dto);
        }}
      />
    </div>
  );
}

function CreateStockMaterialModal({
  open,
  onClose,
  defaultKind,
  lockKind,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultKind: MaterialKind;
  lockKind: boolean;
  onCreated: (dto: CellarMaterialDTO) => void;
}) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<MaterialKind>(defaultKind);
  const [basis, setBasis] = React.useState<RateBasis | "">("");
  const [percentActive, setPercentActive] = React.useState("");
  const [stockUnit, setStockUnit] = React.useState<string>("g");
  const [openingQty, setOpeningQty] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Form state resets on open via a `key` remount in the parent — no reset effect needed.
  const nameValid = name.trim().length > 0;

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const dto = await createStockMaterialAction({
          name: name.trim(),
          kind,
          defaultBasis: basis || undefined,
          percentActive: percentActive.trim() !== "" ? Number(percentActive) : undefined,
          stockUnit,
          openingQty: openingQty.trim() !== "" ? Number(openingQty) : undefined,
          unitCost: unitCost.trim() !== "" ? Number(unitCost) : undefined,
        });
        onCreated(dto);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create that material.");
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Create stock item" subtitle="Add a supply with optional opening stock and cost" maxWidth="min(520px, 94vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. KMBS, DAP, bentonite" autoFocus />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as MaterialKind)} disabled={lockKind} style={controlStyle}>
              {MATERIAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 140px" }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Default dose basis</span>
            <select value={basis} onChange={(e) => setBasis(e.target.value as RateBasis | "")} style={controlStyle}>
              <option value="">— none —</option>
              {RATE_BASES.map((b) => (
                <option key={b} value={b}>
                  {RATE_BASIS_LABELS[b]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 120px" }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Stock unit</span>
            <select value={stockUnit} onChange={(e) => setStockUnit(e.target.value)} style={controlStyle}>
              {STOCK_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <Input label="% active (optional)" value={percentActive} onChange={(e) => setPercentActive(e.target.value)} inputMode="decimal" placeholder="e.g. 57" style={{ flex: "1 1 120px" }} />
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Input label="Opening stock (optional)" value={openingQty} onChange={(e) => setOpeningQty(e.target.value)} inputMode="decimal" placeholder={`qty in ${stockUnit}`} style={{ flex: "1 1 140px" }} />
          <Input label={`Cost per ${stockUnit} (optional)`} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" placeholder="unit cost" style={{ flex: "1 1 140px" }} />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
          Opening stock and cost are optional — physical tracking works without them. Leaving cost blank
          records the stock as unknown-cost until you receive a priced lot.
        </p>
        {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p> : null}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={submit} disabled={pending || !nameValid}>
            {pending ? "Creating…" : "Create stock item"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
