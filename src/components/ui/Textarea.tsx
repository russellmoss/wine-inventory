"use client";

import React from "react";

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "style"> {
  label?: string;
  hint?: string;
  error?: string;
  /** minimum visible rows before scrolling/resizing (default 3). */
  minRows?: number;
  style?: React.CSSProperties;
  textareaStyle?: React.CSSProperties;
}

/**
 * Textarea — a multi-line, vertically-resizable note field (Phase 9.1 Unit 4). Same calm white field,
 * sand border, and soft wine focus ring as Input, but roomy: work-order notes, deviations, and instructions
 * are often several lines. `resize: vertical` lets the operator drag it taller; minRows sets the floor.
 */
export function Textarea({
  label,
  hint,
  error,
  id,
  minRows = 3,
  disabled = false,
  style,
  textareaStyle,
  ...rest
}: TextareaProps) {
  const [focus, setFocus] = React.useState(false);
  const reactId = React.useId();
  const areaId = id || reactId;

  const borderColor = error ? "var(--danger)" : focus ? "var(--wine-primary)" : "var(--border-strong)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label ? (
        <label
          htmlFor={areaId}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: "var(--weight-medium)" as unknown as number,
            color: "var(--text-secondary)",
          }}
        >
          {label}
        </label>
      ) : null}
      <textarea
        id={areaId}
        rows={minRows}
        disabled={disabled}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%",
          minHeight: minRows * 24 + 20,
          padding: "10px 14px",
          background: disabled ? "var(--paper-100)" : "var(--surface-raised)",
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--radius-md)",
          boxShadow: focus ? "var(--shadow-focus)" : "none",
          transition:
            "border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)",
          fontFamily: "var(--font-body)",
          fontSize: 15,
          lineHeight: 1.5,
          color: "var(--text-primary)",
          outline: "none",
          resize: "vertical",
          opacity: disabled ? 0.6 : 1,
          ...textareaStyle,
        }}
        {...rest}
      />
      {error ? (
        <span style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--danger)" }}>{error}</span>
      ) : hint ? (
        <span style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-muted)" }}>{hint}</span>
      ) : null}
    </div>
  );
}
