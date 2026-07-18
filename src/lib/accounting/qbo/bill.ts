import { docNumberFor } from "@/lib/accounting/qbo/client";
import { toTxnDate } from "@/lib/accounting/qbo/journal";

// Phase 15 Unit 10 — build a QBO Bill from an immutable ApExportEvent. A Bill's account-based line
// DEBITS the inventory-asset (or expense) account; QBO auto-CREDITS Accounts Payable for the vendor,
// so we only specify the debit account. Positive amount (a bill is money owed). DocNumber = our
// idempotency key (query-before-post). Pure.

/** Plan 076: one QBO Bill line — a document-currency inventory-account debit. */
export type BillLine = { account: string; amount: number; description?: string | null };

export type ApEventForBill = {
  postingKey: string;
  amount: number; // Plan 073: the DOCUMENT-currency amount — FOREIGN for a foreign bill (QBO derives home GL)
  debitAccount: string | null; // inventory-asset account the bill hits (single-line legacy path)
  // Plan 076: an AGGREGATE per-invoice bill supplies its lines here (one per invoice line, grouped-by-account
  // if ever multiple accounts). When present, these win over the single debitAccount/amount line.
  lines?: BillLine[] | null;
  receivedAt: Date;
  dueDate: Date | null;
  memo?: string; // human-readable ("Cellarhand · Supply · <vendor>"); falls back to postingKey
  lineDescription?: string;
  // Plan 073: multi-currency. `currency` is the bill's document currency; set `exchangeRate` (HOME per 1
  // FOREIGN, council #5) ONLY when currency ≠ home so QBO uses OUR pinned rate. Both omitted = home bill.
  currency?: string | null;
  exchangeRate?: number | null;
};

const round2 = (n: number) => Math.round(Math.abs(Number(n)) * 100) / 100;

export function buildBillPayload(ev: ApEventForBill, vendorExternalId: string): Record<string, unknown> {
  const currency = ev.currency?.trim().toUpperCase() || null;
  // ExchangeRate is HOME-per-FOREIGN; it's only meaningful (and only accepted) when the bill is non-home.
  const exchangeRate = ev.exchangeRate != null && Number.isFinite(ev.exchangeRate) && ev.exchangeRate > 0 ? ev.exchangeRate : null;

  // Plan 076: prefer the aggregate lines (one QBO Line per invoice line); fall back to the single-line legacy
  // shape. QBO sums the lines into the Bill total, so we never send an explicit total (avoids rounding drift).
  const src: BillLine[] = ev.lines && ev.lines.length > 0
    ? ev.lines
    : ev.debitAccount
      ? [{ account: ev.debitAccount, amount: ev.amount, description: ev.lineDescription ?? null }]
      : [];
  if (src.length === 0) throw new Error(`AP export ${ev.postingKey} has no bill lines — should never post.`);

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
    Line: src.map((l) => ({
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: round2(l.amount),
      ...(l.description ? { Description: l.description } : {}),
      AccountBasedExpenseLineDetail: { AccountRef: { value: l.account } },
    })),
  };
}
