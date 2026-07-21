import "server-only";
import { getVoiceConfig } from "./config";

// Raw fetch to the ElevenLabs streaming TTS endpoint — no SDK, matching the
// codebase's zero-extra-dep instinct (and horseplay's lib/ai/elevenlabs.ts). We
// proxy the upstream audio/mpeg body straight through our route so the key never
// leaves the server and the client gets first audio as soon as ElevenLabs emits.

const ELEVEN_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";

/**
 * Synthesize `text` to speech and return the streaming MP3 body from ElevenLabs.
 * Caller is responsible for piping/returning the stream. Throws on a non-2xx
 * upstream response (the route maps that to a clean error for the client).
 */
export async function synthesizeStream(text: string): Promise<ReadableStream<Uint8Array>> {
  const cfg = getVoiceConfig();

  const res = await fetch(`${ELEVEN_TTS_URL}/${cfg.voiceId}/stream`, {
    method: "POST",
    headers: {
      "xi-api-key": cfg.apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: cfg.modelId,
      voice_settings: {
        stability: cfg.stability,
        similarity_boost: cfg.similarityBoost,
        style: cfg.style,
        use_speaker_boost: cfg.useSpeakerBoost,
      },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${res.status}). ${detail.slice(0, 200)}`);
  }

  return res.body;
}
