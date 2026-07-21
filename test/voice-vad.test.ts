import { describe, it, expect } from "vitest";
import { VadDetector, BARGE_VAD_OPTIONS, DEFAULT_VAD_OPTIONS } from "@/lib/voice/vad";

// Feed synthetic (rms, time) sequences and assert onset/finalize timing. Times
// are explicit ms so the test doesn't depend on a clock.

describe("VadDetector", () => {
  it("emits speech-start once on the first loud sample", () => {
    const v = new VadDetector();
    expect(v.process(0.01, 0)).toBe("none"); // quiet
    expect(v.process(0.1, 100)).toBe("speech-start"); // loud onset
    expect(v.process(0.1, 200)).toBe("none"); // still loud, no repeat before confirmation
    expect(v.isSpeaking).toBe(true);
    expect(v.isConfirmed).toBe(false);
  });

  it("emits speech-confirmed only after enough sustained speech", () => {
    const v = new VadDetector({ minSpeechMs: 250 });
    expect(v.process(0.1, 0)).toBe("speech-start");
    expect(v.process(0.1, 80)).toBe("none");
    expect(v.process(0.1, 240)).toBe("none");
    expect(v.process(0.1, 260)).toBe("speech-confirmed");
    expect(v.process(0.1, 320)).toBe("none");
    expect(v.isConfirmed).toBe(true);
  });

  it("does not confirm an 80ms tap", () => {
    const v = new VadDetector({ hangoverMs: 120, minSpeechMs: 250 });
    expect(v.process(0.1, 0)).toBe("speech-start");
    expect(v.process(0.1, 80)).toBe("none");
    expect(v.process(0.0, 220)).toBe("none");
    expect(v.isSpeaking).toBe(false);
    expect(v.isConfirmed).toBe(false);
  });

  it("finalizes after enough speech followed by the hangover of silence", () => {
    const v = new VadDetector({ speechThreshold: 0.04, hangoverMs: 1200, minSpeechMs: 250 });
    expect(v.process(0.1, 0)).toBe("speech-start");
    expect(v.process(0.1, 300)).toBe("speech-confirmed"); // 300ms of speech (>= minSpeech)
    expect(v.process(0.01, 800)).toBe("none"); // silence starts (500ms since loud)
    expect(v.process(0.01, 1400)).toBe("none"); // 1100ms since last loud (300), < 1200
    expect(v.process(0.01, 1600)).toBe("finalize"); // 1300ms since last loud, >= 1200
  });

  it("does not finalize before the hangover elapses", () => {
    const v = new VadDetector({ hangoverMs: 1200, minSpeechMs: 100 });
    v.process(0.1, 0); // speech-start, lastLoud=0
    v.process(0.1, 200); // lastLoud=200
    expect(v.process(0.0, 1000)).toBe("none"); // 800ms silence < 1200
    expect(v.process(0.0, 1399)).toBe("none"); // 1199ms < 1200
    expect(v.process(0.0, 1401)).toBe("finalize"); // 1201ms >= 1200
  });

  it("drops a too-short blip as noise (no finalize)", () => {
    const v = new VadDetector({ hangoverMs: 500, minSpeechMs: 300 });
    expect(v.process(0.1, 0)).toBe("speech-start"); // loud at t=0
    // immediately quiet; only ~0ms of speech, well under minSpeechMs
    expect(v.process(0.0, 100)).toBe("none");
    expect(v.process(0.0, 700)).toBe("none"); // hangover passed but speech too short -> none
    expect(v.isSpeaking).toBe(false); // reset back to idle
  });

  it("can detect a new utterance after finalizing the previous one", () => {
    const v = new VadDetector({ hangoverMs: 400, minSpeechMs: 100 });
    v.process(0.2, 0);
    v.process(0.2, 200);
    expect(v.process(0.0, 700)).toBe("finalize"); // first turn done
    expect(v.process(0.2, 800)).toBe("speech-start"); // second turn begins
  });

  // Barge-in (interrupting the assistant while it speaks) must be much harder to
  // trip than listening, or the assistant interrupts itself on its own echo / a
  // table bang. These lock the preset's intent so a future tweak can't quietly
  // regress it back to the sensitive listen thresholds.
  describe("BARGE_VAD_OPTIONS (robust barge-in)", () => {
    it("is strictly less sensitive than the listen defaults", () => {
      expect(BARGE_VAD_OPTIONS.speechThreshold).toBeGreaterThan(DEFAULT_VAD_OPTIONS.speechThreshold);
      expect(BARGE_VAD_OPTIONS.minSpeechMs).toBeGreaterThan(DEFAULT_VAD_OPTIONS.minSpeechMs);
    });

    it("ignores soft echo / room chatter below the barge threshold", () => {
      const v = new VadDetector(BARGE_VAD_OPTIONS);
      // Residual playback + background chatter around the listen threshold but
      // below the barge threshold: never even registers as onset.
      expect(v.process(0.05, 0)).toBe("none");
      expect(v.process(0.08, 300)).toBe("none");
      expect(v.process(0.1, 900)).toBe("none");
      expect(v.isSpeaking).toBe(false);
    });

    it("ignores a loud-but-brief transient (a bang on the table)", () => {
      const v = new VadDetector(BARGE_VAD_OPTIONS);
      expect(v.process(0.4, 0)).toBe("speech-start"); // loud spike registers onset
      // ...but it's gone well before minSpeechMs, so it never confirms an interrupt.
      expect(v.process(0.3, 200)).toBe("none");
      expect(v.process(0.02, 400)).toBe("none");
      expect(v.isConfirmed).toBe(false);
    });

    it("still confirms a deliberate, sustained interruption", () => {
      const v = new VadDetector(BARGE_VAD_OPTIONS);
      expect(v.process(0.3, 0)).toBe("speech-start");
      expect(v.process(0.3, 300)).toBe("none"); // under minSpeechMs (600) so far
      expect(v.process(0.3, 650)).toBe("speech-confirmed"); // sustained past 600ms -> interrupt
    });
  });

  it("reset() returns to the idle state", () => {
    const v = new VadDetector();
    v.process(0.2, 0);
    expect(v.isSpeaking).toBe(true);
    v.reset();
    expect(v.isSpeaking).toBe(false);
    expect(v.isConfirmed).toBe(false);
    expect(v.process(0.2, 50)).toBe("speech-start");
  });
});
