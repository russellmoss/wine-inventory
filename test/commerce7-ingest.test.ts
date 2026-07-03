import { describe, it, expect } from "vitest";
import { normalizeSnapshot, accountingDateOf, type EconomicSnapshot } from "@/lib/commerce/normalize";
import { diffSnapshots, isSettled } from "@/lib/commerce/diff";
import type { ProviderOrder } from "@/lib/commerce/adapter";

// Phase 16 Unit 5 — the delta engine (the riskiest new logic). Pure diff/normalize; the DB-backed
// ingest atomicity (delta + SALE + delivery in one tx, rollback, unmapped-withhold, insufficient-stock
// CONFLICT, exactly-once) is proven end-to-end in the Unit-9 verify:commerce7-idempotency harness.

function snap(over: Partial<EconomicSnapshot> = {}): EconomicSnapshot {
  return {
    paymentStatus: "Paid",
    channel: "DTC",
    currency: "USD",
    occurredAt: "2026-07-01T10:00:00.000Z",
    paidAt: "2026-07-01T10:05:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    revenue: 90,
    tax: 7.2,
    shipping: 15,
    discount: 5,
    lines: [{ skuRef: "var_1", inventoryLocationId: "loc_1", qty: 2, revenue: 90 }],
    ...over,
  };
}

describe("isSettled", () => {
  it("recognizes Paid + refund states, not carts/authorized/cancelled", () => {
    expect(isSettled("Paid")).toBe(true);
    expect(isSettled("Partially Refunded")).toBe(true);
    expect(isSettled("Authorized")).toBe(false);
    expect(isSettled("Cancelled")).toBe(false);
    expect(isSettled("Not Paid")).toBe(false);
  });
});

