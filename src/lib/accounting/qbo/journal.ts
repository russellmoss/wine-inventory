import { assertBalanced, type JournalEntryInput, type JournalLineInput, type Posting } from "@/lib/accounting/adapter";

// Phase 15 Unit 8 — build a balanced QBO JournalEntry from ONE immutable export event. Each export
// line is a self-balancing pair: DR debitAccount / CR creditAccount for the same amount. We apply ONE
// uniform sign rule so a negative amount (a reversal snapshot line, or a negative variance delta)
// becomes a MIRROR-IMAGE entry with a POSITIVE QBO amount (QBO rejects negative JE line amounts) —
// no separate reversal code path. Pure + unit-tested.

/** Format a Date as YYYY-MM-DD (QBO TxnDate) in UTC. */
export function toTxnDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type ExportEventForJournal = {
  postingKey: string;
  amount: number; // signed
  debitAccount: string | null;
  creditAccount: string | null;
  currency: string;
};

/**
 * Build the JournalEntryInput for an export event. Throws if accounts are missing (a WITHHELD row must
 * never reach here). amount ≥ 0 → DR debit / CR credit; amount < 0 → swap and use the absolute value.
 */
export function buildJournalFromExport(ev: ExportEventForJournal, postingDate: Date): JournalEntryInput {
  if (!ev.debitAccount || !ev.creditAccount) {
    throw new Error(`Export ${ev.postingKey} has no mapped accounts — should never be posted.`);
  }
  const amt = Number(ev.amount);
  const positive = Math.abs(amt);
  const debit = amt >= 0 ? ev.debitAccount : ev.creditAccount;
  const credit = amt >= 0 ? ev.creditAccount : ev.debitAccount;
  const lines: JournalLineInput[] = [
    { amount: positive, posting: "Debit", accountKey: debit },
    { amount: positive, posting: "Credit", accountKey: credit },
  ];
  return { postingKey: ev.postingKey, txnDate: toTxnDate(postingDate), currency: ev.currency, privateNote: ev.postingKey, lines };
}

// Phase 16 Unit 7 — build a balanced JournalEntry for ONE DTC revenue DELTA (the difference for an order
// edit/refund, not a re-book). Natural directions: DR undeposited-funds clearing (asset ↑), CR revenue /
// CR sales-tax-payable / CR shipping-income, DR discount (contra-revenue). clearing = revenue + tax +
// shipping − discount, so the entry balances by construction. Every delta is signed; a uniform per-line
// sign rule turns a negative (refund/reversal) into a MIRROR-IMAGE entry with POSITIVE QBO amounts (QBO
// rejects negative JE lines) — one code path for sale/adjustment/refund/reversal. Pure + unit-tested.

export type SalesDeltaForJournal = {
  postingKey: string;
  currency: string;
  revenueDelta: number;
  salesTaxDelta: number;
  shippingDelta: number;
  discountDelta: number;
  revenueAccount: string | null;
  clearingAccount: string | null;
  taxAccount: string | null;
  shippingAccount: string | null;
  discountAccount: string | null;
};

const flip = (p: Posting): Posting => (p === "Debit" ? "Credit" : "Debit");
const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildSalesDeltaJournal(d: SalesDeltaForJournal, postingDate: Date): JournalEntryInput {
  const revenue = round2(d.revenueDelta);
  const tax = round2(d.salesTaxDelta);
  const shipping = round2(d.shippingDelta);
  const discount = round2(d.discountDelta);
  const clearing = round2(revenue + tax + shipping - discount);

  // Each leg: signed amount + its NATURAL posting side (when the amount is positive).
  const legs: { amount: number; natural: Posting; account: string | null; role: string }[] = [
    { amount: clearing, natural: "Debit", account: d.clearingAccount, role: "clearing" },
    { amount: revenue, natural: "Credit", account: d.revenueAccount, role: "revenue" },
    { amount: tax, natural: "Credit", account: d.taxAccount, role: "sales tax" },
    { amount: shipping, natural: "Credit", account: d.shippingAccount, role: "shipping" },
    { amount: discount, natural: "Debit", account: d.discountAccount, role: "discount" }, // contra-revenue
  ];

  const lines: JournalLineInput[] = [];
  for (const leg of legs) {
    if (leg.amount === 0) continue; // skip zero legs
    if (!leg.account) throw new Error(`Sales delta ${d.postingKey} needs a ${leg.role} account — should never be posted.`);
    lines.push({ amount: Math.abs(leg.amount), posting: leg.amount > 0 ? leg.natural : flip(leg.natural), accountKey: leg.account });
  }
  assertBalanced(lines);
  return { postingKey: d.postingKey, txnDate: toTxnDate(postingDate), currency: d.currency, privateNote: d.postingKey, lines };
}
