import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AppUser } from "@/lib/access";
import { getToolsFor } from "./registry";
import { buildSystemPrompt, VOICE_STYLE_PROMPT } from "./prompt";
import { listOpenClarificationsForUser } from "@/lib/feedback/clarification";
import { claimsWriteWithoutCard, OVERCLAIM_CORRECTION, OVERCLAIM_REPAIR_PROMPT } from "./overclaim-guard";
import { type AssistantEvent, asProposal, asChoice, asNavigation, isDraftProposal } from "./assistant-events";
import { logCalculation } from "@/lib/winemaking-calc/log";
import { isCalcToolResult, buildAssistantLogPayload } from "./tools/calc-shared";
import {
  newAssistantTrace,
  previewTraceValue,
  pushToolTrace,
  type AssistantTrace,
} from "./trace";

// Repo standard (matches src/lib/fieldnotes/ai.ts): claude-opus-4-8. This is the
// agentic tool-use loop, NOT the single-shot output_config call in ai.ts.
const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 8192;
const MAX_TURNS = 8; // hard cap — never loop unbounded on a server route

/** Content may be a plain string OR Anthropic content blocks — a replayed turn carries tool_use /
 *  tool_result blocks so prior tool calls stay visible to the model (plan 083, src/lib/assistant/replay.ts). */
export type ChatMessage = { role: "user" | "assistant"; content: string | unknown[] };
export type AssistantRunResult = { text: string; trace: AssistantTrace };

/**
 * The slice of the Anthropic streaming helper this loop actually uses. Narrowing it to an interface
 * is what makes the loop testable: `runAssistant` constructed its client inline, so there was no seam
 * and the loop had ZERO tests (plan 081 U3). Production still uses the real SDK — the factory below
 * defaults to it, so behavior is unchanged.
 */
export type AssistantStream = {
  on(event: "text", handler: (delta: string) => void): unknown;
  finalMessage(): Promise<Anthropic.Message>;
};

