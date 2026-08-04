import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AssistantEvent } from "@/lib/assistant/assistant-events";

/**
 * Plan 107 Unit 1a — the two properties that make the dispatch log worth having. Both are ORDERING /
 * FAILURE-ISOLATION properties, not "a row exists" properties, because "a row exists" is exactly
 * what the old trace already gave us and it was not enough.
 *
 *  1. The log is written BEFORE the tool runs. If it is written after, a turn that dies mid-tool
 *     loses the very call we most wanted to count, and we are back to the survivorship bias this
 *     unit exists to remove.
 *  2. A logging failure NEVER breaks the chat turn. The winemaker's answer outranks our telemetry.
 *
 * Injected stream + mocked logger; no network, no database.
 */

vi.mock("@/lib/feedback/clarification", () => ({
  listOpenClarificationsForUser: vi.fn(async () => []),
}));

// Records the interleaving of "logged" and "tool ran" so ORDER can be asserted, not just occurrence.
const timeline: string[] = [];
const logSpy = vi.fn(async (input: { tools: Array<{ name: string; kind: string }>; modelTurn: number }) => {
  timeline.push(`log:${input.tools.map((t) => `${t.name}/${t.kind}`).join("+")}@turn${input.modelTurn}`);
});

vi.mock("@/lib/assistant/tool-log", () => ({
  logToolDispatch: (input: never) => logSpy(input),
}));

vi.mock("@/lib/assistant/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/assistant/registry")>();
  return {
    ...actual,
    getToolsFor: () => [
      {
        name: "query_cellar_contents",
        description: "d",
        kind: "read" as const,
        inputSchema: { type: "object", properties: {} },
        run: async () => {
          timeline.push("ran:query_cellar_contents");
          return { ok: true };
        },
      },
      {
        name: "log_brix",
        description: "d",
        kind: "write" as const,
        inputSchema: { type: "object", properties: {} },
        run: async () => {
          timeline.push("ran:log_brix");
          return "logged";
        },
      },
    ],
  };
});

const { runAssistant } = await import("@/lib/assistant/run");

function toolTurn(calls: Array<{ name: string; id: string }>): Anthropic.Message {
  return {
    id: "msg_tool",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: {} })),
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

function textTurn(text: string): Anthropic.Message {
  return {
    id: "msg_text",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

const USER = {
  id: "u1",
  email: "demo@demo.com",
  name: "Demo",
  role: "admin",
  activeOrganizationId: "org_demo_winery",
  supportOrganizationId: null,
  vineyardIds: [],
} as never;

async function run(turns: Anthropic.Message[]) {
  const events: AssistantEvent[] = [];
  let i = 0;
  const result = await runAssistant({
    user: USER,
    messages: [{ role: "user", content: "hello" }],
    send: (e) => events.push(e),
    conversationId: "conv_1",
    createStream: () => {
      const msg = turns[Math.min(i, turns.length - 1)];
      i += 1;
      return {
        on(_e: "text", h: (d: string) => void) {
          for (const b of msg.content) if (b.type === "text") h(b.text);
          return this;
        },
        finalMessage: async () => msg,
      };
    },
  });
  return { events, result };
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "";
  timeline.length = 0;
  logSpy.mockClear();
  logSpy.mockImplementation(async (input) => {
    timeline.push(`log:${input.tools.map((t) => `${t.name}/${t.kind}`).join("+")}@turn${input.modelTurn}`);
  });
});

describe("assistant tool-dispatch log (plan 107 Unit 1a)", () => {
  it("writes the log BEFORE the tool runs — not after", async () => {
    await run([toolTurn([{ name: "query_cellar_contents", id: "t1" }]), textTurn("done")]);
    expect(timeline).toEqual(["log:query_cellar_contents/read@turn0", "ran:query_cellar_contents"]);
  });

  it("batches ONE call per model turn covering every tool in it, with its kind", async () => {
    await run([
      toolTurn([
        { name: "query_cellar_contents", id: "t1" },
        { name: "log_brix", id: "t2" },
      ]),
      textTurn("done"),
    ]);
    // One log call, both tools in it, and it precedes BOTH dispatches. Per-call logging would be
    // N round-trips on a path that already has a serverless ceiling.
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(timeline).toEqual([
      "log:query_cellar_contents/read+log_brix/write@turn0",
      "ran:query_cellar_contents",
      "ran:log_brix",
    ]);
  });

  it("logs each model turn separately, with an increasing turn index", async () => {
    await run([
      toolTurn([{ name: "query_cellar_contents", id: "t1" }]),
      toolTurn([{ name: "log_brix", id: "t2" }]),
      textTurn("done"),
    ]);
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(timeline).toEqual([
      "log:query_cellar_contents/read@turn0",
      "ran:query_cellar_contents",
      "log:log_brix/write@turn1",
      "ran:log_brix",
    ]);
  });

  it("still answers the user when the logger THROWS", async () => {
    // The logger swallows its own errors, but the loop must not depend on that promise being kept.
    logSpy.mockImplementation(async () => {
      throw new Error("db down");
    });
    const { events, result } = await run([
      toolTurn([{ name: "query_cellar_contents", id: "t1" }]),
      textTurn("Tank T4 holds 8,300 L."),
    ]);
    expect(result.text).toBe("Tank T4 holds 8,300 L.");
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  it("does not log when the model calls no tools", async () => {
    await run([textTurn("no tools needed")]);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("records an unknown tool name rather than dropping it", async () => {
    // A model asking for a tool that does not exist is a finding worth counting, not noise.
    await run([toolTurn([{ name: "not_a_real_tool", id: "t1" }]), textTurn("done")]);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(timeline[0]).toBe("log:not_a_real_tool/unknown@turn0");
  });
});
