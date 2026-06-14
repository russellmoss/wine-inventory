"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow } from "@/components/ui";
import { createVessel, setVesselActive } from "@/lib/vessels/actions";

export type VesselRow = {
  id: string;
  code: string;
  type: "BARREL" | "TANK";
  capacityL: number;
  isActive: boolean;
  componentCount: number;
  filledL: number;
  pct: number;
  over: boolean;
};

const selectStyle: React.CSSProperties = {
  height: 44,
  padding: "0 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 15,
  color: "var(--text-primary)",
};

export function VesselsClient({ vessels }: { vessels: VesselRow[] }) {
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
      <Eyebrow rule>Cellar</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Vessels</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "60ch" }}>
        Barrels and tanks at the winery. Register each once; fill is tracked against capacity.
      </p>

      <Card style={{ marginBottom: 24, maxWidth: 640 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            run(async () => {
              await createVessel(fd);
              form.reset();
            });
          }}
          style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}
        >
          <Input label="Code" name="code" placeholder="e.g. BARREL-001" required style={{ flex: "1 1 160px" }} />
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Type</span>
            <select name="type" defaultValue="BARREL" style={selectStyle}>
              <option value="BARREL">Barrel</option>
              <option value="TANK">Tank</option>
            </select>
          </label>
          <Input label="Capacity (L)" name="capacityL" type="number" step="0.01" min="0.01" placeholder="225" required style={{ flex: "0 1 140px" }} />
          <Button type="submit" variant="primary" disabled={pending}>
            Add vessel
          </Button>
        </form>
      </Card>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}

      <Card padding="0">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Code</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Type</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Fill</th>
              <th style={{ padding: "12px 16px", fontWeight: 500, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vessels.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "20px 16px", color: "var(--text-muted)" }}>
                  No vessels yet. Register one above.
                </td>
              </tr>
            ) : (
              vessels.map((v) => (
                <tr key={v.id} style={{ borderTop: "1px solid var(--border-strong)", opacity: v.isActive ? 1 : 0.55 }}>
                  <td style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                    {v.code}
                    {!v.isActive ? <Badge tone="neutral" variant="soft">inactive</Badge> : null}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <Badge tone="blue" uppercase>{v.type}</Badge>
                  </td>
                  <td style={{ padding: "12px 16px", minWidth: 220 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, height: 8, background: "var(--paper-200)", borderRadius: 999, overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${Math.min(100, v.pct)}%`,
                            height: "100%",
                            background: v.over ? "var(--danger)" : "var(--accent)",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 13, color: v.over ? "var(--danger)" : "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {v.filledL} / {v.capacityL} L{v.over ? " ⚠" : ""}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setVesselActive(v.id, !v.isActive))}>
                      {v.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
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
