"use server";

import { revalidatePath } from "next/cache";
import { action, ActionError } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { isSparklingEnabled } from "@/lib/settings/data";
import {
  previewReversalChain,
  reverseOperationChainCore,
  reverseOperationCore,
  SPARKLING_REVERSIBLE_TYPES,
  type ReversalChainPreview,
  type ReversalChainResult,
  type ReverseOperationResult,
} from "@/lib/ledger/reverse";
import type { OperationType } from "@/lib/ledger/vocabulary";

// The ONE gated server action behind the universal timeline "Undo" (plan 024a). It wraps the
// reverseOperationCore dispatcher (which routes by type + owns its own tenant tx) and revalidates
// every capture surface a reversal can move. The three legacy shortcuts (En Tirage worklist,
// post-rack toast, bottling-run undo) also call this — one code path, many entry points.

/**
 * Reverse one reversible ledger op from the lot timeline. `lotId` is the lot the user is viewing
 * (used for revalidation); the dispatcher decides reversibility from the op type and fails closed
 * on non-undoable / already-reversed ops. The sparkling program stays gated even for reversals
 * (K14 parity with the En Tirage path) so a stale client can't run a bottle-phase undo while it's
 * turned off.
 */
export const reverseOperationAction = action(
  async ({ actor }, input: { operationId: number; lotId: string; note?: string }): Promise<ReverseOperationResult> => {
    const op = await prisma.lotOperation.findUnique({ where: { id: input.operationId }, select: { type: true } });
    if (op && SPARKLING_REVERSIBLE_TYPES.has(op.type as OperationType)) {
      if (!(await isSparklingEnabled())) throw new ActionError("The sparkling program is turned off. Enable it in Settings.", "FORBIDDEN");
    }

    const res = await reverseOperationCore(actor, { operationId: input.operationId, note: input.note });

    // Revalidate the timeline + every surface a reversal across the families can touch.
    revalidatePath(`/lots/${input.lotId}`);
    if (res.lotId && res.lotId !== input.lotId) revalidatePath(`/lots/${res.lotId}`);
    revalidatePath("/lots");
    revalidatePath("/bulk");
    revalidatePath("/vessels");
    revalidatePath("/cellar/en-tirage");
    revalidatePath("/bottled");
    revalidatePath("/inventory");
    revalidatePath("/bottling");
    return res;
  },
);

export const previewReversalChainAction = action(
  async (ctx, input: { operationId: number }): Promise<ReversalChainPreview> => {
    void ctx;
    return previewReversalChain(input.operationId);
  },
);

export const reverseOperationChainAction = action(
  async ({ actor }, input: { operationId: number; lotId: string; note?: string; expectedStepIds?: number[] }): Promise<ReversalChainResult> => {
    const preview = await previewReversalChain(input.operationId);
    for (const step of preview.steps) {
      if (SPARKLING_REVERSIBLE_TYPES.has(step.type as OperationType)) {
        if (!(await isSparklingEnabled())) throw new ActionError("The sparkling program is turned off. Enable it in Settings.", "FORBIDDEN");
      }
    }

    const res = await reverseOperationChainCore(actor, {
      operationId: input.operationId,
      lotId: input.lotId,
      note: input.note,
      expectedStepIds: input.expectedStepIds,
    });

    revalidatePath(`/lots/${input.lotId}`);
    for (const step of res.reversed) {
      if (step.lotId && step.lotId !== input.lotId) revalidatePath(`/lots/${step.lotId}`);
    }
    revalidatePath("/lots");
    revalidatePath("/bulk");
    revalidatePath("/vessels");
    revalidatePath("/cellar/en-tirage");
    revalidatePath("/bottled");
    revalidatePath("/inventory");
    revalidatePath("/bottling");
    return res;
  },
);
