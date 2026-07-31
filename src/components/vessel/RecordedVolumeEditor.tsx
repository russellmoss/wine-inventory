"use client";

import React from "react";
import { Button } from "@/components/ui";
import { correctOperationAction, correctRecordedVolumeAction } from "@/lib/cellar/actions";
import { fieldStyle } from "@/components/cellar/forms/shared";
import { formatVolume, volumeInputToLiters, volumeInputValue, volumeUnitLabel } from "@/lib/units/display";
import { useUnitPrefs } from "@/components/units/UnitsProvider";
import { MAX_REASON_CHARS } from "@/lib/cellar/volume-correction-plan";

/**
 * "Recorded volume · 100 L · Edit" — the vessel's own number, with an explicit way to fix it
 * (feedback cms8a9nau0005i8045l65vomp: a barrel SEEDed at 100 L that really held 225 L, with no
 * path to say so that didn't move wine or mint a blend).
 *
 * It sits HERE, next to the number it corrects, and not in the Cellar-actions row inside the
 * History modal, on purpose: the winemaker looking at a wrong number needs the fix within reach of
 * their eye, and every control in that row is a claim about physics. This one isn't — the copy says
 * so, the reason is mandatory, and an Undo is offered immediately after, because the most likely
 * next discovery is that the correction itself was typed wrong.
 */
export function RecordedVolumeEditor({
  vesselId,
  vesselCode,
  currentL,
  capacityL,
  onCorrected,
}: {
  vesselId: string;
  vesselCode: string;
  currentL: number;
  capacityL: number;
  /** Let the host refetch — the correction shifts fill, composition and the timeline. */
  onCorrected?: () => void;
}) {
  const vol = useUnitPrefs().volume;
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ message: string; operationId: number | null } | null>(null);

  function begin() {
    setValue(volumeInputValue(currentL, vol));
    setReason("");
    setError(null);
    setDone(null);
    setOpen(true);
  }

  const targetL = volumeInputToLiters(value, vol, { display: volumeInputValue(currentL, vol), liters: currentL });
  const overCapacity = targetL != null && targetL > capacityL + 0.005;
  const unchanged = targetL != null && Math.abs(targetL - currentL) < 0.005;
  const valid = targetL != null && targetL > 0 && !overCapacity && !unchanged && reason.trim().length > 0;
  const deltaL = targetL != null ? Math.round((targetL - currentL) * 100) / 100 : null;

  function save() {
    if (!valid || targetL == null) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await correctRecordedVolumeAction({ vesselId, targetVolumeL: targetL, reason: reason.trim() });
        setDone({ message: res.message, operationId: res.operationId });
        setOpen(false);
        onCorrected?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't correct the recorded volume.");
      }
    });
  }

  function undo(operationId: number) {
    setError(null);
    startTransition(async () => {
      try {
        await correctOperationAction(operationId);
        setDone(null);
        onCorrected?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't undo that correction.");
      }
    });
  }

  // The math the winemaker is about to commit, stated before they commit it.
  const preview = (() => {
    if (!value.trim()) return `Correcting only the record — no wine moves in or out of ${vesselCode}.`;
    if (targetL == null) return "Enter the volume this vessel actually holds.";
    if (targetL <= 0) return "Enter a volume greater than 0. To empty the vessel, use Dump.";
    if (overCapacity) return `${vesselCode} holds ${formatVolume(capacityL, vol)} — it can't be corrected to ${formatVolume(targetL, vol)}.`;
    if (unchanged) return `That's the number already on the books (${formatVolume(currentL, vol)}).`;
    const dir = (deltaL ?? 0) > 0 ? "up" : "down";
    return `Corrects the record ${dir} by ${formatVolume(Math.abs(deltaL ?? 0), vol)}, from ${formatVolume(currentL, vol)} to ${formatVolume(targetL, vol)}. No wine moves.`;
  })();

  return (
    <div style={{ padding: "10px 0 12px", borderBottom: "1px solid var(--border-strong)", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>
          Recorded volume
        </span>
        <span style={{ fontSize: 14, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
          {formatVolume(currentL, vol)}
        </span>
        {open ? null : (
          <Button variant="ghost" size="sm" onClick={begin} disabled={pending} style={{ minHeight: 36 }}>
            Edit
          </Button>
        )}
      </div>

      {open ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10, maxWidth: 520 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              aria-label={`Corrected volume for ${vesselCode} in ${volumeUnitLabel(vol)}`}
              style={{ ...fieldStyle, width: 130 }}
            />
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{volumeUnitLabel(vol)}</span>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON_CHARS))}
            rows={2}
            aria-label="Why the recorded volume was wrong"
            placeholder="Why was it wrong? e.g. fill volume mistyped at 100 instead of 225"
            style={{ ...fieldStyle, height: "auto", padding: "8px 10px", resize: "vertical", width: "100%" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Button variant="primary" size="sm" disabled={pending || !valid} onClick={save} style={{ minHeight: 44 }}>
              {pending ? "Saving…" : "Save correction"}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)} style={{ minHeight: 44 }}>
              Cancel
            </Button>
          </div>
          <p aria-live="polite" style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {preview}
          </p>
        </div>
      ) : null}

      {done ? (
        <div
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, padding: "8px 12px", borderRadius: "var(--radius-md)", background: "var(--accent-soft)", border: "1px solid var(--border-strong)", fontSize: 13.5 }}
        >
          <span style={{ color: "var(--text-primary)" }}>{done.message}</span>
          {done.operationId != null ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => undo(done.operationId as number)} style={{ minHeight: 36 }}>
              Undo
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: "8px 0 0" }}>{error}</p> : null}
    </div>
  );
}
