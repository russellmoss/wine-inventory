export type VoiceFocusMode = "open" | "my_voice" | "team_session";

export type VoiceProfileState = "not_enrolled" | "active" | "disabled" | "needs_reenroll";

export type VoiceFocusSession = {
  mode: VoiceFocusMode;
  profileState: VoiceProfileState;
  unmatchedBursts: number;
  teamSessionExpiresAt: number | null;
};

export const TEAM_SESSION_IDLE_MS = 15 * 60 * 1000;

export function normalizeFocusMode(value: unknown): VoiceFocusMode {
  return value === "my_voice" || value === "team_session" ? value : "open";
}

export function modeRequiresSpeakerMatch(mode: VoiceFocusMode): boolean {
  return mode === "my_voice";
}

export function createVoiceFocusSession(
  mode: VoiceFocusMode,
  profileState: VoiceProfileState,
  nowMs = Date.now(),
): VoiceFocusSession {
  const safeMode = mode === "my_voice" && profileState !== "active" ? "open" : mode;
  return {
    mode: safeMode,
    profileState,
    unmatchedBursts: 0,
    teamSessionExpiresAt: safeMode === "team_session" ? nowMs + TEAM_SESSION_IDLE_MS : null,
  };
}

export function setVoiceFocusMode(
  session: VoiceFocusSession,
  mode: VoiceFocusMode,
  nowMs = Date.now(),
): VoiceFocusSession {
  const nextMode = mode === "my_voice" && session.profileState !== "active" ? "open" : mode;
  return {
    ...session,
    mode: nextMode,
    unmatchedBursts: 0,
    teamSessionExpiresAt: nextMode === "team_session" ? nowMs + TEAM_SESSION_IDLE_MS : null,
  };
}

export function noteSpeakerVerification(
  session: VoiceFocusSession,
  matched: boolean,
): VoiceFocusSession {
  return {
    ...session,
    unmatchedBursts: matched ? 0 : session.unmatchedBursts + 1,
  };
}

export function expireVoiceFocusSession(session: VoiceFocusSession, nowMs = Date.now()): VoiceFocusSession {
  if (session.mode !== "team_session" || session.teamSessionExpiresAt == null) return session;
  if (nowMs < session.teamSessionExpiresAt) return session;
  return { ...session, mode: "open", teamSessionExpiresAt: null, unmatchedBursts: 0 };
}

export function focusModeLabel(mode: VoiceFocusMode, firstName?: string | null): string {
  switch (mode) {
    case "my_voice":
      return firstName ? `Listening only to ${firstName}` : "Listening only to you";
    case "team_session":
      return "Team session";
    default:
      return "Open to anyone";
  }
}

export type VoiceFocusAction = {
  /** Which session method the button calls. */
  action: "open_to_anyone" | "my_voice";
  label: string;
};

/**
 * The ONE focus control the voice UI offers, given the current mode and profile state,
 * or null when there is nothing useful to offer.
 *
 * Lives beside the focus model rather than with the other inline-voice presentation
 * helpers: this is a question about focus state, and splitting one domain across two
 * modules is how the answer drifts. The full-screen overlay rendered this logic twice
 * (once in the header badge row, once in the button row) and could therefore show two
 * "Open to anyone" buttons at once in `my_voice`; there is deliberately one here.
 *
 * Behaviour is otherwise a faithful port of the overlay's conditions, including the
 * quirk that "open" mode still offers "Open to anyone" — that is shipped behaviour, and
 * changing it is a product decision, not a refactor.
 */
export function focusAction(
  mode: VoiceFocusMode,
  profileState: VoiceProfileState,
): VoiceFocusAction | null {
  if (mode !== "team_session") return { action: "open_to_anyone", label: "Open to anyone" };
  if (profileState === "active") return { action: "my_voice", label: "My voice" };
  return null;
}

export function isTurnOffSpeakerRecognitionCommand(text: string): boolean {
  return /\b(turn|switch|shut|take)\s+(off|down|away)\b.*\b(speaker recognition|voice recognition|my voice|voice focus)\b/i.test(
    text,
  ) || /\b(open|let)\b.*\b(anyone|team|everybody|everyone)\b.*\b(talk|speak|use)\b/i.test(text);
}

export function isTurnOnSpeakerRecognitionCommand(text: string): boolean {
  return /\b(turn|switch)\s+on\b.*\b(speaker recognition|voice recognition|my voice|voice focus)\b/i.test(text)
    || /\b(listen only to me|recognize my voice)\b/i.test(text);
}
