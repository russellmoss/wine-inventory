"use client";

import React from "react";
import { AudioQueue } from "@/lib/voice/audio-queue";

// Plays sentence-streamed TTS clips in order through a Web Audio graph, exposing
// a live output level for the visualizer. Each clip is a Promise<ArrayBuffer>
// (the /api/assistant/speak fetch) — enqueuing starts the fetch immediately so
// ElevenLabs synthesizes the next sentence while the current one plays, but the
// AudioQueue still plays them strictly in order. Decoding the whole short clip is
// what lets us route it through an AnalyserNode for the reactive animation.

export type AudioPlayback = {
  /** Live output RMS (0..1) while speaking. For the visualizer. */
  levelRef: React.RefObject<number>;
  /** Create/resume the output AudioContext on a user gesture (autoplay policy). */
  ensureContext: () => Promise<void>;
  /** Queue a clip for playback. The promise should already be in flight. */
  enqueue: (clip: Promise<ArrayBuffer>) => void;
  /** Stop everything immediately and clear the queue (barge-in / close). */
  stopAll: () => void;
  /** True while a clip is playing or queued. */
  isActiveRef: React.RefObject<boolean>;
};

export function useAudioPlayback(onDrained?: () => void): AudioPlayback {
  const levelRef = React.useRef<number>(0);
  const isActiveRef = React.useRef<boolean>(false);

  const ctxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const dataRef = React.useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const currentSrcRef = React.useRef<AudioBufferSourceNode | null>(null);
  const queueRef = React.useRef<AudioQueue<Promise<ArrayBuffer>> | null>(null);
  const onDrainedRef = React.useRef(onDrained);
  React.useEffect(() => {
    onDrainedRef.current = onDrained;
  });

  const ensureContext = React.useCallback(async () => {
    if (!ctxRef.current) {
      const Ctx: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      analyser.connect(ctx.destination);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    }
    if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
  }, []);

  const startMeter = React.useCallback(() => {
    if (rafRef.current !== null) return;
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
        levelRef.current = Math.sqrt(sumSq / buf.length);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopMeter = React.useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    levelRef.current = 0;
  }, []);

  const playClip = React.useCallback(async (clip: Promise<ArrayBuffer>) => {
    const ctx = ctxRef.current;
    const analyser = analyserRef.current;
    if (!ctx || !analyser) return;
    const bytes = await clip;
    // decodeAudioData detaches the buffer; pass a copy so a retry/inspection is safe.
    const audioBuf = await ctx.decodeAudioData(bytes.slice(0));
    await new Promise<void>((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(analyser);
      src.onended = () => {
        if (currentSrcRef.current === src) currentSrcRef.current = null;
        resolve();
      };
      currentSrcRef.current = src;
      src.start();
    });
  }, []);

  const ensureQueue = React.useCallback((): AudioQueue<Promise<ArrayBuffer>> => {
    if (!queueRef.current) {
      queueRef.current = new AudioQueue<Promise<ArrayBuffer>>(playClip, () => {
        isActiveRef.current = false;
        stopMeter();
        onDrainedRef.current?.();
      });
    }
    return queueRef.current;
  }, [playClip, stopMeter]);

  const enqueue = React.useCallback(
    (clip: Promise<ArrayBuffer>) => {
      // Swallow the rejection here so an unconsumed rejected promise can't throw
      // before the queue awaits it; the queue's play() will see it reject too.
      clip.catch(() => {});
      isActiveRef.current = true;
      startMeter();
      ensureQueue().enqueue(clip);
    },
    [ensureQueue, startMeter],
  );

  const stopAll = React.useCallback(() => {
    queueRef.current?.stop();
    queueRef.current = null; // a stopped queue can't be reused
    const src = currentSrcRef.current;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    currentSrcRef.current = null;
    isActiveRef.current = false;
    stopMeter();
  }, [stopMeter]);

  const dispose = React.useCallback(() => {
    stopAll();
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
    dataRef.current = null;
  }, [stopAll]);

  React.useEffect(() => () => dispose(), [dispose]);

  return { levelRef, ensureContext, enqueue, stopAll, isActiveRef };
}
