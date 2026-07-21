import { describe, expect, it } from "vitest";
import {
  createVoiceFocusSession,
  focusAction,
  focusModeLabel,
  isTurnOffSpeakerRecognitionCommand,
  isTurnOnSpeakerRecognitionCommand,
  noteSpeakerVerification,
  setVoiceFocusMode,
  TEAM_SESSION_IDLE_MS,
  expireVoiceFocusSession,
} from "@/lib/voice/focus";

describe("voice focus session", () => {
  it("falls back to open when my_voice has no active profile", () => {
    expect(createVoiceFocusSession("my_voice", "not_enrolled").mode).toBe("open");
  });

  it("tracks unmatched bursts and resets on match", () => {
    const s = createVoiceFocusSession("my_voice", "active");
    const one = noteSpeakerVerification(s, false);
    expect(one.unmatchedBursts).toBe(1);
    expect(noteSpeakerVerification(one, true).unmatchedBursts).toBe(0);
  });

  it("expires team sessions after the idle window", () => {
    const s = setVoiceFocusMode(createVoiceFocusSession("open", "active", 1000), "team_session", 1000);
    expect(expireVoiceFocusSession(s, 1000 + TEAM_SESSION_IDLE_MS - 1).mode).toBe("team_session");
    expect(expireVoiceFocusSession(s, 1000 + TEAM_SESSION_IDLE_MS + 1).mode).toBe("open");
  });

  it("labels modes for the voice UI", () => {
    expect(focusModeLabel("open")).toBe("Open to anyone");
    expect(focusModeLabel("my_voice", "Russell")).toBe("Listening only to Russell");
    expect(focusModeLabel("team_session")).toBe("Team session");
  });

  it("offers exactly one focus action, or none", () => {
    // Faithful port of the overlay's two nested ternaries. The inline UI renders ONE
    // control; the overlay rendered this logic twice and could show two "Open to
    // anyone" buttons at once in my_voice.
    expect(focusAction("my_voice", "active")).toEqual({ action: "open_to_anyone", label: "Open to anyone" });
    expect(focusAction("open", "not_enrolled")).toEqual({ action: "open_to_anyone", label: "Open to anyone" });
    expect(focusAction("team_session", "active")).toEqual({ action: "my_voice", label: "My voice" });
  });

  it("offers nothing in a team session with no usable profile", () => {
    for (const p of ["not_enrolled", "disabled", "needs_reenroll"] as const) {
      expect(focusAction("team_session", p)).toBeNull();
    }
  });

  it("recognizes local voice setting commands", () => {
    expect(isTurnOffSpeakerRecognitionCommand("can we turn off speaker recognition")).toBe(true);
    expect(isTurnOffSpeakerRecognitionCommand("open this so anyone can talk")).toBe(true);
    expect(isTurnOnSpeakerRecognitionCommand("turn on voice recognition")).toBe(true);
    expect(isTurnOnSpeakerRecognitionCommand("listen only to me")).toBe(true);
  });
});
