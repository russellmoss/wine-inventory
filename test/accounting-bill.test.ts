import { describe, it, expect } from "vitest";
import { buildBillPayload } from "@/lib/accounting/qbo/bill";
import { docNumberFor, QboClient } from "@/lib/accounting/qbo/client";
import type { ProviderCallContext } from "@/lib/accounting/adapter";

// Phase 15 Unit 10 — the QBO Bill payload from an ApExportEvent (DR inventory line; QBO auto-CR A/P).

describe("buildBillPayload", () => {
  const ev = {
    postingKey: "ap:lot_123",
    amount: 250,
    debitAccount: "1300-Inventory",
    receivedAt: new Date("2026-07-01T00:00:00Z"),
    dueDate: new Date("2026-07-31T00:00:00Z"),
  };

  it("builds a Bill with a vendor ref, dates, and a single inventory-account line", () => {
    const p = buildBillPayload(ev, "VENDOR-42") as {
      VendorRef: { value: string };
      TxnDate: string;
      DueDate: string;
      DocNumber: string;
      Line: Array<{ Amount: number; AccountBasedExpenseLineDetail: { AccountRef: { value: string } } }>;
    };
    expect(p.VendorRef.value).toBe("VENDOR-42");
    expect(p.TxnDate).toBe("2026-07-01");
    expect(p.DueDate).toBe("2026-07-31");
    expect(p.DocNumber).toBe(docNumberFor("ap:lot_123"));
    expect(p.Line[0].Amount).toBe(250);
    expect(p.Line[0].AccountBasedExpenseLineDetail.AccountRef.value).toBe("1300-Inventory");
  });

  it("omits DueDate when there are no terms", () => {
    const p = buildBillPayload({ ...ev, dueDate: null }, "V1") as Record<string, unknown>;
    expect("DueDate" in p).toBe(false);
  });

  it("throws if the inventory account is missing", () => {
    expect(() => buildBillPayload({ ...ev, debitAccount: null }, "V1")).toThrow(/no inventory account/);
  });

  // Plan 073: a foreign bill carries CurrencyRef + the pinned ExchangeRate (home per 1 foreign); the line
  // amount is the FOREIGN amount (QBO derives the home GL = amount × rate).
  it("a foreign bill emits CurrencyRef + ExchangeRate with the FOREIGN amount", () => {
    const p = buildBillPayload({ ...ev, amount: 767.16, currency: "EUR", exchangeRate: 1.0850 }, "V-EUR") as Record<string, unknown> & {
      CurrencyRef: { value: string }; ExchangeRate: number; Line: Array<{ Amount: number }>;
    };
    expect(p.CurrencyRef).toEqual({ value: "EUR" });
    expect(p.ExchangeRate).toBe(1.085);
    expect(p.Line[0].Amount).toBe(767.16); // foreign amount, NOT converted to home
  });

  it("a home-currency bill omits CurrencyRef + ExchangeRate (single-currency posture unchanged)", () => {
    const p = buildBillPayload({ ...ev, currency: null, exchangeRate: null }, "V1") as Record<string, unknown>;
    expect("CurrencyRef" in p).toBe(false);
    expect("ExchangeRate" in p).toBe(false);
  });

  it("omits ExchangeRate when currency is set but no rate is given (let QBO apply its own daily rate)", () => {
    const p = buildBillPayload({ ...ev, currency: "EUR", exchangeRate: null }, "V-EUR") as Record<string, unknown>;
    expect(p.CurrencyRef).toEqual({ value: "EUR" });
    expect("ExchangeRate" in p).toBe(false);
  });
});

describe("getCompanyInfo — reads MultiCurrencyEnabled at connect (Plan 073, council #2)", () => {
  const ctx: ProviderCallContext = { accessToken: "t", realmId: "r1", environment: "sandbox" };
  function clientReturning(prefs: unknown) {
    const fetchImpl = (async (url: string) => {
      const u = new URL(url);
      if (u.pathname.includes("/companyinfo/")) {
        return { ok: true, status: 200, json: async () => ({ CompanyInfo: { CompanyName: "Demo Winery", Country: "US" } }) } as unknown as Response;
      }
      return { ok: true, status: 200, json: async () => ({ QueryResponse: { Preferences: [prefs] } }) } as unknown as Response;
    }) as unknown as typeof fetch;
    return new QboClient({ fetchImpl });
  }

  it("parses MultiCurrencyEnabled = true + the home currency", async () => {
    const info = await clientReturning({ CurrencyPrefs: { HomeCurrency: { value: "USD" }, MultiCurrencyEnabled: true } }).getCompanyInfo(ctx);
    expect(info.homeCurrency).toBe("USD");
    expect(info.multiCurrencyEnabled).toBe(true);
  });

  it("defaults MultiCurrencyEnabled to false when the pref is absent", async () => {
    const info = await clientReturning({ CurrencyPrefs: { HomeCurrency: { value: "USD" } } }).getCompanyInfo(ctx);
    expect(info.multiCurrencyEnabled).toBe(false);
  });
});
