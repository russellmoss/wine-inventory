"use client";

import React from "react";

// Voice-mode earcons: the one-shot "I'm listening now" cue and the ambient
// "thinking" bed. One player, because they were two hooks doing the same job with
// the same timers and the same fade.
//
// WHY WEB AUDIO AND NOT `new Audio()` — this is the whole point of the module:
// both earcons used to be HTMLAudioElements, and both were silent on mobile. A
// mobile browser only lets an HTMLMediaElement play if `.play()` was called inside
// a real user-gesture task, and neither earcon can ever satisfy that. The ready cue
// fires after `start()` has awaited the getUserMedia permission prompt; the thinking
// bed fires on a state change seconds later. Both got NotAllowedError, and both
// swallowed it — silent failure, nothing in the console. Meanwhile the assistant's
// TTS worked fine, because it goes through Web Audio, which has no per-element
// unlock once its context is resumed. (On iOS this also dodges the hardware ringer
// switch, which mutes HTMLAudio but not an active Web Audio session.)
//
// So the earcons now share the TTS context. What they do NOT share is the graph:
// every earcon connects to `ctx.destination` DIRECTLY, bypassing the AnalyserNode.
// That preserves the isolation the original hooks were protecting —
//   - not in the speech queue, so it can never be reordered into the assistant's voice
//   - not through the analyser, so it never shows up in the orb's level, and never
//     inflates the echo-adjusted bar the barge-in detector reads
// The mic is also idle for both: the thinking bed plays during transcribe/think, and
// the ready cue gates mic-arming behind its own completion.

const READY_SRC = "/sounds/ready.mp3";
const THINKING_SRC = "/sounds/thinking.mp3";

/** A cue, not an announcement. */
const READY_VOLUME = 0.4;
/** Sits under the assistant's voice. */
const THINKING_VOLUME = 0.35;
/** Silence between thinking repeats, per product spec. */
const THINKING_GAP_MS = 2_000;
/** Short fade so stopping doesn't hard-cut into the assistant's first word. */
const FADE_MS = 0.18;
/**
 * Ceiling on how long the ready cue may hold the mic closed. The asset is ~2.1s;
 * a future swap must never be able to stall the conversation.
 */
const READY_MAX_WAIT_MS = 2_500;

export type Earcons = {
  /** Warm the decode cache so the first cue isn't gated on a fetch. Safe to call often. */
  preload: () => void;
  /**
   * Play the ready cue, then call `onDone`. Fires EXACTLY once, whichever comes
   * first: playback ends, the cap elapses, or anything fails (no context, fetch or
   * decode error). A missing earcon must never cost the user their turn.
   */
  playReady: (onDone: () => void) => void;
  /** Begin the thinking bed (no-op if already running). */
  startThinking: () => void;
  /** Fade out and reset (safe to call repeatedly). */
  stopThinking: () => void;
};

