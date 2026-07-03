"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, Badge, Button, ConfirmButton } from "@/components/ui";
import { confirmCommerce7, disconnectCommerce7 } from "@/lib/commerce/actions";

// Phase 16 Unit 3 — the "Commerce7 / DTC sales" Settings card. Nonce-bound install flow: Connect →
// authorize in Commerce7 → return here in PENDING_CONFIRM → explicit "Link <winery> to this workspace?"
// confirm → Connected. Domain language only (never "webhook secret"/"nonce"). Status by text + Badge
// tone, never color alone. No dead-end. Surfaces a webhook-health chip (amber when stale). Reuses the
// shared UI kit + design tokens.

export type Commerce7ConnectionSummary = {
  status: "CONNECTED" | "DISCONNECTED" | "NEEDS_REAUTH" | "PENDING_CONFIRM";
  companyName: string | null;
  externalTenantId: string | null;
  environment: string | null;
  connectedAt: string | null;
  webhookHealthy: boolean;
  lastWebhookAt: string | null;
};

const CONNECT_HREF = "/api/commerce7/connect";

export function Commerce7ConnectionCard({ commerce7 }: { commerce7: Commerce7ConnectionSummary | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const status = commerce7?.status ?? "DISCONNECTED";
  const connected = status === "CONNECTED";
  const pendingConfirm = status === "PENDING_CONFIRM";

  const notice = params.get("c7_error");
  const justInstalled = params.get("c7_installed") === "1";

  function goConnect() {
    window.location.href = CONNECT_HREF;
  }

  function doConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        await confirmCommerce7();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't finish connecting Commerce7.");
      }
    });
  }

  function doDisconnect() {
    setError(null);
    startTransition(async () => {
      try {
        await disconnectCommerce7();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't disconnect Commerce7.");
      }
    });
  }

  const badge = connected
    ? { tone: "green" as const, label: "Connected" }
    : pendingConfirm
      ? { tone: "gold" as const, label: "Confirm to finish" }
      : status === "NEEDS_REAUTH"
        ? { tone: "red" as const, label: "Reconnect needed" }
        : { tone: "neutral" as const, label: "Not connected" };

  return (
    <Card id="commerce7" style={{ maxWidth: 560, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0 }}>Commerce7 (DTC sales)</h2>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {connected && commerce7?.environment === "sandbox" && <Badge tone="blue">Sandbox</Badge>}
        {connected && (
          <Badge tone={commerce7?.webhookHealthy ? "green" : "gold"}>
            {commerce7?.webhookHealthy ? "Live updates on" : "Updates syncing on a timer"}
          </Badge>
        )}
      </div>

      <p style={{ color: "var(--text-secondary)", margin: "6px 0 16px", fontSize: 14.5, maxWidth: "52ch" }}>
        Pull your Commerce7 tasting-room, club, and online sales in — depleting finished-goods inventory and
        posting DTC revenue to QuickBooks — so a bottle&apos;s whole journey lands in one place.
      </p>

      {justInstalled && !notice && pendingConfirm && (
        <p style={{ color: "var(--deep-green)", fontSize: 14, marginBottom: 12 }}>
          Almost there — confirm below to link this Commerce7 tenant to your workspace.
        </p>
      )}
      {notice && (
        <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }}>Couldn&apos;t connect — {notice}</p>
      )}
      {error && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 12 }}>{error}</p>}

      {connected ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, color: "var(--text-primary)" }}>
              Connected to <strong>{commerce7?.companyName ?? commerce7?.externalTenantId ?? "your Commerce7 tenant"}</strong>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
              {commerce7?.connectedAt ? `Connected ${new Date(commerce7.connectedAt).toLocaleDateString()}` : "Commerce7"}
              {commerce7?.lastWebhookAt ? ` · last update ${new Date(commerce7.lastWebhookAt).toLocaleString()}` : ""}
            </div>
          </div>
          <ConfirmButton onConfirm={doDisconnect} confirmLabel="Disconnect" disabled={pending}>
            Disconnect
          </ConfirmButton>
        </div>
      ) : pendingConfirm ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={doConfirm} disabled={pending}>
            {pending ? "Linking…" : `Link ${commerce7?.externalTenantId ?? "this tenant"} to this workspace`}
          </Button>
          <ConfirmButton onConfirm={doDisconnect} confirmLabel="Cancel" disabled={pending}>
            Cancel
          </ConfirmButton>
        </div>
      ) : (
        <Button variant="primary" onClick={goConnect} disabled={pending}>
          {status === "NEEDS_REAUTH" ? "Reconnect Commerce7" : "Connect Commerce7"}
        </Button>
      )}
    </Card>
  );
}
