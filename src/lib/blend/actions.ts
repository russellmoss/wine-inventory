"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import { blendLotsCore, type BlendLotsInput, type BlendLotsResult } from "@/lib/blend/blend-core";
import {
  correctBlendCore,
  previewBlendCorrection,
  type BlendCorrectionPreview,
  type CorrectBlendResult,
} from "@/lib/blend/blend-correct";

// Thin "use server" wrappers over the blend cores. The builder UI (Unit 8) calls these; the
// lineage-mutating blend op is UI-only (D10 — never voice/assistant-driven).

export const blendLotsAction = action(
  async ({ actor }, input: BlendLotsInput): Promise<BlendLotsResult> => {
    const res = await blendLotsCore(actor, input);
    revalidatePath("/blend");
    revalidatePath("/lots");
    revalidatePath(`/lots/${res.childLotId}`);
    revalidatePath("/cellar");
    return res;
  },
);

/** Non-mutating preview for the "Undo this blend?" confirmation dialog. */
export const previewBlendCorrectionAction = action(
  async (_ctx, operationId: number): Promise<BlendCorrectionPreview> => previewBlendCorrection(operationId),
);

/** Execute a blend undo (compensating CORRECTION; child marked CORRECTED, kept for audit). */
export const correctBlendAction = action(
  async ({ actor }, operationId: number): Promise<CorrectBlendResult> => {
    const res = await correctBlendCore(actor, { operationId });
    revalidatePath("/blend");
    revalidatePath("/lots");
    revalidatePath(`/lots/${res.childLotId}`);
    revalidatePath("/cellar");
    return res;
  },
);
