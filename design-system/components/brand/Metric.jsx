import React from "react";

/**
 * Savvy Metric — the deck's "Metric # / Caption" stat block. A large,
 * light Inter Tight figure over a quiet caption, with an optional gold
 * top rule. Serif variant renders the figure in Big Caslon for editorial
 * moments.
 */
export function Metric({ value, caption, align = "left", rule = true, serif = false, size = "md", style, ...rest }) {
  const sizes = { sm: 40, md: 56, lg: 76 };
  const fs = sizes[size] || sizes.md;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        textAlign: align,
        alignItems: align === "center" ? "center" : "flex-start",
        ...style,
      }}
      {...rest}
    >
      {rule ? (
        <span style={{ width: 36, height: 2, background: "var(--accent)", marginBottom: 4 }} />
      ) : null}
      <span
        style={{
          fontFamily: serif ? "var(--font-display)" : "var(--font-heading)",
          fontWeight: serif ? "var(--weight-regular)" : "var(--weight-light)",
          fontSize: fs,
          lineHeight: 1,
          letterSpacing: serif ? "0" : "-0.02em",
          color: "var(--text-primary)",
        }}
      >
        {value}
      </span>
      {caption ? (
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            lineHeight: 1.45,
            color: "var(--text-muted)",
            maxWidth: "26ch",
          }}
        >
          {caption}
        </span>
      ) : null}
    </div>
  );
}
