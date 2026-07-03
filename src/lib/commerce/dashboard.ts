import "server-only";
import { prisma } from "@/lib/prisma";
import { getConnectionSummary, type Commerce7ConnectionSummary } from "@/lib/commerce/connection";
import { isSettled } from "@/lib/commerce/diff";
import type { DriftSummary } from "@/lib/commerce/inventory-drift";

// Phase 16 Unit 10 — read-only sync-status data for the Commerce7 dashboard. Connection + webhook health,
// the revenue-delivery queue by status, and the attention rows: unmapped/withheld orders, held-unpaid
// orders, and inventory DRIFT (read-only — "review", never "auto-fix"). Never returns any secret.
// Tenant-scoped (RSC resolves tenant from the session).

export type Commerce7Dashboard = {
  connection: Commerce7ConnectionSummary | null;
  deliveryCounts: Record<string, number>;
  withheldOrders: number;
  heldUnpaid: number;
  drift: { drifting: number; checkedAt: string | null; rows: DriftSummary["rows"] };
  needsAttention: number;
};

export async function getCommerce7Dashboard(): Promise<Commerce7Dashboard> {
  const [connection, grouped, withheldOrders, seenOrders, driftConn] = await Promise.all([
    getConnectionSummary(),
    prisma.accountingDelivery.groupBy({ by: ["status"], where: { salesExportEventId: { not: null } }, _count: { _all: true } }),
    prisma.commerce7Order.count({ where: { withheldReason: { not: null } } }),
    prisma.commerce7Order.findMany({ where: { paymentStatus: { not: null } }, select: { paymentStatus: true }, take: 5000 }),
    prisma.commerce7Connection.findFirst({ where: { provider: "COMMERCE7" }, select: { driftSummary: true, driftCheckedAt: true } }),
  ]);

  const deliveryCounts: Record<string, number> = {};
  for (const g of grouped) deliveryCounts[g.status] = g._count._all;

  const heldUnpaid = seenOrders.filter((o) => o.paymentStatus && !isSettled(o.paymentStatus)).length;

  const driftSummary = (driftConn?.driftSummary as DriftSummary | null) ?? null;
  const drift = {
    drifting: driftSummary?.drifting ?? 0,
    checkedAt: driftConn?.driftCheckedAt ? driftConn.driftCheckedAt.toISOString() : null,
    rows: driftSummary?.rows ?? [],
  };

  const needsAttention = needsAttentionCount({
    withheldOrders,
    heldUnpaid,
    drifting: drift.drifting,
    failed: deliveryCounts.FAILED ?? 0,
    webhookStale: !!connection && connection.status === "CONNECTED" && !connection.webhookHealthy,
  });

  return { connection, deliveryCounts, withheldOrders, heldUnpaid, drift, needsAttention };
}

/** PURE: total items needing a human look (unmapped/withheld + unpaid + drift + failed posts + a stale webhook). */
export function needsAttentionCount(p: { withheldOrders: number; heldUnpaid: number; drifting: number; failed: number; webhookStale: boolean }): number {
  return p.withheldOrders + p.heldUnpaid + p.drifting + p.failed + (p.webhookStale ? 1 : 0);
}
