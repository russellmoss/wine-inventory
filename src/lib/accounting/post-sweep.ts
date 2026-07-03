import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsTenant, requireTenantId } from "@/lib/tenant/context";
import { runInTenantTx, runInTenantRawTx } from "@/lib/tenant/tx";
import { listAllOrgIds, disconnectEnumerator } from "@/lib/accounting/enumerator";
import { getValidAccessToken, NeedsReauthError } from "@/lib/accounting/token";
import { QboAdapter, docNumberFor } from "@/lib/accounting/qbo/client";
import { buildJournalFromExport, buildSalesDeltaJournal } from "@/lib/accounting/qbo/journal";
import { componentLabel } from "@/lib/accounting/components";
import { buildBillPayload } from "@/lib/accounting/qbo/bill";
import { emitExportForSnapshot } from "@/lib/cost/export-emit";
import { ProviderFault, type AccountingAdapter, type ProviderCallContext } from "@/lib/accounting/adapter";

// Test seams (Unit 13): inject a mock adapter + an explicit org list so the idempotency harness drives
// the whole claim→post→verify machinery deterministically, offline. Production passes nothing.
export type PostSweepDeps = { adapterFactory?: () => AccountingAdapter; orgIds?: string[] };

// Phase 15 Unit 8 — the outbound poster. ONE sweep, ONE state machine over the UNION of pending
// AccountingDelivery rows (COGS now; AP Bills plug in at U10 by objectType). Exactly-once + crash-safe:
//   (1) atomically CLAIM a BOUNDED batch (FOR UPDATE SKIP LOCKED → IN_FLIGHT + a lease) in a short tx;
//   (2) OUTSIDE the tx, build a balanced JE, and QUERY-BEFORE-POST by DocNumber (adopt an existing one
//       so a crash between QBO-accept and finalize never double-posts);
//   (3) finalize each row individually → POSTED / VERIFYING / FAILED.
// Bounded work + drain-over-ticks: each run posts at most the claimed batch; expired leases return to
// PENDING (self-healing). Enumerates org ids as the least-privilege role (SEC-C3); never runAsSystem.

const BATCH = Number(process.env.POST_BATCH_PER_TENANT) || 50;
const LEASE_MIN = 5;
const REEMIT_BATCH = 25;

export type PostSweepSummary = {
  orgs: number;
  connected: number;
  reEmitted: number;
  claimed: number;
  posted: number;
  adopted: number;
  verifying: number;
  failed: number;
  needsReauth: number;
};

/** Re-emit snapshots that became postable AFTER mapping (bottled-before-mapping). Bounded anti-join. */
async function reEmitPostable(): Promise<number> {
  const rows = await runInTenantRawTx((tx, tenantId) =>
    tx.$queryRaw<{ id: string }[]>`
      SELECT s.id FROM "bottling_cost_snapshot" s
      LEFT JOIN "cost_export_event" e ON e."sourceSnapshotId" = s.id AND e."tenantId" = s."tenantId"
      WHERE s."tenantId" = ${tenantId} AND s."basisCompleteness" = 'KNOWN' AND s."postingKey" IS NOT NULL AND e.id IS NULL
      LIMIT ${REEMIT_BATCH}`,
  );
  let n = 0;
  for (const r of rows) {
    const res = await emitExportForSnapshot(r.id);
    if (res.emitted > 0) n++;
  }
  return n;
}

/** Claim up to BATCH pending/verifying/expired deliveries → IN_FLIGHT with a fresh lease. Atomic. */
async function claimBatch(): Promise<string[]> {
  const rows = await runInTenantRawTx((tx, tenantId) =>
    tx.$queryRaw<{ id: string }[]>`
      UPDATE "accounting_delivery"
      SET status = 'IN_FLIGHT', "claimedAt" = now(), "leaseExpiresAt" = now() + make_interval(mins => ${LEASE_MIN}::int),
          "attemptCount" = "attemptCount" + 1, "updatedAt" = now()
      WHERE id IN (
        SELECT id FROM "accounting_delivery"
        WHERE "tenantId" = ${tenantId}
          AND ( status IN ('PENDING','VERIFYING') OR (status = 'IN_FLIGHT' AND "leaseExpiresAt" < now()) )
        ORDER BY "createdAt" ASC
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`,
  );
  return rows.map((r) => r.id);
}

