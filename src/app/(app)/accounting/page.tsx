import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { Card, Badge, Eyebrow } from "@/components/ui";
import { getAccountingDashboard } from "@/lib/accounting/dashboard";

export const metadata = { title: "Accounting" };
export const dynamic = "force-dynamic";

// Phase 15 Unit 12 — the sync-status dashboard (its own left-nav item). Read-only: connection health,
// the delivery queue by status, and the rows that need attention. Domain language only (never
// JournalEntry/realmId/debit); status by text + Badge tone, never color alone. Reuses the UI kit.

// Delivery status → { tone, label } per the Design & UX Spec (word ALWAYS shown).
const STATUS_META: Record<string, { tone: "green" | "blue" | "gold" | "red" | "neutral"; label: string }> = {
  POSTED: { tone: "green", label: "Posted to QuickBooks" },
  PENDING: { tone: "blue", label: "Waiting to sync" },
  IN_FLIGHT: { tone: "blue", label: "Sending…" },
  VERIFYING: { tone: "blue", label: "Confirming…" },
  WITHHELD: { tone: "gold", label: "Needs attention" },
  FAILED: { tone: "red", label: "Couldn’t post" },
  DELETED_IN_GL: { tone: "neutral", label: "Deleted in QuickBooks" },
};

const ORDER = ["POSTED", "PENDING", "IN_FLIGHT", "VERIFYING", "FAILED", "DELETED_IN_GL"];

export default async function AccountingPage() {
  await requireAdmin();
  const { connection, counts, attention, needsAttention } = await getAccountingDashboard();
  const connected = connection?.status === "CONNECTED";

  return (
    <div>
      <Eyebrow rule>Winery</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Accounting</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "60ch" }}>
        How your bottling costs, inventory moves, and supply bills are syncing to QuickBooks.
      </p>

      {/* Connection health + no dead-end */}
      <Card style={{ maxWidth: 720 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0 }}>Connection</h2>
          <Badge tone={connected ? "green" : connection?.status === "NEEDS_REAUTH" ? "red" : "neutral"}>
            {connected ? "Connected" : connection?.status === "NEEDS_REAUTH" ? "Reconnect needed" : "Not connected"}
          </Badge>
        </div>
        <p style={{ color: "var(--text-secondary)", margin: "8px 0 0", fontSize: 14.5 }}>
          {connected
            ? `Connected to ${connection?.companyName ?? "your QuickBooks company"}${connection?.homeCurrency ? ` · books in ${connection.homeCurrency}` : ""}.`
            : "Set up the sync in Settings → QuickBooks."}
          {" "}
          <Link href="/settings#accounting" style={{ color: "var(--text-accent)" }}>Go to settings</Link>
        </p>
      </Card>

      {/* N items need attention */}
      {needsAttention > 0 && (
        <Card style={{ maxWidth: 720, marginTop: 16, borderColor: "var(--danger)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge tone="red">{needsAttention} need attention</Badge>
          </div>
          <p style={{ color: "var(--text-secondary)", margin: "8px 0 0", fontSize: 14 }}>
            These didn’t sync and won’t retry on their own. Fix the cause and they’ll go out on the next run.
          </p>
        </Card>
      )}

      {/* Queue by status */}
      <Card style={{ maxWidth: 720, marginTop: 16 }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: "0 0 12px" }}>Sync queue</h2>
        {ORDER.every((s) => !counts[s]) ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Nothing to sync yet — finalize a bottling to see it here.
          </p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {ORDER.filter((s) => counts[s]).map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                <Badge tone={STATUS_META[s].tone}>{STATUS_META[s].label}</Badge>
                <strong style={{ fontSize: 16 }}>{counts[s]}</strong>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Attention rows */}
      {attention.length > 0 && (
        <Card style={{ maxWidth: 720, marginTop: 16 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: "0 0 12px" }}>Needs a look</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {attention.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <Badge tone={STATUS_META[a.status]?.tone ?? "neutral"}>{STATUS_META[a.status]?.label ?? a.status}</Badge>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                    {a.objectType === "Bill" ? "Supply bill" : "Cost entry"}
                    {a.lastError ? ` · ${a.lastError}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {new Date(a.updatedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
