"use client";

import React from "react";
import { Card, Button, Input, Eyebrow, Badge } from "@/components/ui";
import { createGrower, updateGrower } from "./actions";

// Plan 093 follow-on: manage Growers (the party that farmed the fruit). Add / rename / details / estate
// flag / deactivate. Soft deactivate (vineyards + weigh-tag lines reference growers via FK RESTRICT).

type Grower = { id: string; name: string; company: string | null; contact: string | null; isEstate: boolean; isActive: boolean };

export function GrowersAdmin({ growers }: { growers: Grower[] }) {
  const [name, setName] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [isEstate, setIsEstate] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function add() {
    setError(null);
    if (!name.trim()) { setError("Enter a grower name."); return; }
    setBusy(true);
    try {
      const res = await createGrower({ name: name.trim(), company: company.trim() || null, contact: contact.trim() || null, isEstate });
      if (!res.ok) { setError(res.error); return; }
      setName(""); setCompany(""); setContact(""); setIsEstate(false);
    } catch { setError("Couldn't add the grower — try again."); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 760 }}>
      <div>
        <Eyebrow>Setup</Eyebrow>
        <h1 style={{ margin: "4px 0 0", fontFamily: "var(--font-heading)", fontWeight: 300 }}>Growers</h1>
        <p style={{ color: "var(--text-secondary)", margin: "6px 0 0", maxWidth: 600 }}>
          The farms that grow your fruit — estate blocks and third-party growers. Assign a grower to a
          vineyard or block, or to a bin on a weigh-tag. Growers can&apos;t be deleted once referenced;
          deactivate one to retire it.
        </p>
      </div>

      <Card>
        <Eyebrow>Add a grower</Eyebrow>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 12 }}>
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Smith Ranch" />
          <Input label="Company (optional)" value={company} onChange={(e) => setCompany(e.target.value)} />
          <Input label="Contact (optional)" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="phone / email" />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: "var(--text-body-sm)" }}>
          <input type="checkbox" checked={isEstate} onChange={(e) => setIsEstate(e.target.checked)} />
          Estate — the winery&apos;s own vineyard
        </label>
        <div style={{ marginTop: 12 }}>
          <Button onClick={add} disabled={busy}>{busy ? "Adding…" : "Add grower"}</Button>
        </div>
        {error ? <p style={{ color: "var(--danger)", marginTop: 10, fontSize: "var(--text-body-sm)" }}>{error}</p> : null}
      </Card>

      <Card>
        <Eyebrow>Growers</Eyebrow>
        {growers.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", margin: "12px 0 0" }}>No growers yet. Add your first one above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 12 }}>
            {growers.map((g) => <GrowerRow key={g.id} grower={g} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

function GrowerRow({ grower }: { grower: Grower }) {
  const [active, setActive] = React.useState(grower.isActive);
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(grower.name);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function save(patch: { name?: string; isActive?: boolean }) {
    setErr(null);
    setBusy(true);
    try {
      const res = await updateGrower({ id: grower.id, ...patch });
      if (!res.ok) { setErr(res.error); return; }
      if (patch.isActive != null) setActive(patch.isActive);
      if (patch.name != null) setEditing(false);
    } catch { setErr("Couldn't save — try again."); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border-subtle)", opacity: active ? 1 : 0.6 }}>
      {editing ? (
        <>
          <Input value={name} onChange={(e) => setName(e.target.value)} size="sm" style={{ flex: 1 }} error={err ?? undefined} />
          <Button variant="secondary" size="sm" onClick={() => save({ name: name.trim() })} disabled={busy}>Save</Button>
          <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setName(grower.name); setErr(null); }}>Cancel</Button>
        </>
      ) : (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 500 }}>{grower.name}</span>{" "}
            {grower.isEstate ? <Badge tone="gold">Estate</Badge> : null}
            {grower.company ? <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-body-sm)" }}> · {grower.company}</span> : null}
          </div>
          {active ? null : <Badge>Inactive</Badge>}
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Rename</Button>
          <Button variant="ghost" size="sm" onClick={() => save({ isActive: !active })} disabled={busy}>{active ? "Deactivate" : "Reactivate"}</Button>
        </>
      )}
    </div>
  );
}
