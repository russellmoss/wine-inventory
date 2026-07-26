"use server";
/**
 * Vineyard Intelligence P4 — the soil server action. `safeAction` so a user-facing failure survives
 * Next.js's production error redaction (returns `{ ok:false, error }` instead of an opaque string).
 */
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions";
import { pullBlockSoil } from "./pull-core";
import { getBlockSoilContext } from "./read";

/** Read the current snapshot + pull eligibility for the block panel (the UI's initial load). */
export const getBlockSoilAction = safeAction(async (_ctx, blockId: string) => getBlockSoilContext(blockId));

/** One-click NRCS soil pull for a block. Read-user gated via `action`; tenant-scoped + audited. */
export const pullBlockSoilAction = safeAction(async (ctx, blockId: string, forceRefresh?: boolean) => {
  const result = await pullBlockSoil(ctx.actor, blockId, { forceRefresh: forceRefresh === true });
  revalidatePath("/reference");
  return result;
});
