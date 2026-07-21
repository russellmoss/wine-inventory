// Presentation decisions for inline voice mode (plan 089).
//
// These live here, not in the components, for one blunt reason: vitest runs with
// `environment: "node"` and this repo has no jsdom or RTL, so NO voice component can
// be unit-tested. Anything that is a real decision — which word to show, whether to
// announce a transition, whether the orb may move — is pulled out to a pure function
// so at least the judgment is covered. What is left in the components is markup.

import type { VoiceState } from "./state-types";

/** The word under/next to the orb. Same vocabulary the full-screen overlay used. */
const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Starting…",
  listening: "Listening…",
  transcribing: "Got it…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Voice unavailable",
};

export function voiceStatusLabel(state: VoiceState): string {
  return STATE_LABEL[state];
}

/**
 * May the orb animate in this state?
 *
 * DESIGN.md ("Motion"): calm, editorial, 120/220/400ms, and explicitly *no decorative
 * animation*. A 60fps audio-reactive orb was defensible as the focal point of a
 * full-screen surface the user deliberately entered. Pinned in a dock title bar that
 * follows them across every route, a permanently moving object is exactly what that
 * rule forbids. Gating motion on "audio is actually flowing" makes the movement mean
 * something — it is state, not decoration — which is what the policy does allow.
 */
export function orbShouldAnimate(state: VoiceState): boolean {
  return state === "listening" || state === "speaking";
}

export type VoiceAnnouncementContext = {
  /** Completed assistant turns so far. Used to announce the first reply only. */
  turnCount: number;
};

/**
 * What (if anything) a screen reader should say about a state change.
 *
 * The overlay put `aria-live="polite"` straight on the raw state label, so a single
 * exchange fired four announcements (listening → transcribing → thinking → speaking).
 * That is unusable. Routine cycling returns null; only edges that carry information a
 * blind user cannot otherwise get are announced.
 *
 * Note the asymmetry with sighted users: they can see the orb, so they need less. A
 * screen-reader user hears the assistant's TTS, so mid-turn narration is redundant —
 * what they actually need is "we started", "something went wrong", and the first
 * confirmation that the loop is working.
 */
export function voiceAnnouncement(
  prev: VoiceState,
  next: VoiceState,
  ctx: VoiceAnnouncementContext,
): string | null {
  if (prev === next) return null;
  if (next === "error") return "Voice unavailable.";
  if (next === "listening") {
    // Session start.
    if (prev === "idle") return "Voice mode on. Listening.";
    // First reply finished: confirm the loop is round-tripping, then stay quiet.
    if (prev === "speaking" && ctx.turnCount <= 1) return "Listening again.";
    return null;
  }
  return null;
}

/** Spoken-page-change notice, so a keyboard/SR user is not silently teleported. */
export function navigationAnnouncement(label: string): string {
  return `Opened ${label}.`;
}

/**
 * Turn a mic-acquisition failure into something a winemaker can act on.
 *
 * `getUserMedia` rejects with a DOMException whose `name` is the only reliable signal
 * (messages are browser-specific prose). "NotReadableError" earns its own case because
 * in a cellar it is genuinely common: something else already holds the mic.
 */
export function micErrorMessage(err: unknown): string {
  const name = typeof err === "object" && err !== null && "name" in err ? String((err as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "I can't hear you — the browser is blocking the mic for this site. Allow it in the address bar, then tap Talk again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "I can't find a microphone on this device.";
    case "NotReadableError":
      return "Something else is using the microphone. Close the other app or tab, then tap Talk again.";
    default:
      return "I couldn't start the microphone. You can keep typing instead.";
  }
}
