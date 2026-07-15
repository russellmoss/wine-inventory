"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  markAllNotificationsReadAction,
  markNotificationsReadAction,
  markNotificationsUnreadAction,
  markThreadReadAction,
} from "@/lib/inbox/actions";
import { inboxHref, type InboxBucket } from "@/lib/inbox/routes";
import type {
  DirectMessageThreadDetail,
  DirectMessageThreadSummary,
  InboxNotificationDTO,
  MyTicketRow,
  MyWorkOrderRow,
  RecipientOption,
} from "@/lib/inbox/types";
import { ComposeMessage } from "@/app/(app)/inbox/ComposeMessage";
import { ThreadView } from "@/app/(app)/inbox/ThreadView";

type Me = { userId: string; email: string };

const BUCKETS: { key: InboxBucket; label: string }[] = [
  { key: "all", label: "All messages" },
  { key: "wo", label: "Work orders" },
  { key: "tickets", label: "Tickets" },
  { key: "dm", label: "Direct messages" },
];

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const panel: React.CSSProperties = { border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--surface-raised)" };
const railBtn = (active: boolean): React.CSSProperties => ({
  display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left",
  padding: "10px 12px", borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
  background: active ? "var(--accent)" : "transparent", color: active ? "var(--accent-on)" : "var(--text-secondary)",
  fontFamily: "var(--font-body)", fontSize: 14, fontWeight: active ? 500 : 400, textDecoration: "none",
});
const listRow = (active: boolean, unread: boolean): React.CSSProperties => ({
  width: "100%", textAlign: "left", padding: "12px 14px", border: "none", borderBottom: "1px solid var(--border)",
  cursor: "pointer", background: active ? "var(--accent-soft)" : "transparent", fontFamily: "var(--font-body)",
  display: "block", fontWeight: unread ? 600 : 400,
});
const chip = (active: boolean): React.CSSProperties => ({
  padding: "4px 10px", borderRadius: "var(--radius-pill)", fontSize: 12, textDecoration: "none",
  background: active ? "var(--accent)" : "var(--accent-soft)", color: active ? "var(--accent-on)" : "var(--wine-primary)",
});

