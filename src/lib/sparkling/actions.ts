"use server";

import { revalidatePath } from "next/cache";
import { action, ActionError } from "@/lib/actions";
import { isSparklingEnabled } from "@/lib/settings/data";
import { tirageCore, type TirageInput, type TirageResult } from "@/lib/sparkling/tirage-core";
import { riddlingCore, type RiddlingInput } from "@/lib/sparkling/riddling-core";
import { disgorgementCore, type DisgorgementResult } from "@/lib/sparkling/disgorgement-core";
import { dosageCore, type DosageResult } from "@/lib/sparkling/dosage-core";
import { finalizeSparklingCore, type FinalizeResult } from "@/lib/sparkling/finalize-core";
import { correctBottleOperationCore, reverseFinalizeCore } from "@/lib/sparkling/correct";

// Phase 7 Unit 12: thin "use server" wrappers over the sparkling cores. EVERY action is gated
// behind the winery sparklingEnabled setting (K14) — with it off, none of these can run even if
// a stale client somehow posts. The capture surface is two forms (Tirage + Disgorge-&-finish)
// plus an inline riddling log (K15); disgorgeAndFinishAction runs the distinct DISGORGEMENT →
// DOSAGE → FINISH cores in sequence, with a "disgorge only" escape.

async function gate() {
  if (!(await isSparklingEnabled())) throw new ActionError("The sparkling program is turned off. Enable it in Settings.", "FORBIDDEN");
}

function revalidateLot(lotId: string) {
  revalidatePath("/cellar/en-tirage");
  revalidatePath(`/lots/${lotId}`);
  revalidatePath("/bulk");
}

export const tirageAction = action(async ({ actor }, input: TirageInput): Promise<TirageResult> => {
  await gate();
  const res = await tirageCore(actor, input);
  revalidateLot(res.lotId);
  return res;
});

export const riddlingAction = action(async ({ actor }, input: RiddlingInput): Promise<{ operationId: number }> => {
  await gate();
  const res = await riddlingCore(actor, input);
  revalidateLot(input.lotId);
  return { operationId: res.operationId };
});

export type DisgorgeAndFinishInput = {
  lotId: string;
  bottlesDisgorged: number;
  perBottleLossMl?: number;
  method?: "a_la_glace" | "a_la_volee";
  sacrificedBottleCount?: number;
  breakageCount?: number;
  disgorgeOnly?: boolean; // advanced escape: disgorge now, dose/finish later
  dose?: { perBottleDoseMl?: number; targetRS?: number; liqueurGPerL?: number; liqueurMaterialId?: string; preDosageRS?: number };
  finish?: { skuName: string; destinationLocationId: string; isNonVintage?: boolean; vintage?: number | null };
};

export type DisgorgeAndFinishResult = {
  disgorged: DisgorgementResult;
  dosed?: DosageResult;
  finalized?: FinalizeResult;
};

/** The consolidated "Disgorge & finish" flow (K15): distinct DISGORGEMENT → DOSAGE → FINISH ops. */
export const disgorgeAndFinishAction = action(async ({ actor }, input: DisgorgeAndFinishInput): Promise<DisgorgeAndFinishResult> => {
  await gate();
  const disgorged = await disgorgementCore(actor, {
    lotId: input.lotId,
    bottlesDisgorged: input.bottlesDisgorged,
    perBottleLossMl: input.perBottleLossMl,
    method: input.method,
    sacrificedBottleCount: input.sacrificedBottleCount,
    breakageCount: input.breakageCount,
  });
  // A partial disgorgement dosed/finishes the peeled child; a full one continues on the same lot.
  const target = disgorged.childLotId ?? input.lotId;
  revalidateLot(input.lotId);
  if (target !== input.lotId) revalidateLot(target);

  if (input.disgorgeOnly) return { disgorged };

  let dosed: DosageResult | undefined;
  if (input.dose) {
    dosed = await dosageCore(actor, { lotId: target, ...input.dose });
  }
  if (!input.finish) throw new ActionError("Provide finish details (SKU name + destination), or use the disgorge-only option.");
  const finalized = await finalizeSparklingCore(actor, {
    lotId: target,
    skuName: input.finish.skuName,
    destinationLocationId: input.finish.destinationLocationId,
    isNonVintage: input.finish.isNonVintage,
    vintage: input.finish.vintage,
  });
  revalidateLot(target);
  revalidatePath("/bottled");
  revalidatePath("/inventory");
  return { disgorged, dosed, finalized };
});

export const correctBottleOperationAction = action(async ({ actor }, input: { operationId: number; lotId: string; note?: string }) => {
  await gate();
  const res = await correctBottleOperationCore(actor, { operationId: input.operationId, note: input.note });
  revalidateLot(input.lotId);
  return res;
});

export const reverseFinalizeAction = action(async ({ actor }, input: { runId: string; lotId: string; note?: string }) => {
  await gate();
  const res = await reverseFinalizeCore(actor, { runId: input.runId, note: input.note });
  revalidateLot(input.lotId);
  revalidatePath("/bottled");
  revalidatePath("/inventory");
  return res;
});