export type AssistantStreamFactory = (params: Anthropic.MessageStreamParams) => AssistantStream;

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
  /** Hands-free voice turn: append the spoken-reply style block (see VOICE_STYLE_PROMPT).
   *  Omitted for text chat and for the golden evals, which keep the markdown-rendering brain. */
  voice?: boolean;
  /** Test seam. Omitted in production, where it defaults to the real Anthropic SDK stream. */
  createStream?: AssistantStreamFactory;
}): Promise<AssistantRunResult> {
  const { user, messages, send } = opts;

  // Accumulate everything streamed to the user so the caller can persist the
  // assistant turn. Mirrors what the UI renders (all text deltas concatenated).
  let assistantText = "";
  // A confirmation card exists ONLY when a write tool actually emitted a proposal this run. We track that
  // to deterministically catch the model over-claiming a write (feedback cmri7ympe: it said a bug report was
  // "Done — review the card" without ever calling file_feedback, so nothing was filed).
  let emittedProposal = false;
  let repairAttempted = false;
  const emit = (e: AssistantEvent) => {
    if (e.type === "text") assistantText += e.text;
    if (e.type === "proposal") emittedProposal = true;
    send(e);
  };

  const tools = getToolsFor(user);
  const toolDefs = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  })) as Anthropic.Tool[];

  const convo: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content as Anthropic.MessageParam["content"],
  }));

  // Server-side signal for the navigate tool's auto-vs-link decision: what did
  // the user actually just say? (Never trust the model to self-report intent.)
  // A replayed user turn can carry tool_result blocks alongside its text, so pull the text out
  // rather than handing the navigate tool an array.
  const lastUserRaw = [...messages].reverse().find((m) => m.role === "user")?.content;
  const lastUserMessage =
    typeof lastUserRaw === "string"
      ? lastUserRaw
      : Array.isArray(lastUserRaw)
        ? (lastUserRaw.find((b) => (b as { type?: string })?.type === "text") as { text?: string } | undefined)?.text
        : undefined;

  // Lazily construct the real client so a test-supplied factory never needs an API key.
  let client: Anthropic | null = null;
  const createStream: AssistantStreamFactory =
    opts.createStream ?? ((params) => (client ??= new Anthropic()).messages.stream(params));
  let system = buildSystemPrompt();
  // Voice turns get an extra style block so spoken replies are conversational instead of
  // screen-shaped (no markdown, no read-aloud citations, units as words). Text chat and the
  // golden evals never set this, so their behaviour is byte-identical to before.
  if (opts.voice) system += `\n\n${VOICE_STYLE_PROMPT}`;

  // Plan 079 (U12): if engineering asked this user for a detail on a bug they reported, surface it —
  // the inbox has no push notification, so the assistant is where they're most likely to notice.
  // Best-effort; a feedback read must never break the assistant.
  try {
    const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
    if (tenantId) {
      const open = await listOpenClarificationsForUser(tenantId, user.id);
      if (open.length) {
        const c = open[0];
        const qs = c.questions.split("\n").filter(Boolean).map((q) => `- ${q}`).join("\n");
        system +=
          `\n\n<open_bug_clarification>\nEngineering asked this user for one detail on a bug they reported (ref ${c.ref}). ` +
          `If it fits naturally, proactively let them know and relay the question(s) verbatim:\n${qs}\n` +
          `They can reply in their inbox (the "Cellarhand Support" message thread) and it goes straight to engineering. ` +
          `Do NOT invent an answer or any detail — only relay this and encourage them to respond.\n</open_bug_clarification>`;
      }
    }
  } catch {
    /* non-fatal */
  }

  const trace = newAssistantTrace({
    model: MODEL,
    maxTurns: MAX_TURNS,
    systemPrompt: system,
    toolNames: tools.map((t) => t.name),
  });

  // An injected factory supplies its own transport, so the key requirement only applies to the real SDK.
  if (!opts.createStream && !process.env.ANTHROPIC_API_KEY) {
    emit({ type: "error", message: "The assistant is not configured (missing API key)." });
    emit({ type: "done" });
    trace.stopReason = "missing_api_key";
    return { text: assistantText, trace };
  }

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      trace.turns = turn + 1;
      const stream = createStream({
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
          const toolTrace = { id: tu.id, name: tu.name, input: tu.input };
          try {
            const tool = tools.find((t) => t.name === tu.name);
            if (!tool) throw new Error(`Unknown tool: ${tu.name}`);
            const out = await tool.run({ user, lastUserMessage }, tu.input);

            const proposal = tool.kind === "write" ? asProposal(out) : null;
            if (proposal) {
              // Don't commit. Surface a confirm card to the user; tell the model
              // to stop and await the out-of-band confirmation.
              const draft = isDraftProposal(proposal);
              emit({
                type: "proposal",
                tool: tu.name,
                preview: proposal.preview,
                // A Draft carries NO token (asProposal strips one if a tool tried). Never spread it in.
                ...(draft ? { draft: true as const } : { token: proposal.token }),
                details: proposal.details,
              });
              results.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: draft
                  ? `A DRAFT card was shown to the user: "${proposal.preview}" It already lists, on the card itself, every field that is unresolved and every blocker. Do not call this tool again and do NOT repeat the list in prose — briefly tell the user the draft card is on screen and ask for what it still needs.`
                  : `A confirmation card was shown to the user: "${proposal.preview}" Do not call this tool again. Briefly ask the user to review and confirm it.`,
              });
              emit({ type: "tool", name: tu.name, phase: "end", ok: true });
              pushToolTrace(trace, {
                ...toolTrace,
                ok: true,
                resultKind: draft ? "draft_proposal" : "proposal",
                resultPreview: proposal.preview,
              });
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
              pushToolTrace(trace, {
                ...toolTrace,
                ok: true,
                resultKind: "choice",
                resultPreview: choice.prompt,
              });
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
              pushToolTrace(trace, {
                ...toolTrace,
                ok: true,
                resultKind: "navigation",
                resultPreview: `${nav.label} (${nav.path})`,
              });
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
            pushToolTrace(trace, {
              ...toolTrace,
              ok: true,
              resultKind: typeof out === "string" ? "text" : "json",
              resultPreview: previewTraceValue(out),
            });
          } catch (e) {
            const message = e instanceof Error ? e.message : "Tool failed.";
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: message,
              is_error: true,
            });
            emit({ type: "tool", name: tu.name, phase: "end", ok: false });
            pushToolTrace(trace, {
              ...toolTrace,
              ok: false,
              resultKind: "error",
              resultPreview: message,
            });
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
        trace.stopReason = "refusal";
        break;
      }

      // Over-claim REPAIR (plan 083 Unit 5). The model just ended its turn claiming a card exists
      // while calling nothing — the user asked for a write and would get prose. Rather than only
      // apologising afterwards, give it exactly one chance to actually perform the action.
      //
      // Done as another pass of THIS loop rather than a separate request: it inherits MAX_TURNS, the
      // existing trace, and the same stream plumbing, so there is no second code path to keep in sync.
      // Bounded to one attempt — a model that ignores the instruction once will ignore it twice, and
      // the user is already waiting.
      if (
        !emittedProposal &&
        !repairAttempted &&
        msg.stop_reason === "end_turn" &&
        claimsWriteWithoutCard(assistantText)
      ) {
        repairAttempted = true;
        trace.overclaimRepair = "attempted";
        convo.push({ role: "assistant", content: msg.content });
        convo.push({ role: "user", content: OVERCLAIM_REPAIR_PROMPT });
        continue;
      }

      // end_turn or max_tokens — text already streamed via on("text").
      trace.stopReason = msg.stop_reason ?? "end_turn";
      break;
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      emit({ type: "error", message: "The assistant is busy right now. Try again in a moment." });
      trace.stopReason = "rate_limit";
    } else {
      emit({ type: "error", message: e instanceof Error ? e.message : "Assistant error." });
      trace.stopReason = "error";
    }
  } finally {
    // Deterministic backstop: if the model told the user a card exists / a write was done, but NO write tool
    // emitted a proposal this run, the claim is false — correct it so the user isn't silently misled into
    // thinking something was filed/changed (feedback cmri7ympe). The prompt rule alone is stochastic.
    if (!emittedProposal && claimsWriteWithoutCard(assistantText)) {
      // Reached only when the repair turn also failed to produce a card (or never ran, e.g. the run
      // errored out). The user is told plainly that nothing was saved — never worse off than before.
      if (repairAttempted) trace.overclaimRepair = "failed";
      emit({ type: "text", text: OVERCLAIM_CORRECTION });
    } else if (repairAttempted) {
      trace.overclaimRepair = "recovered";
    }
    emit({ type: "done" });
  }

  return { text: assistantText, trace };
}
