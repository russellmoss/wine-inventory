import React from "react";
import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  /** Group / Destination / Object. The LAST crumb is the current page. */
  items: Crumb[];
  style?: React.CSSProperties;
}

/**
 * Breadcrumbs — `Group / Destination / Object` (v2 §B5, doc 01 §6).
 *
 * Derived from the route plus the object's own parentage, NEVER from navigation
 * history: a trail that changes depending on how you arrived is not a location,
 * it is a log.
 *
 * Max 4 crumbs; the middle collapses to an ellipsis. The final crumb is the
 * current page, is not a link, and carries `aria-current="page"`.
 */
export function Breadcrumbs({ items, style }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  // Collapse the middle, keeping the first and the last two — the ones that
  // actually orient you.
  const shown: (Crumb | "ellipsis")[] =
    items.length > 4 ? [items[0], "ellipsis", items[items.length - 2], items[items.length - 1]] : items;

  return (
    <nav aria-label="Breadcrumb" style={{ fontFamily: "var(--font-body)", fontSize: 13, ...style }}>
      <ol
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 6,
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {shown.map((c, i) => {
          const last = i === shown.length - 1;
          return (
            <li key={c === "ellipsis" ? `e${i}` : `${c.label}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {i > 0 ? (
                <span aria-hidden="true" style={{ color: "var(--paper-400)" }}>
                  /
                </span>
              ) : null}
              {c === "ellipsis" ? (
                <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
                  …
                </span>
              ) : last ? (
                <span aria-current="page" style={{ color: "var(--text-primary)" }}>
                  {c.label}
                </span>
              ) : c.href ? (
                <Link href={c.href} style={{ color: "var(--text-muted)" }}>
                  {c.label}
                </Link>
              ) : (
                <span style={{ color: "var(--text-muted)" }}>{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
