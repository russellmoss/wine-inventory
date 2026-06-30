"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { canManagerAccessVineyard } from "@/lib/access";
import { crushLotCore, type CrushLotInput, type CrushLotResult } from "@/lib/transform/crush-core";
import { pressLotCore, type PressLotInput, type PressLotResult } from "@/lib/transform/press-core";

// Server-action layer for the Phase 6 transforms. The script-safe cores live in
// crush-core.ts / press-core.ts; here we add auth (crush is gated by HARVEST block access,
// since it consumes vineyard-scoped picks — council "crush ↔ harvest auth"; once the wine is a
// cellar lot, Phase 5's tenant-wide cellar rules apply) and path revalidation.

/** Require manager access to every vineyard the picks come from (a pick is vineyard-scoped fruit). */
async function requirePickAccess(user: Parameters<typeof canManagerAccessVineyard>[0], pickIds: string[], verb: string) {
  const picks = await prisma.harvestPick.findMany({
    where: { id: { in: pickIds } },
    select: { id: true, harvestRecord: { select: { vineyardId: true } } },
  });
  if (picks.length !== pickIds.length) throw new ActionError("A selected pick no longer exists.");
  for (const vid of [...new Set(picks.map((p) => p.harvestRecord.vineyardId))]) {
    if (!canManagerAccessVineyard(user, vid)) {
      throw new ActionError(`You can only ${verb} fruit from your assigned vineyard.`, "FORBIDDEN");
    }
  }
}

/** Crush selected harvest picks into a must lot. Enforces block access on every pick's vineyard. */
export const crushAction = action(
  async ({ user, actor }, input: CrushLotInput): Promise<CrushLotResult> => {
    if (!input.picks || input.picks.length === 0) throw new ActionError("Select at least one harvest pick.");
    await requirePickAccess(user, [...new Set(input.picks.map((p) => p.pickId))], "crush");
    const result = await crushLotCore(actor, input);
    revalidatePath("/bulk");
    revalidatePath(`/lots/${result.lotId}`);
    return result;
  },
);

/** Whole-cluster press: presses harvest fruit straight to JUICE, SKIPPING crush (no destem). It
 * consumes the picks (so they can't also be crushed — the shared LotHarvestSource ledger enforces
 * that) and originates a JUICE lot at measured liters. Op type PRESS. Block-access gated. */
export const wholeClusterPressAction = action(
  async ({ user, actor }, input: CrushLotInput): Promise<CrushLotResult> => {
    if (!input.picks || input.picks.length === 0) throw new ActionError("Select at least one harvest pick.");
    await requirePickAccess(user, [...new Set(input.picks.map((p) => p.pickId))], "press");
    const result = await crushLotCore(actor, { ...input, outputForm: "JUICE", opType: "PRESS" });
    revalidatePath("/bulk");
    revalidatePath("/ferment/process");
    revalidatePath(`/lots/${result.lotId}`);
    return result;
  },
);

/** Press a must/wine lot into fractions (or saignée a must lot). Tenant-wide cellar op — once
 * fruit is a cellar lot, Phase 5's shared-cellar rules apply (no per-vineyard gate). */
export const pressAction = action(async ({ actor }, input: PressLotInput): Promise<PressLotResult> => {
  const result = await pressLotCore(actor, input);
  revalidatePath("/bulk");
  revalidatePath(`/lots/${result.parentLotId}`);
  for (const f of result.fractions) revalidatePath(`/lots/${f.lotId}`);
  return result;
});
