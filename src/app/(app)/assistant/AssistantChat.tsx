"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { Markdown } from "./Markdown";
import { type AssistantEvent, parseEvent, isSafeInternalPath } from "@/lib/assistant/assistant-events";
import {
  ConversationSidebar,
  type ConversationSummary,
  type SearchResult,
} from "./ConversationSidebar";
import { messagesToItems } from "@/lib/assistant/history";
import type { Caption } from "./voice/useVoiceSession";

// Voice mode is heavy (Web Audio, MediaRecorder, the visualizer) and only loads
// when the user actually opens it — keep it out of the main chat bundle.
const VoiceOverlay = React.lazy(() =>
  import("./voice/VoiceOverlay").then((m) => ({ default: m.VoiceOverlay })),
);

type Role = "user" | "assistant";

type TextItem = { kind: "text"; role: Role; content: string };
type ProposalItem = {
  kind: "proposal";
  preview: string;
  token: string;
  status: "pending" | "applying" | "done" | "error";
  result?: string;
  // A "View X →" link surfaced after a create/confirm succeeds (Unit 5).
  navigate?: { path: string; label: string };
};
type Item = TextItem | ProposalItem;

type FeedbackState = { mode: "idle" | "form" | "sent"; rating?: "up" | "down" };

// A pending auto-navigation showing a short cancellable countdown before push.
type NavPending = { path: string; label: string };

// Dirty-form guard (forward seam): a page form with unsaved edits opts in by
// setting [data-unsaved="true"] on any element; auto-nav then downgrades to a
// link instead of yanking the user out of unsaved work. NOTE: no form sets this
// attribute yet, so today the ACTIVE protection is the 3-second countdown +
// Cancel (NavToast). TODO(plan-042 PR-B): wire the field-report editor, template
// spec builder, and inventory-adjust forms to set data-unsaved while dirty.
function pageHasUnsavedChanges(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector('[data-unsaved="true"]') !== null;
}

// Readable conversation column width (Claude-native centered column).
const CONTENT_MAX = 1040;

const TOOL_LABELS: Record<string, string> = {
  query_brix: "Checking Brix readings",
  query_yield: "Checking yields",
  query_recent_harvests: "Checking recent harvests",
  query_vineyard_status: "Checking vineyard status",
  query_field_reports: "Reading manager reports",
  get_field_report_form: "Opening the report",
  save_field_report: "Preparing report changes",
  query_audit: "Searching the audit log",
  log_brix: "Preparing Brix entry",
  delete_brix: "Finding the reading to delete",
  set_yield_estimate: "Preparing yield estimate",
  log_harvest_pick: "Preparing the weigh-in",
  adjust_inventory: "Preparing inventory adjustment",
  rack_wine: "Preparing the transfer",
  revert_transfer: "Reverting the rack",
  query_transfers: "Checking recent rackings",
  navigate: "Finding the page",
  list_templates: "Listing templates",
  get_template: "Reading the template",
  create_template: "Drafting the template",
  update_template_spec: "Preparing template changes",
  clone_template: "Cloning the template",
  archive_template: "Preparing to archive",
};

