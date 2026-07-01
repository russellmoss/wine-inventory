import { prisma } from "@/lib/prisma";
import { balanceKey } from "@/lib/ledger/math";

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
  const laterLines = await prisma.lotOperationLine.findMany({
    where: {
      operationId: { gt: operationId },
      vesselId: { not: null },
      // A later CORRECTION never blocks (it's a reversal); and a later op that has itself been
      // reversed (correctedBy set) no longer stands — excluding it is what lets the chain unwind.
      operation: { type: { not: "CORRECTION" }, correctedBy: { is: null } },
    },
    select: { vesselId: true, lotId: true },
  });
  return new Set(laterLines.map((l) => balanceKey(l.vesselId as string, l.lotId)));
}
