import { describe, it, expect } from "vitest";
import { buildBillPayload } from "@/lib/accounting/qbo/bill";
import { docNumberFor } from "@/lib/accounting/qbo/client";

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
});
