import { describe, expect, it } from "vitest";
import {
  averageVoiceprints,
  compareVoiceprints,
  normalizeVoiceprintVector,
  voiceprintQuality,
  VOICEPRINT_SIZE,
} from "@/lib/voice/voiceprint";

describe("voiceprint utilities", () => {
  it("normalizes vectors to a stable fixed size", () => {
    const v = normalizeVoiceprintVector([1, 2, 3]);
    expect(v).toHaveLength(VOICEPRINT_SIZE);
    expect(Math.sqrt(v.reduce((sum, n) => sum + n * n, 0))).toBeCloseTo(1, 4);
  });

  it("averages enrollment samples", () => {
    const vp = averageVoiceprints([
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0.9, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [0.8, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    expect(vp.vector).toHaveLength(VOICEPRINT_SIZE);
    expect(voiceprintQuality([[1, 0], [0.9, 0.1], [0.8, 0.2]])).toBeGreaterThan(0.9);
  });

  it("matches similar vectors and rejects different vectors", () => {
    const enrolled = normalizeVoiceprintVector([1, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const same = normalizeVoiceprintVector([0.95, 0.22, 0.08, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const different = normalizeVoiceprintVector([0, 0, 0, 0, 0, 0, 1, 0.2, 0.1, 0, 0, 0]);
    expect(compareVoiceprints(enrolled, same, 0.82).matched).toBe(true);
    expect(compareVoiceprints(enrolled, different, 0.82).matched).toBe(false);
  });
});
