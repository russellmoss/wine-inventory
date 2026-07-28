"use client";

import React from "react";

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style" | "children"> {
  /** REQUIRED — an icon-only control with no accessible name is unusable. */
  "aria-label": string;
  children: React.ReactNode;
  variant?: "ghost" | "outline";
  style?: React.CSSProperties;
}

/**
 * IconButton — 44x44 minimum, 20px icon, mandatory `aria-label` (v2 §B7).
 *
 * ONLY for genuinely universal actions: close, expand, more. **Never for a domain
 * action.** "Rack", "Top up" and "Press" are words a cellar hand must be able to
 * read; an icon for them is a guess, and the design system prohibits icon-only
 * navigation and icon-only domain verbs for exactly that reason.
 */
export function IconButton({
  children,
  variant = "ghost",
  disabled = false,
  type = "button",
  style,
  ...rest
}: IconButtonProps) {
  const [hover, setHover] = React.useState(false);
  const [focusRing, setFocusRing] = React.useState(false);

  const merged: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "var(--touch-min)",
    height: "var(--touch-min)",
    flex: "none",
    padding: 0,
    borderRadius: "var(--radius-md)",
    borderWidth: variant === "outline" ? 1 : 0,
    borderStyle: "solid",
    borderColor: variant === "outline" ? "var(--border-strong)" : "transparent",
    background: disabled
      ? "var(--paper-200)"
      : hover
        ? "var(--paper-100)"
        : variant === "outline"
          ? "var(--surface-raised)"
          : "transparent",
    color: disabled ? "var(--ink-600)" : "var(--text-secondary)",
    cursor: disabled ? "not-allowed" : "pointer",
    lineHeight: 0,
    ...style,
  };
  // Applied last so a caller's `style` cannot erase the focus ring — the same
  // inline-style-beats-stylesheet trap that hid the ring on Button for a year.
  if (focusRing) merged.boxShadow = "var(--shadow-focus)";

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={(e) => {
        let visible = true;
        try {
          visible = e.currentTarget.matches(":focus-visible");
        } catch {
          /* engine without :focus-visible — ring on every focus rather than none */
        }
        setFocusRing(visible);
      }}
      onBlur={() => setFocusRing(false)}
      style={merged}
    >
      <span aria-hidden="true" style={{ display: "inline-flex", width: "var(--icon-nav)", height: "var(--icon-nav)", alignItems: "center", justifyContent: "center" }}>
        {children}
      </span>
    </button>
  );
}
