"use client";

import React from "react";
import { Button } from "@/components/ui";
import { focusAction } from "@/lib/voice/focus";
import { voiceAnnouncement, voiceControlAvailability } from "@/lib/voice/inline-ui";
import type { VoiceState } from "@/lib/voice/state-types";
import {
  useVoiceSession,
  type ChatMessage,
  type Caption,
} from "./useVoiceSession";

// Inline voice mode (plan 089). Replaces the full-screen VoiceOverlay.
//
// What this is NOT, deliberately: not `position: fixed`, not `role="dialog"`, not
// `aria-modal`, and above all not a focus trap. The entire point of the change is that
// the assistant can navigate the app mid-conversation and the user can SEE and USE the
// page it landed on. A trap would keep the page keyboard-unreachable even though it is
// now visible, which is the same bug wearing a nicer hat.
//
// Layout: this renders between the chat transcript and the composer. The transcript IS
// the caption stream (voice turns are mirrored into it by the chat), so there is no
// separate caption list here. The confirm card is PINNED above the composer rather than
// appended to the scroller: ticket #203 was "Confirm does nothing", caused by a confirm
// card landing below the fold where its buttons were clipped, and a 440x620 dock makes
// that far easier to hit than the old full-screen surface did.

export type VoiceSessionApi = {
  /** Merge a turn that happened outside the voice loop (a typed message) into history. */
  appendHistory: (turns: ChatMessage | ChatMessage[]) => void;
  /** True while a voice turn is mid-flight, so the chat can refuse a competing send. */
  isTurnActive: () => boolean;
};

type Props = {
  initialHistory: ChatMessage[];
  conversationId: string | null;
  onConversationId: (id: string) => void;
  onTurn: (turn: Caption) => void;
  onClose: () => void;
  /** Lifts the state enum + a stable level getter so the dock header can draw the orb. */
  onVoiceStatus: (state: VoiceState | null, getLevel: () => number) => void;
  /** Hands the chat the history bridge + turn-activity probe. Null on teardown. */
  onSessionApi: (api: VoiceSessionApi | null) => void;
  /** True until the first voice turn lands, so first-run guidance can retire itself. */
  showFirstRunHint: boolean;
};

/** A voice turn is "active" for anything past listening — the assistant owns the floor. */
function isTurnActiveState(state: VoiceState): boolean {
  return state === "transcribing" || state === "thinking" || state === "speaking";
}

