import { describe, it, expect } from "vitest";
import { buildReplayMessages, windowReplayRows, type ReplayRow } from "@/lib/assistant/replay";
import { MAX_CONTENT } from "@/lib/assistant/message-window";

/**
 * Plan 083 Unit 3. The contract is narrow and the failure modes are expensive:
 *  - a text-only conversation must come out EXACTLY as before (this ships to every existing chat);
 *  - a tool turn must round-trip into a well-formed tool_use / tool_result pair;
 *  - a half-pair must never be emitted, because that is a hard 400 that bricks the conversation.
 */

const traced = (calls: Array<Record<string, unknown>>) => ({ trace: { toolCalls: calls } });

const CALL = {
  id: "toolu_01",
  name: "log_brix",
  input: { brixValue: 24.2, block: "Block 3" },
  resultPreview: "Card is on screen awaiting confirmation.",
  resultKind: "proposal",
};

describe("buildReplayMessages — text-only conversations are unchanged", () => {
  it("maps plain turns to string content, in order", () => {
    const rows: ReplayRow[] = [
      { role: "user", content: "what is in tank 5?" },
      { role: "assistant", content: "Tank 5 holds 3 lots." },
      { role: "user", content: "thanks" },
    ];
    expect(buildReplayMessages(rows)).toEqual([
      { role: "user", content: "what is in tank 5?" },
      { role: "assistant", content: "Tank 5 holds 3 lots." },
      { role: "user", content: "thanks" },
    ]);
  });

  it("treats a row with no trace metadata as text", () => {
    const rows: ReplayRow[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello", metadata: { trace: { toolCalls: [] } } },
      { role: "user", content: "again" },
    ];
    const out = buildReplayMessages(rows);
    expect(out.every((m) => typeof m.content === "string")).toBe(true);
  });

  it("drops unknown roles and non-string content instead of emitting them", () => {
    const rows = [
      { role: "user", content: "hi" },
      { role: "system", content: "nope" },
      { role: "assistant", content: 42 as unknown as string },
      { role: "user", content: "still here" },
    ] as ReplayRow[];
    expect(buildReplayMessages(rows)).toEqual([
      { role: "user", content: "hi" },
      { role: "user", content: "still here" },
    ]);
  });
});

describe("buildReplayMessages — tool evidence survives", () => {
  it("expands a tool turn into tool_use, tool_result, then the assistant text", () => {
    const rows: ReplayRow[] = [
      { role: "user", content: "log 24.2 brix for Block 3" },
      { role: "assistant", content: "Review and confirm the card.", metadata: traced([CALL]) },
      { role: "user", content: "log a tasting note on T5" },
    ];
    expect(buildReplayMessages(rows)).toEqual([
      { role: "user", content: "log 24.2 brix for Block 3" },
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "toolu_01", name: "log_brix", input: CALL.input }],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "toolu_01", content: "Card is on screen awaiting confirmation." }],
      },
      { role: "assistant", content: "Review and confirm the card." },
      { role: "user", content: "log a tasting note on T5" },
    ]);
  });

  it("returns every tool_result of a turn in ONE user message (mirrors run.ts:268)", () => {
    const rows: ReplayRow[] = [
      { role: "user", content: "rack T3 to T4 and log brix" },
      {
        role: "assistant",
        content: "Both cards are up.",
        metadata: traced([CALL, { ...CALL, id: "toolu_02", name: "rack_wine" }]),
      },
      { role: "user", content: "next" },
    ];
    const out = buildReplayMessages(rows);
    const resultMsgs = out.filter((m) => Array.isArray(m.content) && (m.content as Array<{ type: string }>)[0]?.type === "tool_result");
    expect(resultMsgs).toHaveLength(1);
    expect(resultMsgs[0].content).toHaveLength(2);
  });

  it("substitutes a non-empty result when the trace captured no preview", () => {
    const rows: ReplayRow[] = [
      { role: "user", content: "go" },
      { role: "assistant", content: "done", metadata: traced([{ id: "t1", name: "log_brix", resultKind: "error" }]) },
      { role: "user", content: "next" },
    ];
    const out = buildReplayMessages(rows);
    const result = (out[2].content as Array<{ content: string }>)[0];
    expect(result.content.length).toBeGreaterThan(0);
  });
});

