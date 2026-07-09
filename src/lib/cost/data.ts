import type { CostComponent, LotOwnership, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rollupCost, round8, type CostEvent, type Completeness, type LotCost, type LotVolume } from "@/lib/cost/rollup";
import { isComponentCapitalized, COST_SETTINGS_DEFAULTS, type CostSettings } from "@/lib/cost/policy";
import { accruedBarrelCost, daysBetween } from "@/lib/cost/barrel";

// A read-capable client — either the global extended client or an interactive tx. Bottling passes its
// tx so the snapshot's liquid cost is read from the SAME transaction (pre-BOTTLE volumes), consistent.
type CostDb = Prisma.TransactionClient;
const asDb = (db?: CostDb): CostDb => (db ?? (prisma as unknown as CostDb));

// Phase 8 (Unit 4/5 read side) — load a lot's cost DAG and run the pure roll-up (the AUTHORITY).
// Script-safe (no "server-only"): verify:cost + the read models both call it. For a SINGLE lot we
// walk the lineage ANCESTRY with the proven batched BFS (mirrors lot/data.ts loadLineageGraph) rather
// than a raw recursive CTE — the plan explicitly allows the walker for single-lot cost; bulk reporting
// can swap in a CTE later. All reads are ordinary RLS-scoped Prisma queries (no bespoke SQL).

const MAX_NODES = 200;

