import type { Prisma } from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { computeLotCost } from "@/lib/cost/data";
import { round8 } from "@/lib/cost/rollup";

export type CostTransferInput = {
  operationId: number;
  fromLotId: string;
  toLotId: string;
  transferredVolumeL: number;
  parentPreOpVolumeL: number;
};

/**
 * Write proportional inherited-cost transfer artifacts for a split/blend op.
 * The rollup authority recomputes from volume basis, but the persisted cost
 * snapshot gives the trust panel a stable audit row for the dollars moved.
 */
export async function writeProportionalCostTransfers(
  tx: Prisma.TransactionClient,
  transfers: CostTransferInput[],
): Promise<number> {
  if (transfers.length === 0) return 0;

  const parentIds = [...new Set(transfers.map((t) => t.fromLotId))];
  const costByParent = new Map<string, number>();
  for (const parentId of parentIds) {
    const cost = await computeLotCost(parentId, tx);
    costByParent.set(parentId, cost.totalCost);
  }

  for (const t of transfers) {
    if (!(t.transferredVolumeL > 0)) throw new ActionError("Cost-transfer volume must be greater than 0.");
    if (!(t.parentPreOpVolumeL > 0)) throw new ActionError("Cost-transfer basis volume must be greater than 0.");
  }

  await tx.operationCostTransfer.createMany({
    data: transfers.map((t) => {
      const parentCost = costByParent.get(t.fromLotId) ?? 0;
      const fraction = Math.min(1, Math.max(0, t.transferredVolumeL / t.parentPreOpVolumeL));
      return {
        operationId: t.operationId,
        fromLotId: t.fromLotId,
        toLotId: t.toLotId,
        transferredVolumeL: t.transferredVolumeL,
        parentPreOpVolumeL: t.parentPreOpVolumeL,
        transferredCost: round8(parentCost * fraction),
      };
    }),
  });

  return transfers.length;
}
