import type { Prisma, CostBasisCompleteness, CostingMethod } from "@prisma/client";
import { planDepletion, weightedAvgUnitCost, type SupplyLotView, type DepletionPlan } from "@/lib/cost/deplete";
import { round8, mergeCompleteness } from "@/lib/cost/rollup";
import { convert } from "@/lib/units/measure";

// Phase 8 (Unit 3) — the in-tx adapter that turns an ADDITION/FINING material dose into supply
// draw-down + cost. Called from inside recordNeutralDose's runLedgerWrite tx AFTER the op + treatment
// rows are written (there is NO parallel consumption path — plan requirement). Script-safe (no
// "server-only") so verify scripts + the addition cores both reach it; it reads the tenant's costing
// method + policy version straight from AppSettings via the tx (addition.ts can't import the
// server-only settings layer). A stock-tracked material draws down its SupplyLots by the tenant's
// method (Unit 3 planner) and stamps a MATERIAL CostLine per dosed lot; an untracked material (or a
// dimension the dose can't convert into the stock unit) records an UNKNOWN-cost line so completeness
// contagion (D14) still fires — never a silent $0.

/** Dose unit → stock unit conversion factor (multiply the dose amount by this). null = incompatible
 * (mass↔volume, or a counted "unit" stock). Routed through the shared measure engine so the dose (always
 * g or mL) and the material's canonical metric stock unit (g/mg/kg/mL/L) convert by one source of truth. */
export function stockConversionFactor(doseUnit: "g" | "mL", stockUnit: string): number | null {
  return convert(1, doseUnit, stockUnit);
}

export type ConsumePerLot = { lotId: string; amount: number };

export type DepleteSupplyInput = {
  operationId: number;
  materialId: string;
  /** quantity to draw, ALREADY expressed in the material's stock unit (caller does any dose→stock or
   * pack→each conversion first). */
  qtyInStock: number;
  method: CostingMethod;
  policyVersion: number;
  /**
   * Plan 080 U2 — location-scoped depletion. When set, the draw is confined to THIS location's open lots
   * and, if they can't cover it, the shortfall is booked at the material's weighted-average cost (KNOWN,
   * COST-2) against ONE negative "reconcile" SupplyLot written at this location (qtyRemaining = −shortfall).
   * That negative lot is INERT to all FIFO/WA math (both filter qtyRemaining > 0) — it only drags the
   * location's on-hand sum negative, the "needs cycle-count" signal, until a later receipt nets it. Omit
   * (the legacy dosing path) → the draw is location-agnostic and a shortfall stays unsourced/UNKNOWN,
   * byte-identical to the pre-Plan-080 behaviour (verify:cost 55/55).
   */
  locationId?: string | null;
};

/**
 * Plan 056 Unit 1 (DRY extract) — the SHARED stock draw-down step. Reads the material's on-hand
 * SupplyLots, plans the depletion under `method` (FIFO/WA, oldest-first physical draw), decrements each
 * drawn lot's `qtyRemaining`, and writes one `SupplyConsumption` row per drawn lot (identity-restorable
 * on reversal via `reversalOfConsumptionId`). Below-stock draws to zero + reports the shortfall in the
 * returned plan (never blocks — D14). It does NOT write CostLines: each caller records its own component
 * lines (additions: `MATERIAL` per dosed wine lot; packaging: `PACKAGING`, lotId null, on the bottle op).
 * Both `consumeMaterialCore` and `consumePackagingTx` call this, so stock draw-down has one source of
 * truth. Behaviour is locked by the characterization tests in `test/cost-consume.test.ts`.
 */
