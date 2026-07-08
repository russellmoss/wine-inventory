"use client";

import React from "react";
import { Badge, Button, Card, ConfirmButton } from "@/components/ui";
import type { VoiceFocusMode } from "@/lib/voice/focus";
import type { VoiceSettingsView } from "@/lib/voice/settings-types";
import { deleteVoiceProfile, enrollVoiceProfile, saveVoicePreference } from "@/lib/voice/actions";
import { computeVoiceprintFromBlob } from "@/app/(app)/assistant/voice/voiceprint-client";

const SAMPLE_PROMPTS = [
  "Hey Cellarhand, show me the cellar work for today.",
  "Hey Cellarhand, listen only to my voice in this session.",
  "Hey Cellarhand, open this session to anyone on the team.",
];
const MAX_SAMPLE_MS = 15_000;

function badgeFor(state: VoiceSettingsView["profile"]["state"]) {
  if (state === "active") return { tone: "green" as const, label: "Active" };
  if (state === "needs_reenroll") return { tone: "gold" as const, label: "Needs re-enrollment" };
  return { tone: "neutral" as const, label: "Not enrolled" };
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function VoiceRecognitionCard({ initial }: { initial: VoiceSettingsView }) {
  const [settings, setSettings] = React.useState(initial);
  const [consented, setConsented] = React.useState(false);
  const [sampleIndex, setSampleIndex] = React.useState(0);
  const [vectors, setVectors] = React.useState<number[][]>([]);
  const [enrolling, setEnrolling] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const timeoutRef = React.useRef<number | null>(null);
  const status = badgeFor(settings.profile.state);
  const enrolled = settings.profile.state === "active";

  function cleanupRecorder(updateState = true) {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    if (updateState) setRecording(false);
  }

  React.useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      cleanupRecorder(false);
    };
  }, []);

  function resetEnrollment() {
    setSampleIndex(0);
    setVectors([]);
    setError(null);
  }

  async function processSample(blob: Blob) {
    setError(null);
    setMessage(null);
    try {
      const vector = await computeVoiceprintFromBlob(blob);
      const nextVectors = [...vectors, vector];
      setVectors(nextVectors);
      if (nextVectors.length >= 3) {
        startTransition(async () => {
          try {
            const saved = await enrollVoiceProfile({ vectors: nextVectors, consentAccepted: consented });
            setSettings(saved);
            resetEnrollment();
            setEnrolling(false);
            setConsented(false);
            setMessage("Voice recognition is active.");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not enroll your voice.");
          }
        });
      } else {
        setSampleIndex((i) => i + 1);
        setMessage("Sample saved.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That sample was hard to hear. Try again somewhere quieter.");
    }
  }

  async function startSampleRecording() {
    setError(null);
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
        cleanupRecorder();
        if (blob.size > 0) void processSample(blob);
      };
      recorder.start();
      setRecording(true);
      setMessage("Recording. Read the line at your pace, then stop.");
      timeoutRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, MAX_SAMPLE_MS);
    } catch (err) {
      cleanupRecorder();
      setError(err instanceof Error ? err.message : "Cellarhand needs mic access to set up voice recognition.");
    }
  }

  function stopSampleRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    setMessage("Saving sample...");
    recorder.stop();
  }

  function savePreference(patch: { defaultFocusMode?: VoiceFocusMode; audioIsolationEnabled?: boolean; wakeWordEnabled?: boolean }) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const saved = await saveVoicePreference(patch);
        setSettings(saved);
        setMessage("Saved.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save voice settings.");
      }
    });
  }

  function removeProfile() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const saved = await deleteVoiceProfile();
        setSettings(saved);
        resetEnrollment();
        setEnrolling(false);
        setMessage("Voiceprint deleted.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete your voiceprint.");
      }
    });
  }

  return (
    <Card style={{ maxWidth: 560, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0 }}>Voice recognition</h2>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>
      <p style={{ color: "var(--text-secondary)", margin: "6px 0 16px", fontSize: 14.5, maxWidth: "50ch" }}>
        Help voice mode ignore taps, music, and other people by recognizing when it is you talking.
      </p>

      {!settings.available ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14.5, margin: 0 }}>
          {settings.unavailableReason ?? "Voice recognition is not available on this winery yet."}
        </p>
      ) : (
        <>
          {!enrolled || enrolling ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14.5 }}>
                <input
                  type="checkbox"
                  checked={consented}
                  onChange={(e) => setConsented(e.target.checked)}
                  style={{ width: 18, height: 18, marginTop: 2 }}
                />
                <span>
                  We will create a mathematical voiceprint so Cellarhand can tell when it is you talking. We do not
                  keep your recorded audio. This is not a password; sign-in and change confirmations still protect your
                  work. You can delete your voiceprint any time.
                </span>
              </label>
              <div
                aria-live="polite"
                style={{
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-strong)",
                  background: "var(--surface-sunken)",
                }}
              >
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
                  Sample {Math.min(sampleIndex + 1, 3)} of 3
                </div>
                <div style={{ fontSize: 15, color: "var(--text-primary)" }}>{SAMPLE_PROMPTS[sampleIndex] ?? SAMPLE_PROMPTS[2]}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {recording ? (
                  <Button size="lg" onClick={stopSampleRecording} style={{ minWidth: 180 }}>
                    Stop recording
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    disabled={!consented || pending}
                    onClick={() => void startSampleRecording()}
                    style={{ minWidth: 180 }}
                  >
                    {pending ? "Saving..." : "Start recording"}
                  </Button>
                )}
                <span style={{ color: "var(--text-muted)", fontSize: 12.5 }}>
                  {vectors.length}/3 samples captured
                </span>
                {enrolled ? (
                  <Button variant="ghost" disabled={recording || pending} onClick={() => { resetEnrollment(); setEnrolling(false); }}>
                    Cancel re-enrollment
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 14.5, color: "var(--text-secondary)" }}>
                Quality: {settings.profile.qualityLabel ?? "Good"}. Raw recordings are not stored.
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 260 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Default voice mode</span>
                <select
                  value={settings.preference.defaultFocusMode}
                  onChange={(e) => savePreference({ defaultFocusMode: e.target.value as VoiceFocusMode })}
                  disabled={pending}
                  style={{
                    height: 44,
                    padding: "0 12px",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--surface-raised)",
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="open">Open</option>
                  <option value="my_voice">My voice</option>
                  <option value="team_session">Team session</option>
                </select>
              </label>
              <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14.5 }}>
                <input
                  type="checkbox"
                  checked={settings.preference.audioIsolationEnabled}
                  onChange={(e) => savePreference({ audioIsolationEnabled: e.target.checked })}
                  disabled={pending}
                  style={{ width: 18, height: 18 }}
                />
                Clean noisy audio before transcription when possible
              </label>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14.5 }}>
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => {}}
                  disabled
                  style={{ width: 18, height: 18, marginTop: 2 }}
                />
                <span>
                  Wake phrase while Cellarhand is open
                  <span style={{ display: "block", color: "var(--text-muted)", fontSize: 12.5, marginTop: 2 }}>
                    Disabled while we replace the prototype with the openWakeWord ONNX implementation.
                  </span>
                </span>
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <Button variant="secondary" onClick={() => { resetEnrollment(); setEnrolling(true); }} disabled={pending}>
                  Re-enroll
                </Button>
                <ConfirmButton onConfirm={removeProfile} disabled={pending} confirmLabel="Delete">
                  Delete voiceprint
                </ConfirmButton>
              </div>
            </div>
          )}
          {!enrolled || enrolling ? (
            <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 16, paddingTop: 14 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14.5 }}>
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => {}}
                  disabled
                  style={{ width: 18, height: 18, marginTop: 2 }}
                />
                <span>
                  Wake phrase while Cellarhand is open
                  <span style={{ display: "block", color: "var(--text-muted)", fontSize: 12.5, marginTop: 2 }}>
                    Disabled while we replace the prototype with the openWakeWord ONNX implementation.
                  </span>
                </span>
              </label>
            </div>
          ) : null}
        </>
      )}

      {message ? <p aria-live="polite" style={{ color: "var(--positive)", margin: "12px 0 0", fontSize: 14 }}>{message}</p> : null}
      {error ? <p aria-live="assertive" style={{ color: "var(--danger)", margin: "12px 0 0", fontSize: 14 }}>{error}</p> : null}
    </Card>
  );
}
