import React from "react";

/**
 * Savvy Input — labeled text field. Calm white field, ecru border,
 * soft gold focus ring. Label + optional hint/error sit with the field.
 */
export function Input({
  label,
  hint,
  error,
  id,
  type = "text",
  size = "md",
  iconLeft,
  disabled = false,
  style,
  inputStyle,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const reactId = React.useId ? React.useId() : "in";
  const inputId = id || reactId;

  const sizes = {
    sm: { h: 36, fs: 14, px: 12 },
    md: { h: 44, fs: 15, px: 14 },
    lg: { h: 52, fs: 16, px: 16 },
  };
  const s = sizes[size] || sizes.md;

  const borderColor = error
    ? "var(--danger)"
    : focus
    ? "var(--savvy-gold)"
    : "var(--border-strong)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
      {label ? (
        <label
          htmlFor={inputId}
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            fontWeight: "var(--weight-medium)",
            color: "var(--text-secondary)",
          }}
        >
          {label}
        </label>
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: s.h,
          padding: `0 ${s.px}px`,
          background: disabled ? "var(--paper-100)" : "var(--surface-raised)",
          border: `1px solid ${borderColor}`,
          borderRadius: "var(--radius-md)",
          boxShadow: focus ? "var(--shadow-focus)" : "none",
          transition:
            "border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {iconLeft ? (
          <span style={{ display: "inline-flex", color: "var(--text-muted)" }}>{iconLeft}</span>
        ) : null}
        <input
          id={inputId}
          type={type}
          disabled={disabled}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "var(--font-body)",
            fontSize: s.fs,
            color: "var(--text-primary)",
            minWidth: 0,
            ...inputStyle,
          }}
          {...rest}
        />
      </div>
      {error ? (
        <span style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--danger)" }}>{error}</span>
      ) : hint ? (
        <span style={{ fontFamily: "var(--font-body)", fontSize: 12.5, color: "var(--text-muted)" }}>{hint}</span>
      ) : null}
    </div>
  );
}
