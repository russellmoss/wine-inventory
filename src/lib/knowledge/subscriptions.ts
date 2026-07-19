// Plan 079 — resolve which GLOBAL sources are active for a tenant. The corpus is global; per-winery
// control is the tenant-scoped KnowledgeSourceSubscription (RLS). A subscription row overrides the
// source's defaultEnabled; absent => the default. Web-app code path, so NO runAsSystem — global sources
// read via the extended client (isGlobalModel pass-through), subscriptions read inside runAsTenant so the
// RLS GUC is set (assistant requests carry no ALS tenant; we set it explicitly from the user's org).

import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";

export interface EnabledSource {
  id: string;
  key: string;
  publisher: string;
  tier: number;
}

/** The enabled sources for a tenant (empty array => the tenant has nothing enabled — retrieval fails closed). */
export async function resolveEnabledSources(tenantId: string): Promise<EnabledSource[]> {
  const sources = await prisma.knowledgeSource.findMany({
    where: { active: true },
    select: { id: true, key: true, publisher: true, tier: true, defaultEnabled: true },
  });
  // NB: await INSIDE the runAsTenant callback — a PrismaPromise is lazy, so returning it unevaluated
  // would run the query after the ALS scope exits (extension sees no tenant context, throws).
  const subs = await runAsTenant(tenantId, async () => {
    return await prisma.knowledgeSourceSubscription.findMany({ select: { sourceId: true, enabled: true } });
  });
  const override = new Map(subs.map((s) => [s.sourceId, s.enabled]));
  return sources
    .filter((s) => override.get(s.id) ?? s.defaultEnabled)
    .map(({ id, key, publisher, tier }) => ({ id, key, publisher, tier }));
}

export async function resolveEnabledSourceIds(tenantId: string): Promise<string[]> {
  return (await resolveEnabledSources(tenantId)).map((s) => s.id);
}
