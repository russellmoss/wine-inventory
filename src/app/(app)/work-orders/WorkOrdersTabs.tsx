"use client";

import Link from "next/link";

// Phase 9.1 (Unit 5, D1): the "Open | Archive" segmented toggle at the top of /work-orders. Not a separate
// route/nav item — the archive is the same page with ?view=archive. One entry point, lower friction.

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

export function WorkOrdersTabs({ active }: { active: "open" | "archive" }) {
  return (
    <div
      role="tablist"
      aria-label="Work orders view"
      style={{ display: "inline-flex", gap: 2, padding: 3, background: "var(--paper-100)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}
    >
      <Link href="/work-orders" role="tab" aria-selected={active === "open"} style={seg(active === "open")}>Open</Link>
      <Link href="/work-orders?view=archive" role="tab" aria-selected={active === "archive"} style={seg(active === "archive")}>Archive</Link>
    </div>
  );
}
