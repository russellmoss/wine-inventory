import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit, diff } from "@/lib/audit";
import { computeAdditionTotal, type RateBasis } from "@/lib/cellar/additions-math";
import { coerceRateBasis } from "@/lib/cellar/material-normalize";
import { upsertMaterialCore } from "@/lib/cellar/materials";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Timeline edit/delete for VOLUME-NEUTRAL ops only (Phase 3 follow-up). Append-only (D6)
// still governs volume: Seed/Rack/Top/Filter/Dump carry ledger lines and can never be
// hard-deleted — they're reverted via a compensating CORRECTION (correct.ts). But a
// neutral op (ADDITION / FINING / CAP_MGMT) has NO volumetric lines, so deleting it cannot
// corrupt the projection==fold invariant. A mis-logged / test entry can therefore be truly
// removed (off the timeline) while the AuditLog retains who/what/when — and a wrong value
// can be edited in place with an audit diff. Volumetric ops are rejected here.

const NEUTRAL = new Set(["ADDITION", "FINING", "CAP_MGMT"]);

function treatmentSnapshot(t: {
  kind: string;
  materialName: string | null;
  rateValue: unknown;
  rateBasis: string | null;
  computedTotal: unknown;
  computedUnit: string | null;
  durationMin: number | null;
  note: string | null;
}) {
  return {
    kind: t.kind,
    materialName: t.materialName,
    rateValue: t.rateValue == null ? null : Number(t.rateValue),
    rateBasis: t.rateBasis,
    computedTotal: t.computedTotal == null ? null : Number(t.computedTotal),
    computedUnit: t.computedUnit,
    durationMin: t.durationMin,
    note: t.note,
  };
}

async function loadNeutralOp(operationId: number) {
  const op = await prisma.lotOperation.findUnique({
    where: { id: operationId },
    include: { lines: true, treatments: true, correctedBy: true },
  });
  if (!op) throw new ActionError("That operation no longer exists.");
  if (op.lines.length > 0 || !NEUTRAL.has(op.type)) {
    throw new ActionError(
      "Only volume-neutral operations (additions, fining, cap management) can be edited or deleted here. Revert a volume-changing operation instead.",
    );
  }
  if (op.correctedBy) throw new ActionError("That operation was already voided — it's shown marked, not editable.");
  if (op.treatments.length === 0) throw new ActionError("Nothing to edit on this operation.");
  return op;
}

/** Hard-delete a neutral op (cascades its treatments); the AuditLog keeps the record. */
export async function deleteNeutralOperationCore(
  actor: LedgerActor,
  input: { operationId: number },
): Promise<{ deletedOperationId: number }> {
  const op = await loadNeutralOp(input.operationId);
  const before = { type: op.type, treatments: op.treatments.map(treatmentSnapshot) };
  const matName = op.treatments[0]?.materialName;
  const summary = `Deleted ${op.type.toLowerCase()} #${op.id}${matName ? ` (${matName})` : ""} — erroneous/test entry`;

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      ...actor,
      action: "DELETE",
      entityType: "LotOperation",
      entityId: String(op.id),
      changes: diff(before, null),
      summary,
    });
    await tx.lotOperation.delete({ where: { id: op.id } }); // cascades lot_treatment rows
  });
  return { deletedOperationId: op.id };
}

export type EditNeutralInput = {
  operationId: number;
  // dose ops (ADDITION / FINING)
  materialName?: string;
  materialKind?: string;
  rateValue?: number;
  rateBasis?: string;
  // cap management
  capKind?: "PUMPOVER" | "PUNCHDOWN";
  durationMin?: number | null;
  note?: string | null;
};

/** Edit a neutral op's treatment(s) in place, recomputing the dose total, with an audit diff. */
export async function editNeutralOperationCore(
  actor: LedgerActor,
  input: EditNeutralInput,
): Promise<{ operationId: number }> {
  const op = await loadNeutralOp(input.operationId);
  const isDose = op.type === "ADDITION" || op.type === "FINING";

  // Resolve a (possibly new) material for dose ops.
  let newMaterialId: string | undefined;
  let newMaterialName: string | undefined;
  if (isDose && input.materialName?.trim()) {
    const m = await upsertMaterialCore(actor, { name: input.materialName, kind: input.materialKind });
    newMaterialId = m.id;
    newMaterialName = m.name;
  }

  const before = op.treatments.map(treatmentSnapshot);

  await prisma.$transaction(async (tx) => {
    for (const t of op.treatments) {
      if (isDose) {
        const rate = input.rateValue != null && Number.isFinite(input.rateValue) ? input.rateValue : Number(t.rateValue);
        if (!(rate > 0)) throw new ActionError("Enter a dose rate greater than 0.");
        const basis = (coerceRateBasis(input.rateBasis) ?? (t.rateBasis as RateBasis)) as RateBasis;
        if (!basis) throw new ActionError("Pick a valid dose basis.");
        const vol = t.volumeLAtAddition == null ? 0 : Number(t.volumeLAtAddition);
        const { total, unit } = computeAdditionTotal(rate, basis, vol);
        await tx.lotTreatment.update({
          where: { id: t.id },
          data: {
            materialId: newMaterialId ?? t.materialId,
            materialName: newMaterialName ?? t.materialName,
            rateValue: rate,
            rateBasis: basis,
            computedTotal: total,
            computedUnit: unit,
            note: input.note === undefined ? t.note : input.note?.trim() || null,
          },
        });
      } else {
        // CAP_MGMT: kind + duration + note
        await tx.lotTreatment.update({
          where: { id: t.id },
          data: {
            kind: input.capKind ?? t.kind,
            durationMin:
              input.durationMin === undefined
                ? t.durationMin
                : input.durationMin != null && Number.isFinite(input.durationMin) && input.durationMin > 0
                  ? Math.round(input.durationMin)
                  : null,
            note: input.note === undefined ? t.note : input.note?.trim() || null,
          },
        });
      }
    }
    // Keep the operation-level note (shown on the timeline) in sync with the edit.
    if (input.note !== undefined) {
      await tx.lotOperation.update({ where: { id: op.id }, data: { note: input.note?.trim() || null } });
    }
    const after = (await tx.lotTreatment.findMany({ where: { operationId: op.id } })).map(treatmentSnapshot);
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "LotOperation",
      entityId: String(op.id),
      changes: diff({ treatments: before }, { treatments: after }),
      summary: `Edited ${op.type.toLowerCase()} #${op.id}`,
    });
  });
  return { operationId: op.id };
}
