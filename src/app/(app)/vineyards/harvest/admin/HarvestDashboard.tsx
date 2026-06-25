"use client";

import React from "react";
import { Card, Eyebrow, Button, BrixChart, type BrixChartSeries, type BrixChartMarker } from "@/components/ui";
import { getVineyardHarvestDashboard, type VineyardHarvestDashboard } from "@/lib/harvest/actions";
import { formatWeightFromKg, fromKg, type Unit } from "@/lib/harvest/units";
import type { VintageGroup } from "@/lib/harvest/aggregate";
import { effectiveColor, withAlpha } from "@/lib/vineyard/colors";

type Props = { vineyards: { id: string; name: string }[] };

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

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

// ── Weight-unit toggle (kg default; storage stays canonical kg) ──
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
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: color, flex: "0 0 auto" }} />
      {name}
    </span>
  );
}

// ── Per-block stat (label over value) ──
function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={sectionLabel}>{label}</span>
      <span
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 300,
          fontSize: 20,
          fontVariantNumeric: "tabular-nums",
          color: tone ?? "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Historic yields table (per vintage), now unit-aware ──
const th: React.CSSProperties = { padding: "10px 14px", fontWeight: 500, textAlign: "right" };
const thLeft: React.CSSProperties = { ...th, textAlign: "left" };
const td: React.CSSProperties = { padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" };
const tdLeft: React.CSSProperties = { ...td, textAlign: "left" };

function fmtVariance(v: number | null): string {
  if (v == null) return "N/A";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function varianceColor(v: number | null): string {
  if (v == null) return "var(--text-muted)";
  return v >= 0 ? "var(--positive)" : "var(--danger)";
}

function YieldCells({
  estimateKg,
  actualKg,
  variancePct,
  unit,
}: {
  estimateKg: number | null;
  actualKg: number;
  variancePct: number | null;
  unit: Unit;
}) {
  return (
    <>
      <td style={td}>{estimateKg == null ? "—" : formatWeightFromKg(estimateKg, unit)}</td>
      <td style={td}>{formatWeightFromKg(actualKg, unit)}</td>
      <td style={{ ...td, color: varianceColor(variancePct) }}>{fmtVariance(variancePct)}</td>
    </>
  );
}

function VintageTable({ group, unit }: { group: VintageGroup; unit: Unit }) {
  return (
    <Card padding="0" style={{ marginBottom: "var(--space-4)", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-strong)",
        }}
      >
        <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, margin: 0 }}>
          {group.vintageYear}
        </h3>
        <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
          Season total <strong>{formatWeightFromKg(group.actualKg, unit)}</strong>
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-strong)" }}>
            <th style={thLeft}>Block / variety</th>
            <th style={th}>Estimate</th>
            <th style={th}>Actual</th>
            <th style={th}>Variance</th>
          </tr>
        </thead>
        <tbody>
          {group.blocks.map((b) => (
            <tr key={b.blockId} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td style={tdLeft}>
                {b.label}
                {b.varietyName ? <span style={{ color: "var(--text-muted)" }}> · {b.varietyName}</span> : null}
              </td>
              <YieldCells estimateKg={b.estimateKg} actualKg={b.actualKg} variancePct={b.variancePct} unit={unit} />
            </tr>
          ))}
          <tr style={{ borderTop: "1.5px solid var(--border-strong)" }}>
            <td style={{ ...tdLeft, fontWeight: 600 }}>Season total</td>
            <YieldCells estimateKg={group.estimateKg} actualKg={group.actualKg} variancePct={group.variancePct} unit={unit} />
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

