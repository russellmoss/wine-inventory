"use client";

import React from "react";
import { Button } from "@/components/ui";
import { recordMeasurementsAction, voidPanelAction } from "@/lib/chemistry/actions";
import {
  ReadingRows,
  emptyReadingRow,
  toReadingInputs,
  readingsValid,
  type ReadingRow,
} from "@/components/chemistry/ReadingRows";
import { ColumnShell, LotField, fieldStyle, useLotPick, useRequestId, type CellarActionsVessel, type RecordSubmit } from "./shared";

// ── Analysis (panel of readings; live molecular SO₂) ──
export function AnalysisForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: RecordSubmit }) {
  const reqId = useRequestId();
  const { lotId, ready } = useLotPick(vessel);
  const [rows, setRows] = React.useState<ReadingRow[]>([emptyReadingRow("PH")]);
  const [note, setNote] = React.useState("");
  const valid = ready && readingsValid(rows);

  function submit() {
    const readings = toReadingInputs(rows);
    onSubmit(async () => {
      const res = await recordMeasurementsAction({
        vesselId: vessel.id,
        lotId: lotId || undefined,
        readings,
        note: note.trim() || undefined,
        clientRequestId: reqId,
      });
      return { undo: () => voidPanelAction(res.panelId) };
    }, `analysis (${readings.length} reading${readings.length === 1 ? "" : "s"})`);
  }

  return (
    <ColumnShell>
      <LotField residentLots={vessel.residentLots} />
      <ReadingRows rows={rows} onChange={setRows} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={fieldStyle} aria-label="Note" />
      <div>
        <Button variant="primary" size="sm" disabled={pending || !valid} onClick={submit} style={{ minHeight: 44 }}>
          {pending ? "Saving…" : `Log analysis on ${vessel.code}`}
        </Button>
      </div>
    </ColumnShell>
  );
}
