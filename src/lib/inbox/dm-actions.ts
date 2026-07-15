"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import { sendDirectMessageCore } from "@/lib/inbox/direct-messages";

// Thin "use server" wrapper over the DM core. Compose UI (Unit 8) calls this, then uploads any
// attachments against the returned messageId and router.refresh()es.
export const sendDirectMessageAction = action(
  async (ctx, input: { recipientUserId: string; body: string }): Promise<{ threadId: string; messageId: string }> => {
    const res = await sendDirectMessageCore(ctx.actor, input);
    revalidatePath("/inbox");
    return res;
  },
);
