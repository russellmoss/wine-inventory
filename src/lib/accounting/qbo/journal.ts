import type { JournalEntryInput, JournalLineInput } from "@/lib/accounting/adapter";

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
