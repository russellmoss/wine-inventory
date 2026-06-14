import React from "react";

/**
 * Savvy Button — the brand's primary action control.
 * Calm, premium, never loud. Gold solid for primary; ink outline /
 * quiet ghost for the rest. Sentence case labels.
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
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);

  const sizes = {
    sm: { fontSize: 13, padding: "8px 14px", gap: 6, height: 34 },
    md: { fontSize: 14.5, padding: "11px 20px", gap: 8, height: 42 },
    lg: { fontSize: 16, padding: "14px 26px", gap: 10, height: 50 },
  };
  const s = sizes[size] || sizes.md;

  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: s.gap,
    height: s.height,
    padding: s.padding,
    fontFamily: "var(--font-body)",
    fontSize: s.fontSize,
    fontWeight: "var(--weight-medium)",
    lineHeight: 1,
    letterSpacing: "0.005em",
    borderRadius: "var(--radius-md)",
    border: "1px solid transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    width: fullWidth ? "100%" : "auto",
    transition:
      "background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard)",
    transform: active && !disabled ? "translateY(0.5px)" : "none",
    whiteSpace: "nowrap",
    userSelect: "none",
  };

  const variants = {
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
      background: hover ? "var(--paper-50)" : "var(--savvy-white)",
      color: "var(--savvy-black)",
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
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
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
