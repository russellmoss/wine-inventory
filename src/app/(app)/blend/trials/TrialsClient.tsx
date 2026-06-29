"use client";

import React from "react";
import Link from "next/link";
import { Card, Eyebrow, Button, Badge } from "@/components/ui";
import { createTrialAction, chooseTrialAction, discardTrialAction, scoreTrialAction } from "@/lib/blend/actions";
import type { TrialRow } from "@/lib/blend/data";

export type TrialLotOption = { lotId: string; code: string; label: string };

const field: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

type Row = { lotId: string; pct: string };

function statusTone(s: string): "gold" | "green" | "neutral" | "red" {
  return s === "CHOSEN" ? "gold" : s === "PROMOTED" ? "green" : s === "DISCARDED" ? "red" : "neutral";
}

export function TrialsClient({ trials, lots }: { trials: TrialRow[]; lots: TrialLotOption[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // New-trial form state.
  const [name, setName] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [rows, setRows] = React.useState<Row[]>([
    { lotId: "", pct: "" },
    { lotId: "", pct: "" },
  ]);

  function run(fn: () => Promise<unknown>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        after?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  const filled = rows.filter((r) => r.lotId && Number(r.pct) > 0);
  const canCreate = name.trim().length > 0 && filled.length >= 2 && !pending;

  function createTrial() {
    run(
      () =>
        createTrialAction({
          name: name.trim(),
          targetWine: target.trim() || null,
          components: filled.map((r) => ({ lotId: r.lotId, proportion: Number(r.pct) / 100 })),
        }),
      () => {
        setName("");
        setTarget("");
        setRows([
          { lotId: "", pct: "" },
          { lotId: "", pct: "" },
        ]);
      },
    );
  }

  const active = trials.filter((t) => t.status === "DRAFT" || t.status === "CHOSEN");
  const archived = trials.filter((t) => t.status === "PROMOTED" || t.status === "DISCARDED");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <Eyebrow rule>Bench trials</Eyebrow>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 6px" }}>Blend trials</h1>
        </div>
        <Link href="/blend" style={{ color: "var(--text-accent)", fontSize: 14 }}>
          → Blend builder
        </Link>
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "64ch" }}>
        Compare blend ratios on the bench. Trials never touch the cellar — choose a winner, then promote it into a real
        blend (you tweak the litres at the tank).
      </p>
      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 14 }}>{error}</p> : null}

      {/* New trial */}
      <Card style={{ marginBottom: 24, maxWidth: 680 }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, marginBottom: 12 }}>New trial</h2>
        {lots.length < 2 ? (
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>Need at least two lots in the cellar to compose a trial.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Trial name (e.g. Estate Cab 2024)" style={{ ...field, flex: "1 1 220px" }} aria-label="Trial name" />
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target wine (optional)" style={{ ...field, flex: "1 1 180px" }} aria-label="Target wine" />
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={r.lotId} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, lotId: e.target.value } : x)))} style={{ ...field, flex: "1 1 240px" }} aria-label={`Component ${i + 1} lot`}>
                  <option value="">Pick a lot…</option>
                  {lots.map((l) => (
                    <option key={l.lotId} value={l.lotId}>
                      {l.code} — {l.label}
                    </option>
                  ))}
                </select>
                <input value={r.pct} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} inputMode="decimal" placeholder="%" style={{ ...field, width: 70 }} aria-label={`Component ${i + 1} percent`} />
                {rows.length > 2 ? (
                  <button type="button" onClick={() => setRows((p) => p.filter((_, j) => j !== i))} style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }} aria-label="Remove component">
                    ×
                  </button>
                ) : null}
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Button variant="secondary" size="sm" onClick={() => setRows((p) => [...p, { lotId: "", pct: "" }])}>
                + component
              </Button>
              <Button variant="primary" size="sm" disabled={!canCreate} onClick={createTrial}>
                {pending ? "Saving…" : "Create trial"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Active trials */}
      {active.length === 0 ? (
        <Card style={{ marginBottom: 16 }}>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>No trials yet — start one above to compare blend ratios.</p>
        </Card>
      ) : (
        active.map((t) => <TrialCard key={t.id} trial={t} pending={pending} run={run} />)
      )}

      {archived.length > 0 ? (
        <>
          <Eyebrow rule>Archived</Eyebrow>
          {archived.map((t) => (
            <TrialCard key={t.id} trial={t} pending={pending} run={run} />
          ))}
        </>
      ) : null}
    </div>
  );
}

function TrialCard({ trial, pending, run }: { trial: TrialRow; pending: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const [score, setScore] = React.useState(trial.score == null ? "" : String(trial.score));
  const editable = trial.status === "DRAFT" || trial.status === "CHOSEN";
  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <strong style={{ fontSize: 16 }}>{trial.name}</strong>{" "}
          <Badge tone={statusTone(trial.status)} variant="soft">
            {trial.status.toLowerCase()}
          </Badge>
          {trial.targetWine ? <span style={{ fontSize: 13, color: "var(--text-secondary)", marginLeft: 8 }}>→ {trial.targetWine}</span> : null}
        </div>
        {trial.promotedToLotId ? (
          <Link href={`/lots/${trial.promotedToLotId}`} style={{ color: "var(--text-accent)", fontSize: 13.5 }}>
            view blend →
          </Link>
        ) : null}
      </div>
      <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 8 }}>
        {trial.components
          .map((c) => `${c.code} ${c.proportion != null ? `${Math.round(c.proportion * 100)}%` : c.volume != null ? `${c.volume}${c.unit ?? ""}` : ""}`.trim())
          .join(" · ")}
      </div>
      {editable ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <input
            value={score}
            onChange={(e) => setScore(e.target.value)}
            inputMode="numeric"
            placeholder="Score /100"
            style={{ ...field, width: 110 }}
            aria-label={`Score for ${trial.name}`}
          />
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => scoreTrialAction({ id: trial.id, score: score.trim() === "" ? null : Number(score), scoreScale: score.trim() === "" ? null : "HUNDRED_POINT" }))}>
            Save score
          </Button>
          {trial.status === "DRAFT" ? (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => chooseTrialAction(trial.id))}>
              Choose
            </Button>
          ) : null}
          <Link href={`/blend?trial=${trial.id}`}>
            <Button variant="primary" size="sm" disabled={pending}>
              Promote →
            </Button>
          </Link>
          <ConfirmDiscard pending={pending} onConfirm={() => run(() => discardTrialAction(trial.id))} />
        </div>
      ) : null}
    </Card>
  );
}

function ConfirmDiscard({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = React.useState(false);
  if (!armed) {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setArmed(true)}>
        Discard
      </Button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Discard this trial?</span>
      <Button variant="ghost" size="sm" disabled={pending} onClick={onConfirm}>
        yes
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setArmed(false)}>
        no
      </Button>
    </span>
  );
}
