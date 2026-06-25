"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import { type ParsedFieldNote } from "@/lib/fieldnotes/types";
import { parseBriefing } from "@/lib/fieldnotes/prompt";
import { StructuredBriefing } from "./StructuredBriefing";

// Renders a field note's AI briefing. PENDING -> "Generating…"; FAILED -> error
// + Regenerate. Regenerate awaits the summarize route then refreshes the route.

export function BriefingCard({
  note,
  vineyardName,
  compact = false,
}: {
  note: ParsedFieldNote;
  vineyardName?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const status = note.aiSummaryStatus;
  const briefing = status === "READY" ? parseBriefing(note.aiSummary) : null;

  async function regenerate() {
    setBusy(true);
    try {
      await fetch(`/api/field-notes/${note.id}/summarize`, { method: "POST" });
    } catch {
      /* ignore — status will reflect failure */
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const body = (
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: "var(--space-3)" }}>
        <div>
          {!compact ? <Eyebrow rule>AI briefing</Eyebrow> : null}
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 300,
              fontSize: compact ? 18 : 24,
              margin: compact ? 0 : "8px 0 0",
            }}
          >
            {vineyardName ? vineyardName : "Weekly briefing"}
          </h2>
        </div>
        <span style={{ fontSize: 13, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          week of {note.weekOf}
        </span>
      </div>

      {status === "READY" && briefing ? (
        <StructuredBriefing briefing={briefing} />
      ) : status === "READY" && note.aiSummary ? (
        // Legacy plain-text briefing (pre-structured): render as-is.
        <p style={{ fontSize: 15, lineHeight: 1.65, color: "var(--text-secondary)", margin: 0, whiteSpace: "pre-wrap" }}>
          {note.aiSummary}
        </p>
      ) : status === "PENDING" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Badge tone="blue" variant="soft">Generating…</Badge>
          <span style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
            The briefing is being written. Refresh shortly.
          </span>
        </div>
      ) : status === "FAILED" ? (
        <div>
          <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 0 }}>
            The briefing couldn&rsquo;t be generated.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={regenerate} disabled={busy}>
            {busy ? "Regenerating…" : "Regenerate"}
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13.5, color: "var(--text-muted)" }}>No briefing yet.</span>
          <Button type="button" variant="secondary" size="sm" onClick={regenerate} disabled={busy}>
            {busy ? "Generating…" : "Generate"}
          </Button>
        </div>
      )}
    </>
  );

  if (compact) return <div>{body}</div>;
  return <Card padding="var(--space-5)">{body}</Card>;
}
