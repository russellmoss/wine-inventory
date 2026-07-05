import { describe, it, expect } from "vitest";
import { getToolsFor, type AssistantTool } from "@/lib/assistant/registry";
import { ASSISTANT_FLEET } from "./assistant-fleet.golden";

/**
 * FLEET eval — the second axis (see docs/architecture/assistant-coverage.md). Where the per-tool write
 * golden proves reachability, this proves the model picks the RIGHT tool + operation with the FULL tool
 * set loaded, and keeps the read-vs-write (calculate-vs-dose) boundary. Two layers, mirroring the write
 * eval:
 *   • DEFAULT (deterministic, zero-cost): each case names a real tool of the expected kind, and an `op`
 *     is a real member of that tool's `operation` enum. Drift-proof against the real registry.
 *   • GATED (ASSISTANT_EVAL=1 + ANTHROPIC_API_KEY): offers the full tool set and asserts the model selects
 *     the expected tool (and operation), which also asserts read-vs-write discipline.
 */

const TOOLS = getToolsFor({ role: "admin" } as never);
const BY_NAME = new Map<string, AssistantTool>(TOOLS.map((t) => [t.name, t]));

function operationEnum(tool: AssistantTool): string[] {
  const s = tool.inputSchema as { properties?: { operation?: { enum?: string[] } } };
  return s.properties?.operation?.enum ?? [];
}

describe("fleet structural eval — cases match the real tool registry", () => {
  it.each(ASSISTANT_FLEET)("$utterance → $tool", (fc) => {
    const tool = BY_NAME.get(fc.tool);
    expect(tool, `fleet case references unknown tool "${fc.tool}"`).toBeDefined();
    expect(tool!.kind, `"${fc.tool}" is not a ${fc.kind} tool`).toBe(fc.kind);
    if (fc.op) {
      expect(operationEnum(tool!), `"${fc.tool}" has no operation "${fc.op}" in its schema`).toContain(fc.op);
    }
  });
});

// ── GATED LLM eval (opt-in; costs tokens). ASSISTANT_EVAL=1 + ANTHROPIC_API_KEY. ──
const LLM_ENABLED = process.env.ASSISTANT_EVAL === "1" && !!process.env.ANTHROPIC_API_KEY;
const EVAL_MODEL = process.env.ASSISTANT_EVAL_MODEL || "claude-haiku-4-5-20251001";

describe.skipIf(!LLM_ENABLED)("fleet LLM eval — right tool + operation with the full tool set", () => {
  const anthropicTools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

  it.each(ASSISTANT_FLEET)("$utterance → $tool", async (fc) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: EVAL_MODEL,
        max_tokens: 1024,
        system:
          "You are a winery production assistant. Use exactly one tool to fulfill the user's request. " +
          "A request to RECORD/ADD a concrete dose is a write action; a request to CALCULATE how much to " +
          "add is a read calculation. Refer to vessels/blocks by the plain labels the user gives.",
        tools: anthropicTools,
        tool_choice: { type: "any" },
        messages: [{ role: "user", content: fc.utterance }],
      }),
    });
    expect(res.ok, `Anthropic API ${res.status}`).toBe(true);
    const data = (await res.json()) as { content: Array<{ type: string; name?: string; input?: Record<string, unknown> }> };
    const toolUse = data.content.find((b) => b.type === "tool_use");
    expect(toolUse, "model did not call a tool").toBeDefined();
    // Right tool (discrimination among the full set) + read-vs-write discipline (kind is a property of the tool).
    expect(toolUse!.name).toBe(fc.tool);
    expect(BY_NAME.get(toolUse!.name!)?.kind).toBe(fc.kind);
    // Right operation within a multi-op tool (e.g. calc_so2's planner vs kmbs vs molecular).
    if (fc.op) expect(toolUse!.input?.operation).toBe(fc.op);
  }, 30_000);
});
