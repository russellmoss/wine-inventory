"use client";

import React from "react";
import { VadDetector, BARGE_VAD_OPTIONS } from "@/lib/voice/vad";

// Owns the microphone: one persistent getUserMedia stream + AudioContext +
// AnalyserNode, with an RAF loop that computes RMS every frame. That RMS does
// double duty — it feeds the VAD (when/where to start and stop a turn) and it
// drives the visualizer via `levelRef`.
//
// Two turn modes keep echo out of the loop:
//  - "listen": records via MediaRecorder; finalizes one utterance on end-of-speech.
//  - "barge":  no recording, just watches for confirmed speech so the user can talk
//              over the assistant. Used while the assistant is speaking.

type Mode = "idle" | "listen" | "barge";

export type MicCapture = {
  /** Live RMS amplitude (0..1), updated every animation frame. For the visualizer. */
  levelRef: React.RefObject<number>;
  /** Ensure mic permission + audio graph are ready. Safe to call repeatedly. */
  ensureReady: () => Promise<void>;
  /** Begin a recording turn; fires onUtterance(blob) once on end-of-speech. */
  beginListen: (onUtterance: (audio: Blob) => void) => void;
  /** Begin barge-in monitoring; fires onSpeech() once speech is sustained enough to be intentional. */
  beginBargeIn: (onSpeech: (audio?: Blob) => void, options?: { record?: boolean }) => void;
  /** Stop the current turn (stops any active recording) without releasing the mic. */
  endTurn: () => void;
  /** Fully release the mic + audio context. */
  dispose: () => void;
};

// Barge-in detection, kept pure + exported so the turn-taking is testable.
//
// Why this and not VadDetector's "speech-confirmed": VadDetector confirms only on
// a SINGLE unbroken loud run since onset and resets whenever silence exceeds its
// hangover. Real interruption speech is intermittent — "yeah I got it. yeah I got
// it" has word/phrase gaps that routinely exceed the barge hangover — so every
// burst was discarded before it could confirm and playback never stopped
// verbally (users had to hit the Interrupt button). This accumulates loud time
// across brief pauses instead: it fires once the CUMULATIVE sustained loud speech
// reaches minSpeechMs, tolerating quiet gaps up to gapToleranceMs. It still
// demands the high barge amplitude (echo/room chatter below threshold never
// accumulates) and enough total loud time (a brief table-bang can't reach it),
// preserving the "don't interrupt yourself" guarantee.
export type BargeOptions = {
  /** RMS (0..1) at/above which a sample counts as loud. */
  threshold: number;
  /** Cumulative loud time required before a barge-in is intentional. */
  minSpeechMs: number;
  /** Quiet gaps up to this long don't discard the accumulated speech (word/phrase pauses). */
  gapToleranceMs: number;
};

export const DEFAULT_BARGE_OPTIONS: BargeOptions = {
  threshold: BARGE_VAD_OPTIONS.speechThreshold,
  minSpeechMs: BARGE_VAD_OPTIONS.minSpeechMs,
  gapToleranceMs: 700,
};

export class BargeDetector {
  private opts: BargeOptions;
  private accumMs = 0;
  private lastMs: number | null = null;
  private lastLoudMs: number | null = null;
  private fired = false;

  constructor(opts: Partial<BargeOptions> = {}) {
    this.opts = { ...DEFAULT_BARGE_OPTIONS, ...opts };
  }

  reset(): void {
    this.accumMs = 0;
    this.lastMs = null;
    this.lastLoudMs = null;
    this.fired = false;
  }

