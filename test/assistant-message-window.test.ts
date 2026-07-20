import { describe, it, expect } from "vitest";
import {
  parseAndWindowMessages,
  clampHistoryForSend,
  MAX_MESSAGES,
  MAX_CONTENT,
} from "@/lib/assistant/message-window";
// TextMessage, not ChatMessage: this parser handles what the CLIENT posts, which is text only.
// Replayed turns rebuilt from the DB carry blocks and go through replay.ts instead (plan 083).
import type { TextMessage } from "@/lib/assistant/message-window";

// Regression for the Bhutan "'Invalid message' error when typing in chat" report
// (feedback cmrm9s97r0000ju04g6ry4hix). The client sends the FULL conversation history
// on every turn; the server used to 400 "Invalid messages." the moment a conversation
// crossed 40 messages or any turn crossed 8000 chars — permanently bricking every
// subsequent send. The server now WINDOWS to the most recent turns and truncates
// over-long PRIOR turns instead of rejecting.

// Alternating u/a/u/... starting on user. Odd length ends on a user turn.
function conversation(n: number): TextMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `m${i}`,
  }));
}

function assertModelReady(messages: TextMessage[]) {
  expect(messages.length).toBeGreaterThan(0);
  expect(messages[0].role).toBe("user"); // Anthropic requires a leading user turn
  expect(messages[messages.length - 1].role).toBe("user"); // must end on a user turn
  for (let i = 1; i < messages.length; i++) {
    expect(messages[i].role).not.toBe(messages[i - 1].role); // strict alternation
  }
}

describe("parseAndWindowMessages", () => {
  it("passes a short valid conversation through unchanged", () => {
    const raw = conversation(3); // u,a,u
    const res = parseAndWindowMessages(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.messages).toEqual(raw);
      assertModelReady(res.messages);
    }
  });

  it("WINDOWS a long conversation instead of 400ing (the reported bug)", () => {
    const raw = conversation(45); // 45 > MAX_MESSAGES(40), ends on user "m44"
    const res = parseAndWindowMessages(raw);
    expect(res.ok).toBe(true); // old code returned null -> 400 "Invalid messages."
    if (res.ok) {
      expect(res.messages.length).toBeLessThanOrEqual(MAX_MESSAGES);
      assertModelReady(res.messages);
      // The current user message is preserved as the last turn.
      expect(res.messages[res.messages.length - 1].content).toBe("m44");
    }
  });

  it("truncates an over-long PRIOR turn (e.g. a huge assistant reply) rather than rejecting", () => {
    const huge = "x".repeat(MAX_CONTENT + 500);
    const raw: TextMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: huge }, // poisoned every future send before the fix
      { role: "user", content: "and now?" },
    ];
    const res = parseAndWindowMessages(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const priorAssistant = res.messages[1];
      expect(priorAssistant.content.length).toBe(MAX_CONTENT);
      expect(priorAssistant.content.endsWith("…")).toBe(true);
      assertModelReady(res.messages);
    }
  });

  it("rejects an over-long CURRENT message with a specific, non-opaque error", () => {
    const raw: TextMessage[] = [{ role: "user", content: "y".repeat(MAX_CONTENT + 1) }];
    const res = parseAndWindowMessages(raw);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/too long/i);
  });

  it("rejects an empty current message with a clear error", () => {
    const raw: TextMessage[] = [{ role: "user", content: "" }];
    const res = parseAndWindowMessages(raw);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/empty/i);
  });

  it("rejects a structurally malformed payload", () => {
    expect(parseAndWindowMessages(null).ok).toBe(false);
    expect(parseAndWindowMessages([]).ok).toBe(false);
    expect(parseAndWindowMessages("nope").ok).toBe(false);
    expect(parseAndWindowMessages([{ role: "system", content: "x" }]).ok).toBe(false);
  });

  it("rejects a conversation that does not end on a user turn", () => {
    const raw = conversation(4); // u,a,u,a -> ends on assistant
    const res = parseAndWindowMessages(raw);
    expect(res.ok).toBe(false);
  });
});

describe("clampHistoryForSend", () => {
  it("caps the client payload to the most recent MAX_MESSAGES turns", () => {
    const raw = conversation(60);
    expect(clampHistoryForSend(raw).length).toBe(MAX_MESSAGES);
    expect(clampHistoryForSend(raw)).toEqual(raw.slice(-MAX_MESSAGES));
  });

  it("returns a short history unchanged", () => {
    const raw = conversation(5);
    expect(clampHistoryForSend(raw)).toBe(raw);
  });
});
