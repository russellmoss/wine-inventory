"use server";
/**
 * Vineyard Intelligence P4 — the soil server action. `safeAction` so a user-facing failure survives
 * Next.js's production error redaction (returns `{ ok:false, error }` instead of an opaque string).
 */
import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions";
import { pullBlockSoil } from "./pull-core";
import { getBlockSoilContext, getVineyardSoilOverlays } from "./read";

/** Read the current snapshot + pull eligibility for the block panel (the UI's initial load). */
export const getBlockSoilAction = safeAction(async (_ctx, blockId: string) => getBlockSoilContext(blockId));

/** Read the soil MAP overlays for a vineyard (the "Soil" map layer). Null = nothing to paint yet. */
export const getVineyardSoilOverlaysAction = safeAction(async (_ctx, vineyardId: string) => getVineyardSoilOverlays(vineyardId));

/** One-click NRCS soil pull for a block. Read-user gated via `action`; tenant-scoped + audited. */
export const pullBlockSoilAction = safeAction(async (ctx, blockId: string, forceRefresh?: boolean) => {
  const result = await pullBlockSoil(ctx.actor, blockId, { forceRefresh: forceRefresh === true });
  revalidatePath("/reference");
  return result;
});
