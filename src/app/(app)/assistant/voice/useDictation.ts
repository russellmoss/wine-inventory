"use client";

import React from "react";

// Lightweight push-to-talk dictation: record one utterance, transcribe it (ElevenLabs
// Scribe via /api/assistant/transcribe), hand the text back. Deliberately SEPARATE from
// useMicCapture/useVoiceSession — dictation wants an explicit user Stop (not VAD silence
// detection, which would cut off a pause mid-thought) and no TTS/think loop. Keeping it
// standalone also means the tested conversation path is untouched.

export type DictationState = "idle" | "recording" | "transcribing";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export type Dictation = {
  state: DictationState;
  error: string | null;
  /** Begin recording (asks for mic permission on first use). No-op unless idle. */
  start: () => Promise<void>;
  /** Stop recording and transcribe; the resolved text is delivered via onText. */
  stop: () => void;
  /** Abort recording without transcribing and release the mic (e.g. dock collapse). */
  cancel: () => void;
};

export function useDictation(onText: (text: string) => void): Dictation {
  const [state, setState] = React.useState<DictationState>("idle");
  const [error, setError] = React.useState<string | null>(null);

  const streamRef = React.useRef<MediaStream | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);

  // Latest callback without retriggering the memoized start/stop/cancel.
  const onTextRef = React.useRef(onText);
  React.useEffect(() => {
    onTextRef.current = onText;
  });

  const releaseStream = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = React.useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mime = pickMimeType();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = mime ?? "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        releaseStream();
        if (blob.size === 0) {
          setState("idle");
          return;
        }
        setState("transcribing");
        void (async () => {
          try {
            const fd = new FormData();
            fd.append("audio", blob, "speech.webm");
            const res = await fetch("/api/assistant/transcribe", { method: "POST", body: fd });
            const data = res.ok ? await res.json().catch(() => null) : null;
            const text = typeof data?.text === "string" ? data.text.trim() : "";
            if (text) onTextRef.current(text);
            else setError("Didn't catch that — try again.");
          } catch {
            setError("Transcription failed. Try again.");
          } finally {
            setState("idle");
          }
        })();
      };
      recorderRef.current = rec;
      rec.start();
      setState("recording");
    } catch {
      releaseStream();
      setState("idle");
      setError("Microphone unavailable. Check browser permissions.");
    }
  }, [releaseStream]);

  const stop = React.useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== "inactive") rec.stop(); // onstop transcribes + releases the mic
  }, []);

  const cancel = React.useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec) {
      rec.onstop = null; // drop the pending transcription
      if (rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          /* already stopped */
        }
      }
    }
    chunksRef.current = [];
    releaseStream();
    setState("idle");
  }, [releaseStream]);

  // Never leave the mic live if the component unmounts mid-recording.
  React.useEffect(() => () => cancel(), [cancel]);

  return React.useMemo(() => ({ state, error, start, stop, cancel }), [state, error, start, stop, cancel]);
}