async function finalize(id: string, data: Record<string, unknown>): Promise<void> {
  await runInTenantTx((tx) => tx.accountingDelivery.update({ where: { id }, data }));
}

/** Post one COGS/inventory JournalEntry delivery. Query-before-post makes it exactly-once. */
async function postOne(
  adapter: AccountingAdapter,
  ctx: ProviderCallContext,
  d: { id: string; costExportEventId: string | null; apExportEventId: string | null; salesExportEventId: string | null; postingDate: Date | null },
  summary: PostSweepSummary,
): Promise<void> {
  if (d.salesExportEventId) return postSale(adapter, ctx, d, summary);
  if (d.apExportEventId) return postBill(adapter, ctx, d, summary);
  if (!d.costExportEventId) return;
  const ev = await prisma.costExportEvent.findUnique({
    where: { id: d.costExportEventId },
    select: { postingKey: true, amount: true, debitAccount: true, creditAccount: true, currency: true, component: true, skuId: true },
  });
  if (!ev) {
    await finalize(d.id, { status: "FAILED", lastError: "source export event missing" });
    summary.failed++;
    return;
  }
  const postingDate = d.postingDate ?? new Date();
  const docNumber = docNumberFor(ev.postingKey);
  // Human-readable memo so a bookkeeper can trace the entry (the postingKey stays the DocNumber id).
  const wine = ev.skuId ? await prisma.wineSku.findUnique({ where: { id: ev.skuId }, select: { name: true, vintage: true } }) : null;
  const wineLabel = wine ? `${wine.name}${wine.vintage ? ` ${wine.vintage}` : ""}` : null;
  const memo = `Cellarhand · ${componentLabel(ev.component)}${wineLabel ? ` · ${wineLabel}` : ""}`;

  try {
    // Query-before-post: did a prior (possibly crashed) attempt already land this DocNumber?
    const existing = await adapter.findByDocNumber(ctx, "JournalEntry", docNumber);
    if (existing) {
      await finalize(d.id, { status: "POSTED", externalId: existing.externalId, requestId: docNumber, postingDate, verifiedAt: new Date(), lastError: null });
      summary.adopted++;
      return;
    }
    const je = buildJournalFromExport(
      { postingKey: ev.postingKey, amount: Number(ev.amount), debitAccount: ev.debitAccount, creditAccount: ev.creditAccount, currency: ev.currency, memo, lineDescription: memo },
      postingDate,
    );
    const result = await adapter.postJournalEntry(ctx, je, docNumber);
    await finalize(d.id, { status: "POSTED", externalId: result.externalId, requestId: docNumber, postingDate, verifiedAt: new Date(), lastError: null });
    summary.posted++;
  } catch (e) {
    if (e instanceof ProviderFault) {
      if (e.kind === "period_closed" || e.kind === "validation") {
        await finalize(d.id, { status: "FAILED", lastError: `${e.kind}: ${e.message}` });
        summary.failed++;
        return;
      }
      // transient / rate_limit / unknown → ambiguous: QBO may or may not have accepted. VERIFYING so the
      // next sweep query-before-posts and adopts if it actually landed (no duplicate).
      await finalize(d.id, { status: "VERIFYING", lastError: `${e.kind}: ${e.message}` });
      summary.verifying++;
      return;
    }
    throw e; // non-provider error bubbles to the tenant handler
  }
}

/** Post one supply-receipt Bill delivery. Find-or-create the QBO vendor (cache externalVendorId),
 *  then the same query-before-post → post → finalize path as JournalEntries. (Unit 10) */
