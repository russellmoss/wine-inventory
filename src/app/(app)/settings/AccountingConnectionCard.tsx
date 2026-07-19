"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Badge, Button, ConfirmButton, LocalTime } from "@/components/ui";
import { disconnectQuickBooks } from "@/lib/accounting/actions";

// Phase 15 Unit 4 — the "QuickBooks / Accounting" Settings card (Connect / status / Disconnect).
// Domain language only (ux-principle #5): never "OAuth", "realmId", or "token". Status is text + a
// Badge tone, never color alone. No dead-end (ux-principle #2): a failed/needs-reauth state always
// offers Reconnect. Reuses the shared UI kit + design tokens — no new visual language.

export type ConnectionSummary = {
  status: "CONNECTED" | "DISCONNECTED" | "NEEDS_REAUTH";
  companyName: string | null;
  environment: string | null;
  homeCurrency: string | null;
  connectedAt: string | null;
};

const CONNECT_HREF = "/api/accounting/qbo/connect";

export function AccountingConnectionCard({ accounting }: { accounting: ConnectionSummary | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const status = accounting?.status ?? "DISCONNECTED";
  const connected = status === "CONNECTED";
  const needsReauth = status === "NEEDS_REAUTH";

  const notice = params.get("qbo_error");
  const justConnected = params.get("qbo_connected") === "1";

  function goConnect() {
    window.location.href = CONNECT_HREF;
  }

  function doDisconnect() {
    setError(null);
    startTransition(async () => {
      try {
        await disconnectQuickBooks();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't disconnect QuickBooks.");
      }
    });
  }

  const badge = connected
    ? { tone: "green" as const, label: "Connected" }
    : needsReauth
      ? { tone: "red" as const, label: "Reconnect needed" }
      : { tone: "neutral" as const, label: "Not connected" };

  return (
    <Card id="accounting" style={{ maxWidth: 560, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0 }}>QuickBooks</h2>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {connected && accounting?.environment === "sandbox" && <Badge tone="blue">Sandbox</Badge>}
      </div>

      <p style={{ color: "var(--text-secondary)", margin: "6px 0 16px", fontSize: 14.5, maxWidth: "52ch" }}>
        Send your bottling costs, inventory-value moves, and supply bills straight into your own
        QuickBooks Online books, and keep them reconciled when you make corrections.
      </p>

      {/* Notices from the connect round-trip (no dead-end — an error still leaves Connect available). */}
      {justConnected && !notice && (
        <p style={{ color: "var(--deep-green)", fontSize: 14, marginBottom: 12 }}>
          Connected. Next, map your accounts below so we know where each cost posts.
        </p>
      )}
      {notice && (
        <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }}>
          Couldn&apos;t connect — {notice}
        </p>
      )}
      {error && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }}>{error}</p>}

      {needsReauth && (
        <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }}>
          QuickBooks needs you to sign in again to keep syncing.
        </p>
      )}

      {connected ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, color: "var(--text-primary)" }}>
              Connected to <strong>{accounting?.companyName ?? "your QuickBooks company"}</strong>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
              {accounting?.homeCurrency ? `Books in ${accounting.homeCurrency}` : "QuickBooks Online"}
              {accounting?.connectedAt ? <> · connected <LocalTime value={accounting.connectedAt} mode="date" /></> : ""}
            </div>
          </div>
          <ConfirmButton onConfirm={doDisconnect} confirmLabel="Disconnect" disabled={pending}>
            Disconnect
          </ConfirmButton>
        </div>
      ) : (
        <Button variant="primary" onClick={goConnect} disabled={pending}>
          {needsReauth ? "Reconnect QuickBooks" : "Connect QuickBooks"}
        </Button>
      )}
    </Card>
  );
}
