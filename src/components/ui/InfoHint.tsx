"use client";

import React, { useId, useState } from "react";

export interface InfoHintProps {
  /** The explanatory text shown on hover / focus. */
  label: string;
  /** Accessible name for the trigger (defaults to "More information"). */
  ariaLabel?: string;
  /** Which side of the trigger the bubble opens toward. Default "top". */
  side?: "top" | "bottom";
  style?: React.CSSProperties;
}

/**
 * InfoHint — a small "ⓘ" affordance that reveals a one-line explanation on hover AND keyboard focus.
 * Token-driven (no hardcoded colors), light-only per DESIGN.md. Reveal is instant (no animation), so it is
 * inherently reduced-motion safe. The bubble is a `role="tooltip"` linked to the trigger via aria-describedby.
 */
export function InfoHint({ label, ariaLabel = "More information", side = "top", style }: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span style={{ position: "relative", display: "inline-flex", ...style }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation(); // don't trigger a wrapping <label> / row click
          setOpen((v) => !v); // tap-to-toggle on touch devices
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          padding: 0,
          borderRadius: "var(--radius-pill)",
          border: "var(--border-width) solid var(--border-default)",
          background: "transparent",
          color: open ? "var(--text-accent)" : "var(--text-muted)",
          fontFamily: "var(--font-body)",
          fontSize: 11,
          lineHeight: 1,
          cursor: "help",
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "absolute",
            left: 0,
            top: side === "bottom" ? "calc(100% + 6px)" : undefined,
            bottom: side === "top" ? "calc(100% + 6px)" : undefined,
            zIndex: 50,
            width: "max-content",
            maxWidth: 260,
            padding: "var(--space-2) var(--space-3)",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-inverse)",
            color: "var(--text-on-dark)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-caption)",
            lineHeight: 1.4,
            fontWeight: 400,
            boxShadow: "var(--shadow-md)",
            textTransform: "none",
            letterSpacing: "var(--tracking-normal)",
            whiteSpace: "normal",
          }}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
