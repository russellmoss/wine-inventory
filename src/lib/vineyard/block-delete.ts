import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";

// Ticket #188: a user-confirmed cascade delete of a VineyardBlock's vineyard-owned harvest history
// (Brix readings, harvest records + their picks; subblocks cascade with the block row itself). This
// crosses the BrixLog/HarvestRecord onDelete: Restrict walls ON PURPOSE, so it is gated behind the
// db_delete confirmed-cascade path (entities.ts VineyardBlock.cascadeRestrict) and a hard safety guard:
// it REFUSES if any pick under the block has been crushed into a lot (LotHarvestSource) — erasing that
// would strand the lot's fruit lineage/cost. It never touches work-order tasks that target the block
// (those are a non-cascadable hard wall in the relations list); reverse/close the work order first.

/** Number of crush usages tying this block's picks to lots. > 0 → the cascade is unsafe. */
async function crushedPickCount(
  db: Prisma.TransactionClient | typeof prisma,
  blockId: string,
): Promise<number> {
  return db.lotHarvestSource.count({ where: { harvestPick: { harvestRecord: { blockId } } } });
}

const CRUSHED_MSG =
  "This block's fruit has already been crushed into a lot, so its harvest history can't be deleted. Reverse those crushes first.";

/** Read-only preflight: throw before offering the cascade if it would strand lot lineage. */
export async function assertBlockCascadeSafe(blockId: string): Promise<void> {
  if ((await crushedPickCount(prisma, blockId)) > 0) throw new ActionError(CRUSHED_MSG, "CONFLICT");
}

/** Delete the block's cascadable restrict-children inside the caller's tx (re-guarding under the tx so a
 *  crush that landed between preview and commit still fails closed). Deleting each HarvestRecord cascades
 *  its HarvestPicks at the DB level (HarvestPick.harvestRecord is onDelete: Cascade). */
export async function cascadeDeleteBlockChildrenTx(
  tx: Prisma.TransactionClient,
  blockId: string,
): Promise<void> {
  if ((await crushedPickCount(tx, blockId)) > 0) throw new ActionError(CRUSHED_MSG, "CONFLICT");
  await tx.brixLog.deleteMany({ where: { blockId } });
  await tx.harvestRecord.deleteMany({ where: { blockId } });
}
