"use client";

import * as React from "react";
import type { DirectMessageThreadDetail } from "@/lib/inbox/types";
import { LocalTime } from "@/components/ui";

// Plan 068 Unit 8 — render a DM thread oldest→newest. Attachments download through the authed proxy
// route by id (never a raw blobUrl — council amendment 1).
function fmt(iso: string): React.ReactNode {
  return <LocalTime value={iso} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />;
}

export function ThreadView({ thread }: { thread: DirectMessageThreadDetail }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: "var(--space-2)" }}>Conversation with {thread.otherEmail}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {thread.messages.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No messages yet.</p>
        ) : (
          thread.messages.map((m) => (
            <div
              key={m.id}
              style={{
                alignSelf: m.mine ? "flex-end" : "flex-start",
                maxWidth: "80%",
                background: m.mine ? "var(--accent)" : "var(--accent-soft)",
                color: m.mine ? "var(--accent-on)" : "var(--text-primary)",
                borderRadius: "var(--radius-md)",
                padding: "8px 12px",
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}>{m.mine ? "You" : m.senderEmail} · {fmt(m.createdAt)}</div>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>{m.body}</div>
              {m.attachments.length ? (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                  {m.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={`/api/inbox/attachments/${encodeURIComponent(a.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 12, color: m.mine ? "var(--accent-on)" : "var(--text-accent)", textDecoration: "underline" }}
                    >
                      📎 {a.filename}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
