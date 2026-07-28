import React from "react";

export interface SkeletonProps {
  /** Match the resolved element's box exactly, or nothing shifts on resolve (AC-C11). */
  width?: number | string;
  height?: number | string;
  /** Shorthand boxes for the common cases. */
  variant?: "text" | "line" | "block" | "chip";
  /** Round the corners like the element it stands in for. */
  radius?: string;
  /**
   * Announced once, politely, for the whole loading region. Name what is loading —
   * "Loading your work orders…" beats "Loading…". Pass `null` on a Skeleton that
   * sits inside an already-announced region, so screen readers hear it once.
   */
  label?: string | null;
  count?: number;
  style?: React.CSSProperties;
}

const VARIANTS: Record<NonNullable<SkeletonProps["variant"]>, { width: number | string; height: number; radius: string }> = {
  text: { width: "100%", height: 15, radius: "var(--radius-xs)" },
  line: { width: "60%", height: 12, radius: "var(--radius-xs)" },
  block: { width: "100%", height: 96, radius: "var(--radius-md)" },
  chip: { width: 72, height: 24, radius: "var(--radius-pill)" },
};

/**
 * Skeleton — a placeholder that occupies the resolved element's exact box (v2 §B29).
 *
 * The pulse is a CSS animation (`ds-skeleton-pulse`, defined in globals.css), not a
 * JS loop, so the global `prefers-reduced-motion` rule switches it off for free.
 *
 * Two local skeletons predate this one — `SkeletonRow` in VesselTimeline.tsx and
 * `SummarySkeleton` in VineyardModal.tsx. They are consolidation candidates, not
 * migrated here: Phase 1 is additive and does not force-migrate call sites.
 */
export function Skeleton({ width, height, variant = "text", radius, label, count = 1, style }: SkeletonProps) {
  const v = VARIANTS[variant];
  const bar = (i: number) => (
    <span
      key={i}
      aria-hidden="true"
      className="ds-skeleton"
      style={{
        display: "block",
        width: width ?? v.width,
        height: height ?? v.height,
        borderRadius: radius ?? v.radius,
        background: "var(--paper-200)",
        ...style,
      }}
    />
  );

  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {label === undefined ? (
        <span className="sr-only" aria-live="polite">
          Loading…
        </span>
      ) : label === null ? null : (
        <span className="sr-only" aria-live="polite">
          {label}
        </span>
      )}
      {Array.from({ length: Math.max(1, count) }, (_, i) => bar(i))}
    </span>
  );
}
