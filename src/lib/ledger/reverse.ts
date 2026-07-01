import { prisma } from "@/lib/prisma";

// Universal reversal layer (plan 024a). A single place that knows how to walk any reversible
// ledger operation back, routing a bare operationId to the family core that already owns the
// physical reversal. Two responsibilities live here:
//   1. opId → (transferId / runId) resolvers, so the RACK and BOTTLE cores (which take a
//      transferId / runId, not an opId) are reachable from a timeline row that only knows the op.
//   2. the reverseOperationCore dispatcher (added below in Unit 3) + the pure reversibility
//      verdict the timeline reads to decide what affordance to show.
// Script-safe (no "use server", no next/cache) — verify scripts + the server action both call it.

/**
 * The VesselTransfer id for a RACK op, via the 1:1 `lotOperationId` FK on VesselTransfer. Returns
 * null when the op isn't a ledger-backed rack (pre-cutover racks have no operation link).
 */
export async function resolveTransferIdForOp(operationId: number): Promise<string | null> {
  const transfer = await prisma.vesselTransfer.findFirst({
    where: { lotOperationId: operationId },
    select: { id: true },
  });
  return transfer?.id ?? null;
}

/**
 * The BottlingRun id for a BOTTLE op, read from the `metadata.runId` stamped at bottling time
 * (bottling/run.ts). We deliberately do NOT fall back to guessing a run from the lot: a lot can be
 * bottled across several runs, and picking "the latest" would reverse the wrong one (eng-review
 * SHOULD-FIX). A BOTTLE op that predates the stamp returns null → the dispatcher tells the user to
 * reverse it from the Bottling page instead.
 */
export async function resolveRunIdForBottleOp(operationId: number): Promise<string | null> {
  const op = await prisma.lotOperation.findUnique({
    where: { id: operationId },
    select: { metadata: true },
  });
  return (op?.metadata as { runId?: string } | null)?.runId ?? null;
}
