"use client";

import React from "react";

export interface CollapsibleProps {
  /** The header label (left of the chevron). */
  title: React.ReactNode;
  /** Optional content pinned to the header's right edge (count, badge, etc.). */
  right?: React.ReactNode;
  /** Controlled open state. Omit for uncontrolled (use `defaultOpen`). */
  open?: boolean;
  /** Initial open state when uncontrolled. Defaults to closed. */
  defaultOpen?: boolean;
  /** Fires with the next open state whenever the header is toggled (both modes). */
  onOpenChange?: (open: boolean) => void;
  /** Header emphasis: "section" (larger heading) or "sub" (smaller, muted). */
  level?: "section" | "sub";
  children: React.ReactNode;
  style?: React.CSSProperties;
  headerStyle?: React.CSSProperties;
}

/** True when the user asked the OS to minimize motion — we then skip the chevron rotation transition.
 * useSyncExternalStore reads matchMedia without an effect-setState (SSR snapshot = false). Exported so
 * other motion-aware surfaces (e.g. the assistant dock) reuse one hook. */
export function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/**
 * Collapsible — a token-styled disclosure (header button + body). Controlled or uncontrolled. The header is
 * a real <button> with aria-expanded so it's keyboard + screen-reader friendly; the body is unmounted when
 * closed (keeps large lists cheap). No external deps.
 */
export function Collapsible({
  title,
  right,
  open,
  defaultOpen = false,
  onOpenChange,
  level = "section",
  children,
  style,
  headerStyle,
}: CollapsibleProps) {
  const reduced = usePrefersReducedMotion();
  const bodyId = React.useId();
  const isControlled = open !== undefined;
  const [internal, setInternal] = React.useState(defaultOpen);
  const isOpen = isControlled ? open : internal;

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setInternal(next);
    onOpenChange?.(next);
  };

  const isSection = level === "section";

  return (
    <div style={style}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={bodyId}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          textAlign: "left",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: isSection ? "6px 0" : "4px 0",
          color: "var(--text-primary)",
          ...headerStyle,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          aria-hidden="true"
          style={{
            flex: "none",
            color: "var(--text-muted)",
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            transition: reduced ? "none" : "transform var(--duration-normal) var(--ease-out)",
          }}
        >
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {isSection ? (
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, margin: 0 }}>{title}</h2>
        ) : (
          <h3 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", margin: 0 }}>
            {title}
          </h3>
        )}
        {right != null ? <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>{right}</span> : null}
      </button>
      {isOpen ? <div id={bodyId} role="region">{children}</div> : null}
    </div>
  );
}
