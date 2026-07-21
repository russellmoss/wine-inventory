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
// room noise. Detecting an interruption with the *listen* thresholds made the
// assistant interrupt itself on its own playback and cut off on a table bang —
// the loop would oscillate through "thinking/speaking" and never actually talk.
// Barge must clear a much higher, longer bar: only a deliberate, sustained
// interruption should stop playback. A transient bang is loud but short, so the
// longer minSpeechMs filters it; steady background chatter sits below the higher
// threshold. Voice-interrupt is intentionally harder here; the on-screen
// "Interrupt" button is always available as the instant, foolproof path.
export const BARGE_VAD_OPTIONS: VadOptions = {
  speechThreshold: 0.15,
  hangoverMs: 400,
  minSpeechMs: 600,
};

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
