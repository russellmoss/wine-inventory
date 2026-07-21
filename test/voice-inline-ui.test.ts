import { describe, expect, it } from "vitest";
import {
  micErrorMessage,
  navigationAnnouncement,
  orbShouldAnimate,
  voiceAnnouncement,
  voiceStatusLabel,
} from "@/lib/voice/inline-ui";
import type { VoiceState } from "@/lib/voice/state-types";

const ALL_STATES: VoiceState[] = ["idle", "listening", "transcribing", "thinking", "speaking", "error"];

describe("voice status label", () => {
  it("has a label for every state", () => {
    for (const s of ALL_STATES) {
      expect(voiceStatusLabel(s)).toBeTruthy();
    }
  });

  it("uses the vocabulary the overlay used", () => {
    expect(voiceStatusLabel("listening")).toBe("Listening…");
    expect(voiceStatusLabel("thinking")).toBe("Thinking…");
    expect(voiceStatusLabel("speaking")).toBe("Speaking…");
    expect(voiceStatusLabel("error")).toBe("Voice unavailable");
  });
});

describe("orb motion gate", () => {
  // DESIGN.md bans decorative animation. Motion is only allowed to mean "audio is
  // flowing right now" — otherwise a permanently pulsing object sits in the dock title
  // bar on every page.
  it("animates only while audio is actually flowing", () => {
    expect(orbShouldAnimate("listening")).toBe(true);
    expect(orbShouldAnimate("speaking")).toBe(true);
  });

  it("holds still while thinking, idle, or errored", () => {
    expect(orbShouldAnimate("thinking")).toBe(false);
    expect(orbShouldAnimate("transcribing")).toBe(false);
    expect(orbShouldAnimate("idle")).toBe(false);
    expect(orbShouldAnimate("error")).toBe(false);
  });
});

describe("screen-reader announcements", () => {
  const ctx = (turnCount: number) => ({ turnCount });

  it("announces the session starting", () => {
    expect(voiceAnnouncement("idle", "listening", ctx(0))).toBe("Voice mode on. Listening.");
  });

  it("announces errors from any state", () => {
    for (const s of ALL_STATES) {
      if (s === "error") continue;
      expect(voiceAnnouncement(s, "error", ctx(3))).toBe("Voice unavailable.");
    }
  });

  it("stays silent through routine cycling", () => {
    // The whole point: one exchange must not fire four announcements.
    expect(voiceAnnouncement("listening", "transcribing", ctx(2))).toBeNull();
    expect(voiceAnnouncement("transcribing", "thinking", ctx(2))).toBeNull();
    expect(voiceAnnouncement("thinking", "speaking", ctx(2))).toBeNull();
    expect(voiceAnnouncement("speaking", "listening", ctx(2))).toBeNull();
  });

  it("confirms the loop once, on the first reply only", () => {
    expect(voiceAnnouncement("speaking", "listening", ctx(1))).toBe("Listening again.");
    expect(voiceAnnouncement("speaking", "listening", ctx(2))).toBeNull();
  });

  it("says nothing when the state has not changed", () => {
    for (const s of ALL_STATES) {
      expect(voiceAnnouncement(s, s, ctx(0))).toBeNull();
    }
  });

  it("counts a full first exchange as exactly one announcement after start", () => {
    const seq: VoiceState[] = ["idle", "listening", "transcribing", "thinking", "speaking", "listening"];
    const spoken = seq
      .slice(1)
      .map((next, i) => voiceAnnouncement(seq[i], next, ctx(i >= 4 ? 1 : 0)))
      .filter(Boolean);
    expect(spoken).toEqual(["Voice mode on. Listening.", "Listening again."]);
  });
});

describe("navigation announcement", () => {
  it("names where the user was taken", () => {
    expect(navigationAnnouncement("Tank T5")).toBe("Opened Tank T5.");
  });
});

describe("mic error messages", () => {
  const err = (name: string) => Object.assign(new Error("browser prose"), { name });

  it("tells a blocked user where to unblock", () => {
    expect(micErrorMessage(err("NotAllowedError"))).toContain("blocking the mic");
    expect(micErrorMessage(err("SecurityError"))).toContain("blocking the mic");
  });

  it("distinguishes no-microphone from blocked", () => {
    expect(micErrorMessage(err("NotFoundError"))).toContain("can't find a microphone");
  });

  it("calls out another app holding the mic", () => {
    // Common in a cellar: a phone already running something else.
    expect(micErrorMessage(err("NotReadableError"))).toContain("Something else is using the microphone");
  });

  it("falls back without throwing on junk", () => {
    expect(micErrorMessage(undefined)).toBeTruthy();
    expect(micErrorMessage(null)).toBeTruthy();
    expect(micErrorMessage("a string")).toBeTruthy();
    expect(micErrorMessage(err("WeirdUnknownError"))).toContain("keep typing");
  });

  it("never leaks raw browser prose or API names to the user", () => {
    for (const name of ["NotAllowedError", "NotFoundError", "NotReadableError", "Whatever"]) {
      const msg = micErrorMessage(err(name));
      expect(msg).not.toContain("getUserMedia");
      expect(msg).not.toContain("Error");
      expect(msg).not.toContain("browser prose");
    }
  });
});
