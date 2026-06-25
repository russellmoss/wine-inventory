"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui";

const selectStyle: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

/**
 * Admin-only view switch between the data-entry "Manager view" (scoped to a
 * picked vineyard) and the read-only "Admin view" (dashboard / yields). Drives a
 * `?view=` (+ `?vineyard=`) query param so the server page reloads the right data;
 * admins can act on any vineyard (the scope guard allows it).
 */
export function AdminViewToggle({
  view,
  vineyards,
  selectedVineyardId,
}: {
  view: "manager" | "admin";
  vineyards?: { id: string; name: string }[];
  selectedVineyardId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();

  function go(nextView: "manager" | "admin", vineyardId?: string) {
    const sp = new URLSearchParams();
    sp.set("view", nextView);
    if (nextView === "manager" && vineyardId) sp.set("vineyard", vineyardId);
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div style={{ display: "inline-flex", gap: 6 }}>
        <Button
          variant={view === "manager" ? "primary" : "secondary"}
          size="sm"
          disabled={pending}
          onClick={() => go("manager", selectedVineyardId ?? vineyards?.[0]?.id)}
        >
          Manager view
        </Button>
        <Button
          variant={view === "admin" ? "primary" : "secondary"}
          size="sm"
          disabled={pending}
          onClick={() => go("admin")}
        >
          Admin view
        </Button>
      </div>

      {view === "manager" && vineyards && vineyards.length > 0 ? (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" }}>
          Vineyard
          <select
            value={selectedVineyardId ?? ""}
            disabled={pending}
            onChange={(e) => go("manager", e.target.value)}
            style={selectStyle}
          >
            {vineyards.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
        {view === "manager"
          ? "Entering as admin — submissions are recorded under your account."
          : "Read-only review of submitted reports."}
      </span>
    </div>
  );
}
