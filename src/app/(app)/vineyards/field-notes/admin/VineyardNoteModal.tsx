"use client";

import React from "react";
import { Modal } from "@/components/ui";
import { type ParsedFieldNote } from "@/lib/fieldnotes/types";
import { NoteDetail } from "../NoteDetail";
import { BriefingCard } from "./BriefingCard";

// Admin drill-in: a vineyard's latest raw submission plus its briefing +
// Regenerate. Modal overlay preserves dashboard scroll position.

export function VineyardNoteModal({
  open,
  onClose,
  vineyardName,
  note,
  blockLabels,
}: {
  open: boolean;
  onClose: () => void;
  vineyardName: string;
  note: ParsedFieldNote | null;
  blockLabels: Record<string, string>;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={vineyardName}
      subtitle={note ? `Week of ${note.weekOf} · ${note.userEmail}` : "No reports yet"}
      maxWidth={720}
    >
      {note ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div
            style={{
              padding: "var(--space-4)",
              background: "var(--surface-sunken)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <BriefingCard note={note} compact />
          </div>
          <NoteDetail note={note} blockLabels={blockLabels} />
        </div>
      ) : (
        <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
          This vineyard has no submitted reports yet.
        </p>
      )}
    </Modal>
  );
}
