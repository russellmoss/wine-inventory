"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Eyebrow, Badge, Modal } from "@/components/ui";
import { GrowerForm, growerToForm, growerFormToInput, growerFormValid, emptyGrowerForm, type GrowerFormValue } from "@/components/growers/GrowerForm";
import { createGrower, updateGrower } from "./actions";
import { unwrap } from "@/lib/action-result";
import type { GrowerRow } from "@/lib/grower/data";

// Plan 093 follow-on / Plan 095: manage Growers (the party that farmed the fruit) at Vendor parity. Add/edit
// via the shared GrowerForm (name/phone/email/address + primary contact + N additional contacts). A
// third-party grower is also created/linked as a vendor (and pushed to QBO); estate growers are not.
// Soft deactivate (vineyards + weigh-tag lines reference growers via FK RESTRICT).

export function GrowersAdmin({ growers }: { growers: GrowerRow[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<GrowerRow | null>(null);

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return growers;
    return growers.filter((g) =>
      [g.name, g.company, g.contactName, g.email, g.phone].some((s) => s?.toLowerCase().includes(q)),
    );
  }, [query, growers]);

  function toggleActive(g: GrowerRow) {
    updateGrower({ id: g.id, isActive: !g.isActive }).then((raw) => {
      try { unwrap(raw); } catch { /* toggle is low-stakes; a failed toggle just no-ops the refresh below */ }
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 860, margin: "0 auto", padding: "8px 4px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Eyebrow>Setup</Eyebrow>
          <h1 style={{ margin: "4px 0 0", fontFamily: "var(--font-heading)", fontWeight: 300 }}>Growers</h1>
          <p style={{ color: "var(--text-secondary)", margin: "6px 0 0", maxWidth: 600 }}>
            The farms that grow your fruit — estate blocks and third-party growers. A third-party grower is
            also set up as a vendor (and in QuickBooks) so you can pay them. Growers can&apos;t be deleted once
            referenced; deactivate one to retire it.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>＋ Add grower</Button>
      </div>

      <div style={{ maxWidth: 360 }}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search growers…" aria-label="Search growers" />
      </div>

      <Card>
        <Eyebrow>Growers ({growers.length})</Eyebrow>
        {shown.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", margin: "12px 0 0" }}>
            {growers.length === 0 ? "No growers yet. Add your first one above." : "No growers match your search."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>
            {shown.map((g) => (
              <div key={g.id} className={g.isActive ? undefined : "bw-inactive"} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 500 }}>{g.name}</span>{" "}
                  {g.isEstate ? <Badge tone="wine">Estate</Badge> : null}
                  {g.vendorId ? <Badge tone="neutral">Vendor</Badge> : null}
                  {g.isActive ? null : <Badge>Inactive</Badge>}
                  <div style={{ fontSize: "var(--text-body-sm)", color: "var(--text-secondary)", marginTop: 2 }}>
                    {[g.contactName, g.phone, g.email].filter(Boolean).join(" · ") || "no contact info"}
                    {g.contacts.length > 0 ? ` · ${g.contacts.length} more contact${g.contacts.length === 1 ? "" : "s"}` : ""}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(g)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => toggleActive(g)}>{g.isActive ? "Deactivate" : "Reactivate"}</Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <GrowerModal
        key={addOpen ? "add-open" : "add-closed"}
        mode="add"
        grower={null}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onDone={() => { setAddOpen(false); router.refresh(); }}
      />
      <GrowerModal
        key={editing?.id ?? "edit-none"}
        mode="edit"
        grower={editing}
        open={!!editing}
        onClose={() => setEditing(null)}
        onDone={() => { setEditing(null); router.refresh(); }}
      />
    </div>
  );
}

function GrowerModal({ mode, grower, open, onClose, onDone }: {
  mode: "add" | "edit";
  grower: GrowerRow | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = React.useState<GrowerFormValue>(() => (grower ? growerToForm(grower) : emptyGrowerForm));
  const patch = (p: Partial<GrowerFormValue>) => setForm((f) => ({ ...f, ...p }));
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Create requires the full contact set (Vendor parity); edit relaxes it (a pre-095 grower may only have a name).
  const canSubmit = growerFormValid(form, { requireContact: mode === "add" }) && !busy;

  async function submit() {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      const input = growerFormToInput(form);
      const raw = mode === "add"
        ? await createGrower(input)
        : await updateGrower({ id: grower!.id, ...input });
      // unwrap() re-throws a server-side ActionError (redaction-safe); the inner result carries a
      // core-level validation failure (e.g. a duplicate name) as { ok:false, error }.
      const res = unwrap(raw);
      if (!res.ok) { setError(res.error); return; }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the grower — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "add" ? "Add a grower" : grower ? `Edit · ${grower.name}` : "Edit grower"}
      subtitle={mode === "add" ? "Name, primary contact, phone, email, and address are required" : undefined}
      maxWidth="min(640px, 96vw)"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <GrowerForm value={form} onChange={patch} />
        {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p> : null}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" variant="primary" onClick={submit} disabled={!canSubmit}>
            {busy ? "Saving…" : mode === "add" ? "Add grower" : "Save changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
