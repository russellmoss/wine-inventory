"use client";

import React from "react";
import { inputMetrics, type InputSize } from "./input-sizes";

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size" | "style"> {
  /**
   * REQUIRED. Every select must have an accessible name — 34 of this app's
   * selects had none, which is a WCAG 4.1.2 failure: a screen reader announces
   * "combo box" and the current value, with no indication of what it selects.
   */
  label: string;
  /**
   * Render the label as `.sr-only` instead of visible. Use ONLY where an adjacent
   * visible heading already names the control for a sighted user — dense filter
   * rows are the real case. v2 §B10 wants a visible label by default, so this is a
   * documented compromise, not the norm: it keeps the accessible name mandatory
   * while letting a 6-control filter row stay a filter row.
   */
  hideLabel?: boolean;
  hint?: string;
  error?: string;
  size?: InputSize;
  style?: React.CSSProperties;
  selectStyle?: React.CSSProperties;
}

/**
 * Select — the labelled native select (v2 §B10).
 *
 * Native on purpose: the OS picker is the best control on a phone in a cellar,
 * and this repo had 14 copies of a hand-rolled `selectStyle` const trying to
 * approximate the design system around it. One component replaces the copies.
 *
 * For >10 options with type-ahead, use the combobox pattern in
 * `src/components/work-orders/MaterialFilterPicker.tsx` instead — doc 06 names it
 * as already correct, so it stays the combobox base rather than being duplicated
 * here.
 */
export function Select({
  label,
  hideLabel = false,
  hint,
  error,
  id,
  size = "md",
  disabled = false,
  required,
  children,
  style,
  selectStyle,
  ...rest
}: SelectProps) {
  const [focus, setFocus] = React.useState(false);
  const reactId = React.useId();
  const selectId = id || reactId;
  const hintId = `${selectId}-hint`;
  const errorId = `${selectId}-error`;

  const s = inputMetrics(size);

  const borderColor = error
    ? "var(--danger)"
    : focus
      ? "var(--wine-primary)"
      : "var(--border-strong)";

  // Only the message actually rendered is described.
  const describedBy = [error ? errorId : null, !error && hint ? hintId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      <label
        htmlFor={selectId}
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
      <select
        id={selectId}
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
          color: disabled ? "var(--ink-600)" : "var(--text-primary)",
          background: disabled ? "var(--paper-200)" : "var(--surface-raised)",
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: disabled ? "var(--paper-300)" : borderColor,
          borderRadius: "var(--radius-md)",
          boxShadow: focus ? "var(--shadow-focus)" : "none",
          cursor: disabled ? "not-allowed" : "pointer",
          transition:
            "border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)",
          ...selectStyle,
        }}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <span
          id={errorId}
          role="alert"
          style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--danger)" }}
        >
          {error}
        </span>
      ) : hint ? (
        <span
          id={hintId}
          style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-muted)" }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}
