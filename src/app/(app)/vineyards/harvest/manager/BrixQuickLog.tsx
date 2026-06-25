"use client";

import React from "react";
import { Input, Button } from "@/components/ui";
import { logBrix } from "@/lib/harvest/actions";

type Latest = { brixValue: number; recordedAt: string } | null;

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function BrixQuickLog({ blockId, latest }: { blockId: string; latest: Latest }) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  // Optimistic latest: show what was just logged before the server revalidates.
  const [optimistic, setOptimistic] = React.useState<Latest>(latest);
  const [pending, startTransition] = React.useTransition();

  // When fresh server data arrives (new prop after revalidation), adopt it —
  // reconciled during render rather than in an effect (the codebase pattern).
  const [prevLatest, setPrevLatest] = React.useState(latest);
  if (latest !== prevLatest) {
    setPrevLatest(latest);
    setOptimistic(latest);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const brix = Number(value);
    if (value.trim() === "" || !Number.isFinite(brix)) {
      setError("Enter a Brix value.");
      return;
    }
    setError(null);
    const prev = optimistic;
    setOptimistic({ brixValue: brix, recordedAt: new Date().toISOString() });
    startTransition(async () => {
      try {
        await logBrix(blockId, brix);
        setValue("");
      } catch (err) {
        setOptimistic(prev);
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <span style={sectionLabel}>Brix</span>
        {optimistic ? (
          <span style={{ fontSize: 13, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            Latest {optimistic.brixValue}&deg;Bx
            <span style={{ color: "var(--text-muted)" }}> · {formatWhen(optimistic.recordedAt)}</span>
          </span>
        ) : (
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>No readings yet</span>
        )}
      </div>
      <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <Input
          name="brix"
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          max={35}
          placeholder="e.g. 23.5"
          size="lg"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Brix reading"
          style={{ flex: 1 }}
        />
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          Log
        </Button>
      </form>
      {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: "6px 0 0" }}>{error}</p> : null}
    </div>
  );
}
