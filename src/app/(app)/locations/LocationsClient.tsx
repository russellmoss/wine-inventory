"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow } from "@/components/ui";
import { createLocation, renameLocation, setLocationActive } from "@/lib/locations/actions";

type Loc = { id: string; name: string; isSystem: boolean; isActive: boolean };

export function LocationsClient({ locations }: { locations: Loc[] }) {
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
    <div>
      <Eyebrow rule>Inventory locations</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>
        Locations
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "60ch" }}>
        Where bottled wine and finished goods are stored. &ldquo;Winery&rdquo; is reserved for
        bulk wine and cannot be changed.
      </p>

      <Card style={{ marginBottom: 24, maxWidth: 520 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            run(async () => {
              await createLocation(fd);
              form.reset();
            });
          }}
          style={{ display: "flex", gap: 12, alignItems: "flex-end" }}
        >
          <Input label="New location" name="name" placeholder="e.g. Thimphu Warehouse" style={{ flex: 1 }} required />
          <Button type="submit" variant="primary" disabled={pending}>
            Add
          </Button>
        </form>
      </Card>

      {error ? (
        <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p>
      ) : null}

      <Card padding="0">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Name</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Status</th>
              <th style={{ padding: "12px 16px", fontWeight: 500, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: "20px 16px", color: "var(--text-muted)" }}>
                  No locations yet. Add one above.
                </td>
              </tr>
            ) : (
              locations.map((loc) => (
                <tr key={loc.id} style={{ borderTop: "1px solid var(--border-strong)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    {loc.isSystem ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {loc.name} <Badge tone="gold" uppercase>Reserved</Badge>
                      </span>
                    ) : (
                      <InlineRename loc={loc} disabled={pending} onRename={(fd) => run(() => renameLocation(loc.id, fd))} />
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Badge tone={loc.isActive ? "green" : "neutral"} variant="soft">
                      {loc.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    {loc.isSystem ? (
                      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>—</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => setLocationActive(loc.id, !loc.isActive))}
                      >
                        {loc.isActive ? "Deactivate" : "Reactivate"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function InlineRename({
  loc,
  disabled,
  onRename,
}: {
  loc: Loc;
  disabled: boolean;
  onRename: (fd: FormData) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  if (!editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        {loc.name}
        <button
          onClick={() => setEditing(true)}
          style={{ background: "none", border: "none", color: "var(--text-accent)", cursor: "pointer", fontSize: 13 }}
        >
          rename
        </button>
      </span>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onRename(new FormData(e.currentTarget));
        setEditing(false);
      }}
      style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
    >
      <Input name="name" defaultValue={loc.name} size="sm" required />
      <Button type="submit" variant="secondary" size="sm" disabled={disabled}>
        Save
      </Button>
      <button type="button" onClick={() => setEditing(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>
        cancel
      </button>
    </form>
  );
}