export function AssistantChat({ userLabel, voiceEnabled = false, embedded = false }: { userLabel: string; voiceEnabled?: boolean; embedded?: boolean }) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [input, setInput] = React.useState("");
  const [voiceOpen, setVoiceOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<Record<number, FeedbackState>>({});
  const [navPending, setNavPending] = React.useState<NavPending | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Append a clickable in-app link as its own assistant line (used when we
  // choose NOT to auto-navigate: incidental mention, unsaved-work downgrade, or
  // the server judged the ask non-explicit).
  const appendLink = React.useCallback((label: string, path: string) => {
    setItems((prev) => [...prev, { kind: "text", role: "assistant", content: `[${label}](${path})` }]);
  }, []);

  // Decide how to act on a navigate event: explicit + safe + no unsaved work =>
  // show the cancellable countdown, then push. Otherwise degrade to a link.
  const requestNavigation = React.useCallback(
    (path: string, label: string, auto: boolean) => {
      if (!isSafeInternalPath(path)) return;
      if (auto && !pageHasUnsavedChanges()) {
        setNavPending({ path, label });
      } else if (auto) {
        appendLink(`You have unsaved changes — open ${label} when ready`, path);
      } else {
        appendLink(label, path);
      }
    },
    [appendLink],
  );

  // Countdown → push. Focus the destination heading for screen-reader users.
  React.useEffect(() => {
    if (!navPending) return;
    const target = navPending.path;
    const handle = setTimeout(() => {
      setNavPending(null);
      router.push(target);
      setTimeout(() => {
        (document.querySelector("main h1, main h2") as HTMLElement | null)?.focus?.();
      }, 150);
    }, 3000);
    return () => clearTimeout(handle);
  }, [navPending, router]);

  // Conversation persistence: the active conversation, the sidebar list, and
  // cross-conversation search state.
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<SearchResult[] | null>(null);
  const [searching, setSearching] = React.useState(false);

  // Note: no synchronous setState here — the first state update happens after the
  // await, so this stays clear of react-hooks/set-state-in-effect.
  const refreshList = React.useCallback(async () => {
    try {
      const res = await fetch("/api/assistant/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
      }
    } catch {
      /* best-effort */
    } finally {
      setListLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const handle = setTimeout(() => void refreshList(), 0);
    return () => clearTimeout(handle);
  }, [refreshList]);

  // Debounced cross-conversation search. Empty query => show the list (null).
  // All setState lives inside the timeout callback (not the effect body).
  React.useEffect(() => {
    const q = query.trim();
    const handle = setTimeout(async () => {
      if (!q) {
        setSearchResults(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const res = await fetch(`/api/assistant/conversations/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(Array.isArray(data?.results) ? data.results : []);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, q ? 250 : 0);
    return () => clearTimeout(handle);
  }, [query]);

  function startNewChat() {
    setItems([]);
    setConversationId(null);
    setFeedback({});
    setError(null);
    setStatus(null);
    setQuery("");
    setSearchResults(null);
  }

  async function openConversation(id: string) {
    if (busy) return;
    setError(null);
    try {
      const res = await fetch(`/api/assistant/conversations/${id}`);
      if (!res.ok) throw new Error("Could not load that conversation.");
      const data = await res.json();
      setItems(messagesToItems(data?.messages ?? []));
      setConversationId(id);
      setFeedback({});
      setQuery("");
      setSearchResults(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load that conversation.");
    }
  }

  async function renameConversation(id: string, title: string) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    try {
      await fetch(`/api/assistant/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } catch {
      void refreshList();
    }
  }

  async function deleteConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === conversationId) startNewChat();
    try {
      await fetch(`/api/assistant/conversations/${id}`, { method: "DELETE" });
    } finally {
      void refreshList();
    }
  }

  function setFb(i: number, patch: Partial<FeedbackState>) {
    setFeedback((prev) => {
      const current: FeedbackState = prev[i] ?? { mode: "idle" };
      return { ...prev, [i]: { ...current, ...patch } };
    });
  }

  async function sendFeedback(i: number, rating: "up" | "down", comment?: string) {
    setFb(i, { mode: "sent", rating });
    const transcript = items
      .filter((it): it is TextItem => it.kind === "text")
      .map((it) => ({ role: it.role, content: it.content }));
    try {
      await fetch("/api/assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment, messages: transcript }),
      });
    } catch {
      /* best-effort; don't disrupt the chat */
    }
  }

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

  // Voice mode produces the same kind of turns the text chat does; mirror each
  // completed turn into the transcript so the conversation is continuous across
  // modes (and gets persisted by the same /api/assistant flow voice reuses).
  const addVoiceTurn = React.useCallback((turn: Caption) => {
    setItems((prev) => [...prev, { kind: "text", role: turn.role, content: turn.content }]);
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    setNavPending(null); // a new turn cancels any in-flight auto-nav countdown

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
        body: JSON.stringify({ messages: history, conversationId }),
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
        } else if (evt.type === "navigate") {
          setStatus(null);
          requestNavigation(evt.path, evt.label, evt.auto);
        } else if (evt.type === "conversation") {
          setConversationId(evt.id);
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
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          const evt = parseEvent(line);
          if (evt) handle(evt);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setStatus(null);
      // Reflect the new/updated conversation (title, order) in the sidebar.
      void refreshList();
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
        const nav =
          data.navigate && isSafeInternalPath(data.navigate.path) && typeof data.navigate.label === "string"
            ? { path: data.navigate.path as string, label: data.navigate.label as string }
            : undefined;
        setItems((prev) => updateProposal(prev, index, { status: "done", result: data.message, navigate: nav }));
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
    // Embedded (the dock): fill the parent panel + drop the page-sized sidebar/header. Page: full viewport.
    <div style={{ display: "flex", flexDirection: "row", gap: "var(--space-4)", height: embedded ? "100%" : "calc(100vh - 7rem)", minHeight: embedded ? 0 : 420 }}>
      {!embedded ? (
        <ConversationSidebar
          conversations={conversations}
          activeId={conversationId}
          loading={listLoading}
          query={query}
          onQueryChange={setQuery}
          searching={searching}
          searchResults={searchResults}
          onSelect={(id) => void openConversation(id)}
          onNew={startNewChat}
          onRename={(id, title) => void renameConversation(id, title)}
          onDelete={(id) => void deleteConversation(id)}
        />
      ) : null}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      {!embedded ? (
        <div style={{ ...column, paddingBottom: "var(--space-3)" }}>
          <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: "var(--text-h2)", margin: 0 }}>Assistant</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)", color: "var(--text-muted)", marginTop: 4 }}>
            Ask about your vineyards in plain language, {userLabel.split("@")[0]}.
          </p>
        </div>
      ) : null}

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ ...column, display: "flex", flexDirection: "column", gap: "var(--space-5)", padding: "var(--space-4) 0 var(--space-6)" }}>
          {items.length === 0 ? (
            <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "var(--text-body)", maxWidth: 460, paddingTop: "var(--space-8)" }}>
              Try: <em>&ldquo;What&rsquo;s the latest Brix for Block 3?&rdquo;</em> or <em>&ldquo;Log 22.4 Brix for Block 3.&rdquo;</em>
            </div>
          ) : (
            items.map((it, i) => {
              if (it.kind === "proposal") {
                return (
                  <ProposalCard
                    key={i}
                    item={it}
                    onConfirm={() => void confirmProposal(i)}
                    onCancel={() => cancelProposal(i)}
                  />
                );
              }
              if (it.role === "user") return <Bubble key={i} role="user" content={it.content} />;
              const streaming = busy && i === items.length - 1;
              return (
                <div key={i} style={{ alignSelf: "stretch" }}>
                  <Bubble role="assistant" content={it.content} />
                  {it.content && !streaming ? (
                    <FeedbackBar
                      state={feedback[i] ?? { mode: "idle" }}
                      onUp={() => void sendFeedback(i, "up")}
                      onAskDown={() => setFb(i, { mode: "form" })}
                      onSubmitDown={(comment) => void sendFeedback(i, "down", comment)}
                      onCancel={() => setFb(i, { mode: "idle" })}
                    />
                  ) : null}
                </div>
              );
            })
          )}
          {status ? (
            <div style={{ alignSelf: "flex-start", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)", fontStyle: "italic" }}>
              {status}
            </div>
          ) : null}
        </div>
      </div>

      {navPending ? (
        <div style={{ ...column, paddingBottom: "var(--space-2)" }}>
          <NavToast label={navPending.label} onCancel={() => setNavPending(null)} />
        </div>
      ) : null}

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
          {voiceEnabled ? (
            <Button
              size="lg"
              variant="secondary"
              onClick={() => setVoiceOpen(true)}
              disabled={busy}
              title="Talk to the assistant"
              aria-label="Talk to the assistant"
            >
              🎙 Talk
            </Button>
          ) : null}
          <Button size="lg" onClick={() => void send()} disabled={busy || input.trim().length === 0}>
            {busy ? "…" : "Send"}
          </Button>
        </div>
        <div style={{ ...column, fontSize: 11.5, color: "var(--text-muted)", fontFamily: "var(--font-body)", paddingTop: 6, paddingBottom: 2 }}>
          The assistant can make mistakes. It only acts on your permitted vineyards, and changes need your confirmation.
        </div>
      </div>
      </div>

      {voiceOpen ? (
        <React.Suspense fallback={null}>
          <VoiceOverlay
            initialHistory={items
              .filter((it): it is TextItem => it.kind === "text")
              .map((it) => ({ role: it.role, content: it.content }))}
            conversationId={conversationId}
            onConversationId={setConversationId}
            onTurn={addVoiceTurn}
            onClose={() => {
              setVoiceOpen(false);
              void refreshList();
            }}
          />
        </React.Suspense>
      ) : null}
    </div>
  );
}

