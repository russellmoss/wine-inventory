import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { requireTenantId } from "@/lib/tenant/context";
import type { OperationType } from "@/lib/ledger/vocabulary";
import { correctOperationCore } from "@/lib/cellar/correct";
import { revertTransferCore, type LedgerActor } from "@/lib/vessels/rack-core";
import { reverseGroupRackCore, isGroupRackMetadata } from "@/lib/vessels/group-rack-core";
import { reverseSparklingOperationCore } from "@/lib/sparkling/correct";
import { reverseBottlingRun } from "@/lib/bottling/run";
import { reverseTransformCore } from "@/lib/transform/reverse";
import { correctBlendCore } from "@/lib/blend/blend-correct";
import { reverseTransferInBondCore } from "@/lib/compliance/transfer-in-bond-core";
import { downstreamLineageChild, laterTouchedBlockers } from "@/lib/ledger/reverse-guard";

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
export type ReverseFamily = "cellar" | "rack" | "sparkling" | "bottle" | "transform" | "blend" | "bond";

export type ReversibilityVerdict =
  | { reversible: true; family: ReverseFamily }
  | { reversible: false; code: "correction" | "origination" | "manual-adjust" | "taxpaid-terminal" | "refund-event" | "already-reversed"; reason: string };

// The cellar-6 (correctOperationCore): neutral voids + volumetric reverts.
// Phase 2 (TAXPAID-1): REMOVE_TAXPAID is NO LONGER here — the tax-paid boundary is one-way, so an
// ordinary compensating reversal must NOT silently re-admit tax-paid volume in-bond. It gets a bespoke
// non-reversible verdict below; the ONLY re-admission is a refund-flagged RETURN_TO_BOND.
const CELLAR_TYPES = new Set<OperationType>(["ADJUST", "DEPLETE", "ADDITION", "FINING", "CAP_MGMT", "TOPPING", "FILTRATION", "LOSS"]);
// Sparkling bottle-phase (reverseSparklingOperationCore).
const SPARKLING_TYPES = new Set<OperationType>(["TIRAGE", "RIDDLING", "DISGORGEMENT", "DOSAGE", "FINISH"]);
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
  // Phase 2 (BOND-1): a TRANSFER_IN_BOND reverses via its own bond-swapping corrector (both bonds).
  if (type === "TRANSFER_IN_BOND") return { reversible: true, family: "bond" };
  // Phase 2 (TAXPAID-1): the tax-paid boundary is terminal — never re-admit via the generic reverser.
  if (type === "REMOVE_TAXPAID")
    return { reversible: false, code: "taxpaid-terminal", reason: "Tax-paid removals are final for TTB. To bring wine back into bond, record a Return-to-Bond (refund) instead." };
  // A RETURN_TO_BOND is itself the refund event — undo it by recording a new tax-paid removal, not a reversal.
  if (type === "RETURN_TO_BOND")
    return { reversible: false, code: "refund-event", reason: "A Return-to-Bond is a refund event — record a new tax-paid removal to move wine back out of bond." };
  if (type === "CORRECTION") return { reversible: false, code: "correction", reason: "This entry is itself a reversal." };
  if (type === "SEED") return { reversible: false, code: "origination", reason: "Seeding is a lot's day-zero origination — it can't be undone." };
  // Unknown/future types fail closed until routed to a family.
  return { reversible: false, code: "manual-adjust", reason: "Correct this by recording a new volume adjustment." };
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function seedReversibilityForOperation(
  operationId: number,
  opts: { ignoreLaterBlocks?: boolean } = {},
): Promise<ReversibilityVerdict> {
  const op = await prisma.lotOperation.findUnique({
    where: { id: operationId },
    include: {
      lines: { include: { lot: { select: { id: true, isLegacy: true, legacySnapshot: true } } } },
      _count: { select: { costLines: true, supplyConsumptions: true, costTransfers: true } },
    },
  });
  if (!op) return { reversible: false, code: "origination", reason: "That seed operation no longer exists." };

  const meta = metadataObject(op.metadata);
  if (meta.seedKind !== "MANUAL_OPERATOR_SEED") {
    return {
      reversible: false,
      code: "origination",
      reason: "Only explicitly marked manual operator seeds can be undone. Imported or legacy opening balances stay locked.",
    };
  }
  if (op.captureMethod === "IMPORT" || op.batchId || op.correctsOperationId != null || op.enteredBy === "system@day-zero-migration") {
    return { reversible: false, code: "origination", reason: "Imported, migration, or compensating seed entries are not undone from the timeline." };
  }
  if (op.commandId && /^(migration|import|legacy)[:_-]/i.test(op.commandId)) {
    return { reversible: false, code: "origination", reason: "Migration seed entries are not undone from the timeline." };
  }

  const lotIds = [...new Set(op.lines.map((l) => l.lotId))];
  const vesselLines = op.lines.filter((l) => l.vesselId != null);
  if (lotIds.length !== 1 || vesselLines.length === 0) {
    return { reversible: false, code: "origination", reason: "Only a simple single-lot manual seed can be undone." };
  }
  if (op.lines.some((l) => l.bucket === "BOTTLE_STORAGE" || l.bottleDelta != null)) {
    return { reversible: false, code: "origination", reason: "Seeds with bottle-storage side effects are not undone from the timeline." };
  }
  if (op.lines.some((l) => l.lot.isLegacy || l.lot.legacySnapshot != null)) {
    return { reversible: false, code: "origination", reason: "Legacy opening-balance seeds are not undone from the timeline." };
  }
  if (op._count.costLines > 0 || op._count.supplyConsumptions > 0 || op._count.costTransfers > 0) {
    return { reversible: false, code: "origination", reason: "Seeds with cost artifacts need a dedicated correction path." };
  }

  if (!opts.ignoreLaterBlocks) {
    const laterBlockers = await laterTouchedBlockers(operationId);
    const affectedKeys = new Set(vesselLines.map((l) => `${l.vesselId}::${l.lotId}`));
    const positionBlocker = laterBlockers.find((b) => b.keys.some((k) => affectedKeys.has(k)));
    if (positionBlocker) {
      return {
        reversible: false,
        code: "origination",
        reason: `This seed is blocked by later ${positionBlocker.type.toLowerCase()} #${positionBlocker.operationId}. Undo newer operations first.`,
      };
    }
    const laterLotOp = await prisma.lotOperationLine.findFirst({
      where: {
        lotId: { in: lotIds },
        operationId: { gt: operationId },
        operation: { type: { not: "CORRECTION" }, correctedBy: { is: null } },
      },
      select: { operationId: true, operation: { select: { type: true } } },
    });
    if (laterLotOp) {
      return {
        reversible: false,
        code: "origination",
        reason: `This seed is blocked by later ${laterLotOp.operation.type.toLowerCase()} #${laterLotOp.operationId}. Undo newer operations first.`,
      };
    }
  }
  const child = await downstreamLineageChild(lotIds);
  if (child) return { reversible: false, code: "origination", reason: "This seed has downstream lineage and cannot be undone from the timeline." };

  const bottled = await prisma.bottledLotState.findFirst({ where: { lotId: { in: lotIds } }, select: { lotId: true } });
  if (bottled) return { reversible: false, code: "origination", reason: "This seed has bottled-lot state and cannot be undone from the timeline." };
  const filed = await prisma.complianceReport.findFirst({
    where: { status: "FILED", periodStart: { lte: op.observedAt }, periodEnd: { gte: op.observedAt } },
    select: { id: true },
  });
  if (filed) return { reversible: false, code: "origination", reason: "This seed is in a filed compliance period and needs an amendment-safe correction path." };

  return { reversible: true, family: "cellar" };
}

