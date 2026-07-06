import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { planVesselLoss, type VesselLotBalance } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { REMOVAL_DISPOSITION_LABELS } from "./removal-reasons";
import type { RemovalDisposition } from "./types";

// Unit 4 — tax determination as a reversible ledger op (Decision #3: wine is born in-bond; the
// taxable event is the REMOVAL). A REMOVE_TAXPAID op draws `volumeL` out of a vessel (bulk wine →
// EXTERNAL), proportionally across the vessel's lots (reusing planVesselLoss), tagged with the
// disposition in metadata. It reverses through the universal dispatcher (reverseOperationCore →
// "cellar" family → correctOperationCore), which appends a compensating CORRECTION carrying the
// removal's observedAt (C5), so undoing a filed-period removal drives an Amended report.
//
// v1 scope: BULK removals (§A lines A14–A23), the core tax-determination event. Bottled-wine §B
// removals of still finished goods are sales (StockMovement) folded to B8 in generate.ts; sparkling
// in-process §B removals are a documented follow-on.

export type RemovalInput = {
  vesselId: string;
  volumeL: number;
  disposition: RemovalDisposition;
  observedAt?: Date;
  note?: string | null;
  commandId?: string | null;
};

export type RemovalResult = { operationId: number; lotId: string; removedL: number; duplicate?: boolean; message: string };

function isCommandConflict(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002" &&
    JSON.stringify((e as { meta?: unknown }).meta ?? "").includes("commandId")
  );
}

/** Reconstruct an already-committed removal (OQ-5: full crush-core commandId idempotency). */
async function findByCommandId(commandId: string): Promise<RemovalResult | null> {
  const op = await prisma.lotOperation.findUnique({
    where: { commandId },
    select: { id: true, type: true, metadata: true },
  });
  if (!op || op.type !== "REMOVE_TAXPAID") return null;
  const m = (op.metadata ?? {}) as Record<string, unknown>;
  return {
    operationId: op.id,
    lotId: String(m.lotId ?? ""),
    removedL: Number(m.removedL ?? 0),
    duplicate: true,
    message: `Removal already recorded (operation #${op.id}).`,
  };
}

export async function removeTaxpaidCore(actor: LedgerActor, input: RemovalInput): Promise<RemovalResult> {
  if (!(input.volumeL > 0)) throw new ActionError("Enter a positive volume to remove.");
  const label = REMOVAL_DISPOSITION_LABELS[input.disposition];
  if (!label) throw new ActionError("Unknown removal disposition.");

  // OQ-5: pre-check the commandId so a double-submit is a no-op success, not a duplicate removal.
  if (input.commandId) {
    const existing = await findByCommandId(input.commandId);
    if (existing) return existing;
  }

  const vessel = await prisma.vessel.findUnique({
    where: { id: input.vesselId },
    include: { vesselLots: { include: { lot: { select: { code: true } } } } },
  });
  if (!vessel) throw new ActionError("That vessel doesn't exist in this winery.", "CONFLICT");
  const source: VesselLotBalance[] = vessel.vesselLots.map((r) => ({ vesselId: r.vesselId, lotId: r.lotId, volumeL: Number(r.volumeL) }));
  if (source.length === 0) throw new ActionError("That vessel is empty — nothing to remove.");

  // Proportional draw vessel → external, tagged "tax_removal"; the specific disposition is metadata.
  const plan = planVesselLoss(source, input.volumeL, "tax_removal");
  const lotCodes = new Map(vessel.vesselLots.map((r) => [r.lotId, r.lot.code]));
  const vesselCodes = new Map([[vessel.id, vessel.code]]);

  try {
    const operationId = await runLedgerWrite(async (tx) => {
      const opId = await writeLotOperation(tx, {
        type: "REMOVE_TAXPAID",
        lines: plan.lines,
        actorUserId: actor.actorUserId,
        enteredBy: actor.actorEmail,
        captureMethod: "MANUAL",
        observedAt: input.observedAt,
        note: input.note?.trim() || `${label} — ${plan.removedL} L from ${vessel.code}`,
        commandId: input.commandId ?? null,
        lotCodes,
        vesselCodes,
        capacityByVessel: new Map(), // removal never overfills
      });
      // Authoritative disposition + section for the report fold (metadata, not the generic line reason);
      // lotId/removedL are stamped so a duplicate-commandId submit reconstructs the same result (OQ-5).
      await tx.lotOperation.update({ where: { id: opId }, data: { metadata: { disposition: input.disposition, source: "BULK", vesselId: vessel.id, lotId: source[0].lotId, removedL: plan.removedL } } });
      await writeAudit(tx, {
        ...actor,
        action: "STOCK_MOVEMENT",
        entityType: "LotOperation",
        entityId: String(opId),
        summary: `${label}: ${plan.removedL} L from ${vessel.code}`,
      });
      return opId;
    });

    return { operationId, lotId: source[0].lotId, removedL: plan.removedL, message: `${label}: removed ${plan.removedL} L from ${vessel.code}.` };
  } catch (e) {
    if (input.commandId && isCommandConflict(e)) {
      const existing = await findByCommandId(input.commandId);
      if (existing) return existing;
    }
    throw e;
  }
}
