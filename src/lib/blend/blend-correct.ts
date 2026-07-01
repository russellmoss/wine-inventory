import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { planCorrection, type LedgerLine, type VesselLotBalance } from "@/lib/ledger/math";
import { laterTouchedKeys, downstreamLineageChild } from "@/lib/ledger/reverse-guard";
import { FUNCTIONAL_ZERO_L } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Script-safe core for UNDOING a blend (VISION D6/D15). A compensating CORRECTION op returns
// each parent's drawn volume to its ORIGINAL source vessel and removes the child from the
// destination; the child lot is marked status=CORRECTED but KEPT (row + lineage + source set)
// for audit (append-only, eng-review). It refuses ONLY on a compositional/locational change —
// the child was racked/bottled, or another lot entered the destination. A tasting note or a
// measurement is Phase 4 OFF-LEDGER (no ledger line), so it never blocks (council C5 + user).

/** The child lot of a blend op = the unique positive in-vessel line. */
export function identifyChildLot(lines: LedgerLine[]): { childLotId: string; destVesselId: string } {
  const childLine = lines.find((l) => l.vesselId !== null && l.deltaL > 0);
  if (!childLine || childLine.vesselId === null) {
    throw new Error("No child line found on the blend operation.");
  }
  return { childLotId: childLine.lotId, destVesselId: childLine.vesselId };
}

export type BlendCorrectionPlan =
  | {
      ok: true;
      childLotId: string;
      lines: LedgerLine[];
      returns: { vesselId: string; lotId: string; volumeL: number }[];
    }
  | { ok: false; reason: "downstream-activity" | "shortfall" | "co-resident" };

/**
 * Pure decision for undoing a blend. Wraps planCorrection (the D15 touched-keys guard) and adds
 * a blend-specific block: if the destination now holds ANY lot other than the child, the location
 * changed since the blend (another lot was added) — refuse. `returns` lists the volume each source
 * vessel gets back (for the confirmation dialog).
 */
export function planBlendCorrection(
  blendLines: LedgerLine[],
  currentBalances: VesselLotBalance[],
  touchedKeys: ReadonlySet<string>,
): BlendCorrectionPlan {
  const { childLotId, destVesselId } = identifyChildLot(blendLines);

  // Locational change: a foreign lot co-resides in the destination now.
  const foreignAtDest = currentBalances.some(
    (b) => b.vesselId === destVesselId && b.lotId !== childLotId && b.volumeL > FUNCTIONAL_ZERO_L,
  );
  if (foreignAtDest) return { ok: false, reason: "co-resident" };

  const corr = planCorrection(blendLines, currentBalances, touchedKeys);
  if (!corr.ok) return { ok: false, reason: corr.reason };

  const returns = corr.lines
    .filter((l) => l.vesselId !== null && l.deltaL > 0)
    .map((l) => ({ vesselId: l.vesselId as string, lotId: l.lotId, volumeL: round2(l.deltaL) }));
  return { ok: true, childLotId, lines: corr.lines, returns };
}

async function loadBlendOp(operationId: number) {
  const op = await prisma.lotOperation.findUnique({
    where: { id: operationId },
    include: { lines: true, correctedBy: { select: { id: true } } },
  });
  if (!op) throw new ActionError("That blend operation no longer exists.");
  if (op.type !== "BLEND") throw new ActionError("That operation is not a blend.");
  if (op.correctedBy) throw new ActionError("That blend has already been corrected.");
  return op;
}

async function gatherCorrectionContext(operationId: number) {
  const op = await loadBlendOp(operationId);
  const blendLines: LedgerLine[] = op.lines.map((l) => ({
    lotId: l.lotId,
    vesselId: l.vesselId,
    deltaL: Number(l.deltaL),
    reason: (l.reason as LedgerLine["reason"]) ?? undefined,
  }));

  // Shared unwind-aware LIFO guard (024a): a later op blocks the undo only if it's not itself
  // already reversed — so a chain can unwind newest-first (MUST-FIX #1).
  const touchedKeys = await laterTouchedKeys(operationId);

  const vesselIds = [...new Set(op.lines.filter((l) => l.vesselId).map((l) => l.vesselId as string))];
  const residents = await prisma.vesselLot.findMany({
    where: { vesselId: { in: vesselIds } },
    include: { lot: { select: { code: true } }, vessel: { select: { code: true, capacityL: true } } },
  });
  const currentBalances: VesselLotBalance[] = residents.map((r) => ({
    vesselId: r.vesselId,
    lotId: r.lotId,
    volumeL: Number(r.volumeL),
  }));

  return { op, blendLines, touchedKeys, currentBalances, vesselIds };
}

const BLOCK_MESSAGE: Record<"downstream-activity" | "shortfall" | "co-resident", string> = {
  "downstream-activity":
    "Can't undo this blend — the wine has been racked, bottled, or otherwise moved since. Undo those first.",
  shortfall: "Can't undo this blend — the destination no longer holds enough of the blended wine.",
  "co-resident": "Can't undo this blend — another lot has since entered the destination vessel.",
};

export type BlendCorrectionPreview =
  | { ok: true; childLotId: string; returns: { vesselCode: string; volumeL: number }[] }
  | { ok: false; message: string };

