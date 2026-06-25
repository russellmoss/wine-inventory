"use client";

import React from "react";
import { SentenceChunker } from "@/lib/voice/sentence-chunker";
import { toSpeakable } from "@/lib/voice/speech";
import { useMicCapture } from "./useMicCapture";
import { useAudioPlayback } from "./useAudioPlayback";

// The orchestrator. Owns the hands-free state machine and stitches the pieces
// together: listen (mic + VAD) -> transcribe (server) -> think (assistant stream)
// -> speak (sentence-chunked TTS) -> back to listen. It reuses the EXACT same
// /api/assistant stream the text chat uses, so there is one assistant brain.
//
// Write safety is preserved end to end: a `proposal` event surfaces a confirm
// card and never auto-commits. The user taps confirm (or says "confirm", matched
// against the pending proposal) and that still goes through the signed-token /
// single-use-nonce path in /api/assistant/confirm.
//
// The orchestration functions are mutually recursive (listen <-> turn <-> listen)
// and must always see the latest closures, so they live on an `impl` ref that's
// re-bound every render. Public methods and injected callbacks dispatch through
// it. This keeps the hook lint-clean (no refs written during render, no
// use-before-declare) and free of stale-closure bugs.

export type VoiceState = "idle" | "listening" | "transcribing" | "thinking" | "speaking" | "error";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type Caption = { role: "user" | "assistant"; content: string };
export type PendingProposal = {
  preview: string;
  token: string;
  status: "pending" | "applying" | "done" | "error";
  result?: string;
};

type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; phase: "start" | "end"; ok?: boolean }
  | { type: "proposal"; tool: string; preview: string; token: string }
  | { type: "conversation"; id: string; title?: string }
  | { type: "error"; message: string }
  | { type: "done" };

const MAX_HISTORY = 40;
const CONFIRM_RE = /\b(confirm|yes|yep|do it|go ahead|approve|apply)\b/i;
const CANCEL_RE = /\b(cancel|no|nope|stop|never ?mind|discard)\b/i;

export type VoiceSessionOptions = {
  initialHistory: ChatMessage[];
  conversationId: string | null;
  onConversationId?: (id: string) => void;
  /** Called when voice mode completes a turn, so the text chat can mirror it. */
  onTurn?: (turn: Caption) => void;
};

export type VoiceSession = {
  state: VoiceState;
  captions: Caption[];
  proposal: PendingProposal | null;
  error: string | null;
  /** Live level for the visualizer (mic while listening, TTS while speaking). */
  getLevel: () => number;
  start: () => Promise<void>;
  stop: () => void;
  /** Manually interrupt the assistant mid-reply and listen again. */
  interrupt: () => void;
  confirmProposal: () => void;
  cancelProposal: () => void;
};

type Impl = {
  startListening: () => void;
  handleUtterance: (blob: Blob) => Promise<void>;
  runAssistantTurn: () => Promise<void>;
  interrupt: () => void;
  confirmProposal: () => void;
  cancelProposal: () => void;
  onDrained: () => void;
};

