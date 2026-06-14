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

function TypeCard({
  title,
  type,
  vessels,
  pending,
  onRun,
}: {
  title: string;
  type: "BARREL" | "TANK";
  vessels: VesselRow[];
  pending: boolean;
  onRun: (fn: () => Promise<void>, form?: HTMLFormElement) => void;
}) {
  return (
    <Card style={{ flex: "1 1 380px" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, marginBottom: 12 }}>{title}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget;
          onRun(() => createVessel(new FormData(f)), f);
        }}
        style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}
      >
        <input type="hidden" name="type" value={type} />
        <Input label="Code" name="code" placeholder={type === "BARREL" ? "BARREL-001" : "TANK-001"} required style={{ flex: "1 1 150px" }} />
        <Input label="Capacity (L)" name="capacityL" type="number" step="0.01" min="0.01" placeholder={type === "BARREL" ? "225" : "5000"} required style={{ flex: "0 1 130px" }} />
        <Button type="submit" variant="primary" disabled={pending}>Add</Button>
      </form>

      {vessels.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No {title.toLowerCase()} yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <tbody>
            {vessels.map((v) => (
              <tr key={v.id} style={{ borderTop: "1px solid var(--border-strong)", opacity: v.isActive ? 1 : 0.55 }}>
                <td style={{ padding: "10px 6px", whiteSpace: "nowrap" }}>
                  {v.code}
                  {!v.isActive ? <Badge tone="neutral" variant="soft" style={{ marginLeft: 6 }}>inactive</Badge> : null}
                </td>
                <td style={{ padding: "10px 6px", width: "55%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 8, background: "var(--paper-200)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, v.pct)}%`, height: "100%", background: v.over ? "var(--danger)" : "var(--accent)" }} />
                    </div>
                    <span style={{ fontSize: 12.5, color: v.over ? "var(--danger)" : "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {v.filledL}/{v.capacityL} L{v.over ? " ⚠" : ""}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "10px 6px", textAlign: "right" }}>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => onRun(() => setVesselActive(v.id, !v.isActive))}>
                    {v.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function VesselsClient({ vessels }: { vessels: VesselRow[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onRun(fn: () => Promise<void>, form?: HTMLFormElement) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        form?.reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  const barrels = vessels.filter((v) => v.type === "BARREL");
  const tanks = vessels.filter((v) => v.type === "TANK");

  return (
    <div>
      <Eyebrow rule>Cellar</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Vessels</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "60ch" }}>
        Barrels and tanks at the winery, managed separately. Register each once; fill tracks against capacity.
      </p>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
        <TypeCard title="Barrels" type="BARREL" vessels={barrels} pending={pending} onRun={onRun} />
        <TypeCard title="Tanks" type="TANK" vessels={tanks} pending={pending} onRun={onRun} />
      </div>
    </div>
  );
}