describe("buildReplayMessages — never emits a malformed conversation", () => {
  it("degrades a legacy row (trace calls with no id) to plain text", () => {
    const rows: ReplayRow[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "old reply", metadata: traced([{ name: "log_brix", input: {} }]) },
      { role: "user", content: "next" },
    ];
    const out = buildReplayMessages(rows);
    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "old reply" },
      { role: "user", content: "next" },
    ]);
  });

  it("degrades a PARTIALLY traced row rather than pairing a subset", () => {
    const rows: ReplayRow[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "reply", metadata: traced([CALL, { name: "rack_wine", input: {} }]) },
      { role: "user", content: "next" },
    ];
    const out = buildReplayMessages(rows);
    expect(out[1]).toEqual({ role: "assistant", content: "reply" });
  });

  it("merges owed tool_results into the next user turn when the assistant turn had no text", () => {
    // A proposal-only turn persists with empty content. Emitting a bare user tool_result message and
    // then the real user turn would be two consecutive user messages, which the API rejects.
    const rows: ReplayRow[] = [
      { role: "user", content: "log 24.2 brix" },
      { role: "assistant", content: "   ", metadata: traced([CALL]) },
      { role: "user", content: "and a tasting note on T5" },
    ];
    const out = buildReplayMessages(rows);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const merged = out[2].content as Array<{ type: string }>;
    expect(merged.map((b) => b.type)).toEqual(["tool_result", "text"]);
  });

  it("always alternates roles and opens on a user turn", () => {
    const rows: ReplayRow[] = [
      { role: "assistant", content: "orphan opener" },
      { role: "user", content: "a" },
      { role: "assistant", content: "b", metadata: traced([CALL]) },
      { role: "user", content: "c" },
      { role: "assistant", content: "", metadata: traced([{ ...CALL, id: "toolu_09" }]) },
      { role: "user", content: "d" },
    ];
    const out = buildReplayMessages(rows);
    expect(out[0].role).toBe("user");
    out.forEach((m, i) => {
      if (i > 0) expect(m.role, `messages ${i - 1}/${i} do not alternate`).not.toBe(out[i - 1].role);
    });
  });

  it("never leaves a tool_use without its tool_result", () => {
    const rows: ReplayRow[] = [
      { role: "user", content: "a" },
      { role: "assistant", content: "", metadata: traced([CALL]) },
    ];
    const out = buildReplayMessages(rows);
    const uses = out.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_use");
    const results = out.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_result");
    expect(uses.length).toBe(results.length);
  });

  it("handles empty and malformed input without throwing", () => {
    expect(buildReplayMessages([])).toEqual([]);
    expect(buildReplayMessages(undefined as unknown as ReplayRow[])).toEqual([]);
  });
});

describe("windowReplayRows — bounding cannot orphan a tool block", () => {
  /** A conversation of n user/assistant pairs where every assistant turn used a tool. */
  function toolConversation(pairs: number): ReplayRow[] {
    const rows: ReplayRow[] = [];
    for (let i = 0; i < pairs; i++) {
      rows.push({ role: "user", content: `ask ${i}` });
      rows.push({ role: "assistant", content: `reply ${i}`, metadata: traced([{ ...CALL, id: `toolu_${i}` }]) });
    }
    rows.push({ role: "user", content: "the current utterance" });
    return rows;
  }

  const blocksOf = (msgs: ReturnType<typeof buildReplayMessages>) =>
    msgs.flatMap((m) => (Array.isArray(m.content) ? m.content : []));

  it("bounds the EXPANDED message count, not the row count", () => {
    // Each tool turn costs 3 messages, so an unbounded rebuild of 40 rows would send ~120.
    const out = buildReplayMessages(windowReplayRows(toolConversation(40)));
    expect(out.length).toBeLessThanOrEqual(40);
  });

  it("keeps every tool_use paired with its tool_result at EVERY window budget", () => {
    // The off-by-one lives at a specific budget, so sweep them rather than spot-checking one.
    const rows = toolConversation(30);
    for (let budget = 1; budget <= 60; budget++) {
      const out = buildReplayMessages(windowReplayRows(rows, budget));
      const uses = blocksOf(out).filter((b) => b.type === "tool_use") as Array<{ id: string }>;
      const results = blocksOf(out).filter((b) => b.type === "tool_result") as Array<{ tool_use_id: string }>;
      expect(uses.length, `budget ${budget}: ${uses.length} tool_use vs ${results.length} tool_result`).toBe(results.length);
      expect(new Set(uses.map((u) => u.id)), `budget ${budget}: ids do not match`).toEqual(
        new Set(results.map((r) => r.tool_use_id)),
      );
    }
  });

  it("always opens on a user turn and alternates, at every budget", () => {
    const rows = toolConversation(30);
    for (let budget = 1; budget <= 60; budget++) {
      const out = buildReplayMessages(windowReplayRows(rows, budget));
      if (out.length === 0) continue;
      expect(out[0].role, `budget ${budget}: does not open on user`).toBe("user");
      out.forEach((m, i) => {
        if (i > 0) expect(m.role, `budget ${budget}: messages ${i - 1}/${i} do not alternate`).not.toBe(out[i - 1].role);
      });
    }
  });

  it("never opens with an orphan tool_result even when the cut lands mid-turn", () => {
    const rows = toolConversation(10);
    for (let start = 0; start < rows.length; start++) {
      const out = buildReplayMessages(rows.slice(start));
      if (out.length === 0) continue;
      const first = out[0].content;
      if (Array.isArray(first)) {
        expect(first.some((b) => b.type === "tool_result"), `slice at ${start} opens on an orphan tool_result`).toBe(false);
      }
    }
  });

  it("always preserves the most recent turn — the user's actual request", () => {
    const rows = toolConversation(20);
    for (let budget = 1; budget <= 40; budget++) {
      const out = buildReplayMessages(windowReplayRows(rows, budget));
      const last = out[out.length - 1];
      const text = typeof last.content === "string"
        ? last.content
        : (last.content.find((b) => b.type === "text") as { text?: string } | undefined)?.text;
      expect(text, `budget ${budget}: dropped the current utterance`).toBe("the current utterance");
    }
  });

  it("clips an over-long stored turn instead of sending it whole", () => {
    const rows: ReplayRow[] = [
      { role: "user", content: "x".repeat(MAX_CONTENT + 500) },
    ];
    const out = buildReplayMessages(rows);
    expect((out[0].content as string).length).toBe(MAX_CONTENT);
    expect((out[0].content as string).endsWith("…")).toBe(true);
  });

  it("leaves a short text-only conversation untouched", () => {
    const rows: ReplayRow[] = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ];
    expect(windowReplayRows(rows)).toEqual(rows);
  });
});
