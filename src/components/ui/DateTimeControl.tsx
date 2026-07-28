"use client";

import React from "react";
import { inputMetrics, type InputSize } from "./input-sizes";

export interface DateTimeControlProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "style" | "type"> {
  label: string;
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  /** `date` (default), `datetime-local`, or `time`. */
  mode?: "date" | "datetime-local" | "time";
  size?: InputSize;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}

/**
 * DateTimeControl — the native date input, wrapped so it stops being a seam.
 *
 * The app has 20 raw `<input type="date">` sitting beside design-system fields.
 * They render at the UA's own height with the UA's own calendar glyph, so a
 * filter row is visibly two different design languages side by side (v2 §B12).
 *
 * Deliberately still the NATIVE input. A hand-rolled picker would be worse on a
 * phone, worse for keyboard users, and worse for anyone who just wants to type
 * the date — which the native control already allows and which §B12 requires we
 * keep. This only normalises the box around it.
 */
export function DateTimeControl({
  label,
  hideLabel = false,
  hint,
  error,
  id,
  mode = "date",
  size = "md",
  disabled = false,
  required,
  style,
  inputStyle,
  ...rest
}: DateTimeControlProps) {
  const [focus, setFocus] = React.useState(false);
  const reactId = React.useId();
  const inputId = id || reactId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const s = inputMetrics(size);

  const borderColor = error
    ? "var(--danger)"
    : focus
      ? "var(--wine-primary)"
      : "var(--border-strong)";

  const describedBy = [error ? errorId : null, !error && hint ? hintId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      <label
        htmlFor={inputId}
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
        {/* Visual only — `required` already conveys the state, and an sr-only
            "(required)" inside the label would pollute the accessible name. */}
        {required && !hideLabel ? (
          <>
            {" "}
            <span aria-hidden="true" style={{ color: "var(--danger)" }}>
              *
            </span>
          </>
        ) : null}
      </label>
      <input
        id={inputId}
        type={mode}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          height: s.height,
          padding: `0 ${s.padX}px`,
          fontFamily: "var(--font-body)",
          fontSize: s.fontSize,
          fontVariantNumeric: "tabular-nums",
          color: disabled ? "var(--ink-600)" : "var(--text-primary)",
          background: disabled ? "var(--paper-200)" : "var(--surface-raised)",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: disabled ? "var(--paper-300)" : borderColor,
          borderRadius: "var(--radius-md)",
          boxShadow: focus ? "var(--shadow-focus)" : "none",
          transition:
            "border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)",
          ...inputStyle,
        }}
        {...rest}
      />
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