  /**
   * Feed one amplitude sample. Returns true exactly once, when cumulative
   * sustained loud speech first crosses minSpeechMs. Brief quiet gaps (<=
   * gapToleranceMs) are bridged; a longer gap forgets the accumulated speech so
   * a one-off burst never lingers to combine with an unrelated later one.
   */
  process(rms: number, nowMs: number): boolean {
    if (this.fired) return false;

    const prev = this.lastMs;
    this.lastMs = nowMs;
    const loud = rms >= this.opts.threshold;

    if (loud) {
      if (prev !== null && this.lastLoudMs !== null) {
        const gap = nowMs - this.lastLoudMs;
        // Count the interval since the previous sample toward accumulated speech,
        // but only if the quiet stretch since the last loud sample stayed within
        // tolerance; otherwise the phrase lapsed and we start the tally over.
        if (gap <= this.opts.gapToleranceMs) {
          this.accumMs += nowMs - prev;
        } else {
          this.accumMs = 0;
        }
      }
      this.lastLoudMs = nowMs;
      if (this.accumMs >= this.opts.minSpeechMs) {
        this.fired = true;
        return true;
      }
      return false;
    }

    // Quiet sample: if we've been quiet longer than tolerance, drop the tally.
    if (this.lastLoudMs !== null && nowMs - this.lastLoudMs > this.opts.gapToleranceMs) {
      this.accumMs = 0;
    }
    return false;
  }
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function useMicCapture(): MicCapture {
  const levelRef = React.useRef<number>(0);

  const streamRef = React.useRef<MediaStream | null>(null);
  const ctxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const dataRef = React.useRef<Uint8Array<ArrayBuffer> | null>(null);

  const modeRef = React.useRef<Mode>("idle");
  // `vadRef` handles listening (sensitive, finalize-after-hangover — the right
  // shape for detecting end-of-turn). `bargeRef` handles barge-in with cumulative
  // sustained-speech detection (see BargeDetector) so an intermittent verbal
  // interruption stops playback the way the on-screen button does.
  const vadRef = React.useRef(new VadDetector());
  const bargeRef = React.useRef(new BargeDetector());
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const mimeRef = React.useRef<string | undefined>(undefined);

  const onUtteranceRef = React.useRef<((b: Blob) => void) | null>(null);
  const onSpeechRef = React.useRef<((audio?: Blob) => void) | null>(null);

  // Stop the active recorder and hand the assembled blob to the listener.
  const finalizeListen = React.useCallback(() => {
    modeRef.current = "idle";
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop(); // onstop emits the blob
  }, []);

  const ensureReady = React.useCallback(async () => {
    if (streamRef.current && ctxRef.current) {
      if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    streamRef.current = stream;

    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    ctxRef.current = ctx;
    analyserRef.current = analyser;
    dataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    mimeRef.current = pickMimeType();

    const tick = () => {
      const a = analyserRef.current;
      const buf = dataRef.current;
      if (a && buf) {
        a.getByteTimeDomainData(buf);
        let sumSq = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / buf.length);
        levelRef.current = rms;

        const now = ctxRef.current ? ctxRef.current.currentTime * 1000 : 0;
        const mode = modeRef.current;
        if (mode === "listen") {
          const evt = vadRef.current.process(rms, now);
          if (evt === "finalize") finalizeListen();
        } else if (mode === "barge") {
          if (bargeRef.current.process(rms, now)) {
            modeRef.current = "idle";
            const rec = recorderRef.current;
            if (rec && rec.state !== "inactive") {
              rec.stop();
            } else {
              onSpeechRef.current?.();
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beginListen = React.useCallback((onUtterance: (b: Blob) => void) => {
    const stream = streamRef.current;
    if (!stream) return;
    // Re-entrancy guard: never stack a second MediaRecorder on the same stream.
    // Drop the prior one's onstop so its trailing blob can't fire a stale turn.
    const prev = recorderRef.current;
    if (prev && prev.state !== "inactive") {
      prev.onstop = null;
      try {
        prev.stop();
      } catch {
        /* already stopped */
      }
    }
    onUtteranceRef.current = onUtterance;
    vadRef.current.reset();
    chunksRef.current = [];

    const rec = new MediaRecorder(stream, mimeRef.current ? { mimeType: mimeRef.current } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const type = mimeRef.current ?? "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      const cb = onUtteranceRef.current;
      onUtteranceRef.current = null;
      if (blob.size > 0) cb?.(blob);
    };
    recorderRef.current = rec;
    rec.start();
    modeRef.current = "listen";
  }, []);

  const beginBargeIn = React.useCallback((onSpeech: (audio?: Blob) => void, options?: { record?: boolean }) => {
    const stream = streamRef.current;
    onSpeechRef.current = onSpeech;
    bargeRef.current.reset();
    chunksRef.current = [];
    if (options?.record && stream) {
      const prev = recorderRef.current;
      if (prev && prev.state !== "inactive") {
        prev.onstop = null;
        try {
          prev.stop();
        } catch {
          /* already stopped */
        }
      }
      const rec = new MediaRecorder(stream, mimeRef.current ? { mimeType: mimeRef.current } : undefined);
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = mimeRef.current ?? "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        const cb = onSpeechRef.current;
        onSpeechRef.current = null;
        cb?.(blob.size > 0 ? blob : undefined);
      };
      recorderRef.current = rec;
      rec.start();
    }
    modeRef.current = "barge";
  }, []);

  const endTurn = React.useCallback(() => {
    modeRef.current = "idle";
    onUtteranceRef.current = null;
    onSpeechRef.current = null;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const dispose = React.useCallback(() => {
    modeRef.current = "idle";
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const rec = recorderRef.current;
    if (rec) {
      rec.onstop = null; // drop even if inactive, so a scheduled onstop can't fire
      if (rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
    dataRef.current = null;
    levelRef.current = 0;
  }, []);

  React.useEffect(() => () => dispose(), [dispose]);

  // Stable object identity: consumers (useVoiceSession) put this in effect deps,
  // so a fresh literal every render would cause a start/stop loop. All members
  // are stable (refs + empty-dep useCallbacks), so this memo never changes.
  return React.useMemo(
    () => ({ levelRef, ensureReady, beginListen, beginBargeIn, endTurn, dispose }),
    [levelRef, ensureReady, beginListen, beginBargeIn, endTurn, dispose],
  );
}
