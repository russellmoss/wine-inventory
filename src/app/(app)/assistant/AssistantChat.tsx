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
import { useDictation } from "./voice/useDictation";
import { FeedbackTicketModal } from "./FeedbackTicketModal";

type VoiceMode = "converse" | "transcribe";

// Voice mode is heavy (Web Audio, MediaRecorder, the visualizer) and only loads
// when the user actually opens it — keep it out of the main chat bundle.
const VoiceOverlay = React.lazy(() =>
  import("./voice/VoiceOverlay").then((m) => ({ default: m.VoiceOverlay })),
);

type Role = "user" | "assistant";

type TextItem = { kind: "text"; id?: string; role: Role; content: string };
type ProposalItem = {
  kind: "proposal";
  preview: string;
  token: string;
  details?: WorkOrderProposalCardDetails;
  status: "pending" | "applying" | "done" | "error";
  result?: string;
  // A "View X →" link surfaced after a create/confirm succeeds (Unit 5).
  navigate?: { path: string; label: string };
};
// A clickable disambiguation picker (tool couldn't resolve a name to one record). `resume` is the
// deterministic path (POST a signed token → tool re-runs pinned by id → confirm card); `send` is a
// legacy chat-message fallback.
type ChoiceOpt = { label: string; sublabel?: string; resume?: string; send?: string };
type ChoiceItem = { kind: "choice"; prompt: string; options: ChoiceOpt[]; chosen?: string };
type Item = TextItem | ProposalItem | ChoiceItem;

type WorkOrderProposalCardDetails = {
  title?: string;
  status?: string;
  tasks?: { seq: number; title: string; summary: string; entities?: { role: string; label: string }[]; members?: { id: string; label: string; detail?: string }[] }[];
  warnings?: { severity: "blocking" | "confirmable" | "completion_check"; code: string; message: string }[];
  unresolved?: { label: string; reason: string }[];
  cost?: {
    totalKnownCost: number | null;
    hasUnknownCost: boolean;
    currency: string | null;
    lines: { taskSeq: number; materialLabel: string; qty: number | null; unit: string | null; estimatedCost: number | null; method: string; reason?: string }[];
  };
  diff?: { rows: { kind: string; label: string; before: string; after: string }[] };
};

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

// Dock-only: remember which conversation the widget was showing so a reload reopens it.
// Server persistence is durable; this is just the pointer. Mirrors the assistant.voiceMode pref.
const DOCK_CONV_KEY = "assistant.dock.conversationId";

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
  create_material: "Preparing the new material",
  receive_supply: "Preparing the stock receipt",
  set_material_active: "Preparing the catalog change",
  pull_sample: "Preparing the sample",
  record_sample_results: "Preparing the lab results",
  manage_sample: "Preparing the sample update",
  remove_bulk_wine: "Preparing the removal",
  remove_bottled_wine: "Preparing the bottled removal",
  sparkling_tirage: "Preparing the tirage",
  log_riddling: "Preparing the riddling log",
  sparkling_disgorge: "Preparing the disgorgement",
  record_bulk_wine_cost: "Preparing the cost entry",
  rack_wine: "Preparing the transfer",
  add_addition: "Preparing the addition",
  record_measurement: "Preparing the lab panel",
  record_tasting_note: "Preparing the tasting note",
  create_work_order: "Preparing the work order",
  complete_task: "Preparing to complete the task",
  review_task: "Preparing the review",
  manage_work_order: "Preparing the work-order change",
  top_up: "Preparing the top-up",
  filter_vessel: "Preparing the filtration",
  log_cap_management: "Preparing the cap-management log",
  blend_lots: "Preparing the blend",
  transition_lot_state: "Preparing the ferment update",
  undo_operation: "Finding the operation to reverse",
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

