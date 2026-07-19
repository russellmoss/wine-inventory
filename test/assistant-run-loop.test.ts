import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AssistantEvent } from "@/lib/assistant/assistant-events";

// Plan 081 U3 — the FIRST tests runAssistant has ever had.
//
// The loop was untestable because it constructed `new Anthropic()` inline, so every behavior it owns
// (proposal emission, choice handling, tool errors, turn capping, the over-claim correction) was only
// ever verified by hand in a browser. That is how a 2/7 card-emission rate shipped unnoticed.
//
// These are CHARACTERIZATION tests: they pin down what the loop does TODAY, so the Draft Card work in
// Units 4-7 has a regression net. They inject a scripted stream and never touch the network.

vi.mock("@/lib/feedback/clarification", () => ({
  listOpenClarificationsForUser: vi.fn(async () => []),
}));

const { runAssistant } = await import("@/lib/assistant/run");

type ScriptedTurn = Anthropic.Message;

/** Build a scripted stream factory that replays `turns` in order, one per loop iteration. */
function scriptStream(turns: ScriptedTurn[]) {
  const seen: Anthropic.MessageStreamParams[] = [];
  let i = 0;
  const factory = (params: Anthropic.MessageStreamParams) => {
    seen.push(params);
    const msg = turns[Math.min(i, turns.length - 1)];
    i += 1;
    return {
      on(_event: "text", handler: (delta: string) => void) {
        // Mirror the SDK: text blocks arrive as deltas before finalMessage resolves.
        for (const block of msg.content) {
          if (block.type === "text") handler(block.text);
        }
        return this;
      },
      finalMessage: async () => msg,
    };
  };
  return { factory, seen, calls: () => i };
}

function textTurn(text: string): ScriptedTurn {
  return {
    id: "msg_text",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as ScriptedTurn;
}

function toolTurn(name: string, input: Record<string, unknown>, id = "tu_1"): ScriptedTurn {
  return {
    id: "msg_tool",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [{ type: "tool_use", id, name, input }],
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as ScriptedTurn;
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

async function run(turns: ScriptedTurn[]) {
  const events: AssistantEvent[] = [];
  const scripted = scriptStream(turns);
  const result = await runAssistant({
    user: USER,
    messages: [{ role: "user", content: "hello" }],
    send: (e) => events.push(e),
    createStream: scripted.factory,
  });
  return { events, result, scripted };
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "";
});

describe("runAssistant — loop characterization", () => {
  it("streams text and stops on end_turn without calling the model again", async () => {
    const { events, result, scripted } = await run([textTurn("Tank T4 holds 8,300 L.")]);

    expect(events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text)).toEqual([
      "Tank T4 holds 8,300 L.",
    ]);
    expect(result.text).toBe("Tank T4 holds 8,300 L.");
    expect(scripted.calls()).toBe(1); // end_turn must not re-enter the model
    expect(events.some((e) => e.type === "proposal")).toBe(false);
  });

  it("runs without an API key when a stream factory is injected", async () => {
    const { events } = await run([textTurn("ok")]);
    // The missing-key guard must not fire on the injected path, or none of these tests could run.
    expect(events.some((e) => e.type === "error")).toBe(false);
  });

  it("emits a tool start/end pair around a tool call", async () => {
    const { events } = await run([toolTurn("query_cellar_contents", { vessel: "T4" }), textTurn("done")]);

    const toolEvents = events.filter((e) => e.type === "tool") as Array<{ name: string; phase: string }>;
    expect(toolEvents.map((e) => e.phase)).toEqual(["start", "end"]);
    expect(toolEvents[0].name).toBe("query_cellar_contents");
  });

  it("surfaces an unknown tool as a tool error rather than throwing", async () => {
    const { events, result } = await run([toolTurn("no_such_tool", {}), textTurn("recovered")]);

    const end = events.find((e) => e.type === "tool" && e.phase === "end") as { ok?: boolean } | undefined;
    expect(end?.ok).toBe(false);
    // The loop keeps going and lets the model recover; it must not crash the stream.
    expect(result.text).toContain("recovered");
  });

  it("caps at MAX_TURNS when the model never stops calling tools", async () => {
    // Always returns tool_use — the loop must terminate on its own cap, not spin forever.
    const { scripted } = await run([toolTurn("query_cellar_contents", { vessel: "T4" })]);
    expect(scripted.calls()).toBe(8); // MAX_TURNS
  });

  it("appends the over-claim correction when the text claims a card and none was emitted", async () => {
    const { events } = await run([textTurn("I've created the work order — review and confirm the card.")]);

    const texts = events.filter((e) => e.type === "text").map((e) => (e as { text: string }).text);
    expect(texts.join("")).toContain("Correction");
    expect(events.some((e) => e.type === "proposal")).toBe(false);
  });

  it("does NOT append the correction on an ordinary read answer", async () => {
    const { events } = await run([textTurn("The latest Brix for Block 3 is 24.2.")]);
    expect(events.map((e) => (e.type === "text" ? e.text : "")).join("")).not.toContain("Correction");
  });
});
