"use client";

import React from "react";
import { Button } from "@/components/ui";
import { Markdown } from "./Markdown";

type Role = "user" | "assistant";

type TextItem = { kind: "text"; role: Role; content: string };
type ProposalItem = {
  kind: "proposal";
  preview: string;
  token: string;
  status: "pending" | "applying" | "done" | "error";
  result?: string;
};
type Item = TextItem | ProposalItem;

type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; phase: "start" | "end"; ok?: boolean }
  | { type: "proposal"; tool: string; preview: string; token: string }
  | { type: "error"; message: string }
  | { type: "done" };

// Readable conversation column width (Claude-native centered column).
const CONTENT_MAX = 880;

const TOOL_LABELS: Record<string, string> = {
  query_brix: "Checking Brix readings",
  query_yield: "Checking yields",
  query_vineyard_status: "Checking vineyard status",
  query_audit: "Searching the audit log",
  log_brix: "Preparing Brix entry",
  set_yield_estimate: "Preparing yield estimate",
  adjust_inventory: "Preparing inventory adjustment",
};

export function AssistantChat({ userLabel }: { userLabel: string }) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items, status]);

  function appendText(text: string) {
    setStatus(null);
    setItems((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.kind === "text" && last.role === "assistant") {
        const next = [...prev];
        next[next.length - 1] = { ...last, content: last.content + text };
        return next;
      }
      return [...prev, { kind: "text", role: "assistant", content: text }];
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");

    // Conversation history for the API = prior text turns + this user turn.
    const history = items
      .filter((it): it is TextItem => it.kind === "text")
      .map((it) => ({ role: it.role, content: it.content }));
    history.push({ role: "user", content: text });

    setItems((prev) => [...prev, { kind: "text", role: "user", content: text }]);
    setBusy(true);
    setStatus("Thinking…");

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error ?? `Request failed (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handle = (evt: AssistantEvent) => {
        if (evt.type === "text") {
          appendText(evt.text);
        } else if (evt.type === "tool") {
          setStatus(evt.phase === "start" ? `${TOOL_LABELS[evt.name] ?? evt.name}…` : "Thinking…");
        } else if (evt.type === "proposal") {
          setStatus(null);
          setItems((prev) => [...prev, { kind: "proposal", preview: evt.preview, token: evt.token, status: "pending" }]);
        } else if (evt.type === "error") {
          setError(evt.message);
        }
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) {
            try {
              handle(JSON.parse(line) as AssistantEvent);
            } catch {
              /* ignore a partial/garbled line */
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function confirmProposal(index: number) {
    const target = items[index];
    if (!target || target.kind !== "proposal" || target.status !== "pending") return;
    setItems((prev) => updateProposal(prev, index, { status: "applying" }));
    try {
      const res = await fetch("/api/assistant/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: target.token }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setItems((prev) => updateProposal(prev, index, { status: "done", result: data.message }));
      } else {
        setItems((prev) => updateProposal(prev, index, { status: "error", result: data?.error ?? "Could not apply." }));
      }
    } catch {
      setItems((prev) => updateProposal(prev, index, { status: "error", result: "Network error." }));
    }
  }

  function cancelProposal(index: number) {
    setItems((prev) => updateProposal(prev, index, { status: "error", result: "Cancelled." }));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const column: React.CSSProperties = { width: "100%", maxWidth: CONTENT_MAX, marginLeft: "auto", marginRight: "auto" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 7rem)", minHeight: 420 }}>
      <div style={{ ...column, paddingBottom: "var(--space-3)" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: "var(--text-h2)", margin: 0 }}>Assistant</h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)", color: "var(--text-muted)", marginTop: 4 }}>
          Ask about your vineyards in plain language, {userLabel.split("@")[0]}.
        </p>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ ...column, display: "flex", flexDirection: "column", gap: "var(--space-5)", padding: "var(--space-4) 0 var(--space-6)" }}>
          {items.length === 0 ? (
            <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "var(--text-body)", maxWidth: 460, paddingTop: "var(--space-8)" }}>
              Try: <em>&ldquo;What&rsquo;s the latest Brix for Block 3?&rdquo;</em> or <em>&ldquo;Log 22.4 Brix for Block 3.&rdquo;</em>
            </div>
          ) : (
            items.map((it, i) =>
              it.kind === "text" ? (
                <Bubble key={i} role={it.role} content={it.content} />
              ) : (
                <ProposalCard
                  key={i}
                  item={it}
                  onConfirm={() => void confirmProposal(i)}
                  onCancel={() => cancelProposal(i)}
                />
              ),
            )
          )}
          {status ? (
            <div style={{ alignSelf: "flex-start", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)", fontStyle: "italic" }}>
              {status}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border-strong)", paddingTop: "var(--space-3)", background: "var(--surface-page)" }}>
        {error ? (
          <div style={{ ...column, color: "var(--danger)", fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)", paddingBottom: "var(--space-2)" }}>{error}</div>
        ) : null}
        <div style={{ ...column, display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask a question…"
            disabled={busy}
            style={{
              flex: 1, resize: "none", padding: "14px 16px", borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-strong)", background: "var(--surface-raised)",
              fontFamily: "var(--font-body)", fontSize: "var(--text-body)", color: "var(--text-primary)",
              minHeight: 52, maxHeight: 200, boxShadow: "var(--shadow-md)",
            }}
          />
          <Button size="lg" onClick={() => void send()} disabled={busy || input.trim().length === 0}>
            {busy ? "…" : "Send"}
          </Button>
        </div>
        <div style={{ ...column, fontSize: 11.5, color: "var(--text-muted)", fontFamily: "var(--font-body)", paddingTop: 6, paddingBottom: 2 }}>
          The assistant can make mistakes. It only acts on your permitted vineyards, and changes need your confirmation.
        </div>
      </div>
    </div>
  );
}

function updateProposal(items: Item[], index: number, patch: Partial<ProposalItem>): Item[] {
  const next = [...items];
  const target = next[index];
  if (target && target.kind === "proposal") next[index] = { ...target, ...patch };
  return next;
}

function Bubble({ role, content }: { role: Role; content: string }) {
  const isUser = role === "user";
  if (isUser) {
    return (
      <div
        style={{
          alignSelf: "flex-end",
          maxWidth: "85%",
          padding: "10px 16px",
          borderRadius: "var(--radius-lg)",
          background: "var(--accent)",
          color: "var(--accent-on)",
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-body)",
          lineHeight: "var(--leading-normal)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content}
      </div>
    );
  }
  // Assistant: flowing, markdown-rendered text, no bubble (Claude-native).
  return (
    <div
      style={{
        alignSelf: "stretch",
        color: "var(--text-primary)",
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-body)",
        lineHeight: "var(--leading-normal)",
        wordBreak: "break-word",
      }}
    >
      <Markdown text={content} />
    </div>
  );
}

function ProposalCard({ item, onConfirm, onCancel }: { item: ProposalItem; onConfirm: () => void; onCancel: () => void }) {
  const done = item.status === "done";
  const errored = item.status === "error";
  return (
    <div
      style={{
        alignSelf: "stretch",
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface-raised)",
        border: `1px solid ${done ? "var(--positive)" : errored ? "var(--danger)" : "var(--accent)"}`,
        fontFamily: "var(--font-body)",
      }}
    >
      <div style={{ fontSize: "var(--text-body-sm)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 6 }}>
        Confirm change
      </div>
      <div style={{ fontSize: "var(--text-body)", color: "var(--text-primary)", marginBottom: 12 }}>{item.preview}</div>

      {item.status === "pending" || item.status === "applying" ? (
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button onClick={onConfirm} disabled={item.status === "applying"}>
            {item.status === "applying" ? "Applying…" : "Confirm"}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={item.status === "applying"}>
            Cancel
          </Button>
        </div>
      ) : (
        <div style={{ fontSize: "var(--text-body-sm)", color: done ? "var(--positive)" : "var(--danger)" }}>
          {done ? `✓ ${item.result ?? "Applied."}` : item.result ?? "Not applied."}
        </div>
      )}
    </div>
  );
}