export function AssistantChat({ userLabel, voiceEnabled = false, embedded = false, active = true }: { userLabel: string; voiceEnabled?: boolean; embedded?: boolean; active?: boolean }) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [input, setInput] = React.useState("");
  const [voiceOpen, setVoiceOpen] = React.useState(false);
  const [voiceMode, setVoiceMode] = React.useState<VoiceMode>("converse");
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<Record<number, FeedbackState>>({});
  const [ticketOpen, setTicketOpen] = React.useState(false);
  const [navPending, setNavPending] = React.useState<NavPending | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();

  // When embedded in the dock, the chat stays mounted (display:none) after the dock collapses so its
  // history survives. `active` is false while the dock is closed — force any live voice session shut so
  // the mic/audio loop can't keep running invisibly. The overlay stops its session on unmount. Handled
  // during render (React's sanctioned adjust-state-on-prop-change pattern) to avoid a setState-in-effect.
  const [prevActive, setPrevActive] = React.useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    if (!active) setVoiceOpen(false);
  }

  // Dictation ("Transcribe" mode): record → transcribe → drop the text into the input box for
  // review/edit, rather than the hands-free Converse loop. Append to whatever's already typed.
  const appendDictation = React.useCallback((text: string) => {
    setInput((prev) => (prev.trim() ? `${prev.replace(/\s*$/, "")} ${text}` : text));
  }, []);
  const dictation = useDictation(appendDictation);

  // Remember the last-picked mic mode across sessions. Hydrate AFTER mount (not via a lazy
  // useState initializer) because this is an SSR'd client component: reading localStorage during
  // render would either crash on the server or cause a hydration mismatch. Post-mount read is the
  // sanctioned external-system sync here.
  React.useEffect(() => {
    const saved = localStorage.getItem("assistant.voiceMode");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration of a persisted UI pref
    if (saved === "transcribe" || saved === "converse") setVoiceMode(saved);
  }, []);
  const pickVoiceMode = React.useCallback((m: VoiceMode) => {
    setVoiceMode(m);
    try {
      localStorage.setItem("assistant.voiceMode", m);
    } catch {
      /* private mode / storage disabled — mode just won't persist */
    }
  }, []);

  // Dock collapse (active=false) must also abort any in-flight dictation and free the mic —
  // this is external-system teardown, so it belongs in an effect (unlike the pure voiceOpen reset).
  React.useEffect(() => {
    if (!active) dictation.cancel();
  }, [active, dictation]);

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
  // Dock-only: the history takeover panel. The narrow dock has no room for the page's
  // side-by-side rail, so History is a full-panel overlay toggled on/off (embedded only).
  const [historyOpen, setHistoryOpen] = React.useState(false);

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

  // Dock persistence: reopen the last conversation on reload (embedded only). One-shot,
  // post-mount (never a lazy useState initializer — SSR/hydration), and only from a clean
  // start so we never clobber an in-progress chat. Runs BEFORE the write effect below so it
  // captures the stored id before that effect can clear it. A stale id fails silently.
  const restoredRef = React.useRef(false);
  React.useEffect(() => {
    if (!embedded || restoredRef.current) return;
    restoredRef.current = true;
    if (items.length > 0 || conversationId !== null) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(DOCK_CONV_KEY);
    } catch {
      saved = null;
    }
    if (saved) void openConversation(saved, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot hydration; deliberately mount-only
  }, [embedded]);

  // Persist the active conversation pointer (embedded only). Clearing on null means
  // "New chat" won't be re-opened on reload — but NOT on the initial mount pass, where
  // conversationId is null before the restore above has a chance to resolve. Skipping the
  // first run keeps the stored id intact until a real transition-to-null (startNewChat).
  const writeInitedRef = React.useRef(false);
  React.useEffect(() => {
    if (!embedded) return;
    try {
      if (conversationId) localStorage.setItem(DOCK_CONV_KEY, conversationId);
      else if (writeInitedRef.current) localStorage.removeItem(DOCK_CONV_KEY);
    } catch {
      /* private mode / storage disabled — just won't persist */
    }
    writeInitedRef.current = true;
  }, [embedded, conversationId]);

  function startNewChat() {
    // Never reset mid-stream: the in-flight send loop would append its tail into the
    // fresh chat and persist the old conversation's id.
    if (busy) return;
    setItems([]);
    setConversationId(null);
    setFeedback({});
    setError(null);
    setStatus(null);
    setQuery("");
    setSearchResults(null);
  }

  // Dock history controls. Opening the panel refreshes the list so it reflects
  // conversations created since mount. Selecting/new closes any live voice session
  // first — swapping items/conversationId under an open voice loop would desync it.
  function openHistory() {
    setHistoryOpen(true);
    void refreshList();
  }
  function selectFromHistory(id: string) {
    // Don't close the panel on a no-op: openConversation/startNewChat bail while a
    // response is streaming, which would silently strand the user on the old chat.
    if (busy) return;
    setVoiceOpen(false);
    setHistoryOpen(false);
    void openConversation(id);
  }
  function newFromHistory() {
    if (busy) return;
    setVoiceOpen(false);
    setHistoryOpen(false);
    startNewChat();
  }

  async function openConversation(id: string, opts?: { silent?: boolean }) {
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
      // Silent restore of a stale/deleted stored id: drop it and stay on a fresh chat,
      // no error banner. Explicit user selection still surfaces the failure.
      if (opts?.silent) {
        try {
          localStorage.removeItem(DOCK_CONV_KEY);
        } catch {
          /* storage disabled */
        }
        return;
      }
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
    const rated = items[i];
    const transcript = items
      .filter((it): it is TextItem => it.kind === "text")
      .map((it) => ({ role: it.role, content: it.content }));
    try {
      await fetch("/api/assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          comment,
          conversationId,
          ratedMessageId: rated?.kind === "text" && rated.role === "assistant" ? rated.id : undefined,
          messages: transcript,
        }),
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

  function attachMessageId(role: Role, id: string) {
    setItems((prev) => {
      const next = [...prev];
      for (let j = next.length - 1; j >= 0; j--) {
        const it = next[j];
        if (it.kind === "text" && it.role === role && !it.id) {
          next[j] = { ...it, id };
          return next;
        }
      }
      return prev;
    });
  }

  // Voice mode produces the same kind of turns the text chat does; mirror each
  // completed turn into the transcript so the conversation is continuous across
  // modes (and gets persisted by the same /api/assistant flow voice reuses).
  const addVoiceTurn = React.useCallback((turn: Caption) => {
    setItems((prev) => [...prev, { kind: "text", role: turn.role, content: turn.content }]);
  }, []);

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    setError(null);
    if (override === undefined) setInput("");
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
          setItems((prev) => [...prev, { kind: "proposal", preview: evt.preview, token: evt.token, details: asWorkOrderProposalDetails(evt.details), status: "pending" }]);
        } else if (evt.type === "choice") {
          setStatus(null);
          setItems((prev) => [...prev, { kind: "choice", prompt: evt.prompt, options: evt.options }]);
        } else if (evt.type === "navigate") {
          setStatus(null);
          requestNavigation(evt.path, evt.label, evt.auto);
        } else if (evt.type === "conversation") {
          setConversationId(evt.id);
        } else if (evt.type === "message") {
          attachMessageId(evt.role, evt.id);
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
        // A committed write invalidates the server caches (revalidatePath in the committer), but the
        // user's client Router Cache is untouched because this wasn't a component-bound server action.
        // Without this, a freshly created/updated record (e.g. an issued work order) won't appear on an
        // already-open or client-cached list until a hard browser refresh. router.refresh() clears the
        // client cache and refetches the current route with fresh server data (client state preserved).
        router.refresh();
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

  // Tap a disambiguation option → lock the card, then resolve it DETERMINISTICALLY: POST the signed
  // resume token so the tool re-runs pinned by id and returns a confirm card (no model round-trip, so an
  // identical-name pick always lands on the exact record). `send` is a legacy fallback.
  async function chooseOption(index: number, opt: ChoiceOpt) {
    const target = items[index];
    if (!target || target.kind !== "choice" || target.chosen || busy) return;
    setItems((prev) => {
      const next = [...prev];
      const t = next[index];
      if (t && t.kind === "choice") next[index] = { ...t, chosen: opt.label };
      return next;
    });
    if (opt.resume) {
      setStatus("Preparing…");
      try {
        const res = await fetch("/api/assistant/resolve-choice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: opt.resume }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.ok) {
          setItems((prev) => [...prev, { kind: "proposal", preview: data.preview, token: data.token, details: asWorkOrderProposalDetails(data.details), status: "pending" }]);
        } else {
          setError(data?.error ?? "Couldn't prepare that selection.");
        }
      } catch {
        setError("Network error preparing that selection.");
      } finally {
        setStatus(null);
      }
      return;
    }
    if (opt.send) void send(opt.send);
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

      {embedded ? (
        <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: "var(--space-2)", flex: "none" }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => (historyOpen ? setHistoryOpen(false) : openHistory())}
            aria-expanded={historyOpen}
            aria-controls="dock-history-panel"
            title={historyOpen ? "Back to the chat" : "Conversation history"}
          >
            {historyOpen ? "← Back to chat" : "☰ History"}
          </Button>
        </div>
      ) : null}

      {embedded && historyOpen ? (
        <div id="dock-history-panel" role="region" aria-label="Conversation history" style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <ConversationSidebar
            variant="panel"
            conversations={conversations}
            activeId={conversationId}
            loading={listLoading}
            query={query}
            onQueryChange={setQuery}
            searching={searching}
            searchResults={searchResults}
            onSelect={selectFromHistory}
            onNew={newFromHistory}
            onRename={(id, title) => void renameConversation(id, title)}
            onDelete={(id) => void deleteConversation(id)}
          />
        </div>
      ) : (
      <>
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
              if (it.kind === "choice") {
                return <ChoiceCard key={i} item={it} disabled={busy} onPick={(opt) => void chooseOption(i, opt)} />;
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
        <div
          style={{
            ...column,
            display: "flex",
            flexDirection: embedded ? "column" : "row",
            gap: "var(--space-2)",
            alignItems: embedded ? "stretch" : "flex-end",
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask a question…"
            disabled={busy}
            style={{
              flex: embedded ? "0 0 auto" : 1,
              width: embedded ? "100%" : undefined,
              resize: "none", padding: "14px 16px", borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-strong)", background: "var(--surface-raised)",
              fontFamily: "var(--font-body)", fontSize: "var(--text-body)", color: "var(--text-primary)",
              minHeight: embedded ? 76 : 52, maxHeight: 200, boxShadow: "var(--shadow-md)",
            }}
          />
          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              justifyContent: embedded ? "flex-end" : "flex-start",
              flexWrap: "wrap",
            }}
          >
          {voiceEnabled ? (
            voiceMode === "transcribe" ? (
              <Button
                size="lg"
                variant={dictation.state === "recording" ? "primary" : "secondary"}
                onClick={() => {
                  if (dictation.state === "recording") dictation.stop();
                  else if (dictation.state === "idle") void dictation.start();
                }}
                disabled={busy || dictation.state === "transcribing"}
                title="Dictate into the message box"
                aria-label={dictation.state === "recording" ? "Stop dictation" : "Start dictation"}
              >
                {dictation.state === "recording" ? "⏹ Stop" : dictation.state === "transcribing" ? "…" : "🎙 Talk"}
              </Button>
            ) : (
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
            )
          ) : null}
          <Button size="lg" variant="secondary" onClick={() => setTicketOpen(true)} disabled={busy}>
            Report bug
          </Button>
          <Button size="lg" onClick={() => void send()} disabled={busy || input.trim().length === 0}>
            {busy ? "…" : "Send"}
          </Button>
          </div>
        </div>
        {voiceEnabled ? (
          <div style={{ ...column, display: "flex", alignItems: "center", gap: "var(--space-2)", paddingTop: 8, flexWrap: "wrap" }}>
            <div
              role="group"
              aria-label="Microphone mode"
              style={{ display: "inline-flex", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-pill)", overflow: "hidden" }}
            >
              {(["converse", "transcribe"] as const).map((m) => {
                const selected = voiceMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => pickVoiceMode(m)}
                    aria-pressed={selected}
                    disabled={dictation.state !== "idle" || voiceOpen}
                    title={m === "converse" ? "Talk back-and-forth out loud" : "Dictate into the message box"}
                    style={{
                      padding: "4px 12px",
                      border: "none",
                      cursor: dictation.state !== "idle" || voiceOpen ? "default" : "pointer",
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      background: selected ? "var(--accent)" : "transparent",
                      color: selected ? "var(--accent-on)" : "var(--text-muted)",
                    }}
                  >
                    {m === "converse" ? "💬 Converse" : "✍️ Transcribe"}
                  </button>
                );
              })}
            </div>
            {dictation.error ? (
              <span style={{ fontSize: 11.5, color: "var(--danger)", fontFamily: "var(--font-body)" }}>{dictation.error}</span>
            ) : dictation.state === "recording" ? (
              <span style={{ fontSize: 11.5, color: "var(--accent)", fontFamily: "var(--font-body)" }}>● Listening… tap Stop when done</span>
            ) : dictation.state === "transcribing" ? (
              <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Transcribing…</span>
            ) : (
              <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                {voiceMode === "converse" ? "Talk = voice conversation" : "Talk = dictate into the box"}
              </span>
            )}
          </div>
        ) : null}
        <div style={{ ...column, fontSize: 11.5, color: "var(--text-muted)", fontFamily: "var(--font-body)", paddingTop: 6, paddingBottom: 2 }}>
          The assistant can make mistakes. It only acts on your permitted vineyards, and changes need your confirmation.
        </div>
      </div>
      </>
      )}
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
      <FeedbackTicketModal open={ticketOpen} onClose={() => setTicketOpen(false)} />
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

