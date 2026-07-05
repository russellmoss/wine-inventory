"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/actions";
import { removeTaxpaidCore, type RemovalInput, type RemovalResult } from "@/lib/compliance/removal-core";
import { removeBottledCore, type BottledRemovalInput, type BottledRemovalResult } from "@/lib/compliance/bottled-removal-core";

// Typed, admin-gated wrappers over the removal cores for programmatic callers (the assistant committers).
// The route-level actions in src/app/(app)/compliance/actions.ts are FormData-shaped for the UI; these take
// the typed core input directly. Admin-gated (adminAction) because a removal is a tax-determination event.

function revalidate() {
  revalidatePath("/compliance");
  revalidatePath("/bulk");
}

export const removeTaxpaidTyped = adminAction(async ({ actor }, input: RemovalInput): Promise<RemovalResult> => {
  const res = await removeTaxpaidCore(actor, input);
  revalidate();
  return res;
});

export const removeBottledTyped = adminAction(async ({ actor }, input: BottledRemovalInput): Promise<BottledRemovalResult> => {
  const res = await removeBottledCore(actor, input);
  revalidate();
  return res;
});
