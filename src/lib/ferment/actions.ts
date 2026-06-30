"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import { transitionStateCore, type TransitionInput, type TransitionResult } from "@/lib/ferment/transition-core";

// Phase 6 Unit 10: thin "use server" wrapper. The script-safe logic + the stuck read live in
// transition-core.ts (so scripts/verify-ferment.ts can drive them without server-only). Here we
// add auth + path revalidation.

export type { TransitionInput, TransitionResult } from "@/lib/ferment/transition-core";

export const transitionStateAction = action(async ({ actor }, input: TransitionInput): Promise<TransitionResult> => {
  const result = await transitionStateCore(actor, input);
  revalidatePath(`/lots/${input.lotId}`);
  revalidatePath("/ferment/round");
  return result;
});
