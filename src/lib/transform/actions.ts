"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { canManagerAccessVineyard } from "@/lib/access";
import { crushLotCore, type CrushLotInput, type CrushLotResult } from "@/lib/transform/crush-core";

// Server-action layer for the Phase 6 transforms. The script-safe cores live in
// crush-core.ts / press-core.ts; here we add auth (crush is gated by HARVEST block access,
// since it consumes vineyard-scoped picks — council "crush ↔ harvest auth"; once the wine is a
// cellar lot, Phase 5's tenant-wide cellar rules apply) and path revalidation.

/** Crush selected harvest picks into a must lot. Enforces block access on every pick's vineyard. */
export const crushAction = action(
  async ({ user, actor }, input: CrushLotInput): Promise<CrushLotResult> => {
    if (!input.picks || input.picks.length === 0) throw new ActionError("Select at least one harvest pick.");

    // Resolve each pick's source vineyard and require manager access to it (a pick is a
    // manager's vineyard-scoped fruit; crushing it must not bypass that).
    const pickIds = [...new Set(input.picks.map((p) => p.pickId))];
    const picks = await prisma.harvestPick.findMany({
      where: { id: { in: pickIds } },
      select: { id: true, harvestRecord: { select: { vineyardId: true } } },
    });
    if (picks.length !== pickIds.length) throw new ActionError("A selected pick no longer exists.");
    const vineyardIds = [...new Set(picks.map((p) => p.harvestRecord.vineyardId))];
    for (const vid of vineyardIds) {
      if (!canManagerAccessVineyard(user, vid)) {
        throw new ActionError("You can only crush fruit from your assigned vineyard.", "FORBIDDEN");
      }
    }

    const result = await crushLotCore(actor, input);
    revalidatePath("/bulk");
    revalidatePath("/ferment/round");
    revalidatePath(`/lots/${result.lotId}`);
    return result;
  },
);
