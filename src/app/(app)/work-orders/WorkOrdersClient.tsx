"use client";

import React from "react";
import Link from "next/link";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import type { WorkOrderSummary } from "@/lib/work-orders/data";
import { WorkOrdersTabs } from "./WorkOrdersTabs";

type Dashboard = {
  buckets: { overdue: WorkOrderSummary[]; today: WorkOrderSummary[]; upcoming: WorkOrderSummary[]; unscheduled: WorkOrderSummary[] };
  pendingApproval: WorkOrderSummary[];
  counts: Record<string, number>;
};

const STATUS_TONE: Record<string, "neutral" | "gold" | "green" | "blue" | "maroon" | "red"> = {
  DRAFT: "neutral", ISSUED: "blue", IN_PROGRESS: "gold", PENDING_APPROVAL: "maroon", APPROVED: "green", CANCELLED: "neutral",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function WoCard({ wo }: { wo: WorkOrderSummary }) {
  return (
    <Link href={`/work-orders/${wo.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <Card interactive padding="14px 16px" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>#{wo.number} · {wo.title}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            {wo.doneCount}/{wo.taskCount} tasks
            {wo.assigneeEmail ? ` · ${wo.assigneeEmail}` : ""}
            {wo.startedByEmail ? ` · in progress by ${wo.startedByEmail}` : ""}
            {` · due ${fmtDate(wo.dueAt)}`}
          </div>
        </div>
        <Badge tone={STATUS_TONE[wo.status] ?? "neutral"}>{wo.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </Card>
    </Link>
  );
}

function Section({ title, items, tone }: { title: string; items: WorkOrderSummary[]; tone?: "danger" }) {
  if (items.length === 0) return null;
  return (
    <section style={{ marginTop: 22 }}>
      <Eyebrow style={{ color: tone === "danger" ? "var(--danger)" : undefined }}>{title} ({items.length})</Eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {items.map((wo) => <WoCard key={wo.id} wo={wo} />)}
      </div>
    </section>
  );
}

export function WorkOrdersClient({ dashboard, isAdmin }: { dashboard: Dashboard; isAdmin: boolean }) {
  const { buckets, pendingApproval } = dashboard;
  const isEmpty =
    buckets.overdue.length + buckets.today.length + buckets.upcoming.length + buckets.unscheduled.length + pendingApproval.length === 0;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "8px 4px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: 0 }}>Work orders</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {isAdmin && pendingApproval.length > 0 ? (
            <Link href="/work-orders/review"><Button variant="secondary">Review queue ({pendingApproval.length})</Button></Link>
          ) : null}
          <Link href="/work-orders/templates"><Button variant="secondary">Templates</Button></Link>
          <Link href="/work-orders/new"><Button>New work order</Button></Link>
        </div>
      </div>

      <div style={{ marginTop: 14 }}><WorkOrdersTabs active="open" /></div>

      {isEmpty ? (
        <Card style={{ marginTop: 24, textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>No open work orders</div>
          <div style={{ color: "var(--text-muted)", marginTop: 6, marginBottom: 18 }}>Issue your first work order to tell the crew what to do — completing a task logs the operation for you.</div>
          <Link href="/work-orders/new"><Button>Issue your first work order</Button></Link>
        </Card>
      ) : (
        <>
          {isAdmin ? <Section title="Awaiting review" items={pendingApproval} /> : null}
          <Section title="Overdue" items={buckets.overdue} tone="danger" />
          <Section title="Today" items={buckets.today} />
          <Section title="Upcoming" items={buckets.upcoming} />
          <Section title="Unscheduled" items={buckets.unscheduled} />
        </>
      )}
    </div>
  );
}
