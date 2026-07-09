import { describe, expect, it } from "vitest";
import {
  parseClientConversation,
  selectFeedbackWindow,
} from "@/lib/assistant/feedback-snapshot";

describe("assistant feedback snapshots", () => {
  it("selects the bounded window ending at the rated assistant message", () => {
    const messages = Array.from({ length: 65 }, (_, i) => ({
      id: `m${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
      metadata: null,
    }));
    const selected = selectFeedbackWindow(messages, "m63");

    expect(selected).not.toBeNull();
    expect(selected?.messages).toHaveLength(60);
    expect(selected?.messages[0]).toMatchObject({ id: "m4" });
    expect(selected?.messages.at(-1)).toMatchObject({ id: "m63", rated: true });
    expect(selected?.debugContext.window).toEqual({ start: 4, end: 64, total: 65 });
  });

  it("copies sanitized trace metadata for the rated assistant message", () => {
    const selected = selectFeedbackWindow(
      [
        { id: "u1", role: "user", content: "help", metadata: null },
        {
          id: "a1",
          role: "assistant",
          content: "ok",
          metadata: { trace: { model: "claude", toolCalls: [{ name: "x", input: { apiKey: "secret", keep: "yes" } }] } },
        },
      ],
      "a1",
    );

    expect(selected?.debugContext.ratedAssistantTrace).toEqual({
      model: "claude",
      toolCalls: [{ name: "x", input: { apiKey: "[redacted]", keep: "yes" } }],
    });
  });

  it("keeps the legacy client transcript fallback strict", () => {
    expect(parseClientConversation([{ role: "user", content: "hi" }])).toEqual([{ role: "user", content: "hi" }]);
    expect(parseClientConversation([{ role: "system", content: "nope" }])).toBeNull();
    expect(parseClientConversation([])).toBeNull();
  });
});
