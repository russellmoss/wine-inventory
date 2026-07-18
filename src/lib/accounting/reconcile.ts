import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { listAllOrgIds, disconnectEnumerator } from "@/lib/accounting/enumerator";
import { getValidAccessToken, NeedsReauthError } from "@/lib/accounting/token";
import { QboAdapter } from "@/lib/accounting/qbo/client";
import type { AccountingAdapter, ProviderCallContext } from "@/lib/accounting/adapter";

// Phase 15 Unit 9 — the honest two-way leg: reconcile read-back. For each POSTED delivery, read the
// object back by its external Id. If it's gone, the accountant deleted it in QuickBooks → mark
// DELETED_IN_GL (never silently re-post; the dashboard exposes a "re-push" action). Plan 076: for an
// aggregate invoice Bill we ALSO read its outstanding Balance and reflect Paid/Outstanding back into the
// app, so a payment the bookkeeper records in QuickBooks updates Cellarhand too (the honest two-way leg for
// A/P). Heavy reads OFF the write path, bounded, enumerated as the least-privilege role (SEC-C3).

const BATCH = Number(process.env.RECONCILE_BATCH_PER_TENANT) || 100;

export type ReconcileSummary = { orgs: number; connected: number; checked: number; stillPresent: number; deletedInGl: number; paidReflected: number; paymentDiscrepancies: number; needsReauth: number };

/**
 * Plan 076 — reconcile ONE aggregate invoice Bill's payment status from its QBO Balance. Balance 0 ⇒ the Bill
 * is settled in QuickBooks; if the app didn't already know, flip the event + invoice to PAID (this is how a
 * bookkeeper's payment in QBO flows back). Balance > 0 while the app says PAID and WE never posted a
 * BillPayment ⇒ a discrepancy — surface it on the delivery, never silently flip (the app might be right, or a
 * payment was voided in QBO). Only aggregate events (an ingestedInvoiceId) carry payment status.
 */
async function reconcileBillPayment(
  adapter: AccountingAdapter,
  ctx: ProviderCallContext,
  delivery: { id: string; externalId: string; apExportEventId: string | null },
  summary: ReconcileSummary,
): Promise<void> {
  if (!delivery.apExportEventId) return;
  const ev = await prisma.apExportEvent.findUnique({
    where: { id: delivery.apExportEventId },
    select: { id: true, ingestedInvoiceId: true, paymentStatus: true, paymentExternalId: true },
  });
  if (!ev || !ev.ingestedInvoiceId) return;
  const balance = await adapter.getBillBalance(ctx, delivery.externalId);
  if (balance == null) return; // the Bill is gone — the DELETED_IN_GL path already handled it
  const paidInQbo = balance <= 0.005;

  if (paidInQbo && ev.paymentStatus !== "PAID") {
    await runInTenantTx(async (tx) => {
      await tx.apExportEvent.update({ where: { id: ev.id }, data: { paymentStatus: "PAID", paidAt: new Date() } });
      await tx.ingestedInvoice.updateMany({ where: { id: ev.ingestedInvoiceId as string }, data: { paymentStatus: "PAID", paidAt: new Date() } });
    });
    summary.paidReflected++;
  } else if (!paidInQbo && ev.paymentStatus === "PAID" && !ev.paymentExternalId) {
    await runInTenantTx((tx) =>
      tx.accountingDelivery.update({ where: { id: delivery.id }, data: { lastError: "Marked Paid here, but QuickBooks still shows a balance on this bill — reconcile the payment." } }),
    );
    summary.paymentDiscrepancies++;
  }
}

export async function runAccountingReconcileSweep(deps?: { orgIds?: string[]; adapterFactory?: () => AccountingAdapter }): Promise<ReconcileSummary> {
  const orgIds = deps?.orgIds ?? (await listAllOrgIds());
  const summary: ReconcileSummary = { orgs: orgIds.length, connected: 0, checked: 0, stillPresent: 0, deletedInGl: 0, paidReflected: 0, paymentDiscrepancies: 0, needsReauth: 0 };

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
          select: { id: true, externalId: true, objectType: true, apExportEventId: true },
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
        const adapter = deps?.adapterFactory ? deps.adapterFactory() : new QboAdapter();

        for (const d of posted) {
          const objectType = (d.objectType === "Bill" ? "Bill" : "JournalEntry") as "JournalEntry" | "Bill";
          try {
            const found = await adapter.getById(ctx, objectType, d.externalId as string);
            summary.checked++;
            if (found) {
              await runInTenantTx((tx) => tx.accountingDelivery.update({ where: { id: d.id }, data: { verifiedAt: new Date() } }));
              summary.stillPresent++;
              // Plan 076: reflect the Bill's payment status (Balance) back into the app (the two-way leg for A/P).
              if (objectType === "Bill") {
                await reconcileBillPayment(adapter, ctx, { id: d.id, externalId: d.externalId as string, apExportEventId: d.apExportEventId }, summary);
              }
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
