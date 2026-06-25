import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Cheap, fast model for the one-shot title call — we only need a few tokens and
// don't want to spend Opus on it. (Matches the repo's model-id style in run.ts.)
const TITLE_MODEL = "claude-haiku-4-5";
const TITLE_MAX_TOKENS = 24;
const MAX_TITLE_LEN = 60;

/**
 * Derive a deterministic title from the first user message, with no model call.
 * Used as the fallback when the LLM title is unavailable or fails. Collapses
 * whitespace, truncates on a word boundary at ~60 chars, and appends an ellipsis.
 */
export function fallbackTitle(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) return "New conversation";
  if (clean.length <= MAX_TITLE_LEN) return clean;
  const slice = clean.slice(0, MAX_TITLE_LEN);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > 20 ? slice.slice(0, lastSpace) : slice;
  return `${base.trimEnd()}…`;
}

/** Strip surrounding quotes and trailing punctuation the model sometimes adds. */
function tidyTitle(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/[.。]+$/, "")
    .trim();
}

/**
 * Generate a short (4-6 word) conversation title from the user's first message.
 * Falls back to a truncated version of the message on any failure (missing key,
 * API error, empty output) so conversation creation never blocks on titling.
 */
export async function generateTitle(firstUserMessage: string): Promise<string> {
  const fallback = fallbackTitle(firstUserMessage);
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: TITLE_MODEL,
      max_tokens: TITLE_MAX_TOKENS,
      system:
        "You write short titles for chat conversations. Given the user's first message, " +
        "reply with a 4-6 word title summarizing the topic. No quotes, no trailing punctuation, " +
        "no preamble — just the title.",
      messages: [{ role: "user", content: firstUserMessage.slice(0, 2000) }],
    });

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ");
    const title = tidyTitle(text);
    if (!title) return fallback;
    return title.length > MAX_TITLE_LEN ? fallbackTitle(title) : title;
  } catch {
    return fallback;
  }
}
