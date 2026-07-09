import type { Prisma } from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { correctOperationCore } from "@/lib/cellar/correct";
import { diff, writeAudit } from "@/lib/audit";
import { runInTenantTx } from "@/lib/tenant/tx";
import {
  operationSupplementalNote,
  validateOperationMetadataEdit,
  withSupplementalNote,
} from "@/lib/cellar/edit-policy";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Phase 6A retires the old neutral-op edit/delete path. Deleting a neutral operation now means
// append-only voiding through CORRECTION. In-place edit remains fail-closed until Phase 6B adds the
// fenced metadata-only edit model.

const NEUTRAL = new Set(["ADDITION", "FINING", "CAP_MGMT"]);

async function loadNeutralOp(operationId: number) {
  const op = await prisma.lotOperation.findUnique({
    where: { id: operationId },
    include: { lines: true, treatments: true, correctedBy: true },
  });
  if (!op) throw new ActionError("That operation no longer exists.");
  if (op.lines.length > 0 || !NEUTRAL.has(op.type)) {
    throw new ActionError(
      "Only volume-neutral operations (additions, fining, cap management) can be voided here. Revert a volume-changing operation instead.",
    );
  }
  if (op.correctedBy) throw new ActionError("That operation was already voided - it's shown marked, not editable.");
  if (op.treatments.length === 0) throw new ActionError("Nothing to void on this operation.");

  const attempt = await prisma.workOrderTaskAttempt.findFirst({
    where: { operationId: op.id },
    select: { task: { select: { workOrder: { select: { number: true } } } } },
  });
  if (attempt) {
    const n = attempt.task?.workOrder?.number;
    throw new ActionError(
      `This ${op.type.toLowerCase()} was logged by work order${n != null ? ` #${n}` : ""}. To change or remove it, reject that work order's task - editing or deleting it from the timeline would break the work order's record.`,
    );
  }
  return op;
}

async function assertNotWorkOrderOwned(operationId: number, type: string) {
  const attempt = await prisma.workOrderTaskAttempt.findFirst({
    where: { operationId },
    select: { task: { select: { workOrder: { select: { number: true } } } } },
  });
  if (!attempt) return;
  const n = attempt.task?.workOrder?.number;
  throw new ActionError(
    `This ${type.toLowerCase()} was logged by work order${n != null ? ` #${n}` : ""}. To change it, reject that work order's task and re-issue it.`,
    "CONFLICT",
  );
}

/** Void a neutral op through an append-only CORRECTION. The legacy name is kept for callers. */
export async function deleteNeutralOperationCore(
  actor: LedgerActor,
  input: { operationId: number },
): Promise<{ deletedOperationId: number; correctionId: number }> {
  const op = await loadNeutralOp(input.operationId);
  const correction = await correctOperationCore(actor, { operationId: op.id });
  return { deletedOperationId: op.id, correctionId: correction.correctionId };
}

export type EditNeutralInput = {
  operationId: number;
  supplementalNote?: string | null;
  materialName?: string;
  materialKind?: string;
  rateValue?: number;
  rateBasis?: string;
  capKind?: "PUMPOVER" | "PUNCHDOWN";
  durationMin?: number | null;
  note?: string | null;
};

/** Fenced metadata edit. Only supplementalNote is direct-editable; posting fields are refused. */
export async function editNeutralOperationCore(
  actor: LedgerActor,
  input: EditNeutralInput,
): Promise<{ operationId: number }> {
  const decision = validateOperationMetadataEdit(input as Record<string, unknown>);
  if (!decision.ok) throw new ActionError(decision.reason, "CONFLICT");

  const op = await prisma.lotOperation.findUnique({
    where: { id: input.operationId },
    select: { id: true, type: true, metadata: true },
  });
  if (!op) throw new ActionError("That operation no longer exists.");
  await assertNotWorkOrderOwned(op.id, op.type);

  const beforeNote = operationSupplementalNote(op.metadata);
  if (beforeNote === decision.supplementalNote) return { operationId: op.id };
  const nextMetadata = withSupplementalNote(op.metadata, decision.supplementalNote);

  await runInTenantTx(async (tx) => {
    await tx.lotOperation.update({
      where: { id: op.id },
      data: { metadata: nextMetadata as Prisma.InputJsonValue },
    });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "LotOperation",
      entityId: String(op.id),
      changes: diff({ supplementalNote: beforeNote }, { supplementalNote: decision.supplementalNote }),
      summary: `Edited supplemental note for ${op.type.toLowerCase()} #${op.id}`,
    });
  });

  return { operationId: op.id };
}
