import { describe, it, expect } from "vitest";
import { getToolsFor, type AssistantTool } from "@/lib/assistant/registry";
import { ASSISTANT_WRITE_GOLDEN } from "./assistant-write-tools.golden";
import { ASSISTANT_READ_GOLDEN } from "./assistant-read-tools.golden";

/**
 * H8 / D26 — the assistant eval harness, seeded over the shipped write tools. Two layers:
 *
 *  • DEFAULT (this runs in normal `vitest run` / CI): a DETERMINISTIC, zero-cost structural eval — every
 *    golden case is validated against the REAL tool registry (drift-proof: it reads the actual
 *    inputSchema, not a copy). It catches the common regressions a per-diff review misses: a golden that
 *    names a renamed/removed tool, an arg key the schema no longer accepts, a missing required field, a
 *    wrong primitive type — and, via the coverage guard, a NEW write tool shipped without any eval.
 *
 *  • GATED (ASSISTANT_EVAL=1 + ANTHROPIC_API_KEY): the LLM-in-the-loop eval — feeds each utterance to the
 *    model with the SAME tool schemas the assistant passes, and asserts it selects the expected tool.
 *    Off by default (costs tokens, non-deterministic); run it with `npm run eval:assistant` before
 *    shipping a change to the tools, prompt, or model. See package.json.
 */

// role:"admin" so the full tool set (incl. adminOnly) is visible.
const TOOLS = getToolsFor({ role: "admin" } as never);
const BY_NAME = new Map<string, AssistantTool>(TOOLS.map((t) => [t.name, t]));
const WRITE_TOOL_NAMES = TOOLS.filter((t) => t.kind === "write").map((t) => t.name);
const REQUIRED_READ_TOOL_NAMES = ["query_cellar_contents"];

// Write tools intentionally NOT covered by a golden case (yet), with the reason. A NEW write tool that
// is neither covered nor listed here fails the coverage guard — that's the D26 "governed from day one"
// teeth: you cannot ship an AI write surface without deciding its eval story.
const UNCOVERED_OK: Record<string, string> = {
  db_create: "generic CRUD catch-all — cover per concrete entity as those flows firm up",
  db_update: "generic CRUD catch-all",
  db_delete: "generic CRUD catch-all",
  save_field_report: "large structured form payload — evaluate via the field-report form flow, not a one-liner",
  ingest_documents: "args are client-injected uploaded-blob references (not NL-derivable); the extraction + per-line review is exercised end-to-end by verify:ingest + the Unit 12 acceptance suite, not a one-liner utterance",
};

function schemaOf(tool: AssistantTool): { props: Record<string, { type?: string }>; required: string[] } {
  const s = tool.inputSchema as { properties?: Record<string, { type?: string }>; required?: string[] };
  return { props: s.properties ?? {}, required: s.required ?? [] };
}

function typeMatches(schemaType: string | undefined, val: unknown): boolean {
  switch (schemaType) {
    case "string":
      return typeof val === "string";
    case "number":
      return typeof val === "number";
    case "integer":
      return typeof val === "number" && Number.isInteger(val);
    case "boolean":
      return typeof val === "boolean";
    default:
      return true; // array/object/unknown — not asserted at this layer
  }
}

