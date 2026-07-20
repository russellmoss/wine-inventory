"use client";

import * as React from "react";
import { Button, Input, Modal } from "@/components/ui";
import { unwrap } from "@/lib/action-result";
import { useCurrency } from "@/components/money/CurrencyProvider";
import { addFinishedGoodAction } from "@/lib/inventory/actions";

// Plan 080 U7 — the "+ Add inventory" modal: define a finished good and, optionally, bring in opening stock
// with its cost, in one step.
//
// Two money rules the form encodes:
//  • MSRP is a PRICE and lives on the SKU. COGS does NOT (council C4) — the opening cost becomes a
//    FinishedGoodReceipt, so valuation stays a weighted average over receipts with history.
//  • A blank cost stays UNKNOWN rather than becoming a fabricated $0 (COST-2).
//
// And one UX rule: the blank-vintage soft-confirm fires for WINE ONLY (council S8). A vintage-less
// merchandise item is completely normal and must never be nagged about.

type Cat = { id: string; name: string };
type LocOpt = { id: string; name: string };
type Kind = "BOTTLED_WINE" | "FINISHED_GOOD";

const fieldWrap: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 };
const labelStyle: React.CSSProperties = { fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)" };
const selectStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)", fontSize: 14, padding: "8px 10px", borderRadius: "var(--radius-md)",
  border: "1px solid var(--border)", background: "var(--surface-raised)", color: "var(--text-primary)", minHeight: 38,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldWrap}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

export function AddFinishedGoodModal({
  open,
  kind,
  categories,
  locations,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** which sub-tab launched this — wine vs merchandise changes the fields AND the vintage nudge. */
  kind: Kind;
  categories: Cat[];
  locations: LocOpt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isWine = kind === "BOTTLED_WINE";
  const { symbol } = useCurrency();
  const [name, setName] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [newCategory, setNewCategory] = React.useState("");
  const [vintage, setVintage] = React.useState("");
  const [msrp, setMsrp] = React.useState("");
  const [openingQty, setOpeningQty] = React.useState("");
  const [locationId, setLocationId] = React.useState(() => locations[0]?.id ?? "");
  const [unitCost, setUnitCost] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [confirmNoVintage, setConfirmNoVintage] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const qty = openingQty.trim() === "" ? 0 : Number(openingQty);
  const canSubmit = name.trim() !== "" && (isWine || categoryId !== "" || newCategory.trim() !== "") && !(qty > 0 && !locationId);

  function reset() {
    setName(""); setCategoryId(""); setNewCategory(""); setVintage(""); setMsrp("");
    setOpeningQty(""); setUnitCost(""); setError(null); setConfirmNoVintage(false);
  }

  function submit() {
    setError(null);
    // council S8: nudge ONCE on a blank vintage, and only for wine. Merchandise never sees this.
    if (isWine && vintage.trim() === "" && !confirmNoVintage) {
      setConfirmNoVintage(true);
      return;
    }
    startTransition(async () => {
      try {
        unwrap(
          await addFinishedGoodAction({
            kind,
            name: name.trim(),
            categoryId: categoryId || null,
            newCategoryName: newCategory.trim() || null,
            vintage: isWine && vintage.trim() !== "" ? Number(vintage) : null,
            msrp: msrp.trim() === "" ? null : Number(msrp),
            openingQty: qty > 0 ? qty : null,
            locationId: qty > 0 ? locationId : null,
            // blank cost = UNKNOWN, never a fabricated $0 (COST-2)
            unitCost: unitCost.trim() === "" ? null : Number(unitCost),
          }),
        );
        reset();
        onSaved();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that item.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isWine ? "Add wine" : "Add merchandise"}
      subtitle="Catalog entry, price, and optional opening stock"
      maxWidth="min(560px, 96vw)"
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Field label={isWine ? "Wine name" : "Item name"}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={isWine ? "e.g. Estate Cabernet Sauvignon" : "e.g. Logo wine glass"} />
        </Field>

        <Field label={isWine ? "Category (optional)" : "Category"}>
          <select style={selectStyle} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); if (e.target.value) setNewCategory(""); }}>
            <option value="">{categoryId === "" && newCategory ? "— using new category —" : "— choose —"}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {!categoryId ? (
          <Field label="…or create a new category">
            <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Glassware" />
          </Field>
        ) : null}

        {isWine ? (
          <Field label="Vintage (optional)">
            <Input inputMode="numeric" value={vintage} onChange={(e) => { setVintage(e.target.value); setConfirmNoVintage(false); }} placeholder="e.g. 2024" />
          </Field>
        ) : null}

        <Field label={`MSRP (optional, ${symbol})`}>
          <Input inputMode="decimal" value={msrp} onChange={(e) => setMsrp(e.target.value)} placeholder="what you sell it for" />
        </Field>

        <div style={{ marginTop: 4, padding: 12, background: "var(--paper-100)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Opening stock (optional)</div>
          <Field label="Quantity">
            <Input inputMode="numeric" value={openingQty} onChange={(e) => setOpeningQty(e.target.value)} placeholder="0" />
          </Field>
          {qty > 0 ? (
            <>
              <Field label="Location">
                <select style={selectStyle} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  {locations.length === 0 ? <option value="">No locations</option> : null}
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label={`Cost per unit (optional, ${symbol})`}>
                <Input inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="leave blank if unknown" />
              </Field>
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                Recorded as a purchase receipt. Wine you bottled yourself already carries its own cost from the
                bottling run — don&rsquo;t re-enter it here.
              </div>
            </>
          ) : null}
        </div>

        {confirmNoVintage ? (
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-primary)" }}>
            No vintage entered — add it as a non-vintage wine? Press <strong>Add wine</strong> again to confirm.
          </div>
        ) : null}
        {error ? <div style={{ marginTop: 12, color: "var(--danger, #b3261e)", fontSize: 13 }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button type="button" variant="primary" disabled={pending || !canSubmit} onClick={submit}>
            {pending ? "Adding…" : confirmNoVintage ? "Add without vintage" : isWine ? "Add wine" : "Add item"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
