"use server";

import { revalidatePath } from "next/cache";
import { safeAdminAction } from "@/lib/actions";
import { createOwnerCore, updateOwnerCore, type CreateOwnerInput, type UpdateOwnerInput } from "@/lib/owner/owner-core";

// Plan 093 follow-on: Setup → Clients (custom-crush Owners). Admin-only; safeAdminAction so a user-facing
// failure survives Next's prod redaction.

const PATH = "/setup/clients";

export const createClient = safeAdminAction(async (ctx, input: CreateOwnerInput) => {
  const r = await createOwnerCore(ctx.actor, input);
  revalidatePath(PATH);
  return r;
});

export const updateClient = safeAdminAction(async (ctx, input: UpdateOwnerInput) => {
  const r = await updateOwnerCore(ctx.actor, input);
  revalidatePath(PATH);
  return r;
});
