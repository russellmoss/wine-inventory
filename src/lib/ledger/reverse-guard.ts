import { prisma } from "@/lib/prisma";
import { balanceKey } from "@/lib/ledger/math";
import type { OperationType } from "@/lib/ledger/vocabulary";

// The shared LIFO guard for position-scoped reversals (cellar TOPPING/FILTRATION/LOSS + RACK).
// Both cores build the SAME "what has touched these positions since?" set and hand it to
// planCorrection (which keeps its shortfall/negative-fold pre-check — this helper is guard-only,
// it never plans the inverse lines). Centralizing it fixes the one behavioral gap the sparkling
// cores already had: a later op that has ITSELF been reversed (its `correctedBy` is set) must NOT
// block, or a chain can never unwind LIFO (reverse the newest, then the next, back to the start).

/**
 * The set of (vessel, lot) balance keys touched by any operation LATER than `operationId`, EXCLUDING
 * corrections and ops that are themselves already reversed. planCorrection blocks a reversal when
 * one of the original op's affected positions is in this set (`downstream-activity`).
 */
export async function laterTouchedKeys(operationId: number): Promise<Set<string>> {
  const blockers = await laterTouchedBlockers(operationId);
  return new Set(blockers.flatMap((b) => b.keys));
}

export type LaterTouchedBlocker = {
  operationId: number;
  type: OperationType;
  observedAt: Date;
  enteredBy: string;
  lotIds: string[];
  vesselIds: string[];
  keys: string[];
  reversible: boolean;
  reason?: string;
};

/**
 * Rich LIFO blocker rows for correction UX. This is intentionally a sibling to
 * `laterTouchedKeys()` so existing correction math can keep its compact key set while timeline
 * and action copy can name the actual downstream operation that blocks an undo.
 */
export async function laterTouchedBlockers(operationId: number): Promise<LaterTouchedBlocker[]> {
  const laterLines = await prisma.lotOperationLine.findMany({
    where: {
      operationId: { gt: operationId },
      vesselId: { not: null },
      // A later CORRECTION never blocks (it's a reversal); and a later op that has itself been
      // reversed (correctedBy set) no longer stands — excluding it is what lets the chain unwind.
      operation: { type: { not: "CORRECTION" }, correctedBy: { is: null } },
    },
    select: {
      vesselId: true,
      lotId: true,
      operation: {
        select: {
          id: true,
          type: true,
          observedAt: true,
          enteredBy: true,
        },
      },
    },
  });

  const byOp = new Map<number, LaterTouchedBlocker>();
  for (const line of laterLines) {
    const key = balanceKey(line.vesselId as string, line.lotId);
    const existing = byOp.get(line.operation.id);
    if (existing) {
      if (!existing.keys.includes(key)) existing.keys.push(key);
      if (!existing.lotIds.includes(line.lotId)) existing.lotIds.push(line.lotId);
      if (!existing.vesselIds.includes(line.vesselId as string)) existing.vesselIds.push(line.vesselId as string);
      continue;
    }
    byOp.set(line.operation.id, {
      operationId: line.operation.id,
      type: line.operation.type as OperationType,
      observedAt: line.operation.observedAt,
      enteredBy: line.operation.enteredBy,
      lotIds: [line.lotId],
      vesselIds: [line.vesselId as string],
      keys: [key],
      reversible: false,
      reason: "Not checked yet.",
    });
  }

  return [...byOp.values()].sort((a, b) => b.operationId - a.operationId);
}

/**
 * The lineage-child guard for origination/split reversal (MUST-FIX #3): an originated lot can be
 * drawn to zero (its vessel position gone, so the position guard above can't see it) yet still have
 * DOWNSTREAM children — it was later pressed/blended. Voiding it would orphan those descendants.
 * Returns the first edge where one of `originatedLotIds` is the PARENT (i.e. a downstream child),
 * or null. The reversing op's OWN edges have the originated lots as CHILDREN, never parents, so this
 * never flags the op's own lineage — only genuinely downstream splits/blends.
 */
export async function downstreamLineageChild(
  originatedLotIds: string[],
): Promise<{ parentLotId: string; childLotId: string } | null> {
  if (originatedLotIds.length === 0) return null;
  const edge = await prisma.lotLineage.findFirst({
    where: { parentLotId: { in: originatedLotIds } },
    select: { parentLotId: true, childLotId: true },
  });
  return edge ?? null;
}
