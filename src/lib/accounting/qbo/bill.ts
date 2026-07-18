import { docNumberFor } from "@/lib/accounting/qbo/client";
import { toTxnDate } from "@/lib/accounting/qbo/journal";

// Phase 15 Unit 10 — build a QBO Bill from an immutable ApExportEvent. A Bill's account-based line
// DEBITS the inventory-asset (or expense) account; QBO auto-CREDITS Accounts Payable for the vendor,
// so we only specify the debit account. Positive amount (a bill is money owed). DocNumber = our
// idempotency key (query-before-post). Pure.

export type ApEventForBill = {
  postingKey: string;
  amount: number; // Plan 073: the DOCUMENT-currency amount — FOREIGN for a foreign bill (QBO derives home GL)
  debitAccount: string | null; // inventory-asset account the bill hits
  receivedAt: Date;
  dueDate: Date | null;
  memo?: string; // human-readable ("Cellarhand · Supply · <vendor>"); falls back to postingKey
  lineDescription?: string;
  // Plan 073: multi-currency. `currency` is the bill's document currency; set `exchangeRate` (HOME per 1
  // FOREIGN, council #5) ONLY when currency ≠ home so QBO uses OUR pinned rate. Both omitted = home bill.
  currency?: string | null;
  exchangeRate?: number | null;
};

export function buildBillPayload(ev: ApEventForBill, vendorExternalId: string): Record<string, unknown> {
  if (!ev.debitAccount) throw new Error(`AP export ${ev.postingKey} has no inventory account — should never post.`);
  const amount = Math.abs(Number(ev.amount)); // in the DOCUMENT currency (foreign for a foreign bill)
  const currency = ev.currency?.trim().toUpperCase() || null;
  // ExchangeRate is HOME-per-FOREIGN; it's only meaningful (and only accepted) when the bill is non-home.
  const exchangeRate = ev.exchangeRate != null && Number.isFinite(ev.exchangeRate) && ev.exchangeRate > 0 ? ev.exchangeRate : null;
  return {
    DocNumber: docNumberFor(ev.postingKey),
    VendorRef: { value: vendorExternalId },
    TxnDate: toTxnDate(ev.receivedAt),
    ...(ev.dueDate ? { DueDate: toTxnDate(ev.dueDate) } : {}),
    PrivateNote: ev.memo ?? ev.postingKey,
    // A foreign bill carries CurrencyRef + the pinned ExchangeRate; QBO derives the home-currency GL as
    // Amount × ExchangeRate. A home bill omits both (single-currency posture unchanged).
    ...(currency ? { CurrencyRef: { value: currency } } : {}),
    ...(currency && exchangeRate != null ? { ExchangeRate: exchangeRate } : {}),
    Line: [
      {
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: amount,
        ...(ev.lineDescription ? { Description: ev.lineDescription } : {}),
        AccountBasedExpenseLineDetail: { AccountRef: { value: ev.debitAccount } },
      },
    ],
  };
}
