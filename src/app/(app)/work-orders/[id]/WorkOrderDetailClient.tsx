"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import type { WorkOrderDetail } from "@/lib/work-orders/data";
import { issueWorkOrderAction, cancelWorkOrderAction } from "@/lib/work-orders/actions";

const STATUS_TONE: Record<string, "neutral" | "gold" | "green" | "blue" | "maroon" | "red"> = {
  DRAFT: "neutral", ISSUED: "blue", IN_PROGRESS: "gold", PENDING_APPROVAL: "maroon", APPROVED: "green", CANCELLED: "neutral",
  PENDING: "neutral", REJECTED: "red", DONE: "green", SKIPPED: "neutral",
};

export function WorkOrderDetailClient({ wo, isAdmin }: { wo: WorkOrderDetail; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);

  function act(fn: () => Promise<{ reservationWarnings?: string[] } | unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = (await fn()) as { reservationWarnings?: string[] };
        if (res?.reservationWarnings) setWarnings(res.reservationWarnings);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "8px 4px 60px" }}>
      <Link href="/work-orders" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>← Work orders</Link>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: 0 }}>#{wo.number} · {wo.title}</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {wo.assigneeEmail ? `Assigned to ${wo.assigneeEmail} · ` : ""}
            {wo.dueAt ? `Due ${new Date(wo.dueAt).toLocaleDateString()}` : "Unscheduled"}
            {wo.startedByEmail ? ` · in progress by ${wo.startedByEmail}` : ""}
          </div>
        </div>
        <Badge tone={STATUS_TONE[wo.status] ?? "neutral"}>{wo.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </div>

      {wo.instructions ? <Card style={{ marginTop: 14, padding: 14, fontSize: 14 }}>{wo.instructions}</Card> : null}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {wo.status === "DRAFT" ? <Button disabled={pending} onClick={() => act(() => issueWorkOrderAction({ workOrderId: wo.id }))}>Issue</Button> : null}
        {(wo.status === "ISSUED" || wo.status === "IN_PROGRESS") ? (
          <Link href={`/work-orders/${wo.id}/execute`}><Button variant="secondary">Open execution view</Button></Link>
        ) : null}
        {isAdmin && wo.status === "PENDING_APPROVAL" ? <Link href="/work-orders/review"><Button variant="secondary">Go to review queue</Button></Link> : null}
        <Link href={`/work-orders/${wo.id}/print`}><Button variant="secondary">Print / PDF</Button></Link>
        {wo.status !== "APPROVED" && wo.status !== "CANCELLED" ? (
          <Button variant="ghost" disabled={pending} onClick={() => act(() => cancelWorkOrderAction({ workOrderId: wo.id }))}>Cancel WO</Button>
        ) : null}
      </div>

      {warnings.length > 0 ? (
        <Card style={{ marginTop: 12, padding: 14, borderColor: "var(--warning, #b8860b)" }}>
          <Eyebrow style={{ color: "var(--warning, #b8860b)" }}>Reservation warnings</Eyebrow>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13.5 }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Card>
      ) : null}
      {error ? <div style={{ color: "var(--danger)", marginTop: 12, fontSize: 14 }}>{error}</div> : null}

      <section style={{ marginTop: 22 }}>
        <Eyebrow>Tasks ({wo.tasks.length})</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {wo.tasks.map((t) => (
            <Card key={t.id} padding="12px 14px">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 600 }}>{t.seq}. {t.title}</div>
                <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status.replace(/_/g, " ").toLowerCase()}</Badge>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>
                {t.kind === "OPERATION" ? t.opType : `observation · ${t.observationType}`}
              </div>
              {t.deviationReason ? <div style={{ fontSize: 13, color: "var(--warning, #b8860b)", marginTop: 6 }}>Deviation: {t.deviationReason}</div> : null}
              {t.completionNote ? <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>Note: {t.completionNote}</div> : null}
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
