"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import {
  markAllReadCore,
  markReadCore,
  markThreadNotificationsReadCore,
  markUnreadCore,
} from "@/lib/inbox/notifications";

// Thin "use server" wrappers over the notification core. The /inbox client calls these, then
// router.refresh()es so the layout badge recomputes (no realtime push in v1 — OUT of scope).

export const markNotificationsReadAction = action(async (ctx, ids: string[]): Promise<{ updated: number }> => {
  const updated = await markReadCore(ctx.user.id, ids);
  revalidatePath("/inbox");
  return { updated };
});

export const markNotificationsUnreadAction = action(async (ctx, ids: string[]): Promise<{ updated: number }> => {
  const updated = await markUnreadCore(ctx.user.id, ids);
  revalidatePath("/inbox");
  return { updated };
});

export const markAllNotificationsReadAction = action(async (ctx): Promise<{ updated: number }> => {
  const updated = await markAllReadCore(ctx.user.id);
  revalidatePath("/inbox");
  return { updated };
});

export const markThreadReadAction = action(async (ctx, threadId: string): Promise<{ updated: number }> => {
  const updated = await markThreadNotificationsReadCore(ctx.user.id, threadId);
  revalidatePath("/inbox");
  return { updated };
});
