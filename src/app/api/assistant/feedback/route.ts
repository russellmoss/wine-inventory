import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import {
  buildFeedbackSnapshot,
  parseClientConversation,
  type FeedbackDebugContext,
  type FeedbackConversationMessage,
} from "@/lib/assistant/feedback-snapshot";

// Capture thumbs up/down (+ optional "what was wrong") on an assistant reply.
// On actionable negative feedback we best-effort trigger the feedback-fix
// workflow; if no dispatch token is configured, the scheduled run picks it up.
export const runtime = "nodejs";

const MAX_COMMENT = 2000;
const MAX_ID = 128;

async function triggerWorkflow(feedbackId: string): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // "owner/name"
  if (!token || !repo) return;
  try {
    await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ event_type: "assistant_feedback", client_payload: { feedbackId } }),
    });
  } catch {
    // Best-effort: a failed dispatch must never fail the feedback save.
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

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

  const fb = await prisma.assistantFeedback.create({
    data: {
      rating,
      comment,
      conversation,
      conversationId,
      ratedMessageId,
      debugContext,
      actorUserId: user.id,
      actorEmail: user.email,
    },
    select: { id: true },
  });

  if (rating === "down" && comment) {
    await triggerWorkflow(fb.id);
  }

  return Response.json({ ok: true, id: fb.id });
}
