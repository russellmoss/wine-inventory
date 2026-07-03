import { describe, it, expect } from "vitest";
import { buildSalesDeltaJournal, type SalesDeltaForJournal } from "@/lib/accounting/qbo/journal";

// Phase 16 Unit 7 — the DTC revenue-delta journal builder. The exactly-once poster branch (adopt on
// crash, single-claim, edit posts only the difference) is proven against a mock QBO adapter in the
// Unit-9 verify:commerce7-idempotency harness.

const ACCOUNTS = { revenueAccount: "4000", clearingAccount: "1499", taxAccount: "2200", shippingAccount: "4100", discountAccount: "4900" };
const DATE = new Date("2026-07-01T00:00:00.000Z");

function delta(over: Partial<SalesDeltaForJournal> = {}): SalesDeltaForJournal {
  return { postingKey: "sale:o1:v1", currency: "USD", revenueDelta: 90, salesTaxDelta: 7.2, shippingDelta: 15, discountDelta: 5, ...ACCOUNTS, ...over };
}

function sums(lines: { amount: number; posting: string }[]) {
  const dr = lines.filter((l) => l.posting === "Debit").reduce((s, l) => s + l.amount, 0);
  const cr = lines.filter((l) => l.posting === "Credit").reduce((s, l) => s + l.amount, 0);
  return { dr: Math.round(dr * 100), cr: Math.round(cr * 100) };
}

describe("buildSalesDeltaJournal", () => {
  it("a SALE balances: DR clearing + DR discount = CR revenue + tax + shipping", () => {
    const je = buildSalesDeltaJournal(delta(), DATE);
    const clearing = je.lines.find((l) => l.accountKey === "1499")!;
    expect(clearing.posting).toBe("Debit");
    expect(clearing.amount).toBeCloseTo(107.2); // 90 + 7.2 + 15 − 5
    const { dr, cr } = sums(je.lines);
    expect(dr).toBe(cr);
    expect(je.txnDate).toBe("2026-07-01");
  });

  it("a refund/reversal (all-negative) mirrors: clearing becomes a credit, revenue a debit — still balanced", () => {
    const je = buildSalesDeltaJournal(delta({ postingKey: "sale:o1:v2", revenueDelta: -90, salesTaxDelta: -7.2, shippingDelta: -15, discountDelta: -5 }), DATE);
    const clearing = je.lines.find((l) => l.accountKey === "1499")!;
    const revenue = je.lines.find((l) => l.accountKey === "4000")!;
    expect(clearing.posting).toBe("Credit");
    expect(revenue.posting).toBe("Debit");
    expect(clearing.amount).toBeCloseTo(107.2);
    const { dr, cr } = sums(je.lines);
    expect(dr).toBe(cr);
  });

  it("skips zero legs (a tax-only adjustment posts clearing + tax only)", () => {
    const je = buildSalesDeltaJournal(delta({ revenueDelta: 0, salesTaxDelta: 2, shippingDelta: 0, discountDelta: 0 }), DATE);
    expect(je.lines).toHaveLength(2);
    expect(je.lines.map((l) => l.accountKey).sort()).toEqual(["1499", "2200"]);
    const { dr, cr } = sums(je.lines);
    expect(dr).toBe(cr);
  });

  it("refuses to build if a needed account is unmapped (never posts a miscoded/unbalanced JE)", () => {
    expect(() => buildSalesDeltaJournal(delta({ revenueAccount: null }), DATE)).toThrow(/revenue account/);
    // A zero leg with a null account is fine (skipped).
    expect(() => buildSalesDeltaJournal(delta({ salesTaxDelta: 0, taxAccount: null }), DATE)).not.toThrow();
  });
});
