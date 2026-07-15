"use client";

import React from "react";
import { Modal, Button } from "@/components/ui";
import { VendorForm, emptyVendorForm, vendorFormToInput, vendorFormValid, type VendorFormValue } from "@/components/vendors/VendorForm";
import { createVendorAction } from "@/lib/vendors/actions";

// Plan 069: the inline "+ create new vendor" modal used by the VendorPicker (expendables intake) and anywhere
// a vendor must be created on the fly. On save it calls createVendorAction and hands the new { id, name } back
// to the opener so the picker can select it immediately. State resets via a `key` remount in the parent.
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
  const patch = (p: Partial<VendorFormValue>) => setForm((f) => ({ ...f, ...p }));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const canSubmit = vendorFormValid(form) && !pending;

  function submit() {
    if (!canSubmit) return;
    setError(null);
    const name = form.name.trim();
    startTransition(async () => {
      try {
        const res = await createVendorAction(vendorFormToInput(form));
        onCreated({ id: res.id, name });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create that vendor.");
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="New vendor" subtitle="Name, phone, and email are required" maxWidth="min(620px, 96vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <VendorForm value={form} onChange={patch} />
        {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p> : null}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="button" variant="primary" onClick={submit} disabled={!canSubmit}>
            {pending ? "Creating…" : "Create vendor"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
