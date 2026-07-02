import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Phase 8b (Unit 16, D20) — receive purchased BULK WINE with cost. A winery that buys bulk wine gets a
// real cost basis instead of $0: this injects a direct-material MATERIAL CostLine as a mid-DAG cost node
// on an existing bulk-wine lot, so the purchase cost rolls up through any downstream blend + bottling
// exactly like fruit/material cost. Physical creation of the lot (SEED / create-in-vessel) is unchanged;
// this is the additive cost layer on top. MATERIAL is always capitalized (policy.ts), so purchased wine
// correctly capitalizes to inventory. Reversal negates it by identity like any other CostLine (Unit 11).

export type ReceiveBulkWineCostInput = {
  lotId: string;
  /** total purchase cost in the tenant's currency (> 0). */
  totalCost: number;
  /** optional op to attach the cost node to; defaults to the lot's most-recent operation. */
  operationId?: number;
  note?: string | null;
};

/**
 * Record the purchase cost of a bulk-wine lot as a MATERIAL CostLine. The lot must be a bulk WINE lot
 * (not fruit/must/bottled/finished) and visible in this tenant. Attaches to the given op or the lot's
 * latest op (a mid-DAG cost node). Cost is KNOWN completeness (the operator supplied a real number).
 */
export async function receiveBulkWineCostCore(
  actor: LedgerActor,
  input: ReceiveBulkWineCostInput,
): Promise<{ costLineId: string; operationId: number }> {
  const totalCost = Number(input.totalCost);
  if (!Number.isFinite(totalCost) || totalCost <= 0) {
    throw new Error("Bulk-wine purchase cost must be greater than zero.");
  }

  return runInTenantTx(async (tx) => {
    const lot = await tx.lot.findUnique({
      where: { id: input.lotId },
      select: { id: true, code: true, form: true, status: true },
    });
    if (!lot) throw new Error("Lot not found.");
    if (lot.form !== "WINE") {
      throw new Error("Purchased-wine cost can only be recorded on a bulk WINE lot.");
    }

    let operationId = input.operationId;
    if (operationId == null) {
      const latest = await tx.lotOperation.findFirst({
        where: { lines: { some: { lotId: input.lotId } } },
        orderBy: { id: "desc" },
        select: { id: true },
      });
      if (!latest) throw new Error("This lot has no operation to attach a cost node to.");
      operationId = latest.id;
    }

    const settings = await tx.appSettings.findFirst({ select: { currency: true, costingPolicyVersion: true } });
    const currency = settings?.currency ?? "USD";
    const policyVersion = settings?.costingPolicyVersion ?? 1;

    const line = await tx.costLine.create({
      data: {
        operationId,
        lotId: input.lotId,
        component: "MATERIAL",
        amount: totalCost,
        currency,
        basisCompleteness: "KNOWN",
        policyVersion,
        note: input.note?.trim() || "Purchased bulk wine",
      },
      select: { id: true },
    });

    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "CostLine",
      entityId: line.id,
      summary: `Recorded purchased bulk-wine cost ${currency} ${totalCost} on lot "${lot.code}"`,
    });

    return { costLineId: line.id, operationId };
  });
}
