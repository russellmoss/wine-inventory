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

/** `reasonCode` lets a caller distinguish a LEGITIMATE non-post (no vendor, no priced lines, a tenant that
 *  runs without A/P at all) from a MISCONFIGURATION the operator must fix — plan 080 U5 needs that split so
 *  an unmapped GL account blocks, while an A/P-less tenant keeps applying inventory-only exactly as before. */
export type ApEmitReasonCode = "no-priced-lines" | "no-ap-accounts" | "no-vendor" | "unmapped-line-account";
export type ApEmitResult = { emitted: number; postable: boolean; reason?: string; reasonCode?: ApEmitReasonCode };

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

/** One QBO Bill line for an aggregate per-invoice event — an inventory-account debit in the document currency. */
/** Plan 080 U5 (council C3): a line's target decides its GL account. Omitted → the inventory account,
 *  which is the correct default for a consumables-only invoice (every pre-U5 caller). */
export type ApBillTarget = "MATERIAL" | "EQUIPMENT_ASSET" | "FINISHED_GOOD";
export type ApBillLine = { amount: number; description?: string | null; targetKind?: ApBillTarget | null };

/** The configured GL accounts a bill line can code to. */
export type ApAccounts = { inventory: string | null; fixedAsset: string | null; suppliesExpense: string | null };

/**
 * PURE — council C3's category→account map. A pump is a FIXED ASSET, a clamp is an EXPENSE, a case of merch
 * is INVENTORY; coding all three to one account corrupts the balance sheet.
 *
 * Returns null when the needed account is not configured, which makes the caller WITHHOLD the invoice
 * rather than silently miscode it. Consumables fall back to the inventory account when no supplies-expense
 * account is set, so every pre-U5 (consumables-only) invoice posts exactly as it did before.
 */
export function apAccountForTarget(target: ApBillTarget | null | undefined, accounts: ApAccounts): string | null {
  if (target === "EQUIPMENT_ASSET") return accounts.fixedAsset;
  if (target === "MATERIAL") return accounts.suppliesExpense ?? accounts.inventory;
  return accounts.inventory; // FINISHED_GOOD + unspecified
}

/**
 * Plan 076 — emit ONE aggregate A/P event (+ PENDING Bill delivery) for a whole ingested invoice, so it
 * posts as a SINGLE multi-line QBO Bill (DocNumber = apinv:<invoiceId>) instead of N per-lot bills. Called
 * once at the end of an invoice apply, after every line's lot exists (the caller passes skipApEmit to
 * receiveSupplyCore so the per-lot path doesn't also emit). Idempotent by postingKey. Withheld (no emit) when
 * there are no priced lines, the A/P accounts are unset, or there's no vendor — exactly like the per-lot path.
 * FX is DECOUPLED (council #1): `amount`/line amounts are the DOCUMENT (foreign) currency; QBO derives the
 * home GL = amount × exchangeRate. A base-currency invoice passes currency=base, exchangeRate=null.
 */
