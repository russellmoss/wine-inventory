import "server-only";

/**
 * VI-P8 Unit 7 — per-tenant/DAY/provider request telemetry + the CDO daily-cap headroom gate (council R1).
 * The enforcement key is DAILY because NOAA CDO's cap is 10k requests/DAY (5 req/s) — a monthly key would
 * mis-enforce it. Meters BILLABLE provider attempts (success or fail). Atomic INSERT … ON CONFLICT DO UPDATE
 * (never read-modify-write) so concurrent sweeps don't lose a count, in its own tenant-scoped tx so a
 * rolled-back fetch is still counted. Mirrors spatial/usage-core.
 */
import { runInTenantRawTx } from "@/lib/tenant/tx";
import { prisma } from "@/lib/prisma";
import { CDO_DAILY_CAP } from "./config";
import type { ProviderKey, WeatherSourceKey } from "./providers/types";

/** PURE: the UTC civil-day key for a moment (YYYY-MM-DD). */
export function usageDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Atomically add `requests` to the current tenant's counter for (day, provider). */
export async function recordWeatherUsage(
  provider: WeatherSourceKey,
  opts: { requests?: number; error?: string } = {},
  date: Date = new Date(),
): Promise<void> {
  const requests = Math.trunc(opts.requests ?? 1);
  const dayKey = usageDayKey(date);
  const lastError = opts.error ?? null;
  await runInTenantRawTx((tx, tenantId) =>
    tx.$executeRaw`
      INSERT INTO "weather_provider_usage" ("tenantId", "dayKey", "provider", "requestCount", "lastError", "updatedAt")
      VALUES (${tenantId}, ${dayKey}::date, ${provider}, ${requests}::int, ${lastError}, now())
      ON CONFLICT ("tenantId", "dayKey", "provider") DO UPDATE SET
        "requestCount" = "weather_provider_usage"."requestCount" + EXCLUDED."requestCount",
        "lastError" = COALESCE(EXCLUDED."lastError", "weather_provider_usage"."lastError"),
        "updatedAt" = now()`,
  );
}

export type WeatherUsageSnapshot = { readonly dayKey: string; readonly provider: string; readonly requestCount: number };

/** Read the current tenant's per-provider usage for `date`'s day. */
export async function readWeatherUsage(date: Date = new Date()): Promise<WeatherUsageSnapshot[]> {
  const dayKey = new Date(`${usageDayKey(date)}T00:00:00.000Z`);
  const rows = await prisma.weatherProviderUsage.findMany({ where: { dayKey } });
  return rows.map((r) => ({ dayKey: usageDayKey(r.dayKey), provider: r.provider, requestCount: r.requestCount }));
}

/** PURE: has this provider hit its daily cap? Only CDO has a hard cap; others are effectively uncapped. */
export function isProviderDailyExhausted(provider: ProviderKey, requestCount: number): boolean {
  if (provider === "noaa_cdo") return requestCount >= CDO_DAILY_CAP;
  return false;
}
