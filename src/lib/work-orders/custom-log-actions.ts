"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/actions";
import { createUserTaskTypeCore, updateUserTaskTypeCore, archiveUserTaskTypeCore, type CustomLogInput } from "@/lib/work-orders/custom-log";

// Plan 053 C11: Custom Log authoring — admin/owner only (like template authoring). The resolver picks the
// new/updated types up on the next request; revalidate the builder + task-types surfaces.

function revalidateCustomLogs() {
  revalidatePath("/work-orders/task-types");
  revalidatePath("/work-orders/new");
}

export const createUserTaskTypeAction = adminAction(async ({ actor }, input: CustomLogInput) => {
  const res = await createUserTaskTypeCore(actor, input);
  revalidateCustomLogs();
  return res;
});

export const updateUserTaskTypeAction = adminAction(async ({ actor }, input: { id: string; label?: string; fields?: unknown }) => {
  const res = await updateUserTaskTypeCore(actor, input);
  revalidateCustomLogs();
  return res;
});

export const archiveUserTaskTypeAction = adminAction(async ({ actor }, input: { id: string; active: boolean }) => {
  const res = await archiveUserTaskTypeCore(actor, input);
  revalidateCustomLogs();
  return res;
});
