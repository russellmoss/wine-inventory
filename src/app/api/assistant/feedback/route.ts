import { getCurrentUser } from "@/lib/dal";
import { FeedbackAutomationMode, FeedbackAutomationSource, type Prisma } from "@prisma/client";
import {
  buildFeedbackSnapshot,
  parseClientConversation,
  type FeedbackDebugContext,
  type FeedbackConversationMessage,
} from "@/lib/assistant/feedback-snapshot";
import { getFeedbackAutomationModes } from "@/lib/settings/data";
import { recordAutomationGate } from "@/lib/feedback/automation";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";

// Capture thumbs up/down (+ optional "what was wrong") on an assistant reply.
// On actionable negative feedback we best-effort trigger the feedback-fix
// workflow; if no dispatch token is configured, the scheduled run picks it up.
export const runtime = "nodejs";

const MAX_COMMENT = 2000;
const MAX_ID = 128;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  if (!tenantId) return Response.json({ error: "No active winery." }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }

  const rating = (body as { rating?: unknown })?.rating;
  if (rating !== "up" && rating !== "down") {
    return Response.json({ error: "rating must be 'up' or 'down'." }, { status: 400 });
  }
  const rawComment = (body as { comment?: unknown })?.comment;
  const comment = typeof rawComment === "string" && rawComment.trim() ? rawComment.trim().slice(0, MAX_COMMENT) : null;

  const rawConversationId = (body as { conversationId?: unknown })?.conversationId;
  const rawRatedMessageId = (body as { ratedMessageId?: unknown })?.ratedMessageId;
  const conversationId =
    typeof rawConversationId === "string" && rawConversationId.length > 0 && rawConversationId.length <= MAX_ID
      ? rawConversationId
      : null;
  const ratedMessageId =
    typeof rawRatedMessageId === "string" && rawRatedMessageId.length > 0 && rawRatedMessageId.length <= MAX_ID
      ? rawRatedMessageId
      : null;

  let conversation: FeedbackConversationMessage[] | null = null;
  let debugContext: FeedbackDebugContext = { schemaVersion: 1, source: "client-fallback" };
  if (conversationId && ratedMessageId) {
    const snapshot = await buildFeedbackSnapshot({ conversationId, ratedMessageId, ownerUserId: user.id });
    if (!snapshot) return Response.json({ error: "Rated assistant message not found." }, { status: 400 });
    conversation = snapshot.conversation;
    debugContext = snapshot.debugContext;
  } else {
    conversation = parseClientConversation((body as { messages?: unknown })?.messages);
  }
  if (!conversation) return Response.json({ error: "Invalid conversation." }, { status: 400 });

  const modes = await runAsTenant(tenantId, () => getFeedbackAutomationModes());
  const modeAtSubmission =
    rating === "down" && comment ? modes.assistantFeedbackMode : FeedbackAutomationMode.REPORT_ONLY;

  const fb = await runAsTenant(tenantId, () =>
    runInTenantTx(async (tx) => {
      const created = await tx.assistantFeedback.create({
        data: {
          rating,
          comment,
          conversation,
          conversationId,
          ratedMessageId,
          debugContext: debugContext as Prisma.InputJsonValue,
          actorUserId: user.id,
          actorEmail: user.email,
          modeAtSubmission,
        },
        select: { id: true },
      });
      if (rating === "down" && comment) {
        await recordAutomationGate(tx, {
          tenantId,
          sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
          sourceId: created.id,
          mode: modeAtSubmission,
        });
      }
      return created;
    }),
  );

  return Response.json({ ok: true, id: fb.id });
}