/** Ancestor lot ids of `rootId` (inclusive), up the lineage DAG — the lots whose cost flows into it. */
async function loadAncestryLotIds(rootId: string, db: CostDb): Promise<string[]> {
  const ids = new Set<string>([rootId]);
  let frontier = [rootId];
  for (let depth = 0; depth < 12 && frontier.length > 0 && ids.size < MAX_NODES; depth++) {
    const edges = await db.lotLineage.findMany({
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
async function readCostSettings(db: CostDb): Promise<CostSettings> {
  const s = await db.appSettings.findFirst({
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
  /** Phase 8 U16 (D19): the root lot's ownership. CUSTOM_CRUSH_CLIENT lot cost is billed to the client,
   * NOT capitalized to estate inventory — its direct cost lines are suppressed from this estate roll-up
   * (they remain recorded for billing). Lets the cost surface label a client-owned lot. */
  ownership: LotOwnership;
};

/**
 * Compute a lot's cost by loading its ancestry's cost artifacts (CostLines → DIRECT events,
 * OperationCostTransfers → TRANSFER events; abnormal-loss events land when loss-classification wiring
 * ships) and folding them through the pure authority. Only CAPITALIZED components fold into cost;
 * non-capitalized lines are recorded but excluded here (D5/Unit 9). Reading is the recompute — this
 * IS the authority; the cache (cost/cache.ts) is a materialization of exactly this.
 */
export async function computeLotCost(rootId: string, dbArg?: CostDb, asOf?: Date): Promise<LotCostResult> {
  const db = asDb(dbArg);
  const asOfMs = (asOf ?? new Date()).getTime();
  const [lotIds, settings] = await Promise.all([loadAncestryLotIds(rootId, db), readCostSettings(db)]);

  const [costLines, transfers, vesselLots, bottled, ownerRows] = await Promise.all([
    db.costLine.findMany({
      where: { lotId: { in: lotIds } },
      select: { operationId: true, lotId: true, component: true, amount: true, basisCompleteness: true },
    }),
    db.operationCostTransfer.findMany({
      where: { OR: [{ toLotId: { in: lotIds } }, { fromLotId: { in: lotIds } }] },
      select: { operationId: true, fromLotId: true, toLotId: true, transferredVolumeL: true, parentPreOpVolumeL: true },
    }),
    db.vesselLot.findMany({ where: { lotId: { in: lotIds } }, select: { lotId: true, volumeL: true } }),
    db.bottledLotState.findMany({ where: { lotId: { in: lotIds } }, select: { lotId: true, volumeL: true } }),
    db.lot.findMany({ where: { id: { in: lotIds } }, select: { id: true, ownership: true } }),
  ]);

  // Phase 8b (Unit 8, D7): accrue-to-date barrel cost for wine STILL in a barrel. A closed fill already
  // materialized an immutable BARREL CostLine (picked up above); an OPEN fill has none yet, so derive a
  // DIRECT BARREL event for the cost accrued so far (days from fill start to `asOf`). This is the D4
  // recompute-is-authority read side — the cost accrues as the wine ages, not just at barrel exit.
  const openFills = await db.barrelFill.findMany({
    where: { lotId: { in: lotIds }, endedAt: null, materializedCostLineId: null },
    select: { lotId: true, openOpId: true, startedAt: true, volumeL: true, capacityL: true, fillDepreciation: true },
  });

  // Phase 8 U16 (D19): client-owned (custom-crush) lots don't capitalize to estate inventory — their
  // direct cost lines are billed back, so suppress them from THIS estate roll-up (still recorded in the
  // DB for billing). Enforced here at the single capitalization authority, not scattered across cores.
  const ownershipByLot = new Map<string, LotOwnership>(ownerRows.map((l) => [l.id, l.ownership]));
  const isBillable = (lotId: string) => ownershipByLot.get(lotId) === "CUSTOM_CRUSH_CLIENT";

  const events: CostEvent[] = [];
  for (const c of costLines) {
    if (!c.lotId) continue;
    if (isBillable(c.lotId)) continue; // client-owned: billed back, not capitalized to estate inventory
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
  // Accrue-to-date barrel cost for open fills → DIRECT BARREL events (D7). Gated by the same
  // capitalization toggle + client-owned suppression as stored lines so the authority stays consistent.
  if (isComponentCapitalized("BARREL", settings)) {
    for (const f of openFills) {
      if (isBillable(f.lotId)) continue;
      const amount = accruedBarrelCost({
        fillDepreciation: Number(f.fillDepreciation),
        days: daysBetween(f.startedAt.getTime(), asOfMs),
        residentVolumeL: Number(f.volumeL),
        capacityL: Number(f.capacityL),
      });
      if (amount <= 0) continue;
      events.push({ opId: f.openOpId, kind: "DIRECT", lotId: f.lotId, component: "BARREL", amount, completeness: "KNOWN" });
    }
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
  const ownership = ownershipByLot.get(rootId) ?? "ESTATE";
  return { ...target, maxCostOpId, policyVersion: settings.policyVersion, ownership };
}

// Phase 8 (Unit 15): the read model behind the cost-per-bottle trust UI. Decomposes cost into its
// CAPITALIZED component stack + a separate "recorded, not capitalized" list (D5/Unit 9), reports basis
// completeness (D14) and ownership (U16), the as-of op behind the number, and drill-down rows (the cost
// lines + the OperationCostTransfer chain, G7). Read-only; reuses computeLotCost as the authority.
export type CostComponentSlice = { component: CostComponent; amount: number; perL: number | null; pct: number };
export type CostLineRow = { operationId: number; component: CostComponent; amount: number; capitalized: boolean; completeness: Completeness };
export type TransferRow = { operationId: number; fromLotId: string; toLotId: string; transferredVolumeL: number; transferredCost: number };
export type LotCostView = {
  lotId: string;
  ownership: LotOwnership;
  totalCost: number;
  volumeL: number;
  costPerL: number | null;
  completeness: Completeness;
  /** capitalized component stack (what folds into cost), largest first, each with $/L + % of total. */
  capitalized: CostComponentSlice[];
  /** components recorded on the lot but excluded from capitalized cost by the current policy. */
  notCapitalized: CostComponentSlice[];
  /** the op the number is "as of" (max cost-affecting opId) — for the as-of date label. */
  asOf: { operationId: number; type: string; observedAt: Date } | null;
  policyVersion: number;
  lines: CostLineRow[];
  transfers: TransferRow[];
};

export async function getLotCostView(rootId: string, dbArg?: CostDb): Promise<LotCostView> {
  const db = asDb(dbArg);
  const cost = await computeLotCost(rootId, db);
  const [lotIds, settings] = await Promise.all([loadAncestryLotIds(rootId, db), readCostSettings(db)]);

  const [costLines, transfers, asOfOp] = await Promise.all([
    db.costLine.findMany({
      where: { lotId: { in: lotIds } },
      select: { operationId: true, lotId: true, component: true, amount: true, basisCompleteness: true },
      orderBy: { operationId: "asc" },
    }),
    db.operationCostTransfer.findMany({
      where: { OR: [{ toLotId: { in: lotIds } }, { fromLotId: { in: lotIds } }] },
      select: { operationId: true, fromLotId: true, toLotId: true, transferredVolumeL: true, transferredCost: true },
      orderBy: { operationId: "asc" },
    }),
    cost.maxCostOpId > 0
      ? db.lotOperation.findUnique({ where: { id: cost.maxCostOpId }, select: { id: true, type: true, observedAt: true } })
      : Promise.resolve(null),
  ]);

  // A client-owned lot's lines are billed back (suppressed from the estate roll-up), so its capitalized
  // stack is empty by design — reflect that rather than double-counting.
  const billable = cost.ownership === "CUSTOM_CRUSH_CLIENT";
  const notCapMap = new Map<CostComponent, number>();

  const total = cost.totalCost;
  const perLOf = (amt: number) => (cost.volumeL > 0 ? round8(amt / cost.volumeL) : null);
  const capitalized: CostComponentSlice[] = Object.entries(cost.components)
    .map(([component, amount]) => ({
      component: component as CostComponent,
      amount: Number(amount),
      perL: perLOf(Number(amount)),
      pct: total > 0 ? Math.round((Number(amount) / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Recorded-but-not-capitalized: components present on the (non-billable) lot lines that the policy
  // excludes. For a billable lot the whole thing is billed back, so nothing is capitalized OR listed here.
  for (const c of costLines) {
    if (!c.lotId || billable) continue;
    const comp = c.component as CostComponent;
    if (isComponentCapitalized(comp, settings)) continue;
    notCapMap.set(comp, round8((notCapMap.get(comp) ?? 0) + Number(c.amount)));
  }
  const notCapitalized: CostComponentSlice[] = [...notCapMap.entries()]
    .map(([component, amount]) => ({ component, amount, perL: perLOf(amount), pct: 0 }))
    .sort((a, b) => b.amount - a.amount);

  return {
    lotId: rootId,
    ownership: cost.ownership,
    totalCost: total,
    volumeL: cost.volumeL,
    costPerL: cost.costPerL,
    completeness: cost.completeness,
    capitalized,
    notCapitalized,
    asOf: asOfOp ? { operationId: asOfOp.id, type: asOfOp.type, observedAt: asOfOp.observedAt } : null,
    policyVersion: cost.policyVersion,
    lines: costLines
      .filter((c) => c.lotId)
      .map((c) => ({
        operationId: c.operationId,
        component: c.component as CostComponent,
        amount: Number(c.amount),
        capitalized: !billable && isComponentCapitalized(c.component as CostComponent, settings),
        completeness: c.basisCompleteness as Completeness,
      })),
    transfers: transfers.map((t) => ({
      operationId: t.operationId,
      fromLotId: t.fromLotId,
      toLotId: t.toLotId,
      transferredVolumeL: Number(t.transferredVolumeL),
      transferredCost: Number(t.transferredCost),
    })),
  };
}

/**
 * The cheap staleness probe (D4): the max cost-affecting opId over the lot's ancestry, WITHOUT the
 * volume loads or the fold. If this exceeds the cache watermark, the cache is stale.
 */
export async function maxCostOpIdFor(rootId: string, dbArg?: CostDb): Promise<number> {
  const db = asDb(dbArg);
  const lotIds = await loadAncestryLotIds(rootId, db);
  const [line, transfer] = await Promise.all([
    db.costLine.aggregate({ where: { lotId: { in: lotIds } }, _max: { operationId: true } }),
    db.operationCostTransfer.aggregate({ where: { OR: [{ toLotId: { in: lotIds } }, { fromLotId: { in: lotIds } }] }, _max: { operationId: true } }),
  ]);
  return Math.max(0, line._max.operationId ?? 0, transfer._max.operationId ?? 0);
}
