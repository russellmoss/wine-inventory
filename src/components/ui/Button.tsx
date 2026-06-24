"use client";

import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "inverse" | "link";
type Size = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  variant?: Variant;
  size?: Size;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}

/**
 * Button — the primary action control. Wine solid for primary; ink outline /
 * quiet ghost for the rest. Sentence-case labels.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  disabled = false,
  fullWidth = false,
  type = "button",
  style,
  ...rest
}: ButtonProps) {
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);

  const sizes: Record<Size, { fontSize: number; padding: string; gap: number; height: number }> = {
    sm: { fontSize: 13, padding: "8px 14px", gap: 6, height: 34 },
    md: { fontSize: 14.5, padding: "11px 20px", gap: 8, height: 42 },
    lg: { fontSize: 16, padding: "14px 26px", gap: 10, height: 50 },
  };
  const s = sizes[size] || sizes.md;

  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: s.gap,
    height: s.height,
    padding: s.padding,
    fontFamily: "var(--font-body)",
    fontSize: s.fontSize,
    fontWeight: "var(--weight-medium)" as unknown as number,
    lineHeight: 1,
    letterSpacing: "0.005em",
    borderRadius: "var(--radius-md)",
    // Longhand (not the `border` shorthand) so variants can override `borderColor`
    // alone without React 19's shorthand/longhand conflict warning.
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    width: fullWidth ? "100%" : "auto",
    transition:
      "background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard)",
    transform: active && !disabled ? "translateY(0.5px)" : "none",
    whiteSpace: "nowrap",
    userSelect: "none",
  };

  const variants: Record<Variant, React.CSSProperties> = {
    primary: {
      background: active ? "var(--accent-press)" : hover ? "var(--accent-hover)" : "var(--accent)",
      color: "var(--accent-on)",
      boxShadow: hover && !disabled ? "var(--shadow-sm)" : "none",
    },
    secondary: {
      background: hover ? "var(--paper-100)" : "var(--surface-raised)",
      color: "var(--text-primary)",
      borderColor: "var(--border-strong)",
    },
    ghost: {
      background: hover ? "var(--accent-soft)" : "transparent",
      color: "var(--text-accent)",
    },
    inverse: {
      background: hover ? "var(--paper-50)" : "var(--white)",
      color: "var(--ink)",
    },
    link: {
      background: "transparent",
      color: "var(--text-accent)",
      padding: 0,
      height: "auto",
      textDecoration: hover ? "underline" : "none",
      textUnderlineOffset: "3px",
    },
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setActive(false);
      }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{ ...base, ...(variants[variant] || variants.primary), ...style }}
      {...rest}
    >
      {iconLeft ? <span style={{ display: "inline-flex" }}>{iconLeft}</span> : null}
      {children}
      {iconRight ? <span style={{ display: "inline-flex" }}>{iconRight}</span> : null}
    </button>
  );
}
