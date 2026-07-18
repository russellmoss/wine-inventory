"use client";

import React from "react";
import { Modal, Button } from "@/components/ui";
import { VendorForm, emptyVendorForm, vendorFormToInput, vendorFormValid, type VendorFormValue } from "@/components/vendors/VendorForm";
import { createVendorAction, checkVendorNearMatchesAction } from "@/lib/vendors/actions";

// Plan 069: the inline "+ create new vendor" modal used by the VendorPicker (expendables intake) and anywhere
// a vendor must be created on the fly. On save it calls createVendorAction and hands the new { id, name } back
// to the opener so the picker can select it immediately. State resets via a `key` remount in the parent.
// Plan 074: as the name is typed it checks for near-duplicate vendors and bands the result:
//   • HIGH ("Scott Labs" vs "Scott Laboratories") — SOFT-BLOCK: a "use the existing one / create anyway" panel.
//   • MEDIUM (weaker, e.g. shares a word) — a LIGHT, non-blocking hint; the normal Create button still creates
//     in one click. Mirrors the assistant, which only acts on HIGH. Advisory only — never an auto-merge.
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

  // Editing the name invalidates any near-match result already shown (it was for the old name).
  const patch = (p: Partial<VendorFormValue>) => {
    if (p.name !== undefined) setMatches(null);
    setForm((f) => ({ ...f, ...p }));
  };

  // Proactively check for near-dups as the name is typed (debounced), so the HIGH panel / MEDIUM hint is
  // already on screen before the user clicks Create — MEDIUM never costs an extra click. Advisory: ignore errors.
  React.useEffect(() => {
    const name = form.name.trim();
    if (!name) return;
    let cancelled = false;
    const t = setTimeout(() => {
      checkVendorNearMatchesAction(name).then((r) => { if (!cancelled) setMatches(r); }).catch(() => {});
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.name]);

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

  // Primary "Create vendor" click: authoritative near-dup check. A HIGH match soft-blocks (shows the panel);
  // a MEDIUM-only match or no match creates directly — one click.
  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await checkVendorNearMatchesAction(form.name.trim());
        setMatches(res);
        if (res.high.length) return; // HIGH → wait for the user's use-existing / create-anyway decision
        doCreate();
      } catch {
        doCreate(); // the guard is advisory — a failed check never blocks creation
      }
    });
  }

  const highMatches = matches?.high ?? [];
  const mediumMatches = matches?.medium ?? [];
  const softBlocked = highMatches.length > 0;

  return (
    <Modal open={open} onClose={onClose} title="New vendor" subtitle="Name, phone, and email are required" maxWidth="min(620px, 96vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <VendorForm value={form} onChange={patch} />

        {softBlocked ? (
          // HIGH — soft-block: strong panel, use an existing vendor or create anyway.
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
              {highMatches.map((m) => (
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
        ) : mediumMatches.length > 0 ? (
          // MEDIUM — light, non-blocking hint. The normal Create button still creates in one click.
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            Similar existing{mediumMatches.length > 1 ? " vendors" : " vendor"}:{" "}
            {mediumMatches.map((m, i) => (
              <React.Fragment key={m.id}>
                {i > 0 ? ", " : ""}
                <button
                  type="button"
                  onClick={() => onCreated({ id: m.id, name: m.name })}
                  disabled={pending}
                  style={{
                    padding: 0, border: "none", background: "none", cursor: pending ? "default" : "pointer",
                    color: "var(--wine-primary)", fontWeight: 600, fontSize: 12, fontFamily: "inherit",
                  }}
                >
                  {m.name}
                </button>
              </React.Fragment>
            ))}
            . Create below if this is a different one.
          </p>
        ) : null}

        {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          {softBlocked ? (
            <Button type="button" variant="primary" onClick={doCreate} disabled={!canSubmit}>
              {pending ? "Creating…" : `Create “${form.name.trim()}” anyway`}
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={submit} disabled={!canSubmit}>
              {pending ? "Working…" : "Create vendor"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
