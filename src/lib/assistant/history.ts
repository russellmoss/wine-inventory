// Shared (client + test safe) helpers for rendering persisted conversation
// history back into the chat UI. Pure — no server imports.

export type PersistedMessage = { id?: string; role: string; content: string; createdAt?: string };
export type HistoryTextItem = { kind: "text"; id?: string; role: "user" | "assistant"; content: string };

/**
 * Map persisted messages into the chat UI's text items. Only user/assistant text
 * turns are kept (proposals/confirmations were never persisted, so they don't
 * reappear on resume). Unknown roles and non-string content are dropped.
 */
export function messagesToItems(messages: PersistedMessage[]): HistoryTextItem[] {
  if (!Array.isArray(messages)) return [];
  const out: HistoryTextItem[] = [];
  for (const m of messages) {
    if (!m || typeof m.content !== "string") continue;
    if (m.role === "user" || m.role === "assistant") {
      out.push({
        kind: "text",
        ...(typeof m.id === "string" && m.id ? { id: m.id } : {}),
        role: m.role,
        content: m.content,
      });
    }
  }
  return out;
}