describe("H8 structural eval — golden cases match the real tool registry", () => {
  it.each(ASSISTANT_WRITE_GOLDEN)("$utterance → $tool", (gc) => {
    const tool = BY_NAME.get(gc.tool);
    expect(tool, `golden references unknown tool "${gc.tool}"`).toBeDefined();
    expect(tool!.kind, `"${gc.tool}" is not a write tool`).toBe("write");

    const { props, required } = schemaOf(tool!);
    // Every arg key the golden expects must be a real property of the tool's schema.
    for (const key of Object.keys(gc.args)) {
      expect(props[key], `"${gc.tool}" has no input property "${key}"`).toBeDefined();
      expect(
        typeMatches(props[key]?.type, gc.args[key]),
        `"${gc.tool}".${key} expected ${props[key]?.type}, got ${typeof gc.args[key]}`,
      ).toBe(true);
    }
    // Every required field of the tool must be present in the golden args.
    for (const req of required) {
      expect(Object.keys(gc.args), `"${gc.tool}" requires "${req}"`).toContain(req);
    }
  });

  it.each(ASSISTANT_READ_GOLDEN)("$utterance -> $tool", (gc) => {
    const tool = BY_NAME.get(gc.tool);
    expect(tool, `golden references unknown tool "${gc.tool}"`).toBeDefined();
    expect(tool!.kind, `"${gc.tool}" is not a read tool`).toBe("read");

    const { props, required } = schemaOf(tool!);
    for (const key of Object.keys(gc.args)) {
      expect(props[key], `"${gc.tool}" has no input property "${key}"`).toBeDefined();
      expect(
        typeMatches(props[key]?.type, gc.args[key]),
        `"${gc.tool}".${key} expected ${props[key]?.type}, got ${typeof gc.args[key]}`,
      ).toBe(true);
    }
    for (const req of required) {
      expect(Object.keys(gc.args), `"${gc.tool}" requires "${req}"`).toContain(req);
    }
  });

  it("every write tool is either covered by a golden case or explicitly allow-listed (D26 coverage guard)", () => {
    const covered = new Set(ASSISTANT_WRITE_GOLDEN.map((g) => g.tool));
    const ungoverned = WRITE_TOOL_NAMES.filter((n) => !covered.has(n) && !(n in UNCOVERED_OK));
    expect(
      ungoverned,
      `write tool(s) with no golden case and not in UNCOVERED_OK — add a case to assistant-write-tools.golden.ts: ${ungoverned.join(", ")}`,
    ).toEqual([]);
  });

  it("UNCOVERED_OK does not list stale/nonexistent write tools", () => {
    const stale = Object.keys(UNCOVERED_OK).filter((n) => !WRITE_TOOL_NAMES.includes(n));
    expect(stale, `UNCOVERED_OK names non-write/removed tools: ${stale.join(", ")}`).toEqual([]);
  });

  it("required read tools are covered by a golden case", () => {
    const covered = new Set(ASSISTANT_READ_GOLDEN.map((g) => g.tool));
    const missing = REQUIRED_READ_TOOL_NAMES.filter((name) => !covered.has(name));
    expect(missing, `read tool(s) with no golden case: ${missing.join(", ")}`).toEqual([]);
  });
});

// ── GATED LLM-in-the-loop eval (opt-in; costs tokens). Runs only with ASSISTANT_EVAL=1. ──
const LLM_ENABLED = process.env.ASSISTANT_EVAL === "1" && !!process.env.ANTHROPIC_API_KEY;
const EVAL_MODEL = process.env.ASSISTANT_EVAL_MODEL || "claude-haiku-4-5-20251001";

describe.skipIf(!LLM_ENABLED)("H8 LLM eval — the model selects the expected tool", () => {
  // Minimal, self-contained: we exercise TOOL SELECTION against the real schemas, not the full assistant
  // run loop. The schemas passed here are exactly what the assistant sends the model. Dependency-free
  // (raw fetch), so the eval needs no SDK.
  const anthropicTools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

  it.each(ASSISTANT_WRITE_GOLDEN)("$utterance → $tool", async (gc) => {
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
          "Refer to vessels/blocks by the plain labels the user gives.",
        tools: anthropicTools,
        tool_choice: { type: "any" },
        messages: [{ role: "user", content: gc.utterance }],
      }),
    });
    expect(res.ok, `Anthropic API ${res.status}`).toBe(true);
    const data = (await res.json()) as { content: Array<{ type: string; name?: string; input?: Record<string, unknown> }> };
    const toolUse = data.content.find((b) => b.type === "tool_use");
    expect(toolUse, "model did not call a tool").toBeDefined();
    expect(toolUse!.name).toBe(gc.tool);
    // Required fields should be present in the model's args (values may legitimately vary).
    const { required } = schemaOf(BY_NAME.get(gc.tool)!);
    for (const req of required) expect(Object.keys(toolUse!.input ?? {})).toContain(req);
  }, 30_000);
});