export async function reversibilityForOperation(operationId: number): Promise<ReversibilityVerdict> {
  const op = await prisma.lotOperation.findUnique({
    where: { id: operationId },
    select: { type: true, correctedBy: { select: { id: true } } },
  });
  if (!op) return { reversible: false, code: "manual-adjust", reason: "That operation no longer exists." };
  if (op.correctedBy) return { reversible: false, code: "already-reversed", reason: "That operation has already been reversed." };
  if (op.type === "SEED") return seedReversibilityForOperation(operationId);
  return reversibilityOf(op.type);
}

async function baseReversibilityForOperation(operationId: number): Promise<ReversibilityVerdict> {
  const op = await prisma.lotOperation.findUnique({
    where: { id: operationId },
    select: { type: true, correctedBy: { select: { id: true } } },
  });
  if (!op) return { reversible: false, code: "manual-adjust", reason: "That operation no longer exists." };
  if (op.correctedBy) return { reversible: false, code: "already-reversed", reason: "That operation has already been reversed." };
  if (op.type === "SEED") return seedReversibilityForOperation(operationId, { ignoreLaterBlocks: true });
  return reversibilityOf(op.type);
}

export type ReversalChainStep = {
  operationId: number;
  type: OperationType;
  observedAt: string;
  enteredBy: string;
  reversible: boolean;
  reason: string | null;
};

export type ReversalChainPreview = {
  operationId: number;
  executable: boolean;
  reason: string | null;
  steps: ReversalChainStep[];
};