export async function depleteSupplyLotsTx(tx: Prisma.TransactionClient, input: DepleteSupplyInput): Promise<DepletionPlan> {
  // Plan 080 U2: a location-scoped draw is confined to that location's open lots (the legacy dosing path
  // passes no location → the material-wide set, unchanged).
  const available = await tx.supplyLot.findMany({
    where: { materialId: input.materialId, qtyRemaining: { gt: 0 }, ...(input.locationId ? { locationId: input.locationId } : {}) },
    select: { id: true, qtyRemaining: true, unitCost: true, receivedAt: true },
  });
  const lots: SupplyLotView[] = available.map((l) => ({
    id: l.id,
    qtyRemaining: Number(l.qtyRemaining),
    unitCost: l.unitCost == null ? null : Number(l.unitCost),
    receivedAt: l.receivedAt.getTime(),
  }));

  const plan = planDepletion(lots, input.qtyInStock, input.method);

  for (const line of plan.lines) {
    await tx.supplyLot.update({ where: { id: line.supplyLotId }, data: { qtyRemaining: { decrement: line.qty } } });
    await tx.supplyConsumption.create({
      data: {
        operationId: input.operationId,
        supplyLotId: line.supplyLotId,
        qty: line.qty,
        unitCost: line.unitCost,
        extendedCost: line.extendedCost,
        methodUsed: input.method,
        basisCompleteness: plan.completeness,
        policyVersion: input.policyVersion,
      },
    });
  }

  // Plan 080 U2 — negative-reconcile (location mode only, and only when this location can't cover the draw).
  // A consumption booked past a location's on-hand is TRUTHFUL ("used here, owe a receipt"), not a silent
  // cross-location pull (which would fabricate location balances) and not a $0 (COST-2). We:
  //   1. price the shortfall at the material's weighted-avg — this LOCATION's priced lots first (from the
  //      pre-draw snapshot), else tenant-wide priced open lots — so COGS stays KNOWN;
  //   2. write ONE negative SupplyLot at this location carrying the deficit (qtyRemaining = −shortfall). It
  //      is inert to every FIFO/WA computation (they filter qtyRemaining > 0) and simply drags this
  //      location's on-hand sum negative — the "needs cycle-count reconciliation" signal;
  //   3. book a SupplyConsumption for the shortfall AGAINST that negative lot (no further decrement — the lot
  //      is born at −shortfall), so the dose's MATERIAL cost is fully captured (COST-1 conservation).
  if (input.locationId && plan.shortfall > 1e-9) {
    const shortfall = plan.shortfall;
    // (1) weighted-avg price: location-first (pre-draw snapshot), tenant-wide fallback.
    let reconcileUnitCost = weightedAvgUnitCost(lots);
    if (reconcileUnitCost == null) {
      const tenantPriced = await tx.supplyLot.findMany({
        where: { materialId: input.materialId, qtyRemaining: { gt: 0 }, unitCost: { not: null } },
        select: { id: true, qtyRemaining: true, unitCost: true, receivedAt: true },
      });
      reconcileUnitCost = weightedAvgUnitCost(
        tenantPriced.map((l) => ({ id: l.id, qtyRemaining: Number(l.qtyRemaining), unitCost: l.unitCost == null ? null : Number(l.unitCost), receivedAt: l.receivedAt.getTime() })),
      );
    }
    const [material, settings] = await Promise.all([
      tx.cellarMaterial.findUnique({ where: { id: input.materialId }, select: { stockUnit: true } }),
      tx.appSettings.findFirst({ select: { currency: true } }),
    ]);
    // (2) the negative reconcile lot — the physical deficit at this location.
    const reconcileLot = await tx.supplyLot.create({
      data: {
        materialId: input.materialId,
        qtyReceived: 0,
        qtyRemaining: round8(-shortfall),
        stockUnit: material?.stockUnit ?? "unit",
        unitCost: reconcileUnitCost,
        currency: settings?.currency ?? "USD",
        locationId: input.locationId,
        policyVersion: input.policyVersion,
        supplierNote: "Negative reconcile — consumed past on-hand at this location",
      },
      select: { id: true },
    });
    // (3) book the shortfall at the reconcile price (KNOWN when priced; UNKNOWN only if the material has no
    // priced lot anywhere — COST-2, never a silent $0). No decrement: the lot already holds −shortfall.
    const extended = reconcileUnitCost != null ? round8(shortfall * reconcileUnitCost) : null;
    // Completeness of the DRAWN portion alone (re-plan with no shortfall so planDepletion's shortfall→UNKNOWN
    // taint doesn't apply), merged with the reconcile price's knownness.
    const drawableQty = round8(lots.reduce((s, l) => s + Math.max(0, l.qtyRemaining), 0));
    const reconcileCompleteness = reconcileUnitCost != null ? "KNOWN" : "UNKNOWN";
    // When NOTHING was drawable, the reconcile IS the whole draw — merging in a KNOWN that no slice earned
    // would dilute a fully-unpriced draw to PARTIAL and understate the taint (COST-2).
    const completeness =
      drawableQty > 1e-9
        ? mergeCompleteness(planDepletion(lots, drawableQty, input.method).completeness, reconcileCompleteness)
        : reconcileCompleteness;
    await tx.supplyConsumption.create({
      data: {
        operationId: input.operationId,
        supplyLotId: reconcileLot.id,
        qty: round8(shortfall),
        unitCost: reconcileUnitCost,
        extendedCost: extended,
        methodUsed: input.method,
        basisCompleteness: completeness,
        policyVersion: input.policyVersion,
      },
    });
    // Fold the reconcile slice into the returned plan: the draw is now fully sourced at a KNOWN basis.
    return {
      lines: [...plan.lines, { supplyLotId: reconcileLot.id, qty: round8(shortfall), unitCost: reconcileUnitCost, extendedCost: extended }],
      totalCost: round8(plan.totalCost + (extended ?? 0)),
      drawn: round8(plan.drawn + shortfall),
      shortfall: 0,
      completeness,
    };
  }

  return plan;
}

