"use client";

import React from "react";
import Link from "next/link";

export interface MobileTab {
  href: string;
  label: string;
  glyph: string;
  badge?: number;
}

/**
 * MobileTabBar — four labelled bottom tabs, ≤1023px (doc 01 §9, v2 §B3).
 *
 * Replaces the `☰` drawer, whose trigger measured 38×32px: the single most
 * important control on the phone, below the minimum target size.
 *
 * **Labels are always visible.** Icon-only navigation is prohibited by the design
 * system, and a cellar hand in gloves reading a 24px glyph in bright sun is
 * exactly the case that rule exists for.
 *
 * `Find` holds the complete destination directory, so nothing becomes
 * unreachable on a phone just because it left the four tabs.
 */
export function MobileTabBar({ tabs, isActive }: { tabs: MobileTab[]; isActive: (href: string) => boolean }) {
  return (
    <nav
      aria-label="Main"
      className="bw-tabbar"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        display: "grid",
        gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
        background: "var(--surface-raised)",
        borderTop: "1px solid var(--border-strong)",
        // The safe-area inset keeps the tabs above the home indicator; without it
        // the bottom row is unreachable on any modern iPhone.
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {tabs.map((t) => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            style={{
              // The tap target spans the whole cell, not just the glyph.
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              minHeight: 56,
              padding: "6px 4px",
              textDecoration: "none",
              color: active ? "var(--text-accent)" : "var(--ink-700)",
              fontWeight: active ? 600 : 400,
            }}
          >
            <span style={{ position: "relative", fontSize: "var(--icon-tab)", lineHeight: 1 }} aria-hidden="true">
              {t.glyph}
              {t.badge != null && t.badge > 0 ? (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -10,
                    minWidth: 16,
                    height: 16,
                    padding: "0 4px",
                    borderRadius: "var(--radius-pill)",
                    background: "var(--accent)",
                    color: "var(--accent-on)",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {t.badge}
                </span>
              ) : null}
            </span>
            <span style={{ fontFamily: "var(--font-body)", fontSize: 12 }}>{t.label}</span>
            {t.badge != null && t.badge > 0 ? (
              <span className="sr-only">{`${t.badge} open`}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