export function VoiceInlinePanel({
  initialHistory,
  conversationId,
  onConversationId,
  onTurn,
  onClose,
  onVoiceStatus,
  onSessionApi,
  showFirstRunHint,
}: Props) {
  const session = useVoiceSession({ initialHistory, conversationId, onConversationId, onTurn });

  // Live handle so the mount-once effect always calls the latest start/stop without
  // taking them as deps (which would restart the session on every render).
  const sessionRef = React.useRef(session);
  React.useEffect(() => {
    sessionRef.current = session;
  });

  React.useEffect(() => {
    void sessionRef.current.start();
    return () => sessionRef.current.stop();
  }, []);

  const close = React.useCallback(() => {
    sessionRef.current.stop();
    onClose();
  }, [onClose]);

  // No focus management on mount, and that is deliberate: the "Talk" button the user
  // just pressed becomes "End" in place — same DOM node, only the label changes — so
  // focus already sits on the right control and moving it would be the disruptive act.
  // Escape is owned by the dock, which routes it here; this component does not add a
  // second window listener (two sibling listeners on one target is exactly the
  // order-dependent coupling this change removes).

  // --- Status lift -------------------------------------------------------------------
  // Reported from an EFFECT keyed on the primitive state, never during render (React 19
  // warns on cross-component updates) and never with a freshly-allocated object in the
  // dep list (that would re-publish on every render and drag the whole chat subtree
  // through a re-render at audio frame rate).
  const statusCbRef = React.useRef(onVoiceStatus);
  React.useEffect(() => {
    statusCbRef.current = onVoiceStatus;
  });
  const getLevel = session.getLevel;
  React.useEffect(() => {
    statusCbRef.current(session.state, getLevel);
  }, [session.state, getLevel]);
  React.useEffect(() => {
    return () => statusCbRef.current(null, () => 0);
  }, []);

  // --- Session API bridge ------------------------------------------------------------
  // The chat needs two things from the live session: somewhere to put a typed exchange
  // (or the assistant forgets it), and a way to ask "is a voice turn in flight?" before
  // starting a text turn. Both read through refs, so the object identity is stable and
  // publishing it does not re-render anything.
  const stateRef = React.useRef(session.state);
  React.useEffect(() => {
    stateRef.current = session.state;
  }, [session.state]);
  const appendHistory = session.appendHistory;
  const apiCbRef = React.useRef(onSessionApi);
  React.useEffect(() => {
    apiCbRef.current = onSessionApi;
  });
  React.useEffect(() => {
    const api: VoiceSessionApi = {
      appendHistory,
      isTurnActive: () => isTurnActiveState(stateRef.current),
    };
    apiCbRef.current(api);
    return () => apiCbRef.current(null);
  }, [appendHistory]);

  // --- Announcements -----------------------------------------------------------------
  // ONE polite live region for the whole voice UI. The raw state label would fire four
  // times per exchange, which is unusable with a screen reader; voiceAnnouncement()
  // returns null for routine cycling. Note the chat already owns two other live regions
  // (draft-card details, and the nav toast at assertive) — this is the third and last.
  const [announcement, setAnnouncement] = React.useState("");
  const prevStateRef = React.useRef<VoiceState>(session.state);
  const turnCountRef = React.useRef(0);
  React.useEffect(() => {
    const prev = prevStateRef.current;
    const next = session.state;
    prevStateRef.current = next;
    if (prev === "speaking" && next === "listening") turnCountRef.current += 1;
    const message = voiceAnnouncement(prev, next, { turnCount: turnCountRef.current });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- announcing a transition is inherently an effect of it
    if (message) setAnnouncement(message);
  }, [session.state]);

  const action = focusAction(session.focusMode, session.profileState);
  const { canFinish, canInterrupt } = voiceControlAvailability(session.state);

  return (
    <div
      style={{
        flex: "none",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        paddingTop: "var(--space-2)",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <span
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}
      >
        {announcement}
      </span>

      {session.proposal ? (
        <ProposalCard
          preview={session.proposal.preview}
          status={session.proposal.status}
          result={session.proposal.result}
          onConfirm={session.confirmProposal}
          onCancel={session.cancelProposal}
        />
      ) : null}

      {session.error ? (
        <div style={{ color: "var(--danger)", fontSize: "var(--text-body-sm)", lineHeight: "var(--leading-normal)" }}>
          {session.error}{" "}
          <button
            type="button"
            onClick={close}
            style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", textDecoration: "underline", padding: 0, font: "inherit" }}
          >
            Switch to text
          </button>
        </div>
      ) : null}

      {/* Voiceprint focus feedback. Its ONLY render site — drop this and src/lib/voice/focus.ts
          computes a string nobody ever sees, with its tests still green over a dead feature. */}
      {session.focusNotice ? (
        <div
          style={{
            fontSize: 11.5,
            lineHeight: "var(--leading-normal)",
            color: session.unmatchedBursts >= 2 ? "var(--danger)" : "var(--text-muted)",
          }}
        >
          {session.focusNotice}
        </div>
      ) : null}

      {showFirstRunHint && !session.error ? (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: "var(--leading-normal)" }}>
          Speak naturally — take your time and pause to think, I&rsquo;ll wait for you to finish (or
          tap Done talking). I&rsquo;ll answer out loud, and I can take you to what you ask about.
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {/* Both controls are always rendered and go inert out of state. `aria-disabled`
            rather than `disabled` so they stay focusable and announced; a control that
            vanishes and reappears mid-sentence would reflow the row every single turn. */}
        <Button
          size="sm"
          variant="secondary"
          aria-disabled={!canFinish}
          onClick={canFinish ? session.finishTurn : undefined}
          style={canFinish ? undefined : { opacity: 0.45, cursor: "default" }}
        >
          ✓ Done talking
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-disabled={!canInterrupt}
          onClick={canInterrupt ? session.interrupt : undefined}
          style={canInterrupt ? undefined : { opacity: 0.45, cursor: "default" }}
        >
          ⏸ Interrupt
        </Button>
        {action ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={action.action === "open_to_anyone" ? session.openToAnyone : session.setMyVoice}
          >
            {action.label}
          </Button>
        ) : null}
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
        // maxHeight + internal scroll: a tall preview must not push the composer off a
        // 620px panel (worse with a tablet keyboard open), but the Confirm button must
        // always be reachable — so the CARD scrolls, the buttons stay put below it.
        padding: "var(--space-3)",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface-raised)",
        border: `1px solid ${done ? "var(--positive)" : errored ? "var(--danger)" : "var(--accent)"}`,
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 4 }}>
        Confirm change
      </div>
      <div
        style={{
          fontSize: "var(--text-body-sm)",
          color: "var(--text-primary)",
          marginBottom: 10,
          maxHeight: 140,
          overflowY: "auto",
          lineHeight: "var(--leading-normal)",
        }}
      >
        {preview}
      </div>
      {status === "pending" || status === "applying" ? (
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Button size="sm" onClick={onConfirm} disabled={status === "applying"}>
            {status === "applying" ? "Applying…" : "Confirm"}
          </Button>
          <Button size="sm" variant="secondary" onClick={onCancel} disabled={status === "applying"}>
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
