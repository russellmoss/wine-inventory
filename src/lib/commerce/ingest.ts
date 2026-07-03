import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { runLedgerWrite } from "@/lib/ledger/write";
import { Commerce7Adapter, commerce7CallContext } from "@/lib/commerce/commerce7";
import type { CommerceAdapter } from "@/lib/commerce/adapter";
import { normalizeSnapshot, accountingDateOf, type EconomicSnapshot } from "@/lib/commerce/normalize";
import { diffSnapshots } from "@/lib/commerce/diff";
import { resolveSkuMapping, getSalesAccountMap, resolveSaleAccounts } from "@/lib/commerce/mapping";
import { createDeliveryForSale } from "@/lib/commerce/sales-emit";
import { depleteForSale, restoreForRefund, type Ctx } from "@/lib/stock/movements";

// Phase 16 Unit 5 — the single ingest path. A webhook is only a HINT (it marks an order dirty); THIS is
// where an order is actually ingested: re-fetch → normalize → diff the last-known snapshot → emit an
// append-only DELTA + deplete finished goods (SALE) + a PENDING revenue delivery, ALL in ONE SERIALIZABLE
// tx (exactly-once + atomic). Paid-only (the diff recognizes economics only when settled). Unmapped SKU /
// account → WITHHELD (nothing emitted; re-emits after mapping). A duplicate/replay diffs to null → no-op.
// Never logs raw payloads (D19). The caller wraps this in runAsTenant(tenantId).

export type IngestDeps = { adapterFactory?: () => CommerceAdapter };
export type IngestOutcome = "emitted" | "noop" | "withheld" | "skipped" | "not_found";
export type IngestResult = { outcome: IngestOutcome; kind?: string; reason?: string };

const SYSTEM_CTX: Ctx = { actorUserId: null, actorEmail: "commerce7-sync" };

/** Ingest ONE Commerce7 order (by its stable id). Idempotent + atomic. */
export async function syncOrder(commerce7OrderId: string, deps?: IngestDeps): Promise<IngestResult> {
  const conn = await prisma.commerce7Connection.findFirst({
    where: { provider: "COMMERCE7", status: "CONNECTED" },
    select: { externalTenantId: true },
  });
  if (!conn || !conn.externalTenantId) return { outcome: "skipped" };

  const adapter = deps?.adapterFactory ? deps.adapterFactory() : new Commerce7Adapter();
  const ctx = commerce7CallContext(conn.externalTenantId);
  const order = await adapter.getOrder(ctx, commerce7OrderId); // re-fetch-before-act
  if (!order) {
    // A fake/deleted id (404) — drop the hint if we have a projection row for it.
    await clearDirtyIfPresent(commerce7OrderId);
    return { outcome: "not_found" };
  }

  const next = normalizeSnapshot(order);
  const projection = await prisma.commerce7Order.findFirst({
    where: { commerce7OrderId },
    select: { id: true, normalizedSnapshot: true },
  });
  const prev = (projection?.normalizedSnapshot as EconomicSnapshot | null) ?? null;
  const delta0 = diffSnapshots(prev, next);

  if (!delta0) {
    // No economic/inventory change (duplicate, replay, or a non-economic edit) — refresh meta only.
    await upsertProjectionMeta(commerce7OrderId, order, next, { advanceSnapshot: true, withheldReason: null });
    return { outcome: "noop" };
  }

  // Resolve accounts + per-line SKU mapping OUTSIDE the tx (tenant-scoped via the extension). Only lines
  // that MOVE inventory (qtyDelta != 0) need a mapping.
  const needs = { hasTax: delta0.salesTaxDelta !== 0, hasShipping: delta0.shippingDelta !== 0, hasDiscount: delta0.discountDelta !== 0 };
  const acc = resolveSaleAccounts(await getSalesAccountMap(), needs);
  let unmappedSku = false;
  for (const ld of delta0.lineDeltas) {
    if (ld.qtyDelta === 0) continue;
    const r = await resolveSkuMapping(ld.skuRef, ld.inventoryLocationId ?? "");
    if (!r) { unmappedSku = true; break; }
  }

  if (!acc.ok || unmappedSku) {
    const reason = !acc.ok ? acc.reason : "An ordered product isn't matched to a wine yet.";
    // WITHHOLD: keep the prev snapshot un-advanced so the same delta re-computes after mapping; record
    // the reason for the dashboard; the poll's re-emit sweep retries it.
    await upsertProjectionMeta(commerce7OrderId, order, next, { advanceSnapshot: false, withheldReason: reason });
    return { outcome: "withheld", reason };
  }

  const tenantId = requireTenantId();
  return runLedgerWrite(async (tx) => {
    // Re-read + re-diff INSIDE the tx so a concurrent ingest that already advanced the projection makes
    // this a clean no-op (SERIALIZABLE + the postingKey unique are the exactly-once backstop).
    const proj = await tx.commerce7Order.findFirst({ where: { commerce7OrderId }, select: { id: true, lastDeltaSeq: true, normalizedSnapshot: true } });
    const prevTx = (proj?.normalizedSnapshot as EconomicSnapshot | null) ?? null;
    const delta = diffSnapshots(prevTx, next);
    if (!delta) {
      await writeProjection(tx, tenantId, commerce7OrderId, order, next, { snapshot: next, lastDeltaSeq: proj?.lastDeltaSeq, withheldReason: null });
      return { outcome: "noop" as const };
    }
    const seq = (proj?.lastDeltaSeq ?? 0) + 1;
    const ev = await tx.salesExportEvent.create({
      data: {
        postingKey: `sale:${commerce7OrderId}:v${seq}`,
        commerce7OrderId,
        deltaSeq: seq,
        kind: delta.kind,
        currency: next.currency,
        channel: next.channel,
        revenueDelta: delta.revenueDelta,
        salesTaxDelta: delta.salesTaxDelta,
        shippingDelta: delta.shippingDelta,
        discountDelta: delta.discountDelta,
        lineDeltas: delta.lineDeltas.map((l) => ({ skuRef: l.skuRef, qtyDelta: l.qtyDelta, revenueDelta: l.revenueDelta })) as unknown as Prisma.InputJsonValue,
        revenueAccount: acc.accounts.revenueAccount,
        clearingAccount: acc.accounts.clearingAccount,
        taxAccount: acc.accounts.taxAccount,
        shippingAccount: acc.accounts.shippingAccount,
        discountAccount: acc.accounts.discountAccount,
        accountingDate: accountingDateOf(next),
        occurredAt: new Date(next.occurredAt),
      },
      select: { id: true },
    });

    for (const ld of delta.lineDeltas) {
      if (ld.qtyDelta === 0) continue;
      const r = await tx.commerce7SkuMap.findFirst({
        where: { externalVariantId: ld.skuRef, externalInventoryLocationId: ld.inventoryLocationId ?? "", active: true },
        select: { wineSkuId: true, locationId: true },
      });
      if (!r || !r.wineSkuId || !r.locationId) continue; // resolved above; skip defensively
      const label = `Commerce7 order ${order.orderNumber ?? commerce7OrderId}`;
      if (ld.qtyDelta > 0) await depleteForSale(tx, r.wineSkuId, r.locationId, ld.qtyDelta, SYSTEM_CTX, label);
      else await restoreForRefund(tx, r.wineSkuId, r.locationId, -ld.qtyDelta, SYSTEM_CTX, label);
    }

    await createDeliveryForSale(tx, ev.id);
    await writeProjection(tx, tenantId, commerce7OrderId, order, next, { snapshot: next, lastDeltaSeq: seq, withheldReason: null });
    return { outcome: "emitted" as const, kind: delta.kind };
  });
}

