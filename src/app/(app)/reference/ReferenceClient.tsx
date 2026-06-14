"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow } from "@/components/ui";
import { createRef, setRefActive, type RefKind } from "@/lib/reference/actions";

type Row = { id: string; name: string; isActive: boolean };

function RefList({ kind, title, rows }: { kind: RefKind; title: string; rows: Row[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <Card padding="var(--space-5)" style={{ flex: 1, minWidth: 280 }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, marginBottom: 14 }}>
        {title}
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          run(async () => {
            await createRef(kind, fd);
            form.reset();
          });
        }}
        style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14 }}
      >
        <Input name="name" placeholder={kind === "variety" ? "e.g. Merlot" : "e.g. Paro Vineyard"} size="sm" style={{ flex: 1 }} required />
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          Add
        </Button>
      </form>
      {error ? <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{error}</p> : null}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>None yet.</p>
        ) : (
          rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 0",
                borderTop: "1px solid var(--border-strong)",
                opacity: r.isActive ? 1 : 0.55,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {r.name}
                {!r.isActive ? (
                  <Badge tone="neutral" variant="soft">
                    inactive
                  </Badge>
                ) : null}
              </span>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setRefActive(kind, r.id, !r.isActive))}>
                {r.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

export function ReferenceClient({ varieties, vineyards }: { varieties: Row[]; vineyards: Row[] }) {
  return (
    <div>
      <Eyebrow rule>Reference data</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>
        Varieties &amp; vineyards
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "60ch" }}>
        Managed lists used when filling vessels and bottling. Items in use can&rsquo;t be deleted,
        only deactivated, so history stays intact.
      </p>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <RefList kind="variety" title="Varieties" rows={varieties} />
        <RefList kind="vineyard" title="Vineyards" rows={vineyards} />
      </div>
    </div>
  );
}
