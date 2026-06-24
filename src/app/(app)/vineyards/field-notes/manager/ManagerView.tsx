"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import { type ParsedFieldNote } from "@/lib/fieldnotes/types";
import { type FieldInputLists } from "@/lib/fieldnotes/input-actions";
import { mostRecentFriday } from "@/lib/fieldnotes/week";
import { NoteDetail } from "../NoteDetail";
import { FieldNoteForm, type FormBlock } from "./FieldNoteForm";

export function ManagerView({
  vineyardId,
  vineyardName,
  blocks,
  latestNote,
  inputLists,
}: {
  vineyardId: string;
  vineyardName: string;
  blocks: FormBlock[];
  latestNote: ParsedFieldNote | null;
  inputLists: FieldInputLists;
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);

  const blockLabels = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of blocks) m[b.id] = b.blockLabel;
    return m;
  }, [blocks]);

  const thisWeek = mostRecentFriday();
  const alreadySubmitted = latestNote?.weekOf === thisWeek;

  if (creating) {
    return (
      <FieldNoteForm
        vineyardId={vineyardId}
        vineyardName={vineyardName}
        blocks={blocks}
        latestNote={latestNote}
        inputLists={inputLists}
        onSubmitted={() => {
          setCreating(false);
          router.refresh();
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <Eyebrow rule>Weekly field report</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 6px" }}>{vineyardName}</h1>

      {alreadySubmitted ? (
        <Card padding="var(--space-3)" style={{ margin: "var(--space-4) 0", borderColor: "var(--accent)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Badge tone="green" variant="soft">submitted</Badge>
            <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              This week&rsquo;s report (week of {thisWeek}) is in.
            </span>
          </div>
        </Card>
      ) : (
        <div style={{ margin: "var(--space-4) 0" }}>
          <Button type="button" variant="primary" fullWidth onClick={() => setCreating(true)} style={{ height: 52 }}>
            + Create this week&rsquo;s report
          </Button>
        </div>
      )}

      <Card style={{ marginTop: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, margin: 0 }}>
            Most recent field note
          </h2>
          {latestNote ? (
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>week of {latestNote.weekOf}</span>
          ) : null}
        </div>
        {latestNote ? (
          <NoteDetail note={latestNote} blockLabels={blockLabels} />
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
            No reports yet. Create the first one above.
          </p>
        )}
      </Card>
    </div>
  );
}
