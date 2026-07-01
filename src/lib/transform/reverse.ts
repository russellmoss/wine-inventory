import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { planCorrection, type LedgerLine, type VesselLotBalance } from "@/lib/ledger/math";
import { laterTouchedKeys, downstreamLineageChild } from "@/lib/ledger/reverse-guard";
import type { OperationType } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Reversal for the Phase 6 origination/split transforms (plan 024b): CRUSH, whole-cluster PRESS,
// parent-split PRESS, and SAIGNEE. It follows the proven correctBlendCore shape — planCorrection
// gives the EXACT-negated inverse legs (MUST-FIX #5) + the downstream-activity guard — then adds
// the transform-specific cleanup, always append-only (mark CORRECTED, never delete the child row):
//   • origination (crush / whole-cluster press): drain the must/juice lot, FREE the harvest picks
//     it consumed (delete this op's LotHarvestSource rows), and mark a NEW lot CORRECTED (ADD keeps
//     the pre-existing lot);
//   • split (press / saignée): return the drawn volume to the parent and mark each fully-drained
//     NEW child CORRECTED (its SPLIT lineage edge is kept, pointing at the corrected child).
// Which path runs is decided by the op's metadata SHAPE, not its type (a whole-cluster press is a
// PRESS op that originates from picks) — SHOULD-FIX. Merged/into-existing fractions are refused with
// a clear reason (undo by racking the wine back out) since the forward op left no lineage snapshot.

export type ReverseTransformResult = {
  correctionId: number;
  reversedOperationId: number;
  reversedType: OperationType;
  lotId: string;
  message: string;
};

type OriginationMeta = { mode?: "NEW" | "ADD"; lotId?: string; picks?: { pickId: string; consumedKg: number }[] };
type SplitMeta = { op?: "PRESS" | "SAIGNEE"; parentLotId?: string; fractions?: { lotId: string; code?: string; merged?: boolean }[] };

async function loadTransformOp(operationId: number) {
  const op = await prisma.lotOperation.findUnique({
    where: { id: operationId },
    include: { lines: true, correctedBy: { select: { id: true } } },
  });
  if (!op) throw new ActionError("That operation no longer exists.");
  if (op.correctedBy) throw new ActionError("That operation has already been reversed.");
  if (op.type !== "CRUSH" && op.type !== "PRESS" && op.type !== "SAIGNEE") {
    throw new ActionError(`A ${op.type} operation isn't an origination/split transform.`);
  }
  return op;
}

/** Shared context: the exact-negated inverse (guarded) + the code/capacity maps for the chokepoint. */
async function planTransformReversal(op: { id: number; lines: { lotId: string; vesselId: string | null; deltaL: unknown; lotCode: string; vesselCode: string | null; reason: string | null }[] }) {
  const opLines: LedgerLine[] = op.lines.map((l) => ({
    lotId: l.lotId,
    vesselId: l.vesselId,
    deltaL: Number(l.deltaL),
    reason: (l.reason as LedgerLine["reason"]) ?? undefined,
  }));

  const touchedKeys = await laterTouchedKeys(op.id);
  const vesselIds = [...new Set(op.lines.filter((l) => l.vesselId).map((l) => l.vesselId as string))];
  const [projRows, vessels] = await Promise.all([
    prisma.vesselLot.findMany({ where: { vesselId: { in: vesselIds } } }),
    prisma.vessel.findMany({ where: { id: { in: vesselIds } }, select: { id: true, code: true, capacityL: true, isActive: true } }),
  ]);
  const currentBalances: VesselLotBalance[] = projRows.map((r) => ({ vesselId: r.vesselId, lotId: r.lotId, volumeL: Number(r.volumeL) }));

  const corr = planCorrection(opLines, currentBalances, touchedKeys);
  if (!corr.ok) {
    if (corr.reason === "downstream-activity") {
      throw new ActionError("Can't undo this step — the wine has been racked, pressed, blended, or bottled since. Undo those first.", "CONFLICT");
    }
    throw new ActionError("Can't undo this step — the wine it produced is no longer where it was.", "CONFLICT");
  }
  for (const v of vessels) if (!v.isActive) throw new ActionError(`Can't return wine to ${v.code}: that vessel is inactive.`, "CONFLICT");

  const lotCodes = new Map(op.lines.map((l) => [l.lotId, l.lotCode]));
  const vesselCodes = new Map(op.lines.filter((l) => l.vesselId).map((l) => [l.vesselId as string, l.vesselCode ?? ""]));
  const capacityByVessel = new Map(vessels.map((v) => [v.id, Number(v.capacityL)]));
  return { inverse: corr.lines, lotCodes, vesselCodes, capacityByVessel };
}

