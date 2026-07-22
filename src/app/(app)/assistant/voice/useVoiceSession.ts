"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { SentenceChunker } from "@/lib/voice/sentence-chunker";
import { toSpeakable } from "@/lib/voice/speech";
import {
  createVoiceFocusSession,
  focusModeLabel,
  isTurnOffSpeakerRecognitionCommand,
  isTurnOnSpeakerRecognitionCommand,
  setVoiceFocusMode,
  type VoiceFocusMode,
  type VoiceFocusSession,
  type VoiceProfileState,
} from "@/lib/voice/focus";
import { appendTurn, appendTurns } from "@/lib/voice/history";
import { micErrorMessage } from "@/lib/voice/inline-ui";
import type { VoiceState } from "@/lib/voice/state-types";
import type { VoiceSettingsView } from "@/lib/voice/settings-types";
import { type AssistantEvent, parseEvent, splitNdjsonLines, isSafeInternalPath } from "@/lib/assistant/assistant-events";
import { clampHistoryForSend } from "@/lib/assistant/message-window";
import { readDraftGaps } from "@/lib/assistant/proposal-card";
import { useMicCapture } from "./useMicCapture";
import { useAudioPlayback } from "./useAudioPlayback";
import { useEarcons } from "./useEarcons";

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

// Re-exported so existing importers (AudioVisualizer, the voice UI) keep working while
// the canonical declaration lives in lib/ where the pure modules can reach it.
export type { VoiceState };

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type Caption = { role: "user" | "assistant"; content: string };
export type PendingProposal = {
  preview: string;
  /** Absent on a Draft — a Draft is not committable, by voice or by tap (plan 081 U4). */
  token?: string;
  draft?: boolean;
  status: "pending" | "applying" | "done" | "error";
  result?: string;
};

const CONFIRM_RE = /\b(confirm|yes|yep|do it|go ahead|approve|apply)\b/i;
const CANCEL_RE = /\b(cancel|no|nope|stop|never ?mind|discard)\b/i;

