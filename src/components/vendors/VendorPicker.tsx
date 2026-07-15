"use client";

import React from "react";
import { Button } from "@/components/ui";
import { rankVendors } from "@/lib/inventory/vendor-search";
import { CreateVendorModal } from "@/components/vendors/CreateVendorModal";
import type { VendorRow } from "@/lib/vendors/vendors-shared";

// Plan 069: the mandatory vendor selector for the expendables intake. A fuzzy type-to-filter dropdown over the
// tenant's vendors, with "+ Create new vendor" PINNED at the top of the results (opens the inline create modal,
// prefilled with the typed query; on save the new vendor is selected). Selecting a vendor calls onSelect so the
// parent can autofill the URL. Purpose-built (not MaterialFilterPicker) — vendors have no category chips.

const controlStyle: React.CSSProperties = {
  height: 44,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
  width: "100%",
};

export function VendorPicker({
  vendors,
  value,
  onSelect,
  onVendorCreated,
  placeholder = "Search vendors…",
}: {
  vendors: VendorRow[];
  /** currently selected vendorId (or null). */
  value: string | null;
  onSelect: (vendor: VendorRow | null) => void;
  /** called after an inline create so the parent can refresh its vendor list (router.refresh()). */
  onVendorCreated?: (vendor: { id: string; name: string }) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const boxRef = React.useRef<HTMLDivElement>(null);

  const selected = React.useMemo(() => vendors.find((v) => v.id === value) ?? null, [vendors, value]);
  const ranked = React.useMemo(() => rankVendors(query, vendors).slice(0, 30), [query, vendors]);

  // Close the dropdown on an outside click.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(v: VendorRow) {
    onSelect(v);
    setOpen(false);
    setQuery("");
  }

  // Selected state: show a chip with the vendor + a Change button.
  if (selected) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ ...controlStyle, width: "auto", flex: "1 1 200px", display: "flex", alignItems: "center", fontWeight: 500 }}>
            {selected.name}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)} style={{ minHeight: 44 }}>Change</Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4 }}>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        aria-label="Vendor"
        style={controlStyle}
      />
      {open ? (
        <div
          role="listbox"
          style={{
            position: "absolute", top: 48, left: 0, right: 0, zIndex: 20, maxHeight: 280, overflowY: "auto",
            border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--surface-raised)",
            boxShadow: "var(--shadow-md, 0 8px 24px rgba(0,0,0,0.12))",
          }}
        >
          {/* "+ Create new vendor" PINNED at the top. */}
          <button
            type="button"
            onClick={() => { setModalOpen(true); setOpen(false); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", padding: "10px 12px",
              border: "none", borderBottom: "1px solid var(--border-subtle)", background: "transparent",
              color: "var(--wine-primary)", fontWeight: 600, cursor: "pointer", fontSize: 14,
            }}
          >
            ＋ Create new vendor{query.trim() ? ` “${query.trim()}”` : ""}
          </button>
          {ranked.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 13, color: "var(--text-muted)" }}>No vendors match — create one above.</div>
          ) : (
            ranked.map((v) => (
              <button
                key={v.id}
                type="button"
                role="option"
                onClick={() => pick(v)}
                style={{
                  display: "flex", flexDirection: "column", gap: 2, width: "100%", textAlign: "left", padding: "9px 12px",
                  border: "none", background: "transparent", cursor: "pointer", color: "var(--text-primary)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-sunken, rgba(0,0,0,0.04))")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: 14, fontWeight: 500 }}>{v.name}</span>
                {v.contactName || v.email ? (
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{[v.contactName, v.email].filter(Boolean).join(" · ")}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}

      <CreateVendorModal
        key={modalOpen ? "cv-open" : "cv-closed"}
        open={modalOpen}
        initialName={query.trim()}
        onClose={() => setModalOpen(false)}
        onCreated={(v) => {
          setModalOpen(false);
          setQuery("");
          onVendorCreated?.(v);
          // Select the newly-created vendor. It may not be in `vendors` until the parent refreshes, so build a
          // minimal row; the parent's refresh will hydrate the rest.
          onSelect({ id: v.id, name: v.name, phone: null, email: null, contactName: null, accountNumber: null, poRequired: false, terms: null, url: null, notes: null, isActive: true, contacts: [] });
        }}
      />
    </div>
  );
}
