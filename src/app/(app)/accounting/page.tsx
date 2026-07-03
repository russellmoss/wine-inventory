import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { Card, Badge, Eyebrow } from "@/components/ui";
import { getAccountingDashboard } from "@/lib/accounting/dashboard";
import { getCommerce7Dashboard } from "@/lib/commerce/dashboard";

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
  const [{ connection, counts, attention, needsAttention }, c7] = await Promise.all([getAccountingDashboard(), getCommerce7Dashboard()]);
  const connected = connection?.status === "CONNECTED";
  const c7Connected = c7.connection?.status === "CONNECTED";
  const C7_ORDER = ["POSTED", "PENDING", "IN_FLIGHT", "VERIFYING", "FAILED", "DELETED_IN_GL"];

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

      {/* Phase 16 — Commerce7 DTC sync status */}
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: "40px 0 6px" }}>Commerce7 (DTC sales)</h2>
      <p style={{ color: "var(--text-secondary)", marginBottom: 16, maxWidth: "60ch" }}>
        How your tasting-room, club, and online sales are flowing in — depleting inventory and posting revenue.
      </p>

      <Card style={{ maxWidth: 720 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0 }}>Connection</h3>
          <Badge tone={c7Connected ? "green" : c7.connection?.status === "PENDING_CONFIRM" ? "gold" : "neutral"}>
            {c7Connected ? "Connected" : c7.connection?.status === "PENDING_CONFIRM" ? "Confirm to finish" : "Not connected"}
          </Badge>
          {c7Connected && <Badge tone={c7.connection?.webhookHealthy ? "green" : "gold"}>{c7.connection?.webhookHealthy ? "Live updates on" : "On a timer"}</Badge>}
        </div>
        <p style={{ color: "var(--text-secondary)", margin: "8px 0 0", fontSize: 14.5 }}>
          {c7Connected ? `Connected to ${c7.connection?.companyName ?? c7.connection?.externalTenantId ?? "your Commerce7 tenant"}.` : "Set up the sync in Settings → Commerce7."}{" "}
          <Link href="/settings#commerce7" style={{ color: "var(--text-accent)" }}>Go to settings</Link>
        </p>
      </Card>

      {c7.needsAttention > 0 && (
        <Card style={{ maxWidth: 720, marginTop: 16, borderColor: "var(--danger)" }}>
          <Badge tone="red">{c7.needsAttention} need attention</Badge>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10, fontSize: 14, color: "var(--text-secondary)" }}>
            {c7.withheldOrders > 0 && <div>{c7.withheldOrders} order(s) held — an ordered product isn’t matched to a wine, or a sales account isn’t set.</div>}
            {c7.heldUnpaid > 0 && <div>{c7.heldUnpaid} unpaid/authorized order(s) waiting — nothing posts until they’re paid.</div>}
            {c7.drift.drifting > 0 && <div>{c7.drift.drifting} product(s) show an inventory difference vs Commerce7 — review, we never auto-change your store.</div>}
            {(c7.deliveryCounts.FAILED ?? 0) > 0 && <div>{c7.deliveryCounts.FAILED} revenue post(s) couldn’t sync.</div>}
            {c7Connected && !c7.connection?.webhookHealthy && <div>Live updates look stale — we’re still syncing on a timer and will restore them automatically.</div>}
          </div>
        </Card>
      )}

      <Card style={{ maxWidth: 720, marginTop: 16 }}>
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: "0 0 12px" }}>Revenue sync queue</h3>
        {C7_ORDER.every((s) => !c7.deliveryCounts[s]) ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No DTC revenue to sync yet — a paid Commerce7 order will show here.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {C7_ORDER.filter((s) => c7.deliveryCounts[s]).map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
                <Badge tone={STATUS_META[s].tone}>{STATUS_META[s].label}</Badge>
                <strong style={{ fontSize: 16 }}>{c7.deliveryCounts[s]}</strong>
              </div>
            ))}
          </div>
        )}
        {c7.drift.checkedAt && (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 12 }}>
            Inventory drift last checked {new Date(c7.drift.checkedAt).toLocaleString()} — {c7.drift.drifting} difference(s) to review.
          </p>
        )}
      </Card>
    </div>
  );
}