async function loadVoiceSettings(): Promise<VoiceSettingsView | null> {
  try {
    const res = await fetch("/api/assistant/voice/settings", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as VoiceSettingsView;
  } catch {
    return null;
  }
}

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
  focusMode: VoiceFocusMode;
  focusLabel: string;
  focusNotice: string | null;
  profileState: VoiceProfileState;
  unmatchedBursts: number;
  /** Live level for the visualizer (mic while listening, TTS while speaking). */
  getLevel: () => number;
  start: () => Promise<void>;
  stop: () => void;
  /** Manually interrupt the assistant mid-reply and listen again. */
  interrupt: () => void;
  /**
   * Hand the turn over NOW instead of waiting out the end-of-speech hangover.
   *
   * The listen VAD waits up to ~3s on a long, pause-heavy turn so it stops cutting
   * people off mid-thought; that patience needs an opt-out or it just trades one
   * complaint for a slower one. No-op unless we're actually listening.
   */
  finishTurn: () => void;
  /**
   * Merge turn(s) that happened OUTSIDE the voice loop into this session's history.
   *
   * Inline voice (plan 089) leaves the text composer usable mid-session, and a typed
   * exchange goes through the chat's own send path — the voice session never sees it.
   * Without this the assistant answers the next spoken question against a history that
   * is missing what the user just wrote: type "log 22.4 for Block 3", say "make it 23",
   * get back "make what 23?". History-only; it starts no turn and changes no state.
   */
  appendHistory: (turns: ChatMessage | ChatMessage[]) => void;
  openToAnyone: () => void;
  setMyVoice: () => void;
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
  const router = useRouter();
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
  const [focus, setFocus] = React.useState<VoiceFocusSession>(() => createVoiceFocusSession("open", "not_enrolled"));
  const [focusNotice, setFocusNotice] = React.useState<string | null>(null);

  const activeRef = React.useRef(false);
  const stateRef = React.useRef<VoiceState>("idle");
  const focusRef = React.useRef<VoiceFocusSession>(focus);
  const historyRef = React.useRef<ChatMessage[]>(opts.initialHistory.slice());
  const conversationIdRef = React.useRef<string | null>(opts.conversationId);
  const proposalRef = React.useRef<PendingProposal | null>(null);
  const optsRef = React.useRef(opts);
  // Turn supersession: every assistant turn captures `turnRef.current`. interrupt(),
  // stop(), and barge-in bump it (and abort the in-flight request), so a superseded
  // turn's stream callbacks bail instead of talking over the user / a closed session.
  const turnRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);
  // True once the current turn's assistant stream has fully arrived. onDrained only
  // loops back to listening when this is set, so a transient queue-drain mid-stream
  // (network jitter between sentences) doesn't flip us to listening early.
  const streamDoneRef = React.useRef(false);
  // The "I'm listening now" earcon fires once per session, on the FIRST time we are
  // ready for the user. This ref is what makes it once — the hook lives as long as
  // the session does, so ending voice and starting again correctly plays it anew.
  const readyChimedRef = React.useRef(false);

  React.useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  // Earcons play through the TTS AudioContext (see useEarcons for why HTMLAudio was
  // silent on mobile). They therefore depend on `playback.ensureContext()` having run,
  // which start() awaits first — so by the time either cue fires the context is live.
  const earcons = useEarcons(playback.getContext);

  // Ambient bed while the assistant works out its reply, so the wait isn't dead
  // silence. Driven off the rendered state (not the impl ref) so every path that
  // leaves "thinking" — reply, barge-in, interrupt, error, stop — silences it.
  React.useEffect(() => {
    if (state === "thinking") earcons.startThinking();
    else earcons.stopThinking();
  }, [state, earcons]);

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
    const updateFocus = (next: VoiceFocusSession, notice?: string | null) => {
      focusRef.current = next;
      setFocus(next);
      if (notice !== undefined) setFocusNotice(notice);
    };
    const startListening = () => {
      if (!activeRef.current) return;
      if (stateRef.current === "listening") return; // already listening; don't stack
      go("listening");

      const armMic = () => {
        // Re-check: arming can be deferred behind the ready earcon, and in that gap
        // the user may have ended the session or a newer turn may have taken over.
        if (!activeRef.current || stateRef.current !== "listening") return;
        mic.beginListen((blob) => void implRef.current.handleUtterance(blob));
      };

      // First time we're ready in this session: sound the earcon, and only open the
      // mic once it has finished. The clip is ~2.1s, well past the listen VAD's
      // 250ms cough/click filter, so arming first would risk transcribing our own
      // cue as the user's opening words — `echoCancellation` is a mitigation, not a
      // guarantee. Every failure path in `play` still calls back, so a blocked or
      // missing earcon costs the user nothing.
      if (readyChimedRef.current) {
        armMic();
        return;
      }
      readyChimedRef.current = true;
      earcons.playReady(armMic);
    };

    // Invalidate the in-flight assistant turn (stream + pending TTS) so its
    // callbacks bail. Used by interrupt(), stop(), and barge-in.
    const supersedeTurn = () => {
      turnRef.current++;
      abortRef.current?.abort();
      abortRef.current = null;
    };

    const confirmProposal = () => {
      const p = proposalRef.current;
      if (!p || p.status !== "pending") return;
      // A Draft has no token: saying "confirm" must not commit anything. Say why and leave it pending.
      if (!p.token) return;
      const token = p.token;
      setProp({ ...p, status: "applying" });
      void (async () => {
        try {
          const res = await fetch("/api/assistant/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const data = await res.json().catch(() => null);
          if (!activeRef.current) return; // overlay closed mid-request
          if (res.ok && data?.ok) {
            setProp({ ...p, status: "done", result: data.message });
            // Bust the client Router Cache so the page behind the overlay reflects the write (the
            // committer's server-side revalidatePath doesn't reach the client). Mirrors AssistantChat.
            router.refresh();
          } else setProp({ ...p, status: "error", result: data?.error ?? "Could not apply." });
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
      supersedeTurn();
      playback.stopAll();
      startListening();
    };

    const runAssistantTurn = async () => {
      const myTurn = ++turnRef.current;
      const ac = new AbortController();
      abortRef.current = ac;
      const isCurrent = () => activeRef.current && turnRef.current === myTurn;
      streamDoneRef.current = false;
      go("thinking");
      const chunker = new SentenceChunker();
      let assistantText = "";

      const speak = (sentence: string) => {
        if (!isCurrent()) return; // superseded turn must not talk
        const clean = toSpeakable(sentence);
        if (!clean) return;
        if (stateRef.current !== "speaking") {
          go("speaking");
          // Pass the live TTS output level so barge-in discounts the assistant's own
          // echo — the user can interrupt by voice without the assistant self-interrupting.
          mic.beginBargeIn(() => implRef.current.interrupt(), {
            getOutputLevel: () => playback.levelRef.current,
          });
        }
        const clip = fetch("/api/assistant/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: clean }),
          signal: ac.signal,
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
          // `voice: true` asks the server for a SPOKEN-style reply (no markdown, no
          // read-aloud citations, units as words). Same brain + same history otherwise.
          body: JSON.stringify({
            messages: clampHistoryForSend(historyRef.current),
            conversationId: conversationIdRef.current,
            voice: true,
          }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error("assistant request failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // EXHAUSTIVE (plan 081 U8, council S1) — see the matching switch in AssistantChat. The `never`
        // default means a new AssistantEvent variant cannot ship until voice mode has decided what it
        // does about it, rather than silently no-op'ing in the one client nobody is looking at.
        const handle = (evt: AssistantEvent) => {
          switch (evt.type) {
            case "text":
              assistantText += evt.text;
              for (const s of chunker.push(evt.text)) speak(s);
              return;
            case "proposal": {
              const draft = evt.draft === true;
              setProp({ preview: evt.preview, ...(draft ? { draft: true } : { token: evt.token }), status: "pending" });
              // Plan 081 U8 — DEFINED voice behavior for a Draft: say what it needs, then defer to the
              // visual card. Deliberately NOT attempting in-voice field resolution: dictating an email
              // address or a lot code through STT is exactly where a wrong value gets committed, and a
              // draft is the state where a wrong value is most likely. Voice can still confirm a READY
              // card by saying "confirm" — that path is unchanged.
              if (draft) {
                const gaps = readDraftGaps(evt.details);
                speak(
                  gaps.blocking > 0
                    ? "I've put a draft on screen, but it can't be issued as written — the blocker is on the card."
                    : gaps.unresolved > 0
                      ? `I've put a draft on screen. It still needs ${gaps.labels.join(" and ")}. Have a look at the card.`
                      : "I've put a draft on screen — it isn't ready to issue yet. Have a look at the card.",
                );
              }
              return;
            }
            case "navigate":
              // Hands-free: navigate the page BEHIND the overlay and keep the
              // session alive so the user can issue a follow-up. We don't stop() /
              // close — the overlay stays up and speaks a short confirmation.
              if (evt.auto && isSafeInternalPath(evt.path)) {
                speak(`Showing ${evt.label}.`);
                router.push(evt.path);
              }
              return;
            case "conversation":
              conversationIdRef.current = evt.id;
              optsRef.current.onConversationId?.(evt.id);
              return;
            case "error":
              setError(evt.message);
              return;
            // Deliberately silent in voice mode: `tool` is a visual progress label, `choice` is a
            // tap-only picker (never spoken — see the same reasoning as drafts), `message` is an id
            // bookkeeping event, and `done` is handled by the reader loop.
            case "tool":
            case "choice":
            case "message":
            case "done":
              return;
            default: {
              const unhandled: never = evt;
              if (process.env.NODE_ENV !== "production") console.warn("[voice] unhandled event", unhandled);
              return;
            }
          }
        };

        const drainLines = () => {
          const { lines, rest } = splitNdjsonLines(buffer);
          buffer = rest;
          for (const line of lines) {
            const evt = parseEvent(line);
            if (evt) handle(evt);
          }
        };

        let endedNaturally = false;
        for (;;) {
          if (!isCurrent()) {
            await reader.cancel().catch(() => {});
            break;
          }
          const { value, done } = await reader.read();
          if (done) {
            endedNaturally = true;
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          drainLines();
        }

        // Flush a residual line with no terminating newline (truncated stream) so a trailing event
        // is not silently dropped. Only on a natural end — an abort/barge-in is intentional, and
        // replaying its tail would speak or card something the user just interrupted.
        if (endedNaturally) {
          buffer += decoder.decode();
          drainLines();
          if (buffer.trim()) {
            const evt = parseEvent(buffer);
            if (evt) handle(evt);
          }
        }

        const tail = chunker.flush();
        if (tail) speak(tail);
      } catch (e) {
        // An abort (interrupt/stop/barge-in) is intentional, not an error.
        if (isCurrent() && (e as Error)?.name !== "AbortError") {
          setError("The assistant could not respond. Try again.");
        }
      }

      if (!isCurrent()) return; // superseded while streaming — newer turn owns the UI

      if (assistantText.trim()) {
        pushCaption("assistant", assistantText);
        optsRef.current.onTurn?.({ role: "assistant", content: assistantText });
        historyRef.current = appendTurn(historyRef.current, { role: "assistant", content: assistantText });
      }

      // Stream fully arrived. If audio already finished (or none was queued), loop
      // back now; otherwise onDrained handles it once the queue empties.
      streamDoneRef.current = true;
      if (!playback.isActiveRef.current) startListening();
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

      if (isTurnOffSpeakerRecognitionCommand(transcript)) {
        const next = setVoiceFocusMode(focusRef.current, "team_session");
        updateFocus(next, "Open to anyone for this session.");
        pushCaption("user", transcript);
        startListening();
        return;
      }
      if (isTurnOnSpeakerRecognitionCommand(transcript)) {
        const next = setVoiceFocusMode(focusRef.current, "my_voice");
        updateFocus(
          next,
          next.mode === "my_voice" ? "Listening only to you." : "Set up voice recognition first.",
        );
        pushCaption("user", transcript);
        startListening();
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
      historyRef.current = appendTurn(historyRef.current, { role: "user", content: transcript });

      await runAssistantTurn();
    };

    const onDrained = () => {
      // Only loop back once the stream is fully in (guards transient mid-stream
      // drains). A stopped queue never fires onDrained, so this is current-turn only.
      if (activeRef.current && stateRef.current === "speaking" && streamDoneRef.current) {
        startListening();
      }
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
    // A session begins here, so the ready earcon is owed again. In practice the
    // panel remounts per session (fresh refs anyway), but tying it to start()
    // rather than to a mount coincidence is what actually states the contract.
    readyChimedRef.current = false;
    try {
      await playback.ensureContext();
      // Context is live, so decode the earcons now, in parallel with the mic
      // permission prompt. The ready cue holds the mic closed until it finishes, and
      // a cold fetch+decode inside that window would be dead air the user just waits
      // through. Fire-and-forget: failure is handled at play time.
      earcons.preload();
      await mic.ensureReady();
      const settings = await loadVoiceSettings();
      if (settings) {
        const next = createVoiceFocusSession(settings.preference.defaultFocusMode, settings.profile.state);
        focusRef.current = next;
        setFocus(next);
        setFocusNotice(focusModeLabel(next.mode));
      }
    } catch (e) {
      // Distinguish the failure modes: a blocked permission, no mic on the device, and
      // "another app already holds the mic" need different actions from the user, and the
      // last one is common in a cellar where a phone is already running something.
      setError(micErrorMessage(e));
      stateRef.current = "error";
      setState("error");
      return;
    }
    activeRef.current = true;
    implRef.current.startListening();
  }, [mic, playback, earcons]);

  const stop = React.useCallback(() => {
    activeRef.current = false;
    turnRef.current++; // invalidate any in-flight turn
    abortRef.current?.abort();
    abortRef.current = null;
    playback.stopAll();
    mic.endTurn();
    mic.dispose();
    stateRef.current = "idle";
    setState("idle");
  }, [mic, playback]);

  const interrupt = React.useCallback(() => implRef.current.interrupt(), []);
  // Not routed through implRef: it needs no live closure, only the stable mic handle,
  // and the state guard reads the same ref the orchestration functions write.
  const finishTurn = React.useCallback(() => {
    if (!activeRef.current || stateRef.current !== "listening") return;
    mic.finishListening();
  }, [mic]);
  // Ref-only write: history is not rendered, so merging a typed exchange must NOT
  // re-render the session (and with it the whole chat subtree) mid-conversation.
  const appendHistory = React.useCallback((turns: ChatMessage | ChatMessage[]) => {
    historyRef.current = appendTurns(historyRef.current, Array.isArray(turns) ? turns : [turns]);
  }, []);
  const openToAnyone = React.useCallback(() => {
    const next = setVoiceFocusMode(focusRef.current, "team_session");
    focusRef.current = next;
    setFocus(next);
    setFocusNotice("Open to anyone for this session.");
  }, []);
  const setMyVoice = React.useCallback(() => {
    const next = setVoiceFocusMode(focusRef.current, "my_voice");
    focusRef.current = next;
    setFocus(next);
    setFocusNotice(next.mode === "my_voice" ? "Listening only to you." : "Set up voice recognition first.");
  }, []);
  const confirmProposal = React.useCallback(() => implRef.current.confirmProposal(), []);
  const cancelProposal = React.useCallback(() => implRef.current.cancelProposal(), []);

  React.useEffect(() => {
    return () => {
      activeRef.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional write: invalidate in-flight turn at unmount
      turnRef.current++;
      abortRef.current?.abort();
      abortRef.current = null;
      playback.stopAll();
      mic.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    state,
    captions,
    proposal,
    error,
    focusMode: focus.mode,
    focusLabel: focusModeLabel(focus.mode),
    focusNotice,
    profileState: focus.profileState,
    unmatchedBursts: focus.unmatchedBursts,
    getLevel,
    start,
    stop,
    interrupt,
    finishTurn,
    appendHistory,
    openToAnyone,
    setMyVoice,
    confirmProposal,
    cancelProposal,
  };
}
