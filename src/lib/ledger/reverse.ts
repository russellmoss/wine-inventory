import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { requireTenantId } from "@/lib/tenant/context";
import { CORRECTABLE_CELLAR_TYPES, REVERSIBLE_SPARKLING_TYPES, type OperationType } from "@/lib/ledger/vocabulary";
import { correctOperationCore } from "@/lib/cellar/correct";
import { revertTransferCore, type LedgerActor } from "@/lib/vessels/rack-core";
import { reverseSparklingOperationCore } from "@/lib/sparkling/correct";
import { reverseBottlingRun } from "@/lib/bottling/run";
import { reverseTransformCore } from "@/lib/transform/reverse";
import { correctBlendCore } from "@/lib/blend/blend-correct";

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

// ─────────────────────────── Reversibility verdict (the single source of truth) ───────────────────────────

/** The family core that owns an op type's physical reversal. */
export type ReverseFamily = "cellar" | "rack" | "sparkling" | "bottle" | "transform" | "blend";

export type ReversibilityVerdict =
  | { reversible: true; family: ReverseFamily }
  | { reversible: false; code: "correction" | "origination" | "manual-adjust"; reason: string };

// The cellar-6 (correctOperationCore): neutral voids + volumetric reverts. Phase 14: REMOVE_TAXPAID
// is a volumetric vessel→external op, so it reverses through the same generic corrector.
// Built from the shared vocabulary arrays so the dispatcher and the family cores gate on ONE
// definition (no drift between reverse.ts, cellar/correct.ts, sparkling/correct.ts).
const CELLAR_TYPES = new Set<OperationType>(CORRECTABLE_CELLAR_TYPES);
// Sparkling bottle-phase (reverseSparklingOperationCore).
const SPARKLING_TYPES = new Set<OperationType>(REVERSIBLE_SPARKLING_TYPES);
// Origination / split transforms (reverseTransformCore) — 024b.
const TRANSFORM_TYPES = new Set<OperationType>(["CRUSH", "PRESS", "SAIGNEE"]);

export const SPARKLING_REVERSIBLE_TYPES = SPARKLING_TYPES;

/**
 * The reversibility of an op BY TYPE — pure, no DB. The timeline reads this per row (so no N+1
 * probe) to decide the affordance: a reversible type gets an "Undo" button; a non-undoable type
 * gets a disabled control with this reason. The dispatcher calls the same function to fail-closed,
 * so the timeline and the mutation can never disagree about what's reversible (risk table).
 * The `corrected` (already-reversed) state is handled by the caller via the op's corrected flag —
 * this function only judges the type. Mode-specific blocks (e.g. a press merged into an existing
 * lot) are enforced at the core with a CONFLICT reason, not here — every transform type is undoable
 * in the common (fresh-lot) case.
 */
export function reversibilityOf(type: OperationType): ReversibilityVerdict {
  if (CELLAR_TYPES.has(type)) return { reversible: true, family: "cellar" };
  if (type === "RACK") return { reversible: true, family: "rack" };
  if (SPARKLING_TYPES.has(type)) return { reversible: true, family: "sparkling" };
  if (type === "BOTTLE") return { reversible: true, family: "bottle" };
  if (TRANSFORM_TYPES.has(type)) return { reversible: true, family: "transform" };
  if (type === "BLEND") return { reversible: true, family: "blend" };
  if (type === "CORRECTION") return { reversible: false, code: "correction", reason: "This entry is itself a reversal." };
  if (type === "SEED") return { reversible: false, code: "origination", reason: "Seeding is a lot's day-zero origination — it can't be undone." };
  // ADJUST / DEPLETE
  return { reversible: false, code: "manual-adjust", reason: "Correct this by recording a new volume adjustment." };
}

// ─────────────────────────── The dispatcher ───────────────────────────

export type ReverseOperationResult = {
  reversedOperationId: number;
  reversedType: OperationType;
  lotId: string;
  correctionId: number | null;
  message: string;
};

/**
 * Reverse ANY reversible ledger operation, routed by type to the family core that already owns the
 * physical reversal. This opens NO transaction of its own — it calls exactly one core, and that
 * core owns its runLedgerWrite/runInTenantTx (which sets the tenant GUC, and re-sets it on retry).
 * Append-only throughout: every path writes a compensating op, never deletes the original.
 * Non-undoable types and already-reversed ops fail closed with a clear reason.
 */
export async function reverseOperationCore(actor: LedgerActor, input: { operationId: number; note?: string }): Promise<ReverseOperationResult> {
  const opId = input.operationId;
  const op = await prisma.lotOperation.findUnique({
    where: { id: opId },
    include: { correctedBy: { select: { id: true } }, lines: { select: { lotId: true }, take: 1 } },
  });
  if (!op) throw new ActionError("That operation no longer exists.");
  // Tenant parity (belt to RLS): the op MUST belong to the active tenant. Under RLS a foreign op is
  // already invisible; this also fails closed where the app connects as the owner (pre-activation).
  if (op.tenantId !== requireTenantId()) throw new ActionError("Cross-winery reversal blocked.", "CONFLICT");
  if (op.correctedBy) throw new ActionError("That operation has already been reversed.");

  const verdict = reversibilityOf(op.type);
  if (!verdict.reversible) throw new ActionError(verdict.reason, "CONFLICT");

  const anyLotId = op.lines[0]?.lotId ?? "";

  switch (verdict.family) {
    case "cellar": {
      const r = await correctOperationCore(actor, { operationId: opId, note: input.note });
      return { reversedOperationId: opId, reversedType: op.type, lotId: anyLotId, correctionId: r.correctionId, message: r.message };
    }
    case "rack": {
      const transferId = await resolveTransferIdForOp(opId);
      if (!transferId) throw new ActionError("That rack predates the ledger link and can't be undone from the timeline.", "CONFLICT");
      const r = await revertTransferCore(actor, { transferId });
      return { reversedOperationId: opId, reversedType: op.type, lotId: anyLotId, correctionId: null, message: r.message };
    }
    case "sparkling": {
      const r = await reverseSparklingOperationCore(actor, { operationId: opId, note: input.note });
      return { reversedOperationId: opId, reversedType: op.type, lotId: r.lotId || anyLotId, correctionId: r.correctionId, message: r.message };
    }
    case "bottle": {
      const runId = await resolveRunIdForBottleOp(opId);
      if (!runId) throw new ActionError("This bottling predates run-tracking — reverse it from the Bottling page instead.", "CONFLICT");
      await reverseBottlingRun(runId, actor, { correctsOperationId: opId });
      return { reversedOperationId: opId, reversedType: op.type, lotId: anyLotId, correctionId: null, message: "Reversed the bottling — bulk wine restored to the cellar." };
    }
    case "transform": {
      const r = await reverseTransformCore(actor, { operationId: opId, note: input.note });
      return { reversedOperationId: opId, reversedType: op.type, lotId: r.lotId || anyLotId, correctionId: r.correctionId, message: r.message };
    }
    case "blend": {
      const r = await correctBlendCore(actor, { operationId: opId });
      return { reversedOperationId: opId, reversedType: op.type, lotId: r.childLotId || anyLotId, correctionId: r.operationId, message: r.message };
    }
  }
}
