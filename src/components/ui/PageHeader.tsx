import React from "react";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";
import { Eyebrow } from "./Eyebrow";

export interface PageHeaderProps {
  title: React.ReactNode;
  /** Group / Destination / Object. Omit on a top-level destination. */
  breadcrumbs?: Crumb[];
  eyebrow?: React.ReactNode;
  /**
   * One sentence about what needs attention — NOT a description of the page.
   * "3 work orders are overdue" beats "This page lists work orders".
   */
  summary?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small facts under the title: counts, last-updated, owner. */
  meta?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * PageHeader — one header pattern for every screen (v2 §B4).
 *
 * Replaces `h1` hand-set per page. The handoff said four sizes were in use
 * (40/36/32/22); the real count measured NINE — 22, 24, 26, 30, 32, 34, 36, 40
 * and 52 across 61 headings. This normalises to 34px desktop / 30px below.
 *
 * Exactly one `h1` per page. The summary is plain text, never a heading — it
 * would otherwise land in the heading outline and make the page read as two
 * titles to a screen reader.
 */
export function PageHeader({
  title,
  breadcrumbs,
  eyebrow,
  summary,
  actions,
  meta,
  style,
}: PageHeaderProps) {
  return (
    <header style={{ marginBottom: "var(--section-gap)", ...style }}>
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} style={{ marginBottom: 8 }} /> : null}
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          flexWrap: "wrap",
          marginTop: eyebrow ? 6 : 0,
        }}
      >
        <h1
          className="ds-page-title"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: "var(--weight-regular)" as unknown as number,
            lineHeight: "var(--leading-snug)",
            margin: 0,
            minWidth: 0,
          }}
        >
          {title}
        </h1>
        {actions ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: "none" }}>{actions}</div>
        ) : null}
      </div>
      {summary ? (
        <p
          style={{
            margin: "8px 0 0",
            maxWidth: "68ch",
            fontSize: 15,
            lineHeight: "var(--leading-normal)",
            color: "var(--text-secondary)",
          }}
        >
          {summary}
        </p>
      ) : null}
      {meta ? (
        <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--text-meta)" }}>{meta}</div>
      ) : null}
    </header>
  );
}