export function InboxClient(props: {
  me: Me;
  bucket: InboxBucket;
  filter: string | null;
  selectedThreadId: string | null;
  notifications: InboxNotificationDTO[];
  workOrders: MyWorkOrderRow[];
  tickets: MyTicketRow[];
  threads: DirectMessageThreadSummary[];
  threadDetail: DirectMessageThreadDetail | null;
  recipients: RecipientOption[];
  isAdmin: boolean;
  isDeveloper: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [selected, setSelected] = React.useState<InboxNotificationDTO | MyWorkOrderRow | MyTicketRow | null>(null);

  // Reset the reader selection when the bucket/filter changes — React's sanctioned "adjust state during
  // render" pattern (matches AppShell), not an effect.
  const viewKey = `${props.bucket}:${props.filter ?? ""}`;
  const [prevViewKey, setPrevViewKey] = React.useState(viewKey);
  if (viewKey !== prevViewKey) {
    setPrevViewKey(viewKey);
    setSelected(null);
  }

  const unreadCount = props.notifications.filter((n) => !n.read).length;

  function openNotification(n: InboxNotificationDTO) {
    setSelected(n);
    if (!n.read) startTransition(async () => { await markNotificationsReadAction([n.id]); router.refresh(); });
  }
  function markUnread(id: string) {
    startTransition(async () => { await markNotificationsUnreadAction([id]); router.refresh(); });
  }
  function markAllRead() {
    startTransition(async () => { await markAllNotificationsReadAction(); router.refresh(); });
  }
  function openThread(threadId: string) {
    // Mark the thread's notifications read FIRST (server revalidates /inbox), THEN navigate — pushing
    // and refreshing together races the fetch against the URL commit and the thread never opens.
    startTransition(async () => {
      await markThreadReadAction(threadId);
      router.push(inboxHref("dm") + `&thread=${encodeURIComponent(threadId)}`);
    });
  }

  return (
    <div style={{ padding: "var(--space-5)", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, marginBottom: "var(--space-4)" }}>Inbox</h1>
      <div className="bw-inbox-grid" style={{ display: "grid", gridTemplateColumns: "minmax(160px, 200px) minmax(220px, 320px) 1fr", gap: "var(--space-4)", alignItems: "start" }}>
        {/* ── Bucket rail ── */}
        <nav style={{ ...panel, padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
          {BUCKETS.map((b) => (
            <Link key={b.key} href={inboxHref(b.key)} style={railBtn(props.bucket === b.key)}>
              <span>{b.label}</span>
              {b.key === "all" && unreadCount > 0 ? (
                <span style={{ background: "var(--danger)", color: "#fff", borderRadius: "var(--radius-pill)", fontSize: 11, padding: "1px 7px" }}>{unreadCount}</span>
              ) : null}
            </Link>
          ))}
          <div style={{ borderTop: "1px solid var(--border)", margin: "8px 4px" }} />
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", padding: "6px 12px" }}>Account</div>
          <Link href="/settings" style={railBtn(false)}>Settings</Link>
          {props.isAdmin || props.isDeveloper ? <Link href="/users" style={railBtn(false)}>Users</Link> : null}
        </nav>

        {/* ── List pane ── */}
        <div style={{ ...panel, overflow: "hidden", minHeight: 400 }}>
          {props.bucket === "all" ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{props.notifications.length} message{props.notifications.length === 1 ? "" : "s"}</span>
                {unreadCount > 0 ? <button onClick={markAllRead} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-accent)", fontSize: 12.5 }}>Mark all read</button> : null}
              </div>
              {props.notifications.length === 0 ? <Empty label="No messages yet." /> : props.notifications.map((n) => {
                const active = selected && "kind" in selected && (selected as InboxNotificationDTO).id === n.id;
                return (
                  <button key={n.id} onClick={() => openNotification(n)} style={listRow(!!active, !n.read)}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ color: "var(--text-primary)" }}>{!n.read ? "● " : ""}{n.title}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmt(n.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.snippet}</div>
                  </button>
                );
              })}
            </>
          ) : props.bucket === "wo" ? (
            <>
              <FilterChips bucket="wo" current={props.filter ?? "open"} options={[["open", "Open"], ["in-progress", "In progress"], ["completed", "Completed"]]} />
              {props.workOrders.length === 0 ? <Empty label="No work orders." /> : props.workOrders.map((w) => (
                <button key={w.id} onClick={() => setSelected(w)} style={listRow(!!selected && "number" in selected && (selected as MyWorkOrderRow).id === w.id, false)}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ color: "var(--text-primary)" }}>#{w.number} · {w.title}</span>
                    <StatusPill status={w.status} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>Updated {fmt(w.updatedAt)}{w.dueAt ? ` · due ${fmt(w.dueAt)}` : ""}</div>
                </button>
              ))}
            </>
          ) : props.bucket === "tickets" ? (
            <>
              <FilterChips bucket="tickets" current={props.filter ?? "open"} options={[["open", "Open"], ["closed", "Closed"]]} />
              {props.tickets.length === 0 ? <Empty label="No tickets." /> : props.tickets.map((t) => (
                <button key={t.id} onClick={() => setSelected(t)} style={listRow(!!selected && "kind" in selected && !("category" in selected) && (selected as MyTicketRow).id === t.id, false)}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ color: "var(--text-primary)" }}>{t.title}</span>
                    <StatusPill status={t.status} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{t.kind.replace(/_/g, " ").toLowerCase()} · {fmt(t.createdAt)}</div>
                </button>
              ))}
            </>
          ) : (
            <>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-muted)" }}>Conversations</div>
              {props.threads.length === 0 ? <Empty label="No conversations yet." /> : props.threads.map((th) => (
                <button key={th.threadId} onClick={() => openThread(th.threadId)} style={listRow(props.selectedThreadId === th.threadId, false)}>
                  <div style={{ color: "var(--text-primary)" }}>{th.otherEmail}</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{th.preview ?? "No messages yet"}</div>
                </button>
              ))}
            </>
          )}
        </div>

        {/* ── Reader pane ── */}
        <div style={{ ...panel, padding: "var(--space-4)", minHeight: 400 }}>
          {props.bucket === "dm" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <ComposeMessage recipients={props.recipients} />
              {props.threadDetail ? <ThreadView thread={props.threadDetail} /> : <p style={{ color: "var(--text-muted)" }}>Pick a conversation, or start a new one above.</p>}
            </div>
          ) : selected ? (
            <Reader selected={selected} onMarkUnread={markUnread} />
          ) : (
            <p style={{ color: "var(--text-muted)" }}>Select an item to read it.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div style={{ padding: "var(--space-5)", color: "var(--text-muted)", textAlign: "center", fontSize: 13 }}>{label}</div>;
}

