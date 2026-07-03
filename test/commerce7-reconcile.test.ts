import { describe, it, expect } from "vitest";
import { webhookNeedsRecreate } from "@/lib/commerce/webhook-health";
import { diffSnapshots } from "@/lib/commerce/diff";
import type { EconomicSnapshot } from "@/lib/commerce/normalize";

// Phase 16 Unit 8 — reconcile: webhook self-heal + the refund/cancel netting property (D6). The DB-backed
// read-back (sales deliveries → DELETED_IN_GL) is the EXISTING accounting reconcile sweep (it reads all
// POSTED JournalEntry deliveries regardless of source); the missed-webhook backstop is the poll cursor
// sweep. Both are exercised in the Unit-9 / Unit-11 harnesses.

function snap(over: Partial<EconomicSnapshot> = {}): EconomicSnapshot {
  return { paymentStatus: "Paid", channel: "DTC", currency: "USD", occurredAt: "2026-07-01T10:00:00.000Z", paidAt: "2026-07-01T10:05:00.000Z", updatedAt: "2026-07-01T12:00:00.000Z", revenue: 90, tax: 7.2, shipping: 15, discount: 5, lines: [{ skuRef: "var_1", inventoryLocationId: "loc_1", qty: 2, revenue: 90 }], ...over };
}

describe("webhookNeedsRecreate", () => {
  it("recreates when the probe is missing or disabled; healthy otherwise", () => {
    expect(webhookNeedsRecreate(null)).toBe(true);
    expect(webhookNeedsRecreate({ active: false })).toBe(true);
    expect(webhookNeedsRecreate({ active: true })).toBe(false);
  });
});

describe("refund/cancel netting (D6)", () => {
  it("a paid sale then a full cancel nets revenue AND inventory to zero", () => {
    const sale = diffSnapshots(null, snap());
    const reversal = diffSnapshots(snap(), snap({ paymentStatus: "Cancelled" }));
    expect(sale?.kind).toBe("SALE");
    expect(reversal?.kind).toBe("REVERSAL");
    const revenue = (sale?.revenueDelta ?? 0) + (reversal?.revenueDelta ?? 0);
    const qty = (sale?.lineDeltas[0]?.qtyDelta ?? 0) + (reversal?.lineDeltas[0]?.qtyDelta ?? 0);
    expect(revenue).toBe(0);
    expect(qty).toBe(0);
  });

  it("a paid sale then a partial refund nets to the retained amount, not zero", () => {
    const sale = diffSnapshots(null, snap());
    const refund = diffSnapshots(snap(), snap({ paymentStatus: "Partially Refunded", revenue: 45, lines: [{ skuRef: "var_1", inventoryLocationId: "loc_1", qty: 1, revenue: 45 }] }));
    expect(refund?.kind).toBe("REFUND");
    const revenue = (sale?.revenueDelta ?? 0) + (refund?.revenueDelta ?? 0);
    const qty = (sale?.lineDeltas[0]?.qtyDelta ?? 0) + (refund?.lineDeltas[0]?.qtyDelta ?? 0);
    expect(revenue).toBe(45); // one bottle's revenue retained
    expect(qty).toBe(1); // one bottle stays depleted
  });
});
