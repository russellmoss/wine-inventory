import "server-only";

// Central read of the voice-mode secrets/config. Voice reuses the ElevenLabs key
// from the user's other project (`horseplay`) — copy ELEVENLABS_API_KEY into this
// project's .env. Speech-to-text reuses the existing OPENAI_API_KEY. Everything
// here is server-only; no secret is ever exposed to the client.

// Tuned for a real-time conversational assistant: the product-chosen voice on the
// low-latency flash build, so the assistant starts talking back fast enough to feel
// like a conversation rather than a render. Every value is env-overridable per
// deploy without touching code (see .env.example).
const DEFAULT_VOICE_ID = "UgBBYS2sOqTuMpoF3BR0";
const DEFAULT_MODEL_ID = "eleven_flash_v2_5";
const DEFAULT_STABILITY = 0.45;
const DEFAULT_SIMILARITY = 0.75;
// style 0 keeps delivery neutral (style > 0 adds latency and can over-emote on
// short operational replies); speaker boost sharpens the voice's identity.
const DEFAULT_STYLE = 0.0;
const DEFAULT_SPEAKER_BOOST = true;

export type VoiceConfig = {
  apiKey: string;
  voiceId: string;
  modelId: string;
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
};

function num(envValue: string | undefined, fallback: number): number {
  if (envValue === undefined || envValue.trim() === "") return fallback;
  const n = Number(envValue);
  return Number.isFinite(n) ? n : fallback;
}

function bool(envValue: string | undefined, fallback: boolean): boolean {
  if (envValue === undefined || envValue.trim() === "") return fallback;
  const v = envValue.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return fallback;
}

/** True when text-to-speech is configured (the ElevenLabs key is present). */
export function ttsEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/** True when speech-to-text is configured (ElevenLabs Scribe — same key as TTS). */
export function sttEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/**
 * True when the full hands-free voice loop can run. Both directions (TTS + STT)
 * now use ElevenLabs, so a single ELEVENLABS_API_KEY enables everything.
 */
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
    style: num(process.env.ELEVENLABS_STYLE, DEFAULT_STYLE),
    useSpeakerBoost: bool(process.env.ELEVENLABS_SPEAKER_BOOST, DEFAULT_SPEAKER_BOOST),
  };
}