async function collectLaterBlockerIds(operationId: number, seen = new Set<number>()): Promise<Set<number>> {
  const blockers = await laterTouchedBlockers(operationId);
  for (const blocker of blockers) {
    if (seen.has(blocker.operationId)) continue;
    seen.add(blocker.operationId);
    await collectLaterBlockerIds(blocker.operationId, seen);
  }
  return seen;
}

export async function previewReversalChain(operationId: number): Promise<ReversalChainPreview> {
  const root = await prisma.lotOperation.findUnique({
    where: { id: operationId },
    select: { id: true, tenantId: true },
  });
  if (!root) {
    return { operationId, executable: false, reason: "That operation no longer exists.", steps: [] };
  }
  if (root.tenantId !== requireTenantId()) {
    return { operationId, executable: false, reason: "Cross-winery reversal blocked.", steps: [] };
  }

  const blockerIds = [...(await collectLaterBlockerIds(operationId))].sort((a, b) => b - a);
  const stepIds = [...blockerIds, operationId];
  const ops = await prisma.lotOperation.findMany({
    where: { id: { in: stepIds } },
    select: { id: true, type: true, observedAt: true, enteredBy: true },
  });
  const byId = new Map(ops.map((op) => [op.id, op]));
  const steps: ReversalChainStep[] = [];

  for (const id of stepIds) {
    const op = byId.get(id);
    if (!op) continue;
    const verdict = await baseReversibilityForOperation(id);
    steps.push({
      operationId: id,
      type: op.type,
      observedAt: op.observedAt.toISOString(),
      enteredBy: op.enteredBy,
      reversible: verdict.reversible,
      reason: verdict.reversible ? null : verdict.reason,
    });
  }

  const blocked = steps.find((step) => !step.reversible);
  return {
    operationId,
    executable: !blocked && steps.length > 0,
    reason: blocked ? `${blocked.type.toLowerCase()} #${blocked.operationId}: ${blocked.reason}` : null,
    steps,
  };
}

export type ReversalChainResult = {
  operationId: number;
  reversed: ReverseOperationResult[];
};

export async function reverseOperationChainCore(
  actor: LedgerActor,
  input: { operationId: number; lotId?: string; note?: string; expectedStepIds?: number[] },
): Promise<ReversalChainResult> {
  const preview = await previewReversalChain(input.operationId);
  if (!preview.executable) throw new ActionError(preview.reason ?? "That reversal chain cannot be executed.", "CONFLICT");
  const stepIds = preview.steps.map((s) => s.operationId);
  if (input.expectedStepIds && input.expectedStepIds.join(",") !== stepIds.join(",")) {
    throw new ActionError("The undo chain changed. Preview it again before executing.", "CONFLICT");
  }

  const reversed: ReverseOperationResult[] = [];
  for (const stepId of stepIds) {
    reversed.push(await reverseOperationCore(actor, { operationId: stepId, note: input.note }));
  }
  return { operationId: input.operationId, reversed };
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

  const verdict = await reversibilityForOperation(opId);
  if (!verdict.reversible) throw new ActionError(verdict.reason, "CONFLICT");

  const anyLotId = op.lines[0]?.lotId ?? "";

  switch (verdict.family) {
    case "cellar": {
      const r = await correctOperationCore(actor, { operationId: opId, note: input.note, allowSeed: op.type === "SEED" });
      return { reversedOperationId: opId, reversedType: op.type, lotId: anyLotId, correctionId: r.correctionId, message: r.message };
    }
    case "rack": {
      const transferId = await resolveTransferIdForOp(opId);
      if (transferId) {
        const r = await revertTransferCore(actor, { transferId });
        return { reversedOperationId: opId, reversedType: op.type, lotId: anyLotId, correctionId: null, message: r.message };
      }
      // Phase 9.4a: a group rack (one tank ↔ many barrels) has no 1:1 VesselTransfer — reverse the whole
      // op as one compensating CORRECTION over all its lines.
      if (isGroupRackMetadata(op.metadata)) {
        const r = await reverseGroupRackCore(actor, { operationId: opId, note: input.note });
        return { reversedOperationId: opId, reversedType: op.type, lotId: anyLotId, correctionId: r.correctionId, message: r.message };
      }
      throw new ActionError("That rack predates the ledger link and can't be undone from the timeline.", "CONFLICT");
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
    case "bond": {
      const r = await reverseTransferInBondCore(actor, { operationId: opId, note: input.note });
      return { reversedOperationId: opId, reversedType: op.type, lotId: r.lotId || anyLotId, correctionId: r.correctionId, message: r.message };
    }
  }
}
