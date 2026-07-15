"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Badge, Eyebrow, Modal } from "@/components/ui";
import { CreateVendorModal } from "@/components/vendors/CreateVendorModal";
import { VendorForm, vendorToForm, vendorFormToInput, vendorFormValid, type VendorFormValue } from "@/components/vendors/VendorForm";
import { updateVendorAction, archiveVendorAction } from "@/lib/vendors/actions";
import { rankVendors } from "@/lib/inventory/vendor-search";
import type { VendorRow } from "@/lib/vendors/vendors-shared";

// Plan 069: the vendor registry CRUD. Add/edit via the shared VendorForm (name/phone/email required + N
// contacts). Archive/restore is admin-only. Fuzzy search over name/contact/email.
export function VendorsClient({ vendors, isAdmin }: { vendors: VendorRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<VendorRow | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const shown = React.useMemo(() => rankVendors(query, vendors), [query, vendors]);

  function toggleActive(v: VendorRow) {
    setError(null);
    startTransition(async () => {
      try { await archiveVendorAction({ id: v.id, active: !v.isActive }); router.refresh(); }
      catch (e) { setError(e instanceof Error ? e.message : "Couldn't update the vendor."); }
    });
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 4px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "8px 0 4px" }}>Vendors</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>Suppliers for expendables and the accounts you buy under. Used across the app and on accounting bills.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>＋ Add vendor</Button>
      </div>

      <div style={{ marginTop: 12, maxWidth: 360 }}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendors…" aria-label="Search vendors" />
      </div>
      {error ? <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}

      <section style={{ marginTop: 16 }}>
        <Eyebrow>Vendors ({vendors.length})</Eyebrow>
        {shown.length === 0 ? (
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 10 }}>{vendors.length === 0 ? "No vendors yet. Add your first above." : "No vendors match your search."}</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {shown.map((v) => (
              <Card key={v.id} padding="10px 14px" style={{ opacity: v.isActive ? 1 : 0.6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{v.name}</span>
                    <span style={{ fontSize: 12.5, color: "var(--text-muted)", marginLeft: 8 }}>
                      {[v.contactName, v.phone, v.email].filter(Boolean).join(" · ") || "no contact info"}
                    </span>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {v.terms ? <Badge tone="neutral">{v.terms}</Badge> : null}
                      {v.poRequired ? <Badge tone="gold">PO required</Badge> : null}
                      {v.contacts.length > 0 ? <span>{v.contacts.length} contact{v.contacts.length === 1 ? "" : "s"}</span> : null}
                      {v.url ? <a href={v.url} target="_blank" rel="noreferrer" style={{ color: "var(--wine-primary)" }}>website</a> : null}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Button variant="ghost" onClick={() => setEditing(v)}>Edit</Button>
                    {isAdmin ? <Button variant="ghost" disabled={pending} onClick={() => toggleActive(v)}>{v.isActive ? "Archive" : "Restore"}</Button> : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <CreateVendorModal
        key={addOpen ? "add-open" : "add-closed"}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => { setAddOpen(false); router.refresh(); }}
      />

      <EditVendorModal
        key={editing?.id ?? "edit-none"}
        vendor={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); router.refresh(); }}
      />
    </div>
  );
}

function EditVendorModal({ vendor, onClose, onSaved }: { vendor: VendorRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState<VendorFormValue>(() => (vendor ? vendorToForm(vendor) : ({} as VendorFormValue)));
  const patch = (p: Partial<VendorFormValue>) => setForm((f) => ({ ...f, ...p }));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  // Edit gate is name-only: an existing vendor may predate the name+phone+email create requirement
  // (seeded "Unknown", A/P-created), and must stay editable.
  const canSubmit = !!vendor && vendorFormValid(form, { requireContact: false }) && !pending;

  function submit() {
    if (!vendor || !canSubmit) return;
    setError(null);
    startTransition(async () => {
      try { await updateVendorAction(vendor.id, vendorFormToInput(form)); onSaved(); }
      catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the vendor."); }
    });
  }

  return (
    <Modal open={!!vendor} onClose={onClose} title={vendor ? `Edit · ${vendor.name}` : "Edit vendor"} subtitle="Name, phone, and email are required" maxWidth="min(620px, 96vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {vendor ? <VendorForm value={form} onChange={patch} /> : null}
        {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p> : null}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="button" variant="primary" onClick={submit} disabled={!canSubmit}>{pending ? "Saving…" : "Save changes"}</Button>
        </div>
      </div>
    </Modal>
  );
}
