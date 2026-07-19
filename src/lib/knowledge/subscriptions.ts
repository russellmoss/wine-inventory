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

export interface SourceSetting {
  id: string;
  key: string;
  publisher: string;
  tier: number;
  enabled: boolean; // effective: the tenant's subscription override, else the source default
  defaultEnabled: boolean;
  docCount: number; // active documents in the GLOBAL corpus for this source
}

/**
 * Settings-UI loader (Unit 11): every active source + this tenant's effective on/off state + how much
 * content each holds. Unlike resolveEnabledSources (called ALS-less from the assistant with an explicit
 * tenantId), this runs inside a normal authed request, so the extended client resolves the tenant from
 * the session — global KnowledgeSource/Document read pass-through, the subscription read is RLS-scoped.
 */
export async function listSourceSettings(): Promise<SourceSetting[]> {
  const sources = await prisma.knowledgeSource.findMany({
    where: { active: true },
    select: { id: true, key: true, publisher: true, tier: true, defaultEnabled: true },
    orderBy: [{ tier: "asc" }, { publisher: "asc" }],
  });
  const subs = await prisma.knowledgeSourceSubscription.findMany({ select: { sourceId: true, enabled: true } });
  const counts = await prisma.knowledgeDocument.groupBy({
    by: ["sourceId"],
    where: { status: "active" },
    _count: { _all: true },
  });
  const override = new Map(subs.map((s) => [s.sourceId, s.enabled]));
  const countMap = new Map(counts.map((c) => [c.sourceId, c._count._all]));
  return sources.map((s) => ({
    id: s.id,
    key: s.key,
    publisher: s.publisher,
    tier: s.tier,
    defaultEnabled: s.defaultEnabled,
    enabled: override.get(s.id) ?? s.defaultEnabled,
    docCount: countMap.get(s.id) ?? 0,
  }));
}
