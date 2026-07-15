"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import type { WorkOrderDetail, OrgMemberRow } from "@/lib/work-orders/data";
import { issueWorkOrderAction, cancelWorkOrderAction, assignWorkOrderAction, scheduleWorkOrderAction } from "@/lib/work-orders/actions";
import { statusTone } from "@/lib/work-orders/status-badge";

export function WorkOrderDetailClient({ wo, isAdmin, members }: { wo: WorkOrderDetail; isAdmin: boolean; members: OrgMemberRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);

  // Plan 069: admins/developers can set the Lead + reschedule inline. Mirror the backend status guards —
  // reassign is allowed only for DRAFT/ISSUED (lifecycle assignWorkOrderCore); reschedule for anything
  // except APPROVED/CANCELLED (scheduleWorkOrderCore).
  const canEditLead = wo.status === "DRAFT" || wo.status === "ISSUED";
  const canEditDue = wo.status !== "APPROVED" && wo.status !== "CANCELLED";
  const showEdit = isAdmin && (canEditLead || canEditDue);
  const currentDue = wo.dueAt ? wo.dueAt.slice(0, 10) : "";
  const [editing, setEditing] = React.useState(false);
  const [leadEmail, setLeadEmail] = React.useState(wo.assigneeEmail ?? "");
  const [dueDate, setDueDate] = React.useState(currentDue);
  const leadInMembers = members.some((m) => m.email === wo.assigneeEmail);

  function saveEdits() {
    setError(null);
    if (canEditLead && !leadEmail) { setError("A work order needs a lead."); return; }
    const leadUserId = members.find((m) => m.email === leadEmail)?.userId ?? null;
    act(async () => {
      if (canEditLead && leadEmail && leadEmail !== (wo.assigneeEmail ?? "")) {
        await assignWorkOrderAction({ workOrderId: wo.id, assigneeId: leadUserId, assigneeEmail: leadEmail });
      }
      if (canEditDue && dueDate !== currentDue) {
        await scheduleWorkOrderAction({ workOrderId: wo.id, dueAt: dueDate ? new Date(`${dueDate}T00:00:00`) : null });
      }
      setEditing(false);
    });
  }

  const editField: React.CSSProperties = { padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, background: "var(--surface)" };

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
            {wo.priority && wo.priority !== "NORMAL" ? `${wo.priority.charAt(0)}${wo.priority.slice(1).toLowerCase()} priority · ` : ""}
            {wo.locationName ? `${wo.locationName} · ` : ""}
            {wo.assigneeEmail ? `Assigned to ${wo.assigneeEmail} · ` : ""}
            {wo.dueAt ? `Due ${new Date(wo.dueAt).toLocaleDateString()}` : "Unscheduled"}
            {wo.startedByEmail ? ` · in progress by ${wo.startedByEmail}` : ""}
          </div>
        </div>
        <Badge tone={statusTone(wo.status)}>{wo.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </div>

      {wo.instructions ? <Card style={{ marginTop: 14, padding: 14, fontSize: 14 }}>{wo.instructions}</Card> : null}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {wo.status === "DRAFT" ? <Button disabled={pending} onClick={() => act(() => issueWorkOrderAction({ workOrderId: wo.id }))}>Issue</Button> : null}
        {(wo.status === "ISSUED" || wo.status === "IN_PROGRESS") ? (
          <Link href={`/work-orders/${wo.id}/execute`}><Button variant="secondary">Open execution view</Button></Link>
        ) : null}
        {isAdmin && wo.status === "PENDING_APPROVAL" ? <Link href="/work-orders/review"><Button variant="secondary">Go to review queue</Button></Link> : null}
        <Link href={`/work-orders/${wo.id}/print`}><Button variant="secondary">Print / PDF</Button></Link>
        {showEdit ? <Button variant="secondary" onClick={() => setEditing((v) => !v)}>{editing ? "Close edit" : "Edit"}</Button> : null}
        {wo.status !== "APPROVED" && wo.status !== "CANCELLED" ? (
          <Button variant="ghost" disabled={pending} onClick={() => act(() => cancelWorkOrderAction({ workOrderId: wo.id }))}>Cancel WO</Button>
        ) : null}
      </div>

      {editing && showEdit ? (
        <Card style={{ marginTop: 12, padding: 14 }}>
          <Eyebrow>Edit work order</Eyebrow>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 10, alignItems: "flex-end" }}>
            {canEditLead ? (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--text-muted)" }}>
                Lead
                <select style={editField} value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)}>
                  {/* If the current lead is no longer an org member, keep it selectable so we don't silently drop it. */}
                  {wo.assigneeEmail && !leadInMembers ? <option value={wo.assigneeEmail}>{wo.assigneeEmail} (current)</option> : null}
                  {members.map((m) => <option key={m.userId} value={m.email}>{m.name}</option>)}
                </select>
              </label>
            ) : null}
            {canEditDue ? (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--text-muted)" }}>
                Due date
                <input type="date" style={editField} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
            ) : null}
            <Button disabled={pending} onClick={saveEdits}>{pending ? "Saving…" : "Save"}</Button>
          </div>
          {canEditLead ? null : <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>The lead can only be changed while a work order is a draft or issued.</div>}
        </Card>
      ) : null}

      {warnings.length > 0 ? (
        <Card style={{ marginTop: 12, padding: 14, borderColor: "var(--warning, #b8860b)" }}>
          <Eyebrow style={{ color: "var(--warning, #b8860b)" }}>Reservation warnings</Eyebrow>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13.5 }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </Card>
      ) : null}
      {error ? <div style={{ color: "var(--danger)", marginTop: 12, fontSize: 14 }}>{error}</div> : null}

      {wo.dependsOn.length > 0 ? (
        <Card style={{ marginTop: 14, padding: 14 }}>
          <Eyebrow>Runs after</Eyebrow>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 8px" }}>These work orders must be finished before this one can complete.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {wo.dependsOn.map((d) => (
              <Link key={d.id} href={`/work-orders/${d.id}`} style={{ textDecoration: "none" }}>
                <Badge tone={statusTone(d.status)}>WO #{d.number} · {d.title}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <section style={{ marginTop: 22 }}>
        <Eyebrow>Tasks ({wo.tasks.length})</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {(() => {
            const groups = new Map<number, typeof wo.tasks>();
            for (const t of wo.tasks) {
              const g = groups.get(t.groupSeq) ?? [];
              g.push(t);
              groups.set(t.groupSeq, g);
            }
            const ordered = [...groups.entries()].sort((a, b) => a[0] - b[0]);
            const multiGroup = ordered.length > 1;
            const renderTask = (t: (typeof wo.tasks)[number]) => (
              <Card key={t.id} padding="12px 14px">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ fontWeight: 600 }}>{t.seq}. {t.title}</div>
                  <Badge tone={statusTone(t.status)}>{t.status.replace(/_/g, " ").toLowerCase()}</Badge>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>
                  {t.kind === "OPERATION" ? t.opType : t.kind === "NOTE" ? "checklist" : t.kind === "MAINTENANCE" ? `maintenance · ${t.activityType}` : t.observationType === "HARVEST_WEIGH_IN" ? "fruit weigh-in" : `observation · ${t.observationType}`}
                  {t.assigneeName ? ` · ${t.assigneeName}` : ""}
                </div>
                {t.equipment.length ? <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>Equipment: {t.equipment.join(", ")}</div> : null}
                {t.groupRack ? (
                  <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 5 }}>
                    {t.groupRack.direction === "RACK_TO_TANK" ? "Rack to tank" : "Barrel down"}: <strong>{t.groupRack.doneCount} of {t.groupRack.members.length} done</strong>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                      {t.groupRack.members.map((m) => (
                        <span key={m.vesselId} style={{ fontSize: 11.5, padding: "2px 7px", borderRadius: 999, background: m.done ? "var(--paper-100)" : "var(--surface)", border: "1px solid var(--border)", color: m.done ? "var(--text-secondary)" : "var(--text-muted)" }}>
                          {m.done ? "✓ " : ""}{m.code ?? m.vesselId.slice(0, 6)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {t.deviationReason ? <div style={{ fontSize: 13, color: "var(--warning, #b8860b)", marginTop: 6 }}>Deviation: {t.deviationReason}</div> : null}
                {t.completionNote ? <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>Note: {t.completionNote}</div> : null}
              </Card>
            );
            if (!multiGroup) return ordered.flatMap(([, tasks]) => tasks.map(renderTask));
            return ordered.map(([groupSeq, tasks], gi) => (
              <React.Fragment key={groupSeq}>
                {gi > 0 ? <div style={{ fontSize: 11, color: "var(--text-muted)", paddingLeft: 2 }}>↓ then</div> : null}
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--accent)" }}>Group {gi + 1}{tasks.length > 1 ? " · runs in parallel" : ""}</div>
                {tasks.map(renderTask)}
              </React.Fragment>
            ));
          })()}
        </div>
      </section>
    </div>
  );
}
