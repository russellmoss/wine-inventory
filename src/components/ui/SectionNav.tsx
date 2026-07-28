"use client";

import React from "react";
import Link from "next/link";

export interface SectionNavItem {
  href: string;
  label: string;
  count?: number;
}

export interface SectionNavProps {
  items: SectionNavItem[];
  /** The currently active href. */
  current: string;
  /** Names the sub-navigation, e.g. "Work orders sections". */
  label: string;
  style?: React.CSSProperties;
}

/**
 * SectionNav — sub-navigation within a destination (v2 §B2).
 *
 * **Deliberately NOT `role="tablist"`.** These NAVIGATE — each item is a real
 * link to a real URL — so it is a plain `<nav>` with `aria-current="page"`. Tab
 * semantics would promise a screen-reader user that arrow keys swap a panel in
 * place, and then the page would navigate out from under them.
 *
 * 44px tall (the existing work-order toggle is 36px). More than 5 items is a
 * sign the destination should split.
 */
export function SectionNav({ items, current, label, style }: SectionNavProps) {
  return (
    <nav
      aria-label={label}
      style={{
        display: "flex",
        gap: 4,
        overflowX: "auto",
        borderBottom: "1px solid var(--border-strong)",
        marginBottom: "var(--section-gap)",
        ...style,
      }}
    >
      {items.map((it) => {
        const active = it.href === current;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: "var(--touch-min)",
              padding: "0 14px",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-body)",
              fontSize: 14.5,
              color: active ? "var(--text-accent)" : "var(--text-secondary)",
              fontWeight: active ? 600 : 400,
              // The active marker is a bottom rule, not a fill: a filled tab in a
              // scrolling strip reads as a button and invites a second click.
              boxShadow: active ? "inset 0 -2px 0 0 var(--accent)" : "none",
              textDecoration: "none",
            }}
          >
            {it.label}
            {it.count != null && it.count > 0 ? (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--accent-soft)",
                  color: "var(--wine-primary)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {it.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
