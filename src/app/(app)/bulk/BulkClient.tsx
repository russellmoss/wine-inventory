"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow } from "@/components/ui";
import type { BlendInfo } from "@/lib/bulk/blend";
import type { Fill } from "@/lib/vessels/fill";
import { addComponent, updateComponentVolume, removeComponent } from "@/lib/bulk/actions";

export type Option = { id: string; name: string };
export type Comp = {
  id: string;
  varietyId: string;
  varietyName: string;
  vineyardName: string;
  vintage: number;
  volumeL: number;
};
export type VesselWithContents = {
  id: string;
  code: string;
  type: "BARREL" | "TANK";
  capacityL: number;
  components: Comp[];
  blend: BlendInfo;
  fill: Fill;
};

const selectStyle: React.CSSProperties = {
  height: 38,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

export function BulkClient({
  vessels,
  varieties,
  vineyards,
}: {
  vessels: VesselWithContents[];
  varieties: Option[];
  vineyards: Option[];
}) {
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

  const canFill = varieties.length > 0 && vineyards.length > 0;

  return (
    <div>
      <Eyebrow rule>In-process wine · Winery</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Bulk wine</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "64ch" }}>
        What&rsquo;s in each barrel and tank. A vessel with one variety is unblended; two or more
        is a blend. Bottling draws wine out of these.
      </p>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}
      {!canFill ? (
        <Card style={{ marginBottom: 20 }}>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Add at least one variety and one vineyard in <strong>Varieties &amp; vineyards</strong> before filling vessels.
          </p>
        </Card>
      ) : null}
      {vessels.length === 0 ? (
        <Card>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            No active vessels. Register barrels/tanks in <strong>Vessels</strong> first.
          </p>
        </Card>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {vessels.map((v) => (
          <Card key={v.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <strong style={{ fontSize: 16 }}>{v.code}</strong>
                <Badge tone="blue" uppercase>{v.type}</Badge>
                {v.components.length === 0 ? (
                  <Badge tone="neutral" variant="soft">empty</Badge>
                ) : v.blend.isBlend ? (
                  <Badge tone="maroon" variant="soft">Blend · {v.blend.varieties.length} varieties</Badge>
                ) : (
                  <Badge tone="green" variant="soft">100% {v.blend.varieties[0]?.varietyName}</Badge>
                )}
              </div>
              <span style={{ fontSize: 13, color: v.fill.over ? "var(--danger)" : "var(--text-muted)" }}>
                {v.fill.filledL} / {v.capacityL} L ({v.fill.pct}%){v.fill.over ? " ⚠ over" : ""}
              </span>
            </div>

            {v.components.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: 12 }}>
                <tbody>
                  {v.components.map((c) => (
                    <tr key={c.id} style={{ borderTop: "1px solid var(--border-strong)" }}>
                      <td style={{ padding: "8px 6px" }}>{c.varietyName}</td>
                      <td style={{ padding: "8px 6px", color: "var(--text-muted)" }}>{c.vineyardName}</td>
                      <td style={{ padding: "8px 6px", color: "var(--text-muted)" }}>{c.vintage}</td>
                      <td style={{ padding: "8px 6px" }}>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const fd = new FormData(e.currentTarget);
                            run(() => updateComponentVolume(c.id, fd));
                          }}
                          style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
                        >
                          <input
                            name="volumeL"
                            type="number"
                            step="0.01"
                            min="0.01"
                            defaultValue={c.volumeL}
                            style={{ ...selectStyle, width: 90, height: 32 }}
                          />
                          <span style={{ color: "var(--text-muted)" }}>L</span>
                          <Button type="submit" variant="ghost" size="sm" disabled={pending}>save</Button>
                        </form>
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removeComponent(c.id))}>
                          remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {canFill ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const fd = new FormData(form);
                  fd.set("vesselId", v.id);
                  run(async () => {
                    await addComponent(fd);
                    form.reset();
                  });
                }}
                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border-strong)", paddingTop: 12 }}
              >
                <select name="varietyId" style={selectStyle} required defaultValue="">
                  <option value="" disabled>Variety</option>
                  {varieties.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <select name="vineyardId" style={selectStyle} required defaultValue="">
                  <option value="" disabled>Vineyard</option>
                  {vineyards.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <input name="vintage" type="number" placeholder="Vintage" style={{ ...selectStyle, width: 100 }} required />
                <input name="volumeL" type="number" step="0.01" min="0.01" placeholder="Litres" style={{ ...selectStyle, width: 100 }} required />
                <Button type="submit" variant="secondary" size="sm" disabled={pending}>Add to vessel</Button>
              </form>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