function StatusPill({ status }: { status: string }) {
  return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: "var(--radius-pill)", background: "var(--accent-soft)", color: "var(--wine-primary)", whiteSpace: "nowrap" }}>{status.replace(/_/g, " ").toLowerCase()}</span>;
}

function FilterChips({ bucket, current, options }: { bucket: InboxBucket; current: string; options: [string, string][] }) {
  return (
    <div style={{ display: "flex", gap: 6, padding: "10px 14px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
      {options.map(([val, label]) => (
        <Link key={val} href={inboxHref(bucket, val)} style={chip(current === val)}>{label}</Link>
      ))}
    </div>
  );
}

function Reader({ selected, onMarkUnread }: { selected: InboxNotificationDTO | MyWorkOrderRow | MyTicketRow; onMarkUnread: (id: string) => void }) {
  // Notification (has category + href).
  if ("category" in selected) {
    const n = selected;
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{n.title}</h2>
          <button onClick={() => onMarkUnread(n.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-accent)", fontSize: 12.5, whiteSpace: "nowrap" }}>Mark unread</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{n.actorEmail ? `${n.actorEmail} · ` : ""}{fmt(n.createdAt)}</div>
        <p style={{ marginTop: "var(--space-3)", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{n.snippet}</p>
        {n.href ? (
          <Link href={n.href} style={{ ...chip(false), display: "inline-block", marginTop: "var(--space-3)" }}>Open</Link>
        ) : (
          // Tombstone (amendment 6): polymorphic source with no derivable link.
          <p style={{ marginTop: "var(--space-3)", color: "var(--text-muted)", fontSize: 12.5 }}>This item is no longer available.</p>
        )}
      </div>
    );
  }
  // Work order (has number).
  if ("number" in selected) {
    const w = selected;
    return (
      <div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Work order #{w.number}</h2>
        <p style={{ marginTop: 4 }}>{w.title}</p>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{w.status.replace(/_/g, " ").toLowerCase()} · updated {fmt(w.updatedAt)}</div>
        <Link href={`/work-orders/${w.id}`} style={{ ...chip(false), display: "inline-block", marginTop: "var(--space-3)" }}>Open work order</Link>
      </div>
    );
  }
  // Ticket.
  const t = selected;
  return (
    <div>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{t.title}</h2>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{t.kind.replace(/_/g, " ").toLowerCase()} · {t.status.replace(/_/g, " ").toLowerCase()} · {fmt(t.createdAt)}</div>
      {t.resolvedAt ? <p style={{ marginTop: "var(--space-3)", color: "var(--text-secondary)" }}>Resolved {fmt(t.resolvedAt)}. See the message in “All” for the outcome.</p> : <p style={{ marginTop: "var(--space-3)", color: "var(--text-secondary)" }}>This ticket is still open.</p>}
    </div>
  );
}