export async function emitApExportForInvoice(
  ingestedInvoiceId: string,
  opts: {
    vendorId: string | null;
    vendorInvoiceNumber?: string | null;
    receivedAt: Date;
    dueDate?: Date | null;
    currency: string; // the invoice (document) currency
    exchangeRate?: number | null; // home per 1 foreign; null when currency == home
    lines: ApBillLine[]; // priced lines only (each amount in the document currency)
    // Plan 076: payment status carried onto the event so the poster records a QBO BillPayment when Paid.
    paymentStatus?: "OUTSTANDING" | "PAID" | null;
    paidFromAccount?: string | null;
    paidAt?: Date | null;
  },
  dbArg?: Db,
): Promise<ApEmitResult> {
  const db = asDb(dbArg);
  const settings = await db.appSettings.findFirst({
    select: { apInventoryAccount: true, apPayableAccount: true, apFixedAssetAccount: true, apSuppliesExpenseAccount: true },
  });
  const inv = settings?.apInventoryAccount ?? null;
  const ap = settings?.apPayableAccount ?? null;
  const fixedAsset = settings?.apFixedAssetAccount ?? null;
  const suppliesExpense = settings?.apSuppliesExpenseAccount ?? null;

  const pricedLines = opts.lines.filter((l) => Number.isFinite(l.amount) && Number(l.amount) > 0);
  const postable = pricedLines.length > 0 && !!inv && !!ap && !!opts.vendorId;
  if (!postable) {
    const reason = pricedLines.length === 0 ? "no priced lines" : !inv || !ap ? "A/P accounts are not configured" : "no vendor on the invoice";
    const reasonCode: ApEmitReasonCode = pricedLines.length === 0 ? "no-priced-lines" : !inv || !ap ? "no-ap-accounts" : "no-vendor";
    return { emitted: 0, postable: false, reason, reasonCode };
  }

  // Plan 080 U5 (council C3) — per-line GL. A pump is a FIXED ASSET, a clamp is an EXPENSE, a case of merch
  // is INVENTORY. Coding all three to the inventory account corrupts the balance sheet, so a line whose
  // target needs an account the tenant has not configured WITHHOLDS the whole invoice rather than posting it
  // to the wrong place. Consumables/unspecified keep the inventory account, so every pre-U5 invoice is
  // unaffected. The category→account map itself is pending accountant sign-off before go-live.
  const accountFor = (t: ApBillTarget | null | undefined): string | null =>
    apAccountForTarget(t, { inventory: inv, fixedAsset, suppliesExpense });
  const unmapped = pricedLines.find((l) => accountFor(l.targetKind) == null);
  if (unmapped) {
    return {
      emitted: 0,
      postable: false,
      reasonCode: "unmapped-line-account",
      reason:
        unmapped.targetKind === "EQUIPMENT_ASSET"
          ? "this invoice capitalizes equipment, but no Fixed Assets account is configured (Settings → Accounting)"
          : "a line's GL account is not configured (Settings → Accounting)",
    };
  }

  const amount = pricedLines.reduce((a, l) => a + Number(l.amount), 0);
  // Every line debits the same inventory-asset account today (single configured account); the JSON preserves
  // per-line amounts + descriptions so the QBO Bill shows the invoice's lines, not one collapsed total.
  const billLines = pricedLines.map((l) => ({
    debitAccount: accountFor(l.targetKind) as string,
    amount: Number(l.amount),
    description: l.description ?? null,
    targetKind: l.targetKind ?? null,
  }));
  const exRate = opts.exchangeRate != null && Number.isFinite(opts.exchangeRate) && opts.exchangeRate > 0 ? opts.exchangeRate : null;

  const postingKey = `apinv:${ingestedInvoiceId}`;
  const existing = await db.apExportEvent.findFirst({ where: { postingKey }, select: { id: true } });
  let eventId: string;
  if (existing) {
    eventId = existing.id;
  } else {
    const created = await db.apExportEvent.create({
      data: {
        postingKey,
        ingestedInvoiceId,
        vendorId: opts.vendorId,
        amount, // DOCUMENT-currency total (foreign for a foreign invoice; QBO derives home GL)
        debitAccount: inv, // inventory asset (also carried per-line in billLinesJson)
        creditAccount: ap, // recorded for audit; the Bill posts A/P implicitly
        currency: opts.currency,
        exchangeRate: exRate,
        billLinesJson: billLines as unknown as Prisma.InputJsonValue,
        receivedAt: opts.receivedAt,
        dueDate: opts.dueDate ?? null,
        vendorInvoiceNumber: opts.vendorInvoiceNumber?.trim() || null,
        paymentStatus: opts.paymentStatus ?? null,
        paidFromAccount: opts.paidFromAccount ?? null,
        paidAt: opts.paidAt ?? null,
      },
      select: { id: true },
    });
    eventId = created.id;
  }

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
