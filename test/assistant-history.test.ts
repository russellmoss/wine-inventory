import { describe, it, expect } from "vitest";
import { messagesToItems } from "@/lib/assistant/history";

describe("messagesToItems", () => {
  it("maps user/assistant text turns in order", () => {
    const items = messagesToItems([
      { id: "m1", role: "user", content: "hi" },
      { id: "m2", role: "assistant", content: "hello" },
    ]);
    expect(items).toEqual([
      { kind: "text", id: "m1", role: "user", content: "hi" },
      { kind: "text", id: "m2", role: "assistant", content: "hello" },
    ]);
  });

  it("drops unknown roles and non-string content", () => {
    const items = messagesToItems([
      { role: "system", content: "ignored" },
      { role: "user", content: "kept" },
      { role: "assistant", content: 42 as unknown as string },
    ]);
    expect(items).toEqual([{ kind: "text", role: "user", content: "kept" }]);
  });

  it("handles empty / non-array input", () => {
    expect(messagesToItems([])).toEqual([]);
    expect(messagesToItems(undefined as unknown as [])).toEqual([]);
  });
});
