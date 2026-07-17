import type { ChatMessage } from "./run";

// Shared conversation bounds for the assistant chat transport. Both the client
// (AssistantChat / voice session) and the server route (/api/assistant) import
// these so they can never drift apart — a mismatch is exactly what used to brick
// long conversations with an opaque 400 "Invalid messages."
export const MAX_MESSAGES = 40;
export const MAX_CONTENT = 8000;

export type ParsedMessages =
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; error: string };

/**
 * Validate + WINDOW a raw conversation payload into a model-ready message list.
 *
 * The client sends the full conversation history on every turn. Rather than
 * rejecting a long-but-otherwise-valid history (which permanently bricked every
 * future send once a chat crossed 40 messages or any turn crossed 8000 chars),
 * this keeps the most recent `MAX_MESSAGES` turns and truncates over-long PRIOR
 * turns (e.g. a huge assistant reply) so they can't poison the conversation.
 *
 * A hard error is returned ONLY for a genuinely bad *current* message (empty or
 * too long — the client guards these too) or a structurally malformed payload.
 *
 * The result always starts on a `user` turn, alternates roles, and ends on a
 * `user` turn — the shape the Anthropic Messages API requires (run.ts feeds it
 * straight through with no further normalization).
 */
export function parseAndWindowMessages(raw: unknown): ParsedMessages {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Invalid messages." };
  }

  // Keep only the most recent turns instead of 400ing a long conversation.
  const windowed = raw.slice(-MAX_MESSAGES);
  const out: ChatMessage[] = [];

  for (let i = 0; i < windowed.length; i++) {
    const m = windowed[i];
    const isLast = i === windowed.length - 1;
    if (!m || typeof m !== "object") return { ok: false, error: "Invalid messages." };

    const role = (m as { role?: unknown }).role;
    const rawContent = (m as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") return { ok: false, error: "Invalid messages." };
    if (typeof rawContent !== "string") return { ok: false, error: "Invalid messages." };
    let content: string = rawContent;

    if (content.length === 0) {
      // An empty *current* message is a real (if guarded) client error; an empty
      // PRIOR turn is malformed and shouldn't occur — reject rather than silently
      // dropping it (dropping a middle turn would break role alternation).
      return { ok: false, error: isLast ? "Message cannot be empty." : "Invalid messages." };
    }

    if (content.length > MAX_CONTENT) {
      if (isLast) {
        return { ok: false, error: `Message is too long (max ${MAX_CONTENT} characters).` };
      }
      // Clip an over-long historical turn so it stops bricking the conversation.
      content = content.slice(0, MAX_CONTENT - 1) + "…";
    }

    out.push({ role, content });
  }

  // Windowing can leave a leading assistant turn; the Anthropic API requires the
  // first turn to be `user`. The incoming history is already alternating, so at
  // most one leading assistant turn needs to drop.
  while (out.length > 0 && out[0].role !== "user") out.shift();

  if (out.length === 0 || out[out.length - 1].role !== "user") {
    return { ok: false, error: "Invalid messages." };
  }

  return { ok: true, messages: out };
}

/**
 * Client-side counterpart: cap the history a client sends to the most recent
 * `MAX_MESSAGES` turns. Belt-and-suspenders with the server window — it shrinks
 * the payload and keeps the two sides in lockstep.
 */
export function clampHistoryForSend(history: ChatMessage[]): ChatMessage[] {
  return history.length > MAX_MESSAGES ? history.slice(-MAX_MESSAGES) : history;
}
