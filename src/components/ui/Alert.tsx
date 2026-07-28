import React from "react";

export type AlertVariant = "info" | "warning" | "danger" | "success";

export interface AlertProps {
  variant?: AlertVariant;
  /** What object, and what happened to it. Not "Error". */
  title: React.ReactNode;
  /**
   * The consequence — above all, whether anything was written. A cellar hand who
   * hits an error needs to know if the ledger moved.
   */
  children?: React.ReactNode;
  /** The action that resolves it. An error with no way out is a dead end. */
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}

const LOOK: Record<AlertVariant, { glyph: string; fg: string; bg: string; role: "alert" | "status" }> = {
  // The glyph is the non-colour half of the signal — never colour alone (v2 §B25).
  info: { glyph: "ⓘ", fg: "var(--blue-ink)", bg: "var(--surface-tint-info)", role: "status" },
  warning: { glyph: "▲", fg: "var(--golden-ink)", bg: "var(--surface-tint-warning)", role: "status" },
  danger: { glyph: "✕", fg: "var(--red-ink)", bg: "var(--surface-tint-danger)", role: "alert" },
  success: { glyph: "✓", fg: "var(--green-ink)", bg: "var(--surface-tint-success)", role: "status" },
};

/**
 * Alert — an inline message about an object (v2 §B25).
 *
 * `danger` gets `role="alert"` so it interrupts; everything else gets
 * `role="status"` so it does not. Body text uses `--warning-deep-text` on the
 * warning tint, where the ordinary secondary ink loses contrast.
 */
export function Alert({ variant = "info", title, children, actions, style }: AlertProps) {
  const l = LOOK[variant];
  return (
    <div
      role={l.role}
      style={{
        display: "flex",
        gap: 10,
        padding: "12px 14px",
        borderRadius: "var(--radius-md)",
        background: l.bg,
        border: "1px solid transparent",
        borderColor: l.fg,
        fontFamily: "var(--font-body)",
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ color: l.fg, fontSize: 15, lineHeight: 1.4, flexShrink: 0 }}>
        {l.glyph}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: l.fg, fontSize: 14, fontWeight: "var(--weight-semibold)" as unknown as number }}>
          {title}
        </div>
        {children ? (
          <div
            style={{
              marginTop: 4,
              fontSize: 13.5,
              lineHeight: "var(--leading-normal)",
              color: variant === "warning" ? "var(--warning-deep-text)" : "var(--text-secondary)",
            }}
          >
            {children}
          </div>
        ) : null}
        {actions ? <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div> : null}
      </div>
    </div>
  );
}