function asWorkOrderProposalDetails(value: unknown): WorkOrderProposalCardDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as WorkOrderProposalCardDetails;
  if (!Array.isArray(v.tasks) || !Array.isArray(v.warnings) || !v.cost || !v.diff) return undefined;
  return v;
}

function money(amount: number | null, currency: string | null | undefined): string {
  if (amount == null) return "UNKNOWN";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(amount);
  } catch {
    return `${currency || "USD"} ${amount.toFixed(2)}`;
  }
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

function ChoiceCard({ item, disabled, onPick }: { item: ChoiceItem; disabled: boolean; onPick: (opt: ChoiceOpt) => void }) {
  const locked = Boolean(item.chosen);
  return (
    <div
      style={{
        alignSelf: "stretch",
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface-raised)",
        border: `1px solid ${locked ? "var(--positive)" : "var(--accent)"}`,
        fontFamily: "var(--font-body)",
      }}
    >
      <div style={{ fontSize: "var(--text-body-sm)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 6 }}>
        Which one?
      </div>
      <div style={{ fontSize: "var(--text-body)", color: "var(--text-primary)", marginBottom: 12 }}>{item.prompt}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {item.options.map((opt, k) => {
          const isChosen = item.chosen === opt.label;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={isChosen}
              onClick={() => onPick(opt)}
              disabled={disabled || locked}
              style={{
                textAlign: "left",
                minHeight: 44,
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-md)",
                border: `1px solid ${isChosen ? "var(--positive)" : "var(--border)"}`,
                background: isChosen ? "var(--positive-soft, var(--surface-sunken))" : "var(--surface)",
                color: "var(--text-primary)",
                cursor: disabled || locked ? "default" : "pointer",
                opacity: locked && !isChosen ? 0.5 : 1,
                fontFamily: "var(--font-body)",
              }}
            >
              <div style={{ fontSize: "var(--text-body)", fontWeight: 500 }}>
                {isChosen ? "✓ " : ""}
                {opt.label}
              </div>
              {opt.sublabel ? (
                <div style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)", marginTop: 2 }}>{opt.sublabel}</div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProposalCard({ item, onConfirm, onCancel }: { item: ProposalItem; onConfirm: () => void; onCancel: () => void }) {
  const done = item.status === "done";
  const errored = item.status === "error";
  const details = item.details;
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

      {details ? <WorkOrderProposalDetails details={details} /> : null}

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

function WorkOrderProposalDetails({ details }: { details: WorkOrderProposalCardDetails }) {
  const warnings = details.warnings ?? [];
  const blocking = warnings.filter((w) => w.severity === "blocking");
  const confirmable = warnings.filter((w) => w.severity === "confirmable");
  const completion = warnings.filter((w) => w.severity === "completion_check");
  const cost = details.cost;
  return (
    <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {(details.tasks ?? []).map((task) => (
          <div
            key={task.seq}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-2) var(--space-3)",
              background: "var(--surface)",
            }}
          >
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "baseline", flexWrap: "wrap" }}>
              <strong style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)" }}>#{task.seq}</strong>
              <span style={{ fontSize: "var(--text-body)", color: "var(--text-primary)", fontWeight: 600 }}>{task.title}</span>
            </div>
            <div style={{ marginTop: 2, fontSize: "var(--text-body-sm)", color: "var(--text-muted)" }}>{task.summary}</div>
            {task.entities?.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {task.entities.map((entity, i) => (
                  <span
                    key={`${entity.role}-${i}`}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-pill)",
                      padding: "2px 8px",
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    {entity.role}: {entity.label}
                  </span>
                ))}
              </div>
            ) : null}
            {/* Phase 9.4a: a group-rack task stays ONE row; its members collapse behind an expander. */}
            {task.members?.length ? (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: "var(--text-body-sm)", color: "var(--text-muted)" }}>
                  {task.members.length} {task.members.length === 1 ? "vessel" : "vessels"}
                </summary>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--text-muted)" }}>
                  {task.members.map((m) => (
                    <li key={m.id}>
                      {m.label}
                      {m.detail ? ` — ${m.detail}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ))}
      </div>

      {details.unresolved?.length ? (
        <div style={{ borderLeft: "3px solid var(--danger)", paddingLeft: "var(--space-3)" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Needs input</div>
          {details.unresolved.map((u, i) => (
            <div key={i} style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)" }}>
              {u.label}: {u.reason}
            </div>
          ))}
        </div>
      ) : null}

      {warnings.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <WarningGroup title="Blocks creation" warnings={blocking} tone="var(--danger)" />
          <WarningGroup title="Confirm with warning" warnings={confirmable} tone="var(--warning, #a66a00)" />
          <WarningGroup title="Checked at completion" warnings={completion} tone="var(--text-muted)" />
        </div>
      ) : null}

      {cost ? (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Supply estimate</div>
          <div style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)" }}>
            Total: {money(cost.totalKnownCost, cost.currency)}
            {cost.hasUnknownCost ? " (some costs unknown)" : ""}
          </div>
          {cost.lines?.map((line, i) => (
            <div key={i} style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)" }}>
              Task #{line.taskSeq}: {line.materialLabel} - {line.qty == null ? "UNKNOWN" : `${line.qty} ${line.unit ?? ""}`} - {money(line.estimatedCost, cost.currency)}
            </div>
          ))}
        </div>
      ) : null}

      {details.diff?.rows?.length ? (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Planned diff</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
            {details.diff.rows.map((row, i) => (
              <div key={i} style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)" }}>
                {row.label}: {row.before} to {row.after}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function WarningGroup({ title, warnings, tone }: { title: string; warnings: NonNullable<WorkOrderProposalCardDetails["warnings"]>; tone: string }) {
  if (warnings.length === 0) return null;
  return (
    <div style={{ borderLeft: `3px solid ${tone}`, paddingLeft: "var(--space-3)" }}>
      <div style={{ fontWeight: 600, color: tone }}>{title}</div>
      {warnings.map((warning) => (
        <div key={`${warning.code}-${warning.message}`} style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)" }}>
          {warning.message}
        </div>
      ))}
    </div>
  );
}
