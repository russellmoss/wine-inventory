import { describe, expect, it } from "vitest";
import { isWakePhraseTranscript, normalizeWakePhrase } from "@/lib/voice/wake-word";

describe("wake phrase matching", () => {
  it("normalizes punctuation and spacing", () => {
    expect(normalizeWakePhrase(" Hey, Cellarhand! ")).toBe("hey cellarhand");
  });

  it("matches common Cellarhand transcripts", () => {
    expect(isWakePhraseTranscript("hey cellarhand")).toBe(true);
    expect(isWakePhraseTranscript("Hey cellar hand, are you there?")).toBe(true);
    expect(isWakePhraseTranscript("hay cellar hand")).toBe(true);
    expect(isWakePhraseTranscript("hey seller hand")).toBe(true);
    expect(isWakePhraseTranscript("hey sell her hand")).toBe(true);
    expect(isWakePhraseTranscript("hey cellar and")).toBe(true);
    expect(isWakePhraseTranscript("hey there. cellar hand")).toBe(true);
  });

  it("does not wake on adjacent cellar words", () => {
    expect(isWakePhraseTranscript("show me the cellar work for today")).toBe(false);
    expect(isWakePhraseTranscript("cellar hand inventory")).toBe(false);
    expect(isWakePhraseTranscript("hey assistant")).toBe(false);
  });
});
