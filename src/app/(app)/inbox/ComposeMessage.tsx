"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { sendDirectMessageAction } from "@/lib/inbox/dm-actions";
import { inboxHref } from "@/lib/inbox/routes";
import type { RecipientOption } from "@/lib/inbox/types";

// Plan 068 — compose a DM. Two modes:
//  • new conversation (no fixedRecipient): shows a recipient picker; on send, opens that channel.
//  • reply (fixedRecipient set): Slack-style reply box scoped to the open thread — no picker, sends
//    straight to that person and stays in the channel (just refreshes).
// Attachments are added via a paperclip button (hidden file input); send-first then upload by messageId.

function PaperclipIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

export function ComposeMessage({
  recipients,
  fixedRecipient,
}: {
  recipients: RecipientOption[];
  fixedRecipient?: { userId: string; email: string };
}) {
  const router = useRouter();
  const reply = !!fixedRecipient;
  const [recipientUserId, setRecipientUserId] = React.useState("");
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const targetUserId = fixedRecipient?.userId ?? recipientUserId;

  async function send() {
    setError(null);
    setWarnings([]);
    if (!targetUserId) return setError("Pick who to message.");
    if (!body.trim()) return setError("Enter a message.");
    setBusy(true);
    try {
      const res = await sendDirectMessageAction({ recipientUserId: targetUserId, body: body.trim() });
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
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (reply) {
        // Stay in the open channel; refresh pulls in the message just sent.
        router.refresh();
      } else {
        router.push(inboxHref("dm") + `&thread=${encodeURIComponent(res.threadId)}`);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the message.");
    } finally {
      setBusy(false);
    }
  }

  function addFiles(list: FileList | null) {
    if (list && list.length) setFiles((prev) => [...prev, ...Array.from(list)]);
  }
  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      {!reply ? (
        <>
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
        </>
      ) : null}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Slack-style: Enter sends, Shift+Enter for a newline.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!busy) void send();
          }
        }}
        placeholder={reply ? `Message ${fixedRecipient!.email}…` : "Write a message…"}
        rows={reply ? 2 : 3}
        style={{ padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", fontFamily: "var(--font-body)", resize: "vertical" }}
      />

      {files.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, background: "var(--accent-soft)", color: "var(--wine-primary)", borderRadius: "var(--radius-pill)", padding: "2px 8px" }}
            >
              {f.name}
              <button
                onClick={() => removeFile(i)}
                aria-label={`Remove ${f.name}`}
                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 13, lineHeight: 1, padding: 0 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {error ? <div style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</div> : null}
      {warnings.length ? <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}</div> : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label
          title="Attach a PNG or JPEG"
          aria-label="Attach a file"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", color: "var(--text-secondary)", cursor: "pointer" }}
        >
          <PaperclipIcon />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            style={{ display: "none" }}
          />
        </label>
        <button
          onClick={send}
          disabled={busy}
          style={{ padding: "8px 16px", borderRadius: "var(--radius-md)", border: "none", cursor: busy ? "default" : "pointer", background: "var(--accent)", color: "var(--accent-on)", fontFamily: "var(--font-body)", opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
