"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { sendDirectMessageAction } from "@/lib/inbox/dm-actions";
import { inboxHref } from "@/lib/inbox/routes";
import type { RecipientOption } from "@/lib/inbox/types";

// Plan 068 Unit 8 — compose a DM (recipient + body + optional attachments). Mirrors the feedback form:
// send first, then upload attachments against the returned messageId (client never sees a blobUrl),
// collecting upload warnings rather than failing the send.
export function ComposeMessage({ recipients }: { recipients: RecipientOption[] }) {
  const router = useRouter();
  const [recipientUserId, setRecipientUserId] = React.useState("");
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);

  async function send() {
    setError(null);
    setWarnings([]);
    if (!recipientUserId) return setError("Pick who to message.");
    if (!body.trim()) return setError("Enter a message.");
    setBusy(true);
    try {
      const res = await sendDirectMessageAction({ recipientUserId, body: body.trim() });
      const warn: string[] = [];
      for (const f of files) {
        const fd = new FormData();
        fd.set("file", f);
        fd.set("messageId", res.messageId);
        try {
          const r = await fetch("/api/inbox/attachments", { method: "POST", body: fd });
          const j = await r.json();
          if (!r.ok) warn.push(`${f.name}: ${j.error ?? "upload failed"}`);
          else if (j.skipped) warn.push(`${f.name}: ${j.warning ?? "skipped"}`);
        } catch {
          warn.push(`${f.name}: upload failed`);
        }
      }
      setBody("");
      setFiles([]);
      setWarnings(warn);
      router.push(inboxHref("dm") + `&thread=${encodeURIComponent(res.threadId)}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <strong style={{ fontSize: 13 }}>New message</strong>
      <select
        value={recipientUserId}
        onChange={(e) => setRecipientUserId(e.target.value)}
        style={{ padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", fontFamily: "var(--font-body)" }}
      >
        <option value="">Select a recipient…</option>
        {recipients.map((r) => (
          <option key={r.userId} value={r.userId}>{r.name ? `${r.name} (${r.email})` : r.email}</option>
        ))}
      </select>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a message…"
        rows={3}
        style={{ padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", fontFamily: "var(--font-body)", resize: "vertical" }}
      />
      <input type="file" accept="image/png,image/jpeg" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} style={{ fontSize: 12.5 }} />
      {error ? <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div> : null}
      {warnings.length ? <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}</div> : null}
      <button
        onClick={send}
        disabled={busy}
        style={{ alignSelf: "flex-start", padding: "8px 16px", borderRadius: "var(--radius-md)", border: "none", cursor: busy ? "default" : "pointer", background: "var(--accent)", color: "var(--accent-on)", fontFamily: "var(--font-body)", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
