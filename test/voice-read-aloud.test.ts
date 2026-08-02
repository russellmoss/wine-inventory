import { describe, it, expect } from "vitest";
import { planSpeech, READ_ALOUD_MAX_CHUNK, READ_ALOUD_MAX_TOTAL } from "@/lib/voice/read-aloud";

describe("planSpeech", () => {
  it("returns nothing for empty or whitespace-only input", () => {
    expect(planSpeech("")).toEqual([]);
    expect(planSpeech("   \n  ")).toEqual([]);
  });

  it("returns nothing when the reply was only a citation", () => {
    // toSpeakable drops /kb/source links entirely — there is genuinely no speech here.
    expect(planSpeech("[AWRI: YAN levels](/kb/source/abc123)")).toEqual([]);
  });

  it("speaks a single sentence as one chunk, markdown stripped", () => {
    expect(planSpeech("The **latest** reading is `24.5`.")).toEqual(["The latest reading is 24.5."]);
  });

  it("sends the first sentence alone so audio starts fast", () => {
    const chunks = planSpeech("Block 3 is ready. Block 4 needs another week. Block 5 is done.");
    expect(chunks[0]).toBe("Block 3 is ready.");
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("batches later sentences instead of one request each", () => {
    const chunks = planSpeech("One. Two. Three. Four. Five.");
    expect(chunks).toEqual(["One.", "Two. Three. Four. Five."]);
  });

  it("keeps every chunk under the speak route's slice limit", () => {
    const sentence = `${"Cabernet Sauvignon ripened evenly across the block".repeat(3)}.`;
    const chunks = planSpeech(Array.from({ length: 12 }, () => sentence).join(" "));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(READ_ALOUD_MAX_CHUNK);
  });

  it("hard-splits one over-long sentence at word boundaries", () => {
    const long = `${Array.from({ length: 200 }, () => "word").join(" ")}.`;
    const chunks = planSpeech(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(READ_ALOUD_MAX_CHUNK);
      // Split at spaces only: no chunk may start or end mid-token.
      expect(c).not.toMatch(/^word\w/);
    }
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(long);
  });

  it("caps total synthesis so one click can't fan out unbounded", () => {
    const huge = Array.from({ length: 4000 }, (_, i) => `Sentence number ${i} about the ferment.`).join(" ");
    const chunks = planSpeech(huge);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    expect(total).toBeLessThanOrEqual(READ_ALOUD_MAX_TOTAL);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("never cuts inside an SSML phoneme tag when hard-splitting", () => {
    // The lexicon wraps wine vocabulary in inline <phoneme> tags; half a tag would be
    // read out as literal text by ElevenLabs.
    const long = `${Array.from({ length: 120 }, () => "viognier syrah").join(" ")}.`;
    const chunks = planSpeech(long);
    for (const c of chunks) {
      expect((c.match(/</g) ?? []).length).toBe((c.match(/>/g) ?? []).length);
      expect((c.match(/<phoneme/g) ?? []).length).toBe((c.match(/<\/phoneme>/g) ?? []).length);
    }
  });

  it("normalizes units the same way voice mode does", () => {
    expect(planSpeech("Free SO2 is 28 mg/L.")).toEqual(["Free sulfur dioxide is 28 milligrams per liter."]);
  });
});
