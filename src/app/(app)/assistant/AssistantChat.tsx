"use client";

import React from "react";
import { Button } from "@/components/ui";

type Role = "user" | "assistant";
type ChatMessage = { role: Role; content: string };

type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; phase: "start" | "end"; ok?: boolean }
  | { type: "error"; message: string }
  | { type: "done" };

const TOOL_LABELS: Record<string, string> = {
  query_brix: "Checking Brix readings",
  query_yield: "Checking yields",
  query_vineyard_status: "Checking vineyard status",
  query_audit: "Searching the audit log",
};

export function AssistantChat({ userLabel }: { userLabel: string }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");

    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    // Show the user turn + an empty assistant turn we stream into.
    setMessages([...history, { role: "assistant", content: "" }]);
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
          setStatus(null);
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") next[next.length - 1] = { ...last, content: last.content + evt.text };
            return next;
          });
        } else if (evt.type === "tool") {
          setStatus(evt.phase === "start" ? `${TOOL_LABELS[evt.name] ?? evt.name}…` : "Thinking…");
        } else if (evt.type === "error") {
          setError(evt.message);
        }
      };

      // Parse newline-delimited JSON as it arrives.
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
      // Drop a trailing empty assistant bubble if the model said nothing.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && last.content === "") return prev.slice(0, -1);
        return prev;
      });
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - var(--space-9))", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: "var(--space-4)" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: "var(--text-h2)", margin: 0 }}>Assistant</h1>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)", color: "var(--text-muted)", marginTop: 4 }}>
          Ask about your vineyards in plain language, {userLabel.split("@")[0]}.
        </p>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "var(--space-3)",
          padding: "var(--space-4)", background: "var(--surface-sunken)", borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-strong)",
        }}
      >
        {messages.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)", maxWidth: 420 }}>
            Try: <em>&ldquo;What&rsquo;s the latest Brix for Block 3?&rdquo;</em>
          </div>
        ) : (
          messages.map((m, i) => <Bubble key={i} role={m.role} content={m.content} />)
        )}
        {status ? (
          <div style={{ alignSelf: "flex-start", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)", fontStyle: "italic" }}>
            {status}
          </div>
        ) : null}
      </div>

      {error ? (
        <div style={{ marginTop: "var(--space-2)", color: "var(--danger)", fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)" }}>{error}</div>
      ) : null}

      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", alignItems: "flex-end" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask a question…"
          disabled={busy}
          style={{
            flex: 1, resize: "none", padding: "10px 12px", borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-strong)", background: "var(--surface-raised)",
            fontFamily: "var(--font-body)", fontSize: "var(--text-body)", color: "var(--text-primary)",
            minHeight: 44, maxHeight: 160,
          }}
        />
        <Button onClick={() => void send()} disabled={busy || input.trim().length === 0}>
          {busy ? "…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

function Bubble({ role, content }: { role: Role; content: string }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        padding: "10px 14px",
        borderRadius: "var(--radius-lg)",
        background: isUser ? "var(--accent)" : "var(--surface-raised)",
        color: isUser ? "var(--accent-on)" : "var(--text-primary)",
        border: isUser ? "none" : "1px solid var(--border-strong)",
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
