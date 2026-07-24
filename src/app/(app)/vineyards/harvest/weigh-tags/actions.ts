"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions";
import { createWeighTagCore, voidWeighTagCore, type CreateWeighTagInput } from "@/lib/harvest/weigh-tag-core";

// Plan 093 Unit 10b: the weigh-tag entry screen's server actions. safeAction so a user-facing failure
// (e.g. an empty tag) survives Next's prod redaction as { ok:false, error }.

const PATH = "/vineyards/harvest/weigh-tags";

export const issueWeighTag = safeAction(async (ctx, input: CreateWeighTagInput) => {
  const result = await createWeighTagCore(ctx.actor, input);
  revalidatePath(PATH);
  return result;
});

export const voidWeighTag = safeAction(async (ctx, input: { weighTagId: string; reason: string }) => {
  const result = await voidWeighTagCore(ctx.actor, input);
  revalidatePath(PATH);
  return result;
});
