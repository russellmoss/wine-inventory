import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { correctOperationCore } from "@/lib/cellar/correct";
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
  materialName?: string;
  materialKind?: string;
  rateValue?: number;
  rateBasis?: string;
  capKind?: "PUMPOVER" | "PUNCHDOWN";
  durationMin?: number | null;
  note?: string | null;
};

/** Phase 6B will add fenced metadata-only edits. Until then, never mutate ledger history in place. */
export async function editNeutralOperationCore(
  _actor: LedgerActor,
  input: EditNeutralInput,
): Promise<{ operationId: number }> {
  await loadNeutralOp(input.operationId);
  throw new ActionError(
    "In-place operation edits are fenced off for Phase 6B. Void this operation and re-enter the corrected one.",
    "CONFLICT",
  );
}
