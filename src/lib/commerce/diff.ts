import type { EconomicSnapshot, SnapshotLine } from "@/lib/commerce/normalize";
import type { SalesDeltaKind } from "@prisma/client";

// Phase 16 Unit 5 — the delta engine (the riskiest new logic; heavily tested). Diff the last-known
// economic snapshot against the current one and emit the DIFFERENCE as an append-only delta. Economics
// (and inventory) are recognized ONLY when the order is SETTLED — a cart/draft/authorized order
// contributes zeros, so it never posts revenue or depletes phantom stock (Paid-only). A cancel/refund is
// just a negative-delta from the settled state. Pure + deterministic.

// Statuses whose economics we recognize. Everything else (cart, draft, "Authorized" but not captured,
// "Cancelled", "Voided", "Not Paid", "Pending") contributes ZERO — the diff of zeros posts/depletes
// nothing. (Exact Commerce7 status strings confirmed in Unit 0; add here as they surface.)
const SETTLED = new Set(["paid", "partially refunded", "refunded", "partiallyrefunded"]);

export function isSettled(paymentStatus: string): boolean {
  return SETTLED.has(paymentStatus.trim().toLowerCase());
}

export type LineDelta = { skuRef: string; inventoryLocationId: string | null; qtyDelta: number };

export type SalesDelta = {
  kind: SalesDeltaKind;
  revenueDelta: number;
  salesTaxDelta: number;
  shippingDelta: number;
  discountDelta: number;
  lineDeltas: LineDelta[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const lineKey = (l: SnapshotLine | LineDelta) => `${l.skuRef}@@${l.inventoryLocationId ?? ""}`;

type Effective = { revenue: number; tax: number; shipping: number; discount: number; lines: Map<string, LineDelta> };

/** The economically-recognized view of a snapshot: its amounts + line quantities when settled, else
 *  zeros. This is what makes "unpaid → nothing" and "cancel → full unwind" fall out of one diff. */
function effective(s: EconomicSnapshot | null): Effective {
  const zero: Effective = { revenue: 0, tax: 0, shipping: 0, discount: 0, lines: new Map() };
  if (!s || !isSettled(s.paymentStatus)) return zero;
  const lines = new Map<string, LineDelta>();
  for (const l of s.lines) {
    const k = lineKey(l);
    const prev = lines.get(k);
    // Merge duplicate (variant, location) lines by summing qty.
    lines.set(k, { skuRef: l.skuRef, inventoryLocationId: l.inventoryLocationId, qtyDelta: (prev?.qtyDelta ?? 0) + l.qty });
  }
  return { revenue: s.revenue, tax: s.tax, shipping: s.shipping, discount: s.discount, lines };
}

/**
 * Diff prev → next. Returns the delta, or null when there is no economic/inventory change (a duplicate,
 * a replay, or a non-economic edit like a fulfillment-status change). Kind:
 *  - prev had no recognized revenue, next does           → SALE (first settled)
 *  - next has no recognized revenue, prev did            → REVERSAL (full unwind: cancel / full refund)
 *  - net revenue decreased (money returned)              → REFUND (partial)
 *  - otherwise                                            → ADJUSTMENT (edit up / line change)
 */
export function diffSnapshots(prev: EconomicSnapshot | null, next: EconomicSnapshot): SalesDelta | null {
  const p = effective(prev);
  const n = effective(next);

  const revenueDelta = round2(n.revenue - p.revenue);
  const salesTaxDelta = round2(n.tax - p.tax);
  const shippingDelta = round2(n.shipping - p.shipping);
  const discountDelta = round2(n.discount - p.discount);

  const lineDeltas: LineDelta[] = [];
  const keys = new Set<string>([...p.lines.keys(), ...n.lines.keys()]);
  for (const k of keys) {
    const a = p.lines.get(k);
    const b = n.lines.get(k);
    const qtyDelta = (b?.qtyDelta ?? 0) - (a?.qtyDelta ?? 0);
    if (qtyDelta !== 0) {
      const ref = b ?? a!;
      lineDeltas.push({ skuRef: ref.skuRef, inventoryLocationId: ref.inventoryLocationId, qtyDelta });
    }
  }

  const noEconomic = revenueDelta === 0 && salesTaxDelta === 0 && shippingDelta === 0 && discountDelta === 0;
  if (noEconomic && lineDeltas.length === 0) return null;

  // Kind uses paymentStatus to tell a downward EDIT (still "Paid" → ADJUSTMENT) from a partial REFUND
  // (status carries "refund"). The economic amounts are correct regardless of the label.
  let kind: SalesDeltaKind;
  if (p.revenue === 0 && n.revenue > 0) kind = "SALE";
  else if (n.revenue === 0 && p.revenue > 0) kind = "REVERSAL"; // full unwind: cancel / full refund
  else if (n.revenue < p.revenue) kind = /refund/i.test(next.paymentStatus) ? "REFUND" : "ADJUSTMENT";
  else kind = "ADJUSTMENT";

  return { kind, revenueDelta, salesTaxDelta, shippingDelta, discountDelta, lineDeltas };
}