export function useEarcons(getContext: () => AudioContext | null): Earcons {
  const cacheRef = React.useRef<Map<string, Promise<AudioBuffer>>>(new Map());
  const thinkingActiveRef = React.useRef(false);
  const thinkingNodesRef = React.useRef<{ src: AudioBufferSourceNode; gain: GainNode } | null>(null);
  const thinkingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyDoneRef = React.useRef<(() => void) | null>(null);

  // Decode once per URL and reuse. decodeAudioData detaches its input, so the
  // ArrayBuffer is never handed out — only the decoded AudioBuffer, which is
  // immutable and safe to play from repeatedly.
  const load = React.useCallback((url: string): Promise<AudioBuffer> => {
    const ctx = getContext();
    if (!ctx) return Promise.reject(new Error("no audio context"));
    const cached = cacheRef.current.get(url);
    if (cached) return cached;
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`earcon fetch failed: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .catch((e) => {
        cacheRef.current.delete(url); // let a later attempt retry rather than cache the failure
        throw e;
      });
    cacheRef.current.set(url, p);
    return p;
  }, [getContext]);

  const preload = React.useCallback(() => {
    void load(READY_SRC).catch(() => {});
    void load(THINKING_SRC).catch(() => {});
  }, [load]);

  // --- Ready cue ---------------------------------------------------------------------

  const settleReady = React.useCallback(() => {
    if (readyTimerRef.current !== null) {
      clearTimeout(readyTimerRef.current);
      readyTimerRef.current = null;
    }
    const cb = readyDoneRef.current;
    readyDoneRef.current = null; // exactly-once: first of end / cap / failure wins
    cb?.();
  }, []);

  const playReady = React.useCallback(
    (onDone: () => void) => {
      readyDoneRef.current = onDone;
      const ctx = getContext();
      if (!ctx) {
        settleReady(); // no context (shouldn't happen after start) — listen anyway
        return;
      }
      readyTimerRef.current = setTimeout(settleReady, READY_MAX_WAIT_MS);
      void load(READY_SRC)
        .then((buf) => {
          // The cap may already have fired while we were decoding; if so, don't
          // start a sound the user has moved past.
          if (readyDoneRef.current === null) return;
          const gain = ctx.createGain();
          gain.gain.value = READY_VOLUME;
          gain.connect(ctx.destination); // NOT the analyser — see the header note
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(gain);
          src.onended = settleReady;
          src.start();
        })
        .catch(settleReady);
    },
    [getContext, load, settleReady],
  );

  // --- Thinking bed ------------------------------------------------------------------

  const clearThinkingNodes = React.useCallback(() => {
    const nodes = thinkingNodesRef.current;
    thinkingNodesRef.current = null;
    if (!nodes) return;
    nodes.src.onended = null;
    try {
      nodes.src.stop();
    } catch {
      /* already stopped */
    }
    nodes.gain.disconnect();
  }, []);

  // Repeat-with-a-breath rather than a seamless loop: on a tonal clip a hard seam is
  // more noticeable than a gap, and the pause reads as "still working" rather than a
  // stuck buffer. The repeat is self-scheduling, so it reaches itself through a ref
  // that an effect rebinds each render — the same shape useVoiceSession uses for its
  // mutually-recursive orchestration, and what keeps this lint-clean (no ref writes
  // during render, no use-before-declare).
  const playThinkingOnceRef = React.useRef<() => void>(() => {});

  const playThinkingOnce = React.useCallback(() => {
    const ctx = getContext();
    if (!thinkingActiveRef.current || !ctx) return;
    void load(THINKING_SRC)
      .then((buf) => {
        if (!thinkingActiveRef.current) return;
        const gain = ctx.createGain();
        gain.gain.value = THINKING_VOLUME;
        gain.connect(ctx.destination); // NOT the analyser — see the header note
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(gain);
        src.onended = () => {
          if (!thinkingActiveRef.current) return;
          thinkingNodesRef.current = null;
          thinkingTimerRef.current = setTimeout(() => playThinkingOnceRef.current(), THINKING_GAP_MS);
        };
        thinkingNodesRef.current = { src, gain };
        src.start();
      })
      .catch(() => {
        // A missing bed is cosmetic; never let it break the turn.
        thinkingActiveRef.current = false;
      });
  }, [getContext, load]);

  React.useEffect(() => {
    playThinkingOnceRef.current = playThinkingOnce;
  });

  const startThinking = React.useCallback(() => {
    if (thinkingActiveRef.current) return; // already running; don't stack
    thinkingActiveRef.current = true;
    playThinkingOnce();
  }, [playThinkingOnce]);

  const stopThinking = React.useCallback(() => {
    thinkingActiveRef.current = false;
    if (thinkingTimerRef.current !== null) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    const nodes = thinkingNodesRef.current;
    const ctx = getContext();
    if (!nodes || !ctx) {
      clearThinkingNodes();
      return;
    }
    // Ramp instead of a hard stop so it doesn't clip into the assistant's first word.
    const now = ctx.currentTime;
    try {
      nodes.gain.gain.cancelScheduledValues(now);
      nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now);
      nodes.gain.gain.linearRampToValueAtTime(0.0001, now + FADE_MS);
      nodes.src.onended = null;
      nodes.src.stop(now + FADE_MS);
      const stopping = nodes;
      thinkingNodesRef.current = null;
      setTimeout(() => stopping.gain.disconnect(), Math.ceil(FADE_MS * 1000) + 50);
    } catch {
      clearThinkingNodes();
    }
  }, [getContext, clearThinkingNodes]);

  React.useEffect(
    () => () => {
      thinkingActiveRef.current = false;
      if (thinkingTimerRef.current !== null) clearTimeout(thinkingTimerRef.current);
      if (readyTimerRef.current !== null) clearTimeout(readyTimerRef.current);
      thinkingTimerRef.current = null;
      readyTimerRef.current = null;
      readyDoneRef.current = null;
      clearThinkingNodes();
    },
    [clearThinkingNodes],
  );

  // Stable identity so consumers can safely put this in effect deps.
  return React.useMemo(
    () => ({ preload, playReady, startThinking, stopThinking }),
    [preload, playReady, startThinking, stopThinking],
  );
}
