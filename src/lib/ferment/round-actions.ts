"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import { submitPanelCore, type SubmitPanelInput, type SubmitPanelResult } from "@/lib/ferment/panel-core";

// Phase 6 Unit 6: thin "use server" wrapper for the offline-panel drain. The script-safe,
// idempotent logic lives in panel-core.ts; here we add auth + revalidation.

export type { SubmitReading, SubmitPanelInput, SubmitPanelResult } from "@/lib/ferment/panel-core";

export const submitPanelAction = action(async ({ actor }, input: SubmitPanelInput): Promise<SubmitPanelResult> => {
  const result = await submitPanelCore(actor, input);
  if (result.ok && !result.duplicate) {
    revalidatePath(`/lots/${input.lotId}`);
    revalidatePath("/bulk");
  }
  return result;
});
