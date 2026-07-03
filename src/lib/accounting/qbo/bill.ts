import { docNumberFor } from "@/lib/accounting/qbo/client";
import { toTxnDate } from "@/lib/accounting/qbo/journal";

// Phase 15 Unit 10 — build a QBO Bill from an immutable ApExportEvent. A Bill's account-based line
// DEBITS the inventory-asset (or expense) account; QBO auto-CREDITS Accounts Payable for the vendor,
// so we only specify the debit account. Positive amount (a bill is money owed). DocNumber = our
// idempotency key (query-before-post). Pure.

export type ApEventForBill = {
  postingKey: string;
  amount: number;
  debitAccount: string | null; // inventory-asset account the bill hits
  receivedAt: Date;
  dueDate: Date | null;
};

export function buildBillPayload(ev: ApEventForBill, vendorExternalId: string): Record<string, unknown> {
  if (!ev.debitAccount) throw new Error(`AP export ${ev.postingKey} has no inventory account — should never post.`);
  const amount = Math.abs(Number(ev.amount));
  return {
    DocNumber: docNumberFor(ev.postingKey),
    VendorRef: { value: vendorExternalId },
    TxnDate: toTxnDate(ev.receivedAt),
    ...(ev.dueDate ? { DueDate: toTxnDate(ev.dueDate) } : {}),
    PrivateNote: ev.postingKey,
    Line: [
      {
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: amount,
        AccountBasedExpenseLineDetail: { AccountRef: { value: ev.debitAccount } },
      },
    ],
  };
}
