"use client";

import React from "react";
import { inputMetrics, type InputSize } from "./input-sizes";

export interface NumericUnitInputProps {
  label: string;
  hideLabel?: boolean;
  value: string;
  onValueChange: (next: string) => void;
  /** The unit, rendered in its own box at field height — never inside the value. */
  unit?: React.ReactNode;
  /** What the work order planned, offered as a one-tap fill. */
  planned?: { value: string; label?: string };
  /** One-tap increments, e.g. [-1, +1, +5]. Each is a >=46px target (--touch-nudge). */
  nudges?: number[];
  /**
   * The live computed consequence: "2 g/hL x 218 L = 4.36 g". Announced politely.
   * This is the single best error-prevention device in the product — it is why a
   * cellar hand catches a 10x dosing slip before it reaches the ledger.
   */
  derived?: React.ReactNode;
  /** Out of tolerance is a QUIET NOTE, never a block. The user is holding the hose. */
  tolerance?: { ok: boolean; note: string };
  error?: string;
  hint?: string;
  size?: InputSize;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}

const NUDGE: React.CSSProperties = {
  minWidth: "var(--touch-nudge)",
  minHeight: "var(--touch-nudge)",
  padding: "0 10px",
  background: "var(--surface-raised)",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  fontVariantNumeric: "tabular-nums",
  cursor: "pointer",
};

/**
 * NumericUnitInput — every measured quantity (v2 §B9).
 *
 * Generalises the live `rate x volume = total` readout that `DoseForm` already
 * proved on `/bulk`. Rules, all of which exist because of how this is actually
 * used (wet hands, a phone, a tank in front of you):
 *
 *   - the unit is a separate non-editable box, never inside the number
 *   - `inputMode="decimal"` + `step="any"` so the phone keypad is right and the
 *     browser does not round a real measurement
 *   - `tabular-nums` so digits do not jitter as you type
 *   - out-of-tolerance is a note, NOT a block — the wine is already moving
 *   - no spinner. A spinner on a 3-decimal measurement is a trap.
 */
export function NumericUnitInput({
  label,
  hideLabel = false,
  value,
  onValueChange,
  unit,
  planned,
  nudges,
  derived,
  tolerance,
  error,
  hint,
  size = "floor",
  disabled = false,
  placeholder,
  style,
}: NumericUnitInputProps) {
  const [focus, setFocus] = React.useState(false);
  const id = React.useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const derivedId = `${id}-derived`;

  const s = inputMetrics(size);

  const bump = (by: number) => {
    const n = Number(value);
    const next = Number.isFinite(n) ? n + by : by;
    // Avoid 0.30000000000000004 showing up on a dose card.
    onValueChange(String(Number(next.toFixed(6))));
  };

  const describedBy = [
    error ? errorId : null,
    !error && hint ? hintId : null,
    derived ? derivedId : null,
  ]
    .filter(Boolean)
    .join(" ");

  const borderColor = error
    ? "var(--danger)"
    : focus
      ? "var(--wine-primary)"
      : "var(--border-strong)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      <label
        htmlFor={id}
        className={hideLabel ? "sr-only" : undefined}
        style={
          hideLabel
            ? undefined
            : {
                fontFamily: "var(--font-body)",
                fontSize: 13,
                fontWeight: "var(--weight-medium)" as unknown as number,
                color: "var(--text-secondary)",
              }
        }
      >
        {label}
      </label>

      {planned ? (
        <button
          type="button"
          onClick={() => onValueChange(planned.value)}
          style={{
            alignSelf: "flex-start",
            minHeight: "var(--touch-min)",
            padding: "0 12px",
            background: "var(--surface-tint-info)",
            border: "1px solid var(--blue-ink)",
            borderRadius: "var(--radius-md)",
            color: "var(--blue-ink)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {planned.label ?? `Planned: ${planned.value}`} — tap to use
        </button>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            height: s.height,
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: disabled ? "var(--paper-300)" : borderColor,
            borderRadius: "var(--radius-md)",
            background: disabled ? "var(--paper-200)" : "var(--surface-raised)",
            boxShadow: focus ? "var(--shadow-focus)" : "none",
            overflow: "hidden",
          }}
        >
          <input
            id={id}
            type="number"
            inputMode="decimal"
            step="any"
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            onChange={(e) => onValueChange(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            style={{
              width: 120,
              border: "none",
              outline: "none",
              background: "transparent",
              padding: `0 ${s.padX}px`,
              fontFamily: "var(--font-body)",
              fontSize: s.fontSize,
              fontVariantNumeric: "tabular-nums",
              color: disabled ? "var(--ink-600)" : "var(--text-primary)",
            }}
          />
          {unit ? (
            <span
              aria-hidden="true"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 64,
                padding: `0 ${s.padX}px`,
                borderLeft: "1px solid var(--border-strong)",
                background: "var(--paper-100)",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
                fontSize: s.fontSize - 1,
                whiteSpace: "nowrap",
              }}
            >
              {unit}
            </span>
          ) : null}
        </div>

        {nudges?.length ? (
          <div style={{ display: "flex", gap: 6 }}>
            {nudges.map((n) => (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => bump(n)}
                aria-label={`${n > 0 ? "Increase" : "Decrease"} ${label} by ${Math.abs(n)}`}
                style={NUDGE}
              >
                {n > 0 ? `+${n}` : n}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {derived ? (
        <div
          id={derivedId}
          aria-live="polite"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--text-muted)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {derived}
        </div>
      ) : null}

      {tolerance && !tolerance.ok ? (
        // A note, deliberately not role="alert" and deliberately not blocking.
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--warning-deep-text)" }}>
          {tolerance.note}
        </div>
      ) : null}

      {error ? (
        <span id={errorId} role="alert" style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--danger)" }}>
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-muted)" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
