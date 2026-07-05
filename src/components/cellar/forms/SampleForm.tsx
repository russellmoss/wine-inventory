"use client";

import React from "react";
import { Button } from "@/components/ui";
import { pullSampleAction, cancelSampleAction } from "@/lib/chemistry/actions";
import { ColumnShell, LotField, fieldStyle, useLotPick, useRequestId, type CellarActionsVessel, type RecordSubmit } from "./shared";

// ── Sample (pull; optional send-now) ──
export function SampleForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: RecordSubmit }) {
  const reqId = useRequestId();
  const { lotId, setLotId, ready } = useLotPick(vessel);
  const [source, setSource] = React.useState("");
  const [lab, setLab] = React.useState("");
  const [sendNow, setSendNow] = React.useState(false);
  const [note, setNote] = React.useState("");

  function submit() {
    onSubmit(async () => {
      const res = await pullSampleAction({
        vesselId: vessel.id,
        lotId: lotId || undefined,
        source: source.trim() || undefined,
        lab: lab.trim() || undefined,
        sendNow,
        note: note.trim() || undefined,
        clientRequestId: reqId,
      });
      return { undo: () => cancelSampleAction(res.sampleId) };
    }, sendNow ? "sample pulled + sent" : "sample pulled");
  }

  return (
    <ColumnShell>
      <LotField residentLots={vessel.residentLots} value={lotId} onChange={setLotId} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source (e.g. Barrel A3)" style={{ ...fieldStyle, flex: "1 1 180px" }} aria-label="Sample source" />
        <input value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Lab (optional)" style={{ ...fieldStyle, flex: "1 1 140px" }} aria-label="Lab" />
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text-primary)", minHeight: 44 }}>
        <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} style={{ width: 18, height: 18 }} />
        Mark sent to the lab now
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={fieldStyle} aria-label="Note" />
      <div>
        <Button variant="primary" size="sm" disabled={pending || !ready} onClick={submit} style={{ minHeight: 44 }}>
          {pending ? "Saving…" : `Pull sample from ${vessel.code}`}
        </Button>
      </div>
    </ColumnShell>
  );
}
