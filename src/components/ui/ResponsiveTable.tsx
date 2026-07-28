"use client";

import React from "react";

export interface ResponsiveTableProps {
  /**
   * Names the table for assistive tech. Required — a scroll region with no name
   * is announced as "region" and nothing else.
   */
  caption: string;
  /** Show the caption visually, or keep it screen-reader-only (the usual case). */
  showCaption?: boolean;
  /**
   * `scroll` (default) keeps real table semantics and scrolls horizontally.
   * `stack` collapses each row to a labelled block at ≤767px, for tables whose
   * rows are objects rather than a matrix.
   */
  transform?: "scroll" | "stack";
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * ResponsiveTable — real table semantics at every width (v2 §B15, doc 04 §4).
 *
 * ## Why this exists
 * `globals.css` has one global rule that sets `display: block` on every table
 * under 767px. `display: block` **destroys table semantics**: the rows and cells
 * stop being rows and cells, so a screen reader loses the row/column
 * relationships entirely and announces a flat run of text. It applies to all 33
 * tables in the app whether or not it suits them.
 *
 * ## How the migration works, and why it is safe
 * This component stamps `data-rt` on the table it owns. The global rule is
 * scoped to `.app-main table:not([data-rt])`, so a migrated table opts ITSELF
 * out. The blast radius shrinks monotonically as tables migrate, a partially
 * migrated app is always correct, and no table can ever end up with neither
 * treatment. The global rule is deleted only when the last table has moved.
 */
export function ResponsiveTable({
  caption,
  showCaption = false,
  transform = "scroll",
  children,
  style,
}: ResponsiveTableProps) {
  const captionId = React.useId();

  return (
    <div
      role="region"
      aria-labelledby={captionId}
      // Focusable so a keyboard user can actually reach and scroll the region —
      // a scroll container that only a mouse can pan is a trap (WCAG 2.1.1).
      tabIndex={0}
      data-rt-scroll={transform}
      style={{
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        borderRadius: "var(--radius-md)",
        ...style,
      }}
    >
      <span id={captionId} className={showCaption ? undefined : "sr-only"}>
        {caption}
      </span>
      <table
        data-rt={transform}
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "var(--font-body)",
          fontSize: 14,
        }}
      >
        {children}
      </table>
    </div>
  );
}
