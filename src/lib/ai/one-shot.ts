import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Plan 072 Unit 4: the factored non-streaming, structured-output `messages.create` helper. The model
// literal `claude-opus-4-8` + the json_schema output pattern + the missing-key guard were copy-pasted in
// fieldnotes/ai.ts, run.ts, and compliance/llm.ts with no shared home; this is that home for new code.
// Confirmed via the claude-api skill: default to claude-opus-4-8 — do NOT downgrade without an explicit
// instruction. A single structured call (not a conversation), so a bounded max_tokens keeps it inside the
// route ceiling.

export const ONE_SHOT_MODEL = "claude-opus-4-8";

export class OneShotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OneShotError";
  }
}

/**
 * One structured (json_schema) model call. Returns the parsed JSON object (typed by the caller). `content`
 * is either a plain string or an array of content blocks (text + document/image) — so a document/image
 * extraction and a text summarization share this path. Throws `OneShotError` on a missing key, an empty
 * response, or malformed JSON; the caller decides how to surface it (e.g. a per-doc error state).
 */
export async function oneShotJson<T = unknown>(opts: {
  system: string;
  content: string | Anthropic.ContentBlockParam[];
  /**
   * Optional JSON Schema for `output_config` grammar enforcement. OMIT it for field-heavy shapes: Anthropic's
   * json_schema grammar has hard complexity limits (union count, optional-param count, "too complex"), so a
   * large extraction schema is rejected. Without it the model is prompted to return JSON and the caller
   * validates (defensively) — the reliable path for big shapes.
   */
  schema?: Record<string, unknown>;
  maxTokens?: number;
  model?: string;
}): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new OneShotError("ANTHROPIC_API_KEY is not configured.");
  }
  const client = new Anthropic();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: opts.model ?? ONE_SHOT_MODEL,
      max_tokens: opts.maxTokens ?? 8192,
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
      ...(opts.schema ? { output_config: { format: { type: "json_schema", schema: opts.schema } } } : {}),
    });
  } catch (e) {
    throw new OneShotError(e instanceof Error ? e.message : "Model request failed.");
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new OneShotError("Model returned an empty response.");
  // Strip a markdown code fence if the model wrapped the JSON (only happens without grammar enforcement).
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new OneShotError("Model returned malformed JSON.");
  }
}
