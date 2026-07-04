import type { Prisma, CostBasisCompleteness, CostingMethod } from "@prisma/client";
import { planDepletion, type SupplyLotView } from "@/lib/cost/deplete";
import { round8 } from "@/lib/cost/rollup";
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

export type ConsumeInput = {
  operationId: number;
  materialId: string;
  doseUnit: "g" | "mL";
  /** one entry per dosed resident lot; amount is that lot's computedTotal in doseUnit. */
  perLot: ConsumePerLot[];
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

  const qtyInStock = round8(totalAmount * factor);
  const available = await tx.supplyLot.findMany({
    where: { materialId: input.materialId, qtyRemaining: { gt: 0 } },
    select: { id: true, qtyRemaining: true, unitCost: true, receivedAt: true },
  });
  const lots: SupplyLotView[] = available.map((l) => ({
    id: l.id,
    qtyRemaining: Number(l.qtyRemaining),
    unitCost: l.unitCost == null ? null : Number(l.unitCost),
    receivedAt: l.receivedAt.getTime(),
  }));

  const plan = planDepletion(lots, qtyInStock, method);

  // Deplete each drawn supply lot + write one SupplyConsumption row (identity-restorable on reversal).
  for (const line of plan.lines) {
    await tx.supplyLot.update({ where: { id: line.supplyLotId }, data: { qtyRemaining: { decrement: line.qty } } });
    await tx.supplyConsumption.create({
      data: {
        operationId: input.operationId,
        supplyLotId: line.supplyLotId,
        qty: line.qty,
        unitCost: line.unitCost,
        extendedCost: line.extendedCost,
        methodUsed: method,
        basisCompleteness: plan.completeness,
        policyVersion,
      },
    });
  }

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