async function postBill(
  adapter: AccountingAdapter,
  ctx: ProviderCallContext,
  d: { id: string; apExportEventId: string | null; postingDate: Date | null },
  summary: PostSweepSummary,
): Promise<void> {
  const ev = await prisma.apExportEvent.findUnique({
    where: { id: d.apExportEventId as string },
    select: { postingKey: true, amount: true, debitAccount: true, receivedAt: true, dueDate: true, vendorId: true },
  });
  if (!ev || !ev.vendorId || !ev.debitAccount) {
    await finalize(d.id, { status: "FAILED", lastError: "AP export missing vendor or account" });
    summary.failed++;
    return;
  }
  const docNumber = docNumberFor(ev.postingKey);
  try {
    const existing = await adapter.findByDocNumber(ctx, "Bill", docNumber);
    if (existing) {
      await finalize(d.id, { status: "POSTED", externalId: existing.externalId, requestId: docNumber, verifiedAt: new Date(), lastError: null });
      summary.adopted++;
      return;
    }
    // Resolve the QBO vendor, caching its external id on the Vendor row.
    const vendor = await prisma.vendor.findUnique({ where: { id: ev.vendorId }, select: { name: true, externalVendorId: true } });
    if (!vendor) {
      await finalize(d.id, { status: "FAILED", lastError: "vendor row missing" });
      summary.failed++;
      return;
    }
    let externalVendorId = vendor.externalVendorId;
    if (!externalVendorId) {
      externalVendorId = await adapter.findOrCreateVendor(ctx, vendor.name);
      await runInTenantTx((tx) => tx.vendor.update({ where: { id: ev.vendorId as string }, data: { externalVendorId } }));
    }
    const memo = `Cellarhand · Supply bill · ${vendor.name}`;
    const payload = buildBillPayload({ postingKey: ev.postingKey, amount: Number(ev.amount), debitAccount: ev.debitAccount, receivedAt: ev.receivedAt, dueDate: ev.dueDate, memo, lineDescription: memo }, externalVendorId);
    const result = await adapter.postBill(ctx, payload, docNumber);
    await finalize(d.id, { status: "POSTED", externalId: result.externalId, requestId: docNumber, verifiedAt: new Date(), lastError: null });
    summary.posted++;
  } catch (e) {
    if (e instanceof ProviderFault) {
      if (e.kind === "period_closed" || e.kind === "validation") {
        await finalize(d.id, { status: "FAILED", lastError: `${e.kind}: ${e.message}` });
        summary.failed++;
        return;
      }
      await finalize(d.id, { status: "VERIFYING", lastError: `${e.kind}: ${e.message}` });
      summary.verifying++;
      return;
    }
    throw e;
  }
}

/** Post one DTC revenue DELTA (Phase 16). Query-before-post by the versioned DocNumber makes it
 *  exactly-once; because each delta is the DIFFERENCE with its own DocNumber, an order edit posts only
 *  the incremental entry (no double-book). Same fault mapping as JournalEntries. */
async function postSale(
  adapter: AccountingAdapter,
  ctx: ProviderCallContext,
  d: { id: string; salesExportEventId: string | null; postingDate: Date | null },
  summary: PostSweepSummary,
): Promise<void> {
  const ev = await prisma.salesExportEvent.findUnique({
    where: { id: d.salesExportEventId as string },
    select: {
      postingKey: true, currency: true, accountingDate: true, kind: true, channel: true, commerce7OrderId: true,
      revenueDelta: true, salesTaxDelta: true, shippingDelta: true, discountDelta: true,
      revenueAccount: true, clearingAccount: true, taxAccount: true, shippingAccount: true, discountAccount: true,
    },
  });
  if (!ev) {
    await finalize(d.id, { status: "FAILED", lastError: "source sales export event missing" });
    summary.failed++;
    return;
  }
  const postingDate = d.postingDate ?? ev.accountingDate ?? new Date();
  const docNumber = docNumberFor(ev.postingKey);
  try {
    const existing = await adapter.findByDocNumber(ctx, "JournalEntry", docNumber);
    if (existing) {
      await finalize(d.id, { status: "POSTED", externalId: existing.externalId, requestId: docNumber, postingDate, verifiedAt: new Date(), lastError: null });
      summary.adopted++;
      return;
    }
    const je = buildSalesDeltaJournal(
      {
        postingKey: ev.postingKey,
        currency: ev.currency,
        revenueDelta: Number(ev.revenueDelta),
        salesTaxDelta: Number(ev.salesTaxDelta),
        shippingDelta: Number(ev.shippingDelta),
        discountDelta: Number(ev.discountDelta),
        revenueAccount: ev.revenueAccount,
        clearingAccount: ev.clearingAccount,
        taxAccount: ev.taxAccount,
        shippingAccount: ev.shippingAccount,
        discountAccount: ev.discountAccount,
        memo: `Cellarhand · DTC ${ev.kind}${ev.channel ? ` · ${ev.channel}` : ""} · order ${ev.commerce7OrderId}`,
      },
      postingDate,
    );
    const result = await adapter.postJournalEntry(ctx, je, docNumber);
    await finalize(d.id, { status: "POSTED", externalId: result.externalId, requestId: docNumber, postingDate, verifiedAt: new Date(), lastError: null });
    summary.posted++;
  } catch (e) {
    if (e instanceof ProviderFault) {
      if (e.kind === "period_closed" || e.kind === "validation") {
        await finalize(d.id, { status: "FAILED", lastError: `${e.kind}: ${e.message}` });
        summary.failed++;
        return;
      }
      await finalize(d.id, { status: "VERIFYING", lastError: `${e.kind}: ${e.message}` });
      summary.verifying++;
      return;
    }
    throw e;
  }
}

