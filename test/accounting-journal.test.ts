import { describe, it, expect } from "vitest";
import { buildJournalFromExport, toTxnDate } from "@/lib/accounting/qbo/journal";
import { assertBalanced } from "@/lib/accounting/adapter";

// Phase 15 Unit 8 — the JE builder's uniform sign rule (positive QBO amounts, mirror on negatives).

const DATE = new Date("2026-07-03T12:00:00Z");

describe("buildJournalFromExport", () => {
  it("positive amount → DR debit / CR credit, both positive + balanced", () => {
    const je = buildJournalFromExport({ postingKey: "cogs:r:s:-:FRUIT", amount: 300, debitAccount: "5000", creditAccount: "1400", currency: "USD" }, DATE);
    expect(je.txnDate).toBe("2026-07-03");
    expect(je.lines).toEqual([
      { amount: 300, posting: "Debit", accountKey: "5000" },
      { amount: 300, posting: "Credit", accountKey: "1400" },
    ]);
    expect(() => assertBalanced(je.lines)).not.toThrow();
  });

  it("negative amount → mirror-image (swap DR/CR) with a POSITIVE amount", () => {
    const je = buildJournalFromExport({ postingKey: "cogs:r:s:-:FRUIT:rev", amount: -300, debitAccount: "5000", creditAccount: "1400", currency: "USD" }, DATE);
    expect(je.lines).toEqual([
      { amount: 300, posting: "Debit", accountKey: "1400" },
      { amount: 300, posting: "Credit", accountKey: "5000" },
    ]);
  });

  it("throws if an account is missing (a WITHHELD row must never reach the poster)", () => {
    expect(() => buildJournalFromExport({ postingKey: "k", amount: 10, debitAccount: null, creditAccount: "1400", currency: "USD" }, DATE)).toThrow(/no mapped accounts/);
  });

  it("toTxnDate formats YYYY-MM-DD (UTC)", () => {
    expect(toTxnDate(new Date("2026-01-05T23:59:00Z"))).toBe("2026-01-05");
  });
});
