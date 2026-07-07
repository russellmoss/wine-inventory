import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Phase 2 (TAXPAID-1) — RETURN_TO_BOND: the ONE sanctioned way past the REMOVE_TAXPAID terminal state.
// A refund-flagged re-admission of tax-paid wine back INTO bond: +V into a vessel (in-bond) balanced
// by a −V external counter-leg (reason "tax_return"). It posts §A11 "taxpaid wine returned to bulk"
// (an addition), and it is the explicit exception the write-chokepoint admissibility guard allows —
// an ordinary ADJUST/CORRECTION can NOT re-admit tax-paid volume behind the reverser's back (CO-1).
//
// Partial returns are supported: `volumeL` is a volume, not a state toggle (council Gemini-SF3). Not
// reversible via the generic path — a Return-to-Bond is itself the refund event (reversibilityOf).

export type ReturnToBondInput = {
  lotId: string;
  vesselId: string;
  volumeL: number;
  observedAt?: Date;
  note?: string | null;
  commandId?: string | null;
};

export type ReturnToBondResult = {
  operationId: number;
  lotId: string;
  vesselId: string;
  volumeL: number;
  duplicate: boolean;
  message: string;
};

function isCommandConflict(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002" &&
    JSON.stringify((e as { meta?: unknown }).meta ?? "").includes("commandId")
  );
}

async function findByCommandId(commandId: string): Promise<ReturnToBondResult | null> {
  const op = await prisma.lotOperation.findUnique({
    where: { commandId },
    select: { id: true, type: true, metadata: true },
  });
  if (!op || op.type !== "RETURN_TO_BOND") return null;
  const m = (op.metadata ?? {}) as Record<string, unknown>;
  return {
    operationId: op.id,
    lotId: String(m.lotId ?? ""),
    vesselId: String(m.vesselId ?? ""),
    volumeL: Number(m.volumeL ?? 0),
    duplicate: true,
    message: `Return-to-bond already recorded (operation #${op.id}).`,
  };
}

/**
 * Re-admit `volumeL` of tax-paid wine (lot) back into bond, into `vesselId`. Writes a balanced
 * RETURN_TO_BOND op: +V into the vessel (in-bond) + a −V external "tax_return" counter-leg. Full
 * crush-core commandId idempotency. Admin-gated at the action layer (a refund is a tax event).
 */
export async function returnToBondCore(actor: LedgerActor, input: ReturnToBondInput): Promise<ReturnToBondResult> {
  const volumeL = round2(input.volumeL);
  if (!(volumeL > 0)) throw new ActionError("Enter a positive volume to return to bond.");
  if (!input.lotId) throw new ActionError("Pick the lot to return.");
  if (!input.vesselId) throw new ActionError("Pick a vessel to receive the returned wine.");

  if (input.commandId) {
    const existing = await findByCommandId(input.commandId);
    if (existing) return existing;
  }

  const [lot, vessel] = await Promise.all([
    prisma.lot.findUnique({ where: { id: input.lotId }, select: { id: true, code: true } }),
    prisma.vessel.findUnique({ where: { id: input.vesselId }, select: { id: true, code: true, capacityL: true, isActive: true } }),
  ]);
  if (!lot) throw new ActionError("That lot doesn't exist in this winery.", "CONFLICT");
  if (!vessel) throw new ActionError("That vessel doesn't exist in this winery.", "CONFLICT");
  if (!vessel.isActive) throw new ActionError(`${vessel.code} is inactive.`, "CONFLICT");

  const lines: LedgerLine[] = [
    { lotId: input.lotId, vesselId: input.vesselId, deltaL: volumeL },
    { lotId: input.lotId, vesselId: null, deltaL: round2(-volumeL), reason: "tax_return" },
  ];
  const lotCodes = new Map([[input.lotId, lot.code]]);
  const vesselCodes = new Map([[vessel.id, vessel.code]]);
  const capacityByVessel = new Map([[vessel.id, Number(vessel.capacityL)]]);

  try {
    const operationId = await runLedgerWrite(async (tx) => {
      const opId = await writeLotOperation(tx, {
        type: "RETURN_TO_BOND",
        lines,
        actorUserId: actor.actorUserId,
        enteredBy: actor.actorEmail,
        captureMethod: "MANUAL",
        observedAt: input.observedAt,
        note: input.note?.trim() || `Return-to-bond (refund): ${volumeL} L of ${lot.code} into ${vessel.code}`,
        commandId: input.commandId ?? null,
        lotCodes,
        vesselCodes,
        capacityByVessel,
      });
      // Refund flag + disposition drive the §A11 fold + audit trail (metadata is authoritative).
      await tx.lotOperation.update({
        where: { id: opId },
        data: { metadata: { disposition: "RETURNED_TO_BOND", source: "BULK", refundFlagged: true, lotId: input.lotId, vesselId: input.vesselId, volumeL } },
      });
      await writeAudit(tx, {
        ...actor,
        action: "STOCK_MOVEMENT",
        entityType: "LotOperation",
        entityId: String(opId),
        summary: `Return-to-bond (refund): ${volumeL} L of ${lot.code} → ${vessel.code}`,
      });
      return opId;
    });
    return { operationId, lotId: input.lotId, vesselId: input.vesselId, volumeL, duplicate: false, message: `Returned ${volumeL} L of ${lot.code} to bond in ${vessel.code}.` };
  } catch (e) {
    if (input.commandId && isCommandConflict(e)) {
      const existing = await findByCommandId(input.commandId);
      if (existing) return existing;
    }
    throw e;
  }
}
