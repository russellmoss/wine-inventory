// Voice-activity detection logic, pulled out of the mic hook so the turn-taking
// (when does the user stop talking?) is pure and testable. The hook feeds it RMS
// amplitude samples + timestamps from a Web Audio AnalyserNode; this decides when
// an utterance starts and, after a hangover of silence, when it's finished.
//
// Getting this wrong is the difference between "it cut me off" and "it never
// stopped listening", so the thresholds and timings are explicit and tunable.

export type VadEvent = "none" | "speech-start" | "speech-confirmed" | "finalize";

export type VadOptions = {
  /** RMS (0..1) at/above which we count a sample as speech. */
  speechThreshold: number;
  /** Silence duration after the last loud sample before we finalize the turn. */
  hangoverMs: number;
  /** Minimum cumulative speech before a turn is "real" (filters coughs/clicks). */
  minSpeechMs: number;
};

export const DEFAULT_VAD_OPTIONS: VadOptions = {
  speechThreshold: 0.04,
  hangoverMs: 1200,
  minSpeechMs: 250,
};

// Barge-in runs WHILE the assistant is speaking, so the mic is simultaneously
// hearing the assistant's own voice (echo cancellation is never perfect) and any
// room noise. A single fixed loudness bar cannot work: set it low and the
// assistant interrupts itself on its own echo (oscillates, never talks); set it
// high and the user's real "yeah, I got it" can't cross it (barge-in ignored).
//
// So the bar is ADAPTIVE — the caller feeds an echo-adjusted level
// (`echoAdjustedLevel`) that subtracts a fraction of the assistant's OWN current
// output from what the mic hears. Effect: while the assistant is talking loudly
// the effective bar rises (its echo is discounted), and in the natural gaps
// between its words the bar drops to `speechThreshold` so the user cuts through
// easily. `minSpeechMs` still filters a transient bang (loud but too short to
// confirm). The on-screen "Interrupt" button remains the instant, foolproof path.
export const BARGE_VAD_OPTIONS: VadOptions = {
  speechThreshold: 0.09,
  hangoverMs: 400,
  minSpeechMs: 400,
};

// How much of the assistant's own output level to subtract from the mic level
// before barge detection. This is a soft echo discount, not a full AEC: small
// enough that a user talking OVER loud playback still clears the bar, large
// enough that residual echo during loud passages does not. Equivalent to a
// dynamic threshold of `speechThreshold + ECHO_REFERENCE_GAIN * outputLevel`.
export const ECHO_REFERENCE_GAIN = 0.3;

/**
 * Discount the assistant's own playback from the mic level so barge detection
 * reacts to the USER, not the assistant's echo. `outputLevel` is the live RMS of
 * the TTS playback (0 when nothing is playing). Clamped at 0 — the mic can only
 * ever be quieter-than-expected, never negatively loud.
 */
export function echoAdjustedLevel(
  micLevel: number,
  outputLevel: number,
  gain: number = ECHO_REFERENCE_GAIN,
): number {
  return Math.max(0, micLevel - gain * outputLevel);
}

export class VadDetector {
  private opts: VadOptions;
  private active = false;
  private confirmed = false;
  private speechStartMs = 0;
  private lastLoudMs = 0;

  constructor(opts: Partial<VadOptions> = {}) {
    this.opts = { ...DEFAULT_VAD_OPTIONS, ...opts };
  }

  /** Reset to the pre-speech state (call when (re)starting a listen). */
  reset(): void {
    this.active = false;
    this.confirmed = false;
    this.speechStartMs = 0;
    this.lastLoudMs = 0;
  }

  /** True once speech onset has been detected and not yet finalized. */
  get isSpeaking(): boolean {
    return this.active;
  }

  /** True once a loud run has lasted long enough to be intentional speech. */
  get isConfirmed(): boolean {
    return this.confirmed;
  }

  /**
   * Feed one amplitude sample. Returns:
   * - "speech-start" the first time speech onset is detected,
   * - "speech-confirmed" once the loud run survives minSpeechMs,
   * - "finalize" when a real utterance has ended (enough speech + hangover silence),
   * - "none" otherwise.
   */
  process(rms: number, nowMs: number): VadEvent {
    const loud = rms >= this.opts.speechThreshold;

    if (loud) {
      this.lastLoudMs = nowMs;
      if (!this.active) {
        this.active = true;
        this.confirmed = false;
        this.speechStartMs = nowMs;
        return "speech-start";
      }
      if (!this.confirmed && nowMs - this.speechStartMs >= this.opts.minSpeechMs) {
        this.confirmed = true;
        return "speech-confirmed";
      }
      return "none";
    }

    // Quiet sample.
    if (!this.active) return "none";

    const silenceFor = nowMs - this.lastLoudMs;
    if (silenceFor < this.opts.hangoverMs) return "none";

    // Hangover elapsed: the turn is over. If it was long enough, finalize;
    // otherwise it was noise — drop it and wait for real speech again.
    const speechDuration = this.lastLoudMs - this.speechStartMs;
    const wasReal = this.confirmed || speechDuration >= this.opts.minSpeechMs;
    this.reset();
    return wasReal ? "finalize" : "none";
  }
}
