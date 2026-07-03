import { describe, it, expect } from "vitest";
import { rankAccountsForRole, MAPPABLE_COMPONENTS } from "@/lib/accounting/components";
import type { NormalizedAccount } from "@/lib/accounting/adapter";

// Phase 15 Unit 6 — the pure CoA ranking (business-role suggestions) + component list.

const acct = (id: string, name: string, type: string): NormalizedAccount => ({
  accountKey: id,
  name,
  type,
  active: true,
});

const ACCOUNTS = [
  acct("1", "Checking", "Bank"),
  acct("2", "Cost of goods sold", "Cost of Goods Sold"),
  acct("3", "Inventory asset", "Other Current Asset"),
  acct("4", "Winemaking supplies", "Expense"),
  acct("5", "Barrels", "Fixed Asset"),
];

describe("rankAccountsForRole", () => {
  it("floats COGS/expense accounts first for the cost role", () => {
    const ranked = rankAccountsForRole(ACCOUNTS, "cost");
    expect(ranked[0].type).toBe("Cost of Goods Sold");
    expect(ranked[1].type).toBe("Expense");
    // a non-suggested type (Bank) is not dropped, just ranked last
    expect(ranked.map((a) => a.accountKey)).toContain("1");
    expect(ranked.length).toBe(ACCOUNTS.length);
  });

  it("floats asset accounts first for the inventory role", () => {
    const ranked = rankAccountsForRole(ACCOUNTS, "inventory");
    expect(ranked[0].type).toBe("Other Current Asset");
    expect(ranked[1].type).toBe("Fixed Asset");
  });

  it("does not mutate the input array", () => {
    const copy = [...ACCOUNTS];
    rankAccountsForRole(ACCOUNTS, "cost");
    expect(ACCOUNTS).toEqual(copy);
  });
});

describe("MAPPABLE_COMPONENTS", () => {
  it("covers the capitalizable cost components incl. VARIANCE", () => {
    const set = new Set(MAPPABLE_COMPONENTS.map((c) => c.component));
    for (const c of ["FRUIT", "MATERIAL", "BARREL", "PACKAGING", "LABOR", "OVERHEAD", "DOSAGE_LIQUEUR", "VARIANCE"]) {
      expect(set.has(c as never)).toBe(true);
    }
  });
});
