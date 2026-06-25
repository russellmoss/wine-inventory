import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

// Capture thumbs up/down (+ optional "what was wrong") on an assistant reply.
// On actionable negative feedback we best-effort trigger the feedback-fix
// workflow; if no dispatch token is configured, the scheduled run picks it up.
export const runtime = "nodejs";

const MAX_COMMENT = 2000;
const MAX_MESSAGES = 60;
const MAX_CONTENT = 8000;

type Msg = { role: "user" | "assistant"; content: string };

function parseConversation(raw: unknown): Msg[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out: Msg[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length > MAX_CONTENT) return null;
    out.push({ role, content: content.slice(0, MAX_CONTENT) });
  }
  return out;
}

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

  const conversation = parseConversation((body as { messages?: unknown })?.messages);
  if (!conversation) return Response.json({ error: "Invalid conversation." }, { status: 400 });

  const fb = await prisma.assistantFeedback.create({
    data: {
      rating,
      comment,
      conversation,
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
