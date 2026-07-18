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

  it("throws if there are no lines and no inventory account", () => {
    expect(() => buildBillPayload({ ...ev, debitAccount: null }, "V1")).toThrow(/no bill lines/);
  });

  // Plan 076: an aggregate per-invoice event supplies `lines` → one QBO Line per invoice line (same or
  // different GL accounts). QBO sums the lines into the Bill total; we never send an explicit total.
  it("builds a multi-line Bill from aggregate lines", () => {
    const p = buildBillPayload({
      ...ev,
      postingKey: "apinv:inv_9",
      lines: [
        { account: "1300-Inventory", amount: 387.57, description: "Yeast EC1118" },
        { account: "1300-Inventory", amount: 98.22, description: "Bentonite" },
      ],
    }, "V-9") as { DocNumber: string; Line: Array<{ Amount: number; Description?: string; AccountBasedExpenseLineDetail: { AccountRef: { value: string } } }> };
    expect(p.DocNumber).toBe(docNumberFor("apinv:inv_9"));
    expect(p.Line).toHaveLength(2);
    expect(p.Line[0].Amount).toBe(387.57);
    expect(p.Line[0].Description).toBe("Yeast EC1118");
    expect(p.Line[1].Amount).toBe(98.22);
    expect(p.Line.every((l) => l.AccountBasedExpenseLineDetail.AccountRef.value === "1300-Inventory")).toBe(true);
    expect("TotalAmt" in (p as Record<string, unknown>)).toBe(false); // QBO derives the total from the lines
  });

  it("rounds line amounts to cents", () => {
    const p = buildBillPayload({ ...ev, lines: [{ account: "1300", amount: 10.005 }] }, "V1") as { Line: Array<{ Amount: number }> };
    expect(p.Line[0].Amount).toBe(10.01);
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
