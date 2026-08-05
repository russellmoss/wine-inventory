import { describe, it, expect, vi, beforeEach } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AssistantEvent } from "@/lib/assistant/assistant-events";

// The loop's half of the unverified-failure guard (feedback cmsgbjgov000fl704f36c47p7, 2026-08-05).
//
// The predicate is unit-tested in assistant-unverified-failure-guard.test.ts; what is proven HERE is
// the wiring the user actually experiences: the repair turn fires once, the correction lands exactly
// once when repair fails, a real tool error stands the whole thing down, and the correction never
// contradicts the over-claim correction it sits next to.
//
// The registry is stubbed with ONE fake write tool (same technique as assistant-run-loop-draft) so
// `cardShown` and `observedFailure` can be driven deterministically — no DB, no network.

const toolBehaviour = { throwIt: false };

vi.mock("@/lib/feedback/clarification", () => ({
  listOpenClarificationsForUser: vi.fn(async () => []),
}));

vi.mock("@/lib/assistant/registry", () => ({
  getToolsFor: () => [
    {
      name: "fake_write",
      description: "fake",
      kind: "write" as const,
      inputSchema: { type: "object", properties: {} },
      run: async () => {
        if (toolBehaviour.throwIt) throw new Error("vessel is inactive");
        return { needsConfirmation: true, preview: "Create work order for T3 → T4", token: "tok_1" };
      },
    },
  ],
}));

const { runAssistant } = await import("@/lib/assistant/run");
const { UNVERIFIED_FAILURE_REPAIR_PROMPT } = await import("@/lib/assistant/unverified-failure-guard");

/** The verbatim sentence from the ticket. Seven writes had committed when the assistant said this. */
const FALSE_CLAIM =
  "That's a display problem on our end (the tool ran and returned the preview, but the card isn't " +
  "rendering for you), so nothing got saved.";

function toolTurn(): Anthropic.Message {
  return {
    id: "msg_tool",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content: [{ type: "tool_use", id: "tu_1", name: "fake_write", input: {} }],
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

async function run(turns: Anthropic.Message[]) {
  const events: AssistantEvent[] = [];
  const seen: Anthropic.MessageStreamParams[] = [];
  let i = 0;
  const result = await runAssistant({
    user: {
      id: "u1",
      email: "demo@demo.com",
      role: "admin",
      activeOrganizationId: "org_demo_winery",
      vineyardIds: [],
    } as never,
    messages: [{ role: "user", content: "did any of that save?" }],
    send: (e) => events.push(e),
    createStream: (params) => {
      seen.push(params);
      const msg = turns[Math.min(i, turns.length - 1)];
      i += 1;
      return {
        on(_e: "text", handler: (d: string) => void) {
          for (const b of msg.content) if (b.type === "text") handler(b.text);
          return this;
        },
        finalMessage: async () => msg,
      };
    },
  });
  const shown = events.map((e) => (e.type === "text" ? e.text : "")).join("");
  const corrections = events.filter(
    (e) => e.type === "text" && e.text.includes("I can't see your screen"),
  );
  return { events, result, seen, shown, corrections, modelCalls: () => i };
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "";
  toolBehaviour.throwIt = false;
});

describe("runAssistant — unverified-failure backstop", () => {
  it("corrects the verbatim ticket claim after a card was actually emitted", async () => {
    const { corrections, result, shown } = await run([
      toolTurn(),
      textTurn(FALSE_CLAIM),
      textTurn(FALSE_CLAIM), // the repair turn repeats the claim
    ]);

    expect(corrections).toHaveLength(1);
    expect(shown).toContain("before redoing anything");
    expect(result.trace.unverifiedFailureRepair).toBe("failed");
  });

  it("gives the model exactly one repair turn, and asks it to go look instead of guessing", async () => {
    const { seen, modelCalls } = await run([toolTurn(), textTurn(FALSE_CLAIM), textTurn(FALSE_CLAIM)]);

    // tool turn, the false claim, one repair attempt. Not a fourth.
    expect(modelCalls()).toBe(3);
    expect(JSON.stringify(seen[2].messages)).toContain("Use a read tool now");
  });

  it("never leaks the repair instruction to the user", async () => {
    const { shown } = await run([toolTurn(), textTurn(FALSE_CLAIM), textTurn(FALSE_CLAIM)]);
    expect(shown).not.toContain("Use a read tool now");
    expect(shown).not.toContain(UNVERIFIED_FAILURE_REPAIR_PROMPT);
  });

  it("stays silent when the repair turn actually fixes the answer", async () => {
    // The suffix-scoping check: the ORIGINAL false sentence is still sitting in `assistantText`, so a
    // whole-text backstop would apologise on top of an answer that is now correct.
    const { corrections, result } = await run([
      toolTurn(),
      textTurn(FALSE_CLAIM),
      textTurn("I checked — work order #83 exists and is in DRAFT. Nothing needs redoing."),
    ]);

    expect(corrections).toHaveLength(0);
    expect(result.trace.unverifiedFailureRepair).toBe("recovered");
  });

  it("stands down completely when a tool actually failed — that claim has evidence", async () => {
    toolBehaviour.throwIt = true;
    const { corrections, result, modelCalls } = await run([
      toolTurn(),
      textTurn("The write failed and nothing got saved — the vessel is inactive."),
    ]);

    expect(corrections).toHaveLength(0);
    expect(result.trace.unverifiedFailureRepair).toBeUndefined();
    expect(modelCalls()).toBe(2); // no repair turn either
  });

  it("does not fire on an ordinary answer", async () => {
    const { corrections, result, modelCalls } = await run([
      textTurn("Tank T4 holds 8,300 L across two lots."),
    ]);

    expect(corrections).toHaveLength(0);
    expect(result.trace.unverifiedFailureRepair).toBeUndefined();
    expect(modelCalls()).toBe(1);
  });

  it("never contradicts the over-claim correction — the two are mutually exclusive", async () => {
    // No tool called, so the over-claim guard fires and PROVES nothing was written this run. Saying
    // "nothing was saved" is then TRUE, and a second correction telling the user we can't confirm it
    // would be the false statement of the pair.
    const claimBoth =
      "I've created the work order — review and confirm the card. " +
      "It's a rendering issue if you can't see it.";
    const { events, corrections } = await run([textTurn(claimBoth), textTurn(claimBoth)]);

    const overclaim = events.filter(
      (e) => e.type === "text" && e.text.includes("I have not actually created or filed anything"),
    );
    expect(overclaim).toHaveLength(1);
    expect(corrections).toHaveLength(0);
  });
});
