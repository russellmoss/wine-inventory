"use client";

import React from "react";
import { Badge, Eyebrow } from "@/components/ui";
import type {
  ProposalStatus,
  ProposalWarning,
  ProposalCostSummary,
  ProposalDiff,
  UnresolvedItem,
} from "@/lib/work-orders/nl-proposal";

// Phase 9.3 Unit 2 — the SHARED readiness renderer. The manual/physical WO builder, the embedded vessel
// issuer (locked-vessel mode), and the assistant proposal card all show the SAME visual language over the
// SAME WorkOrderReadinessProposal. No color-only signalling: every state carries a text label. Unit 8
// hardens floor a11y/touch targets + in-place pickers; this is the reviewable v1.

export type ReadinessRuntimeInput = { taskSeq: number; taskType: string; field: string; label: string; reason: string };

export type WorkOrderReadinessView = {
  status: ProposalStatus;
  warnings: ProposalWarning[];
  cost: ProposalCostSummary;
  diff: ProposalDiff;
  unresolved: UnresolvedItem[];
  runtimeInputs: ReadinessRuntimeInput[];
};

const box: React.CSSProperties = { borderRadius: "var(--radius-md)", padding: "10px 12px", fontSize: 13.5, lineHeight: 1.5 };

function money(n: number | null, currency: string | null): string {
  if (n == null) return "unknown";
  if (!currency) return n.toLocaleString();
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${n.toLocaleString()} ${currency}`;
  }
}

const STATUS_META: Record<ProposalStatus, { label: string; tone: "green" | "gold" | "red" }> = {
  ready: { label: "Ready to issue", tone: "green" },
  needs_input: { label: "Needs decisions", tone: "gold" },
  blocked: { label: "Blocked", tone: "red" },
};

function Section({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }) {
  return (
    <div style={{ ...box, background: "var(--paper-100)", borderLeft: `3px solid ${tone}` }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>{title}</div>
      {children}
    </div>
  );
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

export function WorkOrderReadinessPanel({ proposal }: { proposal: WorkOrderReadinessView }) {
  const blockers = proposal.warnings.filter((w) => w.severity === "blocking");
  const advisories = proposal.warnings.filter((w) => w.severity === "confirmable");
  const completionChecks = proposal.warnings.filter((w) => w.severity === "completion_check");
  const meta = STATUS_META[proposal.status];
  const costLines = proposal.cost.lines;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-live="polite">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Eyebrow>Readiness</Eyebrow>
        <Badge tone={meta.tone} variant="soft">{meta.label}</Badge>
      </div>

      {/* Must fix before issuing (true blockers) */}
      {blockers.length > 0 ? (
        <Section title="Must fix before issuing" tone="var(--red)">
          <List items={blockers.map((w) => w.message)} />
        </Section>
      ) : null}

      {/* Needs decisions (unresolved references — pick a lot/vessel/material) */}
      {proposal.unresolved.length > 0 ? (
        <Section title="Needs decisions" tone="var(--wine-primary)">
          <List items={proposal.unresolved.map((u: UnresolvedItem) => <span key={u.key}><strong>{u.label}:</strong> {u.reason}</span>)} />
        </Section>
      ) : null}

      {/* Review before issuing (advisory / capacity / supply / cost) */}
      {advisories.length > 0 ? (
        <Section title="Review before issuing" tone="var(--accent)">
          <List items={advisories.map((w) => w.message)} />
        </Section>
      ) : null}

      {/* Later on floor (runtime-required fields + completion-time checks) — non-blocking */}
      {proposal.runtimeInputs.length > 0 || completionChecks.length > 0 ? (
        <Section title="Entered later on the floor" tone="var(--border)">
          <List
            items={[
              ...proposal.runtimeInputs.map((r) => <span key={`rt-${r.taskSeq}-${r.field}`}><strong>{r.label}</strong> — {r.reason}</span>),
              ...completionChecks.map((w, i) => <span key={`cc-${w.code}-${i}`}>{w.message}</span>),
            ]}
          />
        </Section>
      ) : null}

      {/* Cost / supply */}
      {costLines.length > 0 ? (
        <Section title="Estimated supply cost" tone="var(--border)">
          <List
            items={costLines.map((line) => (
              <span key={`cost-${line.taskSeq}-${line.materialLabel}`}>
                {line.materialLabel}
                {line.qty != null && line.unit ? ` — ${line.qty.toLocaleString()} ${line.unit}` : ""}
                {": "}
                <strong>{money(line.estimatedCost, proposal.cost.currency)}</strong>
                {line.classification === "overhead" ? <span style={{ color: "var(--text-muted)" }}> (overhead)</span> : null}
                {line.estimatedCost == null && line.reason ? <span style={{ color: "var(--text-muted)" }}> — {line.reason}</span> : null}
              </span>
            ))}
          />
          <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-secondary)" }}>
            {proposal.cost.hasUnknownCost
              ? "Total not shown — at least one supply cost is unknown."
              : `Total ≈ ${money(proposal.cost.totalKnownCost, proposal.cost.currency)}`}
          </div>
        </Section>
      ) : null}

      {/* Before → after diff */}
      {proposal.diff.rows.length > 0 ? (
        <Section title="Planned effect" tone="var(--border)">
          <List items={proposal.diff.rows.map((r, i) => <span key={`diff-${r.kind}-${r.label}-${i}`}><strong>{r.label}:</strong> {r.before} → {r.after}</span>)} />
        </Section>
      ) : null}
    </div>
  );
}
