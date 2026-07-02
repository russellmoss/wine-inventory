import type { CostComponent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rollupCost, type CostEvent, type Completeness, type LotCost, type LotVolume } from "@/lib/cost/rollup";
import { isComponentCapitalized, COST_SETTINGS_DEFAULTS, type CostSettings } from "@/lib/cost/policy";

// Phase 8 (Unit 4/5 read side) — load a lot's cost DAG and run the pure roll-up (the AUTHORITY).
// Script-safe (no "server-only"): verify:cost + the read models both call it. For a SINGLE lot we
// walk the lineage ANCESTRY with the proven batched BFS (mirrors lot/data.ts loadLineageGraph) rather
// than a raw recursive CTE — the plan explicitly allows the walker for single-lot cost; bulk reporting
// can swap in a CTE later. All reads are ordinary RLS-scoped Prisma queries (no bespoke SQL).

const MAX_NODES = 200;

/** Ancestor lot ids of `rootId` (inclusive), up the lineage DAG — the lots whose cost flows into it. */
async function loadAncestryLotIds(rootId: string): Promise<string[]> {
  const ids = new Set<string>([rootId]);
  let frontier = [rootId];
  for (let depth = 0; depth < 12 && frontier.length > 0 && ids.size < MAX_NODES; depth++) {
    const edges = await prisma.lotLineage.findMany({
      where: { childLotId: { in: frontier } },
      select: { parentLotId: true },
    });
    const next: string[] = [];
    for (const e of edges) if (!ids.has(e.parentLotId)) { ids.add(e.parentLotId); next.push(e.parentLotId); }
    frontier = next;
  }
  return [...ids];
}

/** Read the tenant's costing policy straight from AppSettings (script-safe; no server-only import). */
async function readCostSettings(): Promise<CostSettings> {
  const s = await prisma.appSettings.findFirst({
    select: {
      currency: true, costingMethod: true, costingMethodEffectiveAt: true,
      capitalizeFruit: true, capitalizeBarrel: true, capitalizeLabor: true,
      capitalizeOverhead: true, capitalizePackaging: true, costingPolicyVersion: true,
    },
  });
  if (!s) return { ...COST_SETTINGS_DEFAULTS };
  return {
    currency: s.currency,
    costingMethod: s.costingMethod,
    costingMethodEffectiveAt: s.costingMethodEffectiveAt,
    capitalizeFruit: s.capitalizeFruit,
    capitalizeBarrel: s.capitalizeBarrel,
    capitalizeLabor: s.capitalizeLabor,
    capitalizeOverhead: s.capitalizeOverhead,
    capitalizePackaging: s.capitalizePackaging,
    policyVersion: s.costingPolicyVersion,
  };
}

export type LotCostResult = LotCost & {
  /** the max cost-affecting opId reflected in this result — the D4 cache watermark. */
  maxCostOpId: number;
  policyVersion: number;
};

/**
 * Compute a lot's cost by loading its ancestry's cost artifacts (CostLines → DIRECT events,
 * OperationCostTransfers → TRANSFER events; abnormal-loss events land when loss-classification wiring
 * ships) and folding them through the pure authority. Only CAPITALIZED components fold into cost;
 * non-capitalized lines are recorded but excluded here (D5/Unit 9). Reading is the recompute — this
 * IS the authority; the cache (cost/cache.ts) is a materialization of exactly this.
 */
export async function computeLotCost(rootId: string): Promise<LotCostResult> {
  const [lotIds, settings] = await Promise.all([loadAncestryLotIds(rootId), readCostSettings()]);

  const [costLines, transfers, vesselLots, bottled] = await Promise.all([
    prisma.costLine.findMany({
      where: { lotId: { in: lotIds } },
      select: { operationId: true, lotId: true, component: true, amount: true, basisCompleteness: true },
    }),
    prisma.operationCostTransfer.findMany({
      where: { toLotId: { in: lotIds } },
      select: { operationId: true, fromLotId: true, toLotId: true, transferredVolumeL: true, parentPreOpVolumeL: true },
    }),
    prisma.vesselLot.findMany({ where: { lotId: { in: lotIds } }, select: { lotId: true, volumeL: true } }),
    prisma.bottledLotState.findMany({ where: { lotId: { in: lotIds } }, select: { lotId: true, volumeL: true } }),
  ]);

  const events: CostEvent[] = [];
  for (const c of costLines) {
    if (!c.lotId) continue;
    if (!isComponentCapitalized(c.component as CostComponent, settings)) continue; // recorded, not capitalized
    events.push({
      opId: c.operationId,
      kind: "DIRECT",
      lotId: c.lotId,
      component: c.component as CostComponent,
      amount: Number(c.amount),
      completeness: c.basisCompleteness as Completeness,
    });
  }
  for (const t of transfers) {
    events.push({
      opId: t.operationId,
      kind: "TRANSFER",
      fromLotId: t.fromLotId,
      toLotId: t.toLotId,
      transferredVolumeL: Number(t.transferredVolumeL),
      parentPreOpVolumeL: Number(t.parentPreOpVolumeL),
    });
  }

  const volMap = new Map<string, number>();
  for (const v of vesselLots) volMap.set(v.lotId, (volMap.get(v.lotId) ?? 0) + Number(v.volumeL));
  for (const b of bottled) volMap.set(b.lotId, (volMap.get(b.lotId) ?? 0) + Number(b.volumeL));
  const volumes: LotVolume[] = lotIds.map((id) => ({ lotId: id, volumeL: volMap.get(id) ?? 0 }));

  const { lots } = rollupCost(events, volumes);
  const target: LotCost = lots.get(rootId) ?? {
    lotId: rootId,
    totalCost: 0,
    volumeL: volMap.get(rootId) ?? 0,
    costPerL: null,
    completeness: "UNKNOWN",
    components: {},
    expensed: 0,
    stranded: 0,
  };
  const maxCostOpId = Math.max(0, ...costLines.map((c) => c.operationId), ...transfers.map((t) => t.operationId));
  return { ...target, maxCostOpId, policyVersion: settings.policyVersion };
}

/**
 * The cheap staleness probe (D4): the max cost-affecting opId over the lot's ancestry, WITHOUT the
 * volume loads or the fold. If this exceeds the cache watermark, the cache is stale.
 */
export async function maxCostOpIdFor(rootId: string): Promise<number> {
  const lotIds = await loadAncestryLotIds(rootId);
  const [line, transfer] = await Promise.all([
    prisma.costLine.aggregate({ where: { lotId: { in: lotIds } }, _max: { operationId: true } }),
    prisma.operationCostTransfer.aggregate({ where: { toLotId: { in: lotIds } }, _max: { operationId: true } }),
  ]);
  return Math.max(0, line._max.operationId ?? 0, transfer._max.operationId ?? 0);
}
