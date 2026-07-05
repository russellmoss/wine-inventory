import "server-only";
import { Prisma } from "@prisma/client";
import { requireTenantId } from "@/lib/tenant/context";
import { writeAudit } from "@/lib/audit";
import { ActionError } from "@/lib/action-error";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// The single source of truth for "write a harvest pick" (plan 039). Find-or-creates the block's
// HarvestRecord for the vintage (mirror recordYieldEstimate's upsert) then appends the pick with its
// optional field readings (Brix/pH/TA). Runs INSIDE a caller-owned tenant tx so the harvest action, the
// assistant weigh-in tool (via the action), and the work-order HARVEST_WEIGH_IN completion handler all
// persist a pick identically. Values are pre-validated by the caller (harvest/pick-fields.ts) — passed as
// finite numbers or null. The caller resolves the block's vineyardId (denormalized onto the record).

export type WriteHarvestPickInput = {
  blockId: string;
  vineyardId: string;
  vintageYear: number;
  pickDate: Date;
  weightKg: number;
  brixAtPick?: number | null;
  phAtPick?: number | null;
  taAtPick?: number | null;
  note?: string | null;
};

const dec = (n: number | null | undefined): Prisma.Decimal | null =>
  n == null ? null : new Prisma.Decimal(n);

/** Append a pick to a block+vintage (find-or-create the record). Returns the new pick + record ids. */
export async function writeHarvestPickTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  input: WriteHarvestPickInput,
): Promise<{ pickId: string; recordId: string }> {
  if (!(input.weightKg > 0)) throw new ActionError("Enter a pick weight greater than zero.");
  const tenantId = requireTenantId();
  const record = await tx.harvestRecord.upsert({
    where: { tenantId_blockId_vintageYear: { tenantId, blockId: input.blockId, vintageYear: input.vintageYear } },
    update: { updatedByEmail: actor.actorEmail },
    create: {
      blockId: input.blockId,
      vineyardId: input.vineyardId,
      vintageYear: input.vintageYear,
      createdById: actor.actorUserId,
      createdByEmail: actor.actorEmail,
    },
    select: { id: true },
  });
  const pick = await tx.harvestPick.create({
    data: {
      harvestRecordId: record.id,
      pickDate: input.pickDate,
      weightKg: new Prisma.Decimal(input.weightKg),
      brixAtPick: dec(input.brixAtPick),
      phAtPick: dec(input.phAtPick),
      taAtPick: dec(input.taAtPick),
      note: input.note?.trim() || null,
      createdById: actor.actorUserId,
      createdByEmail: actor.actorEmail,
    },
    select: { id: true },
  });
  await writeAudit(tx, {
    ...actor,
    action: "HARVEST_PICK_RECORDED",
    entityType: "HarvestPick",
    entityId: pick.id,
    summary: `Recorded a ${input.vintageYear} harvest pick`,
  });
  return { pickId: pick.id, recordId: record.id };
}
