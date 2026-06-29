import Link from "next/link";

/**
 * D9: a manager may now belong to MORE THAN ONE vineyard. When they do, this renders a
 * row of links that switch the active vineyard via `?vineyard=<id>` on the current route.
 * A single-vineyard manager (the common case) sees nothing — behavior is unchanged.
 */
export function ManagerVineyardSwitcher({
  vineyards,
  selectedId,
}: {
  vineyards: { id: string; name: string }[];
  selectedId: string;
}) {
  if (vineyards.length <= 1) return null;
  return (
    <div
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}
      role="navigation"
      aria-label="Switch vineyard"
    >
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Your vineyards:</span>
      {vineyards.map((v) => {
        const active = v.id === selectedId;
        return (
          <Link
            key={v.id}
            href={`?vineyard=${v.id}`}
            aria-current={active ? "page" : undefined}
            style={{
              minHeight: 36,
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 14px",
              borderRadius: "var(--radius-pill)",
              border: `1px solid ${active ? "var(--accent)" : "var(--border-strong)"}`,
              background: active ? "var(--accent-soft)" : "var(--surface-raised)",
              color: active ? "var(--text-accent)" : "var(--text-primary)",
              fontSize: 14,
              fontWeight: active ? 600 : 400,
              textDecoration: "none",
            }}
          >
            {v.name}
          </Link>
        );
      })}
    </div>
  );
}
