import type { Prisma, CostComponent } from "@prisma/client";
import { computeLotCost } from "@/lib/cost/data";
import { computeBottlingVariance } from "@/lib/cost/variance";

// Phase 8b (Unit 13, D12) — detect + emit post-bottling cost variances. Runs IN the correction's tx
// (called from the cost-reversal path) with the lots whose cost just changed. It walks DOWN the lineage
// to every bottled run those lots fed, recomputes each run's liquid cost under the corrected basis, and
// — if it differs from the frozen snapshot — writes an explicit CostVarianceEvent (never mutating the
// snapshot, D4). Idempotent: one event per (snapshot, triggering op).
//
// Recompute basis: a source bulk lot's CostLines persist after bottling (its volume folds to ~0 but the
// cost artifacts remain), so computeLotCost() returns the corrected total; the run's share is that total
// prorated by how much of the lot the run consumed. Packaging is unchanged (frozen). v1 prorates by
// consumed-volume share across a lot's runs — exact for the common one-run-per-lot case.

const EPS = 0.004; // sub-cent: below this the variance rounds to $0 and we skip.
const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
const cents = (n: number) => Math.round(n * 100) / 100;
const MAX_DEPTH = 12;

/** Changed lots + their lineage descendants (the lots + everything downstream that could be bottled). */
async function descendantsOf(tx: Prisma.TransactionClient, roots: string[]): Promise<Set<string>> {
  const ids = new Set<string>(roots);
  let frontier = [...roots];
  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    const edges = await tx.lotLineage.findMany({ where: { parentLotId: { in: frontier } }, select: { childLotId: true } });
    const next: string[] = [];
    for (const e of edges) if (!ids.has(e.childLotId)) { ids.add(e.childLotId); next.push(e.childLotId); }
    frontier = next;
  }
  return ids;
}

/** Sum of a JSON componentBreakdown's LIQUID components (everything except PACKAGING, which is frozen). */
function liquidOfBreakdown(breakdown: unknown): number {
  if (!breakdown || typeof breakdown !== "object") return 0;
  let sum = 0;
  for (const [k, v] of Object.entries(breakdown as Record<string, unknown>)) {
    if (k === ("PACKAGING" satisfies CostComponent)) continue;
    const n = Number(v);
    if (Number.isFinite(n)) sum += n;
  }
  return round8(sum);
}

/** Detect + emit variances for the bottled runs fed by `changedLotIds`. Returns the created event ids
 *  (Phase 15 U7: the caller emits an accounting export per event, in the same tx). */
export async function detectBottlingVariances(
  tx: Prisma.TransactionClient,
  params: { changedLotIds: string[]; triggeringOpId: number },
): Promise<string[]> {
  const created: string[] = [];
  const changed = [...new Set(params.changedLotIds.filter(Boolean))];
  if (changed.length === 0) return created;

  const affected = await descendantsOf(tx, changed);
  const sources = await tx.bottlingSource.findMany({
    where: { lotId: { in: [...affected] } },
    select: { bottlingRunId: true, lotId: true },
  });
  if (sources.length === 0) return created;
  const runIds = [...new Set(sources.map((s) => s.bottlingRunId))];

  const snapshots = await tx.bottlingCostSnapshot.findMany({
    where: { runId: { in: runIds } },
    select: {
      id: true, runId: true, skuId: true, goodBottles: true, costPerBottle: true,
      componentBreakdown: true, currency: true, policyVersion: true, basisCompleteness: true, reversalOfSnapshotId: true,
    },
  });
  if (snapshots.length === 0) return created;

  for (const snap of snapshots) {
    if (snap.reversalOfSnapshotId) continue; // reversal snapshots aren't varied

    // Idempotency: skip if this (snapshot, trigger) already produced an event.
    const existing = await tx.costVarianceEvent.findFirst({
      where: { snapshotId: snap.id, triggeringOpId: params.triggeringOpId },
      select: { id: true },
    });
    if (existing) continue;

    // Recompute the run's liquid cost under the corrected basis: each source lot's current total cost,
    // prorated by this run's consumed-volume share of that lot.
    const runSources = await tx.bottlingSource.findMany({
      where: { bottlingRunId: snap.runId, lotId: { not: null } },
      select: { lotId: true, volumeConsumedL: true },
    });
    let newLiquid = 0;
    for (const rs of runSources) {
      const lotId = rs.lotId as string;
      const consumed = Number(rs.volumeConsumedL);
      const totalFromLot = await tx.bottlingSource.aggregate({ where: { lotId }, _sum: { volumeConsumedL: true } });
      const denom = Number(totalFromLot._sum.volumeConsumedL ?? 0);
      const share = denom > 1e-9 ? consumed / denom : 1;
      const lc = await computeLotCost(lotId, tx);
      newLiquid = round8(newLiquid + lc.totalCost * share);
    }

    const frozenLiquid = liquidOfBreakdown(snap.componentBreakdown);
    const packaging = Number((snap.componentBreakdown as Record<string, unknown> | null)?.PACKAGING ?? 0);
    const newTotal = round8(newLiquid + packaging);
    const newCostPerBottle = snap.goodBottles > 0 ? cents(newTotal / snap.goodBottles) : 0;

    // On-hand bottles for this SKU (bottles still in inventory); sold/removed = good − onHand.
    const onHandAgg = await tx.bottledInventory.aggregate({ where: { wineSkuId: snap.skuId }, _sum: { totalBottles: true } });
    const onHand = Number(onHandAgg._sum.totalBottles ?? 0);

    const v = computeBottlingVariance({
      frozenCostPerBottle: Number(snap.costPerBottle),
      newCostPerBottle,
      goodBottles: snap.goodBottles,
      onHandBottles: onHand,
    });
    if (Math.abs(v.totalDelta) <= EPS) continue; // no meaningful change (liquid basis unmoved)

    const event = await tx.costVarianceEvent.create({
      data: {
        snapshotId: snap.id,
        triggeringOpId: params.triggeringOpId,
        runId: snap.runId,
        skuId: snap.skuId,
        oldCostPerBottle: Number(snap.costPerBottle),
        newCostPerBottle,
        goodBottles: snap.goodBottles,
        onHandBottles: v.onHandBottles,
        soldBottles: v.soldBottles,
        soldDelta: v.soldDelta,
        unsoldDelta: v.unsoldDelta,
        totalDelta: v.totalDelta,
        currency: snap.currency,
        basisCompleteness: snap.basisCompleteness,
        policyVersion: snap.policyVersion,
        note: `basis changed by op ${params.triggeringOpId} (liquid ${frozenLiquid}→${newLiquid})`,
      },
      select: { id: true },
    });
    created.push(event.id);
  }
  return created;
}
