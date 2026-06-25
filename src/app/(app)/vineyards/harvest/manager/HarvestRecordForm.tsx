"use client";

import React from "react";
import { Input, Button } from "@/components/ui";
import {
  recordYieldEstimate,
  addHarvestPick,
  deleteHarvestPick,
  type HarvestBlockDTO,
} from "@/lib/harvest/actions";
import {
  toKg,
  fromKg,
  formatWeightFromKg,
  weightUnitLabel,
  type Unit,
} from "@/lib/harvest/units";

type Props = {
  blockId: string;
  defaultUnit: Unit;
  vintageYear: number;
  record: HarvestBlockDTO | null;
};

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function useRunner() {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const run = React.useCallback((fn: () => Promise<void>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        after?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }, []);
  return { error, pending, run };
}

export function HarvestRecordForm({ blockId, defaultUnit, vintageYear, record }: Props) {
  const unitLabel = weightUnitLabel(defaultUnit);
  const picks = record?.picks ?? [];
  const actualKg = picks.reduce((acc, p) => acc + p.weightKg, 0);
  const estimateKg = record?.yieldEstimateKg ?? null;

  // Prefill the estimate input with the existing value, in the active unit.
  const estimateInUnit = React.useMemo(() => {
    if (estimateKg == null) return "";
    const v = fromKg(estimateKg, defaultUnit);
    return v == null ? "" : String(Math.round(v * 100) / 100);
  }, [estimateKg, defaultUnit]);

  const [estimate, setEstimate] = React.useState(estimateInUnit);
  // Adopt a freshly-loaded estimate (new server value / unit switch) during
  // render rather than in an effect (the codebase pattern).
  const [prevEstimateInUnit, setPrevEstimateInUnit] = React.useState(estimateInUnit);
  if (estimateInUnit !== prevEstimateInUnit) {
    setPrevEstimateInUnit(estimateInUnit);
    setEstimate(estimateInUnit);
  }

  const [weight, setWeight] = React.useState("");
  const [pickBrix, setPickBrix] = React.useState("");
  const [pickDate, setPickDate] = React.useState(todayISO);

  // Re-convert an in-progress (unsaved) pick weight when the unit toggles, so a
  // number typed in lb isn't silently reinterpreted as kg. Done during render
  // (the codebase pattern) by tracking the previous unit.
  const [prevUnit, setPrevUnit] = React.useState(defaultUnit);
  if (defaultUnit !== prevUnit) {
    setPrevUnit(defaultUnit);
    const n = Number(weight);
    if (weight.trim() !== "" && Number.isFinite(n)) {
      const converted = fromKg(toKg(n, prevUnit), defaultUnit);
      setWeight(converted == null ? "" : String(Math.round(converted * 100) / 100));
    }
  }

  const estimateRunner = useRunner();
  const pickRunner = useRunner();

  function submitEstimate(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(estimate);
    if (estimate.trim() === "" || !Number.isFinite(n)) {
      return;
    }
    estimateRunner.run(() => recordYieldEstimate(blockId, n, defaultUnit, vintageYear));
  }

  function submitPick(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(weight);
    if (weight.trim() === "" || !Number.isFinite(n)) {
      return;
    }
    const b = pickBrix.trim() === "" ? null : Number(pickBrix);
    if (b != null && !Number.isFinite(b)) {
      return;
    }
    pickRunner.run(
      () => addHarvestPick(blockId, n, defaultUnit, pickDate, vintageYear, b),
      () => {
        setWeight("");
        setPickBrix("");
        setPickDate(todayISO());
      },
    );
  }

  return (
    <div style={{ borderTop: "1px solid var(--border-strong)", paddingTop: 14 }}>
      {/* Yield estimate */}
      <form onSubmit={submitEstimate} style={{ marginBottom: 16 }}>
        <span style={{ ...sectionLabel, display: "block", marginBottom: 6 }}>Yield estimate</span>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <Input
            name="estimate"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            placeholder={`Estimate (${unitLabel})`}
            size="lg"
            value={estimate}
            onChange={(ev) => setEstimate(ev.target.value)}
            aria-label={`Yield estimate in ${unitLabel}`}
            iconRight={<span style={{ fontSize: 13 }}>{unitLabel}</span>}
            style={{ flex: 1 }}
          />
          <Button type="submit" variant="secondary" size="lg" disabled={estimateRunner.pending}>
            Save
          </Button>
        </div>
        {estimateRunner.error ? (
          <p style={{ color: "var(--danger)", fontSize: 13, margin: "6px 0 0" }}>{estimateRunner.error}</p>
        ) : null}
      </form>

      {/* Picks total summary */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 12px",
          borderRadius: "var(--radius-md)",
          background: "var(--surface-sunken)",
          marginBottom: 12,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span style={{ fontSize: 14 }}>
          <span style={{ color: "var(--text-muted)" }}>Picked </span>
          <strong>{formatWeightFromKg(actualKg, defaultUnit)}</strong>
        </span>
        <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
          Est. {estimateKg == null ? "—" : formatWeightFromKg(estimateKg, defaultUnit)}
        </span>
      </div>

      {/* Add a pick */}
      <form onSubmit={submitPick}>
        <span style={{ ...sectionLabel, display: "block", marginBottom: 6 }}>Add a pick</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <Input
              name="weight"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              placeholder={`Weight (${unitLabel})`}
              size="lg"
              value={weight}
              onChange={(ev) => setWeight(ev.target.value)}
              aria-label={`Pick weight in ${unitLabel}`}
              iconRight={<span style={{ fontSize: 13 }}>{unitLabel}</span>}
              style={{ flex: 2 }}
            />
            <Input
              name="pickBrix"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={35}
              placeholder="Brix"
              size="lg"
              value={pickBrix}
              onChange={(ev) => setPickBrix(ev.target.value)}
              aria-label="Brix at pick (optional)"
              iconRight={<span style={{ fontSize: 13 }}>°Bx</span>}
              style={{ flex: 1 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
            <Input
              name="pickDate"
              type="date"
              size="lg"
              value={pickDate}
              onChange={(ev) => setPickDate(ev.target.value)}
              aria-label="Pick date"
              style={{ flex: 1 }}
            />
            <Button type="submit" variant="primary" size="lg" disabled={pickRunner.pending}>
              Add pick
            </Button>
          </div>
        </div>
        {pickRunner.error ? (
          <p style={{ color: "var(--danger)", fontSize: 13, margin: "6px 0 0" }}>{pickRunner.error}</p>
        ) : null}
      </form>

      {/* Picks list */}
      {picks.length > 0 ? (
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
          {picks.map((p) => (
            <li
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 0",
                borderTop: "1px solid var(--border-subtle)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span style={{ fontSize: 14 }}>
                <strong>{formatWeightFromKg(p.weightKg, defaultUnit)}</strong>
                <span style={{ color: "var(--text-muted)" }}> · {p.pickDate}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={pickRunner.pending}
                onClick={() => pickRunner.run(() => deleteHarvestPick(p.id))}
                aria-label="Delete pick"
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
