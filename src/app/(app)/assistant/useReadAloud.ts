"use client";

import React from "react";
import { planSpeech } from "@/lib/voice/read-aloud";

// "Read this reply aloud": the speaker button on a finished assistant message.
// Same server route and same ElevenLabs voice as hands-free voice mode
// (/api/assistant/speak), but driven by an explicit click on ONE message rather
// than by the live turn loop — so it is deliberately small and self-contained
// instead of reaching into useVoiceSession's state machine.
//
// Web Audio rather than <audio src=blob>: the AudioContext is created and resumed
// inside the click (the autoplay-policy gesture) and then stays unlocked for every
// later clip in the message, which an HTMLAudioElement does not reliably do on
// iOS. It also gives an exact stop — src.stop() cuts instantly, mid-clip.

export type ReadAloudState = "idle" | "loading" | "speaking";

export type ReadAloud = {
  /** Which message is being read, if any. Callers pass their own stable id. */
  activeId: string | null;
  state: ReadAloudState;
  /**
   * The last failure, tagged with the message it belongs to. Carries the id because
   * a failed read clears `activeId` — without the tag the caller could not tell WHICH
   * speaker button should show the error, and it would render on none of them.
   */
  error: { id: string; message: string } | null;
  /** Click handler: start reading `markdown`, or stop if that same id is already reading. */
  toggle: (id: string, markdown: string) => void;
  /** Stop immediately (another message started, the dock closed, voice mode opened). */
  stop: () => void;
};

async function fetchClip(text: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const res = await fetch("/api/assistant/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Couldn't play that out loud.");
  }
  return res.arrayBuffer();
}

export function useReadAloud(): ReadAloud {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [state, setState] = React.useState<ReadAloudState>("idle");
  const [error, setError] = React.useState<{ id: string; message: string } | null>(null);

  const ctxRef = React.useRef<AudioContext | null>(null);
  const srcRef = React.useRef<AudioBufferSourceNode | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  // Bumped on every stop/start. The async read loop compares against its own copy,
  // so a run that was superseded mid-fetch cannot resurrect itself and start
  // playing over the message the user actually clicked.
  const genRef = React.useRef(0);

  const teardown = React.useCallback(() => {
    genRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    const src = srcRef.current;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already ended */
      }
    }
    srcRef.current = null;
  }, []);

  const stop = React.useCallback(() => {
    teardown();
    setActiveId(null);
    setState("idle");
  }, [teardown]);

  const play = React.useCallback(async (id: string, markdown: string) => {
    const chunks = planSpeech(markdown);
    if (chunks.length === 0) {
      setError({ id, message: "There's nothing to read aloud in that reply." });
      return;
    }

    teardown();
    const gen = genRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const superseded = () => genRef.current !== gen;

    setError(null);
    setActiveId(id);
    setState("loading");

    try {
      // Unlock/resume the output context while we are still inside the click.
      if (!ctxRef.current) {
        const Ctx: typeof AudioContext =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctxRef.current = new Ctx();
      }
      const ctx = ctxRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      if (superseded()) return;

      // One clip ahead, never more: clip N+1 synthesizes while clip N plays, so
      // playback is gapless, but a long reply can't fan out into a dozen
      // simultaneous ElevenLabs calls on a single click.
      let pending = fetchClip(chunks[0], controller.signal);
      for (let i = 0; i < chunks.length; i++) {
        const clip = pending;
        if (i + 1 < chunks.length) {
          pending = fetchClip(chunks[i + 1], controller.signal);
          // Consume the rejection now; the loop will see it again when it awaits.
          pending.catch(() => {});
        }
        const bytes = await clip;
        if (superseded()) return;

        const decoded = await ctx.decodeAudioData(bytes.slice(0));
        if (superseded()) return;

        setState("speaking");
        await new Promise<void>((resolve) => {
          const src = ctx.createBufferSource();
          src.buffer = decoded;
          src.connect(ctx.destination);
          src.onended = () => {
            if (srcRef.current === src) srcRef.current = null;
            resolve();
          };
          srcRef.current = src;
          src.start();
        });
        if (superseded()) return;
      }
      setActiveId(null);
      setState("idle");
    } catch (e) {
      if (superseded()) return;
      // An abort is us stopping it, not a failure — `stop` has already reset state.
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError({ id, message: e instanceof Error ? e.message : "Couldn't play that out loud." });
      setActiveId(null);
      setState("idle");
    }
  }, [teardown]);

  const toggle = React.useCallback(
    (id: string, markdown: string) => {
      if (activeId === id) {
        stop();
        return;
      }
      void play(id, markdown);
    },
    [activeId, play, stop],
  );

  React.useEffect(
    () => () => {
      genRef.current++;
      abortRef.current?.abort();
      const src = srcRef.current;
      if (src) {
        src.onended = null;
        try {
          src.stop();
        } catch {
          /* already ended */
        }
      }
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    },
    [],
  );

  return { activeId, state, error, toggle, stop };
}
