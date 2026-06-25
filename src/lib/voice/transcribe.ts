import "server-only";

// Speech-to-text via ElevenLabs "Scribe", raw fetch (no SDK). Reuses the same
// ELEVENLABS_API_KEY as TTS, so voice mode needs exactly one vendor/key. (Claude
// has no audio transcription API, so the Anthropic key can't do this; ElevenLabs
// Scribe keeps us to a single key instead of also requiring OpenAI Whisper.)

const ELEVEN_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const DEFAULT_STT_MODEL = "scribe_v1";

/** True when transcription is configured. */
export function transcribeEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/**
 * Transcribe a recorded audio blob to text. Throws if the key is missing (the
 * route gates on transcribeEnabled() first) or on a non-2xx upstream response.
 * Language is auto-detected by Scribe.
 */
export async function transcribeAudio(audio: Blob, filename = "speech.webm"): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set; transcription is unavailable.");

  const model = process.env.ELEVENLABS_STT_MODEL || DEFAULT_STT_MODEL;
  // Pin the language (ISO-639-3, default English). Letting Scribe auto-detect made
  // it "hear" other languages on near-silence/room noise and hallucinate junk
  // transcripts (e.g. Korean "뭐야?") that then got sent to the assistant.
  const language = process.env.ELEVENLABS_STT_LANGUAGE || "eng";

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model_id", model);
  form.append("language_code", language);
  // Don't transcribe non-speech as "(laughter)" etc. — we only want words.
  form.append("tag_audio_events", "false");

  const res = await fetch(ELEVEN_STT_URL, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs STT failed (${res.status}). ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: unknown };
  return typeof data.text === "string" ? data.text.trim() : "";
}