describe("diffSnapshots", () => {
  it("first settled order → SALE with full deltas + depletion", () => {
    const d = diffSnapshots(null, snap());
    expect(d?.kind).toBe("SALE");
    expect(d?.revenueDelta).toBe(90);
    expect(d?.salesTaxDelta).toBe(7.2);
    expect(d?.lineDeltas).toEqual([{ skuRef: "var_1", inventoryLocationId: "loc_1", qtyDelta: 2, revenueDelta: 90 }]);
  });

  it("a cart / unpaid order emits NOTHING (never depletes phantom stock)", () => {
    expect(diffSnapshots(null, snap({ paymentStatus: "Not Paid" }))).toBeNull();
    expect(diffSnapshots(null, snap({ paymentStatus: "Authorized" }))).toBeNull();
  });

  it("a duplicate (unchanged) settled order → null (no-op)", () => {
    expect(diffSnapshots(snap(), snap())).toBeNull();
  });

  it("an edit that raises qty → ADJUSTMENT of the difference", () => {
    const prev = snap();
    const next = snap({ revenue: 135, lines: [{ skuRef: "var_1", inventoryLocationId: "loc_1", qty: 3, revenue: 135 }] });
    const d = diffSnapshots(prev, next);
    expect(d?.kind).toBe("ADJUSTMENT");
    expect(d?.revenueDelta).toBe(45);
    expect(d?.lineDeltas).toEqual([{ skuRef: "var_1", inventoryLocationId: "loc_1", qtyDelta: 1, revenueDelta: 45 }]);
  });

  it("an edit that lowers qty while still Paid → ADJUSTMENT (negative), not a refund", () => {
    const prev = snap();
    const next = snap({ revenue: 45, lines: [{ skuRef: "var_1", inventoryLocationId: "loc_1", qty: 1, revenue: 45 }] });
    const d = diffSnapshots(prev, next);
    expect(d?.kind).toBe("ADJUSTMENT");
    expect(d?.revenueDelta).toBe(-45);
    expect(d?.lineDeltas).toEqual([{ skuRef: "var_1", inventoryLocationId: "loc_1", qtyDelta: -1, revenueDelta: -45 }]);
  });

  it("an added line → ADJUSTMENT with a new line delta", () => {
    const prev = snap();
    const next = snap({ revenue: 130, lines: [{ skuRef: "var_1", inventoryLocationId: "loc_1", qty: 2, revenue: 90 }, { skuRef: "var_2", inventoryLocationId: "loc_1", qty: 1, revenue: 40 }] });
    const d = diffSnapshots(prev, next);
    expect(d?.kind).toBe("ADJUSTMENT");
    expect(d?.lineDeltas).toContainEqual({ skuRef: "var_2", inventoryLocationId: "loc_1", qtyDelta: 1, revenueDelta: 40 });
  });

  it("a tax-only edit → ADJUSTMENT with only a tax delta, no line move", () => {
    const prev = snap();
    const next = snap({ tax: 9.2 });
    const d = diffSnapshots(prev, next);
    expect(d?.kind).toBe("ADJUSTMENT");
    expect(d?.salesTaxDelta).toBe(2);
    expect(d?.lineDeltas).toEqual([]);
  });

  it("a full cancel (Paid → Cancelled) → REVERSAL that unwinds revenue + restores stock", () => {
    const prev = snap();
    const next = snap({ paymentStatus: "Cancelled" });
    const d = diffSnapshots(prev, next);
    expect(d?.kind).toBe("REVERSAL");
    expect(d?.revenueDelta).toBe(-90);
    expect(d?.lineDeltas).toEqual([{ skuRef: "var_1", inventoryLocationId: "loc_1", qtyDelta: -2, revenueDelta: -90 }]);
  });

  it("a partial refund (status carries 'refund', revenue down) → REFUND of the difference", () => {
    const prev = snap();
    const next = snap({ paymentStatus: "Partially Refunded", revenue: 45, lines: [{ skuRef: "var_1", inventoryLocationId: "loc_1", qty: 1, revenue: 45 }] });
    const d = diffSnapshots(prev, next);
    expect(d?.kind).toBe("REFUND");
    expect(d?.revenueDelta).toBe(-45);
    expect(d?.lineDeltas).toEqual([{ skuRef: "var_1", inventoryLocationId: "loc_1", qtyDelta: -1, revenueDelta: -45 }]);
  });

  it("merges duplicate (variant, location) lines by summing qty", () => {
    const next = snap({ lines: [{ skuRef: "var_1", inventoryLocationId: "loc_1", qty: 2, revenue: 60 }, { skuRef: "var_1", inventoryLocationId: "loc_1", qty: 1, revenue: 30 }] });
    const d = diffSnapshots(null, next);
    expect(d?.lineDeltas).toEqual([{ skuRef: "var_1", inventoryLocationId: "loc_1", qtyDelta: 3, revenueDelta: 90 }]);
  });
});

describe("normalizeSnapshot", () => {
  it("maps a provider order to a PII-free snapshot; accountingDate prefers paidAt", () => {
    const order: ProviderOrder = {
      orderId: "o1",
      customerId: "c1",
      channel: "Club",
      paymentStatus: "Paid",
      currency: "USD",
      updatedAt: "2026-07-02T00:00:00.000Z",
      occurredAt: "2026-07-01T00:00:00.000Z",
      paidAt: "2026-07-01T09:00:00.000Z",
      lines: [{ skuRef: "var_1", quantity: 2, unitPrice: 45, lineSubtotal: 90, tax: 7.2, discount: 0, inventoryLocationId: "loc_1" }],
      subtotal: 90,
      tax: 7.2,
      shipping: 15,
      discount: 5,
      total: 107.2,
    };
    const s = normalizeSnapshot(order);
    expect(s.revenue).toBe(90);
    expect(s.channel).toBe("Club");
    expect(s.lines).toEqual([{ skuRef: "var_1", inventoryLocationId: "loc_1", qty: 2, revenue: 90 }]);
    expect(accountingDateOf(s).toISOString()).toBe("2026-07-01T09:00:00.000Z");
    expect(s).not.toHaveProperty("customerName");
  });
});