// ── Per-block in-season panel ──
function BlockPanel({
  block,
  unit,
}: {
  block: VineyardHarvestDashboard["blocks"][number];
  unit: Unit;
}) {
  const color = effectiveColor({ varietyColor: block.varietyColor, varietyId: block.varietyId });
  const pickedKg = block.picks.reduce((acc, p) => acc + p.weightKg, 0);
  const remainingKg =
    block.yieldEstimateKg != null ? Math.max(0, block.yieldEstimateKg - pickedKg) : null;

  return (
    <Card padding="var(--space-4)">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, margin: 0 }}>
          {block.label}
        </h3>
        {block.varietyName ? <VarietyChip name={block.varietyName} color={color} /> : null}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 28px", marginBottom: 14 }}>
        <Stat
          label="Current Brix"
          value={block.latestBrix ? `${block.latestBrix.brixValue} °Bx` : "—"}
        />
        <Stat
          label="Estimate"
          value={block.yieldEstimateKg == null ? "—" : formatWeightFromKg(block.yieldEstimateKg, unit)}
        />
        <Stat label="Picked" value={formatWeightFromKg(pickedKg, unit)} />
        {remainingKg != null ? (
          <Stat
            label="Remaining"
            value={formatWeightFromKg(remainingKg, unit)}
            tone={remainingKg === 0 ? "var(--positive)" : undefined}
          />
        ) : null}
      </div>

      {block.picks.length > 0 ? (
        <div>
          <span style={{ ...sectionLabel, display: "block", marginBottom: 6 }}>Picks</span>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {block.picks.map((p) => (
              <li
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "8px 0",
                  borderTop: "1px solid var(--border-subtle)",
                  fontSize: 14,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span>
                  <strong>{formatWeightFromKg(p.weightKg, unit)}</strong>
                  <span style={{ color: "var(--text-muted)" }}> · {p.pickDate}</span>
                </span>
                <span style={{ color: "var(--text-secondary)" }}>
                  {p.brixAtPick != null ? `@ ${p.brixAtPick} °Bx` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={{ color: "var(--text-muted)", fontSize: 13.5, margin: 0 }}>No picks yet.</p>
      )}
    </Card>
  );
}

export function HarvestDashboard({ vineyards }: Props) {
  const [selectedId, setSelectedId] = React.useState<string>(vineyards[0]?.id ?? "");
  const [unit, setUnit] = React.useState<Unit>("metric");
  // Result/error tagged with the vineyard id they belong to (codebase pattern:
  // everything derived at render, no setState in the effect body, stale ignored).
  const [result, setResult] = React.useState<{ id: string; data: VineyardHarvestDashboard } | null>(null);
  const [errorState, setErrorState] = React.useState<{ id: string; msg: string } | null>(null);

  React.useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    getVineyardHarvestDashboard(selectedId)
      .then((data) => {
        if (!cancelled) setResult({ id: selectedId, data });
      })
      .catch((e) => {
        if (!cancelled) {
          setErrorState({ id: selectedId, msg: e instanceof Error ? e.message : "Something went wrong." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const data = result?.id === selectedId ? result.data : null;
  const error = errorState?.id === selectedId ? errorState.msg : null;
  const pending = !!selectedId && data == null && error == null;

  const series: BrixChartSeries[] = React.useMemo(() => {
    if (!data) return [];
    return data.blocks
      .filter((b) => b.series.length > 0)
      .map((b) => ({
        blockId: b.blockId,
        label: b.label,
        color: effectiveColor({ varietyColor: b.varietyColor, varietyId: b.varietyId }),
        points: b.series.map((s) => ({ date: Date.parse(s.recordedAt), brix: s.brixValue })),
      }));
  }, [data]);

  const markers: BrixChartMarker[] = React.useMemo(() => {
    if (!data) return [];
    return data.blocks.flatMap((b) =>
      b.picks
        .filter((p) => p.brixAtPick != null)
        .map((p) => ({ blockId: b.blockId, date: Date.parse(p.pickDate), brix: p.brixAtPick })),
    );
  }, [data]);

  return (
    <div>
      <Eyebrow rule>Admin · Harvest</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>
        Harvest dashboard
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "64ch" }}>
        Live ripening and harvest status by block for the selected vineyard — Brix readings over
        time, yield estimates, and picks (with the Brix each came off at).
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 240 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Vineyard</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={selectStyle}
            disabled={vineyards.length === 0}
          >
            {vineyards.length === 0 ? <option value="">No active vineyards</option> : null}
            {vineyards.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Weight units</span>
          <UnitToggle unit={unit} onChange={setUnit} />
        </div>
      </div>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}

      {pending ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14.5 }}>Loading…</p>
      ) : data ? (
        <div
          style={{
            opacity: pending ? 0.6 : 1,
            transition: "opacity var(--duration-fast) var(--ease-standard)",
          }}
        >
          {data.blocks.length === 0 ? (
            <Card>
              <p style={{ color: "var(--text-muted)", fontSize: 14.5, margin: 0 }}>
                This vineyard has no blocks yet. An admin can add blocks from the reference page.
              </p>
            </Card>
          ) : (
            <>
              {/* Brix-over-time chart */}
              <Card padding="var(--space-5)" style={{ marginBottom: "var(--space-5)" }}>
                <span style={{ ...sectionLabel, display: "block", marginBottom: 12 }}>
                  {data.vintageYear} · Brix over time
                </span>
                <BrixChart series={series} markers={markers} />
              </Card>

              {/* Per-block in-season panels */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: "var(--space-4)",
                  marginBottom: "var(--space-6)",
                }}
              >
                {data.blocks.map((b) => (
                  <BlockPanel key={b.blockId} block={b} unit={unit} />
                ))}
              </div>

              {/* Historic yields (secondary) */}
              {data.groups.length > 0 ? (
                <section>
                  <h2
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontWeight: 300,
                      fontSize: 24,
                      margin: "0 0 14px",
                    }}
                  >
                    Past vintages
                  </h2>
                  {data.groups.map((g) => (
                    <VintageTable key={g.vintageYear} group={g} unit={unit} />
                  ))}
                </section>
              ) : null}
            </>
          )}
        </div>
      ) : selectedId ? null : null}
    </div>
  );
}