// Cancellable auto-navigation countdown. aria-live=assertive announces the
// impending move before it happens (screen-reader users aren't teleported
// silently); the Cancel button is the safety valve for a misread intent.
function NavToast({ label, onCancel }: { label: string; onCancel: () => void }) {
  return (
    <div
      role="status"
      aria-live="assertive"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        padding: "10px 14px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--accent)",
        background: "var(--surface-raised)",
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-body-sm)",
        color: "var(--text-primary)",
        transition: "opacity var(--duration-normal, 220ms) var(--ease-standard, ease)",
      }}
    >
      <span>Taking you to {label}…</span>
      <Button size="sm" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function updateProposal(items: Item[], index: number, patch: Partial<ProposalItem>): Item[] {
  const next = [...items];
  const target = next[index];
  if (target && target.kind === "proposal") next[index] = { ...target, ...patch };
  return next;
}

function FeedbackBar({
  state,
  onUp,
  onAskDown,
  onSubmitDown,
  onCancel,
}: {
  state: FeedbackState;
  onUp: () => void;
  onAskDown: () => void;
  onSubmitDown: (comment: string) => void;
  onCancel: () => void;
}) {
  const [comment, setComment] = React.useState("");

  if (state.mode === "sent") {
    return (
      <div style={{ marginTop: 6, fontSize: "var(--text-body-sm)", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
        {state.rating === "down" ? "Thanks — logged. We'll use this to improve the assistant." : "Thanks for the feedback."}
      </div>
    );
  }

  const iconBtn: React.CSSProperties = {
    background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: "var(--radius-md)",
    fontSize: 15, lineHeight: 1, color: "var(--text-muted)",
  };

  return (
    <div style={{ marginTop: 6, fontFamily: "var(--font-body)" }}>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <button type="button" style={iconBtn} title="Helpful" aria-label="Helpful" onClick={onUp}>👍</button>
        <button type="button" style={iconBtn} title="Not helpful" aria-label="Not helpful" onClick={onAskDown}>👎</button>
      </div>
      {state.mode === "form" ? (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, maxWidth: 520 }}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="What was wrong? (this helps us fix it)"
            autoFocus
            style={{
              resize: "none", padding: "8px 10px", borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-strong)", background: "var(--surface-raised)",
              fontFamily: "var(--font-body)", fontSize: "var(--text-body-sm)", color: "var(--text-primary)",
            }}
          />
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button size="sm" onClick={() => onSubmitDown(comment.trim())} disabled={comment.trim().length === 0}>
              Submit
            </Button>
            <Button size="sm" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
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
          {done && item.navigate ? (
            <div style={{ marginTop: 8 }}>
              <Markdown text={`[View ${item.navigate.label} →](${item.navigate.path})`} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
