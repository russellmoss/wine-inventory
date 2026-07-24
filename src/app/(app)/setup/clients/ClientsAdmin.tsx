"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Eyebrow, Badge } from "@/components/ui";
import { createClient, updateClient } from "./actions";

// Plan 093 follow-on: manage custom-crush Owners (clients). Add / rename / change kind / deactivate.
// Deactivate is soft (lots reference owners via FK RESTRICT) — a deactivated client just drops out of new
// pickers. Warm-editorial, tokens, sentence-case, native selects.

type Owner = { id: string; name: string; kind: "CUSTOM_CRUSH_CLIENT" | "AP_PROPRIETOR"; isActive: boolean };

const KIND_LABEL: Record<Owner["kind"], string> = {
  CUSTOM_CRUSH_CLIENT: "Custom-crush client",
  AP_PROPRIETOR: "Alternating proprietor",
};
const selectStyle: React.CSSProperties = { height: 44, padding: "0 12px", fontSize: 15, fontFamily: "var(--font-body)", color: "var(--text-primary)", background: "var(--surface-raised)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--border-strong)", borderRadius: "var(--radius-md)" };

export function ClientsAdmin({ owners }: { owners: Owner[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<Owner["kind"]>("CUSTOM_CRUSH_CLIENT");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function add() {
    setError(null);
    if (!name.trim()) { setError("Enter a client name."); return; }
    setBusy(true);
    try {
      const res = await createClient({ name: name.trim(), kind });
      if (!res.ok) { setError(res.error); return; }
      setName("");
      router.refresh();
    } catch { setError("Couldn't add the client — try again."); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      <div>
        <Eyebrow>Setup</Eyebrow>
        <h1 style={{ margin: "4px 0 0", fontFamily: "var(--font-heading)", fontWeight: 300 }}>Clients</h1>
        <p style={{ color: "var(--text-secondary)", margin: "6px 0 0", maxWidth: 600 }}>
          The owners whose wine you make under custom crush — clients and alternating proprietors. Assign a
          lot&apos;s owner during intake (weigh-tags) or from the assistant. Clients can&apos;t be deleted once
          their wine exists; deactivate one to retire it.
        </p>
      </div>

      <Card>
        <Eyebrow>Add a client</Eyebrow>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Smith Family Cellars" style={{ flex: 1, minWidth: 200 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "var(--text-caption)", color: "var(--text-secondary)", fontWeight: "var(--weight-medium)" as unknown as number }}>Kind</span>
            <select style={selectStyle} value={kind} onChange={(e) => setKind(e.target.value as Owner["kind"])}>
              <option value="CUSTOM_CRUSH_CLIENT">Custom-crush client</option>
              <option value="AP_PROPRIETOR">Alternating proprietor</option>
            </select>
          </div>
          <Button onClick={add} disabled={busy}>{busy ? "Adding…" : "Add client"}</Button>
        </div>
        {error ? <p style={{ color: "var(--danger)", marginTop: 10, fontSize: "var(--text-body-sm)" }}>{error}</p> : null}
      </Card>

      <Card>
        <Eyebrow>Clients</Eyebrow>
        {owners.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", margin: "12px 0 0" }}>No clients yet. Add your first one above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>
            {owners.map((o) => <ClientRow key={o.id} owner={o} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

function ClientRow({ owner }: { owner: Owner }) {
  const router = useRouter();
  const [active, setActive] = React.useState(owner.isActive);
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(owner.name);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function save(patch: { name?: string; isActive?: boolean }) {
    setErr(null);
    setBusy(true);
    try {
      const res = await updateClient({ id: owner.id, ...patch });
      if (!res.ok) { setErr(res.error); return; }
      if (patch.isActive != null) setActive(patch.isActive);
      if (patch.name != null) setEditing(false);
      router.refresh();
    } catch { setErr("Couldn't save — try again."); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border-subtle)", opacity: active ? 1 : 0.6 }}>
      {editing ? (
        <>
          <Input value={name} onChange={(e) => setName(e.target.value)} size="sm" style={{ flex: 1 }} error={err ?? undefined} />
          <Button variant="secondary" size="sm" onClick={() => save({ name: name.trim() })} disabled={busy}>Save</Button>
          <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setName(owner.name); setErr(null); }}>Cancel</Button>
        </>
      ) : (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 500 }}>{owner.name}</span>{" "}
            <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-body-sm)" }}>· {KIND_LABEL[owner.kind]}</span>
          </div>
          {active ? null : <Badge>Inactive</Badge>}
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Rename</Button>
          <Button variant="ghost" size="sm" onClick={() => save({ isActive: !active })} disabled={busy}>{active ? "Deactivate" : "Reactivate"}</Button>
        </>
      )}
    </div>
  );
}
