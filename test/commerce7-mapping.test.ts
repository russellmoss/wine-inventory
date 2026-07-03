import { describe, it, expect } from "vitest";
import { resolveSaleAccounts, type SalesAccountMap } from "@/lib/commerce/mapping";
import { rankAccountsForRole } from "@/lib/accounting/components";
import type { NormalizedAccount } from "@/lib/accounting/adapter";

// Phase 16 Unit 4 — the pure withhold gate + the DTC account-role ranking. DB-backed resolution
// (resolveSkuMapping, getSalesAccountMap) is exercised end-to-end in the Unit-11 harness.

const FULL: SalesAccountMap = {
  dtcRevenueAccount: "4000",
  dtcTaxAccount: "2200",
  dtcShippingAccount: "4100",
  dtcClearingAccount: "1499",
  dtcDiscountAccount: "4900",
};

describe("resolveSaleAccounts (D14 withhold gate)", () => {
  it("resolves when revenue + clearing are set and no optional legs are needed", () => {
    const map: SalesAccountMap = { ...FULL, dtcTaxAccount: null, dtcShippingAccount: null, dtcDiscountAccount: null };
    const r = resolveSaleAccounts(map, { hasTax: false, hasShipping: false, hasDiscount: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.accounts).toMatchObject({ revenueAccount: "4000", clearingAccount: "1499" });
  });

  it("withholds when revenue is unmapped", () => {
    const r = resolveSaleAccounts({ ...FULL, dtcRevenueAccount: null }, { hasTax: false, hasShipping: false, hasDiscount: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/revenue/);
  });

  it("withholds when clearing is unmapped", () => {
    const r = resolveSaleAccounts({ ...FULL, dtcClearingAccount: null }, { hasTax: false, hasShipping: false, hasDiscount: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/clearing/);
  });

  it("only requires the tax/shipping/discount account when that leg is present", () => {
    const map: SalesAccountMap = { ...FULL, dtcTaxAccount: null };
    // no tax leg → fine
    expect(resolveSaleAccounts(map, { hasTax: false, hasShipping: false, hasDiscount: false }).ok).toBe(true);
    // tax leg present but no tax account → withhold
    const r = resolveSaleAccounts(map, { hasTax: true, hasShipping: false, hasDiscount: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/sales tax/);
  });

  it("resolves fully when everything is mapped and every leg is present", () => {
    const r = resolveSaleAccounts(FULL, { hasTax: true, hasShipping: true, hasDiscount: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.accounts).toEqual({ revenueAccount: "4000", clearingAccount: "1499", taxAccount: "2200", shippingAccount: "4100", discountAccount: "4900" });
  });
});

describe("rankAccountsForRole — DTC roles", () => {
  const accounts: NormalizedAccount[] = [
    { accountKey: "1", name: "Sales", type: "Income", active: true },
    { accountKey: "2", name: "Checking", type: "Bank", active: true },
    { accountKey: "3", name: "Sales Tax Payable", type: "Other Current Liability", active: true },
    { accountKey: "4", name: "Undeposited Funds", type: "Other Current Asset", active: true },
  ];
  it("ranks revenue → Income first", () => {
    expect(rankAccountsForRole(accounts, "revenue")[0].type).toBe("Income");
  });
  it("ranks clearing → Other Current Asset first", () => {
    expect(rankAccountsForRole(accounts, "clearing")[0].type).toBe("Other Current Asset");
  });
  it("ranks salesTax → Other Current Liability first", () => {
    expect(rankAccountsForRole(accounts, "salesTax")[0].type).toBe("Other Current Liability");
  });
  it("never hides an account (returns all)", () => {
    expect(rankAccountsForRole(accounts, "revenue")).toHaveLength(4);
  });
});
