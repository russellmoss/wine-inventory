"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Badge, Eyebrow, Modal } from "@/components/ui";
import { CreateVendorModal } from "@/components/vendors/CreateVendorModal";
import { MergeVendorModal } from "@/components/vendors/MergeVendorModal";
import { VendorPicker } from "@/components/vendors/VendorPicker";
import { VendorForm, vendorToForm, vendorFormToInput, vendorFormValid, type VendorFormValue } from "@/components/vendors/VendorForm";
import {
  updateVendorAction, archiveVendorAction, removeVendorAction,
  pullVendorsFromQboAction, acceptVendorImportCandidateAction, rejectVendorImportCandidateAction, mergeVendorImportCandidateAction,
} from "@/lib/vendors/actions";
import { rankVendors } from "@/lib/inventory/vendor-search";
import type { VendorRow } from "@/lib/vendors/vendors-shared";
import type { VendorImportCandidateDTO } from "@/lib/vendors/vendor-import-core";

// Plan 069: the vendor registry CRUD. Add/edit via the shared VendorForm (name/phone/email required + N
// contacts). Archive/restore is admin-only. Fuzzy search over name/contact/email.
export function VendorsClient({ vendors, isAdmin, importCandidates = [], qboPushEnabled = false }: { vendors: VendorRow[]; isAdmin: boolean; importCandidates?: VendorImportCandidateDTO[]; qboPushEnabled?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<VendorRow | null>(null);
  const [merging, setMerging] = React.useState<VendorRow | null>(null);
  const [removing, setRemoving] = React.useState<VendorRow | null>(null);
  const [mergingCandidate, setMergingCandidate] = React.useState<VendorImportCandidateDTO | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [pullMsg, setPullMsg] = React.useState<string | null>(null);

  const shown = React.useMemo(() => rankVendors(query, vendors), [query, vendors]);
  const vendorName = React.useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);

  function toggleActive(v: VendorRow) {
    setError(null);
    startTransition(async () => {
      try { await archiveVendorAction({ id: v.id, active: !v.isActive }); router.refresh(); }
      catch (e) { setError(e instanceof Error ? e.message : "Couldn't update the vendor."); }
    });
  }

  function pull() {
    setError(null); setPullMsg(null);
    startTransition(async () => {
      try {
        const res = await pullVendorsFromQboAction();
        if (res.ok) { setPullMsg(`Pulled ${res.data.pulled} from QuickBooks — ${res.data.candidates} to review, ${res.data.skippedSynced} already linked.`); router.refresh(); }
        else setError(res.error);
      } catch { setError("Couldn't reach QuickBooks — check the connection and try again."); }
    });
  }

  function resolveCandidate(id: string, act: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await act(id);
        if (res.ok) router.refresh();
        else setError(res.error ?? "Couldn't update that candidate.");
      } catch { setError("Something went wrong — please try again."); }
    });
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "8px 4px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "8px 0 4px" }}>Vendors</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 0 }}>Suppliers for expendables and the accounts you buy under. Used across the app and on accounting bills.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isAdmin ? <Button variant="ghost" disabled={pending} onClick={pull}>{pending ? "Working…" : "Pull vendors from QBO"}</Button> : null}
          <Button onClick={() => setAddOpen(true)}>＋ Add vendor</Button>
        </div>
      </div>

      <div style={{ marginTop: 12, maxWidth: 360 }}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendors…" aria-label="Search vendors" />
      </div>
      {pullMsg ? <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 8 }}>{pullMsg}</div> : null}
      {error ? <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</div> : null}

      {isAdmin && importCandidates.length > 0 ? (
        <section style={{ marginTop: 16 }}>
          <Eyebrow>From QuickBooks · to review ({importCandidates.length})</Eyebrow>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 10px" }}>
            Vendors found in QuickBooks that aren&apos;t in Cellarhand yet. Accept the ones the cellar buys from; reject the rest (payroll, insurance, the accountant).
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {importCandidates.map((c) => (
              <Card key={c.id} padding="10px 14px">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    {c.variantCount > 1 ? <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{c.variantCount} currency variants</span> : null}
                    {c.suggestedVendorId ? (
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                        Looks like <strong>{vendorName.get(c.suggestedVendorId) ?? "an existing vendor"}</strong> — merge if it&apos;s the same.
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Button variant="ghost" disabled={pending} onClick={() => resolveCandidate(c.id, acceptVendorImportCandidateAction)}>Accept</Button>
                    <Button variant="ghost" disabled={pending} onClick={() => setMergingCandidate(c)}>Merge into…</Button>
                    <Button variant="ghost" disabled={pending} onClick={() => resolveCandidate(c.id, rejectVendorImportCandidateAction)}>Reject</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

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
                    {isAdmin ? <Button variant="ghost" disabled={pending} onClick={() => setMerging(v)}>Merge</Button> : null}
                    {isAdmin ? <Button variant="ghost" disabled={pending} onClick={() => toggleActive(v)}>{v.isActive ? "Archive" : "Restore"}</Button> : null}
                    {isAdmin ? <Button variant="ghost" disabled={pending} onClick={() => setRemoving(v)}>Remove</Button> : null}
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
        qboPushEnabled={qboPushEnabled}
        onCreated={() => { setAddOpen(false); router.refresh(); }}
      />

      <EditVendorModal
        key={editing?.id ?? "edit-none"}
        vendor={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); router.refresh(); }}
      />

      <MergeVendorModal
        key={merging?.id ?? "merge-none"}
        loser={merging}
        vendors={vendors}
        onClose={() => setMerging(null)}
        onMerged={() => { setMerging(null); router.refresh(); }}
      />

      <RemoveVendorModal
        key={removing?.id ?? "remove-none"}
        vendor={removing}
        onClose={() => setRemoving(null)}
        onRemoved={() => { setRemoving(null); router.refresh(); }}
      />

      <MergeCandidateModal
        key={mergingCandidate?.id ?? "mc-none"}
        candidate={mergingCandidate}
        vendors={vendors}
        onClose={() => setMergingCandidate(null)}
        onMerged={() => { setMergingCandidate(null); router.refresh(); }}
      />
    </div>
  );
}

// Plan 075: pick an existing vendor to link a QBO import candidate onto. Blocks (CONFLICT) when the chosen
// vendor already maps to a different QBO vendor — surfaced inline so the admin can pick another or Cancel.
function MergeCandidateModal({ candidate, vendors, onClose, onMerged }: { candidate: VendorImportCandidateDTO | null; vendors: VendorRow[]; onClose: () => void; onMerged: () => void }) {
  const [targetId, setTargetId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function submit() {
    if (!candidate || !targetId) return;
    setError(null);
    startTransition(async () => {
      const res = await mergeVendorImportCandidateAction(candidate.id, targetId);
      if (res.ok) onMerged();
      else setError(res.error);
    });
  }

  return (
    <Modal open={!!candidate} onClose={onClose} title={candidate ? `Merge "${candidate.name}" into…` : "Merge into…"} subtitle="Link this QuickBooks vendor to an existing Cellarhand vendor" maxWidth="min(560px, 96vw)">
      {candidate ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <VendorPicker vendors={vendors} value={targetId} onSelect={(v) => setTargetId(v?.id ?? null)} placeholder="Search Cellarhand vendors…" />
          {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p> : null}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="button" variant="primary" onClick={submit} disabled={!targetId || pending}>{pending ? "Linking…" : "Link to this vendor"}</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// Plan 072: confirm a hard-delete. removeVendorAction blocks (CONFLICT) when the vendor is still
// referenced by materials/lots/bills — we surface that message inline so the admin can Cancel and
// choose Merge or Archive instead.
function RemoveVendorModal({ vendor, onClose, onRemoved }: { vendor: VendorRow | null; onClose: () => void; onRemoved: () => void }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function submit() {
    if (!vendor) return;
    setError(null);
    startTransition(async () => {
      const res = await removeVendorAction(vendor.id);
      if (res.ok) onRemoved();
      else setError(res.error);
    });
  }

  return (
    <Modal open={!!vendor} onClose={onClose} title={vendor ? `Remove · ${vendor.name}` : "Remove vendor"} maxWidth="min(480px, 96vw)">
      {vendor ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 13.5, color: "var(--text-primary)", margin: 0 }}>
            Permanently remove <strong>{vendor.name}</strong>? This can&apos;t be undone. A vendor that&apos;s still used
            by any material, supply lot, or bill can&apos;t be removed — merge or archive it instead.
          </p>
          {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p> : null}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="button" variant="primary" onClick={submit} disabled={pending} style={{ background: "var(--danger)", borderColor: "var(--danger)" }}>{pending ? "Removing…" : "Remove"}</Button>
          </div>
        </div>
      ) : null}
    </Modal>
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
