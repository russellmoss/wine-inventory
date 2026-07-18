import { docNumberFor } from "@/lib/accounting/qbo/client";
import { toTxnDate } from "@/lib/accounting/qbo/journal";

// Plan 076 — build a QBO BillPayment that settles an aggregate per-invoice Bill. A BillPayment references the
// Bill via Line[].LinkedTxn and credits the pay-from account: a check pays from the bank account
// (CheckPayment.BankAccountRef); a company-card payment pays from the credit-card LIABILITY account
// (CreditCardPayment.CCAccountRef), which correctly moves the debt from the vendor to the card. Posting it
// zeroes the Bill's balance so QBO's A/P aging shows the invoice settled. DocNumber = pay:<invoiceId> (our
// idempotency key, query-before-post). Pure.

export type BillPaymentInput = {
  postingKey: string; // "pay:<ingestedInvoiceId>"
  vendorExternalId: string;
  billExternalId: string;
  amount: number; // document-currency total of the bill
  payType: "Check" | "CreditCard";
  payFromAccount: string; // QBO account id (bank for Check, credit-card liability for CreditCard)
  txnDate: Date;
  // Plan 073 parity: a foreign payment carries CurrencyRef + the pinned ExchangeRate (home per 1 foreign).
  currency?: string | null;
  exchangeRate?: number | null;
};

const round2 = (n: number) => Math.round(Math.abs(Number(n)) * 100) / 100;

export function buildBillPaymentPayload(inp: BillPaymentInput): Record<string, unknown> {
  if (!inp.payFromAccount) throw new Error(`BillPayment ${inp.postingKey} has no pay-from account.`);
  const amount = round2(inp.amount);
  const currency = inp.currency?.trim().toUpperCase() || null;
  const exchangeRate = inp.exchangeRate != null && Number.isFinite(inp.exchangeRate) && inp.exchangeRate > 0 ? inp.exchangeRate : null;
  return {
    DocNumber: docNumberFor(inp.postingKey),
    VendorRef: { value: inp.vendorExternalId },
    TxnDate: toTxnDate(inp.txnDate),
    TotalAmt: amount,
    PayType: inp.payType,
    ...(inp.payType === "Check"
      ? { CheckPayment: { BankAccountRef: { value: inp.payFromAccount } } }
      : { CreditCardPayment: { CCAccountRef: { value: inp.payFromAccount } } }),
    ...(currency ? { CurrencyRef: { value: currency } } : {}),
    ...(currency && exchangeRate != null ? { ExchangeRate: exchangeRate } : {}),
    Line: [
      {
        Amount: amount,
        LinkedTxn: [{ TxnId: inp.billExternalId, TxnType: "Bill" }],
      },
    ],
  };
}
