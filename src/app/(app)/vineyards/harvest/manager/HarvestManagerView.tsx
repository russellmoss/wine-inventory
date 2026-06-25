"use client";

import React from "react";
import { Card, Eyebrow, Button } from "@/components/ui";
import type { Unit } from "@/lib/harvest/units";
import type { HarvestBlockDTO } from "@/lib/harvest/actions";
import { effectiveColor, withAlpha } from "@/lib/vineyard/colors";
import { BrixQuickLog } from "./BrixQuickLog";
import { HarvestRecordForm } from "./HarvestRecordForm";

export type ManagerBlock = {
  id: string;
  label: string;
  varietyName: string | null;
  varietyId: string | null;
  varietyColor: string | null;
};

/**
 * Variety pill tinted with the variety's canonical color (the same color used on
 * the vineyard map / legend), so blocks are distinguishable at a glance.
 */
function VarietyChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: "var(--font-body)",
        fontSize: 12.5,
        fontWeight: "var(--weight-medium)" as unknown as number,
        lineHeight: 1,
        padding: "5px 11px",
        borderRadius: "var(--radius-pill)",
        background: withAlpha(color, 0.14),
        color,
        border: `1px solid ${withAlpha(color, 0.35)}`,
      }}
    >
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: "50%", background: color, flex: "0 0 auto" }}
      />
      {name}
    </span>
  );
}

/** Weight-unit switch for yield estimates + pick weights. Storage stays kg. */
function UnitToggle({ unit, onChange }: { unit: Unit; onChange: (u: Unit) => void }) {
  return (
    <div style={{ display: "inline-flex", gap: 6 }}>
      {(["metric", "imperial"] as Unit[]).map((u) => (
        <Button
          key={u}
          variant={unit === u ? "primary" : "secondary"}
          size="sm"
          onClick={() => onChange(u)}
          aria-pressed={unit === u}
        >
          {u === "metric" ? "Kilograms (kg)" : "Pounds (lb)"}
        </Button>
      ))}
    </div>
  );
}

type Props = {
  vineyardId: string;
  vineyardName: string;
  blocks: ManagerBlock[];
  latestBrix: Record<string, { brixValue: number; recordedAt: string }>;
  records: HarvestBlockDTO[];
};

export function HarvestManagerView({
  vineyardName,
  blocks,
  latestBrix,
  records,
}: Props) {
  const vintageYear = new Date().getFullYear();

  // Harvest always opens in metric (kg) — weights are stored canonically in kg
  // and this is independent of the vineyard's map unit (feet/acres). Toggle live.
  const [unit, setUnit] = React.useState<Unit>("metric");

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
      <p style={{ color: "var(--text-secondary)", fontSize: 14.5, margin: "0 0 14px" }}>
        {vintageYear} season · log Brix, yield estimates, and picks per block.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}
        >
          Weight units
        </span>
        <UnitToggle unit={unit} onChange={setUnit} />
      </div>

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
                  <VarietyChip
                    name={b.varietyName}
                    color={effectiveColor({ varietyColor: b.varietyColor, varietyId: b.varietyId })}
                  />
                ) : null}
              </div>

              <BrixQuickLog blockId={b.id} latest={latestBrix[b.id] ?? null} />

              <HarvestRecordForm
                blockId={b.id}
                defaultUnit={unit}
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
