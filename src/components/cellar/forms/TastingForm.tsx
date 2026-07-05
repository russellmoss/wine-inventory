"use client";

import React from "react";
import { Button } from "@/components/ui";
import { recordTastingNoteAction, voidTastingNoteAction } from "@/lib/chemistry/actions";
import {
  ColumnShell,
  LotField,
  Segmented,
  READINESS_OPTIONS,
  fieldStyle,
  useLotPick,
  useRequestId,
  type CellarActionsVessel,
  type RecordSubmit,
} from "./shared";

// ── Tasting (sensory + 1–5 structure segments + score/scale + readiness) ──
export function TastingForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: RecordSubmit }) {
  const reqId = useRequestId();
  const { lotId, setLotId, ready } = useLotPick(vessel);
  const [aroma, setAroma] = React.useState("");
  const [flavor, setFlavor] = React.useState("");
  const [tannin, setTannin] = React.useState<number | null>(null);
  const [acidity, setAcidity] = React.useState<number | null>(null);
  const [body, setBody] = React.useState<number | null>(null);
  const [finish, setFinish] = React.useState<number | null>(null);
  const [score, setScore] = React.useState("");
  const [scale, setScale] = React.useState<"HUNDRED_POINT" | "TWENTY_POINT">("HUNDRED_POINT");
  const [readiness, setReadiness] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const hasContent =
    [aroma, flavor, notes].some((s) => s.trim()) ||
    [tannin, acidity, body, finish].some((n) => n != null) ||
    score.trim() !== "" ||
    readiness !== "";
  const valid = ready && hasContent;

  function submit() {
    onSubmit(async () => {
      const res = await recordTastingNoteAction({
        vesselId: vessel.id,
        lotId: lotId || undefined,
        aroma: aroma.trim() || undefined,
        flavor: flavor.trim() || undefined,
        tannin,
        acidity,
        body,
        finish,
        score: score.trim() !== "" ? Number(score) : undefined,
        scoreScale: score.trim() !== "" ? scale : undefined,
        readiness: (readiness || undefined) as never,
        notes: notes.trim() || undefined,
        clientRequestId: reqId,
      });
      return { undo: () => voidTastingNoteAction(res.tastingNoteId) };
    }, "tasting note");
  }

  return (
    <ColumnShell>
      <LotField residentLots={vessel.residentLots} value={lotId} onChange={setLotId} />
      <input value={aroma} onChange={(e) => setAroma(e.target.value)} placeholder="Aroma" style={fieldStyle} aria-label="Aroma" />
      <input value={flavor} onChange={(e) => setFlavor(e.target.value)} placeholder="Flavor" style={fieldStyle} aria-label="Flavor" />
      <Segmented label="Tannin" value={tannin} onChange={setTannin} />
      <Segmented label="Acidity" value={acidity} onChange={setAcidity} />
      <Segmented label="Body" value={body} onChange={setBody} />
      <Segmented label="Finish" value={finish} onChange={setFinish} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={score} onChange={(e) => setScore(e.target.value)} inputMode="decimal" placeholder="Score" style={{ ...fieldStyle, width: 96 }} aria-label="Score" />
        <select value={scale} onChange={(e) => setScale(e.target.value as "HUNDRED_POINT" | "TWENTY_POINT")} style={{ ...fieldStyle, width: 120 }} aria-label="Score scale">
          <option value="HUNDRED_POINT">100-point</option>
          <option value="TWENTY_POINT">20-point</option>
        </select>
        <select value={readiness} onChange={(e) => setReadiness(e.target.value)} style={{ ...fieldStyle, flex: "1 1 180px" }} aria-label="Readiness">
          <option value="">Readiness (optional)</option>
          {READINESS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={fieldStyle} aria-label="Notes" />
      <div>
        <Button variant="primary" size="sm" disabled={pending || !valid} onClick={submit} style={{ minHeight: 44 }}>
          {pending ? "Saving…" : `Record tasting on ${vessel.code}`}
        </Button>
      </div>
    </ColumnShell>
  );
}
