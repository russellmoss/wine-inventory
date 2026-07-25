import "server-only";

/**
 * Vineyard Intelligence P2 — CDSE quota + blob-egress telemetry (Unit 7).
 *
 * Meters BILLABLE PROVIDER ATTEMPTS (not successful datasets — S6): a failed fetch still spends a request
 * and PU against the free-tier allowance (10k requests / 10k PU per month), and the request budget is the
 * one the whole architecture optimizes for. Drives the visible quota counter + the DARK auto-add headroom
 * gate (rule §2.8). Mirrors WeighTagCounter's one-row-per-key shape.
 *
 * The increment is a SINGLE atomic `INSERT … ON CONFLICT DO UPDATE` statement (not a read-modify-write), so
 * two concurrent job runs incrementing the same tenant/month never lose a count. It runs in its OWN
 * tenant-scoped tx, independent of the caller's job tx, so a rolled-back fetch is still counted.
 */
import { runInTenantRawTx } from "@/lib/tenant/tx";
import { prisma } from "@/lib/prisma";

/** PURE: the billing bucket for a moment — UTC year-month (CDSE's quota resets on the provider's UTC clock). */
export function usageYearMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type CdseUsageDelta = {
  /** Billable provider requests this call made (success or fail). */
  readonly requests?: number;
  /** CDSE processing units spent. */
  readonly processingUnits?: number;
  /** Bytes read out of blob (raster egress). */
  readonly blobBytes?: number;
};

/**
 * Atomically add a usage delta to the current tenant's counter for `date`'s month. The tenant comes from
 * the ALS context (the job runs under runAsTenant); RLS + the WITH CHECK confine the write to that tenant.
 */
export async function recordCdseUsage(delta: CdseUsageDelta, date: Date = new Date()): Promise<void> {
  const requests = Math.trunc(delta.requests ?? 0);
  const pu = delta.processingUnits ?? 0;
  const bytes = Math.trunc(delta.blobBytes ?? 0);
  if (requests === 0 && pu === 0 && bytes === 0) return;
  const yearMonth = usageYearMonth(date);
  await runInTenantRawTx((tx, tenantId) =>
    tx.$executeRaw`
      INSERT INTO "cdse_usage_counter" ("tenantId", "yearMonth", "requestCount", "processingUnits", "blobEgressBytes", "updatedAt")
      VALUES (${tenantId}, ${yearMonth}, ${requests}::int, ${pu}::numeric, ${bytes}::bigint, now())
      ON CONFLICT ("tenantId", "yearMonth") DO UPDATE SET
        "requestCount" = "cdse_usage_counter"."requestCount" + EXCLUDED."requestCount",
        "processingUnits" = "cdse_usage_counter"."processingUnits" + EXCLUDED."processingUnits",
        "blobEgressBytes" = "cdse_usage_counter"."blobEgressBytes" + EXCLUDED."blobEgressBytes",
        "updatedAt" = now()`,
  );
}

export type CdseUsageSnapshot = {
  readonly yearMonth: string;
  readonly requestCount: number;
  readonly processingUnits: number;
  readonly blobEgressBytes: number;
};

/** Read the current tenant's usage for `date`'s month (the visible counter + the auto-add headroom gate). */
export async function readCdseUsage(date: Date = new Date()): Promise<CdseUsageSnapshot> {
  const yearMonth = usageYearMonth(date);
  const row = await prisma.cdseUsageCounter.findFirst({ where: { yearMonth } });
  return {
    yearMonth,
    requestCount: row?.requestCount ?? 0,
    processingUnits: row ? Number(row.processingUnits) : 0,
    blobEgressBytes: row ? Number(row.blobEgressBytes) : 0,
  };
}

/** The CDSE free-tier monthly allowances (requests bind ~26× before PU — P0). */
export const CDSE_FREE_TIER = { requests: 10_000, processingUnits: 10_000 } as const;

/** PURE: has this month's usage hit the request or PU cap? Gates the DARK auto-add (rule §2.8). */
export function isCdseQuotaExhausted(u: Pick<CdseUsageSnapshot, "requestCount" | "processingUnits">): boolean {
  return u.requestCount >= CDSE_FREE_TIER.requests || u.processingUnits >= CDSE_FREE_TIER.processingUnits;
}
