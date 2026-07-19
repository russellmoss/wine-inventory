"use client";

import React from "react";
import { Card, Badge } from "@/components/ui";
import { setKnowledgeSourceEnabled } from "@/lib/knowledge/actions";
import type { SourceSetting } from "@/lib/knowledge/subscriptions";

export function KnowledgeSourcesCard({ sources }: { sources: SourceSetting[] }) {
  const [state, setState] = React.useState(sources);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function toggle(id: string, next: boolean) {
    setError(null);
    setState((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: next } : s))); // optimistic
    startTransition(async () => {
      try {
        await setKnowledgeSourceEnabled(id, next);
      } catch (e) {
        setState((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !next } : s))); // roll back
        setError(e instanceof Error ? e.message : "Couldn't save that setting.");
      }
    });
  }

  const on = state.filter((s) => s.enabled).length;

  return (
    <Card style={{ maxWidth: 560, marginTop: 16 }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0 }}>Assistant knowledge sources</h2>
      <p style={{ color: "var(--text-secondary)", margin: "6px 0 16px", fontSize: 14.5, maxWidth: "52ch" }}>
        Choose which trusted winemaking &amp; viticulture libraries the assistant may cite when you ask it a
        technical question. Answers link back to the original source. {on} of {state.length} on.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {state.map((s) => (
          <label
            key={s.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 4px",
              borderTop: "1px solid var(--border-subtle)",
              cursor: pending ? "default" : "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={(e) => toggle(s.id, e.target.checked)}
              disabled={pending}
              style={{ width: 18, height: 18, flexShrink: 0 }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 15, color: "var(--text-primary)" }}>{s.publisher}</span>
              <span style={{ display: "block", color: "var(--text-muted)", fontSize: 12.5, marginTop: 1 }}>
                {s.docCount.toLocaleString()} document{s.docCount === 1 ? "" : "s"}
              </span>
            </span>
            <Badge tone={s.tier === 1 ? "neutral" : "gold"}>
              {s.tier === 1 ? "Extension / research" : "Vendor"}
            </Badge>
          </label>
        ))}
      </div>

      {error ? (
        <p aria-live="assertive" style={{ color: "var(--danger)", margin: "12px 0 0", fontSize: 14 }}>
          {error}
        </p>
      ) : null}
    </Card>
  );
}
