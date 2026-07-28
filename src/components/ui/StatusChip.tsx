import React from "react";
import { STATUS_GLYPH, type StatusVariant } from "./status-variants";

export interface StatusChipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "style" | "children"> {
  variant: StatusVariant;
  /**
   * The status in words. Mandatory — colour is never the only signal, and a chip
   * with no text is a chip a screen reader cannot read.
   */
  children: React.ReactNode;
  /** `sm` 24px for table rows, `md` 30px for headers. */
  size?: "sm" | "md";
  style?: React.CSSProperties;
}

/**
 * StatusChip — the single status expression (v2 §B17).
 *
 * Anatomy: glyph (`aria-hidden`) + mandatory text. Wine never appears here; it
 * means brand and primary action only. Category labels still use `Badge`.
 */
export function StatusChip({ variant, children, size = "sm", style, ...rest }: StatusChipProps) {
  const height = size === "md" ? 30 : 24;

  return (
    <span
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height,
        padding: size === "md" ? "0 12px" : "0 9px",
        borderRadius: "var(--radius-pill)",
        background: `var(--status-${variant}-bg)`,
        color: `var(--status-${variant}-fg)`,
        fontFamily: "var(--font-body)",
        fontSize: size === "md" ? 13 : 12,
        fontWeight: "var(--weight-medium)" as unknown as number,
        letterSpacing: "0.01em",
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: size === "md" ? 12 : 11, lineHeight: 1 }}>
        {STATUS_GLYPH[variant]}
      </span>
      {children}
    </span>
  );
}
