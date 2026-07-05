import "server-only";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/round";

// Phase 16 Unit 10b — the read-only DTC per-channel margin view. Joins ingested revenue deltas
// (net of discount, EXCLUDING tax + shipping) against Phase-8 absorption COGS, grouped by WineSku ×
// channel. NO posting, NO GL writes — read-only aggregation. Every delta (SALE/ADJUSTMENT/REVERSAL/
// REFUND) is signed, so refunds net in naturally. The surface MUST carry a persistent
// "revenue gross of processor fees" caveat (the documented undeposited-funds / payout gap) so margin is
// never read as final-net.

export const GROSS_OF_FEES_CAVEAT = "Revenue is gross of payment-processor fees — margin is before fees, not final net.";

export type MarginLine = { skuRef: string; qtyDelta: number; revenueDelta: number };
export type MarginEvent = { channel: string | null; discountDelta: number; lines: MarginLine[] };
export type MarginRow = { skuId: string; skuLabel: string; channel: string; unitsSold: number; netRevenue: number; cogs: number; margin: number; marginPct: number | null };

/**
 * PURE: aggregate revenue deltas × COGS into per-(WineSku, channel) margin rows. Order-level discount is
 * attributed to lines proportionally by line revenue. COGS = latest per-bottle absorption cost × net
 * units sold. Unmapped skuRefs are skipped (an emitted delta is always mapped).
 */
export function aggregateMargin(
  events: MarginEvent[],
  skuByRef: Map<string, { skuId: string; label: string }>,
  costPerBottleBySku: Map<string, number>,
): MarginRow[] {
  const acc = new Map<string, { skuId: string; skuLabel: string; channel: string; unitsSold: number; netRevenue: number }>();
  for (const ev of events) {
    const known = ev.lines.filter((l) => skuByRef.has(l.skuRef));
    const totalLineRev = known.reduce((s, l) => s + l.revenueDelta, 0);
    for (const l of known) {
      const sku = skuByRef.get(l.skuRef)!;
      const channel = ev.channel ?? "Unknown";
      const key = `${sku.skuId}::${channel}`;
      const discountShare = totalLineRev !== 0 ? (ev.discountDelta * l.revenueDelta) / totalLineRev : 0;
      const net = l.revenueDelta - discountShare;
      const row = acc.get(key) ?? { skuId: sku.skuId, skuLabel: sku.label, channel, unitsSold: 0, netRevenue: 0 };
      row.unitsSold += l.qtyDelta;
      row.netRevenue += net;
      acc.set(key, row);
    }
  }
  const rows: MarginRow[] = [];
  for (const r of acc.values()) {
    const netRevenue = round2(r.netRevenue);
    const cogs = round2((costPerBottleBySku.get(r.skuId) ?? 0) * r.unitsSold);
    const margin = round2(netRevenue - cogs);
    rows.push({ ...r, netRevenue, cogs, margin, marginPct: netRevenue !== 0 ? Math.round((margin / netRevenue) * 1000) / 10 : null });
  }
  return rows.sort((a, b) => b.margin - a.margin);
}

export type DtcMargin = { rows: MarginRow[]; caveat: string };

/** Read-only DTC margin, grouped by WineSku × channel. Tenant-scoped (K12: no ALS read in a cached fn —
 *  this is a direct RSC read, not cached). */
export async function getDtcMargin(): Promise<DtcMargin> {
  const [events, skuMaps] = await Promise.all([
    prisma.salesExportEvent.findMany({ select: { channel: true, discountDelta: true, lineDeltas: true } }),
    prisma.commerce7SkuMap.findMany({ where: { wineSkuId: { not: null } }, select: { externalVariantId: true, wineSkuId: true } }),
  ]);

  const skuIds = [...new Set(skuMaps.map((m) => m.wineSkuId as string))];
  const [wineSkus, snapshots] = await Promise.all([
    prisma.wineSku.findMany({ where: { id: { in: skuIds } }, select: { id: true, name: true, vintage: true } }),
    // Latest per-bottle absorption cost per SKU (Phase-8 COGS seam).
    prisma.bottlingCostSnapshot.findMany({ where: { skuId: { in: skuIds } }, select: { skuId: true, costPerBottle: true, bottledAt: true }, orderBy: { bottledAt: "desc" } }),
  ]);

  const labelBySku = new Map(wineSkus.map((w) => [w.id, w.vintage ? `${w.name} ${w.vintage}` : `${w.name} (NV)`]));
  const skuByRef = new Map<string, { skuId: string; label: string }>();
  for (const m of skuMaps) skuByRef.set(m.externalVariantId, { skuId: m.wineSkuId as string, label: labelBySku.get(m.wineSkuId as string) ?? "Wine" });

  const costPerBottleBySku = new Map<string, number>();
  for (const s of snapshots) if (!costPerBottleBySku.has(s.skuId)) costPerBottleBySku.set(s.skuId, Number(s.costPerBottle)); // first = latest (desc)

  const marginEvents: MarginEvent[] = events.map((e) => ({ channel: e.channel, discountDelta: Number(e.discountDelta), lines: (e.lineDeltas as unknown as MarginLine[]) ?? [] }));
  return { rows: aggregateMargin(marginEvents, skuByRef, costPerBottleBySku), caveat: GROSS_OF_FEES_CAVEAT };
}