// ── projection helpers ──

type MetaOpts = { advanceSnapshot: boolean; withheldReason: string | null };

async function upsertProjectionMeta(commerce7OrderId: string, order: { orderNumber?: string; channel?: string; paymentStatus: string; fulfillmentStatus?: string; customerId?: string }, next: EconomicSnapshot, opts: MetaOpts): Promise<void> {
  const tenantId = requireTenantId();
  await runInTenantTx((tx) =>
    writeProjection(tx, tenantId, commerce7OrderId, order, next, {
      snapshot: opts.advanceSnapshot ? next : undefined,
      withheldReason: opts.withheldReason,
    }),
  );
}

async function writeProjection(
  tx: Prisma.TransactionClient,
  tenantId: string,
  commerce7OrderId: string,
  order: { orderNumber?: string; channel?: string; paymentStatus: string; fulfillmentStatus?: string; customerId?: string },
  next: EconomicSnapshot,
  opts: { snapshot?: EconomicSnapshot; lastDeltaSeq?: number; withheldReason: string | null },
): Promise<void> {
  const meta = {
    commerce7OrderNumber: order.orderNumber ?? null,
    commerce7CustomerId: order.customerId ?? null, // opaque id ONLY
    channel: order.channel ?? null,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus ?? null,
    lastSeenUpdatedAt: new Date(next.updatedAt),
    occurredAt: new Date(next.occurredAt),
    dirty: false,
    withheldReason: opts.withheldReason,
  };
  const snap = opts.snapshot !== undefined ? { normalizedSnapshot: opts.snapshot as unknown as Prisma.InputJsonValue } : {};
  const seq = opts.lastDeltaSeq !== undefined ? { lastDeltaSeq: opts.lastDeltaSeq } : {};
  await tx.commerce7Order.upsert({
    where: { tenantId_commerce7OrderId: { tenantId, commerce7OrderId } },
    create: { commerce7OrderId, ...meta, ...snap, ...seq },
    update: { ...meta, ...snap, ...seq },
  });
}

async function clearDirtyIfPresent(commerce7OrderId: string): Promise<void> {
  const tenantId = requireTenantId();
  await runInTenantTx((tx) => tx.commerce7Order.updateMany({ where: { tenantId, commerce7OrderId }, data: { dirty: false } }));
}
