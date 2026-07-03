import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { listAllOrgIds, disconnectEnumerator } from "@/lib/accounting/enumerator";
import { Commerce7Adapter, commerce7CallContext, fullWebhookUrl } from "@/lib/commerce/commerce7";
import type { CommerceAdapter } from "@/lib/commerce/adapter";

// Phase 16 Unit 8 — webhook self-healing. Commerce7 permanently AUTO-DISABLES a webhook after 48h of
// failures (unrecoverable except by recreating it). Per connected tenant we probe the registered webhook;
// if it's missing or disabled we recreate it (HMAC-routed URL) and record it. The poll cursor is the
// backstop that keeps ingest correct while a webhook is down — this just restores the low-latency hint.

export type Commerce7WebhookHealthDeps = { adapterFactory?: () => CommerceAdapter; orgIds?: string[] };
export type WebhookHealthSummary = { orgs: number; connected: number; recreated: number; healthy: number; errors: number };

/** PURE: recreate when the probe shows the webhook missing (null) or disabled (active=false). */
export function webhookNeedsRecreate(probe: { active: boolean } | null): boolean {
  return probe === null || probe.active === false;
}

export async function runCommerce7WebhookHealth(deps?: Commerce7WebhookHealthDeps): Promise<WebhookHealthSummary> {
  const orgIds = deps?.orgIds ?? (await listAllOrgIds());
  const summary: WebhookHealthSummary = { orgs: orgIds.length, connected: 0, recreated: 0, healthy: 0, errors: 0 };

  try {
    for (const tenantId of orgIds) {
      await runAsTenant(tenantId, async () => {
        const conn = await prisma.commerce7Connection.findFirst({ where: { provider: "COMMERCE7", status: "CONNECTED" }, select: { externalTenantId: true, webhookId: true } });
        if (!conn || !conn.externalTenantId) return;
        summary.connected++;
        const adapter = deps?.adapterFactory ? deps.adapterFactory() : new Commerce7Adapter();
        const ctx = commerce7CallContext(conn.externalTenantId);
        try {
          const probe = conn.webhookId ? await adapter.getWebhook(ctx, conn.webhookId) : null;
          if (!webhookNeedsRecreate(probe)) {
            summary.healthy++;
            return;
          }
          if (conn.webhookId) {
            try { await adapter.deleteWebhook(ctx, conn.webhookId); } catch { /* may already be gone */ }
          }
          const { webhookId } = await adapter.createWebhook(ctx, { deliveryUrl: fullWebhookUrl(tenantId), topics: ["Create", "Update", "Delete"] });
          await runInTenantTx((tx) => tx.commerce7Connection.updateMany({ where: { provider: "COMMERCE7", status: "CONNECTED" }, data: { webhookId, webhookConfiguredAt: new Date() } }));
          summary.recreated++;
        } catch {
          summary.errors++;
        }
      });
    }
  } finally {
    await disconnectEnumerator();
  }
  return summary;
}
