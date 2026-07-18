"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import { sendDirectMessageCore } from "@/lib/inbox/direct-messages";
import { advanceClarificationFromReply } from "@/lib/feedback/clarification";

// Thin "use server" wrapper over the DM core. Compose UI (Unit 8) calls this, then uploads any
// attachments against the returned messageId and router.refresh()es.
export const sendDirectMessageAction = action(
  async (ctx, input: { recipientUserId: string; body: string }): Promise<{ threadId: string; messageId: string }> => {
    const res = await sendDirectMessageCore(ctx.actor, input);
    // Plan 079 (U9): if this message answers an open clarification, close the loop and re-dispatch.
    // Best-effort + explicit tenantId; never lets a feedback side-effect break sending a DM.
    await advanceClarificationFromReply({
      tenantId: ctx.actor.tenantId,
      threadId: res.threadId,
      senderUserId: ctx.actor.actorUserId,
      body: input.body,
    });
    revalidatePath("/inbox");
    return res;
  },
);
