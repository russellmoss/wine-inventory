import "server-only";
import { prisma } from "@/lib/prisma";
import type { CapturedConsoleEntry } from "@/lib/feedback/debug-context";
import { sanitizeTraceValue } from "./trace";

const MAX_MESSAGES = 60;
const MAX_CONTENT = 8000;

export type FeedbackConversationMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  rated?: boolean;
};

export type FeedbackDebugContext = {
  schemaVersion: 1;
  source: "server-conversation" | "client-fallback";
  conversationId?: string;
  ratedMessageId?: string;
  window?: { start: number; end: number; total: number };
  ratedAssistantTrace?: unknown;
  // Console captured client-side at the moment of the 👎 (Plan 079, Unit 2);
  // merged in by the route without disturbing the server-built fields above.
  consoleLog?: CapturedConsoleEntry[];
  clientErrors?: CapturedConsoleEntry[];
};

type PersistedFeedbackMessage = {
  id: string;
  role: string;
  content: string;
  metadata: unknown;
};

export function parseClientConversation(raw: unknown): FeedbackConversationMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out: FeedbackConversationMessage[] = [];
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

export function selectFeedbackWindow(
  messages: PersistedFeedbackMessage[],
  ratedMessageId: string,
): { messages: FeedbackConversationMessage[]; debugContext: FeedbackDebugContext } | null {
  const ratedIdx = messages.findIndex((m) => m.id === ratedMessageId && m.role === "assistant");
  if (ratedIdx < 0) return null;

  const start = Math.max(0, ratedIdx - MAX_MESSAGES + 1);
  const window = messages.slice(start, ratedIdx + 1);
  const rated = messages[ratedIdx];
  const trace =
    rated.metadata && typeof rated.metadata === "object" && !Array.isArray(rated.metadata)
      ? (rated.metadata as { trace?: unknown }).trace
      : undefined;

  return {
    messages: window
      .filter((m): m is PersistedFeedbackMessage & { role: "user" | "assistant" } => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content.slice(0, MAX_CONTENT),
        ...(m.id === ratedMessageId ? { rated: true } : {}),
      })),
    debugContext: {
      schemaVersion: 1,
      source: "server-conversation",
      ratedMessageId,
      window: { start, end: ratedIdx + 1, total: messages.length },
      ...(trace !== undefined ? { ratedAssistantTrace: sanitizeTraceValue(trace) } : {}),
    },
  };
}

export async function buildFeedbackSnapshot(args: {
  conversationId: string;
  ratedMessageId: string;
  ownerUserId: string;
}): Promise<{ conversation: FeedbackConversationMessage[]; debugContext: FeedbackDebugContext } | null> {
  const convo = await prisma.assistantConversation.findFirst({
    where: { id: args.conversationId, ownerUserId: args.ownerUserId },
    select: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { id: true, role: true, content: true, metadata: true },
      },
    },
  });
  if (!convo) return null;

  const selected = selectFeedbackWindow(convo.messages, args.ratedMessageId);
  if (!selected) return null;
  return {
    conversation: selected.messages,
    debugContext: {
      ...selected.debugContext,
      conversationId: args.conversationId,
    },
  };
}
