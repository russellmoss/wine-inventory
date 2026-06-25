"use client";

import React from "react";
import { Button } from "@/components/ui";

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

export type SearchResult = {
  id: string;
  title: string;
  updatedAt: string;
  snippet: string;
};

type Props = {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  searching: boolean;
  searchResults: SearchResult[] | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
};

// Render a ts_headline snippet (wraps matches in <mark>…</mark>) into styled
// spans without dangerouslySetInnerHTML — we split on the literal markers.
function Snippet({ text }: { text: string }) {
  const segments: { text: string; mark: boolean }[] = [];
  let mark = false;
  for (const p of text.split(/(<mark>|<\/mark>)/g)) {
    if (p === "<mark>") {
      mark = true;
    } else if (p === "</mark>") {
      mark = false;
    } else if (p) {
      segments.push({ text: p, mark });
    }
  }
  return (
    <>
      {segments.map((s, i) =>
        s.mark ? (
          <mark key={i} style={{ background: "var(--accent-soft)", color: "inherit", padding: "0 1px" }}>
            {s.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  );
}

export function ConversationSidebar({
  conversations,
  activeId,
  loading,
  query,
  onQueryChange,
  searching,
  searchResults,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: Props) {
  const showingSearch = searchResults !== null;

  return (
    <aside
      style={{
        width: 320,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        height: "100%",
        borderRight: "1px solid var(--border-strong)",
        paddingRight: "var(--space-3)",
      }}
    >
      <Button size="sm" onClick={onNew} style={{ width: "100%" }}>
        + New chat
      </Button>

      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search conversations…"
        aria-label="Search conversations"
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-strong)",
          background: "var(--surface-raised)",
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-body-sm)",
          color: "var(--text-primary)",
        }}
      />

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {showingSearch ? (
          <SearchList
            results={searchResults}
            searching={searching}
            activeId={activeId}
            onSelect={onSelect}
          />
        ) : (
          <ConversationList
            conversations={conversations}
            loading={loading}
            activeId={activeId}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
          />
        )}
      </div>
    </aside>
  );
}

function emptyHint(text: string) {
  return (
    <div
      style={{
        color: "var(--text-muted)",
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-body-sm)",
        padding: "var(--space-3) var(--space-2)",
      }}
    >
      {text}
    </div>
  );
}

function SearchList({
  results,
  searching,
  activeId,
  onSelect,
}: {
  results: SearchResult[];
  searching: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (searching && results.length === 0) return emptyHint("Searching…");
  if (results.length === 0) return emptyHint("No matches.");
  return (
    <>
      {results.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onSelect(r.id)}
          style={rowStyle(r.id === activeId)}
        >
          <div style={titleStyle}>{r.title}</div>
          {r.snippet ? (
            <div
              style={{
                fontSize: "var(--text-caption)",
                color: "var(--text-muted)",
                marginTop: 2,
                lineHeight: "var(--leading-snug)",
              }}
            >
              <Snippet text={r.snippet} />
            </div>
          ) : null}
        </button>
      ))}
    </>
  );
}

function ConversationList({
  conversations,
  loading,
  activeId,
  onSelect,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  if (loading && conversations.length === 0) return emptyHint("Loading…");
  if (conversations.length === 0) return emptyHint("No conversations yet.");
  return (
    <>
      {conversations.map((c) => (
        <ConversationRow
          key={c.id}
          conversation={c}
          active={c.id === activeId}
          onSelect={() => onSelect(c.id)}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

function ConversationRow({
  conversation,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: ConversationSummary;
  active: boolean;
  onSelect: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [hover, setHover] = React.useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "relative" }}
    >
      <button type="button" onClick={onSelect} style={rowStyle(active)}>
        <div style={titleStyle}>{conversation.title}</div>
      </button>
      {hover ? (
        <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 2 }}>
          <RowAction
            label="Rename"
            symbol="✎"
            onClick={() => {
              const next = window.prompt("Rename conversation", conversation.title);
              const trimmed = next?.trim();
              if (trimmed && trimmed !== conversation.title) onRename(conversation.id, trimmed);
            }}
          />
          <RowAction
            label="Delete"
            symbol="🗑"
            onClick={() => {
              if (window.confirm("Delete this conversation? This can't be undone.")) {
                onDelete(conversation.id);
              }
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function RowAction({ label, symbol, onClick }: { label: string; symbol: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        fontSize: 12,
        lineHeight: 1,
        padding: "3px 5px",
        color: "var(--text-muted)",
      }}
    >
      {symbol}
    </button>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "var(--text-body-sm)",
  color: "var(--text-primary)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function rowStyle(active: boolean): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "8px 10px",
    paddingRight: 56,
    borderRadius: "var(--radius-md)",
    border: "1px solid transparent",
    background: active ? "var(--accent-soft)" : "transparent",
    cursor: "pointer",
  };
}
