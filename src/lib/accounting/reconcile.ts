import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { listAllOrgIds, disconnectEnumerator } from "@/lib/accounting/enumerator";
import { getValidAccessToken, NeedsReauthError } from "@/lib/accounting/token";
import { QboAdapter } from "@/lib/accounting/qbo/client";
import type { ProviderCallContext } from "@/lib/accounting/adapter";

// Phase 15 Unit 9 — the honest two-way leg: reconcile read-back. For each POSTED delivery, read the
// object back by its external Id. If it's gone, the accountant deleted it in QuickBooks → mark
// DELETED_IN_GL (never silently re-post; the dashboard exposes a "re-push" action). AP Bill payment
// status is pulled in the U10 path. Heavy reads OFF the write path, bounded, enumerated as the
// least-privilege role (SEC-C3).

const BATCH = Number(process.env.RECONCILE_BATCH_PER_TENANT) || 100;

export type ReconcileSummary = { orgs: number; connected: number; checked: number; stillPresent: number; deletedInGl: number; needsReauth: number };

export async function runAccountingReconcileSweep(): Promise<ReconcileSummary> {
  const orgIds = await listAllOrgIds();
  const summary: ReconcileSummary = { orgs: orgIds.length, connected: 0, checked: 0, stillPresent: 0, deletedInGl: 0, needsReauth: 0 };

  try {
    for (const tenantId of orgIds) {
      await runAsTenant(tenantId, async () => {
        const conn = await prisma.accountingConnection.findFirst({
          where: { provider: "QBO", status: "CONNECTED" },
          select: { id: true, externalRealmId: true, environment: true },
        });
        if (!conn || !conn.externalRealmId) return;
        summary.connected++;

        const posted = await prisma.accountingDelivery.findMany({
          where: { status: "POSTED", externalId: { not: null } },
          select: { id: true, externalId: true, objectType: true },
          orderBy: { verifiedAt: "asc" }, // reconcile the stalest first
          take: BATCH,
        });
        if (posted.length === 0) return;

        let accessToken: string;
        try {
          accessToken = await getValidAccessToken(conn.id);
        } catch (e) {
          if (e instanceof NeedsReauthError) {
            summary.needsReauth++;
            return;
          }
          throw e;
        }
        const ctx: ProviderCallContext = { accessToken, realmId: conn.externalRealmId, environment: conn.environment as ProviderCallContext["environment"] };
        const adapter = new QboAdapter();

        for (const d of posted) {
          const objectType = (d.objectType === "Bill" ? "Bill" : "JournalEntry") as "JournalEntry" | "Bill";
          try {
            const found = await adapter.getById(ctx, objectType, d.externalId as string);
            summary.checked++;
            if (found) {
              await runInTenantTx((tx) => tx.accountingDelivery.update({ where: { id: d.id }, data: { verifiedAt: new Date() } }));
              summary.stillPresent++;
            } else {
              await runInTenantTx((tx) => tx.accountingDelivery.update({ where: { id: d.id }, data: { status: "DELETED_IN_GL", verifiedAt: new Date() } }));
              summary.deletedInGl++;
            }
          } catch {
            // a transient read error just leaves the row POSTED; the next sweep retries.
          }
        }
      });
    }
  } finally {
    await disconnectEnumerator();
  }
  return summary;
}