export function useVoiceSession(opts: VoiceSessionOptions): VoiceSession {
  const mic = useMicCapture();
  const implRef = React.useRef<Impl>({
    startListening: () => {},
    handleUtterance: async () => {},
    runAssistantTurn: async () => {},
    interrupt: () => {},
    confirmProposal: () => {},
    cancelProposal: () => {},
    onDrained: () => {},
  });
  const playback = useAudioPlayback(() => implRef.current.onDrained());

  const [state, setState] = React.useState<VoiceState>("idle");
  const [captions, setCaptions] = React.useState<Caption[]>([]);
  const [proposal, setProposal] = React.useState<PendingProposal | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const activeRef = React.useRef(false);
  const stateRef = React.useRef<VoiceState>("idle");
  const historyRef = React.useRef<ChatMessage[]>(opts.initialHistory.slice());
  const conversationIdRef = React.useRef<string | null>(opts.conversationId);
  const proposalRef = React.useRef<PendingProposal | null>(null);
  const optsRef = React.useRef(opts);

  React.useEffect(() => {
    optsRef.current = opts;
  });

  // (Re)bind the orchestration functions to the latest closures every render.
  React.useEffect(() => {
    const go = (s: VoiceState) => {
      stateRef.current = s;
      setState(s);
    };
    const setProp = (p: PendingProposal | null) => {
      proposalRef.current = p;
      setProposal(p);
    };
    const pushCaption = (role: "user" | "assistant", content: string) => {
      setCaptions((prev) => [...prev, { role, content }]);
    };

    const startListening = () => {
      if (!activeRef.current) return;
      go("listening");
      mic.beginListen((blob) => void implRef.current.handleUtterance(blob));
    };

    const confirmProposal = () => {
      const p = proposalRef.current;
      if (!p || p.status !== "pending") return;
      setProp({ ...p, status: "applying" });
      void (async () => {
        try {
          const res = await fetch("/api/assistant/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: p.token }),
          });
          const data = await res.json().catch(() => null);
          if (res.ok && data?.ok) setProp({ ...p, status: "done", result: data.message });
          else setProp({ ...p, status: "error", result: data?.error ?? "Could not apply." });
        } catch {
          setProp({ ...p, status: "error", result: "Network error." });
        }
      })();
    };

    const cancelProposal = () => {
      const p = proposalRef.current;
      if (p) setProp({ ...p, status: "error", result: "Cancelled." });
    };

    const interrupt = () => {
      if (!activeRef.current) return;
      playback.stopAll();
      startListening();
    };

    const runAssistantTurn = async () => {
      go("thinking");
      const chunker = new SentenceChunker();
      let assistantText = "";
      let spokeAnything = false;

      const speak = (sentence: string) => {
        const clean = toSpeakable(sentence);
        if (!clean) return;
        if (stateRef.current !== "speaking") {
          go("speaking");
          mic.beginBargeIn(() => implRef.current.interrupt());
        }
        spokeAnything = true;
        const clip = fetch("/api/assistant/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: clean }),
        }).then((r) => {
          if (!r.ok) throw new Error("speak failed");
          return r.arrayBuffer();
        });
        playback.enqueue(clip);
      };

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: historyRef.current, conversationId: conversationIdRef.current }),
        });
        if (!res.ok || !res.body) throw new Error("assistant request failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handle = (evt: AssistantEvent) => {
          if (evt.type === "text") {
            assistantText += evt.text;
            for (const s of chunker.push(evt.text)) speak(s);
          } else if (evt.type === "proposal") {
            setProp({ preview: evt.preview, token: evt.token, status: "pending" });
          } else if (evt.type === "conversation") {
            conversationIdRef.current = evt.id;
            optsRef.current.onConversationId?.(evt.id);
          } else if (evt.type === "error") {
            setError(evt.message);
          }
        };

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) {
              try {
                handle(JSON.parse(line) as AssistantEvent);
              } catch {
                /* ignore a partial/garbled line */
              }
            }
          }
        }

        const tail = chunker.flush();
        if (tail) speak(tail);
      } catch {
        setError("The assistant could not respond. Try again.");
      }

      if (assistantText.trim()) {
        pushCaption("assistant", assistantText);
        optsRef.current.onTurn?.({ role: "assistant", content: assistantText });
        historyRef.current.push({ role: "assistant", content: assistantText });
      }

      // If nothing was spoken, playback's onDrained never fires — loop back here.
      if (!spokeAnything && activeRef.current) startListening();
    };

    const handleUtterance = async (blob: Blob) => {
      if (!activeRef.current) return;
      mic.endTurn();
      go("transcribing");

      let transcript = "";
      try {
        const fd = new FormData();
        fd.append("audio", blob, "speech.webm");
        const res = await fetch("/api/assistant/transcribe", { method: "POST", body: fd });
        if (res.ok) {
          const data = await res.json();
          transcript = typeof data?.text === "string" ? data.text.trim() : "";
        }
      } catch {
        /* fall through to empty transcript */
      }

      if (!activeRef.current) return;
      if (!transcript) {
        startListening(); // heard nothing intelligible; keep listening
        return;
      }

      // Voice confirm/cancel of a pending write, gated to the pending proposal.
      if (proposalRef.current?.status === "pending") {
        if (CONFIRM_RE.test(transcript) && !CANCEL_RE.test(transcript)) {
          pushCaption("user", transcript);
          confirmProposal();
          startListening();
          return;
        }
        if (CANCEL_RE.test(transcript)) {
          pushCaption("user", transcript);
          cancelProposal();
          startListening();
          return;
        }
      }

      pushCaption("user", transcript);
      optsRef.current.onTurn?.({ role: "user", content: transcript });
      historyRef.current.push({ role: "user", content: transcript });
      if (historyRef.current.length > MAX_HISTORY) {
        historyRef.current = historyRef.current.slice(-MAX_HISTORY);
      }

      await runAssistantTurn();
    };

    const onDrained = () => {
      if (activeRef.current && stateRef.current === "speaking") startListening();
    };

    implRef.current = {
      startListening,
      handleUtterance,
      runAssistantTurn,
      interrupt,
      confirmProposal,
      cancelProposal,
      onDrained,
    };
  });

  const getLevel = React.useCallback(() => {
    return stateRef.current === "speaking" ? playback.levelRef.current : mic.levelRef.current;
  }, [mic.levelRef, playback.levelRef]);

  const start = React.useCallback(async () => {
    setError(null);
    try {
      await playback.ensureContext();
      await mic.ensureReady();
    } catch {
      setError("I need microphone access to listen. Check your browser's mic permission.");
      stateRef.current = "error";
      setState("error");
      return;
    }
    activeRef.current = true;
    implRef.current.startListening();
  }, [mic, playback]);

  const stop = React.useCallback(() => {
    activeRef.current = false;
    playback.stopAll();
    mic.endTurn();
    mic.dispose();
    stateRef.current = "idle";
    setState("idle");
  }, [mic, playback]);

  const interrupt = React.useCallback(() => implRef.current.interrupt(), []);
  const confirmProposal = React.useCallback(() => implRef.current.confirmProposal(), []);
  const cancelProposal = React.useCallback(() => implRef.current.cancelProposal(), []);

  React.useEffect(() => {
    return () => {
      activeRef.current = false;
      playback.stopAll();
      mic.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, captions, proposal, error, getLevel, start, stop, interrupt, confirmProposal, cancelProposal };
}
