import type { CostBasisCompleteness, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeLotCost, maxCostOpIdFor, type LotCostResult } from "@/lib/cost/data";

// Phase 8 (Unit 5) — the LAZY, VERSIONED cache over the roll-up authority (D4). LotCostState is NOT an
// invariant projection; the DAG recompute (cost/data.ts computeLotCost) is the authority and this row
// is a materialization of it. Refreshed ON READ when the lot's max cost-affecting opId exceeds the
// cached watermark (computedThroughOpId) or the costing-policy version changed — NEVER eagerly fanned
// out from writeLotOperation (that would turn one backdated correction into an O(descendants)
// SERIALIZABLE write; council/Codex Q1). Script-safe.

/**
 * Pure staleness verdict (D4): the cache is stale when a newer cost-affecting op exists than the one
 * the cache folded through, OR the costing policy version moved (a toggle/method change re-values).
 */
export function isCacheStale(
  watermark: number,
  maxCostOpId: number,
  cachedPolicyVersion: number,
  currentPolicyVersion: number,
): boolean {
  return maxCostOpId > watermark || cachedPolicyVersion !== currentPolicyVersion;
}

/**
 * A lot's rolled-up cost, served from the cache when fresh, else recomputed (authority) and the cache
 * refreshed. `forceRecompute` skips the staleness probe (used by verify:cost to assert cache==recompute).
 */
export async function getLotCost(lotId: string, opts: { forceRecompute?: boolean } = {}): Promise<LotCostResult> {
  if (!opts.forceRecompute) {
    const cache = await prisma.lotCostState.findUnique({ where: { lotId } });
    if (cache) {
      const settings = await prisma.appSettings.findFirst({ select: { costingPolicyVersion: true } });
      const currentPolicyVersion = settings?.costingPolicyVersion ?? 1;
      const maxOpId = await maxCostOpIdFor(lotId);
      if (!isCacheStale(cache.computedThroughOpId, maxOpId, cache.basisVersion, currentPolicyVersion)) {
        return {
          lotId,
          totalCost: Number(cache.totalCost),
          volumeL: Number(cache.volumeL),
          costPerL: cache.costPerL == null ? null : Number(cache.costPerL),
          completeness: cache.basisCompleteness,
          components: (cache.componentBreakdown as LotCostResult["components"]) ?? {},
          expensed: 0,
          stranded: 0,
          maxCostOpId: cache.computedThroughOpId,
          policyVersion: cache.basisVersion,
        };
      }
    }
  }

  const fresh = await computeLotCost(lotId);
  await refreshCache(lotId, fresh);
  return fresh;
}

/** Materialize a fresh recompute into LotCostState (upsert; deleted-at-zero is a later concern). */
async function refreshCache(lotId: string, fresh: LotCostResult): Promise<void> {
  const data = {
    totalCost: fresh.totalCost,
    volumeL: fresh.volumeL,
    costPerL: fresh.costPerL,
    basisCompleteness: fresh.completeness as CostBasisCompleteness,
    computedThroughOpId: fresh.maxCostOpId,
    basisVersion: fresh.policyVersion,
    componentBreakdown: fresh.components as Prisma.InputJsonValue,
  };
  await prisma.lotCostState.upsert({
    where: { lotId },
    create: { lotId, ...data },
    update: data,
  });
}
