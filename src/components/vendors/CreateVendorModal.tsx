"use client";

import React from "react";
import { Modal, Button } from "@/components/ui";
import { VendorForm, emptyVendorForm, vendorFormToInput, vendorFormValid, type VendorFormValue } from "@/components/vendors/VendorForm";
import { createVendorAction, checkVendorNearMatchesAction } from "@/lib/vendors/actions";

// Plan 069: the inline "+ create new vendor" modal used by the VendorPicker (expendables intake) and anywhere
// a vendor must be created on the fly. On save it calls createVendorAction and hands the new { id, name } back
// to the opener so the picker can select it immediately. State resets via a `key` remount in the parent.
// Plan 074: before creating, it checks for near-duplicate vendors ("Scott Labs" vs "Scott Laboratories") and,
// if any, shows a "did you mean?" panel — the user picks the existing vendor or creates anyway. Advisory only.
type NearMatch = { id: string; name: string };

export function CreateVendorModal({
  open,
  onClose,
  initialName = "",
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Prefill the name from the picker's typed query. */
  initialName?: string;
  onCreated: (vendor: { id: string; name: string }) => void;
}) {
  const [form, setForm] = React.useState<VendorFormValue>({ ...emptyVendorForm, name: initialName });
  const [error, setError] = React.useState<string | null>(null);
  const [matches, setMatches] = React.useState<{ high: NearMatch[]; medium: NearMatch[] } | null>(null);
  const [pending, startTransition] = React.useTransition();
  const canSubmit = vendorFormValid(form) && !pending;

  // Editing the name invalidates any near-match panel already shown (it was for the old name).
  const patch = (p: Partial<VendorFormValue>) => {
    if (p.name !== undefined) setMatches(null);
    setForm((f) => ({ ...f, ...p }));
  };

  function doCreate() {
    const name = form.name.trim();
    setError(null);
    startTransition(async () => {
      try {
        const res = await createVendorAction(vendorFormToInput(form));
        onCreated({ id: res.id, name });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create that vendor.");
      }
    });
  }

  // Primary "Create vendor" click: check for near-dups first; if any, surface the panel instead of creating.
  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await checkVendorNearMatchesAction(form.name.trim());
        if (res.high.length || res.medium.length) setMatches(res);
        else doCreate();
      } catch {
        // If the check itself fails, don't block creation — the guard is advisory.
        doCreate();
      }
    });
  }

  const hasMatches = !!matches && (matches.high.length > 0 || matches.medium.length > 0);

  return (
    <Modal open={open} onClose={onClose} title="New vendor" subtitle="Name, phone, and email are required" maxWidth="min(620px, 96vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <VendorForm value={form} onChange={patch} />

        {hasMatches ? (
          <div
            style={{
              border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
              background: "var(--surface-sunken, rgba(0,0,0,0.03))", padding: 12, display: "flex", flexDirection: "column", gap: 10,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              This looks like a vendor you already have. Use the existing one?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...matches!.high, ...matches!.medium].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onCreated({ id: m.id, name: m.name })}
                  disabled={pending}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", textAlign: "left",
                    padding: "9px 12px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm, 6px)",
                    background: "var(--surface-raised)", cursor: pending ? "default" : "pointer", color: "var(--text-primary)", fontSize: 14,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{m.name}</span>
                  <span style={{ fontSize: 12, color: "var(--wine-primary)", fontWeight: 600 }}>Use this vendor →</span>
                </button>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
              Or, if “{form.name.trim()}” really is a different vendor, create it anyway.
            </p>
          </div>
        ) : null}

        {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          {hasMatches ? (
            <Button type="button" variant="primary" onClick={doCreate} disabled={!canSubmit}>
              {pending ? "Creating…" : `Create “${form.name.trim()}” anyway`}
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={submit} disabled={!canSubmit}>
              {pending ? "Checking…" : "Create vendor"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
