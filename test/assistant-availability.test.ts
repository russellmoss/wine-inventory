import { describe, expect, it, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assistantAvailability,
  ASSISTANT_UNAVAILABLE_REASON,
  ASSISTANT_AVAILABLE,
} from "@/lib/assistant/availability";

// Plan 105 U5 / DM-58.

const KEY = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = KEY;
});

describe("assistantAvailability — one gate, shared by the dock and the route", () => {
  it("is available when the key is configured", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(assistantAvailability()).toEqual(ASSISTANT_AVAILABLE);
    expect(assistantAvailability().unavailableReason).toBeNull();
  });

  it("is unavailable with a user-facing reason when the key is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    const a = assistantAvailability();
    expect(a.available).toBe(false);
    expect(a.unavailableReason).toBe(ASSISTANT_UNAVAILABLE_REASON);
  });

  it("treats an empty key as missing rather than half-enabling", () => {
    process.env.ANTHROPIC_API_KEY = "";
    expect(assistantAvailability().available).toBe(false);
  });
});

describe("the unavailable copy", () => {
  it("names what still works — the anti-AI-only rule (03-interaction-spec.md:183)", () => {
    // The load-bearing half. A user who needs to record something must be told to go do it, not
    // left assuming the app is down.
    expect(ASSISTANT_UNAVAILABLE_REASON).toContain("Search, records and recording are unaffected");
    expect(ASSISTANT_UNAVAILABLE_REASON).toContain("sidebar");
  });

  it("says Ctrl, never a Mac glyph (test/search-palette.test.ts guards src/ for the same reason)", () => {
    expect(ASSISTANT_UNAVAILABLE_REASON).toContain("Ctrl");
    expect(ASSISTANT_UNAVAILABLE_REASON).not.toMatch(/[⌘⌥⌃⇧]/);
  });

  it("uses none of the prohibited AI vocabulary (09-content-terminology.md:186)", () => {
    for (const banned of ["AI-powered", "smart", "magic", "I think", "as an AI", "✨", "🪄"]) {
      expect(ASSISTANT_UNAVAILABLE_REASON.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
});

describe("the ranked-queue copy is deferred, not silently dropped", () => {
  it("records WHY in the module, so the next reader does not 'finish' it against a missing surface", () => {
    // DM-58's approved string describes the Phase 5+ "Now" ranked queue. There is no /now route, so
    // there is no working state to degrade from. If someone later builds that surface, this comment
    // is the pointer; if someone deletes the comment, this test tells them it was a decision.
    const src = readFileSync(
      fileURLToPath(new URL("../src/lib/assistant/availability.ts", import.meta.url)),
      "utf8",
    );
    expect(src).toContain("Ranking is off right now");
    expect(src).toContain("Deferred");
  });
});
