"use client";

import Link from "next/link";

// Plan 034 (design review): the "Active | Archived" segmented toggle for the template builder list —
// mirrors WorkOrdersTabs (?view=archive), one entry point, not a separate nav item.

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
});

export function TemplatesTabs({ active }: { active: "active" | "archived" }) {
  return (
    <div
      role="tablist"
      aria-label="Templates view"
      style={{ display: "inline-flex", gap: 2, padding: 3, background: "var(--paper-100)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}
    >
      <Link href="/work-orders/templates" role="tab" aria-selected={active === "active"} style={seg(active === "active")}>Active</Link>
      <Link href="/work-orders/templates?view=archived" role="tab" aria-selected={active === "archived"} style={seg(active === "archived")}>Archived</Link>
    </div>
  );
}
