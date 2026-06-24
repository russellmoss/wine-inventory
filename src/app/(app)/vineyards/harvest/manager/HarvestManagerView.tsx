"use client";

import React from "react";
import { Card, Badge, Eyebrow } from "@/components/ui";
import type { Unit } from "@/lib/harvest/units";
import type { HarvestBlockDTO } from "@/lib/harvest/actions";
import { BrixQuickLog } from "./BrixQuickLog";
import { HarvestRecordForm } from "./HarvestRecordForm";

export type ManagerBlock = {
  id: string;
  label: string;
  varietyName: string | null;
};

type Props = {
  vineyardId: string;
  vineyardName: string;
  defaultUnit: Unit;
  blocks: ManagerBlock[];
  latestBrix: Record<string, { brixValue: number; recordedAt: string }>;
  records: HarvestBlockDTO[];
};

export function HarvestManagerView({
  vineyardName,
  defaultUnit,
  blocks,
  latestBrix,
  records,
}: Props) {
  const vintageYear = new Date().getFullYear();

  // Index records by blockId for the current vintage year (managers log the current season).
  const recordByBlock = React.useMemo(() => {
    const map = new Map<string, HarvestBlockDTO>();
    for (const r of records) {
      if (r.vintageYear === vintageYear) map.set(r.blockId, r);
    }
    return map;
  }, [records, vintageYear]);

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <Eyebrow rule>Harvest</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 4px" }}>
        {vineyardName}
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: 14.5, margin: "0 0 18px" }}>
        {vintageYear} season · log Brix, yield estimates, and picks per block.
      </p>

      {blocks.length === 0 ? (
        <Card>
          <p style={{ color: "var(--text-muted)", fontSize: 14.5, margin: 0 }}>
            This vineyard has no blocks yet. An admin can add blocks from the reference page.
          </p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {blocks.map((b) => (
            <Card key={b.id} padding="var(--space-4)">
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 300,
                    fontSize: 22,
                    margin: 0,
                  }}
                >
                  {b.label}
                </h2>
                {b.varietyName ? (
                  <Badge tone="neutral" variant="soft">
                    {b.varietyName}
                  </Badge>
                ) : null}
              </div>

              <BrixQuickLog blockId={b.id} latest={latestBrix[b.id] ?? null} />

              <HarvestRecordForm
                blockId={b.id}
                defaultUnit={defaultUnit}
                vintageYear={vintageYear}
                record={recordByBlock.get(b.id) ?? null}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
