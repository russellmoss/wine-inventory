import "server-only";
import { prisma } from "@/lib/prisma";

// Phase 7 (K14): the singleton winery-settings row (the app is single-tenant). Read without a
// write (default off when the row doesn't exist yet); the toggle action upserts it.

export type AppSettingsView = { sparklingEnabled: boolean };

export async function getAppSettings(): Promise<AppSettingsView> {
  const s = await prisma.appSettings.findUnique({ where: { id: "singleton" }, select: { sparklingEnabled: true } });
  return { sparklingEnabled: s?.sparklingEnabled ?? false };
}

/** The capability gate for the ENTIRE traditional-method sparkling UI/nav (default off). */
export async function isSparklingEnabled(): Promise<boolean> {
  return (await getAppSettings()).sparklingEnabled;
}