/** Non-mutating preview for the confirmation dialog: which vessels get wine back (or why it's blocked). */
export async function previewBlendCorrection(operationId: number): Promise<BlendCorrectionPreview> {
  const { blendLines, touchedKeys, currentBalances, vesselIds } = await gatherCorrectionContext(operationId);
  const plan = planBlendCorrection(blendLines, currentBalances, touchedKeys);
  if (!plan.ok) return { ok: false, message: BLOCK_MESSAGE[plan.reason] };
  const codes = new Map(
    (await prisma.vessel.findMany({ where: { id: { in: vesselIds } }, select: { id: true, code: true } })).map((v) => [
      v.id,
      v.code,
    ]),
  );
  // Aggregate per source vessel for the human-facing list.
  const byVessel = new Map<string, number>();
  for (const r of plan.returns) byVessel.set(r.vesselId, round2((byVessel.get(r.vesselId) ?? 0) + r.volumeL));
  return {
    ok: true,
    childLotId: plan.childLotId,
    returns: [...byVessel.entries()].map(([vesselId, volumeL]) => ({ vesselCode: codes.get(vesselId) ?? vesselId, volumeL })),
  };
}

export type CorrectBlendResult = { operationId: number; childLotId: string; message: string };

type BlendReverseMeta = {
  mode?: string;
  lineageRestore?: { parentLotId: string; existed: boolean; priorFraction: number | null }[];
  priorProvenanceComplete?: boolean;
  priorVineyardIds?: string[];
};

/**
 * Execute the compensating CORRECTION: return each parent's wine to its source vessel. Two modes,
 * read from the blend op's metadata (024b):
 *  - NEW_LOT: the child lot is fully drained → mark it CORRECTED (row + lineage kept for audit,
 *    append-only). Blocked if that child has downstream lineage children (would be orphaned).
 *  - GROW_EXISTING: a pre-existing resident absorbed the draws. It is NOT marked corrected and its
 *    lineage/provenance is RESTORED from the pre-op snapshot (never blind-deleted — MUST-FIX #4).
 * Un-stamped legacy blends default to NEW_LOT (their prior behaviour), so this is a safe superset.
 */
export async function correctBlendCore(actor: LedgerActor, input: { operationId: number }): Promise<CorrectBlendResult> {
  const { op, blendLines, touchedKeys, currentBalances, vesselIds } = await gatherCorrectionContext(input.operationId);
  const plan = planBlendCorrection(blendLines, currentBalances, touchedKeys);
  if (!plan.ok) throw new ActionError(BLOCK_MESSAGE[plan.reason], "CONFLICT");

  const meta = (op.metadata as BlendReverseMeta | null) ?? null;
  const mode = meta?.mode === "GROW_EXISTING" ? "GROW_EXISTING" : "NEW_LOT";

  // A NEW_LOT child gets voided (marked CORRECTED). If it has since been pressed/blended on, voiding
  // it would orphan those descendants — block (MUST-FIX #3). A GROW resident isn't voided, so skip.
  if (mode === "NEW_LOT") {
    const downstream = await downstreamLineageChild([plan.childLotId]);
    if (downstream) {
      throw new ActionError("Can't undo this blend — its blended lot has since been pressed or blended on. Undo that first.", "CONFLICT");
    }
  }

  const vessels = await prisma.vessel.findMany({ where: { id: { in: vesselIds } }, select: { id: true, code: true, capacityL: true } });
  const vesselCodes = new Map(vessels.map((v) => [v.id, v.code]));
  const capacityByVessel = new Map(vessels.map((v) => [v.id, Number(v.capacityL)]));
  const lotIds = [...new Set(op.lines.map((l) => l.lotId))];
  const lots = await prisma.lot.findMany({ where: { id: { in: lotIds } }, select: { id: true, code: true } });
  const lotCodes = new Map(lots.map((l) => [l.id, l.code]));
  const childCode = lotCodes.get(plan.childLotId) ?? plan.childLotId;

  const totalReturned = round2(plan.returns.reduce((a, r) => a + r.volumeL, 0));
  const summary =
    mode === "GROW_EXISTING"
      ? `Undid blend ${op.id}: returned ${totalReturned} L to source vessels, restored ${childCode}'s pre-blend lineage`
      : `Undid blend ${op.id}: returned ${totalReturned} L to source vessels, marked ${childCode} corrected`;

  const corrOpId = await runLedgerWrite(async (tx) => {
    const opId = await writeLotOperation(tx, {
      type: "CORRECTION",
      lines: plan.lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      note: `Undoes blend ${op.id}`,
      correctsOperationId: op.id,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });

    if (mode === "GROW_EXISTING") {
      // Restore the resident's pre-op lineage exactly: delete edges the blend created, roll back the
      // fraction on edges it updated. Then restore provenanceComplete + drop added source-vineyards.
      for (const e of meta?.lineageRestore ?? []) {
        if (e.existed) {
          await tx.lotLineage
            .update({ where: { parentLotId_childLotId: { parentLotId: e.parentLotId, childLotId: plan.childLotId } }, data: { fraction: e.priorFraction } })
            .catch(() => {});
        } else {
          await tx.lotLineage.deleteMany({ where: { parentLotId: e.parentLotId, childLotId: plan.childLotId } });
        }
      }
      if (meta?.priorProvenanceComplete != null) {
        await tx.lot.update({ where: { id: plan.childLotId }, data: { provenanceComplete: meta.priorProvenanceComplete } });
      }
      // Remove any source-vineyard the blend added (keep exactly the pre-op set). Sentinel avoids an
      // empty notIn (which Prisma treats as "match nothing" → would delete none).
      const keep = meta?.priorVineyardIds?.length ? meta.priorVineyardIds : ["__none__"];
      await tx.lotVineyard.deleteMany({ where: { lotId: plan.childLotId, vineyardId: { notIn: keep } } });
    } else {
      // Keep the child row + lineage + source set for audit; just mark it corrected (D6 append-only).
      await tx.lot.update({ where: { id: plan.childLotId }, data: { status: "CORRECTED" } });
    }

    await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "LotOperation", entityId: String(opId), summary });
    return opId;
  });

  return { operationId: corrOpId, childLotId: plan.childLotId, message: `${summary}.` };
}
