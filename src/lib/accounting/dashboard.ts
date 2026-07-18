import "server-only";
import { prisma } from "@/lib/prisma";
import { getConnectionSummary, type ConnectionSummary } from "@/lib/accounting/connection";

// Phase 15 Unit 12 — read-only sync-status data for the accounting dashboard. Connection health +
// delivery queue grouped by status + the rows that need attention (FAILED / DELETED_IN_GL). Never
// returns token material. Tenant-scoped (RSC resolves tenant from the session).

export type DeliveryCounts = Partial<Record<string, number>>;

export type AttentionRow = {
  id: string;
  status: string;
  lastError: string | null;
  externalId: string | null;
  objectType: string | null;
  updatedAt: string;
};

export type AccountingDashboard = {
  connection: ConnectionSummary | null;
  counts: DeliveryCounts;
  attention: AttentionRow[];
  needsAttention: number;
};

export async function getAccountingDashboard(): Promise<AccountingDashboard> {
  const [connection, grouped, attention] = await Promise.all([
    getConnectionSummary(),
    prisma.accountingDelivery.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.accountingDelivery.findMany({
      // FAILED / DELETED_IN_GL, plus Plan 076 payment discrepancies (a POSTED bill the reconcile flagged with
      // a lastError — e.g. "marked Paid here but QuickBooks still shows a balance").
      where: { OR: [{ status: { in: ["FAILED", "DELETED_IN_GL"] } }, { status: "POSTED", lastError: { not: null } }] },
      select: { id: true, status: true, lastError: true, externalId: true, objectType: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);

  const counts: DeliveryCounts = {};
  for (const g of grouped) counts[g.status] = g._count._all;

  const needsAttention = attention.length + (connection?.status === "NEEDS_REAUTH" ? 1 : 0);
  return {
    connection,
    counts,
    attention: attention.map((a) => ({ ...a, updatedAt: a.updatedAt.toISOString() })),
    needsAttention,
  };
}
