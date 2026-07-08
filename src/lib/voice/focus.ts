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

export function isTurnOffSpeakerRecognitionCommand(text: string): boolean {
  return /\b(turn|switch|shut|take)\s+(off|down|away)\b.*\b(speaker recognition|voice recognition|my voice|voice focus)\b/i.test(
    text,
  ) || /\b(open|let)\b.*\b(anyone|team|everybody|everyone)\b.*\b(talk|speak|use)\b/i.test(text);
}

export function isTurnOnSpeakerRecognitionCommand(text: string): boolean {
  return /\b(turn|switch)\s+on\b.*\b(speaker recognition|voice recognition|my voice|voice focus)\b/i.test(text)
    || /\b(listen only to me|recognize my voice)\b/i.test(text);
}
