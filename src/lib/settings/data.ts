import "server-only";
import { prisma } from "@/lib/prisma";

// Phase 12 (K10): per-org winery settings — one row per tenant. findFirst is tenant-scoped by the
// active tenant context (RLS + the Prisma extension), so it returns the calling org's row (default
// off when it doesn't exist yet); the toggle action upserts it by tenantId.

export type AppSettingsView = { sparklingEnabled: boolean };

export async function getAppSettings(): Promise<AppSettingsView> {
  const s = await prisma.appSettings.findFirst({ select: { sparklingEnabled: true } });
  return { sparklingEnabled: s?.sparklingEnabled ?? false };
}

/** The capability gate for the ENTIRE traditional-method sparkling UI/nav (default off). */
export async function isSparklingEnabled(): Promise<boolean> {
  return (await getAppSettings()).sparklingEnabled;
}
