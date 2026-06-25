import "server-only";

// Central read of the voice-mode secrets/config. Voice reuses the ElevenLabs key
// from the user's other project (`horseplay`) — copy ELEVENLABS_API_KEY into this
// project's .env. Speech-to-text reuses the existing OPENAI_API_KEY. Everything
// here is server-only; no secret is ever exposed to the client.

// Reference values carried over from horseplay's lib/ai/elevenlabs.ts. The model
// defaults to a low-latency turbo build for the Jarvis "talks back fast" feel;
// override per-deploy via env without touching code.
const DEFAULT_VOICE_ID = "Cb8NLd0sUB8jI4MW2f9M";
const DEFAULT_MODEL_ID = "eleven_turbo_v2_5";
const DEFAULT_STABILITY = 0.5;
const DEFAULT_SIMILARITY = 0.75;

export type VoiceConfig = {
  apiKey: string;
  voiceId: string;
  modelId: string;
  stability: number;
  similarityBoost: number;
};

function num(envValue: string | undefined, fallback: number): number {
  if (envValue === undefined || envValue.trim() === "") return fallback;
  const n = Number(envValue);
  return Number.isFinite(n) ? n : fallback;
}

/** True when text-to-speech is configured (the ElevenLabs key is present). */
export function ttsEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/** True when speech-to-text is configured (reuses the OpenAI key). */
export function sttEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** True when the full hands-free voice loop can run (both directions configured). */
export function voiceEnabled(): boolean {
  return ttsEnabled() && sttEnabled();
}

/**
 * Resolve the ElevenLabs voice config. Throws if the key is missing — callers
 * gate on `ttsEnabled()` first and return a clean 503 rather than reaching here.
 */
export function getVoiceConfig(): VoiceConfig {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set; voice output is unavailable.");
  return {
    apiKey,
    voiceId: process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID,
    modelId: process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID,
    stability: num(process.env.ELEVENLABS_STABILITY, DEFAULT_STABILITY),
    similarityBoost: num(process.env.ELEVENLABS_SIMILARITY_BOOST, DEFAULT_SIMILARITY),
  };
}
