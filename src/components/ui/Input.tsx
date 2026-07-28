"use client";

import React from "react";
import { inputMetrics, type InputSize } from "./input-sizes";

type Size = InputSize;

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "style"> {
  label?: string;
  hint?: string;
  error?: string;
  size?: Size;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  /**
   * A non-editable unit or suffix box at the field's own height, outside the value
   * (v2 §B8 adornment slot). The unit never goes *inside* the value.
   */
  adornmentRight?: React.ReactNode;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}

/**
 * Input — labeled text field. Calm white field, sand border, soft wine focus
 * ring. Label + optional hint/error sit with the field.
 *
 * The hint and the error are wired to the field with `aria-describedby`, the
 * error also sets `aria-invalid` and is announced via `role="alert"`, and a
 * required field carries a VISIBLE marker, not just the `required` attribute
 * (v2 §B8). None of that existed before 2026-07-28: across 165 call sites the
 * hint and error text rendered on screen but was never associated with the
 * input, so a screen-reader user heard the label and nothing else — including
 * on validation failure.
 */
export function Input({
  label,
  hint,
  error,
  id,
  type = "text",
  size = "md",
  iconLeft,
  iconRight,
  adornmentRight,
  disabled = false,
  required,
  style,
  inputStyle,
  ...rest
}: InputProps) {
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

  // Only the message actually rendered is described — describing a hidden node
  // makes a screen reader read stale text.
  const describedBy = [error ? errorId : null, !error && hint ? hintId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label ? (
        <label
          htmlFor={inputId}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: "var(--weight-medium)" as unknown as number,
            color: "var(--text-secondary)",
          }}
        >
          {label}
          {required ? (
            <>
              {" "}
              <span aria-hidden="true" style={{ color: "var(--danger)" }}>
                *
              </span>
              <span className="sr-only">(required)</span>
            </>
          ) : null}
        </label>
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: s.height,
          padding: `0 ${s.padX}px`,
          // A real disabled surface, not an opacity wash — same correction Button
          // took in Phase 1 (v2 §B6/§B8).
          background: disabled ? "var(--paper-200)" : "var(--surface-raised)",
          border: `1px solid ${disabled ? "var(--paper-300)" : borderColor}`,
          borderRadius: "var(--radius-md)",
          boxShadow: focus ? "var(--shadow-focus)" : "none",
          transition:
            "border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)",
          cursor: disabled ? "not-allowed" : "text",
        }}
      >
        {iconLeft ? (
          <span aria-hidden="true" style={{ display: "inline-flex", color: "var(--text-muted)" }}>
            {iconLeft}
          </span>
        ) : null}
        <input
          id={inputId}
          type={type}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "var(--font-body)",
            fontSize: s.fontSize,
            color: disabled ? "var(--ink-600)" : "var(--text-primary)",
            minWidth: 0,
            ...inputStyle,
          }}
          {...rest}
        />
        {iconRight ? (
          <span aria-hidden="true" style={{ display: "inline-flex", color: "var(--text-muted)" }}>
            {iconRight}
          </span>
        ) : null}
        {adornmentRight ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              alignSelf: "stretch",
              marginRight: -s.padX,
              padding: `0 ${s.padX}px`,
              borderLeft: "1px solid var(--border-strong)",
              background: "var(--paper-100)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
              fontSize: s.fontSize - 1,
              whiteSpace: "nowrap",
              borderTopRightRadius: "var(--radius-md)",
              borderBottomRightRadius: "var(--radius-md)",
            }}
          >
            {adornmentRight}
          </span>
        ) : null}
      </div>
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
