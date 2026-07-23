import { getCurrentUser } from "@/lib/dal";
import { runAssistant, type ChatMessage } from "@/lib/assistant/run";
import { parseAndWindowMessages } from "@/lib/assistant/message-window";
import type { AssistantEvent } from "@/lib/assistant/assistant-events";
import type { Prisma } from "@prisma/client";
import {
  findOwnedConversationId,
  createConversation,
  appendMessage,
  touchConversation,
  listMessagesForReplay,
} from "@/lib/assistant/conversations";
import { buildReplayMessages, windowReplayRows } from "@/lib/assistant/replay";
import { generateTitle } from "@/lib/assistant/title";
import { getWineryTimeZone } from "@/lib/settings/data";
import { resolveOperatingTimeZone } from "@/lib/work-orders/due-at";

// Node runtime + the Vercel ceiling: the tool-use loop makes several model
// round-trips, so give it room. Responses stream as NDJSON so the UI sees text
// as it generates rather than waiting for the whole loop.
export const runtime = "nodejs";
export const maxDuration = 60;

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

  const parsed = parseAndWindowMessages((body as { messages?: unknown })?.messages);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const messages = parsed.messages;

  // Optional: resume an existing conversation. Validated for ownership below;
  // anything unrecognized is treated as a new conversation.
  const rawCid = (body as { conversationId?: unknown })?.conversationId;
  const requestedConversationId =
    typeof rawCid === "string" && rawCid.length > 0 && rawCid.length <= 64 ? rawCid : null;

  // Hands-free voice turn (the voice session sets this). Only effect is an extra
  // spoken-style block on the system prompt; strictly boolean so a junk value can't
  // half-enable it. Text chat omits it and behaves exactly as before.
  const isVoice = (body as { voice?: unknown })?.voice === true;

  // The viewer's IANA timezone, sent by the client. The server runs in UTC, so without a wall-clock
  // reference "tomorrow at 9am" is unresolvable. Validated downstream, so a junk or missing value
  // degrades rather than failing the turn.
  const rawTz = (body as { timeZone?: unknown })?.timeZone;
  const viewerTimeZone = typeof rawTz === "string" && rawTz.length > 0 && rawTz.length <= 64 ? rawTz : undefined;

  const lastUserMessage = messages[messages.length - 1].content;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendNow = (e: AssistantEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      const send = (e: AssistantEvent) => {
        if (e.type === "done") {
          return;
        }
        sendNow(e);
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
        const userMessageId = await appendMessage({ conversationId, role: "user", content: lastUserMessage });
        send({ type: "message", role: "user", id: userMessageId });
      } catch {
        conversationId = null; // give up on persistence, still answer the user
      }

      // Plan 083: rebuild history from the DB rather than trusting the client's array.
      //
      // The client can only send TEXT — proposal/choice items are filtered out of it, so every prior
      // tool call is invisible in what it posts. That is the bug: the model saw its own turns claiming
      // cards with no tool call attached and completed the pattern in prose (0/8 on the captured
      // repro, 8/8 once the blocks are restored). The persisted rows carry the trace, so they can be
      // replayed faithfully. The user turn was just appended, so `rows` already ends on it.
      //
      // If persistence failed, conversationId is null and we fall back to the client array — degraded
      // replay, but the user still gets an answer.
      let replayed: ChatMessage[] = messages;
      if (conversationId) {
        try {
          const rows = await listMessagesForReplay(conversationId);
          // Bound BEFORE rebuilding — windowing the rebuilt array could split a tool_use from its
          // tool_result, which is a hard 400. Cutting at row boundaries makes that unrepresentable.
          const rebuilt = buildReplayMessages(windowReplayRows(rows));
          if (rebuilt.length > 0) replayed = rebuilt;
        } catch {
          /* fall back to the client-supplied history */
        }
      }

      try {
        // The clock this turn is reasoned on. The WINERY's configured zone wins — "issue it for 9am"
        // means the crew's 9am, and an owner asking from another country must not silently plan work
        // on their own clock. Resolved HERE rather than inside runAssistant so the loop stays free of
        // DB reads (its tests construct it without a database). Best-effort: a settings hiccup falls
        // back to the viewer's zone, which is what shipped before this setting existed.
        let wineryTimeZone: string | null = null;
        try {
          wineryTimeZone = await getWineryTimeZone();
        } catch {
          /* unset or unavailable → the viewer's own zone */
        }
        const timeZone = resolveOperatingTimeZone(wineryTimeZone, viewerTimeZone);

        const run = await runAssistant({ user, messages: replayed, send, voice: isVoice, timeZone });
        // Persist when there is text OR any tool call. A turn that emitted only a card has no text;
        // dropping it (the old `run.text.trim()` gate) threw away exactly the tool evidence replay
        // needs, so the next turn would look like the assistant answered a write request with nothing.
        const hasToolEvidence = run.trace.toolCalls.length > 0;
        if (conversationId && (run.text.trim() || hasToolEvidence)) {
          try {
            const assistantMessageId = await appendMessage({
              conversationId,
              role: "assistant",
              content: run.text,
              metadata: { trace: run.trace } as Prisma.InputJsonValue,
            });
            send({ type: "message", role: "assistant", id: assistantMessageId });
            await touchConversation(conversationId);
          } catch {
            /* best-effort: the reply already streamed to the user */
          }
        }
      } catch {
        send({ type: "error", message: "Assistant error." });
      } finally {
        sendNow({ type: "done" });
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
