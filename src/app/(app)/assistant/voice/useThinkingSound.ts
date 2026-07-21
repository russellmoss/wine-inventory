"use client";

import React from "react";

// Ambient "thinking" earcon for voice mode: plays while the assistant is working
// out its reply so the wait isn't dead silence (the Claude-style thinking bed).
//
// Repeat-with-a-breath rather than a seamless loop: when the clip ends we wait
// GAP_MS and play it again. On a tonal clip a hard seam is more noticeable than a
// gap, and the pause reads as "still working" rather than a stuck buffer.
//
// Deliberately a plain HTMLAudioElement, NOT the Web Audio graph in
// useAudioPlayback: that context + AnalyserNode belongs to the assistant's TTS and
// drives the visualizer. Keeping this separate means the earcon can never be
// mistaken for the assistant's voice, reordered into the speech queue, or show up
// in the orb's level. It also can't reach the barge-in detector — the mic is in
// "idle" mode during transcribe/think, so the VAD isn't consuming samples.

const SRC = "/sounds/thinking.mp3";
/** Silence between repeats, per product spec. */
const GAP_MS = 2_000;
/** Sits under the assistant's voice — an earcon, never a competitor. */
const VOLUME = 0.35;
/** Short fade so stopping doesn't hard-cut into the assistant's first word. */
const FADE_MS = 180;
const FADE_STEPS = 6;

export type ThinkingSound = {
  /** Begin the thinking bed (no-op if already playing). */
  start: () => void;
  /** Fade out and reset (safe to call repeatedly). */
  stop: () => void;
};

export function useThinkingSound(): ThinkingSound {
  const elRef = React.useRef<HTMLAudioElement | null>(null);
  const gapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = React.useRef(false);

  const clearTimers = React.useCallback(() => {
    if (gapTimerRef.current !== null) {
      clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
    if (fadeTimerRef.current !== null) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);

  const ensureEl = React.useCallback((): HTMLAudioElement | null => {
    if (typeof Audio === "undefined") return null; // SSR / unsupported
    if (!elRef.current) {
      const el = new Audio(SRC);
      el.preload = "auto";
      el.volume = VOLUME;
      el.addEventListener("ended", () => {
        if (!activeRef.current) return;
        gapTimerRef.current = setTimeout(() => {
          const cur = elRef.current;
          if (!activeRef.current || !cur) return;
          cur.currentTime = 0;
          cur.volume = VOLUME;
          void cur.play().catch(() => {});
        }, GAP_MS);
      });
      elRef.current = el;
    }
    return elRef.current;
  }, []);

  const start = React.useCallback(() => {
    if (activeRef.current) return; // already running; don't restart mid-clip
    const el = ensureEl();
    if (!el) return;
    activeRef.current = true;
    clearTimers();
    el.currentTime = 0;
    el.volume = VOLUME;
    // Autoplay is allowed here: entering voice mode required a user gesture (the
    // Talk button), which unlocks playback for the page. Failure is non-fatal —
    // a missing earcon must never break the conversation loop.
    void el.play().catch(() => {});
  }, [ensureEl, clearTimers]);

  const stop = React.useCallback(() => {
    const wasActive = activeRef.current;
    activeRef.current = false;
    clearTimers();
    const el = elRef.current;
    if (!el || !wasActive) {
      if (el && el.paused) el.currentTime = 0;
      return;
    }
    if (el.paused) {
      el.currentTime = 0;
      el.volume = VOLUME;
      return;
    }
    const step = el.volume / FADE_STEPS;
    fadeTimerRef.current = setInterval(
      () => {
        const cur = elRef.current;
        if (!cur) {
          clearTimers();
          return;
        }
        const next = cur.volume - step;
        if (next <= 0.01) {
          clearTimers();
          cur.pause();
          cur.currentTime = 0;
          cur.volume = VOLUME; // restore for the next start()
          return;
        }
        cur.volume = next;
      },
      Math.max(1, Math.round(FADE_MS / FADE_STEPS)),
    );
  }, [clearTimers]);

  React.useEffect(
    () => () => {
      activeRef.current = false;
      clearTimers();
      elRef.current?.pause();
      elRef.current = null;
    },
    [clearTimers],
  );

  // Stable identity so consumers can safely put this in effect deps.
  return React.useMemo(() => ({ start, stop }), [start, stop]);
}
