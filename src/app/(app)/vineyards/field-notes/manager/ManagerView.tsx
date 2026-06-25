"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Eyebrow } from "@/components/ui";
import { type ParsedFieldNote } from "@/lib/fieldnotes/types";
import { type FieldInputLists } from "@/lib/fieldnotes/input-actions";
import { todayISODateUTC } from "@/lib/fieldnotes/week";
import { NoteDetail } from "../NoteDetail";
import { FieldNoteForm, type FormBlock } from "./FieldNoteForm";

type Mode = { kind: "list" } | { kind: "create" } | { kind: "edit"; note: ParsedFieldNote };

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
  const [mode, setMode] = React.useState<Mode>({ kind: "list" });

  const blockLabels = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of blocks) m[b.id] = b.blockLabel;
    return m;
  }, [blocks]);

  const today = todayISODateUTC();
  const latestIsToday = latestNote?.weekOf === today;

  if (mode.kind !== "list") {
    const editNote = mode.kind === "edit" ? mode.note : null;
    return (
      <FieldNoteForm
        // Remount per mode/target so initial state hydrates correctly.
        key={editNote ? `edit:${editNote.id}` : "create"}
        vineyardId={vineyardId}
        vineyardName={vineyardName}
        blocks={blocks}
        latestNote={latestNote}
        editNote={editNote}
        inputLists={inputLists}
        onSubmitted={() => {
          setMode({ kind: "list" });
          router.refresh();
        }}
        onCancel={() => setMode({ kind: "list" })}
      />
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <Eyebrow rule>Field report</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 6px" }}>{vineyardName}</h1>

      <div style={{ margin: "var(--space-4) 0" }}>
        {latestIsToday && latestNote ? (
          <Button
            type="button"
            variant="primary"
            fullWidth
            onClick={() => setMode({ kind: "edit", note: latestNote })}
            style={{ height: 52 }}
          >
            Edit today&rsquo;s report
          </Button>
        ) : (
          <Button type="button" variant="primary" fullWidth onClick={() => setMode({ kind: "create" })} style={{ height: 52 }}>
            + New report
          </Button>
        )}
      </div>

      <Card style={{ marginTop: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--space-3)", gap: 8 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, margin: 0 }}>
            Most recent field note
          </h2>
          {latestNote ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{latestNote.weekOf}</span>
              <Button type="button" variant="secondary" size="sm" onClick={() => setMode({ kind: "edit", note: latestNote })}>
                Edit
              </Button>
            </div>
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
