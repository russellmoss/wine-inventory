import { getCurrentUser } from "@/lib/dal";
import { runAssistant, type ChatMessage } from "@/lib/assistant/run";
import type { AssistantEvent } from "@/lib/assistant/assistant-events";
import {
  findOwnedConversationId,
  createConversation,
  appendMessage,
  touchConversation,
} from "@/lib/assistant/conversations";
import { generateTitle } from "@/lib/assistant/title";

// Node runtime + the Vercel ceiling: the tool-use loop makes several model
// round-trips, so give it room. Responses stream as NDJSON so the UI sees text
// as it generates rather than waiting for the whole loop.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGES = 40;
const MAX_CONTENT = 8000;

function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.length === 0 || content.length > MAX_CONTENT) return null;
    out.push({ role, content });
  }
  if (out[out.length - 1].role !== "user") return null; // must end on a user turn
  return out;
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

  const messages = parseMessages((body as { messages?: unknown })?.messages);
  if (!messages) return Response.json({ error: "Invalid messages." }, { status: 400 });

  // Optional: resume an existing conversation. Validated for ownership below;
  // anything unrecognized is treated as a new conversation.
  const rawCid = (body as { conversationId?: unknown })?.conversationId;
  const requestedConversationId =
    typeof rawCid === "string" && rawCid.length > 0 && rawCid.length <= 64 ? rawCid : null;

  const lastUserMessage = messages[messages.length - 1].content;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AssistantEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };

      // Resolve (or create) the conversation, then persist the user turn. All
      // persistence is best-effort: a DB hiccup must never break the chat, so we
      // fall back to running unpersisted (conversationId stays null).
      let conversationId: string | null = null;
      try {
        if (requestedConversationId) {
          conversationId = await findOwnedConversationId({
            id: requestedConversationId,
            ownerUserId: user.id,
          });
        }
        if (conversationId) {
          send({ type: "conversation", id: conversationId });
        } else {
          const title = await generateTitle(lastUserMessage);
          conversationId = await createConversation({ ownerUserId: user.id, title });
          send({ type: "conversation", id: conversationId, title });
        }
        await appendMessage({ conversationId, role: "user", content: lastUserMessage });
      } catch {
        conversationId = null; // give up on persistence, still answer the user
      }

      try {
        const assistantText = await runAssistant({ user, messages, send });
        if (conversationId && assistantText.trim()) {
          try {
            await appendMessage({ conversationId, role: "assistant", content: assistantText });
            await touchConversation(conversationId);
          } catch {
            /* best-effort: the reply already streamed to the user */
          }
        }
      } catch {
        send({ type: "error", message: "Assistant error." });
        send({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
