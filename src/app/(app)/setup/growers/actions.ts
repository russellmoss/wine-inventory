"use server";

import { revalidatePath } from "next/cache";
import { safeAdminAction } from "@/lib/actions";
import { createGrowerWithSync, updateGrowerWithSync } from "@/lib/grower/grower-sync";
import type { CreateGrowerInput, UpdateGrowerInput } from "@/lib/grower/grower-core";

// Plan 093 follow-on: Setup → Growers. Admin-only; always available (estate fruit has growers too).
// Plan 095: routes through the shared grower-sync helpers so a third-party grower is also created/linked as a
// vendor and pushed to QBO (estate growers skip both).

const PATH = "/setup/growers";

export const createGrower = safeAdminAction(async (ctx, input: CreateGrowerInput) => {
  const r = await createGrowerWithSync(ctx.actor, input);
  revalidatePath(PATH);
  return r;
});

export const updateGrower = safeAdminAction(async (ctx, input: UpdateGrowerInput) => {
  const r = await updateGrowerWithSync(ctx.actor, input);
  revalidatePath(PATH);
  return r;
});
