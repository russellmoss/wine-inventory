import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AppUser } from "@/lib/access";
import { getToolsFor } from "./registry";
import { buildSystemPrompt } from "./prompt";
import { type AssistantEvent, asProposal, asChoice, asNavigation } from "./assistant-events";
import { logCalculation } from "@/lib/winemaking-calc/log";
import { isCalcToolResult, buildAssistantLogPayload } from "./tools/calc-shared";

// Repo standard (matches src/lib/fieldnotes/ai.ts): claude-opus-4-8. This is the
// agentic tool-use loop, NOT the single-shot output_config call in ai.ts.
const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 8192;
const MAX_TURNS = 8; // hard cap — never loop unbounded on a server route

export type ChatMessage = { role: "user" | "assistant"; content: string };

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
}): Promise<string> {
  const { user, messages, send } = opts;

  // Accumulate everything streamed to the user so the caller can persist the
  // assistant turn. Mirrors what the UI renders (all text deltas concatenated).
  let assistantText = "";
  const emit = (e: AssistantEvent) => {
    if (e.type === "text") assistantText += e.text;
    send(e);
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    emit({ type: "error", message: "The assistant is not configured (missing API key)." });
    emit({ type: "done" });
    return assistantText;
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

  // Server-side signal for the navigate tool's auto-vs-link decision: what did
  // the user actually just say? (Never trust the model to self-report intent.)
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content;

  const client = new Anthropic();
  const system = buildSystemPrompt();

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools: toolDefs,
        messages: convo,
      });
      stream.on("text", (delta) => emit({ type: "text", text: delta }));
      const msg = await stream.finalMessage();

      if (msg.stop_reason === "tool_use") {
        // Preserve the assistant turn INCLUDING tool_use blocks.
        convo.push({ role: "assistant", content: msg.content });

        const toolUses = msg.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          emit({ type: "tool", name: tu.name, phase: "start" });
          try {
            const tool = tools.find((t) => t.name === tu.name);
            if (!tool) throw new Error(`Unknown tool: ${tu.name}`);
            const out = await tool.run({ user, lastUserMessage }, tu.input);

            const proposal = tool.kind === "write" ? asProposal(out) : null;
            if (proposal) {
              // Don't commit. Surface a confirm card to the user; tell the model
              // to stop and await the out-of-band confirmation.
              emit({ type: "proposal", tool: tu.name, preview: proposal.preview, token: proposal.token });
              results.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: `A confirmation card was shown to the user: "${proposal.preview}" Do not call this tool again. Briefly ask the user to review and confirm it.`,
              });
              emit({ type: "tool", name: tu.name, phase: "end", ok: true });
              continue;
            }

            // Disambiguation picker (any tool kind): the tool couldn't resolve a
            // name to ONE record, so it handed back clickable options. Surface them
            // and stop the model — the user's tap re-drives the tool, id-pinned.
            const choice = asChoice(out);
            if (choice) {
              emit({ type: "choice", tool: tu.name, prompt: choice.prompt, options: choice.options });
              results.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: `A picker was shown to the user with these options: ${choice.options
                  .map((o) => o.label)
                  .join("; ")}. Do not call this tool again; ask them to tap the one they mean.`,
              });
              emit({ type: "tool", name: tu.name, phase: "end", ok: true });
              continue;
            }

            // Navigation action (a UI side-effect, not a mutation): the tool
            // resolved + validated a target; hand it to the client to execute.
            // Mirrors the proposal flow — do not loop the model on it.
            const nav = asNavigation(out);
            if (nav) {
              emit({ type: "navigate", path: nav.path, label: nav.label, auto: nav.auto });
              results.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: nav.auto
                  ? `The app is taking the user to ${nav.label} (${nav.path}). Do not call navigate again; briefly tell them you're opening it.`
                  : `A link to ${nav.label} (${nav.path}) was shown to the user. Do not call navigate again; briefly point them to it.`,
              });
              emit({ type: "tool", name: tu.name, phase: "end", ok: true });
              continue;
            }

            // Post-tool-result logging hook (LOCKED #11): a successful calc-* read is audited HERE,
            // not in the tool (read tools stay PURE — they never touch Prisma). Best-effort: the
            // assistant request has no ALS tenant context, so logCalculation wraps in runAsTenant
            // itself and swallows any failure — a logging miss never breaks the chat answer.
            if (tu.name.startsWith("calc_") && isCalcToolResult(out)) {
              await logCalculation(buildAssistantLogPayload(user, out));
            }

            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: typeof out === "string" ? out : JSON.stringify(out),
            });
            emit({ type: "tool", name: tu.name, phase: "end", ok: true });
          } catch (e) {
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: e instanceof Error ? e.message : "Tool failed.",
              is_error: true,
            });
            emit({ type: "tool", name: tu.name, phase: "end", ok: false });
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
        emit({ type: "error", message: "I can't help with that request." });
        break;
      }

      // end_turn or max_tokens — text already streamed via on("text").
      break;
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      emit({ type: "error", message: "The assistant is busy right now. Try again in a moment." });
    } else {
      emit({ type: "error", message: e instanceof Error ? e.message : "Assistant error." });
    }
  } finally {
    emit({ type: "done" });
  }

  return assistantText;
}
