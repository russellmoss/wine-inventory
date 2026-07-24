import { Prisma } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { writeAudit } from "@/lib/audit";
import { ActionError } from "@/lib/action-error";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Plan 093 Unit 9: weigh-tags. A per-TRUCK WeighTag (gross/tare/net) with per-bin WeighTagLines
// (grower/owner/block). The tag number is a per-tenant, gap-free, monotonic certificate; tags are VOIDED,
// never deleted. Receive-now-assign-later: a bin with no owner still issues (needsOwnerAssignment=true).

export type WeighTagLineInput = {
  binOrGroup?: string | null;
  netKg?: number | null;
  growerId?: string | null;
  blockId?: string | null;
  /** the owner of this bin's fruit. */
  ownerId?: string | null;
  /** true = deliberately the facility's own (Estate) fruit — NULL owner but NOT "needs assignment". */
  estate?: boolean;
};

export type CreateWeighTagInput = {
  truck?: string | null;
  weighmaster?: string | null;
  grossKg?: number | null;
  tareKg?: number | null;
  netKg?: number | null;
  lines: WeighTagLineInput[];
};

export type WeighTagResult = {
  id: string;
  tagNumber: number;
  lineCount: number;
  needsAssignmentCount: number;
};

/**
 * Allocate the next per-tenant tag number, GAP-FREE. Council: a counter ROW incremented under
 * SELECT ... FOR UPDATE inside the write tx — NOT MAX(tagNumber)+1 (which bounces on the unique or burns
 * numbers under SERIALIZABLE + PgBouncer) and NOT a bare sequence (which gaps on rollback). The row lock
 * serializes concurrent issuers; a tx rollback rolls the increment back, so numbers stay gap-free.
 */
async function allocateTagNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<number> {
  await tx.$executeRaw`INSERT INTO "weigh_tag_counter" ("tenantId", "nextNumber") VALUES (${tenantId}, 1) ON CONFLICT ("tenantId") DO NOTHING`;
  const rows = await tx.$queryRaw<{ nextNumber: number }[]>`SELECT "nextNumber" FROM "weigh_tag_counter" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
  const n = Number(rows[0]?.nextNumber ?? 1);
  await tx.$executeRaw`UPDATE "weigh_tag_counter" SET "nextNumber" = ${n + 1} WHERE "tenantId" = ${tenantId}`;
  return n;
}

const num = (v: number | null | undefined): Prisma.Decimal | null => (v == null ? null : new Prisma.Decimal(v));

/** Resolve a line's owner + needsOwnerAssignment. A set owner → resolved. Explicit estate → NULL, resolved.
 *  Otherwise → NULL + needs assignment (the scale never blocks; crush refuses it later — Unit 10). */
function resolveLineOwner(line: WeighTagLineInput): { ownerId: string | null; needsOwnerAssignment: boolean } {
  if (line.ownerId) return { ownerId: line.ownerId, needsOwnerAssignment: false };
  if (line.estate) return { ownerId: null, needsOwnerAssignment: false };
  return { ownerId: null, needsOwnerAssignment: true };
}

/** Issue a weigh-tag with its bin lines. One tenant tx: allocate the gap-free number, write the tag + lines. */
export async function createWeighTagCore(actor: LedgerActor, input: CreateWeighTagInput): Promise<WeighTagResult> {
  if (!input.lines || input.lines.length === 0) throw new ActionError("A weigh-tag needs at least one bin line.");

  return runInTenantTx(async (tx) => {
    const tenantId = requireTenantId();
    const tagNumber = await allocateTagNumber(tx, tenantId);
    const tag = await tx.weighTag.create({
      data: {
        tagNumber,
        truck: input.truck?.trim() || null,
        weighmaster: input.weighmaster?.trim() || null,
        grossKg: num(input.grossKg),
        tareKg: num(input.tareKg),
        netKg: num(input.netKg),
      },
      select: { id: true, tagNumber: true },
    });

    let needsAssignmentCount = 0;
    for (const line of input.lines) {
      const owner = resolveLineOwner(line);
      if (owner.needsOwnerAssignment) needsAssignmentCount++;
      await tx.weighTagLine.create({
        data: {
          weighTagId: tag.id,
          binOrGroup: line.binOrGroup?.trim() || null,
          netKg: num(line.netKg),
          growerId: line.growerId ?? null,
          blockId: line.blockId ?? null,
          ownerId: owner.ownerId,
          needsOwnerAssignment: owner.needsOwnerAssignment,
        },
      });
    }

    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "WeighTag",
      entityId: tag.id,
      summary: `Issued weigh-tag #${tag.tagNumber} (${input.lines.length} bin${input.lines.length === 1 ? "" : "s"}${needsAssignmentCount ? `, ${needsAssignmentCount} need assignment` : ""})`,
    });
    return { id: tag.id, tagNumber: tag.tagNumber, lineCount: input.lines.length, needsAssignmentCount };
  });
}

/** Void a weigh-tag (never delete — it is a numbered certificate). Idempotent-ish: re-voiding is refused. */
export async function voidWeighTagCore(actor: LedgerActor, input: { weighTagId: string; reason: string }): Promise<{ id: string; tagNumber: number }> {
  const reason = input.reason?.trim();
  if (!reason) throw new ActionError("Give a reason for voiding the weigh-tag.");
  return runInTenantTx(async (tx) => {
    const tag = await tx.weighTag.findUnique({ where: { id: input.weighTagId }, select: { id: true, tagNumber: true, voidedAt: true } });
    if (!tag) throw new ActionError("That weigh-tag doesn't exist in this winery.", "CONFLICT");
    if (tag.voidedAt) throw new ActionError(`Weigh-tag #${tag.tagNumber} is already voided.`, "CONFLICT");
    await tx.weighTag.update({ where: { id: tag.id }, data: { voidedAt: new Date(), voidedReason: reason } });
    await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "WeighTag", entityId: tag.id, summary: `Voided weigh-tag #${tag.tagNumber}: ${reason}` });
    return { id: tag.id, tagNumber: tag.tagNumber };
  });
}
