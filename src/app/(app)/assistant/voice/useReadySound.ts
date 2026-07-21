"use client";

import React from "react";

// One-shot "I'm listening now" earcon, played once when a voice session first
// becomes ready for the user to speak. Not a loop and not a per-turn cue: hearing
// it before every single turn would be maddening, so it marks the START of the
// conversation and then gets out of the way.
//
// Same deliberate choice as useThinkingSound: a plain HTMLAudioElement, NOT the
// Web Audio graph in useAudioPlayback. That context and its AnalyserNode belong to
// the assistant's TTS and drive the orb, so keeping this separate means the earcon
// can never be mistaken for the assistant's voice, reordered into the speech queue,
// or show up in the visualizer's level.
//
// The important difference from the thinking bed: that one plays while the mic is
// IDLE (during transcribe/think), so it can never reach the VAD. This one plays at
// the exact moment we are about to start listening, so it CAN be heard by the mic.
// `getUserMedia` runs with `echoCancellation: true`, which is the real protection,
// but this clip is ~2.1s — comfortably past the listen VAD's `minSpeechMs: 250`
// "filters coughs and clicks" guard. Relying on AEC alone would risk the assistant
// transcribing its own earcon as the user's first utterance. So the caller arms the
// mic through `onDone` instead: the sound finishes, THEN we listen. Which is also
// what the sound is telling the user anyway.

const SRC = "/sounds/ready.mp3";
/** Slightly under the thinking bed: a cue, not an announcement. */
const VOLUME = 0.4;
/**
 * Hard ceiling on how long we will wait for the clip before listening regardless.
 * The asset is ~2.1s today, but a future swap must never be able to stall the
 * conversation: past this we arm the mic and let echo cancellation cover the tail.
 */
const MAX_WAIT_MS = 2_500;

export type ReadySound = {
  /**
   * Play the earcon, then invoke `onDone`. `onDone` fires exactly once, whichever
   * happens first: the clip ends, MAX_WAIT_MS elapses, or playback fails outright
   * (autoplay blocked, missing asset, unsupported browser). A missing earcon must
   * never cost the user their turn, so every failure path still arms the mic.
   */
  play: (onDone: () => void) => void;
};

export function useReadySound(): ReadySound {
  const elRef = React.useRef<HTMLAudioElement | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneRef = React.useRef<(() => void) | null>(null);

  const settle = React.useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const cb = doneRef.current;
    doneRef.current = null; // exactly-once: whoever gets here first wins
    cb?.();
  }, []);

  const play = React.useCallback(
    (onDone: () => void) => {
      doneRef.current = onDone;

      if (typeof Audio === "undefined") {
        settle(); // SSR / unsupported — listen immediately
        return;
      }

      if (!elRef.current) {
        const el = new Audio(SRC);
        el.preload = "auto";
        el.volume = VOLUME;
        elRef.current = el;
      }
      const el = elRef.current;
      el.addEventListener("ended", settle, { once: true });
      el.addEventListener("error", settle, { once: true });

      timerRef.current = setTimeout(settle, MAX_WAIT_MS);

      el.currentTime = 0;
      el.volume = VOLUME;
      // Autoplay is permitted here: entering voice mode required a user gesture
      // (the Talk button), which unlocks playback for the page. A rejection still
      // settles, so a blocked earcon degrades to "no sound", never "no listening".
      void el.play().catch(settle);
    },
    [settle],
  );

  React.useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      doneRef.current = null;
      elRef.current?.pause();
      elRef.current = null;
    },
    [],
  );

  // Stable identity so consumers can safely put this in effect deps.
  return React.useMemo(() => ({ play }), [play]);
}
