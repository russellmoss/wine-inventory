"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Checkbox, Eyebrow } from "@/components/ui";
import type { ReviewQueueItem } from "@/lib/work-orders/data";
import { approveTaskAction, rejectTaskAction, bulkApproveTasksAction } from "@/lib/work-orders/actions";
import { unwrap } from "@/lib/action-result";

// Deviation-first review (Phase 9 Unit 12, D3): variances are segregated + warning-colored; "select all"
// only picks EXACT-match tasks (no significant deviation) — anti-rubber-stamp. Reject reverses the
// ledger op and surfaces the LEDGER-11 "undo the later op first" conflict.

export function ReviewClient({ queue }: { queue: ReviewQueueItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  const exact = queue.filter((q) => !q.hasSignificantDeviation);
  const deviated = queue.filter((q) => q.hasSignificantDeviation);

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function selectAllExact() {
    setSelected(new Set(exact.map((q) => q.taskId)));
  }

  function run(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try { await fn(); setSelected(new Set()); setRejecting(null); setReason(""); router.refresh(); }
      catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    });
  }

  function Item({ q }: { q: ReviewQueueItem }) {
    return (
      <Card padding="14px 16px" style={{ borderColor: q.hasSignificantDeviation ? "var(--warning, #b8860b)" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {!q.hasSignificantDeviation ? <Checkbox checked={selected.has(q.taskId)} onChange={() => toggle(q.taskId)} /> : null}
            <div>
              <div style={{ fontWeight: 600 }}>
                <Link href={`/work-orders/${q.workOrderId}`} style={{ color: "inherit", textDecoration: "none" }}>#{q.workOrderNumber}</Link> · {q.taskTitle}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{q.opType} · completed by {q.completedByEmail ?? "—"}</div>
            </div>
          </div>
          {q.hasSignificantDeviation ? <Badge tone="gold">deviation</Badge> : <Badge tone="green">exact</Badge>}
        </div>

        {q.deviations.length > 0 ? (
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13 }}>
            {q.deviations.map((d) => (
              <li key={d.field} style={{ color: d.significant ? "var(--warning, #b8860b)" : "var(--text-secondary)" }}>
                {d.field}: planned {d.planned ?? "—"} → actual {d.actual ?? "—"}{d.pct != null ? ` (${d.pct > 0 ? "+" : ""}${d.pct}%)` : ""}
              </li>
            ))}
          </ul>
        ) : null}
        {q.deviationReason ? <div style={{ fontSize: 13, marginTop: 6 }}>Reason: {q.deviationReason}</div> : null}

        {rejecting === q.taskId ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <input style={{ flex: 1, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }} placeholder="Reason for rejecting…" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button variant="secondary" disabled={pending} onClick={() => run(() => rejectTaskAction({ taskId: q.taskId, reason: reason.trim() || undefined }).then(unwrap))}>Confirm reject</Button>
            <Button variant="ghost" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</Button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Button disabled={pending} onClick={() => run(() => approveTaskAction({ taskId: q.taskId }).then(unwrap))}>Approve</Button>
            <Button variant="ghost" disabled={pending} onClick={() => { setRejecting(q.taskId); setReason(""); }}>Reject (reverse)</Button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "8px 4px 60px" }}>
      <Link href="/work-orders" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>← Work orders</Link>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "6px 0 4px" }}>Review queue</h1>

      {queue.length === 0 ? (
        <Card style={{ marginTop: 20, textAlign: "center", padding: 40 }}>All caught up ✓</Card>
      ) : (
        <>
          {error ? <div style={{ color: "var(--danger)", fontSize: 14, margin: "8px 0" }}>{error}</div> : null}
          {exact.length > 0 ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
              <Button variant="secondary" onClick={selectAllExact}>Select all exact matches ({exact.length})</Button>
              <Button disabled={pending || selected.size === 0} onClick={() => run(() => bulkApproveTasksAction({ taskIds: [...selected] }).then(unwrap))}>Approve selected ({selected.size})</Button>
            </div>
          ) : null}

          {deviated.length > 0 ? (
            <section style={{ marginTop: 12 }}>
              <Eyebrow style={{ color: "var(--warning, #b8860b)" }}>Needs individual review — deviations ({deviated.length})</Eyebrow>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>{deviated.map((q) => <Item key={q.taskId} q={q} />)}</div>
            </section>
          ) : null}
          {exact.length > 0 ? (
            <section style={{ marginTop: 18 }}>
              <Eyebrow>Exact matches ({exact.length})</Eyebrow>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>{exact.map((q) => <Item key={q.taskId} q={q} />)}</div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