/** Reverse a crush / whole-cluster press: drain the originated lot, free its picks, void a NEW lot. */
async function reverseOrigination(actor: LedgerActor, op: Awaited<ReturnType<typeof loadTransformOp>>, meta: OriginationMeta): Promise<ReverseTransformResult> {
  const originatedLotId = meta.lotId ?? op.lines.find((l) => (l.vesselId && Number(l.deltaL) > 0))?.lotId;
  if (!originatedLotId) throw new ActionError("Couldn't identify the originated lot for this crush.");
  const mode = meta.mode === "ADD" ? "ADD" : "NEW";

  // A NEW lot gets voided → block if it has downstream lineage children (would be orphaned). An ADD
  // lot pre-existed and keeps its identity, so it isn't voided (skip the guard).
  if (mode === "NEW") {
    const downstream = await downstreamLineageChild([originatedLotId]);
    if (downstream) throw new ActionError("Can't undo this crush — its must/juice lot has since been pressed or blended on. Undo that first.", "CONFLICT");
  }

  // Pre-flight the pick-freeing so we fail closed (no ledger write) if consumption changed since
  // (pick over-restore guard — SHOULD-FIX). One LotHarvestSource row per (lot, pick) this op created.
  const picks = meta.picks ?? [];
  const sourceRows = await prisma.lotHarvestSource.findMany({
    where: { lotId: originatedLotId, harvestPickId: { in: picks.map((p) => p.pickId) } },
    select: { id: true, harvestPickId: true, consumedKg: true },
  });
  const freeSourceIds: string[] = [];
  const claimed = new Set<string>();
  for (const p of picks) {
    const row = sourceRows.find((s) => s.harvestPickId === p.pickId && !claimed.has(s.id) && Math.abs(Number(s.consumedKg) - p.consumedKg) < 0.001);
    if (!row) throw new ActionError("Can't undo this crush — its pick consumption has changed since (a pick was re-crushed or freed). Reconcile the picks first.", "CONFLICT");
    claimed.add(row.id);
    freeSourceIds.push(row.id);
  }

  const { inverse, lotCodes, vesselCodes, capacityByVessel } = await planTransformReversal(op);

  const lotCode = lotCodes.get(originatedLotId) ?? originatedLotId;
  const verb = op.type === "PRESS" ? "press" : "crush";
  const summary =
    mode === "NEW"
      ? `Reversed ${verb} #${op.id}: drained ${lotCode}, freed ${picks.length} pick(s)`
      : `Reversed ${verb} #${op.id}: removed the added must from ${lotCode}, freed ${picks.length} pick(s)`;

  const correctionId = await runLedgerWrite(async (tx) => {
    const corrId = await writeLotOperation(tx, {
      type: "CORRECTION",
      lines: inverse,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      note: op ? `Reverses ${verb} ${op.id}` : undefined,
      correctsOperationId: op.id,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });
    // Free the picks: delete exactly the LotHarvestSource rows this op created (single source of
    // truth for pick consumption → the picks show as available again).
    if (freeSourceIds.length > 0) await tx.lotHarvestSource.deleteMany({ where: { id: { in: freeSourceIds } } });
    // A NEW originated lot is fully drained → mark CORRECTED (row kept, append-only). ADD keeps the
    // pre-existing lot (only the added volume was removed).
    if (mode === "NEW") await tx.lot.update({ where: { id: originatedLotId }, data: { status: "CORRECTED" } });
    await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "LotOperation", entityId: String(corrId), summary });
    return corrId;
  });

  return { correctionId, reversedOperationId: op.id, reversedType: op.type, lotId: originatedLotId, message: `${summary}.` };
}

/** Reverse a press / saignée split: return the drawn volume to the parent, void the NEW children. */
async function reverseSplit(actor: LedgerActor, op: Awaited<ReturnType<typeof loadTransformOp>>, meta: SplitMeta): Promise<ReverseTransformResult> {
  const parentLotId = meta.parentLotId;
  if (!parentLotId) throw new ActionError("Couldn't identify the parent lot for this press.");
  const fractions = meta.fractions ?? [];
  if (fractions.some((f) => f.merged)) {
    throw new ActionError("Can't undo this press — a fraction was merged into an existing lot. Rack that wine back out to undo it.", "CONFLICT");
  }
  const childLotIds = [...new Set(fractions.map((f) => f.lotId))];

  // Each NEW child is voided → block if any child has downstream lineage children (MUST-FIX #3).
  const downstream = await downstreamLineageChild(childLotIds);
  if (downstream) throw new ActionError("Can't undo this press — one of its fractions has since been pressed or blended on. Undo that first.", "CONFLICT");

  const { inverse, lotCodes, vesselCodes, capacityByVessel } = await planTransformReversal(op);

  const parentCode = lotCodes.get(parentLotId) ?? parentLotId;
  const verb = op.type === "SAIGNEE" ? "saignée" : "press";
  const summary = `Reversed ${verb} #${op.id}: returned wine to ${parentCode}, voided ${childLotIds.length} fraction lot(s)`;

  const correctionId = await runLedgerWrite(async (tx) => {
    const corrId = await writeLotOperation(tx, {
      type: "CORRECTION",
      lines: inverse,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      note: `Reverses ${verb} ${op.id}`,
      correctsOperationId: op.id,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });
    // Each NEW child was drained to zero by the inverse → mark CORRECTED (row + SPLIT edge kept for
    // audit, append-only; the edge now points at a corrected child).
    for (const childId of childLotIds) {
      await tx.lot.update({ where: { id: childId }, data: { status: "CORRECTED" } });
    }
    await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "LotOperation", entityId: String(corrId), summary });
    return corrId;
  });

  return { correctionId, reversedOperationId: op.id, reversedType: op.type, lotId: parentLotId, message: `${summary}.` };
}

/**
 * Reverse one origination/split transform (CRUSH, PRESS whole-cluster or split, SAIGNEE), routed by
 * the op's metadata SHAPE: a `picks` array ⇒ origination-from-fruit (crush / whole-cluster press);
 * a `parentLotId` ⇒ a parent split. LIFO-guarded like every other reversal.
 */
export async function reverseTransformCore(actor: LedgerActor, input: { operationId: number; note?: string }): Promise<ReverseTransformResult> {
  const op = await loadTransformOp(input.operationId);
  const meta = (op.metadata ?? {}) as OriginationMeta & SplitMeta;
  if (Array.isArray(meta.picks)) return reverseOrigination(actor, op, meta);
  if (meta.parentLotId) return reverseSplit(actor, op, meta);
  throw new ActionError("Can't undo this transform — its origin metadata is missing (it predates undo support).", "CONFLICT");
}
