export const VOICEPRINT_VERSION = "local-voiceprint-v1";
export const VOICEPRINT_SIZE = 12;

export type Voiceprint = {
  version: typeof VOICEPRINT_VERSION;
  vector: number[];
};

export type VoiceprintMatch = {
  matched: boolean;
  similarity: number;
};

export const DEFAULT_VOICEPRINT_THRESHOLD = 0.82;

export function normalizeVoiceprintVector(input: readonly number[]): number[] {
  const values = Array.from(input, (n) => (Number.isFinite(n) ? Number(n) : 0)).slice(0, VOICEPRINT_SIZE);
  while (values.length < VOICEPRINT_SIZE) values.push(0);
  const magnitude = Math.sqrt(values.reduce((sum, n) => sum + n * n, 0));
  if (magnitude <= 0) return values.map(() => 0);
  return values.map((n) => Number((n / magnitude).toFixed(6)));
}

export function averageVoiceprints(vectors: readonly (readonly number[])[]): Voiceprint {
  if (vectors.length === 0) {
    throw new Error("At least one voiceprint vector is required.");
  }
  const sums = Array.from({ length: VOICEPRINT_SIZE }, () => 0);
  for (const vector of vectors) {
    const normalized = normalizeVoiceprintVector(vector);
    for (let i = 0; i < VOICEPRINT_SIZE; i++) sums[i] += normalized[i];
  }
  return {
    version: VOICEPRINT_VERSION,
    vector: normalizeVoiceprintVector(sums.map((n) => n / vectors.length)),
  };
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const left = normalizeVoiceprintVector(a);
  const right = normalizeVoiceprintVector(b);
  let dot = 0;
  for (let i = 0; i < VOICEPRINT_SIZE; i++) dot += left[i] * right[i];
  return Math.max(-1, Math.min(1, dot));
}

export function compareVoiceprints(
  enrolled: readonly number[],
  candidate: readonly number[],
  threshold = DEFAULT_VOICEPRINT_THRESHOLD,
): VoiceprintMatch {
  const similarity = cosineSimilarity(enrolled, candidate);
  return { matched: similarity >= threshold, similarity };
}

export function voiceprintQuality(vectors: readonly (readonly number[])[]): number {
  if (vectors.length <= 1) return 0.5;
  const averaged = averageVoiceprints(vectors).vector;
  const scores = vectors.map((v) => Math.max(0, cosineSimilarity(averaged, v)));
  const mean = scores.reduce((sum, n) => sum + n, 0) / scores.length;
  return Number(Math.max(0, Math.min(1, mean)).toFixed(3));
}
