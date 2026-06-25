"use client";

import React from "react";
import { Button } from "@/components/ui";
import { AudioVisualizer } from "./AudioVisualizer";
import {
  useVoiceSession,
  type ChatMessage,
  type Caption,
  type VoiceState,
} from "./useVoiceSession";

// Full-screen talking surface. Opens from the chat, runs the hands-free loop via
// useVoiceSession, and shows the visualizer + live captions + a state line. Write
// proposals render the same confirm card the text chat uses; nothing commits
// without an explicit tap (or a spoken "confirm").

type Props = {
  initialHistory: ChatMessage[];
  conversationId: string | null;
  onConversationId: (id: string) => void;
  onTurn: (turn: Caption) => void;
  onClose: () => void;
};

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Starting…",
  listening: "Listening…",
  transcribing: "Got it…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Voice unavailable",
};

export function VoiceOverlay({ initialHistory, conversationId, onConversationId, onTurn, onClose }: Props) {
  const session = useVoiceSession({ initialHistory, conversationId, onConversationId, onTurn });
  const captionsRef = React.useRef<HTMLDivElement>(null);

  // Keep a live handle to the session so the mount-once effect always calls the
  // latest start/stop without taking them as deps (which would retrigger it).
  const sessionRef = React.useRef(session);
  React.useEffect(() => {
    sessionRef.current = session;
  });

  // Start the hands-free loop exactly once on mount; stop exactly once on unmount.
  React.useEffect(() => {
    void sessionRef.current.start();
    return () => sessionRef.current.stop();
  }, []);

  React.useEffect(() => {
    captionsRef.current?.scrollTo({ top: captionsRef.current.scrollHeight, behavior: "smooth" });
  }, [session.captions]);

  function close() {
    sessionRef.current.stop();
    onClose();
  }

  // Esc closes voice mode.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Voice mode"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--surface-page)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-5)",
        padding: "var(--space-5)",
        fontFamily: "var(--font-body)",
      }}
    >
      <button
        type="button"
        onClick={close}
        aria-label="Close voice mode"
        style={{
          position: "absolute",
          top: "var(--space-4)",
          right: "var(--space-4)",
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 22,
          lineHeight: 1,
          color: "var(--text-muted)",
        }}
      >
        ✕
      </button>

      <AudioVisualizer getLevel={session.getLevel} state={session.state} />

      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 300,
          fontSize: "var(--text-h2)",
          color: session.state === "error" ? "var(--danger)" : "var(--text-primary)",
          letterSpacing: "0.02em",
        }}
        aria-live="polite"
      >
        {STATE_LABEL[session.state]}
      </div>

      {session.error ? (
        <div style={{ color: "var(--danger)", fontSize: "var(--text-body-sm)", maxWidth: 460, textAlign: "center" }}>
          {session.error}{" "}
          <button type="button" onClick={close} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
            Switch to text
          </button>
        </div>
      ) : null}

      {/* Live captions: the recent back-and-forth. */}
      <div
        ref={captionsRef}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "26vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        {session.captions.slice(-8).map((c, i) => (
          <div
            key={i}
            style={{
              alignSelf: c.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "8px 14px",
              borderRadius: "var(--radius-lg)",
              background: c.role === "user" ? "var(--accent)" : "var(--surface-raised)",
              color: c.role === "user" ? "var(--accent-on)" : "var(--text-primary)",
              fontSize: "var(--text-body-sm)",
              lineHeight: "var(--leading-normal)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {c.content}
          </div>
        ))}
      </div>

      {session.proposal ? (
        <ProposalCard
          preview={session.proposal.preview}
          status={session.proposal.status}
          result={session.proposal.result}
          onConfirm={session.confirmProposal}
          onCancel={session.cancelProposal}
        />
      ) : null}

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        {session.state === "speaking" ? (
          <Button variant="secondary" onClick={session.interrupt}>
            Interrupt
          </Button>
        ) : null}
        <Button variant="secondary" onClick={close}>
          End
        </Button>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--text-muted)", maxWidth: 480, textAlign: "center" }}>
        Speak naturally — I&rsquo;ll answer out loud. Changes still need your confirmation.
      </div>
    </div>
  );
}

function ProposalCard({
  preview,
  status,
  result,
  onConfirm,
  onCancel,
}: {
  preview: string;
  status: "pending" | "applying" | "done" | "error";
  result?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const done = status === "done";
  const errored = status === "error";
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 560,
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface-raised)",
        border: `1px solid ${done ? "var(--positive)" : errored ? "var(--danger)" : "var(--accent)"}`,
      }}
    >
      <div style={{ fontSize: "var(--text-body-sm)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 6 }}>
        Confirm change
      </div>
      <div style={{ fontSize: "var(--text-body)", color: "var(--text-primary)", marginBottom: 12 }}>{preview}</div>
      {status === "pending" || status === "applying" ? (
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button onClick={onConfirm} disabled={status === "applying"}>
            {status === "applying" ? "Applying…" : "Confirm"}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={status === "applying"}>
            Cancel
          </Button>
        </div>
      ) : (
        <div style={{ fontSize: "var(--text-body-sm)", color: done ? "var(--positive)" : "var(--danger)" }}>
          {done ? `✓ ${result ?? "Applied."}` : result ?? "Not applied."}
        </div>
      )}
    </div>
  );
}