export type ConsumeInput = {
  operationId: number;
  materialId: string;
  doseUnit: "g" | "mL";
  /** one entry per dosed resident lot; amount is that lot's computedTotal in doseUnit. */
  perLot: ConsumePerLot[];
  /**
   * Active fraction of the dosed compound present in the STOCK material (0..1). When the perLot
   * amounts are expressed as the delivered ACTIVE compound (e.g. grams of SO₂) but the stock is a
   * carrier that is only partly that compound (e.g. KMBS is 57.6% SO₂), the stock draw + cost must
   * be scaled UP by 1/activeFraction. Omit (or ≤0 / >1) for the normal case where the amounts are
   * already the stock substance — no scaling. Caller decides when this applies (rate-based SO₂ dose).
   */
  activeFraction?: number;
};

export type ConsumeResult = {
  stockTracked: boolean;
  drawn: number; // qty drawn from stock (stock unit)
  shortfall: number; // qty that couldn't be sourced (stock unit)
  totalCost: number; // capitalized MATERIAL cost recorded across the dosed lots
  completeness: CostBasisCompleteness;
};

/**
 * Deplete supply stock + record MATERIAL cost for a dose, inside the caller's tx. Conserves cost by
 * allocating the depletion's totalCost across the dosed lots in proportion to each lot's dose amount.
 */
export async function consumeMaterialCore(tx: Prisma.TransactionClient, input: ConsumeInput): Promise<ConsumeResult> {
  const totalAmount = round8(input.perLot.reduce((a, p) => a + (p.amount > 0 ? p.amount : 0), 0));

  const [material, settings] = await Promise.all([
    tx.cellarMaterial.findUnique({ where: { id: input.materialId }, select: { isStockTracked: true, stockUnit: true } }),
    tx.appSettings.findFirst({ select: { costingMethod: true, costingPolicyVersion: true, currency: true } }),
  ]);
  const method: CostingMethod = settings?.costingMethod ?? "WEIGHTED_AVG";
  const policyVersion = settings?.costingPolicyVersion ?? 1;
  const currency = settings?.currency ?? "USD";

  const factor = material?.isStockTracked && material.stockUnit ? stockConversionFactor(input.doseUnit, material.stockUnit) : null;

  // Untracked material, unconvertible unit, or nothing to dose → record UNKNOWN-cost MATERIAL lines
  // (D14 contagion) with no depletion. amount 0 is "recorded, cost unknown", NOT a claimed $0.
  if (!material?.isStockTracked || factor == null || !(totalAmount > 0)) {
    await recordCostLines(tx, input, currency, policyVersion, "UNKNOWN", () => 0);
    return { stockTracked: !!material?.isStockTracked, drawn: 0, shortfall: 0, totalCost: 0, completeness: "UNKNOWN" };
  }

  // Scale the stock draw up when the dose is an ACTIVE-compound mass and the stock is a partial
  // carrier (KMBS: activeFraction 0.576 → draw SO₂/0.576 grams of KMBS). Guarded to (0,1]; anything
  // else (undefined / 0 / >1 / NaN) means "amounts are already stock substance" → no scaling.
  const af = input.activeFraction;
  const activeDivisor = typeof af === "number" && Number.isFinite(af) && af > 0 && af <= 1 ? af : 1;
  const qtyInStock = round8((totalAmount * factor) / activeDivisor);

  // DRY (Plan 056 Unit 1): the SupplyLot draw-down + SupplyConsumption write is the shared step.
  const plan = await depleteSupplyLotsTx(tx, {
    operationId: input.operationId,
    materialId: input.materialId,
    qtyInStock,
    method,
    policyVersion,
  });

  // Allocate the depletion's cost across the dosed lots proportional to each lot's dose amount.
  await recordCostLines(tx, input, currency, policyVersion, plan.completeness, (p) => {
    const share = totalAmount > 0 ? p.amount / totalAmount : 0;
    return round8(plan.totalCost * share);
  });

  return { stockTracked: true, drawn: plan.drawn, shortfall: plan.shortfall, totalCost: plan.totalCost, completeness: plan.completeness };
}

async function recordCostLines(
  tx: Prisma.TransactionClient,
  input: ConsumeInput,
  currency: string,
  policyVersion: number,
  completeness: CostBasisCompleteness,
  amountFor: (p: ConsumePerLot) => number,
): Promise<void> {
  for (const p of input.perLot) {
    await tx.costLine.create({
      data: {
        operationId: input.operationId,
        lotId: p.lotId,
        component: "MATERIAL",
        amount: amountFor(p),
        currency,
        basisCompleteness: completeness,
        policyVersion,
      },
    });
  }
}
