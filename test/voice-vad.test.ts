import { describe, it, expect } from "vitest";
import { VadDetector, BARGE_VAD_OPTIONS, DEFAULT_VAD_OPTIONS, echoAdjustedLevel } from "@/lib/voice/vad";

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

  // Regression (bug: "voice mode interrupts the user before they finish speaking").
  // The user pauses mid-sentence to think, then keeps talking. With the OLD 1200ms
  // hangover a ~1.5-2s thinking pause finalized the turn and the assistant cut them
  // off. The listen-mode default must tolerate a natural mid-thought pause: no
  // finalize during the pause, and the turn continues when the user resumes.
  describe("end-of-turn tolerates a mid-thought pause (default listen options)", () => {
    it("does not finalize on a ~2s mid-sentence pause, then continues the turn", () => {
      const v = new VadDetector(); // DEFAULT_VAD_OPTIONS — what listen mode uses
      // "Yeah. So what I want is just like that information..."
      expect(v.process(0.12, 0)).toBe("speech-start");
      expect(v.process(0.12, 300)).toBe("speech-confirmed");
      expect(v.process(0.12, 900)).toBe("none"); // still talking
      // ...user pauses to think for ~2s (longer than the OLD 1200ms window)...
      expect(v.process(0.005, 1500)).toBe("none"); // 600ms silence
      expect(v.process(0.005, 2200)).toBe("none"); // 1300ms silence — WOULD have finalized before the fix
      expect(v.process(0.005, 2800)).toBe("none"); // 1900ms silence, still under 2500ms
      expect(v.isSpeaking).toBe(true); // turn is NOT handed over
      // ...user resumes the same thought without being cut off.
      expect(v.process(0.12, 3000)).toBe("none"); // still the same turn, already confirmed
      expect(v.isSpeaking).toBe(true);
    });

    it("still finalizes once the user has genuinely stopped (full hangover of silence)", () => {
      const v = new VadDetector();
      expect(v.process(0.12, 0)).toBe("speech-start");
      expect(v.process(0.12, 300)).toBe("speech-confirmed");
      // Now the user is actually done — silence past the full 2500ms window.
      expect(v.process(0.005, 2000)).toBe("none"); // 1700ms silence, under 2500
      expect(v.process(0.005, 2799)).toBe("none"); // 2499ms silence, just under
      expect(v.process(0.005, 2801)).toBe("finalize"); // 2501ms >= 2500 -> turn over
    });

    it("the listen default hangover is long enough to clear a natural pause", () => {
      // Locks the intent: the end-of-turn window must comfortably exceed a normal
      // mid-sentence thinking pause, and be longer than the too-short 1200ms it replaced.
      expect(DEFAULT_VAD_OPTIONS.hangoverMs).toBeGreaterThan(1200);
      expect(DEFAULT_VAD_OPTIONS.hangoverMs).toBeGreaterThanOrEqual(2000);
    });
  });

  // Barge-in (interrupting the assistant while it speaks) is less sensitive than
  // listening AND fed an echo-adjusted level, so the assistant can't interrupt
  // itself while the user still can. These lock the preset's intent + timing.
  describe("BARGE_VAD_OPTIONS (adaptive barge-in)", () => {
    it("is less sensitive than the listen defaults but still reachable by real speech", () => {
      expect(BARGE_VAD_OPTIONS.speechThreshold).toBeGreaterThan(DEFAULT_VAD_OPTIONS.speechThreshold);
      expect(BARGE_VAD_OPTIONS.minSpeechMs).toBeGreaterThanOrEqual(DEFAULT_VAD_OPTIONS.minSpeechMs);
      // Not so high that a normal spoken interruption can't cross it.
      expect(BARGE_VAD_OPTIONS.speechThreshold).toBeLessThanOrEqual(0.1);
    });

    it("keeps its own short hangover independent of the listen turn-taking window", () => {
      // Barge hangover governs how fast the assistant yields on interruption, not
      // user turn-taking, so it must stay short even though the listen window grew.
      expect(BARGE_VAD_OPTIONS.hangoverMs).toBeLessThan(DEFAULT_VAD_OPTIONS.hangoverMs);
    });

    it("ignores an echo-adjusted level below the barge threshold", () => {
      const v = new VadDetector(BARGE_VAD_OPTIONS);
      // Residual echo after the output discount stays under 0.09: never onsets.
      expect(v.process(0.05, 0)).toBe("none");
      expect(v.process(0.08, 300)).toBe("none");
      expect(v.process(0.06, 900)).toBe("none");
      expect(v.isSpeaking).toBe(false);
    });

    it("ignores a loud-but-brief transient (a bang on the table)", () => {
      const v = new VadDetector(BARGE_VAD_OPTIONS);
      expect(v.process(0.4, 0)).toBe("speech-start"); // loud spike registers onset
      // ...but it's gone well before minSpeechMs, so it never confirms an interrupt.
      expect(v.process(0.3, 150)).toBe("none");
      expect(v.process(0.02, 400)).toBe("none");
      expect(v.isConfirmed).toBe(false);
    });

    it("confirms a deliberate, sustained interruption (a spoken 'yeah, I got it')", () => {
      const v = new VadDetector(BARGE_VAD_OPTIONS);
      expect(v.process(0.15, 0)).toBe("speech-start");
      expect(v.process(0.15, 250)).toBe("none"); // under minSpeechMs (400) so far
      expect(v.process(0.15, 450)).toBe("speech-confirmed"); // sustained past 400ms -> interrupt
    });
  });

  // The echo discount is what lets the barge threshold stay low (reachable by the
  // user) without the assistant interrupting itself on its own playback.
  describe("echoAdjustedLevel", () => {
    it("passes the raw mic level through when nothing is playing", () => {
      expect(echoAdjustedLevel(0.12, 0)).toBeCloseTo(0.12, 5);
    });

    it("discounts the assistant's own output so its echo stays under the bar", () => {
      // Assistant loud (output 0.25), mic hears mostly residual echo (0.1):
      // 0.1 - 0.3*0.25 = 0.025, below the 0.09 barge threshold -> no self-interrupt.
      expect(echoAdjustedLevel(0.1, 0.25)).toBeLessThan(BARGE_VAD_OPTIONS.speechThreshold);
    });

    it("still lets the user cross the bar when talking over loud playback", () => {
      // Assistant loud (0.25) AND the user talks over it (mic 0.22):
      // 0.22 - 0.3*0.25 = 0.145, above 0.09 -> the user is heard.
      expect(echoAdjustedLevel(0.22, 0.25)).toBeGreaterThan(BARGE_VAD_OPTIONS.speechThreshold);
    });

    it("never returns a negative level", () => {
      expect(echoAdjustedLevel(0.01, 0.9)).toBe(0);
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