/** Backfill PENDING deliveries for sales deltas that have none (emitted before QBO was connected). The
 *  ingest-time withhold (unmapped SKU/account) is re-emitted by the poll, not here — this only covers
 *  the "delta exists, delivery missing" case. Bounded anti-join. */
async function reEmitPostableSales(): Promise<number> {
  const rows = await runInTenantRawTx((tx, tenantId) =>
    tx.$queryRaw<{ id: string }[]>`
      SELECT s.id FROM "sales_export_event" s
      LEFT JOIN "accounting_delivery" d ON d."salesExportEventId" = s.id AND d."tenantId" = s."tenantId"
      WHERE s."tenantId" = ${tenantId} AND d.id IS NULL
      LIMIT ${REEMIT_BATCH}`,
  );
  if (rows.length === 0) return 0;
  const conn = await prisma.accountingConnection.findFirst({ where: { provider: "QBO", status: "CONNECTED" }, select: { id: true } });
  if (!conn) return 0;
  let n = 0;
  for (const r of rows) {
    await runInTenantTx((tx) =>
      tx.accountingDelivery.upsert({
        where: { tenantId_salesExportEventId: { tenantId: requireTenantId(), salesExportEventId: r.id } },
        create: { salesExportEventId: r.id, connectionId: conn.id, objectType: "JournalEntry", status: "PENDING" },
        update: {},
      }),
    );
    n++;
  }
  return n;
}

export async function runAccountingPostSweep(deps?: PostSweepDeps): Promise<PostSweepSummary> {
  const orgIds = deps?.orgIds ?? (await listAllOrgIds());
  const summary: PostSweepSummary = { orgs: orgIds.length, connected: 0, reEmitted: 0, claimed: 0, posted: 0, adopted: 0, verifying: 0, failed: 0, needsReauth: 0 };

  try {
    for (const tenantId of orgIds) {
      await runAsTenant(tenantId, async () => {
        const conn = await prisma.accountingConnection.findFirst({
          where: { provider: "QBO", status: "CONNECTED" },
          select: { id: true, externalRealmId: true, environment: true },
        });
        if (!conn || !conn.externalRealmId) return;
        summary.connected++;

        summary.reEmitted += await reEmitPostable();
        summary.reEmitted += await reEmitPostableSales();

        const claimedIds = await claimBatch();
        summary.claimed += claimedIds.length;
        if (claimedIds.length === 0) return;

        let accessToken: string;
        try {
          accessToken = await getValidAccessToken(conn.id);
        } catch (e) {
          if (e instanceof NeedsReauthError) {
            // Can't post anything for this tenant — release the claim so the next sweep retries.
            await runInTenantTx((tx) =>
              tx.accountingDelivery.updateMany({ where: { id: { in: claimedIds } }, data: { status: "PENDING", claimedAt: null, leaseExpiresAt: null } }),
            );
            summary.needsReauth++;
            return;
          }
          throw e;
        }
        const ctx: ProviderCallContext = { accessToken, realmId: conn.externalRealmId, environment: conn.environment as ProviderCallContext["environment"] };
        const adapter = deps?.adapterFactory ? deps.adapterFactory() : new QboAdapter();

        const claimed = await prisma.accountingDelivery.findMany({
          where: { id: { in: claimedIds } },
          select: { id: true, costExportEventId: true, apExportEventId: true, salesExportEventId: true, postingDate: true },
        });
        for (const d of claimed) {
          try {
            await postOne(adapter, ctx, d, summary);
          } catch (e) {
            if (e instanceof NeedsReauthError) {
              await finalize(d.id, { status: "PENDING", claimedAt: null, leaseExpiresAt: null });
              summary.needsReauth++;
              return; // stop this tenant
            }
            await finalize(d.id, { status: "VERIFYING", lastError: e instanceof Error ? e.message : "post failed" });
            summary.verifying++;
          }
        }
      });
    }
  } finally {
    await disconnectEnumerator();
  }
  return summary;
}
