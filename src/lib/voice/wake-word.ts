export type WakeWordProvider = "none";

export type WakeWordCapability = {
  enabled: boolean;
  provider: WakeWordProvider;
  providerConfigured: boolean;
  browserSupported: boolean;
  requiresForegroundTab: true;
  requiresUserGesture: true;
  phrase: string;
  detectionIsLocal: boolean;
  reason: string | null;
};

export const WAKE_WORD_PHRASE = "Hey Cellarhand";

export function normalizeWakePhrase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isWakePhraseTranscript(transcript: string): boolean {
  const normalized = normalizeWakePhrase(transcript);
  if (!normalized) return false;
  const hasWakeLead = /\b(hey|hay|okay|ok|a)\b/.test(normalized);
  const hasCellarhand =
    normalized.includes("cellarhand") ||
    normalized.includes("cellar hand") ||
    normalized.includes("seller hand") ||
    normalized.includes("sellar hand") ||
    normalized.includes("cellar and") ||
    normalized.includes("seller and") ||
    normalized.includes("cellar hen") ||
    normalized.includes("seller hen") ||
    normalized.includes("cellar head") ||
    normalized.includes("seller head") ||
    /\bcellar\b.{0,24}\b(hand|and|hen|head)\b/.test(normalized) ||
    /\bseller\b.{0,24}\b(hand|and|hen|head)\b/.test(normalized) ||
    /\bsell her\b.{0,24}\b(hand|and|hen|head)\b/.test(normalized);
  return hasWakeLead && hasCellarhand;
}

export function wakeWordCapability(): WakeWordCapability {
  const browserSupported = typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  return {
    enabled: false,
    provider: "none",
    providerConfigured: false,
    browserSupported,
    requiresForegroundTab: true,
    requiresUserGesture: true,
    phrase: WAKE_WORD_PHRASE,
    detectionIsLocal: false,
    reason: "Wake phrase is disabled until the openWakeWord ONNX implementation ships.",
  };
}
