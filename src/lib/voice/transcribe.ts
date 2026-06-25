import "server-only";

// Speech-to-text via OpenAI's audio transcription endpoint, raw fetch (no SDK).
// Reuses the existing OPENAI_API_KEY. A domain prompt biases the model toward
// the cellar vocabulary it would otherwise mangle (varietals, "Brix", block
// labels) — that bias is exactly why we picked server-side STT over the browser.

const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_MODEL = "gpt-4o-transcribe";

// Short hint string passed as `prompt`. Not a transcript — just vocabulary the
// model should expect, which measurably improves recognition of these terms.
const DOMAIN_HINT =
  "Wine cellar and vineyard context. Likely terms: Brix, varietal, vintage, " +
  "block, vineyard, Riesling, Chardonnay, Cabernet, Pinot Noir, Merlot, " +
  "yield, harvest, ton, tonnage, bottle, case, barrel.";

/** True when transcription is configured. */
export function transcribeEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Transcribe a recorded audio blob to text. Throws if the key is missing (the
 * route gates on transcribeEnabled() first) or on a non-2xx upstream response.
 */
export async function transcribeAudio(audio: Blob, filename = "speech.webm"): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set; transcription is unavailable.");

  const model = process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_MODEL;

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", model);
  form.append("prompt", DOMAIN_HINT);
  form.append("language", "en");
  form.append("response_format", "json");

  const res = await fetch(OPENAI_TRANSCRIBE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI transcription failed (${res.status}). ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: unknown };
  return typeof data.text === "string" ? data.text.trim() : "";
}
