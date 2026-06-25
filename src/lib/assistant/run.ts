import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AppUser } from "@/lib/access";
import { getToolsFor } from "./registry";
import { SYSTEM_PROMPT } from "./prompt";

// Repo standard (matches src/lib/fieldnotes/ai.ts): claude-opus-4-8. This is the
// agentic tool-use loop, NOT the single-shot output_config call in ai.ts.
const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 8192;
const MAX_TURNS = 8; // hard cap — never loop unbounded on a server route

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Newline-delimited events the route streams to the client. */
export type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; phase: "start" | "end"; ok?: boolean }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * Run the multi-turn tool-use loop and push events to `send` as they happen.
 * Follows the claude-api manual loop rules: append the FULL assistant content
 * (keeps tool_use blocks), return ALL tool_result blocks in a SINGLE user
 * message, loop until end_turn, cap turns, surface tool failures as is_error.
 */
export async function runAssistant(opts: {
  user: AppUser;
  messages: ChatMessage[];
  send: (e: AssistantEvent) => void;
}): Promise<void> {
  const { user, messages, send } = opts;

  if (!process.env.ANTHROPIC_API_KEY) {
    send({ type: "error", message: "The assistant is not configured (missing API key)." });
    send({ type: "done" });
    return;
  }

  const tools = getToolsFor(user);
  const toolDefs = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  })) as Anthropic.Tool[];

  const convo: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const client = new Anthropic();

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: toolDefs,
        messages: convo,
      });
      stream.on("text", (delta) => send({ type: "text", text: delta }));
      const msg = await stream.finalMessage();

      if (msg.stop_reason === "tool_use") {
        // Preserve the assistant turn INCLUDING tool_use blocks.
        convo.push({ role: "assistant", content: msg.content });

        const toolUses = msg.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          send({ type: "tool", name: tu.name, phase: "start" });
          try {
            const tool = tools.find((t) => t.name === tu.name);
            if (!tool) throw new Error(`Unknown tool: ${tu.name}`);
            const out = await tool.run({ user }, tu.input);
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: typeof out === "string" ? out : JSON.stringify(out),
            });
            send({ type: "tool", name: tu.name, phase: "end", ok: true });
          } catch (e) {
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: e instanceof Error ? e.message : "Tool failed.",
              is_error: true,
            });
            send({ type: "tool", name: tu.name, phase: "end", ok: false });
          }
        }
        convo.push({ role: "user", content: results });
        continue;
      }

      if (msg.stop_reason === "pause_turn") {
        // Server-side tool hit its internal cap; resend to resume.
        convo.push({ role: "assistant", content: msg.content });
        continue;
      }

      if (msg.stop_reason === "refusal") {
        send({ type: "error", message: "I can't help with that request." });
        break;
      }

      // end_turn or max_tokens — text already streamed via on("text").
      break;
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      send({ type: "error", message: "The assistant is busy right now. Try again in a moment." });
    } else {
      send({ type: "error", message: e instanceof Error ? e.message : "Assistant error." });
    }
  } finally {
    send({ type: "done" });
  }
}
