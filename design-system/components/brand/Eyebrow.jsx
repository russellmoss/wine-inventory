import React from "react";

/**
 * Savvy Eyebrow — the brand's uppercase, tracked kicker label that sits
 * above a title. Gold by default, with an optional leading hairline rule.
 */
export function Eyebrow({ children, tone = "gold", rule = false, style, ...rest }) {
  const colors = {
    gold: "var(--text-accent)",
    ink: "var(--text-muted)",
    onDark: "var(--text-on-dark-muted)",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-overline)",
        fontWeight: "var(--weight-medium)",
        letterSpacing: "var(--tracking-overline)",
        textTransform: "uppercase",
        color: colors[tone] || colors.gold,
        ...style,
      }}
      {...rest}
    >
      {rule ? (
        <span style={{ width: 28, height: 1, background: "currentColor", opacity: 0.5 }} />
      ) : null}
      {children}
    </span>
  );
}
