"use server";

import { revalidatePath } from "next/cache";
import { safeAdminAction } from "@/lib/actions";
import { createGrowerCore, updateGrowerCore, type CreateGrowerInput, type UpdateGrowerInput } from "@/lib/grower/grower-core";

// Plan 093 follow-on: Setup → Growers. Admin-only; always available (estate fruit has growers too).

const PATH = "/setup/growers";

export const createGrower = safeAdminAction(async (ctx, input: CreateGrowerInput) => {
  const r = await createGrowerCore(ctx.actor, input);
  revalidatePath(PATH);
  return r;
});

export const updateGrower = safeAdminAction(async (ctx, input: UpdateGrowerInput) => {
  const r = await updateGrowerCore(ctx.actor, input);
  revalidatePath(PATH);
  return r;
});
