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
import {
  createTrialCore,
  updateTrialCore,
  scoreTrialCore,
  chooseTrialCore,
  discardTrialCore,
  markTrialPromotedCore,
  type CreateTrialInput,
  type ScoreTrialInput,
} from "@/lib/blend/trials";

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

// ── Bench trials (Unit 9) — off-ledger, UI-only ──

export const createTrialAction = action(async ({ actor }, input: CreateTrialInput) => {
  const res = await createTrialCore(actor, input);
  revalidatePath("/blend/trials");
  return res;
});

export const updateTrialAction = action(async ({ actor }, input: CreateTrialInput & { id: string }) => {
  const res = await updateTrialCore(actor, input);
  revalidatePath("/blend/trials");
  return res;
});

export const scoreTrialAction = action(async ({ actor }, input: ScoreTrialInput) => {
  const res = await scoreTrialCore(actor, input);
  revalidatePath("/blend/trials");
  return res;
});

export const chooseTrialAction = action(async ({ actor }, id: string) => {
  const res = await chooseTrialCore(actor, { id }, new Date());
  revalidatePath("/blend/trials");
  return res;
});

export const discardTrialAction = action(async ({ actor }, id: string) => {
  const res = await discardTrialCore(actor, { id });
  revalidatePath("/blend/trials");
  return res;
});

/** Called by the builder after a promoted trial's blend executes — flips it to PROMOTED. */
export const markTrialPromotedAction = action(async ({ actor }, id: string, childLotId: string) => {
  const res = await markTrialPromotedCore(actor, { id, childLotId });
  revalidatePath("/blend/trials");
  return res;
});
