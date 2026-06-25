"use client";

import React from "react";
import { VadDetector } from "@/lib/voice/vad";

// Owns the microphone: one persistent getUserMedia stream + AudioContext +
// AnalyserNode, with an RAF loop that computes RMS every frame. That RMS does
// double duty — it feeds the VAD (when/where to start and stop a turn) and it
// drives the visualizer via `levelRef`.
//
// Two turn modes keep echo out of the loop:
//  - "listen": records via MediaRecorder; finalizes one utterance on end-of-speech.
//  - "barge":  no recording, just watches for speech onset so the user can talk
//              over the assistant. Used while the assistant is speaking.

type Mode = "idle" | "listen" | "barge";

export type MicCapture = {
  /** Live RMS amplitude (0..1), updated every animation frame. For the visualizer. */
  levelRef: React.RefObject<number>;
  /** Ensure mic permission + audio graph are ready. Safe to call repeatedly. */
  ensureReady: () => Promise<void>;
  /** Begin a recording turn; fires onUtterance(blob) once on end-of-speech. */
  beginListen: (onUtterance: (audio: Blob) => void) => void;
  /** Begin barge-in monitoring; fires onSpeech() once when the user starts talking. */
  beginBargeIn: (onSpeech: () => void) => void;
  /** Stop the current turn (stops any active recording) without releasing the mic. */
  endTurn: () => void;
  /** Fully release the mic + audio context. */
  dispose: () => void;
};

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
  const vadRef = React.useRef(new VadDetector());
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const mimeRef = React.useRef<string | undefined>(undefined);

  const onUtteranceRef = React.useRef<((b: Blob) => void) | null>(null);
  const onSpeechRef = React.useRef<(() => void) | null>(null);

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
          const evt = vadRef.current.process(rms, now);
          if (evt === "speech-start") {
            modeRef.current = "idle";
            onSpeechRef.current?.();
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stop the active recorder and hand the assembled blob to the listener.
  const finalizeListen = React.useCallback(() => {
    modeRef.current = "idle";
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop(); // onstop emits the blob
  }, []);

  const beginListen = React.useCallback((onUtterance: (b: Blob) => void) => {
    const stream = streamRef.current;
    if (!stream) return;
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

  const beginBargeIn = React.useCallback((onSpeech: () => void) => {
    onSpeechRef.current = onSpeech;
    vadRef.current.reset();
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
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      try {
        rec.stop();
      } catch {
        /* already stopped */
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

  return { levelRef, ensureReady, beginListen, beginBargeIn, endTurn, dispose };
}
