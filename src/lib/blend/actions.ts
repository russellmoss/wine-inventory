"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import { blendLotsCore, type BlendLotsInput, type BlendLotsResult } from "@/lib/blend/blend-core";

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
