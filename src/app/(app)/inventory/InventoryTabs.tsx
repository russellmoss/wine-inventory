"use client";

import Link from "next/link";
import { INVENTORY_SECTIONS, SECTION_LABELS, sectionHref, type InventorySection } from "./sections-shared";

// Plan 080 U6 — the unified Inventory page's section nav. URL-driven (`?section=…`) rather than local
// state, following work-orders/WorkOrdersTabs: the assistant's `navigate` tool, the redirects from the old
// routes, and a shared/bookmarked link all have to resolve to a specific section, which local state can't
// do. The server page reads the same param and renders ONLY that section, so the heavy panels are never
// all mounted at once.
//
// The vocabulary + coercion live in ./sections-shared (no "use client") because the SERVER page calls
// them too — calling a client function from the server is a runtime error that the build does not catch.

const seg = (active: boolean): React.CSSProperties => ({
  padding: "7px 16px",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  fontWeight: active ? 600 : 500,
  color: active ? "var(--surface-raised)" : "var(--text-secondary)",
  background: active ? "var(--wine-primary)" : "transparent",
  border: "none",
  borderRadius: "calc(var(--radius-md) - 2px)",
  textDecoration: "none",
  cursor: "pointer",
  minHeight: 36,
  display: "inline-flex",
  alignItems: "center",
  whiteSpace: "nowrap",
});

export function InventoryTabs({ active }: { active: InventorySection }) {
  return (
    <div
      role="tablist"
      aria-label="Inventory section"
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 3,
        background: "var(--paper-100)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        maxWidth: "100%",
        overflowX: "auto",
      }}
    >
      {INVENTORY_SECTIONS.map((s) => (
        <Link key={s} href={sectionHref(s)} role="tab" aria-selected={active === s} style={seg(active === s)}>
          {SECTION_LABELS[s]}
        </Link>
      ))}
    </div>
  );
}
