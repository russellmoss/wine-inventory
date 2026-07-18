import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/tenant/context";
import { findOrCreateVendorCore } from "@/lib/vendors/vendors";

// Phase 15 Unit 10 — the AP outbox. A supply RECEIPT (purchase-on-credit) emits an IMMUTABLE
// ApExportEvent (ap:<supplyLotId>) + a PENDING Bill delivery, INSIDE the receipt tx (same transactional
// outbox as COGS). PII (the vendor) lives in the mutable Vendor table, NEVER in the immutable event
// (D19). Postable only when the cost is known AND the A/P accounts are configured AND a vendor is set —
// otherwise nothing is emitted (immutable event must not strand; re-run once configured). Script-safe.

type Db = Prisma.TransactionClient;
const asDb = (db?: Db): Db => db ?? (prisma as unknown as Db);

/** Parse "Net 30" → 30 days; returns the due date from a base date, or null if unparseable. */
function dueDateFrom(base: Date, terms?: string | null): Date | null {
  const m = terms?.match(/(\d+)/);
  if (!m) return null;
  const days = Number(m[1]);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(base.getTime() + days * 86_400_000);
}

export type ApEmitResult = { emitted: number; postable: boolean; reason?: string };

/**
 * Emit the AP export event + Bill delivery for one supply receipt. Idempotent by postingKey. No-op when
 * withheld (unknown cost / A/P accounts unset / no vendor) or when the tenant isn't connected.
 */
export async function emitApExportForReceipt(
  supplyLotId: string,
  opts: { vendorName?: string | null; terms?: string | null; vendorInvoiceNumber?: string | null },
  dbArg?: Db,
): Promise<ApEmitResult> {
  const db = asDb(dbArg);
  const lot = await db.supplyLot.findUnique({
    where: { id: supplyLotId },
    select: {
      id: true,
      qtyReceived: true,
      unitCost: true,
      currency: true,
      createdAt: true,
      // Plan 073: the foreign figures decouple the A/P amount (FOREIGN) from the base inventory cost (council #1).
      foreignUnitCost: true,
      foreignCurrency: true,
      fxRate: true,
    },
  });
  if (!lot) return { emitted: 0, postable: false, reason: "supply lot not found" };

  const unitCost = lot.unitCost == null ? null : Number(lot.unitCost);
  const settings = await db.appSettings.findFirst({ select: { apInventoryAccount: true, apPayableAccount: true, currency: true } });
  const inv = settings?.apInventoryAccount ?? null;
  const ap = settings?.apPayableAccount ?? null;

  // find-or-create the vendor (mutable PII table) when a name is given. Shared with intake + backfill (Plan 069)
  // so every path dedups vendors identically (one vendor per tenant+name).
  let vendorId: string | null = null;
  if (opts.vendorName?.trim()) {
    const v = await findOrCreateVendorCore({ name: opts.vendorName, terms: opts.terms }, db);
    vendorId = v?.id ?? null;
  }

  const postable = unitCost != null && !!inv && !!ap && !!vendorId;
  if (!postable) {
    const reason = unitCost == null ? "receipt cost is unknown" : !inv || !ap ? "A/P accounts are not configured" : "no vendor on the receipt";
    return { emitted: 0, postable: false, reason };
  }

  // Plan 073 (council #1 — DECOUPLED): a foreign-currency receipt posts its A/P in the FOREIGN currency —
  // amount = qty × foreign unit cost, currency = the invoice currency, exchangeRate = base-per-foreign. QBO
  // then derives the home GL = amount × ExchangeRate. Posting the BASE amount with a CurrencyRef would make
  // QBO apply the rate a SECOND time (inflated GL). A base-currency receipt keeps amount == home, rate null.
  const qtyReceived = Number((lot.qtyReceived as unknown as number) ?? 0);
  const isForeign = lot.foreignUnitCost != null && lot.foreignCurrency != null && lot.fxRate != null;
  const apUnitCost = isForeign ? Number(lot.foreignUnitCost) : (unitCost as number);
  const apCurrency = isForeign ? (lot.foreignCurrency as string) : (lot.currency ?? settings?.currency ?? "USD");
  const apExchangeRate = isForeign ? Number(lot.fxRate) : null;
  const amount = qtyReceived * apUnitCost;
  const postingKey = `ap:${supplyLotId}`;
  const existing = await db.apExportEvent.findFirst({ where: { postingKey }, select: { id: true } });
  let eventId: string;
  if (existing) {
    eventId = existing.id;
  } else {
    const created = await db.apExportEvent.create({
      data: {
        postingKey,
        supplyLotId,
        vendorId,
        amount, // FOREIGN amount for a foreign receipt; home amount otherwise (council #1)
        debitAccount: inv, // Bill line account (inventory asset); QBO auto-credits A/P
        creditAccount: ap, // recorded for audit; the Bill posts A/P implicitly
        currency: apCurrency, // the document currency (EUR for a foreign bill)
        exchangeRate: apExchangeRate, // base per 1 foreign; null when currency == home (council #5)
        receivedAt: lot.createdAt,
        dueDate: dueDateFrom(lot.createdAt, opts.terms),
        // Plan 072: supplier invoice # rides on the immutable event → the QBO Bill's PrivateNote memo
        // (searchable). NOT a grouping/idempotency key — per-lot Bills stay separate (DocNumber = ap:<lotId>).
        vendorInvoiceNumber: opts.vendorInvoiceNumber?.trim() || null,
      },
      select: { id: true },
    });
    eventId = created.id;
  }

  // PENDING Bill delivery (no-op if not connected; the poster's U10 branch posts it).
  const conn = await db.accountingConnection.findFirst({ where: { provider: "QBO", status: "CONNECTED" }, select: { id: true } });
  if (conn) {
    const tenantId = requireTenantId();
    await db.accountingDelivery.upsert({
      where: { tenantId_apExportEventId: { tenantId, apExportEventId: eventId } },
      create: { apExportEventId: eventId, connectionId: conn.id, objectType: "Bill", status: "PENDING" },
      update: {},
    });
  }
  return { emitted: existing ? 0 : 1, postable: true };
}
