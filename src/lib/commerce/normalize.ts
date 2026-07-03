import type { ProviderOrder } from "@/lib/commerce/adapter";

// Phase 16 Unit 5 — normalize a provider order into the PII-FREE economic snapshot we persist on the
// order projection and diff against. Only opaque ids + amounts + SKU refs; never a customer name/email
// (D19). Money is already in major units (the client did cents→dollars). Pure + unit-tested.

export type SnapshotLine = { skuRef: string; inventoryLocationId: string | null; qty: number };

export type EconomicSnapshot = {
  paymentStatus: string;
  channel: string | null;
  currency: string;
  occurredAt: string; // ISO
  paidAt: string | null; // ISO — drives the accounting/business date
  updatedAt: string; // ISO — poll watermark
  // Net economics (major units). revenue = product subtotal; discount = order-level discount.
  revenue: number;
  tax: number;
  shipping: number;
  discount: number;
  lines: SnapshotLine[];
};

export function normalizeSnapshot(order: ProviderOrder): EconomicSnapshot {
  return {
    paymentStatus: order.paymentStatus,
    channel: order.channel ?? null,
    currency: order.currency,
    occurredAt: order.occurredAt,
    paidAt: order.paidAt ?? null,
    updatedAt: order.updatedAt,
    revenue: order.subtotal,
    tax: order.tax,
    shipping: order.shipping,
    discount: order.discount,
    lines: order.lines.map((l) => ({ skuRef: l.skuRef, inventoryLocationId: l.inventoryLocationId ?? null, qty: l.quantity })),
  };
}

/** The business date a delta posts on: the paid date if we have it, else when the order occurred. */
export function accountingDateOf(s: EconomicSnapshot): Date {
  return new Date(s.paidAt ?? s.occurredAt);
}
