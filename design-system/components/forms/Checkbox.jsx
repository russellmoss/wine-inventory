import React from "react";

/**
 * Savvy Checkbox — square with gentle radius; gold fill when checked.
 * Controlled via `checked` + `onChange`, with an optional label.
 */
export function Checkbox({ checked = false, onChange, label, disabled = false, id, style, ...rest }) {
  const reactId = React.useId ? React.useId() : "cb";
  const cbId = id || reactId;

  return (
    <label
      htmlFor={cbId}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "var(--font-body)",
        fontSize: 14.5,
        color: "var(--text-primary)",
        userSelect: "none",
        ...style,
      }}
    >
      <span
        style={{
          position: "relative",
          width: 20,
          height: 20,
          flex: "none",
          borderRadius: "var(--radius-xs)",
          border: `1.5px solid ${checked ? "var(--accent)" : "var(--border-strong)"}`,
          background: checked ? "var(--accent)" : "var(--surface-raised)",
          transition: "background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 6.2L4.8 8.5L9.5 3.5" stroke="var(--accent-on)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
        <input
          id={cbId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange && onChange(e.target.checked, e)}
          style={{ position: "absolute", opacity: 0, width: "100%", height: "100%", margin: 0, cursor: "inherit" }}
          {...rest}
        />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
