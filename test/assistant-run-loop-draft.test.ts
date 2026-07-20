import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { AssistantEvent } from "@/lib/assistant/assistant-events";

// Plan 081 U4 — the loop's half of the Draft contract.
//
// The registry is stubbed with ONE fake write tool so each branch of the proposal path (ready / draft /
// draft-carrying-a-forged-token) can be driven deterministically, with no DB and no network.

const toolOut = { value: undefined as unknown };

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
      run: async () => toolOut.value,
    },
  ],
}));

const { runAssistant } = await import("@/lib/assistant/run");

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

async function runWith(out: unknown, trailingText = "ok") {
  toolOut.value = out;
  const turns = [toolTurn(), textTurn(trailingText)];
  let i = 0;
  const seen: Anthropic.MessageStreamParams[] = [];
  const events: AssistantEvent[] = [];
  await runAssistant({
    user: { id: "u1", email: "d@d.com", role: "admin", activeOrganizationId: "org_demo_winery", vineyardIds: [] } as never,
    messages: [{ role: "user", content: "issue a work order" }],
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
  const proposal = events.find((e) => e.type === "proposal") as
    | { type: "proposal"; preview: string; token?: string; draft?: true }
    | undefined;
  // What the model is told back about the card — the thing that stops it re-asking in prose.
  const toolResult = seen[1]?.messages.at(-1);
  return { events, proposal, toolResult: JSON.stringify(toolResult) };
}

describe("runAssistant — Draft proposal emission", () => {
  it("emits a READY proposal with its token", async () => {
    const { proposal, toolResult } = await runWith({ needsConfirmation: true, preview: "Create WO", token: "tok-1" });
    expect(proposal).toBeDefined();
    expect(proposal!.token).toBe("tok-1");
    expect(proposal!.draft).toBeUndefined();
    expect(toolResult).toContain("confirmation card was shown");
  });

  it("emits a DRAFT proposal event with NO token", async () => {
    const { proposal } = await runWith({
      needsConfirmation: true,
      draft: true,
      preview: "Draft: rack T3 to T4",
      details: { unresolved: [{ key: "assignee", label: "Assignee", reason: "No email given." }] },
    });
    expect(proposal).toBeDefined();
    expect(proposal!.draft).toBe(true);
    expect(proposal!.token).toBeUndefined();
    expect("token" in proposal!).toBe(false);
    expect(proposal!.preview).toBe("Draft: rack T3 to T4");
  });

  it("tells the model a DRAFT card is on screen so it does not re-ask in prose", async () => {
    const { toolResult } = await runWith({ needsConfirmation: true, draft: true, preview: "Draft: rack T3 to T4" });
    expect(toolResult).toContain("DRAFT card was shown");
    expect(toolResult).toMatch(/Do not call this tool again/i);
  });

  it("a draft still counts as a card, so the over-claim correction does NOT fire", async () => {
    const { events } = await runWith(
      { needsConfirmation: true, draft: true, preview: "Draft" },
      "I've proposed the work order — review and confirm the card.",
    );
    expect(events.map((e) => (e.type === "text" ? e.text : "")).join("")).not.toContain("Correction");
  });

  it("never emits a token for a draft even if the tool tried to attach one", async () => {
    const { proposal, events } = await runWith({
      needsConfirmation: true,
      draft: true,
      preview: "Draft",
      token: "forged-token",
    });
    expect(proposal!.token).toBeUndefined();
    expect(JSON.stringify(events)).not.toContain("forged-token");
  });

  it("a write tool returning prose is NOT a proposal (the bug this plan closes)", async () => {
    const { proposal } = await runWith("I could not make this work order ready to confirm: no assignee.");
    expect(proposal).toBeUndefined();
  });
});

// Plan 083 U5 — the repair turn's interaction with a REAL card. Lives here rather than in
// assistant-run-loop.test.ts because that file uses the real registry, where any write tool needs the
// DB; the fake_write stub above makes both the success and failure paths deterministic.
describe("runAssistant — over-claim repair turn, against a real proposal", () => {
  const CLAIM = "I've logged a tasting note on T5 — review and confirm the card to save it.";

  /** Script: the model claims a card in prose, then (on the repair turn) actually calls the tool. */
  async function runRepair(out: unknown, turns: Anthropic.Message[]) {
    toolOut.value = out;
    let i = 0;
    const seen: Anthropic.MessageStreamParams[] = [];
    const events: AssistantEvent[] = [];
    const result = await runAssistant({
      user: { id: "u1", email: "d@d.com", role: "admin", activeOrganizationId: "org_demo_winery", vineyardIds: [] } as never,
      messages: [{ role: "user", content: "log a tasting note on T5" }],
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
    return { events, result, calls: () => i, seen };
  }

  it("recovers the write: the repair turn calls the tool and the correction stays silent", async () => {
    const { events, result } = await runRepair({ needsConfirmation: true, preview: "Tasting note on 24-CS-01", token: "tok-9" }, [
      textTurn(CLAIM),
      toolTurn(),
      textTurn("The card is on screen."),
    ]);

    expect(events.some((e) => e.type === "proposal")).toBe(true);
    expect(events.map((e) => (e.type === "text" ? e.text : "")).join("")).not.toContain("Correction");
    expect(result.trace.overclaimRepair).toBe("recovered");
  });

  it("does not fire at all when the first turn already produced a card", async () => {
    const { result, calls } = await runRepair({ needsConfirmation: true, preview: "Tasting note", token: "tok-9" }, [
      toolTurn(),
      textTurn(CLAIM),
    ]);

    // The claim in the trailing text is TRUE here, so there is nothing to repair.
    expect(result.trace.overclaimRepair).toBeUndefined();
    expect(calls()).toBe(2);
  });
});
